// Codex-owned acceptance: performance labels end at the event they name (A14).
import test from "node:test";
import assert from "node:assert/strict";
import { runBench } from "../src/bench.ts";
import { Engine } from "../src/engine.ts";
import { MemoryJournal, MemoryLedger } from "../src/journal.ts";
import { planHash } from "../src/plan.ts";
import { FAKE_PLAN } from "../src/mock/scenarios.ts";
import { SimStorePort } from "../src/mock/fake-port.ts";
import { runEngine, VirtualClock, type CheckoutPort } from "../src/runner.ts";

test("A14: reported simulated time to acceptance excludes later checkout advance and endpoint observation", async () => {
  const report = await runBench(FAKE_PLAN, { runs: 1, warmup: 0, seed: 1 });
  for (const policy of report.policies) {
    const clock = new VirtualClock();
    const engine = new Engine({ plan: FAKE_PLAN, planHash: planHash(FAKE_PLAN), runId: "review-bench", journal: new MemoryJournal(), ledger: new MemoryLedger(), now: clock.now, portKind: "mock", policy: policy.policy });
    const target = new SimStorePort(100000, FAKE_PLAN);
    let acceptedAt: number | null = null;
    const port: CheckoutPort = {
      kind: "mock", label: "FAKE reviewer benchmark boundary",
      observe: () => target.observe(),
      chooseSlot: async (opId, ref) => {
        const reply = await target.chooseSlot(opId, ref);
        const body = reply.body as { result?: string };
        if (body.result === "accepted") acceptedAt = clock.now() + reply.simulatedMs;
        return reply;
      },
      advance: opId => target.advance(opId),
      submitOrder: (opId, capability) => target.submitOrder(opId, capability),
      lookupOrder: opId => target.lookupOrder(opId),
    };
    const result = await runEngine(engine, port, clock);
    assert.ok(acceptedAt !== null && result.simulatedElapsedMs > acceptedAt);
    assert.equal(policy.simulatedMsToAccept.n, 1);
    assert.equal(policy.simulatedMsToAccept.p50, acceptedAt, `${policy.policy}: later advance and page observation are outside a time-to-acceptance metric`);
  }
});
