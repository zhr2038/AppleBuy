// C-003-R2: task-wide durable evidence includes the physical runs/ directory, and every refusal names the
// artifact actually at fault. All state is FAKE and contained in .local/test-runs; no network, no real order.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { TEST_RUNS_ROOT, TaskApp, isInsideTestRuns, physicalPath } from "../src/app/task-app.ts";
import { FORMAL_PHRASE } from "../src/app/task-store.ts";
import { renderApp } from "../web/render.js";
import { openApp } from "./app-helpers.ts";
import { tempDir } from "./helpers.ts";

test("F1: a pre-arm backup restore refuses arm, start and recover, sends nothing and rewrites no artifact", async () => {
  const tmp = tempDir("app-evidence-prearm");
  const dir = join(tmp.dir, "task");
  const first = await openApp(dir);
  let again: TaskApp | null = null;
  try {
    // Backup taken BEFORE arming: restoring it would otherwise make arming itself eligible again.
    const taskBytes = readFileSync(join(dir, "task.json"));
    const ledgerBytes = readFileSync(join(dir, "purchase-ledger.json"));
    assert.ok(first.armFormal(first.state().plan.planHash, FORMAL_PHRASE).ok);
    assert.ok(first.start("submit-confirm").ok);
    await first.idle();
    const runId = first.state().run!.runId;
    assert.equal(first.site.view().orders, 1);
    await first.close();
    const journalPath = join(dir, "runs", runId, "journal.jsonl");
    const journalBytes = readFileSync(journalPath);
    writeFileSync(join(dir, "task.json"), taskBytes);
    writeFileSync(join(dir, "purchase-ledger.json"), ledgerBytes);

    again = await openApp(dir);
    const before = again.site.counts;
    const arm = again.armFormal(again.state().plan.planHash, FORMAL_PHRASE);
    assert.equal(arm.ok, false);
    assert.equal(!arm.ok && arm.code, "evidence");
    assert.match(arm.message, new RegExp(`runs/${runId}`));
    const start = again.start("submit-confirm");
    await again.idle();
    assert.equal(start.ok, false);
    assert.match(start.message, /未登记的运行证据/);
    assert.doesNotMatch(start.message, /购买台账损坏/);
    assert.equal(again.recover().ok, false);
    assert.deepEqual(again.site.counts, before);
    assert.equal(again.site.view().orders, 1);

    const s = again.state();
    assert.equal(s.ledger.problem?.cause, "orphan-run-evidence");
    assert.equal(s.ledger.problem?.runId, runId);
    assert.equal(s.ledger.corrupt, false);
    assert.equal(s.formal.armed, false, "a refused arm must not be persisted");
    const view = renderApp(s);
    assert.match(view, /持久证据异常/);
    assert.match(view, /不要删除历史/);
    assert.doesNotMatch(view, /购买台账：损坏/);
    // Fail closed without repair: every artifact keeps its exact bytes.
    assert.deepEqual(readFileSync(journalPath), journalBytes);
    assert.deepEqual(readFileSync(join(dir, "purchase-ledger.json")), ledgerBytes);
    assert.deepEqual(readFileSync(join(dir, "task.json")), taskBytes);
  } finally {
    await first.close();
    await again?.close();
    tmp.cleanup();
  }
});

test("F1/F2: evidence that becomes inconsistent between preparation and dispatch stops the send and names the cause", async () => {
  const tmp = tempDir("app-evidence-sendtime");
  const dir = join(tmp.dir, "task");
  let injected = false;
  const app = await openApp(dir, { beforeSend: (cmd) => {
    if (!injected && cmd.type === "dispatch" && cmd.kind === "chooseSlot") {
      injected = true;
      mkdirSync(join(dir, "runs", "run-strayartifact"), { recursive: true });
    }
  } });
  try {
    assert.ok(app.start().ok);
    await app.idle();
    assert.ok(injected);
    const s = app.state();
    assert.equal(s.site.counts.chooseSlot, 0, "slot mutation sent despite unregistered run evidence");
    assert.equal(s.site.counts.advance + s.site.counts.submitOrder, 0);
    assert.equal(s.engine.needsHuman, true);
    assert.match(String(s.loopError), /已停止发送/);
    assert.match(String(s.loopError), /runs\/run-strayartifact/);
    assert.equal(s.ledger.problem?.cause, "orphan-run-evidence");
    assert.equal(s.ledger.corrupt, false);
    const view = renderApp(s);
    assert.match(view, /执行器错误：已停止发送/);
    assert.match(view, /runs\/run-strayartifact/);
    assert.doesNotMatch(view, /购买台账：损坏/);
    assert.ok(existsSync(join(dir, "runs", "run-strayartifact")), "the unexplained artifact is preserved");
    assert.equal(app.start().ok, false);
  } finally {
    await app.close();
    tmp.cleanup();
  }
});

