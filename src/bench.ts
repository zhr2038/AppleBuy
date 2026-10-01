// Decision-level benchmark (A14). Same seeded simulated workload for both policies:
//   fresh-list        = this project's policy (newest list, refusal memory, bounded refresh)
//   naive-remembered  = matched baseline B1 (remember the first list, walk it in plan order, reload only when exhausted)
// Local time = performance.now() around engine.handle(). Remote time = SIMULATED virtual latency, not Apple.
// Rendering = N/A (in-process, no page). Journal = in-memory (fsync excluded from the measured boundary).
import { cpus, platform, arch, release } from "node:os";
import { Engine } from "./engine.ts";
import type { Policy } from "./engine.ts";
import { MemoryJournal, MemoryLedger } from "./journal.ts";
import type { Plan } from "./plan.ts";
import { planHash } from "./plan.ts";
import { VirtualClock, runEngine } from "./runner.ts";
import { DEFAULT_SIM, SimStorePort } from "./mock/fake-port.ts";

export type Dist = { n: number; p50: number; p95: number; max: number };
export type PolicyReport = {
  policy: Policy;
  runs: number;
  outcomes: Record<string, number>;
  failures: number;
  accepted: number;
  attemptsToAccept: Dist;
  /** Virtual time until the accepting chooseSlot reply was received (excludes later advance and endpoint observation). */
  simulatedMsToAccept: Dist;
  /** Virtual time until the run stopped (includes advance and endpoint observation), reported separately. */
  simulatedMsToRunEnd: Dist;
  t1LocalMs: Dist;
  t2LocalMs: Dist;
  t2SimulatedRemoteMs: Dist;
  t3LocalMs: Dist;
  staleRefActions: number;
  maxConcurrentMutations: number;
};
export type BenchReport = {
  label: string;
  seed: number;
  warmup: number;
  measured: number;
  environment: Record<string, string | number>;
  boundaries: Record<string, string>;
  workload: Record<string, unknown>;
  policies: PolicyReport[];
};

export function dist(values: number[]): Dist {
  if (values.length === 0) return { n: 0, p50: Number.NaN, p95: Number.NaN, max: Number.NaN };
  const v = [...values].sort((a, b) => a - b);
  const q = (p: number) => v[Math.min(v.length - 1, Math.ceil(p * v.length) - 1)];
  return { n: v.length, p50: q(0.5), p95: q(0.95), max: v[v.length - 1] };
}

async function oneRun(plan: Plan, seed: number, policy: Policy) {
  const clock = new VirtualClock();
  const ph = planHash(plan);
  const engine = new Engine({ plan, planHash: ph, runId: "run-bench", journal: new MemoryJournal(), ledger: new MemoryLedger(), now: clock.now, portKind: "mock", policy });
  const port = new SimStorePort(seed, plan);
  const res = await runEngine(engine, port, clock, { maxSteps: 400 });
  const chooses = res.dispatched.filter((d) => d.kind === "chooseSlot").length;
  return { res, port, accepted: res.simulatedMsToAccept !== null, chooses };
}

export async function runBench(plan: Plan, o: { runs: number; warmup: number; seed: number }): Promise<BenchReport> {
  const policies: Policy[] = ["fresh-list", "naive-remembered"];
  const reports: PolicyReport[] = [];
  for (const policy of policies) {
    for (let i = 0; i < o.warmup; i++) await oneRun(plan, o.seed * 100000 + 90000 + i, policy); // warm-up excluded
    const outcomes: Record<string, number> = {};
    const attempts: number[] = [];
    const simMs: number[] = [];
    const simEnd: number[] = [];
    const t1: number[] = [];
    const t2: number[] = [];
    const t2r: number[] = [];
    const t3: number[] = [];
    let failures = 0;
    let accepted = 0;
    let stale = 0;
    let maxConc = 0;
    for (let i = 0; i < o.runs; i++) {
      const { res, port, accepted: ok, chooses } = await oneRun(plan, o.seed * 100000 + i, policy);
      const k = `${res.phase}:${res.reason}`;
      outcomes[k] = (outcomes[k] ?? 0) + 1;
      if (res.aborted) failures++;
      if (ok) {
        accepted++;
        attempts.push(chooses);
        simMs.push(res.simulatedMsToAccept as number);
        simEnd.push(res.simulatedElapsedMs);
      }
      for (const t of res.timings) {
        if (t.metric === "T1") t1.push(t.localMs);
        if (t.metric === "T2") {
          t2.push(t.localMs);
          t2r.push(t.simulatedRemoteMs);
        }
        if (t.metric === "T3") t3.push(t.localMs);
      }
      stale += port.staleRefActions;
      maxConc = Math.max(maxConc, port.maxConcurrent);
    }
    reports.push({
      policy, runs: o.runs, outcomes, failures, accepted,
      attemptsToAccept: dist(attempts), simulatedMsToAccept: dist(simMs), simulatedMsToRunEnd: dist(simEnd),
      t1LocalMs: dist(t1), t2LocalMs: dist(t2), t2SimulatedRemoteMs: dist(t2r), t3LocalMs: dist(t3),
      staleRefActions: stale, maxConcurrentMutations: maxConc,
    });
  }
  const c = cpus();
  return {
    label: "离线决策级基准（FAKE 模拟门店，mock contract v0）——不是苹果官网性能，也不是人工操作速度",
    seed: o.seed,
    warmup: o.warmup,
    measured: o.runs,
    environment: {
      os: `${platform()} ${arch()} ${release()}`,
      cpu: c[0]?.model ?? "unknown",
      logicalCpus: c.length,
      node: process.version,
      powerMode: "未读取（无权限查询）",
      commit: "未测量（本任务未读取 Git 元数据）",
    },
    boundaries: {
      local: "performance.now() 包围 engine.handle() 与发送前 engine.authorize()，含分类后决策与命令生成，不含端口模拟耗时",
      acceptance: "simulatedMsToAccept 止于接受选择的回复到达（虚拟时钟）；之后的推进与终点观察单独计入 simulatedMsToRunEnd",
      remote: "模拟值：SimStorePort 种子随机延迟 60–240ms（虚拟时钟，不真实等待，不代表苹果网络）",
      rendering: "N/A（进程内模拟，无页面渲染；DOM 模拟在 C-003）",
      journal: "内存日志，不含 fsync 落盘耗时（CLI 演练使用落盘日志）",
      refresh: "最小刷新间隔 2000ms 计入模拟时间（虚拟时钟）",
    },
    workload: { ...DEFAULT_SIM, slotsPerList: 72, authorizedShare: "32/72（其余为未授权门店/日期，必须被过滤）", refs: "稳定（每个时段引用不变，避免对基线不公平的过期引用惩罚）" },
    policies: reports,
  };
}
