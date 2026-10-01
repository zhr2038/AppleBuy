// A07 / A13 / review-3: durable journal, restart reconciliation, corruption refusal, ledger, sanitization.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createMockFormalCapability } from "../src/engine.ts";
import { FileJournal, FileLedger, readJournal, sanitizeFields, REDACTED } from "../src/journal.ts";
import { FAKE_PLAN, S, SCENARIOS, key, runScenario } from "../src/mock/scenarios.ts";
import { lookup, page, res, stepPage } from "../src/mock/fake-port.ts";
import { planHash } from "../src/plan.ts";
import { formatRecord } from "../src/messages.ts";
import { dispatches, driver, join, pageEv, resultEv, send, tempDir } from "./helpers.ts";

const PH = planHash(FAKE_PLAN);

function restore(path: string, ledger: FileLedger, o: { capability?: ReturnType<typeof createMockFormalCapability> } = {}) {
  const read = readJournal(path, PH);
  assert.ok(read.ok, `journal readable: ${JSON.stringify(read)}`);
  return driver({ journal: new FileJournal(path, read.records), ledger, restoreFrom: read.records, capability: o.capability });
}

test("A07: crash after a durable select intent restarts as UNKNOWN and reconciles read-only, never resending", () => {
  const { dir, cleanup } = tempDir("restart-select");
  try {
    const path = join(dir, "journal.jsonl");
    const ledger = new FileLedger(dir);
    const a = driver({ journal: new FileJournal(path), ledger });
    a.feed({ type: "start" });
    a.feed(pageEv(page(1, [[S.A1, true], [S.A2, true]])));
    assert.equal(dispatches(a.cmds).length, 1);
    assert.equal(send(a, dispatches(a.cmds)[0]).send, true);
    // crash: process dies after the "sent" record was fsynced (the click may or may not have reached the server)
    const b = restore(path, ledger);
    const first = b.feed({ type: "start" });
    assert.deepEqual(first.map((c) => c.type), ["observe"]);
    assert.equal(b.engine.phase, "RECONCILING");
    assert.equal(b.engine.snapshot().pendingOp?.status, "UNKNOWN");
    b.feed(pageEv(page(1, [[S.A1, true], [S.A2, true]])));
    b.feed(pageEv(page(2, [[S.A1, true], [S.A2, true]])));
    assert.equal(b.engine.phase, "MANUAL_VERIFICATION");
    assert.equal(dispatches(b.cmds).length, 0, "no mutation of any kind after restart");
    // a later restart of the same run stays in manual verification
    const c = restore(path, ledger);
    c.feed({ type: "start" });
    assert.equal(c.engine.phase, "MANUAL_VERIFICATION");
    assert.equal(dispatches(c.cmds).length, 0);
  } finally {
    cleanup();
  }
});

test("A07: restart reconciles an unknown select to accepted from page evidence, then continues", () => {
  const { dir, cleanup } = tempDir("restart-accept");
  try {
    const path = join(dir, "journal.jsonl");
    const ledger = new FileLedger(dir);
    const a = driver({ journal: new FileJournal(path), ledger });
    a.feed({ type: "start" });
    a.feed(pageEv(page(1, [[S.A1, true]])));
    send(a, dispatches(a.cmds)[0]);
    const b = restore(path, ledger);
    b.feed({ type: "start" });
    b.feed(pageEv(stepPage(1, "checkout-review", S.A1)));
    assert.deepEqual(dispatches(b.cmds).map((d) => d.kind), ["advance"]);
    assert.match(dispatches(b.cmds)[0].opId, /^op-1-/, "new epoch after restart");
  } finally {
    cleanup();
  }
});

test("A07: refusal memory survives restart; the refused slot is suppressed in the first post-restart list", () => {
  const { dir, cleanup } = tempDir("restart-refusal");
  try {
    const path = join(dir, "journal.jsonl");
    const ledger = new FileLedger(dir);
    const a = driver({ journal: new FileJournal(path), ledger });
    a.feed({ type: "start" });
    a.feed(pageEv(page(1, [[S.A1, true], [S.A2, true]])));
    a.feed(resultEv(res(dispatches(a.cmds)[0].opId, "rejected", { code: "slot-full", slotRefused: true })));
    const b = restore(path, ledger);
    b.feed({ type: "start" });
    b.feed(pageEv(page(1, [[S.A1, true], [S.A2, true]])));
    assert.equal(dispatches(b.cmds)[0]?.slotKey, "FAKE 门店甲|2099-01-01|10:30-11:00");
  } finally {
    cleanup();
  }
});

