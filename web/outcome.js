// Shared by the executor (TaskApp.start) and the browser renderer: what the NEXT run will do with the one-use
// simulated formal capability. TaskApp.start claims an unused arm for every new run (unless a final-submit record
// blocks the run); the engine checks plan version and expiry again at send time. The page sends the {kind, armId}
// it displayed with the start request, and the executor refuses a start whose current outcome differs.
// Plain ES module: no DOM, no network.

export const OUTCOME_KINDS = ["default", "used", "ledger", "plan-mismatch", "expired", "submits"];

/** s needs: formal {armed, used, armId, armedPlanHash, expiresAt}, ledger {entries}, plan {planHash}. */
export function runOutcome(s, now = Date.now()) {
  const f = s.formal;
  if (!f || !f.armed) return { kind: "default", armId: null };
  if (f.used) return { kind: "used", armId: null };
  // A final-submit record (or unverifiable ledger) blocks every new run, so the arm is not claimed.
  if (s.ledger?.entries) return { kind: "ledger", armId: null };
  const armId = typeof f.armId === "string" ? f.armId : null;
  if (f.armedPlanHash !== s.plan?.planHash) return { kind: "plan-mismatch", armId };
  if (f.expiresAt !== null && f.expiresAt <= now) return { kind: "expired", armId };
  return { kind: "submits", armId };
}

/** True only for a well-formed expectation equal to the actual outcome. */
export function sameOutcome(expected, actual) {
  return !!expected && typeof expected === "object" && OUTCOME_KINDS.includes(expected.kind) &&
    (expected.armId === null || typeof expected.armId === "string") && expected.kind === actual.kind && expected.armId === actual.armId;
}
