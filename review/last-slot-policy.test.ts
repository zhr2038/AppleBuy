// Independent behavior criteria for C-005, written before quota takeover implementation.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Plan } from "../src/plan.ts";
import { planHash, validatePlan } from "../src/plan.ts";
import { FAKE_PLAN, key } from "../src/mock/scenarios.ts";
import type { SlotTuple } from "../src/mock/fake-port.ts";
import { err, page, res, stepPage } from "../src/mock/fake-port.ts";
import { dispatches, driver, pageEv, resultEv, send } from "../test/helpers.ts";

const E1: SlotTuple = ["FAKE 门店甲", "2099-01-01", "10:00", "10:30"];
const L1: SlotTuple = ["FAKE 门店甲", "2099-01-01", "17:30", "18:00"];
const E2: SlotTuple = ["FAKE 门店甲", "2099-01-02", "10:00", "10:30"];
const L2: SlotTuple = ["FAKE 门店甲", "2099-01-02", "17:00", "17:30"];
const L3: SlotTuple = ["FAKE 门店甲", "2099-01-03", "16:30", "17:00"];
function lastPlan(): Plan {
  return { ...structuredClone(FAKE_PLAN), dates: ["2099-01-01", "2099-01-02", "2099-01-03"], slotSelection: "last-offered-per-store-date" } as Plan;
}

test("C005: absent selector preserves the existing earlier-slot behavior and plan hash", () => {
  assert.equal(planHash(FAKE_PLAN), "e05ec123bee7f523");
  const d = driver();
  d.feed({ type: "start" });
  assert.equal(dispatches(d.feed(pageEv(page(1, [[L1, true], [E1, true]]))), "chooseSlot")[0]?.slotKey, key(E1));
});

test("C005: the intentionally stale benchmark policy cannot execute a last-slot purchase plan", () => {
  assert.throws(() => driver({ plan: lastPlan(), policy: "naive-remembered" }), /LastSlotPolicyRequiresFreshList/);
});

test("C005: complete unsorted list selects day-one terminal offer, never earlier", () => {
  const d = driver({ plan: lastPlan() });
  d.feed({ type: "start" });
  const out = d.feed(pageEv(page(1, [[L3, true], [E2, true], [E1, true], [L1, true], [L2, true]])));
  assert.equal(dispatches(out, "chooseSlot")[0]?.slotKey, key(L1));
});

test("C005: disabled terminal offer excludes its earlier sibling and advances date", () => {
  const d = driver({ plan: lastPlan() });
  d.feed({ type: "start" });
  const out = d.feed(pageEv(page(1, [[E1, true], [L1, false], [E2, true], [L2, true]])));
  assert.equal(dispatches(out, "chooseSlot")[0]?.slotKey, key(L2));
});

test("C005: explicit refusal with newest list selects the next date's terminal, not earlier", () => {
  const d = driver({ plan: lastPlan() });
  d.feed({ type: "start" });
  // First list has only a terminal day-one offer, so the baseline also prepares it.
  const first = dispatches(d.feed(pageEv(page(1, [[L1, true]]))), "chooseSlot")[0];
  assert.equal(send(d, first).send, true);
  const next = d.feed(resultEv(res(first.opId, "rejected", {
    code: "slot-full", slotRefused: true,
    freshList: page(2, [[E1, true], [L1, false], [E2, true], [L2, true]]),
  })));
  const pick = dispatches(next, "chooseSlot")[0];
  assert.equal(pick?.slotKey, key(L2));
  assert.equal(pick.ref, "r2-3");
});

test("C005: send-time redraw adds a later offer while keeping old ref; cancel and reselect", () => {
  const d = driver({ plan: lastPlan() });
  d.feed({ type: "start" });
  const old = dispatches(d.feed(pageEv(page(1, [[E1, true]], { refPrefix: "stable" }))), "chooseSlot")[0];
  d.feed(pageEv(page(2, [[E1, true], [L1, true]], { refPrefix: "stable" })));
  const auth = send(d, old);
  assert.equal(auth.send, false, "an unchanged old ref is not enough to satisfy the newest last-slot policy");
  const next = dispatches(auth.followUp, "chooseSlot")[0];
  assert.equal(next?.slotKey, key(L1));
  assert.equal(next.ref, "stable-1");
  assert.equal(d.journal.records().filter(r => r.type === "sent").length, 0);
});