test("F2: each evidence failure reports its own cause; only ledger-file damage is called ledger damage", async () => {
  const tmp = tempDir("app-evidence-causes");
  try {
    // Baseline: intact evidence reports no problem and keeps the legitimate blockers.
    const ok = await openApp(join(tmp.dir, "intact"));
    assert.ok(ok.start().ok);
    await ok.idle();
    assert.equal(ok.state().ledger.problem, null);
    assert.equal(ok.startBlocker(), null);
    await ok.close();

    const cases: { name: string; damage: (app: TaskApp) => void; cause: string; text: RegExp; corrupt: boolean; armed?: boolean }[] = [
      { name: "ledger-missing", damage: (a) => unlinkSync(join(a.store.dir, "purchase-ledger.json")), cause: "ledger-missing", text: /购买台账损坏：购买台账文件 purchase-ledger\.json 缺失/, corrupt: true },
      { name: "journal-garbled", damage: (a) => writeFileSync(a.store.journalPath(a.state().run!.runId), "garbage\n"), cause: "run-journal-unverifiable", text: /日志 runs\/run-[a-z]+\/journal\.jsonl 无法验证/, corrupt: false },
      { name: "ledger-emptied", damage: (a) => writeFileSync(join(a.store.dir, "purchase-ledger.json"), "[]"), cause: "submit-missing-from-ledger", text: /记录了最终提交，但购买台账中没有对应记录/, corrupt: false, armed: true },
      { name: "ledger-foreign", damage: (a) => writeFileSync(join(a.store.dir, "purchase-ledger.json"), JSON.stringify([{ planHash: a.state().plan.planHash, runId: "run-foreignentry", opId: "op-1-1", status: "confirmed" }])), cause: "ledger-foreign-entry", text: /运行 run-foreignentry）在任务文件中没有对应运行/, corrupt: false },
    ];
    for (const c of cases) {
      const app = await openApp(join(tmp.dir, c.name));
      try {
        if (c.armed) assert.ok(app.armFormal(app.state().plan.planHash, FORMAL_PHRASE).ok);
        assert.ok(app.start(c.armed ? "submit-confirm" : "refuse-then-accept").ok);
        await app.idle();
        c.damage(app);
        const before = app.site.counts;
        const start = app.start(c.armed ? "submit-confirm" : "refuse-then-accept");
        await app.idle();
        assert.equal(start.ok, false, c.name);
        assert.match(start.message, c.text, c.name);
        assert.match(start.message, /失败即关闭/, c.name);
        if (!c.corrupt) assert.doesNotMatch(start.message, /购买台账损坏/, c.name);
        assert.equal(app.armFormal(app.state().plan.planHash, FORMAL_PHRASE).ok, false, c.name);
        assert.deepEqual(app.site.counts, before, c.name);
        const s = app.state();
        assert.equal(s.ledger.problem?.cause, c.cause, c.name);
        assert.equal(s.ledger.corrupt, c.corrupt, c.name);
        assert.equal(s.ledger.entries, 1, `${c.name}: unsafe evidence still counts as consumed/unknown`);
        assert.equal(s.ledger.status, "unknown", c.name);
        const view = renderApp(s);
        assert.match(view, c.corrupt ? /购买台账：损坏/ : /购买台账：文件可读，但与运行证据无法核对一致/, c.name);
      } finally {
        await app.close();
      }
    }
  } finally {
    tmp.cleanup();
  }
});

test("nit: fixture enablement follows the physical task path, not a lexical alias under .local/test-runs", () => {
  const junction = join(TEST_RUNS_ROOT, "alias-junction");
  const outside = resolve(TEST_RUNS_ROOT, "..", "..", "not-test-runs");
  const door = resolve(TEST_RUNS_ROOT, "..", "..", "door-into-test-runs");
  // Injected resolver: no real junction is created, so no recursive cleanup can ever follow one outside.
  const realpath = (p: string): string => {
    const r = resolve(p);
    if (r === junction || r.startsWith(junction + sep)) return join(outside, relative(junction, r));
    if (r === door) return join(TEST_RUNS_ROOT, "inside");
    if (r === TEST_RUNS_ROOT) return r;
    throw new Error("ENOENT (fake)");
  };
  assert.equal(isInsideTestRuns(join(junction, "task"), realpath), false, "lexically contained alias to an outside target");
  assert.equal(isInsideTestRuns(join(door, "task"), realpath), true, "physically contained target behind an outside alias");
  assert.equal(isInsideTestRuns(join(TEST_RUNS_ROOT, "plain", "task"), realpath), true, "missing tail under a contained ancestor");
  assert.equal(isInsideTestRuns(TEST_RUNS_ROOT, realpath), false, "the root itself is not a strict descendant");
  assert.equal(physicalPath(join(TEST_RUNS_ROOT, "plain", "task"), realpath), join(TEST_RUNS_ROOT, "plain", "task"));
  // Real filesystem: an ordinary contained temp directory keeps legitimate fixture behaviour.
  const tmp = tempDir("app-evidence-physical");
  try {
    assert.equal(isInsideTestRuns(join(tmp.dir, "task")), true);
  } finally {
    tmp.cleanup();
  }
});
