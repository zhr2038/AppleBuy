// Quota takeover implementation checks, authored by Codex. These are not a substitute for Claude cross-review.
// State is contained and fake; no ACL edits, outside children, real website or purchase calls.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { TaskApp } from "../src/app/task-app.ts";
import { readOwnerStatus } from "../src/app/owner-lock.ts";
import { TaskStore, FORMAL_PHRASE } from "../src/app/task-store.ts";
import { openApp } from "./app-helpers.ts";
import { tempDir } from "./helpers.ts";

test("journal I/O at send time preserves prepared evidence and sends no mutation", async () => {
  const tmp = tempDir("journal-io-send");
  let injected = false;
  let path = "";
  let bytes: Buffer | null = null;
  const app = await openApp(join(tmp.dir, "task"), { beforeSend: (cmd) => {
    if (injected || cmd.type !== "dispatch" || cmd.kind !== "chooseSlot") return;
    injected = true;
    const run = app.doc().runs.at(-1)!;
    path = app.store.journalPath(run.runId);
    bytes = readFileSync(path);
    renameSync(path, `${path}.kept`);
    mkdirSync(path);
  } });
  try {
    assert.ok(app.start().ok);
    await app.idle();
    const state = app.state();
    assert.ok(injected);
    assert.equal(state.ledger.problem?.cause, "run-journal-unverifiable");
    assert.match(String(state.loopError), /已停止发送.*日志.*无法读取/);
    assert.equal(app.site.counts.chooseSlot + app.site.counts.advance + app.site.counts.submitOrder, 0);
    assert.equal(app.site.view().orders, 0);
    assert.deepEqual(readFileSync(`${path}.kept`), bytes);
    assert.equal(app.start().ok, false);
  } finally {
    await app.close();
    tmp.cleanup();
  }
});

for (const boundary of ["task-load", "run-load"] as const) {
  test(`unexpected ${boundary} failure releases ownership and preserves task evidence`, async () => {
    const tmp = tempDir(`journal-init-${boundary}`);
    const dir = join(tmp.dir, "task");
    const original = TaskStore.prototype.load;
    let calls = 0;
    let after: TaskApp | null = null;
    try {
      const first = await openApp(dir);
      assert.ok(first.start().ok);
      await first.idle();
      const journalPath = first.store.journalPath(first.state().run!.runId);
      const bytes = readFileSync(journalPath);
      const taskBytes = readFileSync(first.store.taskPath);
      const ledgerPath = join(dir, "purchase-ledger.json");
      const ledgerBytes = readFileSync(ledgerPath);
      await first.close();
      TaskStore.prototype.load = function (...args) {
        if (this.dir === first.store.dir && ++calls === (boundary === "task-load" ? 1 : 2)) {
          throw Object.assign(new Error("PRIVATE-OS-MESSAGE-MUST-NOT-LEAK"), { code: "EBUSY" });
        }
        return original.apply(this, args);
      };
      const refused = await TaskApp.open({ taskDir: dir, initialPlan: null });
      assert.equal(refused.ok, false);
      if (!refused.ok) {
        assert.equal(refused.reason, "initialization-error");
        assert.match(refused.detail, /EBUSY/);
        assert.match(refused.detail, /释放目录锁/);
        assert.doesNotMatch(refused.detail, /PRIVATE-OS-MESSAGE/);
      }
      assert.equal((await readOwnerStatus(dir, 300)).kind, "gone", "no lock may remain in the same process");
      assert.deepEqual(readFileSync(first.store.taskPath), taskBytes);
      assert.deepEqual(readFileSync(ledgerPath), ledgerBytes);
      assert.deepEqual(readFileSync(journalPath), bytes);
      TaskStore.prototype.load = original;
      after = await openApp(dir);
      assert.equal(after.site.counts.submitOrder, 0);
    } finally {
      TaskStore.prototype.load = original;
      await after?.close();
      tmp.cleanup();
    }
  });
}

test("unexpected evidence reader error is unknown evidence, never an empty trusted ledger", async () => {
  const tmp = tempDir("journal-evidence-unexpected");
  const app = await openApp(join(tmp.dir, "task"));
  const original = app.store.ledger.file.find;
  try {
    const before = app.site.counts;
    const hash = app.state().plan.planHash;
    app.store.ledger.file.find = () => { throw Object.assign(new Error("PRIVATE-EVIDENCE-MESSAGE"), { code: "EBUSY" }); };
    const state = app.state();
    assert.equal(state.ledger.problem?.cause, "evidence-unverifiable");
    assert.equal(state.ledger.corrupt, false);
    assert.equal(state.ledger.entries, 1);
    assert.equal(state.ledger.status, "unknown");
    assert.equal(app.start().ok, false);
    assert.equal(app.recover().ok, false);
    assert.equal(app.armFormal(hash, FORMAL_PHRASE).ok, false);
    assert.doesNotMatch(state.ledger.problem!.message, /PRIVATE-EVIDENCE-MESSAGE/);
    assert.deepEqual(app.site.counts, before);
    app.store.ledger.file.find = original;
    assert.equal(app.state().ledger.problem, null, "fresh evidence is checked again, no sticky cache");
  } finally {
    app.store.ledger.file.find = original;
    await app.close();
    tmp.cleanup();
  }
});

test("owner history write failure refuses acquisition and releases the same-process OS lock", async () => {
  const tmp = tempDir("journal-owner-history-io");
  const dir = join(tmp.dir, "task");
  const app = await openApp(dir);
  try {
    await app.close();
    const taskBytes = readFileSync(app.store.taskPath);
    const ledgerPath = join(dir, "purchase-ledger.json");
    const ledgerBytes = readFileSync(ledgerPath);
    const ownerPath = join(dir, "owner.json");
    const ownerBytes = readFileSync(ownerPath);
    mkdirSync(join(dir, "owner-history.jsonl"));
    for (let attempt = 0; attempt < 2; attempt++) {
      const refused = await TaskApp.open({ taskDir: dir, initialPlan: null });
      assert.equal(refused.ok, false);
      if (!refused.ok) assert.equal(refused.reason, "lock-error", "a failed write must not leave a held lock");
      assert.equal((await readOwnerStatus(dir, 300)).kind, "gone");
    }
    assert.deepEqual(readFileSync(ownerPath), ownerBytes);
    assert.deepEqual(readFileSync(app.store.taskPath), taskBytes);
    assert.deepEqual(readFileSync(ledgerPath), ledgerBytes);
  } finally {
    await app.close();
    tmp.cleanup();
  }
});

test("failed clean-exit metadata write still releases ownership and preserves the original record", async () => {
  const tmp = tempDir("journal-owner-release-io");
  const dir = join(tmp.dir, "task");
  const app = await openApp(dir);
  try {
    const ownerPath = join(dir, "owner.json");
    const bytes = readFileSync(ownerPath);
    renameSync(ownerPath, `${ownerPath}.kept`);
    mkdirSync(ownerPath);
    await assert.rejects(app.close());
    assert.equal((await readOwnerStatus(dir, 300)).kind, "gone");
    assert.deepEqual(readFileSync(`${ownerPath}.kept`), bytes);
    const refused = await TaskApp.open({ taskDir: dir, initialPlan: null });
    assert.equal(refused.ok, false);
    if (!refused.ok) assert.equal(refused.reason, "owner-record-corrupt");
    assert.equal((await readOwnerStatus(dir, 300)).kind, "gone");
    assert.equal(app.site.counts.submitOrder, 0);
  } finally {
    await app.close().catch(() => {});
    tmp.cleanup();
  }
});
