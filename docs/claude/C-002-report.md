# C-002 / C-002-R1 delivery report — offline slot-refusal vertical slice

Author: Claude Code (session `cc5b30a2-ea93-4a97-9c0b-f4ac8e78d684`, resumed for C-002-R1). Audience: Codex reviewer.
Status: **submitted for review. This is not self-acceptance.** Every number below comes from commands actually run in this session on 2026-10-01.

## 1. Outcome summary

- I fixed all six blocking findings, F1–F6.
  - The reviewer suite (`node --test "review/*.test.ts"`) now has **15 tests: 15 pass, 0 fail**. That count includes two DNS/fetch cases added to `review/network-guard.test.ts` after the 13-case count in the review document.
  - I did not edit any reviewer test, requirement, task sheet, review document or delegation tool.
- The combined run of implementation and reviewer tests gives **86 tests: 86 pass, 0 fail, 0 skipped**. That is 71 implementation tests plus 15 reviewer tests.
- `node src/cli.ts rehearse --all --quiet` gives **27/27 scenarios as expected, 0 non-loopback network attempts**.
- The flagship rehearsal (`node src/cli.ts rehearse`) exits 0 with all 6 flagship checks passing.
- The benchmark (`node src/cli.ts bench --runs 200 --warmup 20 --seed 1`) completed with **200 measured runs per policy**. The 20 warm-up runs per policy were excluded.
- `npm test` itself was **denied by the permission mode** (see §8). I ran the script body verbatim instead: `node --test "test/*.test.ts" "review/*.test.ts"`. The npm wrapper itself was not executed by me.
- **Scope of the restart and new-run guarantees** (corrected in C-002-DOCS). These protections are engine-level. They are verified only when callers reuse the same journal/ledger or shared state directory, as the tests do.
  - The current CLI runs isolated, repeatable fake scenarios, each with its own fresh journal and ledger. It does not provide task-wide persisted ownership/ledger or an integrated resume command, so it does **not** block a new run after an unknown submission.
  - Cross-run and cross-process integrated guarantees are unimplemented and mandatory in C-003 before real adaptation can be considered ready. No real order or payment capability exists.

## 2. Repairs for the reviewer findings

### F1: send-time authorization and prepared-vs-sent journal truth (A06/A09/A10)

**Root cause.** The runner executed queued `dispatch` commands without re-checking. Events that arrived in a port reply's `post` channel (pause, price change, challenge) changed engine state, but the earlier-emitted `advance` command was still sent.

**Design.** Mutations are now two-phase.

1. **Prepare.** The engine emits a `dispatch` command and writes a durable `intent` record. The pending op status is `PREPARED`.
2. **Authorize.** The runner calls `engine.authorize(cmd)` immediately before **every** port call, including observe and lookup. `authorize` re-validates against the current state:
   - not paused, under takeover, or terminal
   - this is the current prepared op
   - the latest page context still satisfies the bound plan (product, quantity, price, fulfillment)
   - for `chooseSlot`:
     - the slot fields are still authorized and no slot is already accepted
     - the target ref and key still exist, selectable and unsuppressed, in the newest list
     - if a newer list superseded the target, the op is cancelled and the engine re-decides on the newest list
   - for `advance`: the accepted slot is unchanged
   - for `submitOrder`: the capability is valid, unexpired and unconsumed; the ledger has not consumed the plan; the capability is then consumed and the ledger `submit-intent` is written

   If every check passes, the engine writes a durable `sent` record and only then does the runner call the port. Otherwise the engine writes `cancelled` (shown in Chinese as "从未到达模拟官网"), clears the pending op, refunds the per-slot attempt counter, and returns any follow-up commands (for example a re-decision on the newest list).

**Other sources of cancellation.** Pause, takeover, stop and terminal transitions all cancel a merely-prepared op. An op that has actually been sent keeps its pending/unknown truth (R08).

**Accepted continuation is preserved.** After a cancelled `advance`, resume re-observes. A matching checkout-review page then re-issues `advance` automatically (`test/dispatch-boundary.test.ts`).

