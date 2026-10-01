// Task-wide durable state (C-003): one purchase identity per task directory, shared by every start, resume,
// browser client and process. Unknown, missing or corrupt state fails closed: it is never re-created or overwritten.
import { randomBytes } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { LedgerEntry, LedgerLike } from "../journal.ts";
import { FileLedger, readJournal } from "../journal.ts";
import type { Plan } from "../plan.ts";
import { planHash, validatePlan } from "../plan.ts";

export const TASK_SCHEMA = "applebuy-task/v1";
/** Exact phrase the user types to enable the single FAKE formal capability (mock site only). */
export const FORMAL_PHRASE = "我已核对计划，仅对模拟官网启用一次";
export const FORMAL_TTL_MS = 30 * 60 * 1000;

export type PlanRev = { rev: number; planHash: string; plan: Plan; savedAt: number };
export type CapabilityBinding = { armId: string; planHash: string; runId: string; expiresAt: number };
export type RunRecord = { runId: string; rev: number; planHash: string; startedAt: number; siteScenario: string; capability: CapabilityBinding | null };
export type FormalArm = { armId: string; taskId: string; planHash: string; rev: number; armedAt: number; expiresAt: number; usedByRunId: string | null };
export type TaskDoc = { schema: typeof TASK_SCHEMA; taskId: string; createdAt: number; planRevs: PlanRev[]; currentRev: number; runs: RunRecord[]; formalArm: FormalArm | null };

export type LoadResult = { ok: true; doc: TaskDoc; created: boolean } | { ok: false; error: string; detail: string };

const ID_RE = /^[a-z]{3,12}-[a-z]{6,16}$/;

export function letterId(prefix: string, n = 10): string {
  // Letters only, so ids never look like long digit sequences in sanitized logs.
  return `${prefix}-${[...randomBytes(n)].map((b) => "abcdefghijklmnopqrstuvwxyz"[b % 26]).join("")}`;
}

export function atomicWriteJson(path: string, value: unknown): void {
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  const fd = openSync(tmp, "r+");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, path);
}

function validDoc(v: unknown): string | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return "not-object";
  const d = v as Record<string, any>;
  if (d.schema !== TASK_SCHEMA) return "schema";
  if (typeof d.taskId !== "string" || !ID_RE.test(d.taskId)) return "task-id";
  if (!Number.isInteger(d.createdAt)) return "created-at";
  if (!Array.isArray(d.planRevs) || d.planRevs.length === 0) return "plan-revs";
  for (const [i, r] of d.planRevs.entries()) {
    if (!r || r.rev !== i + 1 || !Number.isInteger(r.savedAt)) return "plan-rev-shape";
    const checked = validatePlan(r.plan);
    if (!checked.plan) return "plan-rev-invalid";
    if (planHash(checked.plan) !== r.planHash) return "plan-rev-hash";
  }
  if (!Number.isInteger(d.currentRev) || d.currentRev < 1 || d.currentRev > d.planRevs.length) return "current-rev";
  if (!Array.isArray(d.runs)) return "runs";
  for (const r of d.runs) {
    if (!r || typeof r.runId !== "string" || !ID_RE.test(r.runId) || !Number.isInteger(r.rev) || r.rev < 1 || r.rev > d.planRevs.length) return "run-shape";
    if (d.planRevs[r.rev - 1].planHash !== r.planHash || typeof r.siteScenario !== "string") return "run-plan-binding";
    if (r.capability !== null && (typeof r.capability !== "object" || r.capability.runId !== r.runId || typeof r.capability.planHash !== "string" || !Number.isFinite(r.capability.expiresAt))) return "run-capability";
  }
  if (new Set(d.runs.map((r: RunRecord) => r.runId)).size !== d.runs.length) return "run-duplicate";
  const a = d.formalArm;
  if (a !== null && (typeof a !== "object" || a.taskId !== d.taskId || typeof a.armId !== "string" || typeof a.planHash !== "string" || !Number.isFinite(a.expiresAt) || (a.usedByRunId !== null && typeof a.usedByRunId !== "string"))) return "formal-arm";
  return null;
}

