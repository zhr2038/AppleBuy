// C-003: the actual local application (TaskApp + loopback service) driving the shared Engine/runEngine core.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { TaskApp } from "../src/app/task-app.ts";
import { FORMAL_PHRASE } from "../src/app/task-store.ts";
import { startServer } from "../src/app/server.ts";
import { readJournal } from "../src/journal.ts";
import { FAST_PLAN, Tab, openApp, phaseOf, waitFor } from "./app-helpers.ts";
import { tempDir } from "./helpers.ts";

const done = (app: TaskApp) => waitFor(() => !app.running, "engine loop ended");

test("A01/A02/R10 via the app: refusal → fresh list → different authorized slot accepted → automatic continuation, visibly fake", async () => {
  const t = tempDir("app-flagship");
  const app = await openApp(join(t.dir, "task"));
  try {
    assert.equal(app.state().fake, true);
    const r = app.start();
    assert.ok(r.ok, r.message);
    await done(app);
    const s = app.state();
    assert.equal(s.engine.phase, "REHEARSAL_ENDPOINT");
    assert.equal(s.site.counts.chooseSlot, 2);
    assert.equal(s.site.counts.advance, 1);
    assert.equal(s.site.counts.submitOrder, 0, "default rehearsal cannot submit");
    assert.equal(s.engine.refusals, 1);
    assert.equal(s.engine.acceptedSlot, "FAKE 门店甲|2099-01-01|10:30-11:00");
    assert.ok(s.engine.lastValidObservationAt !== null);
    const trace = s.trace.join("\n");
    assert.match(trace, /\[拒绝\] 模拟官网明确拒绝 FAKE 门店甲\|2099-01-01\|10:00-10:30/);
    assert.match(trace, /\[接受\] 模拟官网已接受 FAKE 门店甲\|2099-01-01\|10:30-11:00/);
    assert.match(s.site.contract, /虚构/);
    assert.ok(s.site.slots.every((x: { key: string }) => x.key.startsWith("FAKE")));
    // the journal is the same hash-chained, plan-bound journal the engine core always writes
    const run = s.run;
    assert.ok(readJournal(app.store.journalPath(run.runId), run.planHash).ok);
  } finally {
    await app.close();
    t.cleanup();
  }
});

test("A09/R08: pause while a mock mutation awaits its reply keeps the sent truth, sends nothing new, and resume re-observes", async () => {
  const t = tempDir("app-pause-inflight");
  const app = await openApp(join(t.dir, "task"), { hold: ["chooseSlot"] });
  try {
    app.start();
    await waitFor(() => app.site.heldCount === 1, "chooseSlot awaiting its reply");
    assert.equal(app.state().engine.pendingOp?.status, "SENT");
    assert.ok(app.control("pause").ok);
    await waitFor(() => phaseOf(app) === "PAUSED", "paused while the reply is outstanding");
    assert.equal(app.state().engine.pendingOp?.status, "SENT", "the sent op keeps its pending truth");
    app.site.setHold([]);
    app.site.releaseHeld();
    await waitFor(() => app.state().engine.refusals === 1, "late refusal recorded while paused");
    await new Promise((r) => setTimeout(r, 150));
    const paused = app.state();
    assert.equal(paused.engine.phase, "PAUSED");
    assert.equal(paused.site.counts.chooseSlot, 1, "no new mutation after pause");
    const observesBefore = paused.site.counts.observe;
    assert.ok(app.control("resume").ok);
    await done(app);
    const s = app.state();
    assert.equal(s.engine.phase, "REHEARSAL_ENDPOINT");
    assert.ok(s.site.counts.observe > observesBefore, "resume requires a fresh observation");
    assert.equal(s.site.counts.chooseSlot, 2);
  } finally {
    await app.close();
    t.cleanup();
  }
});

test("A09/R08: pause after an action is prepared but before dispatch cancels it; it never reaches the mock site", async () => {
  const t = tempDir("app-pause-prepared");
  let fired = false;
  let appRef: TaskApp | null = null;
  const app = await openApp(join(t.dir, "task"), {
    beforeSend: (cmd) => {
      if (!fired && cmd.type === "dispatch" && cmd.kind === "chooseSlot") {
        fired = true;
        appRef?.control("pause"); // the user's click lands between preparation and dispatch
      }
    },
  });
  appRef = app;
  try {
    app.start();
    await waitFor(() => phaseOf(app) === "PAUSED", "paused before dispatch");
    await new Promise((r) => setTimeout(r, 100));
    const s = app.state();
    assert.equal(s.site.counts.chooseSlot, 0, "prepared action never sent");
    assert.equal(s.engine.pendingOp, null);
    assert.match(s.trace.join("\n"), /\[取消\] 未发送 选择时段 .*用户已暂停（从未到达模拟官网）/);
    app.control("resume");
    await done(app);
    assert.equal(phaseOf(app), "REHEARSAL_ENDPOINT");
  } finally {
    await app.close();
    t.cleanup();
  }
});

