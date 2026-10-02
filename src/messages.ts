// Chinese user-facing text (R10). Journal records are formatted from allowlisted fields only.
import type { Phase, Snapshot } from "./engine.ts";
import type { JournalRecord } from "./journal.ts";

export const PHASE_ZH: Record<Phase, string> = {
  INIT: "初始化",
  AWAIT_LIST: "等待最新页面/时段列表",
  OP_INFLIGHT: "操作进行中（发送前复核，或已发送等待模拟官网结果）",
  RECONCILING: "结果不明，只读核实中（不重发）",
  PAUSED: "已暂停（不再发起新动作）",
  TAKEOVER: "需要人工接管",
  BLOCKED: "已阻断",
  EXHAUSTED: "已达重试/刷新上限（不代表无货）",
  MANUAL_VERIFICATION: "需人工核验（结果不明，禁止自动重发/再次提交）",
  REHEARSAL_ENDPOINT: "已到达模拟付款前步骤（演练终点，未提交任何订单）",
  ORDER_CONFIRMED_MOCK: "模拟订单已确认（仅模拟，不是真实订单）",
  STOPPED: "已停止",
};

const DEV_ZH: Record<string, string> = {
  "product-not-authorized": "商品规格不在授权范围",
  "quantity-not-one": "数量不是 1",
  "price-unparsed": "无法解析总价",
  "price-over-limit": "含税总价超过上限",
  "fulfillment-not-pickup": "取货方式不是直营店自提",
  "store-not-authorized": "门店未授权",
  "date-not-authorized": "日期未授权",
  "window-not-authorized": "时段不在授权时间窗",
  "arrival-out-of-range": "超出可到店时间",
  mismatch: "官网接受的时段与所选不一致",
};

export function reasonZh(reason: string): string {
  const fixed: Record<string, string> = {
    "reached-mock-pre-payment": "到达模拟付款前步骤",
    start: "开始",
    resume: "恢复后重新观察",
    "after-refusal": "被拒后取最新列表",
    chooseSlot: "选择时段",
    advance: "继续结账",
    submitOrder: "提交（模拟）订单",
    "chooseSlot-accepted": "时段已被接受",
    "slot-accepted": "时段已接受，自动继续",
    "advance-accepted": "继续操作已被接受",
    "refusal-limit": "明确拒绝次数达到上限",
    "refresh-limit-confirmed-none": "官方明确无可选时段，且有限刷新次数已用完",
    "last-slot-restricted": "按“每个门店/日期只选最晚时段”规则：该日最晚时段已被拒、不可选或从最新列表消失，不回退到更早时段（不等于无货），继续有限刷新",
    "refresh-limit-last-slot-restricted": "有限刷新次数已用完：列表仍有更早时段，但按“只选最晚时段”规则不回退（不等于无货）",
    "last-slot-evidence-unreadable": "最晚时段记录无法读取：为安全起见不自动选择时段，请人工检查",
    "last-slot-history-incomplete": "本次运行的日志无法证明各门店/日期已出现过的最晚时段（旧版本日志或写入中断）：为避免回退到更早时段，已停止自动选择/继续；已发送操作仍只读核实，不重发，请人工核对",
    LIST_STALE_SUSPECTED: "疑似过期列表：同一列表连续被拒、刷新后仍未变化，停止盲点",
    "auth-required": "登录过期或需要本人登录",
    "auth-required-op-unknown": "登录过期；已发送操作结果不明",
    "challenge-detected": "出现验证挑战，停止自动操作",
    "throttle-detected": "被限流，停止自动刷新",
    "challenge-op-unknown": "出现验证挑战；已发送操作结果不明",
    "throttle-op-unknown": "被限流；已发送操作结果不明",
    "query-failed-repeatedly": "查询连续失败（不等于无货）",
    "user-pause": "用户暂停",
    "user-takeover": "用户接管",
    "user-stop": "用户停止",
    "unknown-chooseSlot": "时段选择结果不明，只读核实无结论",
    "unknown-advance": "继续操作结果不明，只读核实无结论",
    "unknown-submitOrder": "最终提交结果不明：禁止再次提交，请人工核验订单",
    "ledger-plan-consumed": "该计划已有提交记录（可能结果不明），人工核验并清除前禁止运行",
    "mock-order-confirmed": "模拟订单确认",
    "slot-list-after-acceptance": "已接受时段后页面又回到选择列表，需人工确认",
    "page-did-not-advance": "继续后页面未前进，需人工确认",
    "unexpected-order-page": "出现意外的订单页面",
    "re-decide-newest-list": "按最新列表重新决策",
    "resume-await-sent-op": "恢复：等待已发送操作的结果",
    "resume-reconcile": "恢复：只读核实结果不明的操作",
    "restart-unknown-op": "重启：上次已发送操作结果不明，只读核实",
    "restart-unknown-submit": "重启：最终提交结果不明，只读查询订单",
    "restored-PAUSED": "重启：保持重启前的暂停状态",
    "restored-TAKEOVER": "重启：保持重启前的人工接管状态",
  };
  if (fixed[reason]) return fixed[reason];
  if (reason.startsWith("refresh-limit-")) return `有限刷新次数已用完（${reason.slice(14)}）`;
  if (reason.startsWith("unrecognized-")) return `页面/响应结构无法识别（${reason.slice(13)}），不推断有货/无货/成功`;
  if (reason.startsWith("plan-deviation-")) {
    const codes = reason.slice(15).replace(/^accepted-slot-/, "").split("+");
    return `与购买计划不符：${codes.map((c) => DEV_ZH[c] ?? c).join("、")}`;
  }
  if (reason.startsWith("formal-capability-")) return `正式（模拟）授权无效：${reason.slice(18)}，不提交`;
  if (reason.startsWith("advance-rejected-")) return `继续操作被拒绝：${reason.slice(17)}`;
  if (reason.startsWith("submit-rejected-")) return `模拟提交被拒绝：${reason.slice(16)}`;
  return reason;
}

