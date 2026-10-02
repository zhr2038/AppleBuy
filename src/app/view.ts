// Engine status view-model (Chinese), shared by the browser state and the benchmark's render timing (C-003).
import type { Phase, Snapshot } from "../engine.ts";
import type { JournalRecord } from "../journal.ts";
import { PHASE_ZH, reasonZh } from "../messages.ts";
import { parseSlotKey } from "../plan.ts";

/** "FAKE 门店甲|2099-01-01|21:15-21:30" → "2099-01-01 21:15–21:30（FAKE 门店甲）"; anything else is shown as-is. */
export function slotZh(key: string | null | undefined): string | null {
  if (key === null || key === undefined) return null;
  const s = parseSlotKey(key);
  return s ? `${s.date} ${s.start}–${s.end}（${s.store}）` : key;
}

export function engineView(s: Snapshot | null, info: { phase?: string; reason?: string } | null = null, historical = false) {
  const phase = s?.phase ?? (info?.phase as Phase | undefined) ?? null;
  const reason = s?.reason ?? info?.reason ?? "";
  return {
    phase, phaseZh: phase ? (PHASE_ZH as Record<string, string>)[phase] ?? phase : "尚未运行", historical,
    reason, reasonZh: reason ? reasonZh(reason) : "—",
    paused: s?.paused ?? false, pendingOp: s?.pendingOp ?? null, acceptedSlot: s?.acceptedSlot ?? null, lastChosen: s?.lastChosen ?? null,
    candidates: s?.candidates ?? [], lastValidObservationAt: s?.lastValidObservationAt ?? null, lastObservationState: s?.lastObservationState ?? "",
    refusals: s?.refusals ?? 0, refreshes: s?.refreshes ?? 0, queryFailures: s?.queryFailures ?? 0, mutations: s?.mutations ?? 0, epoch: s?.epoch ?? 0,
    needsHuman: phase === "TAKEOVER" || phase === "MANUAL_VERIFICATION",
    acceptedSlotZh: slotZh(s?.acceptedSlot), lastChosenZh: slotZh(s?.lastChosen),
    pendingSlotZh: slotZh(s?.pendingOp?.slotKey), candidatesZh: (s?.candidates ?? []).map((c) => slotZh(c) as string),
  };
}

const KIND_ZH: Record<string, string> = { chooseSlot: "选择时段", advance: "继续结账", submitOrder: "提交模拟订单", lookupOrder: "只读查询订单" };
const CONTROL_ZH: Record<string, string> = { pause: "你请求了暂停", resume: "你请求了恢复（先重新观察）", takeover: "你请求了人工接管", stop: "你请求了停止" };
const NOTABLE_PHASES = new Set(["TAKEOVER", "MANUAL_VERIFICATION", "BLOCKED", "EXHAUSTED", "STOPPED", "ORDER_CONFIRMED_MOCK", "PAUSED"]);

/**
 * Short business history (newest last) from verified journal records: what was chosen, refused, accepted or stopped.
 * Mechanics (sequence numbers, ref tags, op ids, hashes) stay in the advanced diagnostic trace.
 */
export function businessHistory(records: readonly JournalRecord[], limit = 12): { t: number; text: string }[] {
  const out: { t: number; text: string }[] = [];
  const add = (r: JournalRecord, text: string) => {
    if (out.at(-1)?.text !== text) out.push({ t: Number(r.t), text });
  };
  for (const r of records) {
    const slot = slotZh(typeof r.slotKey === "string" ? r.slotKey : null);
    switch (r.type) {
      case "run-start": add(r, "开始演练"); break;
      case "restart": add(r, "从日志恢复：已发送的操作只读核实，不重发"); break;
      case "list": if (r.state === "SLOTS_AVAILABLE") add(r, `读取到最新时段列表（可选 ${String(r.selectable ?? "?")} 个）`); else if (r.state === "CONFIRMED_NONE") add(r, "页面明确显示没有可选时段"); break;
      case "decision": if (r.reason === "last-slot-restricted") add(r, "该日只剩更早时段：按“每天只选最晚时段”不回退，继续查看最新列表"); break;
      case "sent": add(r, `${KIND_ZH[String(r.kind)] ?? String(r.kind)}${slot ? ` ${slot}` : ""}：已发出，等待结果`); break;
      case "cancelled": add(r, `未发出${KIND_ZH[String(r.kind)] ?? ""}：${reasonZh(String(r.reason))}`); break;
      case "accepted": add(r, `模拟官网接受 ${slot ?? ""}`); break;
      case "refusal": add(r, `模拟官网明确拒绝 ${slot ?? ""}：改用最新列表重选`); break;
      case "unknown": add(r, "结果不明：只读核实，绝不自动重发"); break;
      case "endpoint": add(r, "到达模拟付款前步骤：演练终点，未提交任何订单"); break;
      case "control": add(r, CONTROL_ZH[String(r.action)] ?? String(r.action)); break;
      case "phase": if (NOTABLE_PHASES.has(String(r.phase))) add(r, `${(PHASE_ZH as Record<string, string>)[String(r.phase)] ?? r.phase}${r.reason ? `：${reasonZh(String(r.reason))}` : ""}`); break;
    }
  }
  return out.slice(-limit);
}