**Compatibility.** The engine has a fallback for a harness that drives `engine.handle()` directly and feeds a result for a prepared op without calling `authorize()`. It treats the result as evidence that the op was sent and writes `sent` with `reason: inferred-from-result`.

**Reviewer crash harness.** `review/crash-boundary.test.ts` is reviewer-owned. Codex has since adapted it to assert `authorize()` explicitly before supplying the simulated outcome. I did not change that test or any other reviewer test.

### F2: replay from the durable outcome itself (A07)

**Root cause.** Replay derived acceptance and refusal only from the later derived records `accepted` and `refusal`. A crash right after a fsynced `outcome` therefore forgot the truth.

**Design.** Replay now uses only primary facts: `intent`, `sent`, `cancelled`, `outcome`/`reconciled`, `list`, `refresh` and `phase`. It combines these with the op's kind and slot taken from its `intent`.

- `ACCEPTED` on `chooseSlot` restores the accepted slot.
- `ACCEPTED` on `advance` restores the advanced flag.
- `REJECTED` on `chooseSlot`, or on `advance` with `slotRefused: 1`, restores refusal memory. This uses the same `#recordRefusal` path as live handling.

The derived records are now informational only, so nothing is double-counted.

**Restart classification for each op:**

| Durable state at crash | Treatment on restart |
| --- | --- |
| `sent` with no outcome | UNKNOWN, read-only reconcile; never resent |
| `intent` with no `sent` | The port was provably never called (the runner writes and fsyncs `sent` first), so the op is journaled as `cancelled: prepared-not-sent-before-restart` and the engine re-decides from a fresh list |

**Pause and takeover across restart.** A pause or takeover in force before a crash now stays in force after restart. Restart is not resume.

### F3: fail-closed ledger and mandatory plan binding (A07)

- **Ledger loading.** `FileLedger` validates every entry:
  - the entry must be an object
  - `planHash` must be hex
  - `runId` and `opId` must be strings
  - `status` must be one of `submit-intent`, `unknown`, `confirmed`

  If any entry is invalid, or the file cannot be parsed, `find()` returns `{status: "unknown"}` for **any** plan. Corruption never reads as empty history.
- **Ledger writes.** `record()` refuses to overwrite a corrupt ledger (`LedgerCorrupt`). `clear()` refuses as well.
- **Journal plan binding.** `readJournal` requires record 0 to be `run-start` with `planHash === expected`. A missing value gives the new error `missing-plan-binding`; a different value gives `plan-mismatch`.

### F4: network guard audit (A11)

Root cause: `net.connect()` passes Node's normalized `[options, cb]` array to `Socket#connect`. The old guard read `.host` off the array, got `undefined`, defaulted to `localhost`, and allowed the connection.

The rewritten `socketTarget()` handles these call forms:

- the normalized array
- `(options)`
- `(port[, host])`, including a numeric-string port
- `(path)` for IPC
- any unrecognized shape, which is blocked (fail closed)

The guard also covers:

- `globalThis.fetch` for string, `URL` and `Request` inputs; non-http(s) or unparseable inputs are blocked
- `dns.lookup`, `lookupService`, `resolve*` and `reverse`, in both callback and `dns.promises` forms
- `dgram` send/connect

Every block throws **before** the original transport is called. All tests replace the transport with counting spies first, and no test probes a live address.

### F5: active-plan binding (R01/A06)

The `Engine` constructor makes a `structuredClone` of the plan and deep-freezes it. It verifies `planHash(clone) === options.planHash` and otherwise throws `PlanBindingMismatch`. All engine checks use only this private frozen copy, so later mutation of the caller's object cannot widen authorization.

### F6: benchmark boundary (A14)

- **Acceptance metric.** `RunResult.simulatedMsToAccept` is the virtual time at which the reply that produced acceptance was received, so `simulatedMsToAccept` stops at acceptance. The later advance and endpoint observation are reported separately as `simulatedMsToRunEnd`.
- **Runs counted as accepted.** A run counts as accepted when acceptance happened, rather than when an advance was dispatched.
- **Git metadata.** The stale "repository has no commits" text was replaced with "未测量（本任务未读取 Git 元数据）" (not measured).

## 3. Other design decisions and reasons (C-002 scope, unchanged unless noted)