const KIND_ZH: Record<string, string> = { chooseSlot: "选择时段", advance: "继续结账", submitOrder: "提交（模拟）订单", observe: "只读观察", lookupOrder: "只读订单查询" };
const CANCEL_ZH: Record<string, string> = {
  pause: "用户已暂停",
  takeover: "已转人工接管",
  "superseded-by-resume": "恢复后需重新观察",
  "superseded-by-newer-list": "已有更新的列表，改按最新列表重新决策",
  "plan-deviation": "页面信息与购买计划不符",
  "slot-not-authorized": "时段不在授权范围",
  "accepted-slot-changed": "已接受的时段发生变化",
  "ledger-plan-consumed": "该计划已有提交记录",
  "prepared-not-sent-before-restart": "进程中断前尚未发送",
  "not-current-prepared-op": "不是当前待发送操作",
};
const STATE_ZH: Record<string, string> = {
  ACCEPTED: "已接受", REJECTED: "明确拒绝", UNKNOWN: "结果不明", ORDER_CONFIRMED: "订单确认（模拟）",
  AUTH_REQUIRED: "需要登录", CHALLENGE_OR_THROTTLE: "验证/限流",
  SLOTS_AVAILABLE: "有可选时段", CONFIRMED_NONE: "确认无可选时段", QUERY_FAILED: "查询失败", UNRECOGNIZED_STRUCTURE: "结构无法识别",
  PROCESSING: "处理中", CHECKOUT_REVIEW: "结账复核页", PRE_PAYMENT: "付款前页", ORDER_PAGE_CONFIRMED: "订单确认页",
};

