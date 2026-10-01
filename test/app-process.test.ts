// C-003 A07/A08/A09 across real OS processes: this project's own CLI is spawned (hidden window) against task
// directories inside .local/test-runs; crashes are real process exits (fixture exit after an fsynced record, or
// termination of our own child). Recovery always goes through the supported entry (`app --recover` / POST /api/recover).
import { test } from "node:test";
import assert from "node:assert/strict";
import { TaskApp } from "../src/app/task-app.ts";
import { FORMAL_PHRASE } from "../src/app/task-store.ts";
import { FAST_PLAN, Tab, appStatus, procDir, spawnApp, waitFor } from "./app-helpers.ts";

const portOf = (r: unknown): number => {
  assert.ok(r && typeof r === "object" && "port" in r, `expected a ready owner, got ${JSON.stringify(r)}`);
  return (r as { port: number }).port;
};
async function finished(tab: Tab): Promise<any> {
  await waitFor(async () => (await tab.state()).running === false, "run ended", 15000);
  return tab.state();
}

test("A08: two processes started together on one task → exactly one owner", async () => {
  const p = procDir("proc-race");
  try {
    const x = p.track(spawnApp(p.dir));
    const y = p.track(spawnApp(p.dir));
    const rs = await Promise.all([x.ready, y.ready]);
    assert.equal(rs.filter((r) => "port" in r).length, 1);
    assert.equal(rs.filter((r) => "refused" in r && r.refused === "held").length, 1);
  } finally {
    await p.cleanup();
  }
});

test("A08: a live owner with an in-flight mutation is never stolen from, even when its status read times out; a real exit is distinguished", async () => {
  const p = procDir("proc-contend");
  try {
    const a = p.track(spawnApp(p.dir, ["--auto-start", "refuse-then-accept"], { APPLEBUY_TEST_HOLD: "chooseSlot", APPLEBUY_TEST_STATUS_DELAY_MS: "5000" }));
    const ta = await new Tab(portOf(await a.ready), "c-procaaaaaaaa").load();
    await waitFor(async () => (await ta.state()).engine.pendingOp?.status === "SENT", "owner awaiting its mutation reply");
    const b = p.track(spawnApp(p.dir));
    assert.deepEqual(await b.ready, { refused: "held", status: "timeout" }, "slow status is not an exit");
    assert.equal(await b.exit, 3);
    assert.equal(await appStatus(p.dir), "timeout");
    assert.equal((await ta.state()).engine.pendingOp?.status, "SENT", "the owner keeps its in-flight op");
    a.child.kill(); // actual exit of the owner process (our own child)
    await a.exit;
    assert.equal(await appStatus(p.dir), "gone");
    const c = p.track(spawnApp(p.dir, ["--recover"]));
    const rc = await c.ready;
    assert.equal((rc as { previous: string }).previous, "crashed");
    const s = await finished(await new Tab(portOf(rc), "c-proccccccccc").load());
    assert.equal(s.engine.phase, "MANUAL_VERIFICATION", "no page evidence for the unknown click → manual, read-only");
    assert.equal(s.site.counts.chooseSlot, 1, "the unknown op was never resent");
  } finally {
    await p.cleanup();
  }
});

for (const [point, crash] of [["intent", "intent:chooseSlot"], ["outcome", "outcome:chooseSlot"]] as const) {
  test(`A07: real process crash right after the durable ${point} record → recovery entry restores truth and continues`, async () => {
    const p = procDir(`proc-crash-${point}`);
    try {
      const a = p.track(spawnApp(p.dir, ["--auto-start", "refuse-then-accept"], { APPLEBUY_TEST_CRASH_AFTER: crash }));
      assert.equal(await a.exit, 86, a.out());
      const b = p.track(spawnApp(p.dir, ["--recover"]));
      const s = await finished(await new Tab(portOf(await b.ready), "c-procbbbbbbbb").load());
      assert.equal(s.engine.phase, "REHEARSAL_ENDPOINT", s.trace.join("\n"));
      assert.equal(s.engine.acceptedSlot, "FAKE 门店甲|2099-01-01|10:30-11:00");
      assert.equal(s.site.counts.chooseSlot, 2, "A1 at most once (refused), then A2 once");
      const trace = s.trace.join("\n");
      if (point === "intent") assert.match(trace, /进程中断前尚未发送/);
      else assert.match(trace, /从日志恢复/);
    } finally {
      await p.cleanup();
    }
  });
}

