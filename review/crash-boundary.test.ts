// Codex-owned independent acceptance tests for crash windows after durable outcomes (R05/R07, A07).
import test from "node:test";
import assert from "node:assert/strict";
import { Engine, type Command } from "../src/engine.ts";
import { MemoryJournal, MemoryLedger } from "../src/journal.ts";
import { validatePlan, planHash } from "../src/plan.ts";
import { classifyPage } from "../src/observe.ts";

function fixture() {
  const checked = validatePlan({
    schema: "pickup-plan/v1", fake: true, label: "FAKE reviewer plan", timezone: "Asia/Shanghai",
    fulfillment: "pickup", quantity: 1, maxTotalCny: 20000,
    products: [{ id: "FAKE-P", model: "FAKE Duo", capacity: "FAKE capacity", color: "FAKE color" }],
    stores: [{ label: "FAKE Store", role: "primary" }], dates: ["2030-01-01"],
    windows: [{ start: "09:00", end: "12:00" }], arrival: { earliest: "09:00", latest: "12:00" },
    priority: ["date", "store", "window"], paymentMethodLabel: "FAKE payment label",
    bounds: { maxRefusals: 8, maxRefreshes: 5, maxAttemptsPerSlot: 2, minRefreshIntervalMs: 0, maxQueryFailures: 3, maxReconcileAttempts: 2 },
  });
  assert.ok(checked.plan, checked.problems.join(", "));
  const plan = checked.plan;
  const context = { productId: "FAKE-P", quantity: 1, totalCny: 18000, fulfillment: "pickup" };
  const page = (seq: number) => classifyPage({
    contract: "mock-v0", kind: "page", step: "slot-selection", seq, context,
    slots: [
      { store: "FAKE Store", date: "2030-01-01", start: "09:00", end: "09:30", selectable: true, ref: `ref-${seq}-a` },
      { store: "FAKE Store", date: "2030-01-01", start: "10:00", end: "10:30", selectable: true, ref: `ref-${seq}-b` },
    ],
  });
  return { plan, page };
}

function dispatched(commands: Command[]) {
  const command = commands.find(c => c.type === "dispatch");
  assert.ok(command && command.type === "dispatch");
  return command;
}

for (const outcome of ["ACCEPTED", "REJECTED"] as const) {
  test(`A07: restart after durable ${outcome} outcome before derived events preserves slot truth`, () => {
    const { plan, page } = fixture();
    const original = new MemoryJournal();
    const ledger = new MemoryLedger();
    const options = { plan, planHash: planHash(plan), runId: "review-crash", ledger, now: () => 1, portKind: "mock" as const };
    const engine = new Engine({ ...options, journal: original });
    engine.handle({ type: "start" });
    const first = dispatched(engine.handle({ type: "observation", obs: page(1) }));
    // The reviewed repair separates preparation from port dispatch. Simulate the actual send boundary explicitly.
    assert.equal(engine.authorize(first).send, true);
    engine.handle({ type: "result", opId: first.opId, outcome: outcome === "ACCEPTED"
      ? { state: "ACCEPTED", evidence: "mock-accepted" }
      : { state: "REJECTED", code: "slot-full", slotRefused: true } });
    const records = original.records();
    const boundary = records.findIndex(r => r.type === "outcome" && r.opId === first.opId);
    assert.ok(boundary >= 0);
    // The process may die immediately after this fsynced outcome and before later derived records.
    const prefix = records.slice(0, boundary + 1);
    const restored = new Engine({ ...options, journal: new MemoryJournal(), restoreFrom: prefix });
    restored.handle({ type: "start" });
    const commands = restored.handle({ type: "observation", obs: page(2) });
    const repeated = commands.filter(c => c.type === "dispatch" && c.kind === "chooseSlot" && c.slotKey === first.slotKey);
    assert.equal(repeated.length, 0, "Durably accepted or rejected first slot must not be blindly selected again after this crash window");
  });
}
