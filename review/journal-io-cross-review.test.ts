// Codex independent R2-1/R2-2 acceptance. Real filesystem errors, fake site, contained state only.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, renameSync } from "node:fs";
import { join, resolve } from "node:path";
import { FORMAL_PHRASE } from "../src/app/task-store.ts";
import { openApp, FAST_PLAN } from "../test/app-helpers.ts";
import { isInsideTestRuns, tempDir } from "../test/helpers.ts";
import { renderApp } from "../web/render.js";

function unreadableJournal(path: string): Buffer {
  const bytes = readFileSync(path);
  renameSync(path, `${path}.kept`);
  mkdirSync(path); // readFileSync raises EISDIR/EPERM; original evidence remains beside it.
  return bytes;
}

for (const which of ["older", "latest"] as const) {
  test(`review R2-1: ${which} journal I/O is a normal named blocker for state/start/recover/arm`, async () => {
    const tmp = tempDir(`review-journal-io-${which}`);
    const app = await openApp(join(tmp.dir, "task"));
    try {
      assert.ok(app.start().ok);
      await app.idle();
      const first = app.state().run!.runId;
      assert.ok(app.start().ok);
      await app.idle();
      const healthy = app.state();
      const runId = which === "older" ? first : healthy.run!.runId;
      const journalPath = app.store.journalPath(runId);
      const taskBytes = readFileSync(app.store.taskPath);
      const ledgerPath = join(app.store.dir, "purchase-ledger.json");
      const ledgerBytes = readFileSync(ledgerPath);
      const journalBytes = unreadableJournal(journalPath);
      const before = app.site.counts;
      const calls = [
        ["state", () => app.state()],
        ["start", () => app.start()],
        ["recover", () => app.recover()],
        ["arm", () => app.armFormal(healthy.plan.planHash, FORMAL_PHRASE)],
      ] as const;
      const results = calls.map(([name, call]) => {
        try { return { name, threw: false, value: call() }; }
        catch (error) { return { name, threw: true, code: (error as NodeJS.ErrnoException).code ?? "unexpected" }; }
      });
      await app.idle(); // finish an erroneously admitted flow so counters reveal the regression.
      assert.deepEqual(app.site.counts, before, "no fake site operation may be sent");
      assert.deepEqual(readFileSync(app.store.taskPath), taskBytes);
      assert.deepEqual(readFileSync(ledgerPath), ledgerBytes);
      assert.deepEqual(readFileSync(`${journalPath}.kept`), journalBytes);
      assert.ok(results.every((r) => !r.threw), `normal fail-closed results required: ${JSON.stringify(results.map(({ name, threw, ...rest }) => ({ name, threw, code: rest.code })))}`);
      const state: any = results[0].value;
      assert.equal(state.ledger.problem.cause, "run-journal-unverifiable");
      assert.equal(state.ledger.problem.runId, runId);
      assert.equal(state.ledger.corrupt, false);
      const view = renderApp(state);
      assert.ok(view.includes(`runs/${runId}/journal.jsonl`));
      assert.match(view, /日志.*(读取|无法验证)/);
      assert.doesNotMatch(view, /购买台账：损坏/);
      for (const result of results.slice(1)) {
        const value: any = result.value;
        assert.equal(value.ok, false, result.name);
        assert.ok(value.message.includes(`runs/${runId}/journal.jsonl`), result.name);
        assert.match(value.message, /人工/);
        assert.match(value.message, /不要删除历史/);
      }
    } finally {
      await app.close();
      tmp.cleanup();
    }
  });
}

test("review R2-1: reopening an unreadable latest journal leaves a usable blocked app and releases its owner", async () => {
  const tmp = tempDir("review-journal-io-open");
  const dir = join(tmp.dir, "task");
  const app = await openApp(dir);
  let child: ReturnType<typeof spawn> | null = null;
  let exited: Promise<number | null> | null = null;
  try {
    assert.ok(app.start().ok);
    await app.idle();
    const journalPath = app.store.journalPath(app.state().run!.runId);
    await app.close();
    const bytes = unreadableJournal(journalPath);
    const taskBytes = readFileSync(app.store.taskPath);
    const ledgerPath = join(dir, "purchase-ledger.json");
    const ledgerBytes = readFileSync(ledgerPath);
    assert.ok(isInsideTestRuns(dir));
    child = spawn(process.execPath, [resolve(import.meta.dirname, "fixtures", "journal-io-open.ts"), dir], {
      cwd: resolve(import.meta.dirname, ".."), windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    });
    exited = new Promise((done) => child!.once("exit", done));
    const outcome = await new Promise<any>((done, fail) => {
      let output = "";
      const timer = setTimeout(() => fail(new Error("owned journal I/O fixture timed out")), 5000);
      child!.stdout!.setEncoding("utf8");
      child!.stdout!.on("data", (chunk: string) => {
        output += chunk;
        const match = /JOURNAL-IO-OPEN (\{[^\n]+\})/.exec(output);
        if (match) { clearTimeout(timer); done(JSON.parse(match[1])); }
      });
      child!.once("error", (error) => { clearTimeout(timer); fail(error); });
      child!.once("exit", () => { clearTimeout(timer); if (!output.includes("JOURNAL-IO-OPEN ")) fail(new Error("owned fixture exited before its result")); });
      child!.stderr!.resume();
    });
    const cleanExit = await new Promise<boolean>((done) => {
      const timer = setTimeout(() => done(false), 500);
      void exited!.then(() => { clearTimeout(timer); done(true); });
    });
    assert.equal(outcome.opened, true, `open must return a blocked app rather than throw after ownership: ${JSON.stringify(outcome)}`);
    assert.equal(cleanExit, true, "normal close must release the pipe/owner without terminating the child");
    assert.equal(outcome.problem, "run-journal-unverifiable");
    assert.equal(outcome.corrupt, false);
    assert.equal(outcome.start, false);
    assert.equal(outcome.recover, false);
    assert.equal(outcome.arm, false);
    assert.deepEqual(outcome.countsAfter, outcome.countsBefore);
    assert.deepEqual(readFileSync(app.store.taskPath), taskBytes);
    assert.deepEqual(readFileSync(ledgerPath), ledgerBytes);
    assert.deepEqual(readFileSync(`${journalPath}.kept`), bytes);
    const reopened = await openApp(dir);
    try { assert.equal(reopened.state().ledger.problem?.cause, "run-journal-unverifiable"); }
    finally { await reopened.close(); }
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) child.kill(); // exact owned child only
    if (exited) await exited;
    await app.close();
    tmp.cleanup();
  }
});

test("review R2-2: saving a future plan with inconsistent evidence never claims an observed final submit", async () => {
  const tmp = tempDir("review-plan-evidence-wording");
  const app = await openApp(join(tmp.dir, "task"));
  try {
    mkdirSync(join(app.store.dir, "runs", "run-orphan"), { recursive: true });
    const before = app.site.counts;
    const saved = app.editPlan({ ...FAST_PLAN, label: "FAKE independent future-plan edit" });
    assert.equal(saved.ok, true);
    assert.match(saved.message, /证据|不一致/);
    assert.doesNotMatch(saved.message, /已有最终提交记录/);
    assert.equal(app.start().ok, false);
    assert.equal(app.state().ledger.problem?.cause, "orphan-run-evidence");
    assert.deepEqual(app.site.counts, before);
    assert.equal(app.site.counts.submitOrder, 0);
    assert.equal(app.site.view().orders, 0);
  } finally {
    await app.close();
    tmp.cleanup();
  }
});