- **Runtime.** Node 24.16.0 runs erasable TypeScript natively, verified to work with no flag or warning. There are zero dependencies and no install step, which satisfies "no package installation".
  - The cost: there is no static type check. `tsc` is not installed and installing it is forbidden.
- **Pure deterministic engine plus imperative runner.** The core is "event in → commands out" with an injected clock. The runner owns I/O, timing and (new in R1) send-time authorization. This makes every race reproducible in unit tests.
- **Closed observation and outcome states (R06).**
  - "None" requires an explicit signal, or all slots flagged unavailable.
  - Empty data without a signal, failures and malformed data never imply none or success.
- **Slot identity (R04/R05).**
  - The plan-level key `store|date|start-end` is kept separate from the opaque per-render ref.
  - The fingerprint excludes refs.
  - A generation is bumped only when content changes.
  - Refusal suppression lasts for the refused generation, plus the first post-refusal list when no newer list is available.
  - A stale-list guard allows two refusals on the same generation, then one bounded refresh, then `LIST_STALE_SUSPECTED` takeover.
- **Durable write-ahead journal (R07/A13).**
  - Hash-chained JSONL with fsync on each record.
  - A typed field allowlist; unsafe text is redacted to `[已屏蔽]`. New allowlisted field in R1: `slotRefused`.
- **Purchase ledger written before the final submit is sent (R07/R09).** This is an engine-level protection. It blocks a restart or a new run for the same plan until a human clears it with an exact Chinese confirmation phrase, **but only when the caller reuses the same journal/ledger or shared state directory**. The tests verify it under exactly that condition.
  - The current CLI does **not** provide this across runs. `runScenario` creates a fresh run directory, with its own journal and ledger, for every CLI rehearsal. CLI scenarios are deliberately isolated, repeatable mock fixtures.
  - There is no task-wide persisted ownership or ledger, and no integrated resume command.
  - Codex reproduced this: two consecutive `node src/cli.ts rehearse --scenario formal-submit-unknown --json` runs each sent one **mock** submission and each stopped in MANUAL_VERIFICATION. That is safe rehearsal, but it means the CLI does not block a new run after an unknown submission.
- **Formal mode is mock-only.** The only capability is a `scope: "mock-only"` object bound to the plan hash, run ID and expiry, consumed once. No real-mode capability exists.

## 4. Changed files

All product files are currently untracked (`git status` at session start showed `src/`, `test/`, `examples/`, `package.json` as `??`). `docs/plan.md` shows as modified, but that change is not mine.

**Created in C-002 (session 1):**
- `package.json`
- `examples/plan.fake.json`
- `src/plan.ts`, `src/observe.ts`, `src/journal.ts`, `src/engine.ts`, `src/runner.ts`, `src/real-blocked.ts`, `src/netguard.ts`, `src/bench.ts`, `src/messages.ts`, `src/cli.ts`
- `src/mock/fake-port.ts`, `src/mock/scenarios.ts`
- `test/helpers.ts`, `test/scenarios.test.ts`, `test/plan-guard.test.ts`, `test/journal-restart.test.ts`

**Changed in C-002-R1:**

| File | Change |
| --- | --- |
| `src/engine.ts` | `authorize()`, prepared/sent/cancelled states, plan freeze and binding, outcome-based replay, restart hold, unsent-intent handling |
| `src/runner.ts` | send-time authorization, `cancelled` list, `simulatedMsToAccept`, metrics close at actual send |
| `src/journal.ts` | ledger validation, fail closed, no overwrite of a corrupt ledger, mandatory plan binding, `slotRefused` field |
| `src/netguard.ts` | rewritten |
| `src/bench.ts` | acceptance boundary, `simulatedMsToRunEnd`, commit text, boundary text |
| `src/messages.ts` | Chinese text for `intent` (准备), `sent` (发送), `cancelled` (取消); OP_INFLIGHT wording; new reasons |
| `src/cli.ts` | flagship checks count only sent selections; new benchmark lines |
| `package.json` | `test`, `test:impl` and `test:review` scripts |
| `test/helpers.ts` | `send()` helper; strict `.local/test-runs` containment check before any recursive delete; validated temp-dir names |
| `test/journal-restart.test.ts` | crash points now model the real runner boundary; 3 new crash-window tests |

