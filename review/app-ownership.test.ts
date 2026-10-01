// Codex-owned independent A08 evidence: actual separate processes, delayed status, actual owner death.
// Full browser/application contention remains separately required; this verifies the ownership primitive.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { once } from "node:events";

const TEST_ROOT = resolve(import.meta.dirname, "..", ".local", "test-runs");
const FIXTURE = resolve(import.meta.dirname, "fixtures", "owner-child.ts");

function launch(dir: string, ownerId: string, delay: number) {
  const child = spawn(process.execPath, [FIXTURE, dir, ownerId, String(delay)], { windowsHide: true, stdio: "pipe" });
  const ready = new Promise<Record<string, unknown>>((accept, reject) => {
    let out = "";
    let err = "";
    const timer = setTimeout(() => reject(new Error("Reviewer child did not report readiness")), 8000);
    child.stderr.on("data", data => { err += String(data); });
    child.stdout.on("data", data => {
      out += String(data);
      if (!out.includes("\n")) return;
      clearTimeout(timer);
      try { accept(JSON.parse(out.slice(0, out.indexOf("\n")))); }
      catch { reject(new Error("Reviewer child returned malformed status")); }
    });
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("exit", code => {
      if (out.includes("\n")) return;
      clearTimeout(timer);
      reject(new Error(`Reviewer child ended before readiness (${code}): ${err.slice(0, 300)}`));
    });
  });
  return { child, ready };
}

async function stopKnownChild(child: ChildProcessWithoutNullStreams) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const ended = once(child, "exit");
  // ChildProcess holds the exact spawned process handle; no guessed or potentially reused PID is signalled.
  child.kill();
  await ended;
}

test("A08: a slow live owner cannot be stolen; its actual exit releases ownership for recovery", { timeout: 15000 }, async () => {
  mkdirSync(TEST_ROOT, { recursive: true });
  const dir = mkdtempSync(join(TEST_ROOT, "reviewer-ownership-"));
  const children: ChildProcessWithoutNullStreams[] = [];
  try {
    const first = launch(dir, "reviewer-first", 3500);
    children.push(first.child);
    assert.equal((await first.ready).ok, true);
    const contender = launch(dir, "reviewer-contender", 0);
    children.push(contender.child);
    const rejected = await contender.ready;
    assert.equal(rejected.ok, false, "A second OS process must not acquire the same task while the first process holds it");
    assert.equal(rejected.reason, "held");
    assert.equal(rejected.status, "timeout", "Unavailable status is distinct from owner death");
    assert.equal(first.child.exitCode, null, "The first owner remains live during the rejected takeover");
    await stopKnownChild(first.child);
    const recovery = launch(dir, "reviewer-recovery", 0);
    children.push(recovery.child);
    const acquired = await recovery.ready;
    assert.equal(acquired.ok, true);
    assert.equal(acquired.previous, "crashed", "Recovery distinguishes an actual abnormal exit from a slow status read");
  } finally {
    for (const child of children) await stopKnownChild(child);
    const absolute = resolve(dir);
    assert.equal(dirname(absolute), TEST_ROOT);
    assert.ok(basename(absolute).startsWith("reviewer-ownership-"));
    rmSync(absolute, { recursive: true, force: true });
  }
});
