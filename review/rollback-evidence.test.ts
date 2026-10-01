// Codex-owned independent reproduction of actual Claude cross-review F1/F2. All state is fake and contained.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TaskApp } from "../src/app/task-app.ts";
import { FORMAL_PHRASE } from "../src/app/task-store.ts";
import { openApp } from "../test/app-helpers.ts";
import { tempDir } from "../test/helpers.ts";
import { renderApp } from "../web/render.js";

for (const ledgerMode of ["restored", "empty"] as const) {
  test(`review F1: restoring the pre-submit task and ${ledgerMode} ledger cannot authorize a second purchase`, async () => {
    const tmp = tempDir(`review-rollback-${ledgerMode}`);
    const dir = join(tmp.dir, "task");
    const first = await openApp(dir);
    let again: TaskApp | null = null;
    try {
      assert.ok(first.armFormal(first.state().plan.planHash, FORMAL_PHRASE).ok);
      const taskBytes = readFileSync(join(dir, "task.json"));
      const ledgerBytes = readFileSync(join(dir, "purchase-ledger.json"));
      assert.ok(first.start("submit-confirm").ok);
      await first.idle();
      assert.equal(first.site.counts.submitOrder, 1);
      assert.equal(first.site.view().orders, 1);
      await first.close();
      writeFileSync(join(dir, "task.json"), taskBytes);
      writeFileSync(join(dir, "purchase-ledger.json"), ledgerMode === "empty" ? "[]" : ledgerBytes);
      again = await openApp(dir);
      const before = again.site.counts;
      const restart = again.start("submit-confirm");
      // Let a mistakenly admitted flow finish: record the actual second submit, rather than only a prediction.
      await again.idle();
      assert.equal(restart.ok, false, `rolled-back metadata admitted a new run; durable fake orders=${again.site.view().orders}, submitOrder calls=${again.site.counts.submitOrder}`);
      assert.deepEqual(again.site.counts, before, "blocked start must send no fake purchase mutation");
      assert.equal(again.site.view().orders, 1);
      assert.equal(again.site.counts.submitOrder, 1);
    } finally {
      await first.close();
      await again?.close();
      tmp.cleanup();
    }
  });
}

test("review F2: missing run journal is named accurately without claiming an intact ledger file is damaged", async () => {
  const tmp = tempDir("review-evidence-wording");
  const app = await openApp(join(tmp.dir, "task"));
  try {
    assert.ok(app.start().ok);
    await app.idle();
    const ledgerBytes = readFileSync(join(app.store.dir, "purchase-ledger.json"));
    unlinkSync(app.store.journalPath(app.state().run!.runId));
    const before = app.site.counts;
    const start = app.start();
    assert.equal(start.ok, false);
    assert.deepEqual(app.site.counts, before);
    assert.deepEqual(readFileSync(join(app.store.dir, "purchase-ledger.json")), ledgerBytes);
    assert.match(start.message, /日志/, "actionable Chinese blocker must name the missing journal");
    assert.doesNotMatch(start.message, /购买台账损坏/);
    const view = renderApp(app.state());
    assert.match(view, /日志/);
    assert.doesNotMatch(view, /购买台账：损坏/);
  } finally {
    await app.close();
    tmp.cleanup();
  }
});
