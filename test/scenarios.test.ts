// Executable scenario coverage (A01-A05, A07, A09, A10, A12) through the real runner and scripted fake port.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SCENARIOS, S, checkExpectation, key, runScenario } from "../src/mock/scenarios.ts";

for (const def of SCENARIOS) {
  test(`scenario ${def.id} [${def.covers.join(",")}] meets its declared terminal truth`, async () => {
    const run = await runScenario(def);
    assert.deepEqual(checkExpectation(run), []);
    assert.equal(run.port.remainingSteps, 0, "every scripted reply consumed (no skipped path)");
  });
}

const byId = (id: string) => {
  const d = SCENARIOS.find((s) => s.id === id);
  assert.ok(d, id);
  return d;
};

test("A02 flagship: first refusal, fresh generation and refs, different authorized slot, endpoint", async () => {
  const run = await runScenario(byId("refuse-then-accept"));
  const recs = run.journal.records();
  const intents = recs.filter((r) => r.type === "intent" && r.kind === "chooseSlot");
  assert.equal(intents.length, 2);
  assert.equal(recs.filter((r) => r.type === "refusal").length, 1);
  const lists = recs.filter((r) => r.type === "list");
  const l1 = lists.find((l) => l.seq === intents[0].listSeq);
  const l2 = lists.find((l) => l.seq === intents[1].listSeq);
  assert.ok(l1 && l2);
  assert.ok(Number(l2.seq) > Number(l1.seq));
  assert.notEqual(l2.gen, l1.gen);
  assert.notEqual(l2.refTag, l1.refTag);
  const refs = run.result.dispatched.filter((d) => d.kind === "chooseSlot").map((d) => d.ref);
  assert.deepEqual(refs, ["r1-4", "r2-5"]);
  assert.equal(run.port.staleRefActions, 0);
  assert.equal(run.port.contexts.size, 1);
  assert.equal(run.result.phase, "REHEARSAL_ENDPOINT");
  assert.equal(run.port.count("submitOrder"), 0);
  // T1, T2 and T3 were each measured once on this path
  assert.deepEqual(run.result.timings.map((t) => t.metric), ["T1", "T2", "T3"]);
  assert.equal(run.result.timings[1].viaRefresh, true);
});

test("review-1: identical normalized content with replaced opaque refs uses only the newest refs", async () => {
  const run = await runScenario(byId("redraw-new-refs"));
  const chosen = run.result.dispatched.filter((d) => d.kind === "chooseSlot");
  assert.equal(chosen[0].ref, "r1-0");
  assert.equal(chosen[1].ref, "redraw2-1", "second click must use the redraw's ref, not r1-1");
  assert.equal(chosen[1].slotKey, key(S.A2), "refused A1 is not retried in the same generation even though still shown selectable");
  assert.equal(run.port.staleRefActions, 0);
});

test("review-2: a new list during an in-flight mutation neither discards its result nor starts another mutation", async () => {
  const run = await runScenario(byId("pending-result-preserved"));
  assert.equal(run.port.count("chooseSlot"), 1);
  assert.equal(run.port.count("advance"), 1);
  assert.equal(run.engine.snapshot().acceptedSlot, key(S.A1));
  assert.equal(run.journal.records().filter((r) => r.type === "refusal").length, 0);
});

test("A03: refusal limit and stale-list guard terminate without walking a stale list", async () => {
  const ex = await runScenario(byId("multi-refusal-exhaust"));
  assert.equal(ex.result.phase, "EXHAUSTED");
  assert.equal(ex.port.count("chooseSlot"), 3);
  const st = await runScenario(byId("stale-list"));
  assert.equal(st.result.reason, "LIST_STALE_SUSPECTED");
  assert.equal(st.port.count("chooseSlot"), 2, "B1 is never tried from the unchanged stale list");
  assert.equal(st.port.count("observe"), 2, "exactly one bounded refresh after the stale suspicion");
});

test("A04: failed, empty-without-signal, missing-field and unknown structures never claim availability, none or success", async () => {
  for (const id of ["query-failed", "empty-without-signal", "missing-field", "unknown-structure"]) {
    const run = await runScenario(byId(id));
    assert.equal(run.result.phase, "TAKEOVER", id);
    assert.equal(run.port.count("chooseSlot"), 0, id);
    assert.ok(!run.journal.records().some((r) => r.state === "CONFIRMED_NONE" || r.state === "SLOTS_AVAILABLE"), id);
  }
  const none = await runScenario(byId("confirmed-none"));
  assert.ok(none.journal.records().some((r) => r.type === "list" && r.state === "CONFIRMED_NONE"), "explicit none is recognized as valid none");
  assert.equal(none.result.reason, "refresh-limit-confirmed-none");
});

test("A05: duplicate/old observations and late/duplicate results are ignored without a second mutation", async () => {
  const run = await runScenario(byId("out-of-order-duplicates"));
  const ignored = run.journal.records().filter((r) => r.type === "ignored").map((r) => r.reason);
  assert.equal(ignored.filter((x) => x === "stale-or-duplicate-observation").length, 2);
  assert.equal(ignored.filter((x) => x === "late-or-duplicate-result").length, 3);
  assert.equal(run.port.count("chooseSlot"), 1);
  assert.equal(run.port.count("advance"), 1);
});

test("A07: unknown select outcome is reconciled read-only and never resent", async () => {
  for (const id of ["select-timeout-reconciled", "select-timeout-manual"]) {
    const run = await runScenario(byId(id));
    assert.equal(run.port.count("chooseSlot"), 1, id);
  }
  const rj = await runScenario(byId("select-timeout-page-rejected"));
  assert.deepEqual(rj.result.dispatched.filter((d) => d.kind === "chooseSlot").map((d) => d.ref), ["r1-0", "r2-1"]);
});

test("A09: pause/takeover stop new actions and preserve the truth of the sent action", async () => {
  const paused = await runScenario(byId("pause-inflight"));
  assert.equal(paused.result.phase, "PAUSED");
  assert.equal(paused.engine.snapshot().acceptedSlot, key(S.A1), "accepted result recorded while paused");
  assert.equal(paused.port.count("advance"), 0, "no new action after pause");
  const tk = await runScenario(byId("takeover-unknown"));
  const snap = tk.engine.snapshot();
  assert.equal(snap.phase, "TAKEOVER");
  assert.equal(snap.pendingOp?.status, "UNKNOWN", "timed-out op stays unknown, not cancelled or failed");
  assert.equal(tk.port.count("observe"), 1, "no reconcile traffic under takeover");
});

test("A10: challenge, throttle and expired login yield with clear reasons", async () => {
  assert.equal((await runScenario(byId("challenge"))).result.reason, "challenge-detected");
  const th = await runScenario(byId("throttle"));
  assert.equal(th.result.reason, "throttle-op-unknown");
  assert.equal(th.engine.snapshot().pendingOp?.status, "UNKNOWN");
  assert.equal((await runScenario(byId("auth-expired"))).result.reason, "auth-required");
});
