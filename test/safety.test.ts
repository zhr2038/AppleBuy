// A11 / A12 / R09: rehearsal can never reach a real network or real purchase. Network checks use spies only:
// every transport is replaced by a counting stub BEFORE the guard is installed, so no test can connect anywhere.
import { test } from "node:test";
import assert from "node:assert/strict";
import dns from "node:dns";
import net from "node:net";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { installNetworkGuard, isLoopbackHost, socketTarget } from "../src/netguard.ts";
import { RealActionBlockedError, RealApplePortBlocked } from "../src/real-blocked.ts";
import { Engine, createMockFormalCapability } from "../src/engine.ts";
import { MemoryJournal, MemoryLedger } from "../src/journal.ts";
import { planHash } from "../src/plan.ts";
import { FAKE_PLAN, S } from "../src/mock/scenarios.ts";
import { page, res, stepPage } from "../src/mock/fake-port.ts";
import { VirtualClock, runEngine } from "../src/runner.ts";
import type { CheckoutPort } from "../src/runner.ts";
import { TEST_RUNS_ROOT, dispatches, driver, isInsideTestRuns, pageEv, resultEv, send, tempDir } from "./helpers.ts";

test("test cleanup: recursive deletion is only allowed strictly inside .local/test-runs", () => {
  assert.ok(isInsideTestRuns(join(TEST_RUNS_ROOT, "x-1")));
  for (const bad of [TEST_RUNS_ROOT, join(TEST_RUNS_ROOT, ".."), join(TEST_RUNS_ROOT, "..", "runs"), resolve(TEST_RUNS_ROOT, "..", "..", "src"), "C:\\", "Z:\\elsewhere"]) {
    assert.ok(!isInsideTestRuns(bad), bad);
  }
  assert.throws(() => tempDir("../escape"), /unsafe temp dir name/);
  const { dir, cleanup } = tempDir("cleanup-check");
  assert.ok(isInsideTestRuns(dir));
  cleanup();
});

test("R01/A06: the engine binds a frozen copy of the reviewed plan", () => {
  const plan = structuredClone(FAKE_PLAN);
  const d = driver({ plan });
  plan.maxTotalCny = 1e9;
  plan.stores.push({ label: "FAKE 未授权门店", role: "backup" });
  d.feed({ type: "start" });
  d.feed(pageEv(page(1, [[S.X_STORE, true]], { context: { productId: "FAKE-P1", quantity: 1, totalCny: 8888, fulfillment: "pickup" } })));
  assert.equal(dispatches(d.cmds).length, 0);
});

const SRC = resolve(import.meta.dirname, "..", "src");
const PH = planHash(FAKE_PLAN);

function withSpies(fn: (calls: { socket: number; fetch: number; lookup: number; plookup: number }) => void): void {
  const calls = { socket: 0, fetch: 0, lookup: 0, plookup: 0 };
  const orig = { connect: net.Socket.prototype.connect, fetch: globalThis.fetch, lookup: dns.lookup, plookup: dns.promises.lookup };
  net.Socket.prototype.connect = function (this: net.Socket) {
    calls.socket++;
    return this;
  } as typeof orig.connect;
  globalThis.fetch = (async () => {
    calls.fetch++;
    return new Response("stub");
  }) as typeof fetch;
  (dns as { lookup: unknown }).lookup = () => {
    calls.lookup++;
  };
  (dns.promises as { lookup: unknown }).lookup = async () => {
    calls.plookup++;
    return { address: "127.0.0.1", family: 4 };
  };
  const guard = installNetworkGuard();
  try {
    fn(calls);
  } finally {
    guard.uninstall();
    net.Socket.prototype.connect = orig.connect;
    globalThis.fetch = orig.fetch;
    (dns as { lookup: unknown }).lookup = orig.lookup;
    (dns.promises as { lookup: unknown }).lookup = orig.plookup;
  }
}

