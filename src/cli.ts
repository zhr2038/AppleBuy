// Chinese CLI for the C-002 offline rehearsal. It only ever constructs offline FAKE ports; there is no real adapter import.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { runBench } from "./bench.ts";
import type { Dist } from "./bench.ts";
import { loadPlanFile, planHash, slotPlanViolation } from "./plan.ts";
import { formatRecord, PHASE_ZH, reasonZh, statusPanel } from "./messages.ts";
import { installNetworkGuard } from "./netguard.ts";
import { SCENARIOS, checkExpectation, runScenario } from "./mock/scenarios.ts";
import type { ScenarioRun } from "./mock/scenarios.ts";

const BANNER = "【演练模式｜FAKE 虚构数据｜离线模拟，不访问苹果官网，不产生真实订单/付款/时段占用】";
const DEFAULT_PLAN = "examples/plan.fake.json";

function args(argv: string[]): { cmd: string; opts: Record<string, string | true> } {
  const [cmd = "help", ...rest] = argv;
  const opts: Record<string, string | true> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith("--")) continue;
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      opts[a.slice(2)] = next;
      i++;
    } else opts[a.slice(2)] = true;
  }
  return { cmd, opts };
}

function help(): void {
  console.log(`${BANNER}
用法：
  node src/cli.ts rehearse [--scenario <id>] [--plan <文件>] [--json] [--quiet]
      运行一个离线演练场景（默认 refuse-then-accept：拒绝→新列表重选→接受→自动继续→模拟付款前终点）
  node src/cli.ts rehearse --all       运行全部场景并逐一核对预期
  node src/cli.ts scenarios            列出全部场景
  node src/cli.ts check-plan [--plan <文件>]   开始前检查（计划完整性、模式、证据状态）
  node src/cli.ts bench [--runs 200] [--warmup 20] [--seed 1]   决策级基准（模拟）`);
}

function flagshipChecks(run: ScenarioRun): { ok: boolean; text: string }[] {
  const recs = run.journal.records();
  // Only selections that actually reached the (mock) port count; prepared-then-cancelled intents are excluded.
  const sentIds = new Set(recs.filter((x) => x.type === "sent").map((x) => x.opId));
  const intents = recs.filter((x) => x.type === "intent" && x.kind === "chooseSlot" && sentIds.has(x.opId));
  const lists = recs.filter((x) => x.type === "list");
  const firstRefusal = recs.find((x) => x.type === "refusal");
  const chosen = run.result.dispatched.filter((d) => d.kind === "chooseSlot");
  const listOf = (seq: unknown) => lists.find((l) => l.seq === seq);
  const l1 = intents[0] ? listOf(intents[0].listSeq) : undefined;
  const l2 = intents[1] ? listOf(intents[1].listSeq) : undefined;
  const second = chosen[1];
  const secondFields = second?.slotKey?.split("|");
  const inPlan = !!secondFields && secondFields.length === 3 && slotPlanViolation(run.plan, { store: secondFields[0], date: secondFields[1], start: secondFields[2].split("-")[0], end: secondFields[2].split("-")[1] }) === null;
  return [
    { ok: !!firstRefusal && firstRefusal.count === 1 && intents.length >= 2, text: `第一次选择被明确拒绝：${firstRefusal ? String(firstRefusal.slotKey) : "无"}` },
    { ok: !!l1 && !!l2 && Number(l2.seq) > Number(l1.seq) && l2.gen !== l1.gen && l2.refTag !== l1.refTag, text: `重选使用更新的列表：seq ${l1?.seq}→${l2?.seq}，代次 ${l1?.gen}→${l2?.gen}，引用标签 ${l1?.refTag}→${l2?.refTag}` },
    { ok: run.port.staleRefActions === 0 && run.port.calls.filter((c) => c.method === "chooseSlot").every((c) => c.refFresh), text: `每次点击的引用都属于最新列表（过期引用操作 ${run.port.staleRefActions} 次）` },
    { ok: !!second && second.slotKey !== chosen[0]?.slotKey && inPlan, text: `第二次选择不同且在授权范围内：${second?.slotKey ?? "无"}` },
    { ok: run.port.contexts.size === 1, text: `商品/数量/总价/取货方式上下文全程不变（不同上下文数 ${run.port.contexts.size}；端口不存在加购/换店/换规格方法）` },
    { ok: run.result.phase === "REHEARSAL_ENDPOINT" && run.port.count("submitOrder") === 0, text: `到达终点：${PHASE_ZH[run.result.phase as keyof typeof PHASE_ZH] ?? run.result.phase}；提交次数 ${run.port.count("submitOrder")}` },
  ];
}

