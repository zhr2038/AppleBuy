// Independent C-003 review: executor quiescence and loss of durable purchase evidence.
import { test } from "node:test";
import assert from "node:assert/strict";
import { symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TaskApp } from "../src/app/task-app.ts";
import { FORMAL_PHRASE } from "../src/app/task-store.ts";
import { readJournal } from "../src/journal.ts";
import { renderApp } from "../web/render.js";
import { FAST_PLAN, openApp, waitFor } from "../test/app-helpers.ts";
import { tempDir } from "../test/helpers.ts";

test("review C-003: close must quiesce the executor before handing off ownership; late replies cannot write", async () => {
  const tmp = tempDir("review-clean-handoff");
  const dir = join(tmp.dir, "task");
  const first = await openApp(dir, { hold: ["chooseSlot@2"] });
  let second: TaskApp | null = null;
  try {
    assert.ok(first.start().ok);
    await waitFor(() => first.site.heldCount === 1, "accepted choice reply held");
    const before = first.state();
    assert.equal(before.site.counts.chooseSlot, 2);
    await first.close();
    assert.equal(first.running, false, "close completed while its old engine loop was still alive");
    const reopened = await TaskApp.open({ taskDir: dir, initialPlan: FAST_PLAN, latencyMs: 2 });
    assert.ok(reopened.ok, reopened.ok ? "" : reopened.detail);
    second = reopened.app;
    const snapshot = readJournal(second.store.journalPath(before.run!.runId), before.run!.planHash);
    assert.ok(snapshot.ok);
    const count = snapshot.records.length;
    first.site.setHold([]);
    first.site.releaseHeld();
    await new Promise((r) => setTimeout(r, 60));
    const after = readJournal(second.store.journalPath(before.run!.runId), before.run!.planHash);
    assert.ok(after.ok, "a late reply from the closed executor broke the durable journal");
    assert.equal(after.records.length, count, "closed executor appended after ownership handoff");
    assert.equal(first.start().ok, false, "closed executor can start another run without ownership");
    assert.equal(first.editPlan({ ...FAST_PLAN, label: "FAKE closed-owner edit" }).ok, false);
  } finally {
    first.site.setHold([]);
    first.site.releaseHeld();
    if (first.running) first.control("stop");
    await first.idle();
    await first.close();
    await second?.close();
    tmp.cleanup();
  }
});

for (const mode of ["missing", "empty"] as const) {
  test(`review C-003: ${mode} task ledger cannot erase an unknown final submission`, async () => {
    const tmp = tempDir(`review-ledger-${mode}`);
    const app = await openApp(join(tmp.dir, "task"));
    try {
      assert.ok(app.armFormal(app.state().plan.planHash, FORMAL_PHRASE).ok);
      assert.ok(app.start("submit-unknown").ok);
      await app.idle();
      assert.equal(app.state().engine.phase, "MANUAL_VERIFICATION");
      assert.equal(app.state().site.counts.submitOrder, 1);
      const path = join(app.store.dir, "purchase-ledger.json");
      if (mode === "missing") unlinkSync(path);
      else writeFileSync(path, "[]");
      const before = app.site.counts;
      const next = app.start();
      assert.equal(next.ok, false, "loss of the ledger made an uncertain task eligible for new mutations");
      assert.deepEqual(app.site.counts, before, "blocked start must be entirely read-only");
    } finally {
      await app.idle();
      await app.close();
      tmp.cleanup();
    }
  });
}

test("review C-003: a missing journal for a recorded run fails closed", async () => {
  const tmp = tempDir("review-missing-run-log");
  const app = await openApp(join(tmp.dir, "task"));
  try {
    assert.ok(app.start().ok);
    await app.idle();
    const run = app.state().run!;
    unlinkSync(app.store.journalPath(run.runId));
    const before = app.site.counts;
    assert.equal(app.start().ok, false, "missing run history was interpreted as a safe never-started run");
    assert.deepEqual(app.site.counts, before);
  } finally {
    await app.idle();
    await app.close();
    tmp.cleanup();
  }
});