test("A11: socket call forms (normalized array, options, port/host, numeric-string port) are blocked before transport", () => {
  withSpies((calls) => {
    const sockets: net.Socket[] = [];
    try {
      assert.throws(() => sockets.push(net.connect({ host: "203.0.113.1", port: 443 })), /NetworkBlocked/);
      assert.throws(() => sockets.push(net.createConnection(443, "203.0.113.2")), /NetworkBlocked/);
      assert.throws(() => sockets.push(net.connect("443", "198.51.100.7")), /NetworkBlocked/);
      const s = new net.Socket();
      sockets.push(s);
      assert.throws(() => s.connect({ host: "example.invalid", port: 80 }), /NetworkBlocked/);
      assert.throws(() => s.connect(80, "example.invalid"), /NetworkBlocked/);
      assert.throws(() => (s.connect as (...a: unknown[]) => unknown)(Symbol("odd")), /NetworkBlocked/, "unrecognized shapes fail closed");
      assert.equal(calls.socket, 0);
      // loopback and local IPC are allowed through to the (stubbed) transport
      sockets.push(net.connect({ host: "127.0.0.1", port: 9 }), net.connect({ port: 9 }), net.connect({ path: "\\\\.\\pipe\\fake-test" }));
      assert.equal(calls.socket, 3);
    } finally {
      for (const s of sockets) s.destroy();
    }
  });
});

test("A11: fetch and DNS (callback and promises) are blocked before transport for non-loopback targets", () => {
  withSpies((calls) => {
    assert.throws(() => fetch("https://203.0.113.9/"), /NetworkBlocked/);
    assert.throws(() => fetch(new URL("http://example.invalid/x")), /NetworkBlocked/);
    assert.throws(() => fetch("file:///etc/hosts"), /NetworkBlocked/, "non-http(s) or unparseable inputs fail closed");
    assert.throws(() => dns.lookup("example.invalid", () => {}), /NetworkBlocked/);
    assert.throws(() => dns.promises.lookup("example.invalid"), /NetworkBlocked/);
    assert.equal(calls.fetch + calls.lookup + calls.plookup, 0);
    void fetch("http://127.0.0.1:9/");
    dns.lookup("localhost", () => {});
    assert.equal(calls.fetch, 1);
    assert.equal(calls.lookup, 1);
  });
});

test("A11: host classification and argument normalization", () => {
  for (const h of ["localhost", "127.0.0.1", "127.8.9.10", "::1", "[::1]", "::ffff:127.0.0.1"]) assert.ok(isLoopbackHost(h), h);
  for (const h of ["203.0.113.1", "example.invalid", "0.0.0.0", "128.0.0.1", "localhost.example"]) assert.ok(!isLoopbackHost(h), h);
  assert.deepEqual(socketTarget([[{ host: "203.0.113.1", port: 443 }, null]]), { kind: "tcp", host: "203.0.113.1" });
  assert.deepEqual(socketTarget([{ port: 1 }]), { kind: "tcp", host: "localhost" });
  assert.deepEqual(socketTarget([{ host: 42, port: 1 }]), { kind: "unknown" });
  assert.deepEqual(socketTarget([]), { kind: "unknown" });
});

