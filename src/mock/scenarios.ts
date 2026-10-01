// Executable offline scenarios (FAKE data, mock contract v0). Each scenario states the expected terminal truth.
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import type { FormalCapability, Phase, Policy } from "../engine.ts";
import { Engine, createMockFormalCapability } from "../engine.ts";
import type { JournalSink, LedgerLike } from "../journal.ts";
import { FileJournal, FileLedger, MemoryJournal, MemoryLedger } from "../journal.ts";
import type { Bounds, Plan } from "../plan.ts";
import { planHash } from "../plan.ts";
import type { RunResult } from "../runner.ts";
import { VirtualClock, runEngine } from "../runner.ts";
import type { SlotTuple, Step } from "./fake-port.ts";
import { FAKE_CONTEXT, ScriptedPort, err, lookup, page, r, res, signal, stepPage } from "./fake-port.ts";

export const FAKE_PLAN: Plan = {
  schema: "pickup-plan/v1",
  fake: true,
  label: "FAKE 演练计划（虚构数据，非真实商品/门店/价格/日期）",
  timezone: "Asia/Shanghai",
  fulfillment: "pickup",
  quantity: 1,
  maxTotalCny: 9999,
  products: [
    { id: "FAKE-P1", model: "FAKE 演示手机", capacity: "FAKE-容量A", color: "FAKE-颜色甲" },
    { id: "FAKE-P2", model: "FAKE 演示手机", capacity: "FAKE-容量A", color: "FAKE-颜色乙" },
  ],
  stores: [
    { label: "FAKE 门店甲", role: "primary" },
    { label: "FAKE 门店乙", role: "backup" },
  ],
  dates: ["2099-01-01", "2099-01-02"],
  windows: [
    { start: "08:00", end: "12:00" },
    { start: "14:00", end: "18:00" },
  ],
  arrival: { earliest: "09:30", latest: "18:00" },
  priority: ["date", "store", "window"],
  bounds: { maxRefusals: 8, maxRefreshes: 5, maxAttemptsPerSlot: 2, minRefreshIntervalMs: 2000, maxQueryFailures: 3, maxReconcileAttempts: 2 },
  paymentMethodLabel: "FAKE-付款方式标签",
};

export const LAST_SLOT_FAKE_PLAN: Plan = {
  ...FAKE_PLAN,
  label: "FAKE 每天末档三日演练（全部虚构；不绑定真实日期）",
  dates: ["2099-01-01", "2099-01-02", "2099-01-03"],
  slotSelection: "last-offered-per-store-date",
};
const LAST_DAY_SLOTS = {
  firstEarly: ["FAKE 门店甲", "2099-01-01", "10:00", "10:30"],
  firstLast: ["FAKE 门店甲", "2099-01-01", "17:30", "18:00"],
  secondEarly: ["FAKE 门店甲", "2099-01-02", "10:00", "10:30"],
  secondLast: ["FAKE 门店甲", "2099-01-02", "17:00", "17:30"],
  thirdEarly: ["FAKE 门店甲", "2099-01-03", "10:00", "10:30"],
  thirdLast: ["FAKE 门店甲", "2099-01-03", "16:30", "17:00"],
} satisfies Record<string, SlotTuple>;

export const S = {
  A1: ["FAKE 门店甲", "2099-01-01", "10:00", "10:30"],
  A2: ["FAKE 门店甲", "2099-01-01", "10:30", "11:00"],
  B1: ["FAKE 门店乙", "2099-01-01", "10:00", "10:30"],
  A3: ["FAKE 门店甲", "2099-01-02", "10:00", "10:30"],
  X_STORE: ["FAKE 未授权门店丙", "2099-01-01", "10:00", "10:30"],
  X_DATE: ["FAKE 门店甲", "2099-01-09", "10:00", "10:30"],
  X_TIME: ["FAKE 门店甲", "2099-01-01", "12:30", "13:00"],
  X_ARRIVAL: ["FAKE 门店甲", "2099-01-01", "09:00", "09:30"],
} satisfies Record<string, SlotTuple>;
export const key = (t: SlotTuple): string => `${t[0]}|${t[1]}|${t[2]}-${t[3]}`;