My implementation-owned tests that previously crashed after a bare intent now first call `authorize()`, so they test a crash after the durable `sent` record. A separate new test covers a crash after the intent but before `sent`.

**Created in C-002-R1:**
- `test/safety.test.ts`, `test/observe.test.ts`, `test/bench.test.ts`, `test/dispatch-boundary.test.ts`
- `README.md` (Chinese)
- `docs/claude/C-002-report.md` (this file)

**Not touched:** `review/**`, `docs/requirements.md`, `docs/reviews/**`, `docs/tasks/**`, `tools/delegation/**`, `.claude/`, `.git/`.

## 5. Requirement and acceptance mapping

| ID | Where it is implemented / evidenced |
| --- | --- |
| R01 | `validatePlan`, `slotPlanViolation`, `contextViolations`, `rankTuple`; engine binds a frozen plan copy (F5); `test/plan-guard.test.ts`, `review/plan-binding.test.ts`, `test/safety.test.ts` binding test |
| R02 | `validatePlan` problems in Chinese; `check-plan` reports real entry/page/session recognition as **unimplemented** and U02–U06 as unverified |
| R03 | Automatic selection, automatic continuation after acceptance, no bag/product/store redo (the port has no such methods; the flagship checks a single context) |
| R04 | Plan ranking against the newest list; acceptance only from authoritative results or reconciled page evidence (`accepted` requires `evidence`) |
| R05 | Refusal memory by generation, fresh/returned list, bounded refresh with minimum interval, stale-list guard, newest-ref enforcement at send time |
| R06 | Closed classifier states (`src/observe.ts`, `test/observe.test.ts`) |
| R07 | Single pending op, durable intent/sent/outcome, read-only reconcile, ledger, restart replay of durable outcomes |
| R08 | Pause/takeover/stop/resume; prepared ops cancelled, sent ops keep their truth; pause and takeover survive restart |
| R09 | Mock-only port kind; `RealApplePortBlocked` always throws; network guard; mock-only formal capability |
| R10 | Chinese CLI trace and status panel; allowlisted, sanitized journal |
| A01 | Scenario `accept-first` |
| A02 | Scenarios `refuse-then-accept` (flagship), `refuse-with-returned-list`, `advance-refused-slot`, `select-timeout-page-rejected` |
| A03 | Scenarios `multi-refusal-exhaust`, `stale-list`; test A03 |
| A04 | Scenarios `confirmed-none`, `query-failed`, `empty-without-signal`, `missing-field`, `unknown-structure`; `test/observe.test.ts` |
| A05 | Scenarios `redraw-new-refs`, `pending-result-preserved`, `out-of-order-duplicates`; tests review-1, review-2, A05; newer-list-supersedes-prepared-click test |
| A06 | `test/plan-guard.test.ts` (product, price, quantity, fulfillment, store, date, window, arrival); `review/queued-action.test.ts`; `review/plan-binding.test.ts`; `test/dispatch-boundary.test.ts` |
| A07 | `test/journal-restart.test.ts` (8 tests), `review/crash-boundary.test.ts`, `review/journal-integrity.test.ts`, timeout scenarios |
| A08 | **Not implemented — deferred to C-003** (cross-process ownership). Do not run two processes for one plan. |
| A09 | Scenarios `pause-inflight`, `pause-resume`, `takeover-unknown`; `test/dispatch-boundary.test.ts`; restart-hold test |
| A10 | Scenarios `challenge`, `throttle`, `auth-expired`, `unknown-structure`; challenge case in the reviewer queued-action test |
| A11 | `test/safety.test.ts` (spy-based socket, fetch and DNS checks; static source scan; blocked real adapter; non-mock kinds refused); `review/network-guard.test.ts`; CLI reports 0 non-loopback attempts |
| A12 | `test/safety.test.ts` (5 invalid-capability variants, expiry between prepare and send, consumed once, ledger before send); scenarios `formal-mock-submit`, `formal-submit-unknown`, `formal-capability-expired` |
| A13 | A13 test in `test/journal-restart.test.ts` (email, phone, card, cookie, bearer token never appear in the journal or Chinese output) |
| A14 | `src/bench.ts`, `test/bench.test.ts`, `review/benchmark-boundary.test.ts`, the 200-run CLI benchmark below |

