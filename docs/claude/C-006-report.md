# C-006 implementation report: understandable Chinese rehearsal and a three-date example with the observed slot shape

Author: Claude (Opus 5.5), session `11941a88-…`, 2026-10-02. Offline-only candidate; Codex owns independent acceptance. No live site, no `.local` reads, no customer data, no real mutation.

## Design decisions and reasons

- **Basic path versus advanced details.** The page answers four questions in order:
  - what this is: an offline rehearsal, with real buying not connected and success not meaning a purchase;
  - which example to start;
  - what is happening now: the business step, a **下一步** line, readable date/time and the pending op;
  - what happened: a short business history.

  IDs, hashes, raw slot keys, counters, mock-site internals, the trace, the plan JSON, the other scenarios and the formal arming form all sit inside a collapsed `<details>` element ("高级详情"). The advanced panel is re-rendered only while it is open.
- **Ownership without a separate step.** On its first state, a tab claims the lease only if nobody holds it. Server enforcement is unchanged: one controller, no stealing, and every tab can still pause, take over or stop. A tab that opened read-only never auto-claims later. It shows a "由本页控制" button only after the lease is actually released.
- **Examples are presets, not a second algorithm.** `src/app/presets.ts` has two examples:
  - **basic:** the existing `refuse-then-accept` scenario;
  - **three-date-last:** a new FAKE plan plus the new mock-site scenario `last-slot-three-dates`.

  Loading an example calls the existing `editPlan`. That appends a new revision; earlier revisions and any running binding are unchanged. It is refused when the current plan is not `fake: true`, so it never displaces a possible customer plan. `start("last-slot-three-dates")` is refused unless the current plan is exactly that preset, so the fixture cannot run under an unrelated plan.
- **Slot shape.** The three-date fixture copies only the historical Pro shape: 15-minute options starting at 10:00–10:15, with 2099-01-01 and 2099-01-02 ending at 21:15–21:30.
  - Day 3 deliberately ends at 20:45–21:00, so the last time is visibly read from the list.
  - The first two last slots have capacity 0. They are explicitly refused and then removed from the redrawn list.
  - Stores, dates, capacities and outcomes are all FAKE.

  The existing engine makes every choice; the UI only displays it.
- **Status clarity.**
  - When no loop is running, the status heading reads "上次运行（历史结果，不是新的运行）".
  - The pause, takeover and stop messages and the pending-op text say that an already-sent op is not recalled and is still verified.
  - A simulated formal arm or use is always shown in a red box at the top, outside the advanced section.
  - Durable blockers (ledger and evidence problems, loop errors, start blockers) appear in a red box above the status. Their protected wording is kept.
  - The status target and "运行计划" come from the run's bound plan. The plan a new run would use appears only in the separate "开始一次演练" panel (`renderStart`).
- **Diagnostic truth.**
  - **task.json:** a read I/O error is reported separately from a parse error, in both `TaskStore.load` (`task-unreadable`) and the evidence check ("无法读取（code）" versus "无法解析").
  - **Ledger:** when the evidence check itself threw (`evidence-unverifiable`), the ledger is no longer called "文件可读".
  - **HTTP:** a 500 response and an unavailable state now return bounded Chinese text with an error code. They never include the raw exception message or a path.
- **Layout.** Box-sizing is set globally. Grids wrap with `minmax(0, 1fr)`, and selects and inputs are capped at the container width. Tables sit in scroll boxes and long tokens use `overflow-wrap: anywhere`. Below 480 px the layout is a single column, and the long scenario dropdown sits only in the advanced section. There are no external fonts, scripts or services.

## Changed files

- `src/mock/live-site.ts`: the `last-slot-three-dates` scenario and FAKE fixture; refusal removes the slot only in that scenario.
- `src/app/presets.ts` (new): the FAKE examples.
- `src/app/view.ts`:
  - `slotZh`;
  - readable slot fields in `engineView`;
  - `businessHistory`.
