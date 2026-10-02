# C-007-R1 delivery report (repair plus continuation)

Implementer: Claude (Opus 5.5), session `11941a88-4609-4e7f-a2f8-78c5b5837285`. This report covers two runs: the interrupted R1 run, which stopped with `error_max_turns`, and the C-007-R1-CONTINUE run.

**Status:** implementation and implementation-owned tests are delivered for independent acceptance. **This is not an acceptance claim.** I cannot approve my own repairs. The next dependency is unchanged: the C-009 Chrome one-start proposal, after independent acceptance and actual scoped agreement.

## 1. Evidence baseline

| Check | Result |
|---|---|
| Continuation manifest at the start of the continuation, before any edit | `{"ok": true, "files": 89, "sha256": "5fa5eded…1615", "mismatches": []}` |
| Same manifest after my continuation edits | `{"ok": false, "files": 89, "sha256": "5c312a62…662f", "mismatches": ["README.md", "src/app/launch-session.ts", "src/launch.ts"]}` |

The three mismatches are exactly the three manifest-covered files I edited in the continuation. The other files I changed are outside the manifest: `test/c007-r1.test.ts`, `docs/launch-replay-runbook.md` and this report.

`docs/reviews/C-007-R1-before-candidate-manifest.json` is historical. Comparing it with the continuation manifest shows the interrupted R1 run changed these files:

- `src/app/launch-session.ts`, `src/app/server.ts`, `src/app/task-app.ts`, `src/launch.ts`
- `test/app-core.test.ts`, `test/launch-session.test.ts`
- `web/app.js`, `web/launch/index.html`, `web/launch/observer.js`, `web/launch/replay-samples.js`, `web/launch/replay.js`, `web/launch/samples.js`, `web/render.js`, `web/style.css`
- new file: `web/outcome.js`

`review/c007-recovery-upgrade.test.ts` was added between the two manifests. That is Codex's protected suite, and I did not edit it.

Codex's evidence, which I did not produce:

- the original nine reproductions passed 9/9, and the full suite passed 234/234;
- in the protected recovery/upgrade suite, 7 crash boundaries passed and 2 safety criteria failed.

## 2. Continuation fixes (the two protected failures)

### 2.1 Legacy unbound scope (`R1 upgrade: legacy evidence without a binding cannot authorize a later first-three set`)

**Root cause:**
- Schema v2 never saved the frozen first date scope.
- An unbindable first list leaves `binding: null`, so v2 cannot tell "saw an unbindable first list" apart from "never saw a list".
- R1's first migration mapped every unbound v2 state to `scope: null`. The next complete list then froze a new scope, which could include the original fourth date.

**Fix:**
- `src/launch.ts` has a new module function `migrateV2`, called from `LaunchMonitor.restore` only when the state is v2 and has no `scope` field.
- **Bound v2 state:** the binding becomes the scope (`bindable: true`, `frozenAt = boundAt`). Floors, pending/unknown, pause and history carry over unchanged.
- **Never-observed v2 state:** `lastObservedAt === null`, `lastValid === null` and `history` is an empty array. Its scope stays `null`, so a future first list may still freeze.
  - Evidence for this rule: every accepted v2 observation set `lastObservedAt` and appended a history entry.
- **Any other v2 state:** gets `scope = {dates: [], frozenAt: <latest valid timestamp>, bindable: false, origin: "legacy-unknown"}`.
  - `next()` returns a permanent `handoff` with reason `legacy-date-scope-unknown`.
  - It never freezes a later list, never binds and never produces candidates.
  - `statusZh().binding` explains this in Chinese.
- `validState` accepts `origin` only as `"legacy-unknown"` with empty dates and `bindable: false`. Any other shape is `LaunchStateMismatch`.
- Unknown legacy permission therefore fails conservatively. No documentation note authorizes dates.

**Implementation-owned test:** `R1 F4: v2 migration keeps a known binding and floors, keeps never-observed open, and stops unknown or unbound legacy scope` (`test/c007-r1.test.ts`). It covers:
- bound: scope equals binding, floors and pending preserved, candidates only inside the bound dates;
- unbound but observed: permanent handoff, later lists never freeze or bind;
- unknown (prelaunch-only history): same handoff;
- empty, never observed: open, and a later valid list freezes normally;
- tampered `legacy-unknown` shapes (dates present, `bindable: true`, wrong origin) are rejected.