test("R07/R09: restarting the application or editing the plan keeps the purchase identity and the run's bound plan", async () => {
  const t = tempDir("app-identity");
  const dir = join(t.dir, "task");
  try {
    const a = await openApp(dir);
    const taskId = a.state().task.taskId;
    a.start();
    await done(a);
    const runId = a.state().run.runId;
    const edited = { ...FAST_PLAN, label: "FAKE 改名后的计划", maxTotalCny: 9000 };
    assert.ok(a.editPlan(edited).ok);
    assert.equal(a.state().plan.rev, 2);
    assert.equal(a.state().run.boundToCurrentPlan, false, "the finished run stays bound to revision 1");
    await a.close();
    const b = await openApp(dir);
    assert.equal(b.state().task.taskId, taskId, "a restart never creates a fresh purchase identity");
    assert.equal(b.state().run.runId, runId);
    assert.equal(b.state().plan.rev, 2);
    await b.close();
  } finally {
    t.cleanup();
  }
});

test("A12/R09: the fake formal capability is enabled once, bound to task/plan/run; default, wrong phrase, edited plan, expiry and reuse never submit", async () => {
  const t = tempDir("app-formal");
  const app = await openApp(join(t.dir, "task"));
  try {
    const h = app.state().plan.planHash;
    assert.equal(app.armFormal(h, "随便").ok, false, "wrong phrase");
    assert.equal(app.armFormal("0123456789abcdef", FORMAL_PHRASE).ok, false, "must review the current plan");
    assert.ok(app.armFormal(h, FORMAL_PHRASE).ok);
    assert.equal(app.armFormal(h, FORMAL_PHRASE).ok, false, "enabled once only");
    // plan deviation after review: the bound capability no longer matches, the engine blocks the submit
    app.editPlan({ ...FAST_PLAN, label: "FAKE 核对后又被修改" });
    app.start("submit-confirm");
    await done(app);
    let s = app.state();
    assert.equal(s.engine.phase, "BLOCKED");
    assert.equal(s.engine.reason, "formal-capability-plan-mismatch");
    assert.equal(s.site.counts.submitOrder, 0);
    // reuse: the arm was consumed by that run; the next run is a default rehearsal and cannot submit
    app.start("submit-confirm");
    await done(app);
    s = app.state();
    assert.equal(s.engine.phase, "REHEARSAL_ENDPOINT");
    assert.equal(s.site.counts.submitOrder, 0);
    assert.equal(s.formal.used !== null, true);
  } finally {
    await app.close();
    t.cleanup();
  }
});

test("A12: an expired capability blocks; a valid one submits one mock order, then the task can never submit again", async () => {
  const t = tempDir("app-formal-ok");
  const app = await openApp(join(t.dir, "task"));
  try {
    assert.ok(app.armFormal(app.state().plan.planHash, FORMAL_PHRASE).ok);
    const doc = app.doc();
    (doc.formalArm as { expiresAt: number }).expiresAt = Date.now() - 1;
    app.store.save(doc);
    app.start("submit-confirm");
    await done(app);
    assert.equal(app.state().engine.reason, "formal-capability-expired");
    assert.equal(app.state().site.counts.submitOrder, 0);

    const t2 = tempDir("app-formal-ok2");
    const b = await openApp(join(t2.dir, "task"));
    try {
      assert.ok(b.armFormal(b.state().plan.planHash, FORMAL_PHRASE).ok);
      b.start("submit-confirm");
      await done(b);
      assert.equal(b.state().engine.phase, "ORDER_CONFIRMED_MOCK");
      assert.equal(b.state().site.counts.submitOrder, 1);
      assert.equal(b.start().ok, false, "at most one purchase per task");
    } finally {
      await b.close();
      t2.cleanup();
    }
  } finally {
    await app.close();
    t.cleanup();
  }
});

test("A07/R07: after an unknown mock final submit, a new start, an edited plan and recovery stay read-only; no second submit", async () => {
  const t = tempDir("app-unknown-submit");
  const dir = join(t.dir, "task");
  try {
    const app = await openApp(dir);
    app.armFormal(app.state().plan.planHash, FORMAL_PHRASE);
    app.start("submit-unknown");
    await done(app);
    assert.equal(app.state().engine.phase, "MANUAL_VERIFICATION");
    assert.equal(app.state().site.counts.submitOrder, 1);
    assert.equal(app.state().ledger.status, "unknown");
    assert.equal(app.start().ok, false);
    app.editPlan({ ...FAST_PLAN, label: "FAKE 想换个名字绕过台账", maxTotalCny: 9500 });
    assert.equal(app.start().ok, false, "a plan edit cannot evade the prior final-submit result");
    await app.close();
    const b = await openApp(dir);
    assert.match(String(b.startBlocker()), /最终提交记录/);
    const lookupsBefore = b.state().site.counts.lookupOrder;
    assert.ok(b.recover().ok, "the supported recovery entry performs read-only verification");
    await done(b);
    const s = b.state();
    assert.equal(s.engine.phase, "MANUAL_VERIFICATION");
    assert.ok(s.site.counts.lookupOrder > lookupsBefore, "recovery only performs read-only order lookups");
    assert.equal(s.site.counts.submitOrder, 1, "never a second submit");
    await b.close();
  } finally {
    t.cleanup();
  }
});