const obs = (reply: Step["reply"]): Step => ({ expect: "observe", reply });
const choose = (reply: Step["reply"]): Step => ({ expect: "chooseSlot", reply });
const adv = (reply: Step["reply"]): Step => ({ expect: "advance", reply });
const accept = (c: { opId?: string }) => r(res(c.opId, "accepted"));
const endSteps = (slot: SlotTuple, seq: number): Step[] => [adv(accept), obs(() => r(stepPage(seq, "pre-payment", slot)))];
const unauthorizedNoise: [SlotTuple, boolean][] = [[S.X_STORE, true], [S.X_DATE, true], [S.X_TIME, true], [S.X_ARRIVAL, true]];

export type ScenarioDef = {
  id: string;
  title: string;
  covers: string[];
  bounds?: Partial<Bounds>;
  plan?: Plan;
  capability?: "valid" | "expired";
  steps: () => Step[];
  expect: { phase: Phase; reason?: string; chosen?: string[]; chooseCalls?: number; submits?: number };
};

export const SCENARIOS: ScenarioDef[] = [
  {
    id: "last-slot-three-dates",
    title: "每天末档：第一天末档拒绝 → 新列表第二天末档拒绝 → 新列表第三天末档接受 → 演练终点",
    covers: ["C005", "A01", "A02", "A05", "A06", "A11"],
    plan: LAST_SLOT_FAKE_PLAN,
    steps: () => {
      const s = LAST_DAY_SLOTS;
      const offers = (first: boolean, second: boolean): [SlotTuple, boolean][] => [
        [s.thirdLast, true], [s.firstEarly, true], [s.secondLast, second],
        [s.thirdEarly, true], [s.firstLast, first], [s.secondEarly, true],
      ];
      return [
        obs(() => r(page(1, offers(true, true)))),
        choose((c) => r(res(c.opId, "rejected", { code: "slot-full", slotRefused: true, freshList: page(2, offers(false, true)) }))),
        choose((c) => r(res(c.opId, "rejected", { code: "slot-full", slotRefused: true, freshList: page(3, offers(false, false)) }))),
        choose(accept),
        ...endSteps(s.thirdLast, 4),
      ];
    },
    expect: {
      phase: "REHEARSAL_ENDPOINT",
      chosen: [key(LAST_DAY_SLOTS.firstLast), key(LAST_DAY_SLOTS.secondLast), key(LAST_DAY_SLOTS.thirdLast)],
      chooseCalls: 3, submits: 0,
    },
  },
  {
    id: "refuse-then-accept",
    title: "首选时段被明确拒绝 → 有限刷新得到新列表/新引用 → 选另一个授权时段被接受 → 自动继续到模拟付款前终点",
    covers: ["A02", "A01", "R04", "R05"],
    steps: () => [
      obs(() => r(page(1, [...unauthorizedNoise, [S.A1, true], [S.A2, true], [S.B1, true]]))),
      choose((c) => r(res(c.opId, "rejected", { code: "slot-full", slotRefused: true }))),
      obs(() => r(page(2, [...unauthorizedNoise, [S.A1, false], [S.A2, true], [S.B1, true]]))),
      choose(accept),
      ...endSteps(S.A2, 3),
    ],
    expect: { phase: "REHEARSAL_ENDPOINT", chosen: [key(S.A1), key(S.A2)], submits: 0 },
  },
  {
    id: "accept-first",
    title: "时段出现，首选一次被模拟官网接受，继续到演练终点",
    covers: ["A01"],
    steps: () => [obs(() => r(page(1, [[S.A2, true], [S.A1, true]]))), choose(accept), ...endSteps(S.A1, 2)],
    expect: { phase: "REHEARSAL_ENDPOINT", chosen: [key(S.A1)] },
  },
  {
    id: "refuse-with-returned-list",
    title: "拒绝响应自带最新列表：直接使用，不额外刷新",
    covers: ["A02", "R05"],
    steps: () => [
      obs(() => r(page(1, [[S.A1, true], [S.B1, true]]))),
      choose((c) => r(res(c.opId, "rejected", { code: "slot-full", slotRefused: true, freshList: page(2, [[S.A1, false], [S.B1, true]]) }))),
      choose(accept),
      ...endSteps(S.B1, 3),
    ],
    expect: { phase: "REHEARSAL_ENDPOINT", chosen: [key(S.A1), key(S.B1)] },
  },
  {
    id: "redraw-new-refs",
    title: "在途期间页面重绘：内容相同但不透明引用全部更换；拒绝后必须使用最新引用，且不重试同代次被拒时段",
    covers: ["A05", "R05", "review-1"],
    steps: () => [
      obs(() => r(page(1, [[S.A1, true], [S.A2, true], [S.B1, true]]))),
      choose((c) => r(res(c.opId, "rejected", { code: "slot-full", slotRefused: true }), {
        pre: [{ ch: "page", body: page(2, [[S.A1, true], [S.A2, true], [S.B1, true]], { refPrefix: "redraw2" }) }],
      })),
      choose(accept),
      ...endSteps(S.A2, 3),
    ],
    expect: { phase: "REHEARSAL_ENDPOINT", chosen: [key(S.A1), key(S.A2)] },
  },
  {
    id: "pending-result-preserved",
    title: "选择在途时到达新列表（首选显示不可选）：不得当作拒绝，也不得发起第二个操作；保留在途结果",
    covers: ["A05", "R07", "review-2"],
    steps: () => [
      obs(() => r(page(1, [[S.A1, true], [S.A2, true]]))),
      choose((c) => r(res(c.opId, "accepted"), { pre: [{ ch: "page", body: page(2, [[S.A1, false], [S.A2, true]]) }] })),
      ...endSteps(S.A1, 3),
    ],
    expect: { phase: "REHEARSAL_ENDPOINT", chosen: [key(S.A1)] },
  },
  {
    id: "advance-refused-slot",
    title: "选中后继续时才被告知时段已满（核心痛点）：回到新列表重选，不重做商品/门店",
    covers: ["A02", "R05"],
    steps: () => [
      obs(() => r(page(1, [[S.A1, true], [S.A2, true]]))),
      choose(accept),
      adv((c) => r(res(c.opId, "rejected", { code: "slot-unavailable", slotRefused: true, freshList: page(2, [[S.A1, false], [S.A2, true]]) }))),
      choose(accept),
      ...endSteps(S.A2, 3),
    ],
    expect: { phase: "REHEARSAL_ENDPOINT", chosen: [key(S.A1), key(S.A2)] },
  },
  {
    id: "multi-refusal-exhaust",
    title: "连续多次明确拒绝、列表多次更新，达到拒绝上限后停止（显示已达上限，不是无货）",
    covers: ["A03"],
    bounds: { maxRefusals: 3 },
    steps: () => [
      obs(() => r(page(1, [[S.A1, true], [S.A2, true], [S.B1, true], [S.A3, true]]))),
      choose((c) => r(res(c.opId, "rejected", { code: "slot-full", slotRefused: true, freshList: page(2, [[S.A1, false], [S.A2, true], [S.B1, true], [S.A3, true]]) }))),
      choose((c) => r(res(c.opId, "rejected", { code: "slot-full", slotRefused: true, freshList: page(3, [[S.A1, false], [S.A2, false], [S.B1, true], [S.A3, true]]) }))),
      choose((c) => r(res(c.opId, "rejected", { code: "slot-full", slotRefused: true }))),
    ],
    expect: { phase: "EXHAUSTED", reason: "refusal-limit", chosen: [key(S.A1), key(S.A2), key(S.B1)] },
  },
  {
    id: "stale-list",
    title: "同一未变化列表连续两次被拒：只做一次有限刷新，仍未变化则判定疑似过期列表并交人工，不逐个盲点",
    covers: ["A03", "R05"],
    steps: () => {
      const same = (seq: number) => page(seq, [[S.A1, true], [S.A2, true], [S.B1, true]], { refPrefix: `s${seq}` });
      return [
        obs(() => r(same(1))),
        choose((c) => r(res(c.opId, "rejected", { code: "slot-full", slotRefused: true, freshList: same(2) }))),
        choose((c) => r(res(c.opId, "rejected", { code: "slot-full", slotRefused: true, freshList: same(3) }))),
        obs(() => r(same(4))),
      ];
    },
    expect: { phase: "TAKEOVER", reason: "LIST_STALE_SUSPECTED", chosen: [key(S.A1), key(S.A2)] },
  },
  {
    id: "confirmed-none",
    title: "官方明确“无可选时段”信号：有效的无，按上限有限刷新后停止",
    covers: ["A04", "R06"],
    bounds: { maxRefreshes: 2 },
    steps: () => [1, 2, 3].map((n) => obs(() => r(page(n, [], { noneSignal: true })))),
    expect: { phase: "EXHAUSTED", reason: "refresh-limit-confirmed-none", chooseCalls: 0 },
  },
  {
    id: "query-failed",
    title: "查询连续失败（超时/网络/状态码）：不等于无货，有限重试后交人工",
    covers: ["A04", "R06"],
    steps: () => [obs(() => r(err("timeout"))), obs(() => r(err("network"))), obs(() => r(err("status")))],
    expect: { phase: "TAKEOVER", reason: "query-failed-repeatedly", chooseCalls: 0 },
  },
  {
    id: "empty-without-signal",
    title: "空数组但没有明确“无”信号：判为无法识别，不说有货也不说无货",
    covers: ["A04"],
    steps: () => [obs(() => r(page(1, [])))],
    expect: { phase: "TAKEOVER", reason: "unrecognized-empty-without-none-signal", chooseCalls: 0 },
  },
  {
    id: "missing-field",
    title: "时段缺少字段：判为无法识别并交人工",
    covers: ["A04"],
    steps: () => [obs(() => { const p = page(1, [[S.A1, true]]) as any; delete p.slots[0].selectable; return r(p); })],
    expect: { phase: "TAKEOVER", reason: "unrecognized-slot-field-invalid", chooseCalls: 0 },
  },
  {
    id: "unknown-structure",
    title: "完全未知的响应结构：交人工，不推断状态",
    covers: ["A04", "A10"],
    steps: () => [obs(() => r({ html: "<div>FAKE 未知页面</div>" }))],
    expect: { phase: "TAKEOVER", reason: "unrecognized-contract-unknown", chooseCalls: 0 },
  },
  {
    id: "out-of-order-duplicates",
    title: "乱序/重复列表与迟到/重复结果：只按最新列表执行一次，不重复操作，状态不回退",
    covers: ["A05", "R07"],
    steps: () => [
      obs(() => r(page(2, [[S.A1, true], [S.A2, true]]), { post: [{ ch: "page", body: page(2, [[S.A1, true], [S.A2, true]]) }, { ch: "page", body: page(1, [[S.A2, true]]) }] })),
      choose((c) => r(res(c.opId, "accepted"), {
        pre: [{ ch: "result", body: res("op-0-99", "accepted") }],
        post: [{ ch: "result", body: res(c.opId, "accepted") }, { ch: "result", body: res(c.opId, "rejected", { code: "slot-full", slotRefused: true }) }],
      })),
      ...endSteps(S.A1, 3),
    ],
    expect: { phase: "REHEARSAL_ENDPOINT", chosen: [key(S.A1)] },
  },
  {
    id: "select-timeout-reconciled",
    title: "选择请求超时：结果不明 → 只读核实页面显示已接受 → 继续；绝不重发",
    covers: ["A07", "R07"],
    steps: () => [
      obs(() => r(page(1, [[S.A1, true], [S.A2, true]]))),
      choose((c) => r(err("timeout", c.opId))),
      obs(() => r(stepPage(2, "checkout-review", S.A1))),
      ...endSteps(S.A1, 3),
    ],
    expect: { phase: "REHEARSAL_ENDPOINT", chosen: [key(S.A1)], chooseCalls: 1 },
  },
  {
    id: "select-timeout-page-rejected",
    title: "选择请求超时：只读核实页面明确显示该时段被拒 → 使用该页面最新列表重选",
    covers: ["A07", "A02"],
    steps: () => [
      obs(() => r(page(1, [[S.A1, true], [S.A2, true]]))),
      choose((c) => r(err("timeout", c.opId))),
      obs(() => r(page(2, [[S.A1, false], [S.A2, true]], { lastSelection: { slot: S.A1, status: "rejected" } }))),
      choose(accept),
      ...endSteps(S.A2, 3),
    ],
    expect: { phase: "REHEARSAL_ENDPOINT", chosen: [key(S.A1), key(S.A2)] },
  },
  {
    id: "select-timeout-manual",
    title: "选择请求超时且核实无证据：有限核实后停在人工核验，不重发",
    covers: ["A07"],
    steps: () => [
      obs(() => r(page(1, [[S.A1, true], [S.A2, true]]))),
      choose((c) => r(err("network", c.opId))),
      obs(() => r(page(2, [[S.A1, true], [S.A2, true]]))),
      obs(() => r(page(3, [[S.A1, true], [S.A2, true]]))),
    ],
    expect: { phase: "MANUAL_VERIFICATION", reason: "unknown-chooseSlot", chooseCalls: 1 },
  },
  {
    id: "pause-inflight",
    title: "操作在途时暂停：不再发新动作，已发送操作的结果照实记录",
    covers: ["A09", "R08"],
    steps: () => [
      obs(() => r(page(1, [[S.A1, true]]))),
      choose((c) => r(res(c.opId, "accepted"), { pre: [{ ch: "control", action: "pause" }] })),
    ],
    expect: { phase: "PAUSED", chosen: [key(S.A1)] },
  },
  {
    id: "pause-resume",
    title: "暂停后恢复：先重新观察（旧列表作废），确认已接受后继续",
    covers: ["A09", "R08"],
    steps: () => [
      obs(() => r(page(1, [[S.A1, true]]))),
      choose((c) => r(res(c.opId, "accepted"), { pre: [{ ch: "control", action: "pause" }], post: [{ ch: "control", action: "resume" }] })),
      obs(() => r(stepPage(2, "checkout-review", S.A1))),
      ...endSteps(S.A1, 3),
    ],
    expect: { phase: "REHEARSAL_ENDPOINT", chosen: [key(S.A1)] },
  },
  {
    id: "takeover-unknown",
    title: "在途时人工接管且结果超时：保留“结果不明”，不发新动作",
    covers: ["A09", "A07"],
    steps: () => [
      obs(() => r(page(1, [[S.A1, true]]))),
      choose((c) => r(err("timeout", c.opId), { pre: [{ ch: "control", action: "takeover" }] })),
    ],
    expect: { phase: "TAKEOVER", reason: "user-takeover", chooseCalls: 1 },
  },
  {
    id: "challenge",
    title: "出现验证挑战：立即退让交人工",
    covers: ["A10"],
    steps: () => [obs(() => r(signal("challenge")))],
    expect: { phase: "TAKEOVER", reason: "challenge-detected", chooseCalls: 0 },
  },
  {
    id: "throttle",
    title: "被限流：停止所有自动刷新交人工",
    covers: ["A10"],
    steps: () => [obs(() => r(page(1, [[S.A1, true]]))), choose((c) => r(signal("throttle", c.opId)))],
    expect: { phase: "TAKEOVER", reason: "throttle-op-unknown", chooseCalls: 1 },
  },
  {
    id: "auth-expired",
    title: "登录过期：交给本人登录，不自动处理凭证",
    covers: ["A10"],
    steps: () => [obs(() => r(signal("auth")))],
    expect: { phase: "TAKEOVER", reason: "auth-required", chooseCalls: 0 },
  },
  {
    id: "price-deviation",
    title: "页面总价超过计划上限：拦截，不发送任何动作",
    covers: ["A06"],
    steps: () => [obs(() => r(page(1, [[S.A1, true]], { context: { ...FAKE_CONTEXT, totalCny: 10000 } })))],
    expect: { phase: "TAKEOVER", reason: "plan-deviation-price-over-limit", chooseCalls: 0 },
  },
  {
    id: "formal-mock-submit",
    title: "带假正式授权（仅对模拟端口有效）：提交一单符合计划的模拟订单，确认后停止",
    covers: ["A12"],
    capability: "valid",
    steps: () => [
      obs(() => r(page(1, [[S.A1, true]]))),
      choose(accept),
      ...endSteps(S.A1, 2),
      { expect: "submitOrder", reply: (c) => r(res(c.opId, "order-confirmed")) },
    ],
    expect: { phase: "ORDER_CONFIRMED_MOCK", submits: 1 },
  },
  {
    id: "formal-submit-unknown",
    title: "模拟最终提交超时：只读查询订单，仍不明则停在人工核验，绝不再次提交",
    covers: ["A07", "A12"],
    capability: "valid",
    steps: () => [
      obs(() => r(page(1, [[S.A1, true]]))),
      choose(accept),
      ...endSteps(S.A1, 2),
      { expect: "submitOrder", reply: (c) => r(err("timeout", c.opId)) },
      { expect: "lookupOrder", reply: (c) => r(lookup(c.opId, "not-found")) },
      { expect: "lookupOrder", reply: (c) => r(lookup(c.opId, "unknown")) },
    ],
    expect: { phase: "MANUAL_VERIFICATION", reason: "unknown-submitOrder", submits: 1 },
  },
  {
    id: "formal-capability-expired",
    title: "假正式授权已过期：不提交",
    covers: ["A12"],
    capability: "expired",
    steps: () => [obs(() => r(page(1, [[S.A1, true]]))), choose(accept), ...endSteps(S.A1, 2)],
    expect: { phase: "BLOCKED", reason: "formal-capability-expired", submits: 0 },
  },
];

