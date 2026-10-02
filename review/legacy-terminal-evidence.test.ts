// Codex follow-up after actual C-005-R1 delivery: historical last-slot journals lacked terminal facts.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Plan } from "../src/plan.ts";
import { MemoryJournal } from "../src/journal.ts";
import { FAKE_PLAN, key } from "../src/mock/scenarios.ts";
import type { SlotTuple } from "../src/mock/fake-port.ts";
import { page } from "../src/mock/fake-port.ts";
import { dispatches, driver, pageEv, send } from "../test/helpers.ts";

const E1: SlotTuple = ["FAKE 门店甲", "2099-01-01", "10:00", "10:30"];
const L1: SlotTuple = ["FAKE 门店甲", "2099-01-01", "17:30", "18:00"];
const E2: SlotTuple = ["FAKE 门店甲", "2099-01-02", "10:00", "10:30"];
const L2: SlotTuple = ["FAKE 门店甲", "2099-01-02", "17:00", "17:30"];
const lastPlan = (): Plan => ({ ...structuredClone(FAKE_PLAN), slotSelection: "last-offered-per-store-date" });
function legacyHistory(d: ReturnType<typeof driver>) {
  // Re-chain the exact allowlisted primary records present in the original 58-file candidate.
  // Old list records established offers but omitted their fields; absence is missing evidence, not permission.
  const legacy = new MemoryJournal();
  for (const record of d.journal.records()) {
    if (record.type === "terminal") continue;
    const { i, h, prev, type, ...fields } = record;
    legacy.append(type, fields);
  }
  return legacy.records();
}

test("F5-2: legacy last-slot history cannot authorize an earlier slot in an unchosen group", () => {
  const d = driver({ plan: lastPlan() });
  d.feed({ type: "start" });
  d.feed(pageEv(page(1, [[E1, true], [L1, true], [E2, true], [L2, true]])));
  const restored = driver({ plan: d.plan, runId: d.runId, restoreFrom: legacyHistory(d) });
  restored.feed({ type: "start" });
  const out = restored.feed(pageEv(page(10, [[E1, true], [E2, true]])));
  assert.equal(dispatches(out, "chooseSlot").some(c => c.slotKey === key(E2)), false,
    "an old list proved day-two offers existed; only remembering the day-one intent cannot approve day-two 10:00");
});

test("F5-2: reconciling a legacy unknown choice does not erase missing other-date restriction evidence", () => {
  const d = driver({ plan: lastPlan() });
  d.feed({ type: "start" });
  const first = dispatches(d.feed(pageEv(page(1, [[E1, true], [L1, true], [E2, true], [L2, true]]))), "chooseSlot")[0];
  assert.equal(send(d, first).send, true);
  const restored = driver({ plan: d.plan, runId: d.runId, restoreFrom: legacyHistory(d) });
  assert.equal(dispatches(restored.feed({ type: "start" })).length, 0);
  const out = restored.feed(pageEv(page(10, [[E1, true], [E2, true]], { lastSelection: { slot: L1, status: "rejected" } })));
  assert.equal(dispatches(out, "chooseSlot").some(c => c.slotKey === key(E2)), false);
});

test("F5-2 control: existing plans without the selector can still recover original behavior", () => {
  const d = driver();
  d.feed({ type: "start" });
  d.feed(pageEv(page(1, [[E1, true], [L1, true], [E2, true], [L2, true]])));
  const restored = driver({ plan: d.plan, runId: d.runId, restoreFrom: legacyHistory(d) });
  restored.feed({ type: "start" });
  assert.equal(dispatches(restored.feed(pageEv(page(10, [[E1, true], [E2, true]]))), "chooseSlot")[0]?.slotKey, key(E1));
});
