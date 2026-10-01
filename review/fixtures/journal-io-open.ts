// Codex-owned I/O recovery fixture. The parent test bounds and cleans up only this exact child.
import { TaskApp, isInsideTestRuns } from "../../src/app/task-app.ts";
import { FORMAL_PHRASE } from "../../src/app/task-store.ts";

const [taskDir] = process.argv.slice(2);
if (!taskDir || !isInsideTestRuns(taskDir)) throw new Error("Fixture task must be physically inside test-runs");
let app: TaskApp | null = null;
let payload: Record<string, unknown>;
try {
  const opened = await TaskApp.open({ taskDir, initialPlan: null, latencyMs: 2 });
  if (!opened.ok) {
    payload = { opened: false, refused: opened.reason };
  } else {
    app = opened.app;
    const state = app.state();
    const before = app.site.counts;
    payload = {
      opened: true, problem: state.ledger.problem?.cause, corrupt: state.ledger.corrupt,
      start: app.start().ok, recover: app.recover().ok,
      arm: app.armFormal(state.plan.planHash, FORMAL_PHRASE).ok,
      countsBefore: before, countsAfter: app.site.counts,
    };
  }
} catch (error) {
  // Report only a code. Do not leak private filesystem error messages or encourage permission changes.
  payload = { opened: false, threw: true, code: (error as NodeJS.ErrnoException).code ?? "unexpected" };
} finally {
  await app?.close();
}
console.log(`JOURNAL-IO-OPEN ${JSON.stringify(payload)}`);

