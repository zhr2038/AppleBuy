// A14: the seeded benchmark is reproducible, warm-up is excluded, both policies get the identical workload,
// and the acceptance metric ends at acceptance. Small run counts keep this test fast; the CLI runs 200+.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dist, runBench } from "../src/bench.ts";
import { FAKE_PLAN } from "../src/mock/scenarios.ts";

test("A14: nearest-rank distribution", () => {
  assert.deepEqual(dist([5, 1, 3, 2, 4]), { n: 5, p50: 3, p95: 5, max: 5 });
  assert.equal(dist([]).n, 0);
});

test("A14: same seed gives identical decision outcomes; warm-up is not counted", async () => {
  const a = await runBench(FAKE_PLAN, { runs: 12, warmup: 3, seed: 7 });
  const b = await runBench(FAKE_PLAN, { runs: 12, warmup: 0, seed: 7 });
  assert.equal(a.measured, 12);
  assert.equal(a.warmup, 3);
  for (const i of [0, 1]) {
    const pa = a.policies[i];
    const pb = b.policies[i];
    assert.equal(pa.runs, 12);
    assert.deepEqual(pa.outcomes, pb.outcomes, "warm-up runs use different seeds and never leak into measured results");
    assert.deepEqual(pa.attemptsToAccept, pb.attemptsToAccept);
    assert.deepEqual(pa.simulatedMsToAccept, pb.simulatedMsToAccept);
    assert.equal(Object.values(pa.outcomes).reduce((x, y) => x + y, 0), 12);
    assert.equal(pa.maxConcurrentMutations <= 1, true, "single in-flight mutation");
    if (pa.simulatedMsToAccept.n > 0) assert.ok(pa.simulatedMsToAccept.p50 <= pa.simulatedMsToRunEnd.p50);
  }
  assert.deepEqual(a.policies.map((p) => p.policy), ["fresh-list", "naive-remembered"]);
  assert.equal(a.policies[0].staleRefActions, 0, "the fresh-list policy never clicks a stale reference");
  assert.match(String(a.environment.commit), /未测量/, "git metadata is reported as unmeasured, not invented");
});