async function rehearse(opts: Record<string, string | true>): Promise<number> {
  const planPath = typeof opts.plan === "string" ? opts.plan : DEFAULT_PLAN;
  const { plan, problems } = loadPlanFile(planPath);
  if (!plan) {
    console.error(`计划无法使用（${planPath}）：\n- ${problems.join("\n- ")}`);
    return 2;
  }
  const ids = opts.all ? SCENARIOS.map((s) => s.id) : [typeof opts.scenario === "string" ? opts.scenario : "refuse-then-accept"];
  const guard = installNetworkGuard();
  const dir = resolve(".local", "runs");
  let failed = 0;
  const jsonOut: unknown[] = [];
  try {
    for (const id of ids) {
      const def = SCENARIOS.find((s) => s.id === id);
      if (!def) {
        console.error(`未知场景：${id}。可用：${SCENARIOS.map((s) => s.id).join(", ")}`);
        return 2;
      }
      const run = await runScenario(def, { plan, dir });
      const bad = checkExpectation(run);
      const checks = def.id === "refuse-then-accept" ? flagshipChecks(run) : [];
      const ok = bad.length === 0 && checks.every((c) => c.ok);
      if (!ok) failed++;
      if (opts.json) {
        jsonOut.push({
          scenario: def.id, fakeData: true, mockContract: "mock-v0（虚构，不是 Apple 接口）", phase: run.result.phase, reason: run.result.reason,
          dispatched: run.result.dispatched, checks, mismatches: bad, journal: run.journalPath, planHash: run.planHash, records: run.journal.records(),
        });
        continue;
      }
      console.log(`\n${BANNER}`);
      console.log(`场景：${def.id} — ${def.title}`);
      console.log(`覆盖：${def.covers.join(", ")}｜计划：${plan.label}（${plan.fake ? "FAKE" : "用户计划"}，哈希 ${run.planHash}）｜端口：${run.port.label}`);
      if (!opts.quiet) for (const rec of run.journal.records()) {
        const line = formatRecord(rec);
        if (line) console.log(line);
      }
      if (!opts.quiet) for (const line of statusPanel(run.engine.snapshot(), `${plan.products.map((p) => p.id).join("/")} @ ${plan.stores.map((s) => s.label).join("/")}`)) console.log(line);
      for (const c of checks) console.log(`${c.ok ? "✔" : "✘"} ${c.text}`);
      console.log(`${ok ? "✔ 符合预期" : "✘ 不符合预期"}：终态 ${PHASE_ZH[run.result.phase as keyof typeof PHASE_ZH] ?? run.result.phase}${run.result.reason ? `（${reasonZh(run.result.reason)}）` : ""}`);
      for (const b of bad) console.log(`  ✘ ${b}`);
      if (run.journalPath) console.log(`脱敏日志：${run.journalPath}`);
    }
  } finally {
    guard.uninstall();
  }
  if (opts.json) console.log(JSON.stringify(jsonOut.length === 1 ? jsonOut[0] : jsonOut, null, 2));
  if (guard.attempts.length) {
    console.error(`✘ 检测到非本机网络访问尝试（已拦截）：${guard.attempts.join(", ")}`);
    return 1;
  }
  if (ids.length > 1 && !opts.json) console.log(`\n共 ${ids.length} 个场景，${ids.length - failed} 个符合预期，${failed} 个不符合；非本机网络访问 0 次。`);
  return failed ? 1 : 0;
}

function checkPlan(opts: Record<string, string | true>): number {
  const planPath = typeof opts.plan === "string" ? opts.plan : DEFAULT_PLAN;
  const { plan, problems } = loadPlanFile(planPath);
  console.log(BANNER);
  console.log(`计划文件：${planPath}`);
  if (!plan) {
    console.log(`✘ 计划不完整，阻断：\n- ${problems.join("\n- ")}`);
    return 1;
  }
  console.log(`✔ 计划结构完整：${plan.label}（哈希 ${planHash(plan)}）${plan.fake ? "【FAKE 虚构数据，只能演练】" : ""}`);
  console.log("✔ 运行模式：演练（默认）。正式模式：不可用——C-002 没有真实苹果适配器，也没有真实正式授权能力。");
  console.log("✘ 真实入口/页面/会话识别：未实现（M2，需授权与当前证据）");
  console.log("证据状态：U01 部分（公开页面）；U02 时段出现位置、U03 选择/继续效果、U04 接受与保留、U05 拒绝后列表、U06 订单与付款确认——均未验证。");
  console.log("结论：只能离线演练；真实购买被阻断。");
  return 0;
}

