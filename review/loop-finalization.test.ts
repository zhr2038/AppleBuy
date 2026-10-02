// Independent R3-a reproduction. All faults stay inside a unique test directory.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, renameSync, rmdirSync } from "node:fs";
import { TaskApp } from "../src/app/task-app.ts";
import { readOwnerStatus } from "../src/app/owner-lock.ts";
import { FAKE_PLAN } from "../src/mock/scenarios.ts";
import { join, tempDir } from "../test/helpers.ts";

test("R3-a: task-file loss at send time cannot reject loop or prevent concurrent close", async () => {
  const tmp = tempDir("loop-finalization");
  const dir = join(tmp.dir, "task");
  const path = join(dir, "task.json");
  let injected = false;
  let bytes: Buffer | null = null;
  let closeOutcome: Promise<unknown> | null = null;
  let app: TaskApp | null = null;
  try {
    const opened = await TaskApp.open({ taskDir: dir, initialPlan: FAKE_PLAN, latencyMs: 2, beforeSend: () => {
      if (injected) return;
      injected = true;
      bytes = readFileSync(path);
      renameSync(path, `${path}.kept`);
      mkdirSync(path);
      // Shutdown is already waiting when finalization encounters the unreadable task file.
      closeOutcome = app!.close().then(() => null, error => error);
    } });
    assert.equal(opened.ok, true);
    if (!opened.ok) throw new Error(opened.detail);
    app = opened.app;
    assert.equal(app.start().ok, true);
    const loopError = await app.idle().then(() => null, error => error);
    const closeError = closeOutcome ? await closeOutcome : "close-not-started";
    assert.equal(injected, true);
    assert.equal(app.site.counts.chooseSlot + app.site.counts.advance + app.site.counts.submitOrder, 0);
    assert.deepEqual(readFileSync(`${path}.kept`), bytes);
    assert.equal(loopError, null, "the executor loop must settle safely even when task.json cannot be read");
    assert.equal(closeError, null, "concurrent close must release its own task lock");
    assert.equal((await readOwnerStatus(dir, 300)).kind, "gone");
    rmdirSync(path); // Verified own unique test directory; this directory is empty.
    renameSync(`${path}.kept`, path);
    assert.match(String(app.state().loopError), /task\.json/);
    assert.doesNotMatch(String(app.state().loopError), /E:\\|Apple Store/);
  } finally {
    if (app) {
      await app.close().catch(async () => {
        app!.site.close();
        await app!.lock.release().catch(() => {});
      });
    }
    tmp.cleanup();
  }
});