function driveToSubmit(path: string, ledger: FileLedger, runId: string) {
  const cap = createMockFormalCapability(PH, runId, 1e9);
  const a = driver({ journal: new FileJournal(path), ledger, capability: cap, runId });
  a.feed({ type: "start" });
  a.feed(pageEv(page(1, [[S.A1, true]])));
  a.feed(resultEv(res(dispatches(a.cmds, "chooseSlot")[0].opId, "accepted")));
  a.feed(resultEv(res(dispatches(a.cmds, "advance")[0].opId, "accepted")));
  a.feed(pageEv(stepPage(2, "pre-payment", S.A1)));
  assert.equal(dispatches(a.cmds, "submitOrder").length, 1);
  assert.equal(ledger.find(PH), null, "a merely prepared submit has not consumed the plan yet");
  assert.equal(send(a, dispatches(a.cmds, "submitOrder")[0]).send, true);
  return a;
}

test("A07: crash after a prepared intent but before the durable send record: port never called, nothing unknown, re-decides", () => {
  const { dir, cleanup } = tempDir("restart-unsent");
  try {
    const path = join(dir, "journal.jsonl");
    const ledger = new FileLedger(dir);
    const a = driver({ journal: new FileJournal(path), ledger });
    a.feed({ type: "start" });
    a.feed(pageEv(page(1, [[S.A1, true], [S.A2, true]])));
    assert.equal(dispatches(a.cmds).length, 1, "prepared only; the runner would call authorize() before the port");
    const b = restore(path, ledger);
    b.feed({ type: "start" });
    assert.equal(b.engine.snapshot().pendingOp, null);
    assert.ok(b.journal.records().some((r) => r.type === "cancelled" && r.reason === "prepared-not-sent-before-restart"));
    b.feed(pageEv(page(2, [[S.A1, true], [S.A2, true]])));
    const d = dispatches(b.cmds);
    assert.equal(d.length, 1);
    assert.equal(d[0].slotKey, key(S.A1), "the never-sent first choice is still the best authorized slot, with a fresh ref");
    assert.equal(d[0].ref, "r2-0");
  } finally {
    cleanup();
  }
});

test("A09/A07: a pause in force before a crash stays in force after restart (restart is not resume)", () => {
  const { dir, cleanup } = tempDir("restart-paused");
  try {
    const path = join(dir, "journal.jsonl");
    const ledger = new FileLedger(dir);
    const a = driver({ journal: new FileJournal(path), ledger });
    a.feed({ type: "start" });
    a.feed({ type: "control", action: "pause" });
    const b = restore(path, ledger);
    assert.deepEqual(b.feed({ type: "start" }), []);
    assert.equal(b.engine.phase, "PAUSED");
    b.feed(pageEv(page(1, [[S.A1, true]])));
    assert.equal(dispatches(b.cmds).length, 0);
    assert.deepEqual(b.feed({ type: "control", action: "resume" }).map((c) => c.type), ["observe"]);
  } finally {
    cleanup();
  }
});

test("A07/A12: crash between the ledger write and the send record still blocks the plan (conservative)", () => {
  const { dir, cleanup } = tempDir("restart-ledger-unsent");
  try {
    const path = join(dir, "journal.jsonl");
    const ledger = new FileLedger(dir);
    driveToSubmit(path, ledger, "run-test");
    // simulate losing the trailing "sent" record: rebuild the journal without it
    const recs = readJournal(path, PH);
    assert.ok(recs.ok);
    const cut = recs.records.findIndex((r) => r.type === "sent" && r.kind === "submitOrder");
    assert.ok(cut > 0);
    const p2 = join(dir, "cut.jsonl");
    writeFileSync(p2, recs.records.slice(0, cut).map((r) => JSON.stringify(r)).join("\n") + "\n");
    const b = restore(p2, ledger, { capability: createMockFormalCapability(PH, "run-test", 1e9) });
    assert.deepEqual(b.feed({ type: "start" }), []);
    assert.equal(b.engine.phase, "BLOCKED");
    assert.equal(b.engine.snapshot().reason, "ledger-plan-consumed");
  } finally {
    cleanup();
  }
});

