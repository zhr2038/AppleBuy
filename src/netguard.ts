// Defense in depth for rehearsal (A11): any non-loopback network attempt is recorded and thrown BEFORE the transport
// is called. Covered entry points: net.Socket.prototype.connect (net/tls/http all funnel through it, including Node's
// internally normalized [options, callback] array form), globalThis.fetch, dns.lookup/resolve* (callback and promises),
// and dgram send/connect. Unrecognized call shapes fail closed.
import dgram from "node:dgram";
import dns from "node:dns";
import net from "node:net";

export type NetworkGuard = { attempts: string[]; uninstall: () => void };

export function isLoopbackHost(h: string): boolean {
  const x = h.toLowerCase().replace(/^\[|\]$/g, "");
  return x === "localhost" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(x) || x === "::1" || x === "0:0:0:0:0:0:0:1" || /^::ffff:127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(x);
}

type Target = { kind: "ipc" } | { kind: "tcp"; host: string } | { kind: "unknown" };

/** Mirrors the argument shapes Socket#connect accepts; anything else is "unknown" and is blocked. */
export function socketTarget(args: unknown[]): Target {
  // net.connect()/createConnection()/tls/http call socket.connect(normalizedArgs) with a single [options, cb] array.
  const a: unknown[] = Array.isArray(args[0]) ? (args[0] as unknown[]) : args;
  const first = a[0];
  if (first && typeof first === "object") {
    const o = first as Record<string, unknown>;
    if (typeof o.path === "string" && o.path.length > 0) return { kind: "ipc" };
    if (o.host === undefined || o.host === null || o.host === "") return { kind: "tcp", host: "localhost" }; // Node's default
    return typeof o.host === "string" ? { kind: "tcp", host: o.host } : { kind: "unknown" };
  }
  if (typeof first === "number" || (typeof first === "string" && /^\d+$/.test(first))) {
    if (a[1] === undefined || typeof a[1] === "function") return { kind: "tcp", host: "localhost" };
    return typeof a[1] === "string" ? { kind: "tcp", host: a[1] } : { kind: "unknown" };
  }
  if (typeof first === "string" && first.length > 0) return { kind: "ipc" };
  return { kind: "unknown" };
}

function fetchHost(input: unknown): string | null {
  try {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : (input as { url?: unknown })?.url;
    if (typeof raw !== "string") return null;
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? u.hostname : null;
  } catch {
    return null;
  }
}

export function installNetworkGuard(): NetworkGuard {
  const attempts: string[] = [];
  const block = (what: string): never => {
    attempts.push(what);
    throw new Error(`NetworkBlocked: 演练模式禁止非本机网络访问 (${what})`);
  };
  const restore: (() => void)[] = [];
  const patch = <T extends object>(obj: T, key: string, make: (orig: (...a: unknown[]) => unknown) => (...a: unknown[]) => unknown) => {
    const rec = obj as Record<string, unknown>;
    const orig = rec[key];
    if (typeof orig !== "function") return;
    rec[key] = make(orig as (...a: unknown[]) => unknown);
    restore.push(() => {
      rec[key] = orig;
    });
  };

  patch(net.Socket.prototype, "connect", (orig) =>
    function (this: unknown, ...args: unknown[]) {
      const t = socketTarget(args);
      if (t.kind === "unknown") block("socket:unrecognized-arguments");
      if (t.kind === "tcp" && !isLoopbackHost(t.host)) block(`socket:${t.host}`);
      return orig.apply(this, args);
    });
  patch(globalThis, "fetch", (orig) =>
    function (this: unknown, ...args: unknown[]) {
      const host = fetchHost(args[0]);
      if (host === null || !isLoopbackHost(host)) block(`fetch:${host ?? "unrecognized"}`);
      return orig.apply(this, args);
    });
  const guardName = (label: string) => (orig: (...a: unknown[]) => unknown) =>
    function (this: unknown, ...args: unknown[]) {
      const host = args[0];
      if (typeof host !== "string" || !isLoopbackHost(host)) block(`${label}:${typeof host === "string" ? host : "unrecognized"}`);
      return orig.apply(this, args);
    };
  for (const k of ["lookup", "lookupService", "resolve", "resolve4", "resolve6", "resolveAny", "resolveCname", "resolveMx", "resolveNs", "resolveSrv", "resolveTxt", "reverse"]) {
    patch(dns, k, guardName(`dns:${k}`));
    patch(dns.promises, k, guardName(`dns.promises:${k}`));
  }
  patch(dgram.Socket.prototype, "send", (orig) =>
    function (this: unknown, ...args: unknown[]) {
      // send(msg[, offset, length][, port][, address][, cb]): the address is the last string argument, if any
      // (a string message with no address is also treated as an address, which fails closed).
      const address = [...args].reverse().find((x) => typeof x === "string");
      if (typeof address === "string" && !isLoopbackHost(address)) block(`udp:${address}`);
      return orig.apply(this, args);
    });
  patch(dgram.Socket.prototype, "connect", (orig) =>
    function (this: unknown, ...args: unknown[]) {
      const address = typeof args[1] === "string" ? args[1] : "localhost";
      if (!isLoopbackHost(address)) block(`udp:${address}`);
      return orig.apply(this, args);
    });

  return {
    attempts,
    uninstall: () => {
      for (const r of restore.reverse()) r();
    },
  };
}
