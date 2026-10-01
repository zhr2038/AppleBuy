// Codex-owned independent acceptance: test ordinary Node socket normalization with a safe transport spy (A11).
import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import dns from "node:dns";
import { installNetworkGuard } from "../src/netguard.ts";

test("A11: ordinary net.connect rejects external IPs before transport, including normalized argument arrays", () => {
  const original = net.Socket.prototype.connect;
  let transportCalls = 0;
  let socket: net.Socket | undefined;
  // The real transport is replaced first, so this independent test cannot connect anywhere even if the guard fails.
  net.Socket.prototype.connect = function (this: net.Socket) { transportCalls++; return this; } as typeof original;
  const guard = installNetworkGuard();
  try {
    assert.throws(() => { socket = net.connect({ host: "203.0.113.1", port: 443 }); }, /NetworkBlocked/);
    assert.equal(transportCalls, 0);
  } finally {
    guard.uninstall();
    net.Socket.prototype.connect = original;
    socket?.destroy();
  }
});

test("A11: callback and promise DNS requests are blocked before resolver transport", async () => {
  const lookup = dns.lookup;
  const promiseLookup = dns.promises.lookup;
  let resolverCalls = 0;
  dns.lookup = (() => { resolverCalls++; }) as typeof lookup;
  dns.promises.lookup = (async () => { resolverCalls++; return { address: "203.0.113.1", family: 4 }; }) as typeof promiseLookup;
  const guard = installNetworkGuard();
  try {
    assert.throws(() => dns.lookup("applebuy-review.invalid", () => {}), /NetworkBlocked/);
    await assert.rejects(async () => dns.promises.lookup("applebuy-review.invalid"), /NetworkBlocked/);
    assert.equal(resolverCalls, 0);
  } finally {
    guard.uninstall();
    dns.lookup = lookup;
    dns.promises.lookup = promiseLookup;
  }
});

test("A11: string, URL and Request fetch inputs are blocked before HTTP transport", async () => {
  const originalFetch = globalThis.fetch;
  let transportCalls = 0;
  globalThis.fetch = (async () => { transportCalls++; return new Response("FAKE"); }) as typeof fetch;
  const guard = installNetworkGuard();
  try {
    for (const input of ["https://applebuy-review.invalid/", new URL("https://applebuy-review.invalid/"), new Request("https://applebuy-review.invalid/")]) {
      await assert.rejects(async () => globalThis.fetch(input), /NetworkBlocked/);
    }
    assert.equal(transportCalls, 0);
  } finally {
    guard.uninstall();
    globalThis.fetch = originalFetch;
  }
});