test("review C-003: directory aliases cannot create two owners of the same durable task", async () => {
  const tmp = tempDir("review-directory-alias");
  const dir = join(tmp.dir, "task");
  const alias = join(tmp.dir, "task-alias");
  const first = await openApp(dir);
  let second: TaskApp | null = null;
  try {
    symlinkSync(dir, alias, process.platform === "win32" ? "junction" : "dir");
    const attempt = await TaskApp.open({ taskDir: alias, initialPlan: FAST_PLAN });
    if (attempt.ok) second = attempt.app;
    assert.equal(attempt.ok, false, "two spellings of one physical directory acquired separate task locks");
    assert.equal(!attempt.ok && attempt.reason, "held");
  } finally {
    await second?.close();
    await first.close();
    // Both junction and destination were created in this contained test directory.
    tmp.cleanup();
  }
});

test("review C-003: restart shows verified historical facts without inventing a fresh observation", async () => {
  const tmp = tempDir("review-history-display");
  const dir = join(tmp.dir, "task");
  let app = await openApp(dir);
  try {
    app.start();
    await app.idle();
    const before = app.state();
    const log = readJournal(app.store.journalPath(before.run!.runId), before.run!.planHash);
    assert.ok(log.ok);
    const observationTime = log.records.filter((r) => r.type === "observation" && r.state === "PRE_PAYMENT").at(-1)!.t;
    await app.close();
    app = await openApp(dir);
    const after = app.state();
    assert.equal(after.engine.acceptedSlot, before.engine.acceptedSlot, "known accepted slot disappeared from the status card");
    assert.equal(after.engine.refusals, 1, "durable refusal was displayed as zero after restart");
    assert.equal(after.engine.mutations, 3);
    assert.equal(after.engine.lastValidObservationAt, observationTime, "display timestamp comes from durable evidence");
    assert.equal(after.engine.historical, true, "history must be labelled as history, not a current observation");
    assert.deepEqual(after.engine.candidates, [], "old slot references are never a fresh actionable list");
    assert.deepEqual(after.site.counts, before.site.counts, "displaying history must not call the mock port");
  } finally {
    await app.close();
    tmp.cleanup();
  }
});

test("review C-003: editing a future plan cannot relabel the active run's bound target", async () => {
  const tmp = tempDir("review-bound-target-view");
  const app = await openApp(join(tmp.dir, "task"));
  try {
    app.start();
    await app.idle();
    const edit = { ...FAST_PLAN, products: FAST_PLAN.products.map((p) => ({ ...p, color: "FAKE UI_NEW_COLOR" })) };
    assert.ok(app.editPlan(edit).ok);
    const state = app.state();
    assert.equal(state.run!.boundToCurrentPlan, false);
    const html = renderApp({ ...state, control: { you: true, held: true, clients: 1 } });
    assert.ok(!html.includes("FAKE UI_NEW_COLOR"), "status target was taken from the future editor plan instead of the bound run");
    assert.ok(html.includes(FAST_PLAN.products[0].color));
  } finally {
    await app.close();
    tmp.cleanup();
  }
});

test("review C-003: evidence corruption between preparation and dispatch blocks even slot mutations", async () => {
  const tmp = tempDir("review-midrun-corruption");
  const dir = join(tmp.dir, "task");
  let injected = false;
  const app = await openApp(dir, { beforeSend: (cmd) => {
    if (!injected && cmd.type === "dispatch" && cmd.kind === "chooseSlot") {
      injected = true;
      writeFileSync(join(dir, "purchase-ledger.json"), "corrupted-between-prepare-and-send");
    }
  } });
  try {
    app.start();
    await app.idle();
    const state = app.state();
    assert.equal(state.site.counts.chooseSlot, 0, "slot mutation was sent despite corrupt critical evidence");
    assert.equal(state.site.counts.advance + state.site.counts.submitOrder, 0);
    assert.equal(state.engine.needsHuman, true);
    assert.equal(app.start().ok, false);
  } finally {
    await app.close();
    tmp.cleanup();
  }
});
