// Task executor ownership (A08). The lock is an OS object, not a timestamp: a local named pipe (Windows) or an
// abstract socket (Linux) that the operating system releases only when the owning process actually exits.
// - Acquisition succeeds only if no live process holds the pipe. A heartbeat age or a slow status read is never
//   treated as proof that the owner ended, so a live in-flight owner cannot be stolen from.
// - The status read is informational only (connect + one JSON line). A timeout is reported as "owner alive,
//   status unavailable", which is distinguishable from an actual exit (the pipe disappears).
// - No local network port is involved; the pipe name is derived from the task directory. Nothing is ever deleted
//   to obtain the lock and no other process is ever signalled.
import net from "node:net";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { atomicWriteJson } from "./task-store.ts";
import { errorCode } from "../journal.ts";

export type OwnerRecord = { schema: "applebuy-owner/v1"; ownerId: string; pid: number; startedAt: number; cleanExit: boolean; endedAt: number | null };
export type StatusRead = { kind: "replied"; data: unknown } | { kind: "timeout" } | { kind: "gone" } | { kind: "error"; code: string };
export type PreviousOwner = { kind: "none" } | { kind: "clean"; rec: OwnerRecord } | { kind: "crashed"; rec: OwnerRecord };
export type AcquireResult =
  | { ok: true; lock: OwnerLock; previous: PreviousOwner }
  | { ok: false; reason: "held"; status: StatusRead }
  | { ok: false; reason: "owner-record-corrupt" | "unsupported-platform" | "lock-error"; detail: string };

export function lockAddress(taskDir: string): string | null {
  const absolute = resolve(taskDir);
  const physical = existsSync(absolute) ? realpathSync.native(absolute) : absolute;
  const key = process.platform === "win32" ? physical.toLowerCase() : physical;
  const h = createHash("sha256").update(key).digest("hex").slice(0, 24);
  if (process.platform === "win32") return `\\\\.\\pipe\\applebuy-task-${h}`;
  if (process.platform === "linux") return `\0applebuy-task-${h}`; // abstract socket: released by the kernel on exit
  return null; // other platforms: fail closed rather than rely on stale socket files
}

function validOwner(v: unknown): v is OwnerRecord {
  const o = v as Record<string, unknown> | null;
  return !!o && typeof o === "object" && o.schema === "applebuy-owner/v1" && typeof o.ownerId === "string" && Number.isInteger(o.pid) && Number.isInteger(o.startedAt) && typeof o.cleanExit === "boolean";
}

/** Reads the owner's self-reported status through the pipe. Never used to decide ownership. */
export function readOwnerStatus(taskDir: string, timeoutMs = 800): Promise<StatusRead> {
  const addr = lockAddress(taskDir);
  if (!addr) return Promise.resolve({ kind: "error", code: "unsupported-platform" });
  return new Promise((done) => {
    let buf = "";
    let finished = false;
    const finish = (r: StatusRead) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      sock.destroy();
      done(r);
    };
    const sock = net.connect({ path: addr });
    const timer = setTimeout(() => finish({ kind: "timeout" }), timeoutMs);
    sock.setEncoding("utf8");
    sock.on("data", (d: string) => {
      buf += d;
      const nl = buf.indexOf("\n");
      if (nl >= 0) {
        try {
          finish({ kind: "replied", data: JSON.parse(buf.slice(0, nl)) });
        } catch {
          finish({ kind: "error", code: "bad-status" });
        }
      }
    });
    sock.on("error", (e: NodeJS.ErrnoException) => finish(e.code === "ENOENT" || e.code === "ECONNREFUSED" ? { kind: "gone" } : { kind: "error", code: String(e.code ?? "unknown") }));
  });
}

export class OwnerLock {
  readonly ownerId: string;
  readonly taskDir: string;
  #server: net.Server;
  #rec: OwnerRecord;
  constructor(taskDir: string, server: net.Server, rec: OwnerRecord) {
    this.taskDir = taskDir;
    this.#server = server;
    this.#rec = rec;
    this.ownerId = rec.ownerId;
  }
  get record(): OwnerRecord {
    return this.#rec;
  }
  /** Clean shutdown: records the exit and releases the pipe. A crash skips this and the OS releases the pipe. */
  async release(): Promise<void> {
    this.#rec = { ...this.#rec, cleanExit: true, endedAt: Date.now() };
    try {
      atomicWriteJson(join(this.taskDir, "owner.json"), this.#rec);
    } finally {
      // Failed metadata writes must not strand an OS owner. Its durable record remains unclean for the next
      // owner, and release still rejects so callers know that the evidence write failed.
      await new Promise<void>((r) => this.#server.close(() => r()));
    }
  }
}

export async function acquireOwnership(taskDir: string, ownerId: string, status: () => unknown, o: { statusDelayMs?: number } = {}): Promise<AcquireResult> {
  const addr = lockAddress(taskDir);
  if (!addr) return { ok: false, reason: "unsupported-platform", detail: "此平台没有可在进程退出时自动释放的本机锁，拒绝运行（失败即关闭）" };
  const server = net.createServer((sock) => {
    // One JSON status line per connection. statusDelayMs exists only for the contention test fixture.
    const reply = () => sock.end(`${JSON.stringify(status())}\n`);
    sock.on("error", () => {});
    if (o.statusDelayMs) setTimeout(reply, o.statusDelayMs).unref();
    else reply();
  });
  const listened = await new Promise<NodeJS.ErrnoException | null>((res) => {
    server.once("error", (e: NodeJS.ErrnoException) => res(e));
    server.listen({ path: addr, exclusive: true }, () => res(null));
  });
  if (listened) {
    server.close();
    if (listened.code === "EADDRINUSE" || listened.code === "EACCES") return { ok: false, reason: "held", status: await readOwnerStatus(taskDir) };
    return { ok: false, reason: "lock-error", detail: String(listened.code ?? listened.message) };
  }
  server.unref();
  try {
  // We hold the OS lock, so no live owner exists. Classify the previous owner from its record (never deleted).
  const path = join(taskDir, "owner.json");
  let previous: PreviousOwner = { kind: "none" };
  if (existsSync(path)) {
    let v: unknown = null;
    try {
      v = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      v = null;
    }
    if (!validOwner(v)) {
      await new Promise<void>((r) => server.close(() => r()));
      return { ok: false, reason: "owner-record-corrupt", detail: "所有权记录 owner.json 无法识别；已保留作为证据，需人工检查后处理" };
    }
    previous = v.cleanExit ? { kind: "clean", rec: v } : { kind: "crashed", rec: v };
    appendFileSync(join(taskDir, "owner-history.jsonl"), `${JSON.stringify(v)}\n`);
  }
  const rec: OwnerRecord = { schema: "applebuy-owner/v1", ownerId, pid: process.pid, startedAt: Date.now(), cleanExit: false, endedAt: null };
  atomicWriteJson(path, rec);
  return { ok: true, lock: new OwnerLock(taskDir, server, rec), previous };
  } catch (e) {
    // Ownership is already acquired here. A failed history/current-owner write is not permission to keep it
    // or erase evidence: release only this server and return a bounded cause without a private OS message.
    await new Promise<void>((r) => server.close(() => r()));
    return { ok: false, reason: "lock-error", detail: `所有权记录无法读取或保存（${errorCode(e)}）；原始证据已保留，目录锁已释放，请人工检查` };
  }
}