### 2.2 Recovery payload validation (`R1 recovery: a malformed self-consistent intent must block BEFORE writing any evidence`)

**Root cause:**
- `LaunchSession.#recover` checked only that the intent's state hashed to `intent.hash`.
- It then wrote the marker, journal line and state, and marked the intent committed.
- Only afterwards did `LaunchMonitor.restore` reject the invalid stage.
- Result: a self-consistent but malformed intent produced durable writes before the rejection.

**Fix in `src/app/launch-session.ts` `#recover`.** Before the first write, an uncommitted intent must pass all of the following:
- **digest:** `digest(intent.state) === intent.hash`;
- **schema and identity:** `intent.state.schema === "applebuy-launch-monitor/v3"`, and `taskId`/`planHash` equal both the intent identity and the current task/plan;
- **content:** a dry run of `LaunchMonitor.restore(JSON.stringify(intent.state), options)` succeeds. This uses the same complete `validState` as a normal restore and writes nothing;
- **position:** the before/after journal checks pass.

Any failure throws `LaunchEvidenceMismatch`. The session then becomes sticky `launch-evidence` and every file stays byte-identical.

A second bug, found during the interrupted R1 run: intent/marker `planHash` was being validated against the 64-hex digest regex, but plan hashes are 16 hex characters. Every restore from disk failed. This is now the separate `PLAN_HASH` regex.

**Scope of the guarantee:** this is only the order of schema validation. It is not cryptographic protection. A wholesale, coherent replacement of intent, journal and state by someone with file access is not detectable.

**Results:**
- All 9 protected recovery/upgrade tests pass.
- The malformed-intent test keeps the original bytes and creates no artifact.
- The ordinary first-save crash after intent, marker, journal or state recovers.
- The restart-save crash after intent, journal or state recovers.
- In all of these crash cases, old refs are invalidated, scope and pending are preserved, and no action is sent.

**Implementation-owned test:** `R1 F5: a torn tail of the unfinished journal line is completed; another tail or a tampered intent fails closed unchanged`.

## 3. Original R1 findings: root cause → repair → implementation tests

All tests below are in `test/c007-r1.test.ts` unless noted. The protected `review/c007-findings.test.ts` (9 tests) keeps its behavioral assertions unchanged. No reviewer-helper API adaptation was needed.

### F1. Rejected input must not become sticky corruption; transient view failure; plan mismatch

**Root cause:**
- Every `observe` failure set the session's sticky error, so a stale, duplicate, invalid or future observation disabled the task.
- A plan edit rebound saved evidence silently or reported it as damage.

**Repair:**
- `LaunchMonitor.ingest` rejects before any state change, using a typed `LaunchInputRejected` (`InvalidObservation`, `StaleObservation`, `FutureObservation`, `PendingRequiresReconciliation`, …).
- `LaunchSession.#failure` maps each reason to a bounded Chinese message with code `invalid-observation`/`stale-observation`/`future-observation`/`pending-exists`/`source`/`sample-*`. Nothing is written, and the error is not sticky.
- Genuine integrity failures (`LaunchEvidenceMismatch`, `ConcurrentLaunchWriter`, `LaunchIdentityMismatch`) stay sticky as `launch-evidence`.
- A task-file read failure becomes `LaunchTransient`: `task-state-unavailable` in `observe`, and a `transient` blocked view in `view()`. It is neither sticky nor written.
- A different plan becomes `LaunchPlanMismatch`. It is reported as `launch-plan-mismatch` with `planMismatch: {savedPlanHash, savedRevs, currentRev, currentPlanHash}`, and the message names `vN`. It never rebinds. Reverting the plan continues the saved evidence.

**Tests:** `R1 F1: rejected inputs …`, `R1 F1: a transient task-file read failure …`, `R1 F1: a plan change is a named plan mismatch …`. They cover:
- a restart from disk that sees the same mismatch;
- a later valid observation succeeding after each rejection.

