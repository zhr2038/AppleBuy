// Local task executor (C-003). Exactly one process owns a task directory (OS-level lock); inside it, exactly one
// engine loop runs at a time. The browser UI and the CLI only send requests here; the decision core is the same
// Engine + runEngine used by every C-002 scenario, test and benchmark — there is no second demo algorithm.
import { realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { Command, ControlAction, Phase, Snapshot } from "../engine.ts";
import { Engine, TERMINAL_PHASES, createMockFormalCapability } from "../engine.ts";
import type { JournalRecord } from "../journal.ts";
import { FileJournal, MemoryJournal, errorCode, readJournal } from "../journal.ts";
import type { Plan } from "../plan.ts";
import { planHash, validatePlan } from "../plan.ts";
import { formatRecord } from "../messages.ts";
import { runEngine } from "../runner.ts";
import type { RunClock } from "../runner.ts";
import type { SiteMethod, SiteScenario } from "../mock/live-site.ts";
import { LiveMockSite, SITE_SCENARIOS } from "../mock/live-site.ts";
import type { OwnerLock, PreviousOwner, StatusRead } from "./owner-lock.ts";
import { acquireOwnership } from "./owner-lock.ts";
import type { Evidence, RunRecord, TaskDoc } from "./task-store.ts";
import { FORMAL_PHRASE, FORMAL_TTL_MS, TaskStore, currentPlan, describeEvidence, latestRun, ledgerFileDamaged, letterId } from "./task-store.ts";
import { businessHistory, engineView } from "./view.ts";
import { PRESETS, presetById, requiredPresetFor } from "./presets.ts";

export const TEST_RUNS_ROOT = resolve(import.meta.dirname, "..", "..", ".local", "test-runs");
/** Physical location: the nearest existing ancestor is resolved through junctions/symlinks; the missing tail is kept. */
export function physicalPath(path: string, realpath: (p: string) => string = realpathSync.native): string {
  const tail: string[] = [];
  let cur = resolve(path);
  for (;;) {
    try {
      return join(realpath(cur), ...tail);
    } catch {
      const parent = dirname(cur);
      if (parent === cur) return resolve(path);
      tail.unshift(basename(cur));
      cur = parent;
    }
  }
}
/** Test fixtures follow the physical task location, so a lexical alias under .local/test-runs cannot enable them. */
export function isInsideTestRuns(dir: string, realpath?: (p: string) => string): boolean {
  const rel = relative(physicalPath(TEST_RUNS_ROOT, realpath), physicalPath(dir, realpath));
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/** Wall clock: real time passes on its own, so the runner's virtual-clock advances are no-ops. */
const WALL: RunClock = { now: () => Date.now(), advance: () => {}, advanceTo: () => {} };

// Bounded diagnostics: never raw exception text or private paths. The unreadable file is kept as evidence, never rewritten.
const TASK_FILE_STOPPED_ZH = "已停止发送（本操作未发出）：任务文件 task.json 无法读取或解析；原文件已保留、不会覆盖，请人工检查";
const TASK_FILE_FINALIZE_ZH = "运行结束后无法读取任务文件 task.json：显示的状态可能不是最新；原文件已保留、不会覆盖，请人工检查";
function loopFailureZh(e: unknown): string {
  const message = e instanceof Error ? e.message : "";
  // Our own send-time stops are already bounded Chinese diagnostics.
  if (message.startsWith("已停止发送")) return message;
  if (message.startsWith("TaskStateUnavailable")) return TASK_FILE_STOPPED_ZH;
  return `执行器异常停止（${errorCode(e)}）：未自动重发，请人工检查`;
}

export type CrashPoint = { type: string; kind?: string };
export type AppOptions = {
  taskDir: string;
  initialPlan: Plan | null;
  latencyMs?: number;
  hold?: string[];
  /** Test fixtures; honoured only for task directories strictly inside .local/test-runs. */
  statusDelayMs?: number;
  crashAfter?: CrashPoint | null;
  beforeSend?: (cmd: Command) => void;
};
export type OpenResult = { ok: true; app: TaskApp } | { ok: false; reason: string; detail: string; status?: StatusRead };
export type Result = { ok: true; message: string } | { ok: false; code: string; message: string };

type Deferred = { promise: Promise<void>; resolve: () => void };
function deferred(): Deferred {
  let resolve = () => {};
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Durable journal that, in test fixtures only, exits the process right after a chosen record is fsynced (a crash). */
class CrashableJournal extends FileJournal {
  #at: CrashPoint | null;
  constructor(path: string, existing: JournalRecord[], at: CrashPoint | null) {
    super(path, existing);
    this.#at = at;
  }
  append(type: string, fields: Record<string, string | number | undefined>): JournalRecord {
    const rec = super.append(type, fields);
    if (this.#at && type === this.#at.type && (!this.#at.kind || rec.kind === this.#at.kind)) process.exit(86);
    return rec;
  }
}

export type RunInfo = { runId: string; rev: number; planHash: string; phase: Phase | "UNREADABLE" | "NOT_STARTED"; reason: string; journalOk: boolean; journalError: string | null };

export class TaskApp {
  readonly store: TaskStore;
  readonly site: LiveMockSite;
  readonly lock: OwnerLock;
  readonly previousOwner: PreviousOwner;
  #o: AppOptions;
  #engine: Engine | null = null;
  #engineRun: RunRecord | null = null;
  #journal: FileJournal | null = null;
  #loop: Promise<void> | null = null;
  #loopError: string | null = null;
  #controls: ControlAction[] = [];
  #sig = deferred();
  #listeners = new Set<() => void>();
  #lastRunInfo: RunInfo | null = null;
  #lastRunRecords: JournalRecord[] = [];
  #historicalSnapshot: Snapshot | null = null;
  #closing = false;
  #closePromise: Promise<void> | null = null;
  #sleeps = new Map<ReturnType<typeof setTimeout>, () => void>();

  /** Use TaskApp.open(): it acquires task ownership before any state is read or written. */
  constructor(o: AppOptions, store: TaskStore, site: LiveMockSite, lock: OwnerLock, previous: PreviousOwner) {
    this.#o = o;
    this.store = store;
    this.site = site;
    this.lock = lock;
    this.previousOwner = previous;
  }

  static async open(o: AppOptions): Promise<OpenResult> {
    const store = new TaskStore(o.taskDir);
    const fixtures = isInsideTestRuns(store.dir);
    let app: TaskApp | null = null;
    const acq = await acquireOwnership(store.dir, letterId("owner"), () => app?.ownerStatus() ?? { state: "starting" }, { statusDelayMs: fixtures ? o.statusDelayMs : undefined });
    if (!acq.ok) return acq.reason === "held" ? { ok: false, reason: "held", detail: "该任务已由另一个仍在运行的进程占用；不会抢占", status: acq.status } : { ok: false, reason: acq.reason, detail: acq.detail };
    let site: LiveMockSite | null = null;
    let stage = "task-load";
    const releaseFailedOpen = async (): Promise<boolean> => {
      let clean = true;
      try { site?.close(); } catch { clean = false; }
      try { await acq.lock.release(); } catch { clean = false; }
      return clean;
    };
    try {
      const loaded = store.load(o.initialPlan, Date.now(), acq.previous.kind !== "none");
      if (!loaded.ok) {
        const clean = await releaseFailedOpen();
        return { ok: false, reason: loaded.error, detail: loaded.detail + (clean ? "" : "；所有权状态未能完整保存，目录锁已释放，请人工检查") };
      }
      stage = "mock-site";
      site = new LiveMockSite(store.dir, { latencyMs: o.latencyMs, hold: o.hold });
      app = new TaskApp({ ...o, crashAfter: fixtures ? o.crashAfter : null, statusDelayMs: fixtures ? o.statusDelayMs : undefined }, store, site, acq.lock, acq.previous);
      stage = "run-load";
      app.#refreshLastRun();
      return { ok: true, app };
    } catch (e) {
      const clean = await releaseFailedOpen();
      return { ok: false, reason: stage === "mock-site" ? "mock-site-corrupt" : "initialization-error", detail: `任务初始化无法完成（${stage}，${errorCode(e)}）；已保留原始证据并释放目录锁，请人工检查${clean ? "" : "；所有权状态未能完整保存"}` };
    }
  }

  // ---------- events ----------
  subscribe(f: () => void): () => void {
    this.#listeners.add(f);
    return () => this.#listeners.delete(f);
  }
  #changed(): void {
    for (const f of this.#listeners) f();
  }
  #signal(): void {
    const d = this.#sig;
    this.#sig = deferred();
    d.resolve();
  }
  get running(): boolean {
    return this.#loop !== null;
  }
  /** Resolves when the current engine loop ends (tests). */
  async idle(): Promise<void> {
    while (this.#loop) await this.#loop;
  }

  // ---------- task facts ----------
  doc(): TaskDoc {
    const l = this.store.load(null, Date.now());
    if (!l.ok) throw new Error(`TaskStateUnavailable: ${l.detail}`);
    return l.doc;
  }
  #runInfo(run: RunRecord): { info: RunInfo; records: JournalRecord[] } {
    const read = readJournal(this.store.journalPath(run.runId), run.planHash);
    if (!read.ok) {
      // A run is persisted before its first journal record. Missing history cannot distinguish that crash
      // boundary from deleted evidence after a mutation, so it must never permit a fresh run.
      return { info: { runId: run.runId, rev: run.rev, planHash: run.planHash, phase: "UNREADABLE", reason: read.error, journalOk: false, journalError: read.error }, records: [] };
    }
    const phases = read.records.filter((r) => r.type === "phase");
    const last = phases.at(-1);
    return { info: { runId: run.runId, rev: run.rev, planHash: run.planHash, phase: (last?.phase as Phase) ?? "INIT", reason: String(last?.reason ?? ""), journalOk: true, journalError: null }, records: read.records };
  }
  #refreshLastRun(): void {
    const run = latestRun(this.doc());
    if (!run) {
      this.#lastRunInfo = null;
      this.#lastRunRecords = [];
      this.#historicalSnapshot = null;
      return;
    }
    const r = this.#runInfo(run);
    this.#lastRunInfo = r.info;
    this.#lastRunRecords = r.records;
    this.#historicalSnapshot = null;
    if (r.info.journalOk) {
      // Reuse the engine's primary-fact replay, without start(), a port call or a durable journal writer. This
      // snapshot is only for display; candidates/references remain invalid until recovery obtains new evidence.
      const plan = this.doc().planRevs[run.rev - 1].plan;
      const snapshot = new Engine({ plan, planHash: run.planHash, runId: run.runId, journal: new MemoryJournal(), ledger: this.store.ledger, now: WALL.now, portKind: "mock", restoreFrom: r.records }).snapshot();
      const observations = r.records.filter((x) => x.type === "list" || x.type === "observation");
      const lastValid = observations.filter((x) => ["SLOTS_AVAILABLE", "CONFIRMED_NONE", "CHECKOUT_REVIEW", "PRE_PAYMENT", "ORDER_PAGE_CONFIRMED"].includes(String(x.state))).at(-1);
      const lastChoice = r.records.filter((x) => x.type === "intent" && x.kind === "chooseSlot").at(-1);
      let queryFailures = 0;
      for (const observation of observations) {
        if (observation.type === "list") queryFailures = 0;
        else if (observation.state === "QUERY_FAILED") queryFailures++;
      }
      this.#historicalSnapshot = {
        ...snapshot, phase: r.info.phase as Phase, reason: r.info.reason,
        paused: r.info.phase === "PAUSED" || r.info.phase === "TAKEOVER",
        lastChosen: typeof lastChoice?.slotKey === "string" ? lastChoice.slotKey : null,
        lastValidObservationAt: lastValid ? Number(lastValid.t) : null,
        lastObservationState: String(observations.at(-1)?.state ?? ""), queryFailures,
        epoch: Math.max(0, ...r.records.map((x) => Number(x.epoch ?? 0))),
      };
    }
  }
  /** Why a new run may not start; null when it may. Every reason is a fail-closed condition. */
  startBlocker(ev: Evidence = this.store.ledger.evidence()): string | null {
    if (this.#closing) return "执行器已关闭，不能再发起操作";
    if (this.#loop) return "本进程已有运行中的任务（同一任务只允许一个执行器）";
    if (!ev.ok) return describeEvidence(ev.problem);
    if (ev.entries.length) return "该任务已有最终提交记录（含结果不明）：禁止新的运行或再次提交；只能“恢复运行”做只读核实";
    const info = this.#lastRunInfo;
    if (info && !info.journalOk) return `上次运行的日志无法验证（${info.journalError}）：拒绝继续（失败即关闭），请人工检查`;
    if (info && info.phase !== "NOT_STARTED" && !TERMINAL_PHASES.has(info.phase as Phase)) return "上次运行尚未结束（可能因进程中断）：请先“恢复运行”，由日志只读核实后继续或停止";
    return null;
  }
  /** `ev` lets one synchronous state() read share a single fresh evidence check; it is never kept between calls. */
  recoverBlocker(ev: Evidence = this.store.ledger.evidence()): string | null {
    if (this.#closing) return "执行器已关闭，不能恢复操作";
    if (this.#loop) return "本进程已有运行中的任务";
    if (!ev.ok) return `拒绝恢复：${describeEvidence(ev.problem)}`;
    const info = this.#lastRunInfo;
    if (!info) return "没有可恢复的运行";
    if (!info.journalOk) return `日志无法验证（${info.journalError}）：拒绝恢复（失败即关闭）`;
    if (info.phase === "NOT_STARTED") return "该运行尚未写入日志，没有可恢复的内容";
    if (TERMINAL_PHASES.has(info.phase as Phase) && info.phase !== "MANUAL_VERIFICATION") return "上次运行已结束，无需恢复";
    return null;
  }

  // ---------- user actions ----------
  editPlan(raw: unknown): Result {
    if (this.#closing) return { ok: false, code: "closed", message: "执行器已关闭，不能修改计划" };
    const { plan, problems } = validatePlan(raw);
    if (!plan) return { ok: false, code: "plan-invalid", message: problems.join("；") };
    const doc = this.doc();
    const h = planHash(plan);
    if (h === currentPlan(doc).planHash) return { ok: true, message: "计划未变化" };
    doc.planRevs.push({ rev: doc.planRevs.length + 1, planHash: h, plan, savedAt: Date.now() });
    doc.currentRev = doc.planRevs.length;
    this.store.save(doc);
    this.#changed();
    const ev = this.store.ledger.evidence();
    const warning = !ev.ok ? `；${describeEvidence(ev.problem)}` : ev.entries.length ? "；该任务已有最终提交记录，修改计划不会解除限制" : "";
    return { ok: true, message: `已保存为计划版本 v${doc.currentRev}（哈希 ${h}）。正在运行的任务仍绑定原计划版本${warning}` };
  }

  /**
   * Explicitly loads a built-in FAKE example as a new plan revision (earlier revisions and any running binding are kept).
   * A non-FAKE current plan is never displaced by a preset: that may be a saved customer plan.
   */
  loadPreset(id: unknown): Result {
    if (this.#closing) return { ok: false, code: "closed", message: "执行器已关闭，不能修改计划" };
    const preset = presetById(id);
    if (!preset) return { ok: false, code: "preset", message: "未知的示例" };
    if (currentPlan(this.doc()).plan.fake !== true) return { ok: false, code: "plan-not-fake", message: "当前计划不是 FAKE 演练计划：为避免替换你保存的计划，示例不会载入。请在“高级”中人工处理" };
    const r = this.editPlan(structuredClone(preset.plan));
    return r.ok ? { ok: true, message: `已载入示例“${preset.title}”。${r.message}` } : r;
  }

  armFormal(reviewedPlanHash: string, phrase: string): Result {
    if (this.#closing) return { ok: false, code: "closed", message: "执行器已关闭，不能启用授权" };
    const ev = this.store.ledger.evidence();
    if (!ev.ok) return { ok: false, code: "evidence", message: describeEvidence(ev.problem) };
    const doc = this.doc();
    const cur = currentPlan(doc);
    if (phrase !== FORMAL_PHRASE) return { ok: false, code: "phrase", message: `确认语不正确，需完整输入：${FORMAL_PHRASE}` };
    if (reviewedPlanHash !== cur.planHash) return { ok: false, code: "plan-changed", message: "你核对的计划不是当前计划版本，请重新核对" };
    if (doc.formalArm) return { ok: false, code: "already-armed", message: "每个任务只能启用一次模拟正式授权（已启用或已使用），不能重复启用" };
    if (this.store.ledger.entries().length) return { ok: false, code: "ledger", message: "该任务已有最终提交记录，不能再启用" };
    const now = Date.now();
    doc.formalArm = { armId: letterId("arm"), taskId: doc.taskId, planHash: cur.planHash, rev: cur.rev, armedAt: now, expiresAt: now + FORMAL_TTL_MS, usedByRunId: null };
    this.store.save(doc);
    this.#changed();
    return { ok: true, message: `已为计划 v${cur.rev} 启用一次模拟正式授权（仅对本机模拟官网有效，30 分钟内由下一次运行使用；真实正式模式不可用）` };
  }

  start(scenario: SiteScenario = "refuse-then-accept"): Result {
    if (!(scenario in SITE_SCENARIOS)) return { ok: false, code: "scenario", message: "未知的模拟官网场景" };
    this.#refreshLastRun();
    const blocker = this.startBlocker();
    if (blocker) return { ok: false, code: "start-blocked", message: blocker };
    const doc = this.doc();
    const cur = currentPlan(doc);
    // A fixture written for one example plan would demonstrate nothing meaningful under another plan.
    const required = requiredPresetFor(scenario);
    if (required && planHash(required.plan) !== cur.planHash) return { ok: false, code: "preset-required", message: `请先载入示例计划“${required.title}”，核对后再开始` };
    const runId = letterId("run");
    let capability: RunRecord["capability"] = null;
    if (doc.formalArm && doc.formalArm.usedByRunId === null) {
      // Bound to this task/run; the plan hash is the one the user reviewed. A later plan edit makes it mismatch,
      // and the engine then blocks the submit (formal-capability-plan-mismatch). Expiry is checked at send time.
      capability = { armId: doc.formalArm.armId, planHash: doc.formalArm.planHash, runId, expiresAt: doc.formalArm.expiresAt };
      doc.formalArm.usedByRunId = runId;
    }
    const run: RunRecord = { runId, rev: cur.rev, planHash: cur.planHash, startedAt: Date.now(), siteScenario: scenario, capability };
    doc.runs.push(run);
    this.store.save(doc); // durable before the first journal record: refresh/restart sees this run, not a fresh identity
    this.site.reset(scenario);
    const journal = new CrashableJournal(this.store.journalPath(runId), [], this.#o.crashAfter ?? null);
    const engine = new Engine({
      plan: cur.plan, planHash: cur.planHash, runId, journal, ledger: this.store.ledger, now: WALL.now, portKind: "mock",
      capability: capability ? createMockFormalCapability(capability.planHash, runId, capability.expiresAt) : null,
    });
    this.#launch(engine, run, journal);
    return { ok: true, message: `已开始自动演练 ${runId}（计划 v${cur.rev}${capability ? "，附带一次模拟正式授权" : "，默认演练：不会提交"}）` };
  }

  /** Supported recovery entry: replays the latest run's verified journal with its originally bound plan revision. */
  recover(): Result {
    this.#refreshLastRun();
    const blocker = this.recoverBlocker();
    if (blocker) return { ok: false, code: "recover-blocked", message: blocker };
    const doc = this.doc();
    const run = latestRun(doc) as RunRecord;
    const read = readJournal(this.store.journalPath(run.runId), run.planHash);
    if (!read.ok) return { ok: false, code: "journal", message: `日志无法验证（${read.error}）` };
    const plan = doc.planRevs[run.rev - 1].plan;
    const journal = new CrashableJournal(this.store.journalPath(run.runId), read.records, this.#o.crashAfter ?? null);
    const cap = run.capability ? createMockFormalCapability(run.capability.planHash, run.runId, run.capability.expiresAt) : null;
    const engine = new Engine({ plan, planHash: run.planHash, runId: run.runId, journal, ledger: this.store.ledger, now: WALL.now, portKind: "mock", capability: cap, restoreFrom: read.records });
    this.#launch(engine, run, journal);
    return { ok: true, message: `已从日志恢复运行 ${run.runId}（绑定计划 v${run.rev}）：先只读核实，不重发已发送的操作` };
  }

  control(action: ControlAction): Result {
    if (this.#closing) return { ok: false, code: "closed", message: "执行器已关闭，不能控制运行" };
    if (!this.#loop || !this.#engine) return { ok: false, code: "not-running", message: "当前没有运行中的任务" };
    this.#controls.push(action);
    this.#signal();
    // Pause/takeover/stop never recall an operation that already reached the site; its result is still verified.
    const sent = "；已发出的操作不会被撤回，其结果仍会被核实";
    return { ok: true, message: { pause: `已请求暂停：不再发起新动作${sent}`, resume: "已请求恢复（将先重新观察）", takeover: `已请求人工接管：不再发起新动作${sent}`, stop: `已请求停止：不再发起新动作${sent}` }[action] };
  }

  #launch(engine: Engine, run: RunRecord, journal: FileJournal): void {
    this.#engine = engine;
    this.#engineRun = run;
    this.#journal = journal;
    this.#loopError = null;
    this.#controls = [];
    const sleepUntil = (t: number) => new Promise<void>((r) => {
      const timer = setTimeout(() => {
        this.#sleeps.delete(timer);
        r();
      }, Math.max(0, t - Date.now()));
      this.#sleeps.set(timer, r);
    });
    const beforeSend = (cmd: Command) => {
      this.#o.beforeSend?.(cmd);
      // Validate every mutation after preparation, not just final submit. Abort before appending "sent" or
      // reaching the port if critical durable evidence became unreadable. Do not rewrite corrupt evidence.
      try {
        this.doc();
      } catch {
        throw new Error(TASK_FILE_STOPPED_ZH);
      }
      const ev = this.store.ledger.evidence();
      if (!ev.ok) throw new Error(`已停止发送（本操作未发出）：${describeEvidence(ev.problem)}`);
    };
    this.#loop = runEngine(engine, this.site, WALL, {
      maxSteps: 5000,
      hooks: { takeControls: () => this.#controls.splice(0), controlSignal: () => this.#sig.promise, sleepUntil, beforeSend, onChange: () => this.#changed(), closing: () => this.#closing },
    })
      .then((r) => {
        if (r.aborted && r.aborted !== "runner-shutdown") this.#loopError = r.aborted;
      })
      .catch((e: unknown) => {
        this.#loopError = loopFailureZh(e);
      })
      .finally(() => {
        this.#loop = null;
        // The finalizer must settle: an unreadable task file cannot reject idle()/close() or strand the OS lock.
        try {
          this.#refreshLastRun();
        } catch {
          this.#loopError ??= TASK_FILE_FINALIZE_ZH;
        }
        try {
          this.#changed();
        } catch (e) {
          this.#loopError ??= loopFailureZh(e);
        }
      });
    this.#changed();
  }

  async close(): Promise<void> {
    if (this.#closePromise) return this.#closePromise;
    this.#closing = true;
    if (this.#loop && this.#engine && !this.#engine.isTerminal()) {
      // Pause is durable before the runner quiesces. Outstanding replies are detached, never converted to failure
      // and never delivered to this engine after the OS lock passes to another owner.
      this.#controls.push("pause");
    }
    this.#signal();
    this.#closePromise = (async () => {
      try {
        await this.idle();
      } finally {
        // Shutdown always detaches the site and releases this owner's OS lock, even if the loop failed.
        this.site.close();
        for (const [timer, settle] of this.#sleeps) {
          clearTimeout(timer);
          settle();
        }
        this.#sleeps.clear();
        await this.lock.release();
      }
    })();
    return this.#closePromise;
  }

  ownerStatus() {
    const s = this.#engine?.snapshot();
    return { ownerId: this.lock.ownerId, pid: process.pid, runId: this.#engineRun?.runId ?? null, phase: s?.phase ?? null, pendingOp: s?.pendingOp ?? null };
  }

  // ---------- view model (Chinese) ----------
  state() {
    const doc = this.doc();
    const cur = currentPlan(doc);
    const s = this.#engine?.snapshot() ?? null;
    const records = this.#journal?.records() ?? this.#lastRunRecords;
    const t0 = Number(records[0]?.t ?? 0);
    const trace = records
      .map((r) => formatRecord(r)?.replace(/^\[模拟\s+-?\d+ms\]/, `[+${((Number(r.t) - t0) / 1000).toFixed(1)}s]`) ?? null)
      .filter((x): x is string => x !== null)
      .slice(-60);
    const ev = this.store.ledger.evidence();
    const run = this.#engineRun ?? latestRun(doc);
    const arm = doc.formalArm;
    const display = engineView(s ?? this.#historicalSnapshot, this.#lastRunInfo, s === null && this.#historicalSnapshot !== null);
    if (this.#loopError) {
      display.needsHuman = true;
      display.phaseZh = "执行已中断（需要人工检查）";
      display.reasonZh = this.#loopError;
    }
    return {
      fake: true,
      banner: "【演练模式｜FAKE 虚构数据｜本机模拟官网，不访问苹果官网，不产生真实订单/付款/时段占用】",
      task: { taskId: doc.taskId, createdAt: doc.createdAt, dir: this.store.dir },
      owner: { ownerId: this.lock.ownerId, pid: process.pid, previous: this.previousOwner.kind },
      plan: { rev: cur.rev, planHash: cur.planHash, plan: cur.plan, revisions: doc.planRevs.length },
      run: run ? { runId: run.runId, rev: run.rev, planHash: run.planHash, boundToCurrentPlan: run.planHash === cur.planHash, plan: doc.planRevs[run.rev - 1].plan, capability: run.capability !== null, siteScenario: run.siteScenario } : null,
      running: this.#loop !== null,
      loopError: this.#loopError,
      engine: display,
      // Unsafe evidence counts as one "unknown" entry (consumed); `corrupt` only when the ledger file itself is damaged.
      ledger: ev.ok
        ? { entries: ev.entries.length, status: ev.entries.at(-1)?.status ?? null, corrupt: false, problem: null }
        : { entries: 1, status: "unknown", corrupt: ledgerFileDamaged(ev.problem), problem: { ...ev.problem, summaryZh: describeEvidence(ev.problem) } },
      formal: { phrase: FORMAL_PHRASE, armed: arm !== null, used: arm?.usedByRunId ?? null, expiresAt: arm?.expiresAt ?? null, armedPlanHash: arm?.planHash ?? null, liveMode: "不可用（未实现真实适配器，也没有真实授权）" },
      site: this.site.view(),
      scenarios: SITE_SCENARIOS,
      examples: PRESETS.map((p) => ({
        id: p.id, title: p.title, summary: p.summary, scenario: p.scenario,
        ready: p.requiresPlan ? planHash(p.plan) === cur.planHash : cur.plan.slotSelection === undefined,
        canLoad: cur.plan.fake === true,
      })),
      startBlocker: this.startBlocker(ev),
      recoverBlocker: this.recoverBlocker(ev),
      history: businessHistory(records),
      trace,
    };
  }
}
