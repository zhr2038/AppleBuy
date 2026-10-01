// Codex-owned acceptance: a running task retains its reviewed purchase conditions (R01/A06).
import test from "node:test";
import assert from "node:assert/strict";
import { Engine } from "../src/engine.ts";
import { MemoryJournal, MemoryLedger } from "../src/journal.ts";
import { validatePlan, planHash } from "../src/plan.ts";
import { classifyPage } from "../src/observe.ts";

for (const deviation of ["price", "product", "store", "arrival"] as const) {
  test(`A06: external ${deviation} mutation cannot enlarge an active plan's authorization`, () => {
    const checked = validatePlan({
      schema: "pickup-plan/v1", fake: true, label: "FAKE reviewer binding", timezone: "Asia/Shanghai",
      fulfillment: "pickup", quantity: 1, maxTotalCny: 20000,
      products: [{ id: "FAKE-P", model: "FAKE Duo", capacity: "FAKE capacity", color: "FAKE color" }],
      stores: [{ label: "FAKE Store", role: "primary" }], dates: ["2030-01-01"],
      windows: [{ start: "09:00", end: "12:00" }], arrival: { earliest: "10:00", latest: "12:00" },
      priority: ["date", "store", "window"], paymentMethodLabel: "FAKE payment label",
      bounds: { maxRefusals: 8, maxRefreshes: 5, maxAttemptsPerSlot: 2, minRefreshIntervalMs: 0, maxQueryFailures: 3, maxReconcileAttempts: 2 },
    });
    assert.ok(checked.plan);
    const plan = checked.plan;
    const engine = new Engine({ plan, planHash: planHash(plan), runId: "review-binding", journal: new MemoryJournal(), ledger: new MemoryLedger(), now: () => 1, portKind: "mock" });
    engine.handle({ type: "start" });
    // Freezing the original, snapshotting it, or blocking changed bindings are all acceptable designs.
    try {
      if (deviation === "price") plan.maxTotalCny = 30000;
      if (deviation === "product") plan.products[0].id = "FAKE-OTHER";
      if (deviation === "store") plan.stores[0].label = "FAKE Other Store";
      if (deviation === "arrival") plan.arrival.earliest = "09:00";
    } catch (error) {
      assert.ok(error instanceof TypeError, "Only deliberate immutable-plan rejection is acceptable here");
    }
    const observation = classifyPage({
      contract: "mock-v0", kind: "page", step: "slot-selection", seq: 1,
      context: { productId: deviation === "product" ? "FAKE-OTHER" : "FAKE-P", quantity: 1, totalCny: deviation === "price" ? 25000 : 18000, fulfillment: "pickup" },
      slots: [{ store: deviation === "store" ? "FAKE Other Store" : "FAKE Store", date: "2030-01-01", start: deviation === "arrival" ? "09:00" : "10:00", end: deviation === "arrival" ? "09:30" : "10:30", selectable: true, ref: "latest-ref" }],
    });
    const commands = engine.handle({ type: "observation", obs: observation });
    assert.equal(commands.filter(c => c.type === "dispatch" && c.kind === "chooseSlot").length, 0, "Conditions originally approved for this run must not silently widen through a caller-owned object");
  });
}
