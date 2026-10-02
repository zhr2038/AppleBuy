// C-005-R2 implementation tests: completeness of durable last-slot terminal history (offline FAKE data only).
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Plan } from "../src/plan.ts";
import { planHash } from "../src/plan.ts";
import { createMockFormalCapability } from "../src/engine.ts";
import type { JournalRecord } from "../src/journal.ts";
import { MemoryJournal } from "../src/journal.ts";
import { reasonZh } from "../src/messages.ts";
import { FAKE_PLAN, LAST_SLOT_FAKE_PLAN, key } from "../src/mock/scenarios.ts";
import type { SlotTuple } from "../src/mock/fake-port.ts";
import { lookup, page, res, stepPage } from "../src/mock/fake-port.ts";
import { dispatches, driver, pageEv, resultEv, send } from "./helpers.ts";

const E1: SlotTuple = ["FAKE 门店甲", "2099-01-01", "10:00", "10:30"];
const L1: SlotTuple = ["FAKE 门店甲", "2099-01-01", "17:30", "18:00"];
const E2: SlotTuple = ["FAKE 门店甲", "2099-01-02", "10:00", "10:30"];
const L2: SlotTuple = ["FAKE 门店甲", "2099-01-02", "17:00", "17:30"];
const E3: SlotTuple = ["FAKE 门店甲", "2099-01-03", "10:00", "10:30"];
const L3: SlotTuple = ["FAKE 门店甲", "2099-01-03", "16:30", "17:00"];
const INCOMPLETE = "last-slot-history-incomplete";
const lastPlan = (): Plan => ({ ...structuredClone(FAKE_PLAN), slotSelection: "last-offered-per-store-date" });
const four = (seq: number) => page(seq, [[E1, true], [L1, true], [E2, true], [L2, true]]);

/** The original C-005 format: no "terminal" records and no `groups` commit count on list records. */
function originalFormat(records: JournalRecord[]): JournalRecord[] {
  const legacy = new MemoryJournal();
  for (const record of records) {
    if (record.type === "terminal") continue;
    const { i, h, prev, type, groups, ...fields } = record;
    legacy.append(type, fields);
  }
  return legacy.records();
}
function restore(d: ReturnType<typeof driver>, records: JournalRecord[]) {
  const r = driver({ plan: d.plan, runId: d.runId, ledger: d.ledger, restoreFrom: records });
  return { r, out: r.feed({ type: "start" }) };
}

test("new history: three-date path survives a restart after every durable refusal and stays automatic", () => {
  const offers = (...removed: SlotTuple[]) => page(0, [[E1, true], [L1, true], [E2, true], [L2, true], [E3, true], [L3, true]].filter(([t]) => !removed.includes(t as SlotTuple)) as [SlotTuple, boolean][]);
  const withSeq = (raw: Record<string, unknown>, seq: number) => ({ ...raw, seq });
  let history: JournalRecord[] = [];
  let d = driver({ plan: LAST_SLOT_FAKE_PLAN });
  d.feed({ type: "start" });
  let choice = dispatches(d.feed(pageEv(withSeq(offers(), 1))), "chooseSlot")[0];
  const expected = [key(L1), key(L2), key(L3)];
  for (let step = 0; step < 2; step++) {
    assert.equal(choice?.slotKey, expected[step]);
    assert.equal(send(d, choice).send, true);
    d.feed(resultEv(res(choice.opId, "rejected", { code: "slot-full", slotRefused: true })));
    history = [...history, ...d.journal.records()];
    const restored = restore(d, history);
    d = restored.r;
    assert.equal(d.engine.phase, "AWAIT_LIST", "complete new history is never forced to manual handling");
    const removed = step === 0 ? [L1] : [L1, L2];
    choice = dispatches(d.feed(pageEv(withSeq(offers(...removed), 10 * (step + 1)))), "chooseSlot")[0];
  }
  assert.equal(choice?.slotKey, key(L3));
  assert.equal(send(d, choice).send, true);
  const advance = dispatches(d.feed(resultEv(res(choice.opId, "accepted"))), "advance")[0];
  assert.equal(send(d, advance).send, true);
  d.feed(resultEv(res(advance.opId, "accepted")));
  d.feed(pageEv(stepPage(99, "pre-payment", L3)));
  assert.equal(d.engine.phase, "REHEARSAL_ENDPOINT");
});

test("partial crash inside a terminal batch fails closed; a committed batch does not", () => {
  const d = driver({ plan: lastPlan() });
  d.feed({ type: "start" });
  d.feed(pageEv(four(1)));
  const recs = d.journal.records();
  const firstTerminal = recs.findIndex((r) => r.type === "terminal");
  const list = recs.findIndex((r) => r.type === "list");
  assert.equal(recs[list].groups, 2);
  for (const cut of [firstTerminal + 1, list]) {
    const { r, out } = restore(d, recs.slice(0, cut));
    assert.equal(dispatches(out).length, 0);
    assert.equal(r.engine.phase, "TAKEOVER", `cut ${cut}`);
    assert.equal(r.engine.snapshot().reason, INCOMPLETE);
    assert.equal(dispatches(r.feed(pageEv(page(10, [[E1, true], [E2, true]])))).length, 0);
  }
  const { r } = restore(d, recs.slice(0, list + 1));
  assert.equal(dispatches(r.feed(pageEv(page(10, [[E1, true], [L1, true], [E2, true]]))), "chooseSlot")[0]?.slotKey, key(L1));
});