/** Task-scoped ledger: any final-submit record of this task blocks it, whatever plan revision or label it used. */
export class TaskLedger implements LedgerLike {
  readonly file: FileLedger;
  readonly #path: string;
  constructor(taskDir: string) {
    this.file = new FileLedger(taskDir);
    this.#path = join(taskDir, "purchase-ledger.json");
  }
  /** The plan hash argument is deliberately ignored: label or condition edits cannot evade a prior final submit. */
  find(_planHash: string): LedgerEntry | null {
    return this.entries().at(-1) ?? null;
  }
  entries(): LedgerEntry[] {
    const unsafe = (): LedgerEntry[] => [{ planHash: "0000000000000000", runId: "ledger-unreadable", opId: "op-0-0", status: "unknown" }];
    if (!existsSync(this.#path)) return unsafe();
    // FileLedger validates every entry; corruption reports "unknown" for any key and is never read as empty.
    const probe = this.file.find("0000000000000000");
    if (probe && probe.runId === "ledger-unreadable") return [probe];
    try {
      const entries = JSON.parse(readFileSync(this.#path, "utf8")) as LedgerEntry[];
      const taskDir = dirname(this.#path);
      const task = JSON.parse(readFileSync(join(taskDir, "task.json"), "utf8")) as TaskDoc;
      if (validDoc(task)) return unsafe();
      // An empty, syntactically valid ledger must not erase durable final-submit evidence. Conversely, foreign
      // entries are untrusted. Inspect every recorded run, not just the newest label/plan revision.
      for (const entry of entries) {
        if (!task.runs.some((r) => r.runId === entry.runId && r.planHash === entry.planHash)) return unsafe();
      }
      for (const run of task.runs) {
        const log = readJournal(join(taskDir, "runs", run.runId, "journal.jsonl"), run.planHash);
        if (!log.ok) return unsafe();
        for (const sent of log.records.filter((r) => r.type === "sent" && r.kind === "submitOrder")) {
          if (!entries.some((e) => e.runId === run.runId && e.planHash === run.planHash && e.opId === sent.opId)) return unsafe();
        }
      }
      return entries;
    } catch {
      return unsafe();
    }
  }
  record(entry: LedgerEntry): void {
    if (this.entries().some((e) => e.runId === "ledger-unreadable")) throw new Error("LedgerCorrupt: 购买台账或运行证据缺失/不一致，拒绝覆盖");
    this.file.record(entry);
  }
}

export class TaskStore {
  readonly dir: string;
  readonly ledger: TaskLedger;
  constructor(dir: string) {
    mkdirSync(resolve(dir), { recursive: true });
    // Windows junctions/symlinks are another spelling of the same task, never another purchase identity.
    this.dir = realpathSync.native(resolve(dir));
    this.ledger = new TaskLedger(this.dir);
  }
  get taskPath(): string {
    return join(this.dir, "task.json");
  }
  runDir(runId: string): string {
    return join(this.dir, "runs", runId);
  }
  journalPath(runId: string): string {
    return join(this.runDir(runId), "journal.jsonl");
  }

  /** Loads the task, or creates it ONLY when the directory holds no prior task artifacts at all. */
  load(initialPlan: Plan | null, now: number, priorOwner = true): LoadResult {
    mkdirSync(this.dir, { recursive: true });
    if (!existsSync(this.taskPath)) {
      // owner.json is written by the current owner right after acquisition; it only counts if it pre-existed.
      const leftovers = readdirSync(this.dir).filter((f) => ["runs", "purchase-ledger.json", "owner-history.jsonl", "mock-site"].includes(f) || (priorOwner && f === "owner.json"));
      if (leftovers.length) return { ok: false, error: "task-identity-missing", detail: `任务文件缺失但存在历史数据（${leftovers.join("、")}），不会新建购买身份；请人工检查目录` };
      if (!initialPlan) return { ok: false, error: "no-plan", detail: "没有可用的初始计划" };
      const doc: TaskDoc = {
        schema: TASK_SCHEMA, taskId: letterId("task"), createdAt: now,
        planRevs: [{ rev: 1, planHash: planHash(initialPlan), plan: initialPlan, savedAt: now }], currentRev: 1, runs: [], formalArm: null,
      };
      // The ledger is part of the initial durable identity. Once task.json exists, absence is corruption,
      // not permission to manufacture an empty purchase history.
      atomicWriteJson(join(this.dir, "purchase-ledger.json"), []);
      atomicWriteJson(this.taskPath, doc);
      return { ok: true, doc, created: true };
    }
    let v: unknown;
    try {
      v = JSON.parse(readFileSync(this.taskPath, "utf8"));
    } catch {
      return { ok: false, error: "task-corrupt", detail: "任务文件无法解析；已保留原文件作为证据，不会覆盖" };
    }
    const bad = validDoc(v);
    if (bad) return { ok: false, error: "task-corrupt", detail: `任务文件校验失败（${bad}）；已保留原文件作为证据，不会覆盖` };
    return { ok: true, doc: v as TaskDoc, created: false };
  }

  save(doc: TaskDoc): void {
    const bad = validDoc(doc);
    if (bad) throw new Error(`TaskDocInvalid: ${bad}`);
    atomicWriteJson(this.taskPath, doc);
  }
}

export function currentPlan(doc: TaskDoc): PlanRev {
  return doc.planRevs[doc.currentRev - 1];
}
export function latestRun(doc: TaskDoc): RunRecord | null {
  return doc.runs.at(-1) ?? null;
}
