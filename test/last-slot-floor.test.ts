// C-005-R1 implementation tests: the per-store/date terminal floor of the last-slot policy (offline FAKE data only).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import type { Plan } from "../src/plan.ts";
import { loadPlanFile, parseSlotKey } from "../src/plan.ts";
import { reasonZh } from "../src/messages.ts";
import { FAKE_PLAN, SCENARIOS, checkExpectation, key, runScenario } from "../src/mock/scenarios.ts";
import type { SlotTuple } from "../src/mock/fake-port.ts";
import { page, res } from "../src/mock/fake-port.ts";
import { dispatches, driver, pageEv, resultEv, send } from "./helpers.ts";

const E1: SlotTuple = ["FAKE 门店甲", "2099-01-01", "10:00", "10:30"];
const L1: SlotTuple = ["FAKE 门店甲", "2099-01-01", "17:30", "18:00"];
const E2: SlotTuple = ["FAKE 门店甲", "2099-01-02", "10:00", "10:30"];
const L2: SlotTuple = ["FAKE 门店甲", "2099-01-02", "17:00", "17:30"];
const lastPlan = (dates = FAKE_PLAN.dates): Plan => ({ ...structuredClone(FAKE_PLAN), dates: [...dates], slotSelection: "last-offered-per-store-date" });

function started(plan = lastPlan()) {
  const d = driver({ plan });
  d.feed({ type: "start" });
  const first = dispatches(d.feed(pageEv(page(1, [[E1, true], [L1, true], [E2, true], [L2, true]]))), "chooseSlot")[0];
  assert.equal(first?.slotKey, key(L1));
  return { d, first };
}

test("floor: every group's terminal is journaled before the list and decision; never for plans without the selector", () => {
  const { d } = started();
  const types = d.journal.records().map((r) => r.type);
  const terminals = d.journal.records().filter((r) => r.type === "terminal").map((r) => r.slotKey);
  assert.deepEqual(terminals.sort(), [key(L1), key(L2)].sort());
  assert.ok(types.lastIndexOf("terminal") < types.indexOf("list"));
  assert.ok(types.indexOf("list") < types.indexOf("decision"));

  const plain = driver();
  plain.feed({ type: "start" });
  plain.feed(pageEv(page(1, [[E1, true], [L1, true]])));
  assert.equal(plain.journal.records().filter((r) => r.type === "terminal").length, 0);
});

test("floor: an observed-but-never-chosen group's terminal survives restart via its durable record", () => {
  const { d } = started();
  const restored = driver({ plan: d.plan, runId: d.runId, restoreFrom: d.journal.records() });
  restored.feed({ type: "start" });
  // 01-01 floor comes from L1 (chosen); 01-02 floor only from the durable terminal record of L2.
  const out = restored.feed(pageEv(page(10, [[E1, true], [E2, true]])));
  assert.equal(dispatches(out, "chooseSlot").length, 0);
  assert.equal(restored.engine.snapshot().reason, "last-slot-restricted");
});

test("floor: unreadable terminal evidence fails closed into takeover, never an automatic choice", () => {
  const { d } = started();
  const tampered = d.journal.records().map((r) => (r.type === "terminal" ? { ...r, slotKey: "[已屏蔽]" } : r));
  const restored = driver({ plan: d.plan, runId: d.runId, restoreFrom: tampered });
  restored.feed({ type: "start" });
  const out = restored.feed(pageEv(page(10, [[E1, true], [L1, true], [L2, true]])));
  assert.equal(dispatches(out, "chooseSlot").length, 0);
  assert.equal(restored.engine.phase, "TAKEOVER");
  assert.equal(restored.engine.snapshot().reason, "last-slot-evidence-unreadable");
  assert.match(reasonZh("last-slot-evidence-unreadable"), /人工/);
});