export function newRunId(): string {
  // Letters only, so the id never looks like a long digit sequence in sanitized logs.
  return `run-${[...randomBytes(6)].map((b) => "abcdefghijklmnopqrstuvwxyz"[b % 26]).join("")}`;
}

export type ScenarioRun = {
  def: ScenarioDef;
  plan: Plan;
  planHash: string;
  runId: string;
  engine: Engine;
  port: ScriptedPort;
  journal: JournalSink;
  ledger: LedgerLike;
  result: RunResult;
  capability: FormalCapability | null;
  journalPath: string | null;
};

export function scenarioPlan(def: ScenarioDef, base?: Plan): Plan {
  const chosen = base ?? def.plan ?? FAKE_PLAN;
  return def.bounds ? { ...chosen, bounds: { ...chosen.bounds, ...def.bounds } } : chosen;
}

export async function runScenario(def: ScenarioDef, o: { plan?: Plan; dir?: string; ledger?: LedgerLike; policy?: Policy } = {}): Promise<ScenarioRun> {
  const plan = scenarioPlan(def, o.plan);
  const ph = planHash(plan);
  const runId = newRunId();
  const clock = new VirtualClock();
  const journalPath = o.dir ? join(o.dir, runId, "journal.jsonl") : null;
  const journal: JournalSink = journalPath ? new FileJournal(journalPath) : new MemoryJournal();
  const ledger: LedgerLike = o.ledger ?? (o.dir ? new FileLedger(join(o.dir, runId)) : new MemoryLedger());
  const capability = def.capability ? createMockFormalCapability(ph, runId, def.capability === "valid" ? 10_000_000 : 0) : null;
  const engine = new Engine({ plan, planHash: ph, runId, journal, ledger, now: clock.now, portKind: "mock", capability, policy: o.policy });
  const port = new ScriptedPort(def.steps());
  const result = await runEngine(engine, port, clock);
  return { def, plan, planHash: ph, runId, engine, port, journal, ledger, result, capability, journalPath };
}