test("C005: terminal offer outside arrival permission does not authorize an earlier fallback", () => {
  const plan = lastPlan();
  plan.arrival.latest = "17:00";
  const d = driver({ plan });
  d.feed({ type: "start" });
  const out = d.feed(pageEv(page(1, [[E1, true], [L1, true]])));
  assert.equal(dispatches(out, "chooseSlot").length, 0);
  assert.notEqual(d.engine.snapshot().lastObservationState, "CONFIRMED_NONE");
});

test("C005: invalid selector, reversed dates or non-date-first priority is rejected", () => {
  const bad = [null, false, {}, [], "latest", ""];
  for (const value of bad) {
    const plan = { ...lastPlan(), slotSelection: value };
    assert.equal(validatePlan(plan).plan, null, `unsupported selector ${JSON.stringify(value)} must block`);
  }
  assert.equal(validatePlan({ ...lastPlan(), dates: ["2099-01-02", "2099-01-01"] }).plan, null);
  assert.equal(validatePlan({ ...lastPlan(), priority: ["store", "date", "window"] }).plan, null);
  assert.ok(validatePlan(lastPlan()).plan);
  assert.ok(validatePlan(FAKE_PLAN).plan);
});

test("C005: latest allowed day/store stays within the frozen date set; no fourth date", () => {
  const d = driver({ plan: lastPlan() });
  d.feed({ type: "start" });
  const fourth: SlotTuple = ["FAKE 门店甲", "2099-01-04", "17:30", "18:00"];
  const other: SlotTuple = ["FAKE 未授权门店丙", "2099-01-01", "17:30", "18:00"];
  assert.equal(dispatches(d.feed(pageEv(page(1, [[fourth, true], [other, true]]))), "chooseSlot").length, 0);
});

test("C005: policy is hash bound and caller changes cannot re-enable earlier offers", () => {
  const plan = lastPlan();
  assert.notEqual(planHash(plan), planHash(FAKE_PLAN));
  const d = driver({ plan });
  delete (plan as any).slotSelection;
  d.feed({ type: "start" });
  assert.equal(dispatches(d.feed(pageEv(page(1, [[E1, true], [L1, true]]))), "chooseSlot")[0]?.slotKey, key(L1));
});

test("C005: unknown last-slot result remains pending; newer list cannot trigger another choice", () => {
  const d = driver({ plan: lastPlan() });
  d.feed({ type: "start" });
  const first = dispatches(d.feed(pageEv(page(1, [[L1, true]]))), "chooseSlot")[0];
  assert.equal(send(d, first).send, true);
  d.feed(resultEv(err("timeout", first.opId)));
  const out = d.feed(pageEv(page(2, [[L1, false], [L2, true], [L3, true]])));
  assert.equal(dispatches(out).length, 0);
  assert.equal(d.engine.snapshot().pendingOp?.status, "UNKNOWN");
  assert.equal(d.engine.snapshot().mutations, 1);
});

test("C005: restart forgets old offers, preserves the date binding and reconciles one unknown choice", () => {
  const plan = lastPlan();
  const old = driver({ plan, runId: "run-last-restore" });
  old.feed({ type: "start" });
  const cmd = dispatches(old.feed(pageEv(page(1, [[L1, true]]))), "chooseSlot")[0];
  assert.equal(send(old, cmd).send, true);
  const d = driver({ plan, runId: old.runId, restoreFrom: old.journal.records() });
  assert.equal(dispatches(d.feed({ type: "start" })).length, 0);
  const next = d.feed(pageEv(stepPage(2, "checkout-review", L1)));
  assert.equal(dispatches(next, "chooseSlot").length, 0);
  assert.equal(dispatches(next, "advance").length, 1);
  assert.equal(d.engine.snapshot().acceptedSlot, key(L1));
});