- `src/app/task-app.ts`:
  - `loadPreset`;
  - preset-required start check;
  - `examples` and `history` in the state;
  - pause, takeover and stop wording.
- `src/app/server.ts`: `/api/preset` (controller-only, same guards); a bounded 500 response and fatal text (`unexpectedZh`).
- `src/app/task-store.ts`: read errors and parse errors separated.
- `web/index.html`, `web/app.js`, `web/render.js`, `web/style.css`: the new layout and interaction.
- `test/app-examples.test.ts` (new): 3 behaviour tests.
- `README.md`: Chinese basic path, success meaning, safe recovery and remaining blockers; stale status line and scenario count corrected.
- `docs/claude/C-006-report.md`: this report.

No reviewer test, management acceptance criterion, `.claude/` or `.git/` file was edited.

## Requirement mapping

- **R10 (main):** concise Chinese view of step, target, chosen and accepted slot, last valid observation, history and blockers.
- **R04 / R05:** shown through the three-date example. All choices are made by the engine.
- **R07 / R08:** the lease is still enforced; pause, takeover and stop are relevant to the current state and truthful about sent ops; recovery is discoverable.
- **R09:** no real mode; formal arming is unchanged and prominently warned.
- **R02 / R06:** bounded, accurate diagnostics.
- **R01:** a preset never displaces a non-FAKE plan or a running binding.
- **R03:** fewer steps (no JSON and no claim step on the basic path).

## Actual commands and results

| Command | Result |
|---|---|
| `node --test test/app-examples.test.ts` | 3 / 3 pass |
| `node --test "test/*.test.ts" "review/*.test.ts"` | **201 / 201 pass**, 0 fail / cancelled / skipped / todo |
| `node src/cli.ts rehearse --all --quiet` | 29 scenarios, 29 as expected, 0 mismatches, non-local network access 0 |

The CLI writes its own journals under the local run directory by design; I did not read them.

## Not run, and limitations

- **No real browser walkthrough.** I have no browser tool, so these were not checked visually: narrow and desktop layout, overflow, two tabs, pause and recovery in the UI, and the stale-history display. Codex must operate the UI.
- **`web/app.js` is untested.** No test executes it, and `node --check web/app.js` was **denied by the permission mode**, so its syntax was not machine-checked. `render.js` is imported and exercised by the tests.
- **Permission denials:**
  - one exploratory `wc`/`ls` shell command (I used Glob and Read instead);
  - `node --check`.

  `node --test` and `node src/cli.ts rehearse` were permitted.
- **Possible read-only after refresh.** If the controlling tab refreshes, its old event stream may close after the new page's first state. The refreshed page then shows read-only and needs one explicit "由本页控制" click. This is deliberate: there is no silent takeover.
- **Next-run plan location.** The "next run" plan summary is in `renderStart`, separate from `renderApp`. The protected review test requires the status view not to show a future revision; the next-run plan is labelled as such in its own panel.
- **Basic example readiness.** "Basic" counts as ready for any plan without the last-slot rule. That is not enforced server-side, because existing API tests start arbitrary plans.
- **Wall-clock budget.** The 1200-second limit cannot be measured from inside the session.

## Real evidence versus simulation

Only the slot *shape* (dates plus 15-minute options from 10:00) comes from the authorized historical Pro observation. Everything in the example is FAKE: dates, stores, capacities, refusals, acceptance and the day-3 closing time. Current Duo values, slot completeness, acceptance and refusal, holds, U02–U06 and real-date binding remain unverified. No real adapter exists.

## Checkpoint

The candidate bytes are on disk; 201/201 tests and 29/29 scenarios pass. Next, for Codex:

1. Inspect the diff.
2. Create the manifest.
3. Operate the UI at narrow and desktop width: basic three-date path, two tabs, pause and recovery, stale history and an evidence blocker.
4. Accept or return findings.