test("A07/A12: after an unknown final submit, neither restart nor a brand-new run can submit again", () => {
  const { dir, cleanup } = tempDir("restart-submit");
  try {
    const path = join(dir, "journal.jsonl");
    const ledger = new FileLedger(dir);
    driveToSubmit(path, ledger, "run-first");
    assert.equal(ledger.find(PH)?.status, "submit-intent", "ledger written before dispatch");
    // crash, then restart the same run with a fresh (fake) capability: only read-only lookups happen
    const b = restore(path, ledger, { capability: createMockFormalCapability(PH, "run-test", 1e9) });
    assert.deepEqual(b.feed({ type: "start" }).map((c) => c.type), ["lookupOrder"]);
    const opId = b.engine.snapshot().pendingOp?.opId as string;
    b.feed(resultEv(lookup(opId, "not-found")));
    b.feed(resultEv(lookup(opId, "unknown")));
    assert.equal(b.engine.phase, "MANUAL_VERIFICATION");
    assert.equal(dispatches(b.cmds).length, 0);
    // brand-new run, new journal, valid capability, same plan: blocked by the purchase ledger
    const fresh = driver({ journal: new FileJournal(join(dir, "other.jsonl")), ledger, capability: createMockFormalCapability(PH, "run-test", 1e9) });
    assert.deepEqual(fresh.feed({ type: "start" }), []);
    assert.equal(fresh.engine.phase, "BLOCKED");
    assert.equal(fresh.engine.snapshot().reason, "ledger-plan-consumed");
    // a late confirmation after manual verification is recorded as truth, still no new action
    const c = restore(path, ledger);
    c.feed({ type: "start" });
    c.feed(resultEv(lookup(opId, "confirmed")));
    assert.equal(c.engine.phase, "ORDER_CONFIRMED_MOCK");
    assert.equal(dispatches(c.cmds).length, 0);
  } finally {
    cleanup();
  }
});

test("review-3: truncated, corrupted, foreign-plan and empty journals are refused", () => {
  const { dir, cleanup } = tempDir("corrupt");
  try {
    const path = join(dir, "journal.jsonl");
    const a = driver({ journal: new FileJournal(path) });
    a.feed({ type: "start" });
    a.feed(pageEv(page(1, [[S.A1, true]])));
    const good = readFileSync(path, "utf8");
    assert.ok(readJournal(path, PH).ok);
    const p2 = join(dir, "t.jsonl");
    writeFileSync(p2, good.slice(0, -10));
    assert.equal((readJournal(p2, PH) as any).error, "truncated");
    writeFileSync(p2, good.replace("FAKE 门店甲|2099-01-01|10:00-10:30", "FAKE 门店乙|2099-01-01|10:00-10:30"));
    assert.equal((readJournal(p2, PH) as any).error, "hash-chain");
    const lines = good.trimEnd().split("\n");
    writeFileSync(p2, `${[lines[0], lines[2]].join("\n")}\n`);
    assert.equal((readJournal(p2, PH) as any).error, "hash-chain", "deleted record detected");
    writeFileSync(p2, `${lines[0]}\n{not json\n`);
    assert.equal((readJournal(p2, PH) as any).error, "corrupt-json");
    assert.equal((readJournal(path, "0123456789abcdef") as any).error, "plan-mismatch");
    writeFileSync(p2, "");
    assert.equal((readJournal(p2, PH) as any).error, "empty");
    assert.equal((readJournal(join(dir, "missing.jsonl"), PH) as any).error, "missing");
  } finally {
    cleanup();
  }
});

test("A13: journal fields are allowlisted; secrets in payloads never reach the journal or Chinese output", async () => {
  assert.throws(() => sanitizeFields({ cookie: "x" }), /not allowlisted/);
  assert.equal(sanitizeFields({ reason: "someone@example.com" }).reason, REDACTED);
  assert.equal(sanitizeFields({ code: "13800138000" }).code, REDACTED);
  assert.equal(sanitizeFields({ reason: "https://x/?token=abc" }).reason, REDACTED);
  const secrets = ["SECRET-COOKIE-VALUE", "someone@example.com", "13800138000", "6222020200001234567", "Bearer abc"];
  const d = driver();
  d.feed({ type: "start" });
  const p = page(1, [[S.A1, true]]) as any;
  p.cookie = secrets[0];
  p.customer = { email: secrets[1], phone: secrets[2], card: secrets[3], auth: secrets[4] };
  p.slots[0].note = secrets[1];
  d.feed(pageEv(p));
  d.feed(resultEv(res(dispatches(d.cmds)[0].opId, "rejected", { code: "13800138000", slotRefused: true, card: secrets[3] })));
  d.feed(pageEv({ ...stepPage(2, "checkout-review", ["someone@example.com 13800138000", "2099-01-01", "10:00", "10:30"]) }));
  const runs = await Promise.all(SCENARIOS.map((s) => runScenario(s)));
  const all = [...d.journal.records(), ...runs.flatMap((r) => r.journal.records())];
  const text = JSON.stringify(all) + all.map((r) => formatRecord(r) ?? "").join("\n");
  for (const s of secrets) assert.ok(!text.includes(s), `secret leaked: ${s}`);
  assert.ok(text.includes(REDACTED), "unsafe values are visibly redacted");
});
