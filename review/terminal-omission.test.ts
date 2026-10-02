// Codex independent reproductions for Claude F5-1. Written before C-005-R1 repair.
// Offline mock facts only; nothing here establishes an Apple contract.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Plan } from "../src/plan.ts";
import { FAKE_PLAN, key } from "../src/mock/scenarios.ts";
import type { SlotTuple } from "../src/mock/fake-port.ts";
import { page, res } from "../src/mock/fake-port.ts";
import { dispatches, driver, pageEv, resultEv, send } from "../test/helpers.ts";

const E1: SlotTuple = ["FAKE 门店甲", "2099-01-01", "10:00", "10:30"];
const L1: SlotTuple = ["FAKE 门店甲", "2099-01-01", "17:30", "18:00"];
const E2: SlotTuple = ["FAKE 门店甲", "2099-01-02", "10:00", "10:30"];
const L2: SlotTuple = ["FAKE 门店甲", "2099-01-02", "17:00", "17:30"];
const B1: SlotTuple = ["FAKE 门店乙", "2099-01-01", "16:30", "17:00"];
const lastPlan = (): Plan => ({ ...structuredClone(FAKE_PLAN), slotSelection: "last-offered-per-store-date" });
const initial = () => page(1, [[E1, true], [L1, true], [E2, true], [L2, true]]);
const omitted = (seq = 2) => page(seq, [[E1, true], [E2, true], [L2, true]]);
function started(plan = lastPlan()) {
  const d = driver({ plan });
  d.feed({ type: "start" });
  const first = dispatches(d.feed(pageEv(initial())), "chooseSlot")[0];
  assert.equal(first?.slotKey, key(L1));
  return { d, first };
}

test("F5-1: refused terminal omitted from latest list moves to next authorized date", () => {
  const { d, first } = started();
  assert.equal(send(d, first).send, true);
  const out = d.feed(resultEv(res(first.opId, "rejected", { code: "slot-full", slotRefused: true, freshList: omitted() })));
  assert.equal(dispatches(out, "chooseSlot")[0]?.slotKey, key(L2));
});

test("F5-1: restart immediately after durable rejection retains the earlier-slot restriction", () => {
  const { d, first } = started();
  assert.equal(send(d, first).send, true);
  d.feed(resultEv(res(first.opId, "rejected", { code: "slot-full", slotRefused: true, freshList: omitted() })));
  const records = d.journal.records();
  const rejected = records.findIndex(r => r.type === "outcome" && r.opId === first.opId && r.state === "REJECTED");
  assert.ok(rejected >= 0);
  // Crash before the derived refusal/decision records: primary durable facts must suffice.
  const restored = driver({ plan: d.plan, runId: d.runId, restoreFrom: records.slice(0, rejected + 1) });
  restored.feed({ type: "start" });
  const out = restored.feed(pageEv(omitted(10)));
  assert.equal(dispatches(out, "chooseSlot")[0]?.slotKey, key(L2));
});

test("F5-1: explicit refusal during continuation also forbids an earlier same-day fallback", () => {
  const { d, first } = started();
  assert.equal(send(d, first).send, true);
  const advance = dispatches(d.feed(resultEv(res(first.opId, "accepted"))), "advance")[0];
  assert.equal(send(d, advance).send, true);
  const out = d.feed(resultEv(res(advance.opId, "rejected", { code: "slot-full", slotRefused: true, freshList: omitted() })));
  assert.equal(dispatches(out, "chooseSlot")[0]?.slotKey, key(L2));
});

test("F5-1 clarification: terminal disappears before sending; cancel, never choose earlier", () => {
  const { d, first } = started();
  d.feed(pageEv(omitted()));
  const auth = send(d, first);
  assert.equal(auth.send, false);
  assert.equal(dispatches(auth.followUp, "chooseSlot")[0]?.slotKey, key(L2));
  assert.equal(d.journal.records().filter(r => r.type === "sent").length, 0);
});

test("F5-1 clarification: restart before any mutation preserves observed terminal permission", () => {
  const { d } = started();
  const restored = driver({ plan: d.plan, runId: d.runId, restoreFrom: d.journal.records() });
  restored.feed({ type: "start" });
  const out = restored.feed(pageEv(omitted(10)));
  assert.equal(dispatches(out, "chooseSlot")[0]?.slotKey, key(L2));
  assert.equal(restored.engine.snapshot().mutations, 0);
});

test("F5-1: an omitted terminal and no permitted alternative never means confirmed none", () => {
  const plan = lastPlan();
  plan.dates = ["2099-01-01"];
  const { d, first } = started(plan);
  assert.equal(send(d, first).send, true);
  const out = d.feed(resultEv(res(first.opId, "rejected", { code: "slot-full", slotRefused: true, freshList: page(2, [[E1, true]]) })));
  assert.equal(dispatches(out, "chooseSlot").length, 0);
  assert.equal(d.engine.snapshot().lastObservationState, "SLOTS_AVAILABLE");
});

test("F5-1: remembered terminal applies only to its own store/date group", () => {
  const { d, first } = started();
  assert.equal(send(d, first).send, true);
  const out = d.feed(resultEv(res(first.opId, "rejected", {
    code: "slot-full", slotRefused: true, freshList: page(2, [[E1, true], [B1, true], [L2, true]]),
  })));
  assert.equal(dispatches(out, "chooseSlot")[0]?.slotKey, key(B1));
});

test("F5-1: same start with earlier end cannot replace the refused terminal", () => {
  const shorter: SlotTuple = ["FAKE 门店甲", "2099-01-01", "17:30", "17:45"];
  const { d, first } = started();
  assert.equal(send(d, first).send, true);
  const out = d.feed(resultEv(res(first.opId, "rejected", {
    code: "slot-full", slotRefused: true, freshList: page(2, [[shorter, true], [L2, true]]),
  })));
  assert.equal(dispatches(out, "chooseSlot")[0]?.slotKey, key(L2));
});

test("F5-1 control: a trustworthy later offer in the same group remains eligible", () => {
  const later: SlotTuple = ["FAKE 门店甲", "2099-01-01", "17:45", "18:00"];
  const { d, first } = started();
  assert.equal(send(d, first).send, true);
  const out = d.feed(resultEv(res(first.opId, "rejected", {
    code: "slot-full", slotRefused: true, freshList: page(2, [[E1, true], [later, true], [L2, true]]),
  })));
  assert.equal(dispatches(out, "chooseSlot")[0]?.slotKey, key(later));
});

test("F5-1 control: genuinely reoffered terminal can be considered within existing caps", () => {
  const { d, first } = started();
  assert.equal(send(d, first).send, true);
  d.feed(resultEv(res(first.opId, "rejected", { code: "slot-full", slotRefused: true, freshList: omitted() })));
  d.feed({ type: "control", action: "pause" });
  d.feed({ type: "control", action: "resume" });
  const out = d.feed(pageEv(page(3, [[E1, true], [L1, true], [L2, true]])));
  assert.equal(dispatches(out, "chooseSlot")[0]?.slotKey, key(L1));
});

test("F5-1 control: plan without selector keeps original earlier-slot fallback", () => {
  const d = driver();
  d.feed({ type: "start" });
  const first = dispatches(d.feed(pageEv(page(1, [[L1, true]]))), "chooseSlot")[0];
  assert.equal(send(d, first).send, true);
  const out = d.feed(resultEv(res(first.opId, "rejected", { code: "slot-full", slotRefused: true, freshList: omitted() })));
  assert.equal(dispatches(out, "chooseSlot")[0]?.slotKey, key(E1));
});