test("floor: pause/resume keeps the restriction; an earlier sibling stays excluded after resume", () => {
  const { d, first } = started();
  assert.equal(send(d, first).send, true);
  d.feed(resultEv(res(first.opId, "rejected", { code: "slot-full", slotRefused: true, freshList: page(2, [[E1, true], [E2, true], [L2, true]]) })));
  d.feed({ type: "control", action: "pause" });
  d.feed({ type: "control", action: "resume" });
  const out = d.feed(pageEv(page(3, [[E1, true], [E2, true], [L2, true]])));
  assert.equal(dispatches(out, "chooseSlot")[0]?.slotKey, key(L2));
});

test("diagnostics: last-slot exclusion is explained in Chinese, distinct from confirmed none and no plan match", () => {
  const { d, first } = started(lastPlan(["2099-01-01"]));
  assert.equal(send(d, first).send, true);
  d.feed(resultEv(res(first.opId, "rejected", { code: "slot-full", slotRefused: true, freshList: page(2, [[E1, true]]) })));
  const s = d.engine.snapshot();
  assert.equal(s.phase, "AWAIT_LIST");
  assert.equal(s.reason, "last-slot-restricted");
  assert.equal(d.journal.records().filter((r) => r.type === "decision").at(-1)?.reason, "last-slot-restricted");
  assert.match(reasonZh(s.reason), /最晚时段/);
  assert.match(reasonZh(s.reason), /不等于无货/);
  // Bounded: refreshing ends in EXHAUSTED with the restriction named, never "confirmed none".
  for (let seq = 3; seq < 20 && !d.engine.isTerminal(); seq++) d.feed(pageEv(page(seq, [[E1, true]])));
  assert.equal(d.engine.phase, "EXHAUSTED");
  assert.equal(d.engine.snapshot().reason, "refresh-limit-last-slot-restricted");
  assert.match(reasonZh("refresh-limit-last-slot-restricted"), /不等于无货/);

  const none = driver({ plan: lastPlan() });
  none.feed({ type: "start" });
  none.feed(pageEv(page(1, [[E1, false], [L1, false]])));
  assert.equal(none.engine.snapshot().reason, "confirmed-none");

  const outside = driver({ plan: lastPlan() });
  outside.feed({ type: "start" });
  outside.feed(pageEv(page(1, [[["FAKE 门店甲", "2099-01-01", "12:30", "13:00"], true]])));
  assert.equal(outside.engine.snapshot().reason, "no-eligible-slot");
});

test("parseSlotKey: inverse of the journal key; rejects redacted or malformed evidence", () => {
  assert.deepEqual(parseSlotKey(key(L1)), { store: "FAKE 门店甲", date: "2099-01-01", start: "17:30", end: "18:00" });
  for (const bad of ["[已屏蔽]", "FAKE 门店甲|2099-02-30|10:00-10:30", "FAKE 门店甲|2099-01-01|11:00-10:30", "|2099-01-01|10:00-10:30", 7, undefined]) {
    assert.equal(parseSlotKey(bad), null, String(bad));
  }
});

test("CLI scenario with the explicit fake plan file: omitted terminals advance date by date to the endpoint", async () => {
  const def = SCENARIOS.find((s) => s.id === "last-slot-omitted-terminals");
  assert.ok(def);
  const { plan, problems } = loadPlanFile(resolve(import.meta.dirname, "..", "examples", "plan.last-slot.fake.json"));
  assert.ok(plan, problems.join(";"));
  const run = await runScenario(def, { plan });
  assert.deepEqual(checkExpectation(run), []);
  assert.equal(run.port.staleRefActions, 0);
  assert.ok(run.port.maxConcurrent <= 1);
  const chosen = run.result.dispatched.filter((x) => x.kind === "chooseSlot").map((x) => x.slotKey);
  assert.ok(chosen.every((k) => !String(k).includes("|10:00-")), "never an earlier sibling");
  assert.equal(run.result.dispatched.filter((x) => x.kind === "submitOrder").length, 0);
});