test("A11: no source file other than the guard touches network modules or fetch", () => {
  const files = readdirSync(SRC, { recursive: true }).map(String).filter((f) => f.endsWith(".ts"));
  assert.ok(files.length >= 10);
  for (const f of files) {
    const text = readFileSync(join(SRC, f), "utf8");
    const netImport = /from "node:(http|https|http2|net|tls|dgram|dns|child_process|worker_threads)"/.test(text);
    const fetchCall = /\bfetch\s*\(/.test(text);
    if (f === "netguard.ts") continue;
    assert.ok(!netImport && !fetchCall, `${f} must not use network APIs`);
  }
  const cli = readFileSync(join(SRC, "cli.ts"), "utf8");
  assert.ok(!cli.includes("real-blocked"), "the CLI never wires the blocked real adapter");
});

test("A11: the real adapter placeholder throws on every method and retry, and is structurally refused", async () => {
  const real = new RealApplePortBlocked();
  for (let i = 0; i < 2; i++) {
    await assert.rejects(real.observe(), RealActionBlockedError);
    await assert.rejects(real.chooseSlot("op-0-1", "x"), RealActionBlockedError);
    await assert.rejects(real.advance("op-0-1"), RealActionBlockedError);
    await assert.rejects(real.submitOrder("op-0-1", {}), RealActionBlockedError);
    await assert.rejects(real.lookupOrder("op-0-1"), RealActionBlockedError);
  }
  assert.throws(
    () => new Engine({ plan: FAKE_PLAN, planHash: PH, runId: "run-test", journal: new MemoryJournal(), ledger: new MemoryLedger(), now: () => 0, portKind: "real-blocked" as "mock" }),
    /RealActionBlocked/,
  );
  const engine = new Engine({ plan: FAKE_PLAN, planHash: PH, runId: "run-test", journal: new MemoryJournal(), ledger: new MemoryLedger(), now: () => 0, portKind: "mock" });
  await assert.rejects(runEngine(engine, real as unknown as CheckoutPort, new VirtualClock()), /RealActionBlocked/);
  assert.throws(() => new Engine({ plan: FAKE_PLAN, planHash: "0123456789abcdef", runId: "run-test", journal: new MemoryJournal(), ledger: new MemoryLedger(), now: () => 0, portKind: "mock" }), /PlanBindingMismatch/);
});

function toPrePayment(cap: ReturnType<typeof createMockFormalCapability> | null, clockAt = 0) {
  const d = driver({ capability: cap });
  d.clock.advance(clockAt);
  d.feed({ type: "start" });
  d.feed(pageEv(page(1, [[S.A1, true]])));
  d.feed(resultEv(res(dispatches(d.cmds, "chooseSlot")[0].opId, "accepted")));
  d.feed(resultEv(res(dispatches(d.cmds, "advance")[0].opId, "accepted")));
  d.feed(pageEv(stepPage(2, "pre-payment", S.A1)));
  return d;
}

test("A12: without a valid mock-only capability bound to this plan and run, nothing is submitted", () => {
  assert.equal(toPrePayment(null).engine.phase, "REHEARSAL_ENDPOINT");
  const variants: [string, ReturnType<typeof createMockFormalCapability>, number][] = [
    ["plan-mismatch", createMockFormalCapability("0123456789abcdef", "run-test", 1e9), 0],
    ["run-mismatch", createMockFormalCapability(PH, "run-other", 1e9), 0],
    ["expired", createMockFormalCapability(PH, "run-test", 100), 200],
    ["scope", { ...createMockFormalCapability(PH, "run-test", 1e9), scope: "real" as "mock-only" }, 0],
    ["consumed", { ...createMockFormalCapability(PH, "run-test", 1e9), consumed: true }, 0],
  ];
  for (const [why, cap, at] of variants) {
    const d = toPrePayment(cap, at);
    assert.equal(dispatches(d.cmds, "submitOrder").length, 0, why);
    assert.equal(d.engine.phase, "BLOCKED", why);
    assert.equal(d.engine.snapshot().reason, `formal-capability-${why}`);
  }
});

test("A12: a capability that expires between preparation and send is refused at send time; a valid one is consumed once", () => {
  const cap = createMockFormalCapability(PH, "run-test", 1000);
  const d = toPrePayment(cap);
  const submit = dispatches(d.cmds, "submitOrder")[0];
  assert.ok(submit);
  d.clock.advance(5000);
  assert.equal(send(d, submit).send, false);
  assert.equal(d.engine.phase, "BLOCKED");
  assert.equal(d.ledger.find(PH), null, "never sent, so the plan is not consumed");

  const cap2 = createMockFormalCapability(PH, "run-test", 1e9);
  const e = toPrePayment(cap2);
  const s2 = dispatches(e.cmds, "submitOrder")[0];
  assert.equal(send(e, s2).send, true);
  assert.equal(cap2.consumed, true);
  assert.equal(e.ledger.find(PH)?.status, "submit-intent", "ledger written before the send record");
  assert.equal(send(e, s2).send, false, "the same submit can never be sent twice");
});