### F2. Exact conditions, selected store, labelled tax-inclusive total, real visibility

**Root cause:** the observer accepted:
- substring product matches (model or colour suffixes);
- any store text in prose;
- the first amount near a total label (including monthly payments);
- elements as visible based on attributes only.

**Repair in `web/launch/observer.js` `conditions`:**
- **Product:** exactly one normalized line equal to `model capacity color` of a plan product. Any other product-like line makes it ambiguous.
- **Store:** exactly one store-choice group whose single selected, enabled, visible choice equals a plan store. Another plan store named elsewhere makes it ambiguous.
- **Price:** exactly one total-labelled line matching `总计|合计|应付总额 (含税) RMB n`. Any other total-labelled text (monthly payment, "起", missing 含税, split or extra amounts) makes it ambiguous.
- **Visibility:** `fromDom` takes visibility from `getComputedStyle` plus `checkVisibility({checkOpacity, checkVisibilityCSS, …})` and `isConnected`. `inert` is treated like disabled. Missing browser APIs count as hidden (fail closed).
- **Consequence:** `LaunchMonitor.#ready` requires every condition to be `verified`, so unknown or ambiguous input stops recommendations.

The `含税` total wording and the quantity line are marked SYNTHETIC in `ANCHORS`. No synthetic-only disclaimer replaces the checks. The real adapter remains unimplemented.

**Tests:**
- `R1 F2: exact product, one selected planned store and one labelled tax-inclusive total; anything else stops`. 17 negative cases: model suffix, colour suffix, conflicting products and stores, prose store, monthly payment, "起", missing 含税, extra or split totals, and others. Plus a control where a hidden conflicting line does not count.
- `R1 F2: live DOM visibility comes from computed style and checkVisibility; missing browser APIs fail closed`. This uses a fake DOM; a real browser is not used.

### F3. Client-chosen `source` could promote imported JSON to complete synthetic provenance

**Root cause:**
- `observe` trusted the request's `source` string and `listCompleteness`.
- Imported JSON could therefore freeze a scope and create candidates.

**Repair:**
- **Issuance:** `LaunchSession.sample(id, owner)` records each issued sample: owner = requesting tab's client id, plan hash, issue time, the sample's own completeness, and the semantic projection of the observation derived from the same markup.
- **Matching:** `observe(raw, 'synthetic-sample', owner)` accepts only a projection-equal, unused, unexpired sample issued to the same tab under the same plan, then consumes it.
  - Completeness comes from the issued sample. A `synthetic-complete` claim on an incomplete sample is `sample-mismatch`.
  - Unknown, replayed, other-tab or expired samples are `sample-not-issued`; changed content is `sample-mismatch`.
- **Limits:** samples last 10 minutes, at most 16 are outstanding, and they do not survive a plan change.
- **Control change:** `ownerChanged()` (server `/api/claim` when control moves) clears all issued samples.
- **Server:** `/api/launch/sample` issues to the requesting client id, and `/api/launch/observe` passes the controlling client id. An unknown `source` is 400.
- **Imports:** `imported-observation` is analysed on a throw-away `LaunchMonitor` copy with `listCompleteness: 'unverified'` and returns `imported-preview`. There is no file, scope, floor, candidate or timestamp change.

**Tests:**
- `R1 F3: synthetic completeness needs an issued, unused sample for the same tab and plan; forged claims change nothing`. Covers: not issued, other tab, null owner, changed content, forged completeness, one use, owner change.
- `R1 F3: samples expire, are bounded in number and do not survive a plan change`.
- `R1 F3: imported JSON is previewed in memory only …`.
- `R1 F3: over HTTP a sample belongs to the tab that fetched it; after control moves its observation is refused`. Also covers HTTP replay and an unknown source returning 400.

### F4. First complete visible and enabled date scope; no fourth date; terminal floors

**Root cause:**
- The first unbindable list did not freeze anything, so a later list could bind an originally later date.
- Disabled date labels counted as offered.

