// Engine status view-model (Chinese), shared by the browser state and the benchmark's render timing (C-003).
import type { Phase, Snapshot } from "../engine.ts";
import { PHASE_ZH, reasonZh } from "../messages.ts";

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
  };
}