## 6. Commands actually run and their results

**1.** `node --test review/*.test.ts`, after the fixes:
- 13 pass / 0 fail at first.
- Later, inside the combined run, the review files contributed 15 tests and all 15 passed.
- Before the R1 fixes, the review document records 8/8 failing plus the supplementary F5 and F6 failures. I did not re-run the pre-fix state.

**2.** `node --test "test/*.test.ts"`: 68 pass / 0 fail. I then added 3 more tests (restart hold, cleanup safety, plan freeze).

**3.** `node --test "test/*.test.ts" "review/*.test.ts"` (the `npm test` script body): **86 tests, 86 pass, 0 fail, 0 cancelled, 0 skipped, ~0.6 s**.

**4.** `node src/cli.ts rehearse` (flagship): exit 0, all 6 checks ✔. The trace shows:
- the first choice `FAKE 门店甲|2099-01-01|10:00-10:30` refused with `slot-full`
- 1 bounded refresh
- list seq 1→2, generation 1→2, ref tag `a1fcd76ea83ef872`→`a9a2c88efe4ec613`
- the second, different authorized choice `…10:30-11:00` accepted
- automatic `advance` accepted
- `REHEARSAL_ENDPOINT` reached with 0 submits
- one product/price context throughout

**5.** `node src/cli.ts rehearse --all --quiet`: "共 27 个场景，27 个符合预期，0 个不符合；非本机网络访问 0 次。" (27 scenarios, 27 as expected, 0 not as expected; 0 non-loopback network accesses.)

**6.** `node src/cli.ts check-plan --plan examples/plan.fake.json`: the plan is valid and marked FAKE. Formal mode is unavailable. Real entry recognition is unimplemented. U02–U06 are unverified.

**7.** `node src/cli.ts bench --runs 200 --warmup 20 --seed 1`. Report written to `.local/bench/bench-seed1-runs200.json`. Environment:
- Windows 11 (win32 x64 10.0.26300)
- AMD Ryzen 7 9800X3D, 16 logical CPUs
- Node v24.16.0
- Power mode: not read
- Commit: not measured

| Metric (200 measured runs/policy, seed 1, warm-up 20 excluded) | fresh-list (this project) | naive-remembered (baseline B1) |
| --- | --- | --- |
| Accepted / runner failures | 200/200, 0 | 200/200, 0 |
| Choices to acceptance, P50 / P95 / max | 1 / 2 / 3 | 1 / 2 / 3 |
| Simulated ms to acceptance, P50 / P95 / max | 302 / 451 / 2439 | 302 / 451 / 633 |
| T1 list → sent choice, local ms, P50 / P95 / max | 0.042 / 0.098 / 0.249 | 0.039 / 0.070 / 0.163 |
| T2 refusal → next sent choice, local ms (n) | n=14: 0.069 / 0.137 / 0.137 | n=16: 0.042 / 0.087 / 0.087 |
| T3 accepted → advance sent, local ms | 0.030 / 0.049 / 0.198 | 0.028 / 0.050 / 0.209 |
| Stale-ref actions / max concurrent mutations | 0 / 1 | 0 / 1 |

**Honest reading of the benchmark.**
- On this workload the project policy shows **no speed advantage** over B1. Acceptance counts and P50/P95 are identical.
- fresh-list has a **worse max** (2439 vs 633 ms) because after a refusal it pays one bounded 2000 ms refresh interval, while B1 immediately tries its next remembered slot.
- Refs are deliberately stable in this simulation to be fair to the baseline, and the competition rate is low, so B1 also made 0 stale-ref clicks.
- The fresh-list policy's value here is demonstrated by correctness scenarios (`redraw-new-refs`, `stale-list`, the newer-list-supersedes test), not by this benchmark.
- Local times cover `handle()` plus `authorize()` only. Remote time is simulated. Rendering is N/A. The journal is in memory. **None of these figures is Apple, network, success-rate or human performance.**