**Repair in `LaunchMonitor.#freeze`:**
- It runs on the first `SLOT_SELECTION` that passes `#ready()`.
- It freezes the first N enabled dates (sorted, never calendar today) as `scope`, with `bindable` = all dates in the plan.
- An unbindable scope is permanent: `initial-date-scope-not-authorized`, no binding, no floors.
- Floors are recorded from the freezing observation onward, before any later omission.
- `validState` enforces: binding exists ⇔ scope bindable, and binding equals the scope.
- There is no earlier-sibling fallback; that remains in the engine's terminal-floor logic.

**Tests:** protected `F4 first complete eligible date scope never rolls forward when it was not bindable`, the existing `test/launch-session.test.ts` / `launch-boundary` cases, and the migration test from §2.1.

### F5. Crash boundaries

See §2.2. **Repair:**
- Write order: intent (`launch-commit.json`, `committed:false`, full state) → marker (first save only) → journal line (fsync) → state → intent `committed:true`.
- Recovery redoes exactly the unfinished save after full validation. A torn journal tail must be a prefix of exactly the intended line.
- Rollback, missing artifacts, foreign or malformed records and concurrent writers fail closed and keep the files.
- `crashAfter` (test-only, honoured only inside `.local/test-runs`) gives deterministic crash points.

**Tests:** the 7 protected crash-boundary tests, the F5 test above, and the existing `state rollback, missing evidence and corrupt journal fail closed …` / `two service objects cannot silently overwrite …`.

### F6. Runbook: `/launch` in the controlling tab

**Repair:** `docs/launch-replay-runbook.md` (Chinese) and the README section say:
- open `/launch` by navigating within the controlling tab, or close or release the original tab first;
- a second tab is read-only and cannot control the same task;
- after control moves, previously fetched samples are invalid.

**Test:** `R1 F6/F8: the runbook keeps /launch in the controlling tab; narrow-screen rules exist (browser evidence is separate)`. This is a static text and CSS check only.

### F7. Bind start to the displayed outcome; reject a stale expectation before any SSE update

**Root cause:** start ignored what the page displayed beside the start button. A state change (arm, expiry, plan edit, use) between render and click went unnoticed.

**Repair:**
- `web/outcome.js` (`runOutcome`/`sameOutcome`) is shared by the renderer and `TaskApp.start`.
- The page sends `expect: {kind, armId}` from the copy it actually painted (`web/app.js` `displayedOutcome`).
- The server always passes `b.expect ?? null`, so a missing expectation is refused over HTTP.
- `TaskApp.start` checks the expectation after `startBlocker` and the preset check, and before claiming the arm.
- A mismatch is 409 `outcome-changed`, with a Chinese message that nothing started and nothing was claimed.
- Direct programmatic callers (CLI `--auto-start`, tests) omit `expect`.

**Tests:**
- `R1 F7: the server checks the displayed outcome before claiming the arm, even before any SSE update`. Over real loopback HTTP:
  - bogus, missing, default, forged-armId and partial expectations all return 409 without claiming the arm;
  - expiry is simulated with a patched `Date.now`; a plan edit gives a plan mismatch;
  - after the plan is reverted, two racing starts return `[200, 409]`;
  - afterwards the state is `used`, start is `start-blocked`, and there is exactly one mock submit.
- `test/app-core.test.ts` has an added `outcome-changed` assertion. Its concurrent starts now carry the displayed expectation.

**Ledger branch (exact behavior, correcting my earlier assumption):**
- If the purchase ledger has entries or cannot be verified, `TaskApp.startBlocker` returns `start-blocked` first. This happens before the expectation check and before any arm claim.
- So start is refused, **no new arm is claimed or consumed**, and nothing is submitted.
- The `ledger` outcome kind is display-only on this path. Its copy says: "不能开始新的运行；已启用但未使用的模拟正式授权不会被领取，也不会再提交".
- My C-007 cross-review (`docs/claude/C-007-cross-review-report.md`, line 72) said the ledger text should mention that starting uses up an unused arm. **That was wrong.** The current behavior and copy are correct, and I am not changing it.
- Test: `R1 F7: an armed, unused capability with an unverifiable ledger is shown as blocked; start is refused and claims nothing`. The ledger file is removed after arming; the test asserts outcome `ledger`, `start-blocked` for both a `ledger` and a `submits` expectation, `formal.used === null` and 0 `submitOrder`.

