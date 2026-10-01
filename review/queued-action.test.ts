// Codex-owned independent acceptance: authorization is checked at real dispatch, not only command creation (A06/A09).
import test from "node:test";
import assert from "node:assert/strict";
import { Engine } from "../src/engine.ts";
import { MemoryJournal, MemoryLedger } from "../src/journal.ts";
import { validatePlan, planHash } from "../src/plan.ts";
import { runEngine, VirtualClock, type CheckoutPort, type Envelope } from "../src/runner.ts";

const context = { productId: "FAKE-P", quantity: 1, totalCny: 18000, fulfillment: "pickup" };
const rawSlot = { store: "FAKE Store", date: "2030-01-01", start: "09:00", end: "09:30" };
const list = { contract: "mock-v0", kind: "page", step: "slot-selection", seq: 1, context, slots: [{ ...rawSlot, ref: "current-a", selectable: true }] };

function setup() {
  const checked = validatePlan({
    schema: "pickup-plan/v1", fake: true, label: "FAKE queued-action plan", timezone: "Asia/Shanghai",
    fulfillment: "pickup", quantity: 1, maxTotalCny: 20000,
    products: [{ id: "FAKE-P", model: "FAKE Duo", capacity: "FAKE capacity", color: "FAKE color" }],
    stores: [{ label: "FAKE Store", role: "primary" }], dates: ["2030-01-01"],
    windows: [{ start: "09:00", end: "12:00" }], arrival: { earliest: "09:00", latest: "12:00" },
    priority: ["date", "store", "window"], paymentMethodLabel: "FAKE payment label",
    bounds: { maxRefusals: 8, maxRefreshes: 5, maxAttemptsPerSlot: 2, minRefreshIntervalMs: 0, maxQueryFailures: 3, maxReconcileAttempts: 2 },
  });
  assert.ok(checked.plan);
  const clock = new VirtualClock();
  const engine = new Engine({ plan: checked.plan, planHash: planHash(checked.plan), runId: "review-queue", journal: new MemoryJournal(), ledger: new MemoryLedger(), now: clock.now, portKind: "mock" });
  return { clock, engine };
}

for (const scenario of ["pause", "price-deviation", "challenge"] as const) {
  test(`A06/A09/A10: queued advance is not sent after ${scenario} arrives`, async () => {
    const { clock, engine } = setup();
    let advances = 0;
    const post: Envelope[] = scenario === "pause" ? [{ ch: "control", action: "pause" }]
      : scenario === "challenge" ? [{ ch: "page", body: { contract: "mock-v0", kind: "challenge" } }]
      : [{ ch: "page", body: { contract: "mock-v0", kind: "page", step: "checkout-review", seq: 2, context: { ...context, totalCny: 25000 }, acceptedSlot: rawSlot } }];
    const port: CheckoutPort = {
      kind: "mock", label: "FAKE reviewer port",
      observe: async () => ({ body: list, simulatedMs: 0 }),
      chooseSlot: async opId => ({ body: { contract: "mock-v0", kind: "result", opId, result: "accepted", evidence: "mock-accepted" }, simulatedMs: 0, post }),
      advance: async opId => { advances++; return { body: { contract: "mock-v0", kind: "result", opId, result: "accepted", evidence: "mock-accepted" }, simulatedMs: 0 }; },
      submitOrder: async () => { throw new Error("unexpected-submit"); },
      lookupOrder: async () => { throw new Error("unexpected-lookup"); },
    };
    await runEngine(engine, port, clock, { maxSteps: 8 });
    assert.equal(advances, 0, "An emitted but unsent command is not a request already sent to the site; stop it before the port mutation");
  });
}