## 7. Tests not run, and known limitations

**Not run:**
- `npm test` wrapper (permission denied; the body was run directly).
- Static type checking (`tsc` is not installed, and installation is forbidden). Type errors are therefore not machine-checked, only exercised at runtime.
- Any real-site, DOM or browser test (out of scope or forbidden).
- A08 multi-process ownership tests (C-003).

**Limitations:**
- **Real checkout is unverified.** The real Apple slot, selection, refusal, acceptance and order contracts (U02–U06) are unverified. `mock-v0` is invented. The official-entry evidence in `docs/reviews/official-entry-20261001.md` is separate and is not used by this code.
- **A08 / DOM / UI deferred.** Cross-process ownership, DOM-level mock and a richer Chinese UI are C-003. A second process on the same plan is not prevented.
- **No integrated cross-run or cross-process guarantee.**
  - The "no second submit after an unknown submission" protection holds only for callers that share one journal/ledger (state directory), as the tests do.
  - The current CLI gives every rehearsal its own isolated journal and ledger, so a later CLI run is **not** blocked by an earlier run's unknown submission.
  - Task-wide persisted ownership/ledger and an integrated resume command are unimplemented. They are mandatory C-003 work before any real adaptation can be considered ready.
  - No real order or payment capability exists.
- **The send-time contract must be honored by any caller.** The runner is the only component that calls ports, and it writes and fsyncs `sent` before each mutation. A harness that calls a port itself without `engine.authorize()` breaks the "intent without sent means never sent" guarantee.
- **Conservative block after a crash between ledger write and `sent`.** In that window the port was never called, but the ledger blocks the plan until a human clears it. This is deliberate.
- **Network guard coverage.** It covers in-process socket, fetch, DNS and UDP entry points. It does not cover child processes, worker threads (separate globals), native addons or QUIC. The source scan test asserts that no such APIs are used in `src/`. For UDP, a string *message* sent without an address is treated as an address and blocked (fails closed).
- **`FileLedger.clear()` is not atomic.** It writes the file directly, without tmp+rename. It is human-only and refuses to act on a corrupt ledger.
- **Exactly-once is not guaranteed.** Local flags cannot guarantee server exactly-once. An unknown outcome always ends in read-only reconcile, or in manual verification.

## 8. Permission denials and budget

**Session 1 (C-002):**
- Generic Bash (`cd … && git status && ls`) was denied. I switched to Read/Glob.
- The dispatcher stopped the session at its 1,200 s wall budget. That was a time-budget stop, with no final report.

**This session (C-002-R1).** All three denials were in "don't ask" mode, and none was retried verbatim:
1. `node -e "…fs read/replace/write…"` (a one-off file rewrite) was denied. I used the Edit tool's replace-all instead.
2. `cd "E:/Apple Store" && node --test review/*.test.ts 2>&1 | tail -n 60` was denied. I ran `node --test review/*.test.ts` without the pipe.
3. `npm test` was denied. I ran the identical script body with `node --test`. **Codex should run `npm test` to confirm the wrapper itself.**

**Other notes:**
- No package installation, lifecycle scripts, network access, Git operations, agents or global configuration changes were used.
- Cost used is about USD 4.4 of 10. I did not measure wall time precisely, and the 30-minute limit may be close.

## 9. Resumable checkpoint

- **State.** All F1–F6 code fixes, tests, README and this report are written.
- **Final verification after the last source edit.**
  - `node --test "test/*.test.ts" "review/*.test.ts"`: 86/86 pass.
  - `node src/cli.ts rehearse --all --quiet`: 27/27 as expected, 0 non-loopback network accesses.
  - No source files changed after these runs; only this report was edited.
- **To resume:**
  1. Run `npm test`, or `node --test "test/*.test.ts" "review/*.test.ts"`, and `node src/cli.ts rehearse --all --quiet` to reconfirm.
  2. Codex review of the send-time contract (`Engine.authorize`), the restart classification (intent without `sent` means never sent), and the honest benchmark interpretation.
  3. C-003 for A08, the DOM mock and the UI.