test("fail closed: corrupt task, missing identity with history, corrupt owner record and corrupt ledger are never overwritten", async () => {
  const t = tempDir("app-fail-closed");
  try {
    const d1 = join(t.dir, "corrupt-task");
    mkdirSync(d1, { recursive: true });
    writeFileSync(join(d1, "task.json"), "{not json");
    const r1 = await TaskApp.open({ taskDir: d1, initialPlan: FAST_PLAN });
    assert.equal(r1.ok, false);
    assert.equal(!r1.ok && r1.reason, "task-corrupt");
    assert.equal(readFileSync(join(d1, "task.json"), "utf8"), "{not json", "evidence kept");

    const d2 = join(t.dir, "identity-missing");
    mkdirSync(join(d2, "runs"), { recursive: true });
    const r2 = await TaskApp.open({ taskDir: d2, initialPlan: FAST_PLAN });
    assert.equal(!r2.ok && r2.reason, "task-identity-missing");

    const d3 = join(t.dir, "owner-corrupt");
    mkdirSync(d3, { recursive: true });
    writeFileSync(join(d3, "owner.json"), "garbage");
    const r3 = await TaskApp.open({ taskDir: d3, initialPlan: FAST_PLAN });
    assert.equal(!r3.ok && r3.reason, "owner-record-corrupt");
    assert.equal(readFileSync(join(d3, "owner.json"), "utf8"), "garbage");

    const d4 = join(t.dir, "ledger-corrupt");
    const app = await openApp(d4);
    writeFileSync(join(d4, "purchase-ledger.json"), "[{\"planHash\":\"zz\"}]");
    const r = app.start();
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.message, /台账损坏/);
    await app.close();
  } finally {
    t.cleanup();
  }
});

test("A08/A11: the loopback service validates host, origin, token and the tab control lease; concurrent starts yield one run", async () => {
  const t = tempDir("app-http");
  const app = await openApp(join(t.dir, "task"), { latencyMs: 20 });
  const srv = await startServer(app);
  const a = new Tab(srv.port, "c-tabaaaaaaaa");
  const b = new Tab(srv.port, "c-tabbbbbbbbb");
  try {
    const page = await fetch(`http://127.0.0.1:${srv.port}/`);
    assert.match(String(page.headers.get("content-security-policy")), /default-src 'none'; script-src 'self'/);
    const html = await page.text();
    assert.ok(!/https?:\/\/(?!127\.0\.0\.1)/.test(html), "no third-party asset URLs");
    await a.load();
    await b.load();
    // DNS-rebinding style host, foreign origin, missing token
    // (fetch drops a custom Host header, so a raw loopback request carries the foreign Host)
    const badHost = await new Promise<number>((ok, fail) => {
      const req = http.request({ host: "127.0.0.1", port: srv.port, path: "/api/state", headers: { host: "evil.example", "x-session-token": a.token } }, (res) => {
        res.resume();
        ok(res.statusCode ?? 0);
      });
      req.on("error", fail);
      req.end();
    });
    assert.equal(badHost, 421);
    assert.equal((await a.post("/api/start", {}, { origin: "http://evil.example" })).status, 403);
    assert.equal((await a.post("/api/start", {}, { "x-session-token": "00" })).status, 403);
    // control lease: needs a live event stream; a second live tab cannot steal it
    assert.equal((await a.post("/api/claim")).status, 409);
    await a.connect();
    await b.connect();
    assert.equal((await a.post("/api/claim")).status, 200);
    assert.equal((await b.post("/api/claim")).body.code, "controlled-elsewhere");
    assert.equal((await b.post("/api/start")).body.code, "not-controller");
    const [s1, s2] = await Promise.all([a.post("/api/start"), a.post("/api/start")]);
    assert.deepEqual([s1.status, s2.status].sort(), [200, 409], "exactly one run starts");
    // any authenticated tab may pause (it only reduces automation); only the controller may resume
    assert.equal((await b.post("/api/control", { action: "pause" })).status, 200);
    await waitFor(() => phaseOf(app) === "PAUSED", "paused from second tab");
    assert.equal((await b.post("/api/control", { action: "resume" })).body.code, "not-controller");
    // the lease moves only when the controlling tab's stream actually closes
    a.disconnect();
    await waitFor(async () => (await b.post("/api/claim")).status === 200, "lease released after real close");
    assert.equal((await b.post("/api/control", { action: "resume" })).status, 200);
    await done(app);
    assert.equal(phaseOf(app), "REHEARSAL_ENDPOINT");
    const st = await b.state();
    assert.equal(st.site.counts.chooseSlot, 2);
    assert.equal(st.runs, undefined);
  } finally {
    a.disconnect();
    b.disconnect();
    await srv.close();
    await app.close();
    t.cleanup();
  }
});