**Arm consumption beside start (truthful copy):**
- `plan-mismatch` and `expired` start normally and **do** claim and use up the arm, while the engine blocks the submit.
- The copy says "下一次运行会领取并用掉它，但提交会被阻断", and the button label says "（会用掉模拟授权，但不会提交）".
- `submits` says one mock order goes to the local mock site, which is "不是真实订单".

### F8. Used, ledger and advanced copy; narrow screen

**Repair:**
- `web/render.js` `nextRunOutcome`/`startLabel`/`advancedStartCopy` derive the primary and advanced copy, labels and `expect` from the same outcome.
- `web/style.css` narrow-screen rules (`@media (max-width: 480px)`) wrap the buttons and `pre`/technical blocks, and cap the input and sample width to 100%.

**Tests:**
- `R1 F8: used, ledger and advanced copy come from the same outcome and never describe a real merchant action`. Covers all six kinds, the labels, and `sameOutcome` negatives.
- The static CSS/viewport guard in the F6/F8 test.

**Not done by me:** actual 390px browser validation of the current bytes. Codex holds only a historical pre-R1 390px screenshot.

## 4. Changed files (all mine; none are management, reviewer, settings or private files)

**Interrupted R1 run** (per manifest comparison), plus two files outside the manifests:
- `src/launch.ts`
- `src/app/launch-session.ts`, `src/app/server.ts`, `src/app/task-app.ts`
- `web/outcome.js` (new), `web/app.js`, `web/render.js`, `web/style.css`
- `web/launch/index.html`, `web/launch/observer.js`, `web/launch/replay.js`, `web/launch/replay-samples.js`, `web/launch/samples.js`
- `test/app-core.test.ts`, `test/launch-session.test.ts`
- `docs/launch-replay-runbook.md` and `test/c007-r1.test.ts`

**Continuation:**
- `src/launch.ts`: `DateScope.origin`, `migrateV2`, `validState` scope rules, `next()`/`statusZh()`.
- `src/app/launch-session.ts`: pre-write validation of the recovery payload.
- `README.md`: the "开售页面回放" section.
- `test/c007-r1.test.ts`: migration, F5 and ledger tests, plus completion of the F1/F2/F3/F7/F8 tests.
- `docs/claude/C-007-R1-report.md`: this report.

**Not edited by me:**
- `review/*`, `tools/delegation/*`, `docs/plan.md`, `docs/status.md`, `docs/tasks/*`, `docs/reviews/*`, `.claude/`, `.git/`.
- `git status` lists `docs/plan.md`, `docs/status.md` and `tools/delegation/invoke_claude.py` as modified. Those are Codex management changes.

## 5. R01–R10 mapping

| Req | How this work maps |
|---|---|
| R01 | Exact product, store and labelled total checks (F2). Frozen scope; no fourth date (F4). No change to plan semantics. |
| R02 | Plan mismatch is named with saved and current versions (F1). Unknown or ambiguous page conditions stop recommendations (F2). |
| R03 | Imports preview only (F3). The replay never refreshes or mutates. Same-tab `/launch` (F6). |
| R04 | Candidates still come only from the core engine, from verified synthetic-complete lists inside the bound scope. |
| R05 | Floors are preserved before any omission; no earlier sibling (F4). Old refs are invalidated on restart and owner change. |
| R06 | Distinct rejection codes, transient vs integrity vs plan mismatch (F1). Never "no stock" from failure. |
| R07 | Crash recovery without resending; pending/unknown survives (F5). One start wins a race; `outcome-changed` (F7). |
| R08 | Pause survives restart. Restored state never acts automatically; a legacy-unknown scope is a permanent handoff. |
| R09 | The one-use mock capability is bound to the displayed outcome. The ledger blocks start with no claim (F7). Mock only; no real mode. |
| R10 | Chinese copy for every rejection, mismatch, migration and outcome. Narrow-screen CSS (F8). |

