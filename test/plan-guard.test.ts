// A06 / R01 / R02: every user condition independently blocks unauthorized actions; alternatives stay authorized.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validatePlan } from "../src/plan.ts";
import { FAKE_PLAN, S, key } from "../src/mock/scenarios.ts";
import type { SlotTuple } from "../src/mock/fake-port.ts";
import { FAKE_CONTEXT, page, res, stepPage } from "../src/mock/fake-port.ts";
import { dispatches, driver, pageEv, resultEv } from "./helpers.ts";

test("example plan file equals the scenario FAKE plan and is conspicuously fake", () => {
  const file = JSON.parse(readFileSync("examples/plan.fake.json", "utf8"));
  assert.deepEqual(file, FAKE_PLAN);
  assert.equal(file.fake, true);
  assert.match(file.label, /FAKE/);
  for (const p of file.products) assert.match(p.id, /^FAKE-/);
  for (const s of file.stores) assert.match(s.label, /^FAKE /);
});

test("R02: missing or relaxed configuration is reported as blockers", () => {
  const cases: [string, (p: any) => void][] = [
    ["quantity", (p) => (p.quantity = 2)],
    ["fulfillment", (p) => (p.fulfillment = "delivery")],
    ["price", (p) => delete p.maxTotalCny],
    ["stores", (p) => (p.stores = [])],
    ["dates", (p) => (p.dates = ["2099-02-30"])],
    ["windows", (p) => (p.windows = [{ start: "12:00", end: "10:00" }])],
    ["bounds-cap", (p) => (p.bounds.maxRefusals = 999)],
    ["payment-digits", (p) => (p.paymentMethodLabel = "卡号 6222020200001234567")],
    ["primary", (p) => (p.stores = [{ label: "FAKE 门店乙", role: "backup" }])],
  ];
  for (const [name, mutate] of cases) {
    const p = structuredClone(FAKE_PLAN);
    mutate(p);
    const v = validatePlan(p);
    assert.equal(v.plan, null, name);
    assert.ok(v.problems.length > 0, name);
  }
  assert.deepEqual(validatePlan(structuredClone(FAKE_PLAN)).problems, []);
});

function firstAction(slots: [SlotTuple, boolean][], ctx: object = FAKE_CONTEXT) {
  const d = driver();
  d.feed({ type: "start" });
  d.feed(pageEv(page(1, slots, { context: ctx })));
  return d;
}

test("A06: product, price, quantity and fulfillment deviations each block all actions", () => {
  const variants: [string, object, string][] = [
    ["product", { ...FAKE_CONTEXT, productId: "FAKE-P9" }, "plan-deviation-product-not-authorized"],
    ["price", { ...FAKE_CONTEXT, totalCny: 10000 }, "plan-deviation-price-over-limit"],
    ["quantity", { ...FAKE_CONTEXT, quantity: 2 }, "plan-deviation-quantity-not-one"],
    ["fulfillment", { ...FAKE_CONTEXT, fulfillment: "delivery" }, "plan-deviation-fulfillment-not-pickup"],
  ];
  for (const [name, ctx, reason] of variants) {
    const d = firstAction([[S.A1, true], [S.B1, true]], ctx);
    assert.equal(dispatches(d.cmds).length, 0, name);
    assert.equal(d.engine.phase, "TAKEOVER", name);
    assert.equal(d.engine.snapshot().reason, reason, name);
  }
});

test("A06: unauthorized store, date, time window and arrival time are never selected", () => {
  const variants: [string, SlotTuple][] = [["store", S.X_STORE], ["date", S.X_DATE], ["time", S.X_TIME], ["arrival", S.X_ARRIVAL]];
  for (const [name, slot] of variants) {
    const d = firstAction([[slot, true]]);
    assert.equal(dispatches(d.cmds).length, 0, `${name}: no action for the unauthorized slot`);
    assert.equal(d.engine.snapshot().reason, "no-eligible-slot", name);
  }
});

test("A06: authorized alternatives (second product, backup store, second date) remain selectable", () => {
  const d = firstAction([[S.B1, true]], { ...FAKE_CONTEXT, productId: "FAKE-P2" });
  assert.equal(dispatches(d.cmds, "chooseSlot")[0]?.slotKey, key(S.B1));
  const d2 = firstAction([[S.A3, true], [S.X_DATE, true]]);
  assert.equal(dispatches(d2.cmds, "chooseSlot")[0]?.slotKey, key(S.A3));
});

test("A06: a price change or a different accepted slot after acceptance blocks continuation", () => {
  const d = firstAction([[S.A1, true]]);
  const op = dispatches(d.cmds, "chooseSlot")[0].opId;
  // page shows the price rose while the select was in flight; the accepted result is recorded but advance is blocked
  d.feed(pageEv(page(2, [[S.A1, true]], { context: { ...FAKE_CONTEXT, totalCny: 12000 } })));
  d.feed(resultEv(res(op, "accepted")));
  assert.equal(dispatches(d.cmds, "advance").length, 0);
  assert.equal(d.engine.phase, "TAKEOVER");

  const e = firstAction([[S.A1, true]]);
  const op2 = dispatches(e.cmds, "chooseSlot")[0].opId;
  e.feed(resultEv(res(op2, "accepted")));
  const adv = dispatches(e.cmds, "advance")[0].opId;
  e.feed(resultEv(res(adv, "accepted")));
  e.feed(pageEv(stepPage(3, "pre-payment", S.B1)));
  assert.equal(e.engine.snapshot().reason, "plan-deviation-accepted-slot-mismatch");
  assert.equal(e.engine.phase, "TAKEOVER");
});

test("ranking follows the user's priority order, never the page's display order", () => {
  const storeFirst = { ...structuredClone(FAKE_PLAN), priority: ["store", "date", "window"] as ("store" | "date" | "window")[] };
  const slots: [SlotTuple, boolean][] = [[S.B1, true], [S.A3, true]];
  const a = driver();
  a.feed({ type: "start" });
  a.feed(pageEv(page(1, slots)));
  assert.equal(dispatches(a.cmds)[0].slotKey, key(S.B1), "date first: 01-01 at backup store beats 01-02 at primary");
  const b = driver({ plan: storeFirst });
  b.feed({ type: "start" });
  b.feed(pageEv(page(1, slots)));
  assert.equal(dispatches(b.cmds)[0].slotKey, key(S.A3), "store first: primary store beats earlier date");
});