/** Compares a run against its declared expectation. Returns a list of Chinese mismatch descriptions. */
export function checkExpectation(run: ScenarioRun): string[] {
  const e = run.def.expect;
  const bad: string[] = [];
  const chosen = run.result.dispatched.filter((d) => d.kind === "chooseSlot").map((d) => d.slotKey);
  if (run.result.phase !== e.phase) bad.push(`终态应为 ${e.phase}，实际 ${run.result.phase}`);
  if (e.reason !== undefined && run.result.reason !== e.reason) bad.push(`原因应为 ${e.reason}，实际 ${run.result.reason}`);
  if (e.chosen && JSON.stringify(chosen) !== JSON.stringify(e.chosen)) bad.push(`选择序列应为 ${e.chosen.join(" → ")}，实际 ${chosen.join(" → ")}`);
  if (e.chooseCalls !== undefined && run.port.count("chooseSlot") !== e.chooseCalls) bad.push(`选择调用次数应为 ${e.chooseCalls}，实际 ${run.port.count("chooseSlot")}`);
  if (e.submits !== undefined && run.port.count("submitOrder") !== e.submits) bad.push(`提交次数应为 ${e.submits}，实际 ${run.port.count("submitOrder")}`);
  if (run.port.violations.length) bad.push(`脚本调用顺序异常：${run.port.violations.join("; ")}`);
  if (run.port.staleRefActions > 0) bad.push(`使用了过期引用 ${run.port.staleRefActions} 次`);
  if (run.port.maxConcurrent > 1) bad.push(`并发在途操作 ${run.port.maxConcurrent}`);
  if (run.result.aborted) bad.push(`运行器中止：${run.result.aborted}`);
  return bad;
}
