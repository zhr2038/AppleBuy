// Reviewer measurement of application persistence cost, separate from the in-memory decision benchmark.
// Only contained fake rehearsals; no transport/browser, formal arm or order submission.
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { join } from "node:path";
import { openApp } from "../../test/app-helpers.ts";
import { tempDir } from "../../test/helpers.ts";

const tmp = tempDir("review-history-cost");
const app = await openApp(join(tmp.dir, "task"));
const samples = 30;
const measure = (fn: () => unknown) => {
  for (let n = 0; n < 3; n++) fn();
  const values: number[] = [];
  for (let n = 0; n < samples; n++) {
    const started = performance.now();
    fn();
    values.push(performance.now() - started);
  }
  values.sort((a,b) => a-b);
  return { samples, p50Ms: values[Math.ceil(values.length * 0.5)-1], p95Ms: values[Math.ceil(values.length * 0.95)-1], maxMs: values.at(-1) };
};
try {
  let completed = 0;
  for (const historyRuns of [0,10,50]) {
    while (completed < historyRuns) {
      assert.ok(app.start().ok);
      await app.idle();
      assert.equal(app.state().engine.phase, "REHEARSAL_ENDPOINT");
      completed++;
    }
    assert.equal(app.site.counts.submitOrder, 0);
    console.log(JSON.stringify({ fake: true, scope: "local durable-history reads; not Apple or T1/T2 remote timing", node: process.version, platform: process.platform, historyRuns,
      ledgerEntries: measure(() => app.store.ledger.entries()), appState: measure(() => app.state()), fakeSubmitCalls: app.site.counts.submitOrder }));
  }
} finally {
  await app.close();
  tmp.cleanup();
}