function fmt(d: Dist, digits = 3): string {
  return d.n === 0 ? "n=0" : `n=${d.n} P50=${d.p50.toFixed(digits)} P95=${d.p95.toFixed(digits)} max=${d.max.toFixed(digits)}`;
}

async function bench(opts: Record<string, string | true>): Promise<number> {
  const runs = Number(opts.runs ?? 200);
  const warmup = Number(opts.warmup ?? 20);
  const seed = Number(opts.seed ?? 1);
  if (!Number.isInteger(runs) || runs < 1 || !Number.isInteger(warmup) || warmup < 0 || !Number.isInteger(seed)) {
    console.error("参数无效：--runs/--warmup/--seed 必须为整数");
    return 2;
  }
  const { plan, problems } = loadPlanFile(typeof opts.plan === "string" ? opts.plan : DEFAULT_PLAN);
  if (!plan) {
    console.error(`计划无法使用：${problems.join("；")}`);
    return 2;
  }
  const guard = installNetworkGuard();
  let report;
  try {
    report = await runBench(plan, { runs, warmup, seed });
  } finally {
    guard.uninstall();
  }
  const outDir = resolve(".local", "bench");
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, `bench-seed${seed}-runs${runs}.json`);
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(BANNER);
  console.log(report.label);
  console.log(`种子 ${seed}｜预热 ${warmup} 次（不计入）｜计量 ${runs} 次/策略`);
  console.log(`环境：${Object.entries(report.environment).map(([k, v]) => `${k}=${v}`).join("｜")}`);
  for (const [k, v] of Object.entries(report.boundaries)) console.log(`边界 ${k}：${v}`);
  for (const p of report.policies) {
    console.log(`\n策略 ${p.policy === "fresh-list" ? "fresh-list（本项目：最新列表重选）" : "naive-remembered（基线 B1：记住旧列表依次尝试）"}`);
    console.log(`  被接受 ${p.accepted}/${p.runs}；运行器失败 ${p.failures}；结局分布 ${JSON.stringify(p.outcomes)}`);
    console.log(`  接受前选择次数 ${fmt(p.attemptsToAccept, 0)}`);
    console.log(`  到时段被接受的模拟时间(ms，止于接受回复；含模拟远端与刷新间隔) ${fmt(p.simulatedMsToAccept, 0)}`);
    console.log(`  到运行结束的模拟时间(ms，另含继续结账与终点观察) ${fmt(p.simulatedMsToRunEnd, 0)}`);
    console.log(`  T1 列表→有效选择 本地决策(ms) ${fmt(p.t1LocalMs)}`);
    console.log(`  T2 拒绝→下一次有效选择 本地决策(ms) ${fmt(p.t2LocalMs)}；其中模拟远端(ms) ${fmt(p.t2SimulatedRemoteMs, 0)}`);
    console.log(`  T3 接受→下一必要动作 本地决策(ms) ${fmt(p.t3LocalMs)}`);
    console.log(`  渲染时间：N/A｜过期引用操作 ${p.staleRefActions}｜最大并发在途操作 ${p.maxConcurrentMutations}`);
  }
  console.log(`\n报告已写入：${out}`);
  console.log("提示：以上为模拟数据，不能当作苹果官网性能、真实成功率或人工速度。");
  return report.policies.some((p) => p.failures > 0 || p.maxConcurrentMutations > 1) ? 1 : 0;
}

async function main(): Promise<number> {
  const { cmd, opts } = args(process.argv.slice(2));
  switch (cmd) {
    case "rehearse":
      return rehearse(opts);
    case "scenarios":
      console.log(BANNER);
      for (const s of SCENARIOS) console.log(`${s.id.padEnd(28)} [${s.covers.join(",")}] ${s.title}`);
      return 0;
    case "check-plan":
      return checkPlan(opts);
    case "bench":
      return bench(opts);
    case "help":
    case "--help":
      help();
      return 0;
    default:
      console.error(`未知命令：${cmd}`);
      help();
      return 2;
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    console.error(`运行错误：${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  },
);