export function formatRecord(rec: JournalRecord): string | null {
  const t = `[模拟 ${String(rec.t).padStart(6)}ms]`;
  const k = (x: unknown) => (x === undefined ? "" : String(x));
  switch (rec.type) {
    case "run-start":
      return `${t} 开始演练 ${k(rec.runId)}（策略 ${k(rec.kind)}，${rec.state === "fake-plan" ? "FAKE 虚构计划" : "用户计划"}）`;
    case "restart":
      return `${t} 从日志恢复（第 ${k(rec.epoch)} 轮）：${k(rec.reason)}`;
    case "observe-request":
      return `${t} [观察] 请求只读观察：${k(rec.reason)}`;
    case "list":
      return `${t} [列表] seq=${k(rec.seq)} 代次=${k(rec.gen)} ${STATE_ZH[String(rec.state)] ?? rec.state}：共 ${k(rec.count)} 个，可选 ${k(rec.selectable)} 个，引用标签 ${k(rec.refTag)}`;
    case "observation":
      return `${t} [观察] ${STATE_ZH[String(rec.state)] ?? rec.state}${rec.reason ? `（${k(rec.reason)}）` : ""}${rec.slotKey ? ` 时段 ${k(rec.slotKey)}` : ""}`;
    case "decision":
      return rec.slotKey
        ? `${t} [决策] 选择 ${k(rec.slotKey)}（列表 seq=${k(rec.seq)} 代次=${k(rec.gen)}，符合计划的候选 ${k(rec.eligible)} 个，按计划优先级第一）`
        : rec.reason === "last-slot-restricted"
          ? `${t} [决策] 当前列表只剩更早时段：按“只选最晚时段”规则不回退（seq=${k(rec.seq)}，不等于无货）`
          : `${t} [决策] 当前列表无符合计划的可选时段（seq=${k(rec.seq)}）`;
    case "terminal":
      return `${t} [最晚时段] 本次运行记录该门店/日期最晚时段 ${k(rec.slotKey)}（seq=${k(rec.seq)}；之后不回退到更早时段）`;
    case "intent":
      return `${t} [准备] ${KIND_ZH[String(rec.kind)] ?? rec.kind}${rec.slotKey ? ` ${k(rec.slotKey)}` : ""}（${k(rec.opId)}，已写入日志，尚未发送）`;
    case "sent":
      return `${t} [发送] ${KIND_ZH[String(rec.kind)] ?? rec.kind}${rec.slotKey ? ` ${k(rec.slotKey)}` : ""}（${k(rec.opId)}，发送前复核通过${rec.kind === "chooseSlot" ? "；状态：已选中（未确认）" : ""}）`;
    case "cancelled":
      return `${t} [取消] 未发送 ${KIND_ZH[String(rec.kind)] ?? rec.kind}${rec.opId ? ` ${k(rec.opId)}` : ""}：${CANCEL_ZH[String(rec.reason)] ?? reasonZh(String(rec.reason))}（从未到达模拟官网）`;
    case "outcome":
      return `${t} [结果] ${k(rec.opId)}：${STATE_ZH[String(rec.state)] ?? rec.state}${rec.code ? `（${k(rec.code)}）` : ""}`;
    case "accepted":
      return `${t} [接受] 模拟官网已接受 ${k(rec.slotKey)}（来自权威结果，不是本地勾选）`;
    case "refusal":
      return `${t} [拒绝] 模拟官网明确拒绝 ${k(rec.slotKey)}（累计 ${k(rec.count)} 次）；本代次不再尝试该时段，改用最新列表`;
    case "refresh":
      return `${t} [刷新] 有限刷新第 ${k(rec.count)} 次：${k(rec.reason)}`;
    case "unknown":
      return `${t} [不明] ${k(rec.opId)} 结果不明（${k(rec.reason)}）：只读核实，绝不自动重发`;
    case "reconcile":
      return `${t} [核实] ${k(rec.opId)} 第 ${k(rec.attempt)} 次核实无结论（${k(rec.reason)}）`;
    case "reconciled":
      return `${t} [核实] ${k(rec.opId)} 核实结果：${STATE_ZH[String(rec.state)] ?? rec.state}`;
    case "ignored":
      return `${t} [忽略] ${k(rec.reason)}${rec.seq !== undefined ? ` seq=${k(rec.seq)}` : ""}${rec.opId ? ` ${k(rec.opId)}` : ""}`;
    case "blocked-action":
      return `${t} [拦截] 未发送 ${KIND_ZH[String(rec.kind)] ?? rec.kind}：${k(rec.reason)}`;
    case "control":
      return `${t} [控制] ${({ pause: "暂停", resume: "恢复", takeover: "人工接管", stop: "停止" } as Record<string, string>)[String(rec.action)] ?? rec.action}`;
    case "endpoint":
      return `${t} [终点] 已到达模拟付款前步骤；没有正式授权，因此不提交`;
    case "phase":
      return `${t} [状态] ${PHASE_ZH[rec.phase as Phase] ?? rec.phase}${rec.reason ? ` — ${reasonZh(String(rec.reason))}` : ""}`;
    default:
      return null;
  }
}

export function statusPanel(s: Snapshot, targetLabel: string): string[] {
  return [
    "──────── 当前状态 ────────",
    `当前步骤：${PHASE_ZH[s.phase]}`,
    `原因：${s.reason ? reasonZh(s.reason) : "—"}`,
    `目标：${targetLabel}`,
    `已接受时段：${s.acceptedSlot ?? "无"}；最近选择：${s.lastChosen ?? "无"}`,
    `候选时段（最新列表）：${s.candidates.length ? s.candidates.join("；") : "无"}`,
    `最后有效观察时间：${s.lastValidObservationAt === null ? "无" : `模拟时间 ${s.lastValidObservationAt}ms`}`,
    `在途/不明操作：${s.pendingOp ? `${s.pendingOp.kind} ${s.pendingOp.opId}（${s.pendingOp.status === "UNKNOWN" ? "结果不明" : "已发送 1 个操作，等待官网结果"}）` : "无"}`,
    `拒绝 ${s.refusals} 次｜有限刷新 ${s.refreshes} 次｜查询失败 ${s.queryFailures} 次｜已发送操作 ${s.mutations} 个`,
    `需要人工接管：${s.phase === "TAKEOVER" || s.phase === "MANUAL_VERIFICATION" ? "是" : "否"}`,
    "注意：本地标志不能保证服务端恰好一次；结果不明时以人工核验为准。",
  ];
}