test("A07/R07: crash while an accepted selection's reply is in flight → new owner reconciles from fresh mock evidence and continues automatically, with the original plan binding", async () => {
  const p = procDir("proc-crash-accepted");
  try {
    const a = p.track(spawnApp(p.dir, ["--auto-start", "refuse-then-accept"], { APPLEBUY_TEST_HOLD: "chooseSlot@2" }));
    const ta = await new Tab(portOf(await a.ready), "c-procaaaaaaaa").load();
    await waitFor(async () => (await ta.state()).site.counts.chooseSlot === 2, "second choice received by the mock site");
    a.child.kill();
    await a.exit;
    // a separate start edits the plan between crash and recovery; the recovered run keeps its bound revision
    const mid = await TaskApp.open({ taskDir: p.dir, initialPlan: FAST_PLAN });
    assert.ok(mid.ok);
    assert.ok(mid.app.editPlan({ ...FAST_PLAN, label: "FAKE 崩溃后修改的计划" }).ok);
    assert.equal(mid.app.start().ok, false, "unfinished run must be recovered first");
    await mid.app.close();
    const b = p.track(spawnApp(p.dir, ["--recover"]));
    const s = await finished(await new Tab(portOf(await b.ready), "c-procbbbbbbbb").load());
    assert.equal(s.engine.phase, "REHEARSAL_ENDPOINT", s.trace.join("\n"));
    assert.equal(s.site.counts.chooseSlot, 2, "accepted selection was reconciled, never re-clicked");
    assert.equal(s.site.counts.advance, 1);
    assert.equal(s.run.rev, 1);
    assert.equal(s.run.boundToCurrentPlan, false);
    assert.match(s.trace.join("\n"), /核实结果：已接受/);
  } finally {
    await p.cleanup();
  }
});

test("A09/A07: a pause in force before a process crash is still in force after recovery; nothing new is sent", async () => {
  const p = procDir("proc-crash-paused");
  try {
    const a = p.track(spawnApp(p.dir, ["--auto-start", "refuse-then-accept"], { APPLEBUY_TEST_HOLD: "chooseSlot" }));
    const ta = await new Tab(portOf(await a.ready), "c-procaaaaaaaa").load();
    await waitFor(async () => (await ta.state()).engine.pendingOp?.status === "SENT", "in flight");
    assert.equal((await ta.post("/api/control", { action: "pause" })).status, 200);
    await waitFor(async () => (await ta.state()).engine.phase === "PAUSED", "paused");
    a.child.kill();
    await a.exit;
    const b = p.track(spawnApp(p.dir, ["--recover"]));
    const tb = await new Tab(portOf(await b.ready), "c-procbbbbbbbb").load();
    await waitFor(async () => (await tb.state()).engine.phase === "PAUSED", "restored pause");
    await new Promise((r) => setTimeout(r, 200));
    const s = await tb.state();
    assert.equal(s.engine.phase, "PAUSED");
    assert.equal(s.engine.pendingOp?.status, "UNKNOWN", "the sent-but-unanswered op is unknown, not forgotten");
    assert.equal(s.site.counts.chooseSlot, 1);
  } finally {
    await p.cleanup();
  }
});

test("A07/A12: unknown mock final submit + process crash → fresh start, new client and plan edit stay read-only; recovery only looks up; one submit total", async () => {
  const p = procDir("proc-unknown-submit");
  try {
    const pre = await TaskApp.open({ taskDir: p.dir, initialPlan: FAST_PLAN });
    assert.ok(pre.ok);
    assert.ok(pre.app.armFormal(pre.app.state().plan.planHash, FORMAL_PHRASE).ok);
    await pre.app.close();
    const a = p.track(spawnApp(p.dir, ["--auto-start", "submit-unknown"], { APPLEBUY_TEST_HOLD: "submitOrder" }));
    const ta = await new Tab(portOf(await a.ready), "c-procaaaaaaaa").load();
    await waitFor(async () => (await ta.state()).site.counts.submitOrder === 1, "mock submit received");
    a.child.kill();
    await a.exit;
    const b = p.track(spawnApp(p.dir));
    const port = portOf(await b.ready);
    const t1 = await (await new Tab(port, "c-procbbbbbbbb").load()).connect();
    const t2 = await (await new Tab(port, "c-procdddddddd").load()).connect();
    try {
      assert.equal((await t1.post("/api/claim")).status, 200);
      assert.equal((await t1.post("/api/start")).status, 409, "fresh start refused");
      assert.equal((await t1.post("/api/plan", { plan: { ...FAST_PLAN, label: "FAKE 换名" } })).status, 200);
      const again = await t1.post("/api/start");
      assert.equal(again.status, 409, "plan edit cannot evade the unknown submit");
      assert.equal((await t2.post("/api/claim")).body.code, "controlled-elsewhere", "a new client cannot steal control");
      assert.equal((await t2.post("/api/start")).body.code, "not-controller");
      assert.equal((await t1.post("/api/recover")).status, 200);
      const s = await finished(t1);
      assert.equal(s.engine.phase, "MANUAL_VERIFICATION");
      assert.ok(s.site.counts.lookupOrder >= 1, "read-only lookup only");
      assert.equal(s.site.counts.submitOrder, 1, "never a second submit");
      assert.equal(s.ledger.entries > 0, true);
    } finally {
      t1.disconnect();
      t2.disconnect();
    }
  } finally {
    await p.cleanup();
  }
});
