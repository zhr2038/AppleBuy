// F1 / F2 (A06/A07/A09/A10): prepared-vs-sent truth at the real port boundary, through the runner.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Engine } from "../src/engine.ts";
import { MemoryJournal, MemoryLedger } from "../src/journal.ts";
import { planHash } from "../src/plan.ts";
import { FAKE_PLAN, S, key } from "../src/mock/scenarios.ts";
import { FAKE_CONTEXT, page, res, stepPage } from "../src/mock/fake-port.ts";
import { VirtualClock, runEngine } from "../src/runner.ts";
import type { CheckoutPort, Envelope, PortReply } from "../src/runner.ts";
import { formatRecord } from "../src/messages.ts";
import { classifyPage } from "../src/observe.ts";

const PH = planHash(FAKE_PLAN);

function setup(chooseReply: (opId: string, ref: string, n: number) => PortReply, pages: unknown[]) {
  const clock = new VirtualClock();
  const journal = new MemoryJournal();
  const engine = new Engine({ plan: FAKE_PLAN, planHash: PH, runId: "run-test", journal, ledger: new MemoryLedger(), now: clock.now, portKind: "mock" });
  const calls: string[] = [];
  let n = 0;
  let o = 0;
  const port: CheckoutPort = {
    kind: "mock", label: "FAKE dispatch-boundary port",
    observe: async () => {
      calls.push("observe");
      return { body: pages[Math.min(o++, pages.length - 1)], simulatedMs: 50 };
    },
    chooseSlot: async (opId, ref) => {
      calls.push(`choose:${ref}`);
      return chooseReply(opId, ref, n++);
    },
    advance: async (opId) => {
      calls.push("advance");
      return { body: res(opId, "accepted"), simulatedMs: 50 };
    },
    submitOrder: async () => {
      throw new Error("unexpected-submit");
    },
    lookupOrder: async () => {
      throw new Error("unexpected-lookup");
    },
  };
  return { clock, journal, engine, port, calls };
}

test("F1: pause, takeover and stop arriving after an emitted advance cancel it before the port; journal says not sent", async () => {
  for (const action of ["pause", "takeover", "stop"] as const) {
    const post: Envelope[] = [{ ch: "control", action }];
    const t = setup((opId) => ({ body: res(opId, "accepted"), simulatedMs: 50, post }), [page(1, [[S.A1, true]])]);
    const run = await runEngine(t.engine, t.port, t.clock, { maxSteps: 20 });
    assert.deepEqual(t.calls, ["observe", "choose:r1-0"], action);
    assert.deepEqual(run.dispatched.map((d) => d.kind), ["chooseSlot"]);
    assert.deepEqual(run.cancelled.map((d) => d.kind), ["advance"]);
    const recs = t.journal.records();
    const adv = recs.find((r) => r.type === "intent" && r.kind === "advance");
    assert.ok(adv);
    assert.ok(recs.some((r) => r.type === "cancelled" && r.opId === adv.opId));
    assert.ok(!recs.some((r) => r.type === "sent" && r.opId === adv.opId));
    assert.equal(t.engine.snapshot().acceptedSlot, key(S.A1), "the accepted slot truth is kept");
    assert.equal(t.engine.snapshot().pendingOp, null);
    const zh = recs.map((r) => formatRecord(r)).filter(Boolean).join("\n");
    assert.match(zh, /\[取消\] 未发送 继续结账/);
  }
});

test("F1: after a cancelled advance, resume re-observes and the accepted continuation proceeds automatically", async () => {
  const t = setup((opId) => ({ body: res(opId, "accepted"), simulatedMs: 50, post: [{ ch: "control", action: "pause" }] }), [page(1, [[S.A1, true]])]);
  await runEngine(t.engine, t.port, t.clock, { maxSteps: 20 });
  assert.equal(t.engine.phase, "PAUSED");
  const cmds = t.engine.handle({ type: "control", action: "resume" });
  assert.deepEqual(cmds.map((c) => c.type), ["observe"], "resume first re-observes; nothing is replayed blindly");
  assert.equal(t.engine.authorize(cmds[0]).send, true);
  const out = t.engine.handle({ type: "observation", obs: classifyPage(stepPage(2, "checkout-review", S.A1)) });
  const adv = out.find((c) => c.type === "dispatch");
  assert.ok(adv && adv.type === "dispatch" && adv.kind === "advance", "accepted continuation re-issued after resume");
  assert.equal(t.engine.authorize(adv).send, true);
});

test("F1: a newer list arriving after a chooseSlot was prepared supersedes it; only the newest ref is clicked", async () => {
  const newer = page(2, [[S.A1, false], [S.A2, true]]);
  const t = setup((opId, ref) => ({ body: res(opId, ref === "r2-1" ? "accepted" : "rejected", { code: "stale-ref", slotRefused: true }), simulatedMs: 50 }), [
    { ...page(1, [[S.A1, true], [S.A2, true]]) },
  ]);
  // the first observe reply carries a post-event page: the list changed before the click could be sent
  const base = t.port.observe;
  let first = true;
  t.port.observe = async () => {
    const r = await base();
    if (first) {
      first = false;
      return { ...r, post: [{ ch: "page", body: newer }] };
    }
    return { body: stepPage(3, "pre-payment", S.A2), simulatedMs: 50 };
  };
  const run = await runEngine(t.engine, t.port, t.clock, { maxSteps: 30 });
  assert.deepEqual(t.calls.filter((c) => c.startsWith("choose")), ["choose:r2-1"], "the superseded r1 click was never sent");
  assert.ok(run.cancelled.some((c) => c.kind === "chooseSlot"));
  assert.equal(t.engine.snapshot().acceptedSlot, key(S.A2));
  assert.equal(run.phase, "REHEARSAL_ENDPOINT");
});

test("F1: a price change between acceptance and the advance send blocks it even without a step page", async () => {
  const t = setup((opId) => ({ body: res(opId, "accepted"), simulatedMs: 50, post: [{ ch: "page", body: page(2, [[S.A1, true]], { context: { ...FAKE_CONTEXT, totalCny: 99999 } }) }] }), [page(1, [[S.A1, true]])]);
  await runEngine(t.engine, t.port, t.clock, { maxSteps: 20 });
  assert.ok(!t.calls.includes("advance"));
  assert.equal(t.engine.phase, "TAKEOVER");
});