test("incompleteness persists across later complete batches and restarts; evidence is not rewritten", () => {
  const d = driver({ plan: lastPlan() });
  d.feed({ type: "start" });
  d.feed(pageEv(four(1)));
  const truncated = d.journal.records().slice(0, d.journal.records().findIndex((r) => r.type === "terminal") + 1);
  const snapshot = JSON.stringify(truncated);
  const { r } = restore(d, truncated);
  r.feed({ type: "control", action: "resume" }); // the user resumes from takeover; a new complete batch is written
  assert.equal(dispatches(r.feed(pageEv(four(10)))).length, 0);
  assert.equal(r.engine.snapshot().reason, INCOMPLETE);
  const again = restore(d, [...truncated, ...r.journal.records()]).r;
  assert.equal(again.engine.snapshot().reason, "restored-TAKEOVER"); // a restart is not a resume
  again.feed({ type: "control", action: "resume" });
  assert.equal(dispatches(again.feed(pageEv(four(20)))).length, 0);
  assert.equal(again.engine.snapshot().reason, INCOMPLETE);
  assert.equal(JSON.stringify(truncated), snapshot);
});

test("original-format history: offers without terminal facts block; a list without offers established nothing", () => {
  const d = driver({ plan: lastPlan() });
  d.feed({ type: "start" });
  d.feed(pageEv(four(1)));
  assert.equal(restore(d, originalFormat(d.journal.records())).r.engine.snapshot().reason, INCOMPLETE);

  const none = driver({ plan: lastPlan() });
  none.feed({ type: "start" });
  none.feed(pageEv(page(1, [], { noneSignal: true })));
  const { r, out } = restore(none, originalFormat(none.journal.records()));
  assert.equal(r.engine.phase, "AWAIT_LIST");
  assert.equal(out[0]?.type, "observe");
  assert.equal(dispatches(r.feed(pageEv(four(10))), "chooseSlot")[0]?.slotKey, key(L1));
});

test("legacy unknown choice reconciled as accepted keeps that truth but continues nothing automatically", () => {
  const d = driver({ plan: lastPlan() });
  d.feed({ type: "start" });
  const first = dispatches(d.feed(pageEv(four(1))), "chooseSlot")[0];
  assert.equal(send(d, first).send, true);
  const { r, out } = restore(d, originalFormat(d.journal.records()));
  assert.equal(r.engine.phase, "RECONCILING");
  assert.equal(out[0]?.type, "observe");
  const after = r.feed(pageEv(stepPage(10, "checkout-review", L1)));
  assert.equal(dispatches(after).length, 0);
  const s = r.engine.snapshot();
  assert.equal(s.acceptedSlot, key(L1));
  assert.equal(s.phase, "TAKEOVER");
  assert.equal(s.reason, INCOMPLETE);
  assert.equal(s.mutations, 1);
});

test("legacy unknown final submit is looked up read-only first and a confirmed order is honored; never resubmitted", () => {
  const plan = lastPlan();
  const capability = createMockFormalCapability(planHash(plan), "run-test", 1e12);
  const d = driver({ plan, capability });
  d.feed({ type: "start" });
  const choose = dispatches(d.feed(pageEv(four(1))), "chooseSlot")[0];
  assert.equal(send(d, choose).send, true);
  const advance = dispatches(d.feed(resultEv(res(choose.opId, "accepted"))), "advance")[0];
  assert.equal(send(d, advance).send, true);
  d.feed(resultEv(res(advance.opId, "accepted")));
  const submit = dispatches(d.feed(pageEv(stepPage(2, "pre-payment", L1))), "submitOrder")[0];
  assert.ok(submit);
  assert.equal(send(d, submit).send, true);
  const { r, out } = restore(d, originalFormat(d.journal.records()));
  assert.deepEqual(out.map((c) => c.type), ["lookupOrder"]);
  assert.equal(r.engine.phase, "RECONCILING");
  r.feed(resultEv(lookup(submit.opId, "confirmed")));
  assert.equal(r.engine.phase, "ORDER_CONFIRMED_MOCK");
  assert.equal(dispatches(r.cmds).length, 0);
  assert.ok(d.ledger.find(d.ph), "the plan stays consumed by its original submit");
});

test("plans without the selector journal no terminal facts or commit count", () => {
  const d = driver();
  d.feed({ type: "start" });
  d.feed(pageEv(four(1)));
  const recs = d.journal.records();
  assert.equal(recs.filter((r) => r.type === "terminal").length, 0);
  assert.equal(recs.find((r) => r.type === "list")?.groups, undefined);
});

test("diagnostic: incomplete history is explained in bounded Chinese without claiming no stock or success", () => {
  const text = reasonZh(INCOMPLETE);
  assert.match(text, /最晚时段/);
  assert.match(text, /不重发/);
  assert.ok(text.length < 160);
});