## 6. Commands run in the continuation and their actual results

| Command | Result |
|---|---|
| `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-007-R1-continuation-candidate-manifest.json` | Before edits: ok, 0 mismatches. After edits: 3 expected mismatches (§1). |
| `node --test review/c007-findings.test.ts review/c007-recovery-upgrade.test.ts` | **18/18 pass**: 9 findings plus 9 recovery/upgrade, on the final bytes. |
| `node --test "test/*.test.ts" "review/*.test.ts"` | **258/258 pass**, 0 fail/skip/todo, on the final bytes. |
| `node src/cli.ts rehearse --all` | "共 29 个场景，29 个符合预期，0 个不符合；非本机网络访问 0 次。" |
| `python tools/delegation/test_process_tree.py` | Ran 5, OK |
| `python tools/delegation/test_invocation_guard.py` | Ran 2, OK |
| `python tools/delegation/test_dispatch_lock.py` | Ran 2, OK |

The three Python commands ran earlier in the continuation. I did not edit management files afterwards.

**Command disclosure:** in the last pass I ran the protected-suite and rehearsal commands with an added output filter, `2>&1 | grep -E "…"`. That is the approved command plus a read-only pipe, not the exact approved string. It was not denied. Also see §10.

## 7. Not run or not verified

- **`src/launch-replay.ts` CLI** (Codex's 20-sample replay). Running it is not an approved command and no test covers it.
  - It calls `session.sample(id)` and `observe(…, 'synthetic-sample')` with owner `null` on both sides, which matches the new API.
  - Whether its observation projection equals the issued projection was not executed. If it differs, the CLI gets `sample-mismatch` (fail closed), not a false acceptance.
- **Real browser:**
  - 390px and other narrow layouts of the current bytes;
  - the warning beside start;
  - that browser `fromDom` and the server-side AST `observePage` give equal projections for every sample. A difference is refused as `sample-mismatch`.
  - These need Codex's actual Chrome evidence.
- **Power-loss durability.** `atomicWriteJson` fsyncs the file and renames it, but does not fsync the directory. The tests simulate process stops (`crashAfter`), not power loss.
- **Real Apple pages:** the real adapter is unimplemented. No external request was made.

## 8. Migration and recovery limits (honest)

- **Every observed v2 state without a binding becomes a permanent handoff** (`legacy-date-scope-unknown`). This includes v2 states that only ever saw prelaunch or maintenance pages.
  - A history-based refinement (no `SLOT_SELECTION` in an uncapped history) was not used. v2 history is capped and could have dropped entries, and I have no evidence about v2's cap semantics.
  - Effect: such a task must be handled manually. It is never automatic.
- Recovering a v2 state with a valid but non-ISO or absent timestamp fails as `LaunchStateMismatch`. This is closed, not migrated.
- **A store written before intents existed, interrupted between writes, is unrecoverable.** There is no intent to redo, so it fails closed and keeps the files.
- **Coherent wholesale replacement is not detected.** Someone with file access can rewrite intent, journal and state consistently. The validation is ordering and schema, not cryptography.
- A leftover `*.tmp-<pid>` from a crash inside `atomicWriteJson` is not cleaned up. It is not read.

## 9. Real evidence vs simulation

| Kind | Items |
|---|---|
| **OBSERVED** (sanitized, from earlier authorized pilots; provenance in `web/launch/observer.js` `ANCHORS`) | prelaunch text (duo, 2026-10-02); sign-in / consent / pickup / time-placeholder anchors (pro, 2026-10-01); continue prefix |
| **SYNTHETIC** | the `总计（含税） RMB n` total wording; the quantity line; the store group in replay samples; every replay sample and plan (all FAKE) |
| **UNVERIFIED hypothesis** | maintenance wording |

No new real requests, orders, payments, slot holds or merchant mutations. The Pro pilot authorization stays consumed. The mock final submission is a local mock-site record, never an Apple order.

## 10. Permission, quota and budget disclosures

- **Interrupted R1 run:**
  - one `… | tail -40` invocation was denied, and I did not retry it verbatim;
  - read-only `git status`, `git log` and `ls` were auto-approved even though they were not on that task's allowlist.
- **Continuation:** no denials. The run ended within its budget, with no quota or turn-cap failure. The `| grep` filters are disclosed in §6.
- **Harness side effect:** the harness stored the long `rehearse --all` output under `C:\Users\HR\.claude\projects\E--Apple-Store\…\tool-results\`. It contains FAKE scenario text only.

## 11. Separate review conclusions (read-only; Codex's work, not mine)

### 11.1 Management repairs M1/M2 (`tools/delegation/process_tree.py`, `invoke_claude.py` and their tests)

I read all three test files and both modules, and ran the three test commands (§6).

**M1 (process-tree containment): bounded agreement — resolved.**
- The child is created suspended, and the PID receipt is saved before it runs.
- It is assigned to a Job Object with `KILL_ON_JOB_CLOSE` and no breakaway; only then is the primary thread resumed.
- An `on_started` failure kills the never-run child.
- `terminate_tree` holds SYNCHRONIZE handles and calls `TerminateJobObject` on the owned job only. It then waits for an active count of 0 and for every exit signal.
- Descendants of a CLI that has already returned are drained.
- Dispatcher death is contained by the job handle closing.
- The tests use a real grandchild and real dispatcher death.

**M2 (spawn failure / unresolved tree): bounded agreement — resolved.**
- A known spawn failure records `failed`, `cleanup_confirmed: true`, `pid`/`result_path` null and `model_verified: false`.
- `ProcessTreeUnresolved` keeps `running` and exits 5, which blocks the next dispatch.

**Low findings (none blocks; all fail safe):**
- (a) `_owned_process_handles` does not check `listed < assigned` on a successful but truncated query. This is mitigated by the active-count loop.
- (b) A PID can be reused between the job PID query and `OpenProcess`. The handle is SYNCHRONIZE-only, so the worst case is a spurious `ProcessTreeUnresolved`, never killing an unrelated process.
- (c) `close()` in the init-cleanup `finally` can mask the original exception if `CloseHandle` fails.
- (d) Log or result write failures after `communicate` leave `running`. This is conservative and needs manual resolution.
- (e) An `on_started` `save()` failure kills the child but leaves the on-disk record `running`. This is conservative and blocks dispatch.

**Information only (M3):** earlier sessions auto-approved read-only commands outside the allowlist (§10). This is a harness/permission observation, not a code defect.

### 11.2 Codex's previous quota-takeover product changes

Bounded conclusion from my C-007 cross-review, updated:
- **C-006-R1:** agreed within the stated limits.
- **C-007:** I did not agree to final acceptance because of F1–F8.
- R1 repairs (mine) now replace or modify those areas, and they need independent acceptance by Codex. I do not approve them.
- **Codex-authored parts I did not rewrite and still rely on:**
  - page-stage classification and `classifyTransport` in `web/launch/observer.js` (my edits there are the condition/visibility logic of F2 and SYNTHETIC wording);
  - the 20 replay sample definitions (I changed only the total and quantity wording);
  - the `src/launch-replay.ts` CLI.
- I found no new defect in those Codex parts during this run. The CLI remains unexecuted (§7).

## 12. Exact unresolved issues and checkpoint

1. Independent acceptance of all R1 repairs (Codex). Not claimed.
2. Actual Chrome evidence of the current bytes (Codex): 390px layout, warning adjacent to start, browser/AST projection equality for the issued samples, and `/launch` same-tab control.
3. Execution of the `src/launch-replay.ts` CLI against the new sample API (needs an approved command, or a test owned by Codex).
4. The legacy limits in §8 are deliberate, conservative and documented. They are not bugs to be relaxed.
5. The real adapter remains unimplemented. Real Apple contracts beyond the OBSERVED anchors are unverified.

**Restore point:** the working tree holds the final bytes above. The full suite is 258/258, protected 18/18, rehearsal 29/29, and management tests 5/2/2 OK. The continuation manifest mismatches only `README.md`, `src/app/launch-session.ts` and `src/launch.ts`.

**Next dependency:** the C-009 Chrome one-start proposal, only after independent acceptance and actual scoped agreement.
