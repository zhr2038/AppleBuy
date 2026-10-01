// A04 / R06: the mock-v0 classifier never infers availability, "none" or success from failed, empty or unknown inputs.
// mock-v0 is an invented offline contract; it is not an Apple page or interface.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyPage, classifyResult } from "../src/observe.ts";
import { S } from "../src/mock/scenarios.ts";
import { err, lookup, page, res, signal, stepPage } from "../src/mock/fake-port.ts";

test("A04: page states are a closed set and only explicit signals mean available or none", () => {
  assert.equal(classifyPage(page(1, [[S.A1, true]])).state, "SLOTS_AVAILABLE");
  const none = classifyPage(page(1, [], { noneSignal: true }));
  assert.equal(none.state, "CONFIRMED_NONE");
  assert.equal((none as { noneBasis?: string }).noneBasis, "none-signal");
  assert.equal((classifyPage(page(1, [[S.A1, false]])) as { noneBasis?: string }).noneBasis, "all-flagged-unavailable");
  assert.deepEqual(classifyPage(page(1, [])), { state: "UNRECOGNIZED_STRUCTURE", detail: "empty-without-none-signal" });
  assert.deepEqual(classifyPage(page(1, [[S.A1, true]], { noneSignal: true })), { state: "UNRECOGNIZED_STRUCTURE", detail: "contradictory-none-signal" });
  assert.deepEqual(classifyPage(err("timeout")), { state: "QUERY_FAILED", reason: "timeout" });
  assert.equal(classifyPage(signal("auth")).state, "AUTH_REQUIRED");
  assert.equal(classifyPage(signal("challenge")).state, "CHALLENGE_OR_THROTTLE");
  assert.equal(classifyPage(stepPage(3, "processing", S.A1)).state, "PROCESSING");
  assert.equal(classifyPage(stepPage(3, "checkout-review", S.A1)).state, "CHECKOUT_REVIEW");
});

test("A04: missing fields, duplicates, foreign contracts and unknown steps are UNRECOGNIZED, never a list", () => {
  const bad: unknown[] = [
    null, "<html>", { contract: "other", kind: "page" }, { contract: "mock-v0", kind: "page", seq: 1, step: "slot-selection" },
    { ...page(1, [[S.A1, true]]), seq: -1 }, { ...page(1, [[S.A1, true]]), step: "mystery" }, { ...page(1, [[S.A1, true]]), context: { productId: "FAKE-P1" } },
  ];
  const missing = page(1, [[S.A1, true]]) as { slots: Record<string, unknown>[] };
  delete missing.slots[0].ref;
  const dup = page(1, [[S.A1, true], [S.A1, true]]);
  const badTime = page(1, [[[S.A1[0], S.A1[1], "25:00", "25:30"], true]]);
  for (const raw of [...bad, missing, dup, badTime]) assert.equal(classifyPage(raw).state, "UNRECOGNIZED_STRUCTURE", JSON.stringify(raw)?.slice(0, 80));
});

test("A04/A07: results are ACCEPTED only with evidence; malformed, transport errors and processing are UNKNOWN", () => {
  assert.equal(classifyResult(res("op-0-1", "accepted")).outcome.state, "ACCEPTED");
  assert.equal(classifyResult({ contract: "mock-v0", kind: "result", opId: "op-0-1", result: "accepted" }).outcome.state, "UNKNOWN", "no evidence");
  const rej = classifyResult(res("op-0-1", "rejected", { code: "slot-full", slotRefused: true, freshList: page(2, [[S.A2, true]]) })).outcome;
  assert.equal(rej.state, "REJECTED");
  assert.ok(rej.state === "REJECTED" && rej.slotRefused && rej.freshList?.state === "SLOTS_AVAILABLE");
  assert.equal(classifyResult(res("op-0-1", "rejected", { code: "Bad Code!" })).outcome.state, "UNKNOWN", "unsafe codes are not trusted");
  assert.equal(classifyResult(res(undefined, "accepted")).opId, null);
  assert.equal(classifyResult(res(undefined, "accepted")).outcome.state, "UNKNOWN");
  for (const e of ["timeout", "network", "status"] as const) assert.equal(classifyResult(err(e, "op-0-1")).outcome.state, "UNKNOWN");
  assert.equal(classifyResult(res("op-0-1", "processing")).outcome.state, "UNKNOWN");
  assert.equal(classifyResult(lookup("op-0-1", "not-found")).outcome.state, "UNKNOWN", "not-found is not proof nothing happened");
  assert.equal(classifyResult(lookup("op-0-1", "confirmed")).outcome.state, "ORDER_CONFIRMED");
  assert.equal(classifyResult("garbage").outcome.state, "UNKNOWN");
});

test("review-1: list fingerprint depends on content, not on opaque refs", () => {
  const a = classifyPage(page(1, [[S.A1, true], [S.A2, false]]));
  const b = classifyPage(page(2, [[S.A1, true], [S.A2, false]], { refPrefix: "zz" }));
  const c = classifyPage(page(3, [[S.A1, true], [S.A2, true]]));
  assert.ok("fingerprint" in a && "fingerprint" in b && "fingerprint" in c);
  assert.equal(a.fingerprint, b.fingerprint);
  assert.notEqual(a.fingerprint, c.fingerprint);
});
