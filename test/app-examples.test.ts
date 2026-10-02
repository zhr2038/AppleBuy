// C-006 implementation tests: FAKE example loading, the three-date last-slot rehearsal through the real engine,
// durable display after restart, and bounded task-file diagnostics. All data is FAKE and contained.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { readJournal } from "../src/journal.ts";
import { TaskStore } from "../src/app/task-store.ts";
import { startServer } from "../src/app/server.ts";
import { renderApp, renderStart } from "../web/render.js";
import { FAST_PLAN, Tab, openApp } from "./app-helpers.ts";
import { tempDir } from "./helpers.ts";

test("three-date example: preset is required, loading keeps old revisions, engine picks each date's listed last slot, no submit", async () => {
  const t = tempDir("app-three-date");
  const dir = join(t.dir, "task");
  let app = await openApp(dir);
  try {
    const refused = app.start("last-slot-three-dates");
    assert.equal(refused.ok, false);
    assert.equal(!refused.ok && refused.code, "preset-required", "the fixture never runs under an unrelated plan");
    const rev1 = app.state().plan.planHash;
    assert.ok(app.loadPreset("three-date-last").ok);
    const s0 = app.state();
    assert.equal(s0.plan.rev, 2);
    assert.equal(app.doc().planRevs[0].planHash, rev1, "the earlier revision is kept, not overwritten");
    assert.equal(s0.examples.find((x) => x.id === "three-date-last")?.ready, true);
    assert.match(renderStart(s0), /最晚/);
    assert.ok(app.start("last-slot-three-dates").ok);
    await app.idle();
    const s = app.state();
    assert.equal(s.engine.phase, "REHEARSAL_ENDPOINT");
    const log = readJournal(app.store.journalPath(s.run!.runId), s.run!.planHash);
    assert.ok(log.ok);
    const sent = log.records.filter((r) => r.type === "sent" && r.kind === "chooseSlot").map((r) => r.slotKey);
    // Day 3's fixture closes earlier: the last time is read from the list, not assumed.
    assert.deepEqual(sent, ["FAKE 门店甲|2099-01-01|21:15-21:30", "FAKE 门店甲|2099-01-02|21:15-21:30", "FAKE 门店甲|2099-01-03|20:45-21:00"]);
    assert.equal(log.records.filter((r) => r.type === "refusal").length, 2);
    assert.equal(app.site.counts.submitOrder, 0);
    assert.equal(app.site.view().orders, 0);
    assert.equal(s.engine.acceptedSlotZh, "2099-01-03 20:45–21:00（FAKE 门店甲）");
    const history = s.history.map((h) => h.text).join("\n");
    assert.match(history, /明确拒绝 2099-01-01 21:15–21:30/);
    assert.match(history, /明确拒绝 2099-01-02 21:15–21:30/);
    assert.match(history, /演练终点，未提交任何订单/);

    // Restart: same task/run identity, durable history, labelled historical, still no new run or port call.
    const counts = app.site.counts;
    await app.close();
    app = await openApp(dir);
    const r = app.state();
    assert.equal(r.task.taskId, s.task.taskId);
    assert.equal(r.run!.runId, s.run!.runId);
    assert.equal(r.engine.historical, true);
    assert.deepEqual(r.history, s.history);
    assert.deepEqual(app.site.counts, counts);
    assert.match(renderApp(r), /上次运行（历史结果，不是新的运行）/);
  } finally {
    await app.close();
    t.cleanup();
  }
});

test("examples never displace a non-FAKE plan or a running binding", async () => {
  const t = tempDir("app-preset-guard");
  const app = await openApp(join(t.dir, "user"), { initialPlan: { ...FAST_PLAN, fake: false, label: "用户计划（测试）" } });
  try {
    const r = app.loadPreset("three-date-last");
    assert.equal(!r.ok && r.code, "plan-not-fake");
    assert.equal(app.doc().planRevs.length, 1);
    assert.equal(app.state().examples.every((x) => !x.canLoad), true);
  } finally {
    await app.close();
  }
  const fake = await openApp(join(t.dir, "fake"), { hold: ["chooseSlot"] });
  try {
    assert.ok(fake.start().ok);
    assert.ok(fake.loadPreset("three-date-last").ok);
    const s = fake.state();
    assert.equal(s.run!.rev, 1, "the running run stays bound to its reviewed revision");
    assert.equal(s.run!.boundToCurrentPlan, false);
    assert.equal(fake.start("last-slot-three-dates").ok, false, "one executor per task");
  } finally {
    await fake.close();
    t.cleanup();
  }
});

test("task-file I/O failure is not reported as malformed content; HTTP state shows bounded text without paths", async () => {
  const t = tempDir("app-task-io");
  const dir = join(t.dir, "task");
  const app = await openApp(dir);
  const srv = await startServer(app);
  try {
    const taskPath = app.store.taskPath;
    rmSync(taskPath);
    mkdirSync(taskPath); // reading now fails with an I/O error (EISDIR), not a parse error
    const loaded = new TaskStore(dir).load(null, Date.now());
    assert.equal(!loaded.ok && loaded.error, "task-unreadable");
    assert.doesNotMatch(!loaded.ok ? loaded.detail : "", /解析/);
    const ev = app.store.ledger.evidence();
    assert.equal(!ev.ok && ev.problem.cause, "task-unreadable");
    assert.match(!ev.ok ? ev.problem.message : "", /无法读取/);
    assert.doesNotMatch(!ev.ok ? ev.problem.message : "", /解析/);
    const tab = await new Tab(srv.port, "c-taskiotest01").load();
    const state = await tab.state();
    assert.match(state.fatal, /task\.json/);
    assert.ok(!String(state.fatal).includes(t.dir) && !String(state.fatal).includes("\\"), "no private path in the browser view");
  } finally {
    await srv.close();
    await app.close();
    t.cleanup();
  }
});
