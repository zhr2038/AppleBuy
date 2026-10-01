# C-003-R2 delivery report (Claude, implementer)

Date: 2026-10-01. Session: `11941a88-4609-4e7f-a2f8-78c5b5837285`. Scope: `docs/tasks/C-003-R2.md` only, in `E:\Apple Store`.
This report is **not** an acceptance. Final C-003 acceptance stays with Codex's independent re-run and with my later read-only re-review of the source manifest. I have not approved my own work.

## 1. Outcome summary

| Item | Result |
|---|---|
| F1 (blocking): partial backup restore | Fixed. Both protected F1 cases pass. After the blocked restart: exactly 1 fake order, 1 `submitOrder` call, and identical site counters. |
| F2: accurate cause | Fixed. The protected F2 case passes. The cause appears in the start blocker, `recoverBlocker`, the `armFormal` refusal, the send-time `loopError` and the rendered view. |
| F3: history cost | Measured with `node review/fixtures/history-cost.ts` (§5). No caching was added. Every mutation still gets a full evidence check. |
| F4: run-record-before-first-journal gap | Documented with a manual investigation path (§6). The code ordering is unchanged and still fails closed. |
| C4-1 / C4-2 | Fixed. All 5 protected regressions pass, plus 7 new implementation cases. Readiness and mutation flags are unchanged. |
| C4-3 | Unchanged and passing. No `src/**` module imports `entry/`. |
| Physical fixture-path nit | Addressed: fixture enablement now follows the resolved physical path. |
| Full suite | 144/144 pass. That is the 124 pre-existing cases unchanged, the 9 protected reviewer cases, and 11 new `test/**` cases. |

## 2. Changed paths

- `src/app/task-store.ts` (already had uncommitted modifications in the working tree before this task; my edits are on top of them):
  - added `TaskLedger.evidence()`, the `Evidence`/`EvidenceProblem`/`EvidenceCause` types, `describeEvidence()`, `ledgerFileDamaged()`, `EVIDENCE_GUIDANCE` and `UNSAFE_LEDGER_RUN`;
  - `entries()` and `record()` are now built on `evidence()`.
- `src/app/task-app.ts`:
  - wired `evidence()` into `startBlocker`, `recoverBlocker` (new evidence gate), `armFormal` (new evidence gate, code `"evidence"`), the `beforeSend` send-time check, and `state().ledger` (`problem`, and a corrected `corrupt`);
  - added `physicalPath()` and a physical `isInsideTestRuns()`;
  - `TaskApp.open` now gates fixtures on `store.dir`.
- `web/render.js`: `renderApp` shows a cause banner ("持久证据异常：…"). It says "损坏" only for real ledger-file damage, and tolerates a state without `control`.
- `entry/public-entry.ts`:
  - added `explicitlyHidden()` and `withoutHiddenMarkup()`, now used by `inspectPublicHtml`;
  - `inspectPublicDom` requires `typeof productHeading === "string"`.
- `test/app-evidence.test.ts` (new, 4 cases).
- `test/public-entry-hidden.test.ts` (new, 7 cases).
- `docs/claude/C-003-R2-report.md` (this file).

Not changed:
- `review/**`, management, review and acceptance documents, the baseline, the dispatcher, `.claude`, `.git`;
- existing tests and their acceptance criteria;
- `src/cli.ts`: its existing `isInsideTestRuns(taskDir)` call now resolves physically through the shared function.

## 3. Design decisions and rationale

### F1: physical run artifacts are part of the evidence

`TaskLedger.evidence()` checks every independent local artifact, in this order. It returns the first failure as `{cause, runId, message}`:

| Order | Cause | Condition |
|---|---|---|
| 1 | `ledger-missing` | The ledger file is absent. It is created together with `task.json`, so absence means evidence loss. |
| 2 | `ledger-unreadable` | The ledger file is unparsable or holds a semantically invalid entry (existing FileLedger validation). |
| 3 | `task-unreadable` | `task.json` is unparsable or invalid. |
| 4 | `runs-unreadable` | `runs/` cannot be listed. |
| 4 | **`orphan-run-evidence`** | **New.** Any entry physically present under `runs/` that `task.json.runs` does not record. |
| 5 | `ledger-foreign-entry` | A ledger entry has no matching recorded run. |
| 6 | `run-journal-unverifiable` | A recorded run's journal is missing or fails hash-chain, allowlist or plan-binding verification. The text distinguishes "缺失" from "无法验证（error）". |
| 7 | `submit-missing-from-ledger` | A journaled `sent submitOrder` has no ledger entry. |

Why this closes F1: restoring `task.json` and the ledger from an earlier backup removes the run from the manifest. It does not remove `runs/<id>/journal.jsonl`. That leftover directory is now unexplained evidence, so it fails closed.

Effects:
- `entries()` maps any failure to the existing "unknown/consumed" sentinel. The engine's `ledger.find` therefore keeps blocking, as before.
- `record()` refuses to write and names the cause.
- Nothing is repaired, deleted or rewritten. The new test asserts that the journal, ledger and `task.json` bytes are identical after the refused attempts.

The `armFormal` and `recoverBlocker` gates are new. They make sure that no second arm, start or recovery-driven submit can become eligible while evidence is inconsistent. This also covers the pre-arm-backup variant, where the restored `task.json` has no `formalArm`. Without the new gate, arming would otherwise be re-offered.

Unchanged:
- the shutdown/quiesce path, OS ownership lock, journal format and verification;
- task-wide ledger semantics, late-reply detachment;
- the send-time re-validation in `beforeSend`. It still runs before every mutation; it now calls `evidence()` and includes the cause.

Conservative consequence: any stray file or directory under `runs/` blocks the task, by design.

### F2: the cause is kept end to end

`describeEvidence()` produces two kinds of message:
- "购买台账损坏：…" only for `ledger-missing` and `ledger-unreadable`, which are real ledger-file problems. This keeps the existing `/台账损坏/` expectation in `test/app-core.test.ts`.
- "持久证据不一致：<the artifact actually at fault>" for every other cause.

Both are followed by the same actionable guidance: fail closed, all files preserved, verify manually, do not delete history, do not create an empty ledger or a new task to resubmit.

Where the cause appears:
- the start blocker;
- `recoverBlocker`, prefixed "拒绝恢复：";
- the `armFormal` refusal;
- the send-time error, "已停止发送（本操作未发出）：…", which becomes `loopError`;
- `state().ledger.problem` (`cause`, `runId`, `message`, `summaryZh`).

`state().ledger.corrupt` is now true only for ledger-file damage. Unsafe evidence still reports `entries: 1, status: "unknown"`, so it is still treated as consumed.

The view shows one of:
- "购买台账：损坏（按结果不明处理）" for real ledger-file damage;
- "购买台账：文件可读，但与运行证据无法核对一致（按结果不明处理）" for any other evidence problem.

It also shows the full cause line. `renderApp` no longer throws when `control` is absent (a direct `app.state()` render). It shows "控制权：未连接网页" instead.

`state()` computes evidence once and passes that same synchronous result to both blockers. This is not a cache: nothing is kept between calls.

### C4-1 / C4-2

`withoutHiddenMarkup()` runs after the existing comment, script and style stripping. It removes these subtrees before the heading, title, notice and approval text are read:
- `<template>` and `<noscript>`;
- elements with a boolean `hidden` attribute;
- `aria-hidden="true"`;
- inline `display:none`, `visibility:hidden` or `content-visibility:hidden`.

How it parses:
- Attributes are parsed properly, so `class="hidden"`, `data-hidden` and `aria-hidden="false"` do not match.
- Same-name nesting depth is tracked.
- Void elements and SVG/MathML self-closing tags do not open a subtree. Real-page SVG icons, such as `<svg aria-hidden="true">…<path/>…</svg>`, still close correctly.
- A non-void HTML `<div hidden/>` is treated as open, as browsers do.
- An unclosed hidden element drops the rest of the document. That can only remove positive signals, never add them.

`inspectPublicDom` now rejects any non-string `productHeading`, including arrays, objects, `String` objects, `null` and numbers.

No status, blocker or readiness/mutation flag was relaxed:
- `purchaseReady`, `realMutationsAvailable`, `slotContractVerified` and `checkoutSkuVerified` stay `false`;
- `configuration` stays `NOT_LOADED`;
- HTML-only results stay at most `PUBLIC_CATALOG_ONLY`.

### Physical fixture-path nit

`physicalPath()` resolves the nearest existing ancestor with `realpathSync.native` and re-appends any missing tail. `isInsideTestRuns()` compares the physical form of the root with the physical form of the directory, so a lexical alias under `.local/test-runs` that points elsewhere no longer enables fixtures. `TaskApp.open` gates on `store.dir`, which is already a realpath.

The unit test injects a fake resolver and creates no real junction. That avoids any recursive cleanup ever following a link outside the test root. A real contained temp directory still enables fixtures, and all existing crash/fixture process tests pass.

## 4. Commands actually run and results

| # | Command | Result |
|---|---|---|
| 1 | `node --test review/rollback-evidence.test.ts review/public-entry-cross-review.test.ts` (after F1/F2 only) | 4 pass, 5 fail. F1 ×2, F2 and C4-3 passed. The 4 C4-1 cases and C4-2 still failed because they were not yet implemented. |
| 2 | Same command, after the C4 fixes | **9/9 pass** |
| 3 | `node --test "test/*.test.ts" "review/*.test.ts" > ".local/test-runs/c003r2-full.txt" 2>&1` | **Permission denied** (redirect wrapper, outside the approved plain form). Not retried in that form. |
| 4 | `node --test "test/*.test.ts" "review/*.test.ts"` | **144/144 pass**, 0 fail, about 5.5 s |
| 5 | `node src/cli.ts rehearse --all --quiet` | 27 scenarios, 27 as expected, 0 unexpected. Non-local network accesses: 0. |
| 6 | `node src/cli.ts bench --runs 200 --warmup 20 --seed 1` | See the table below. |
| 7 | `node review/fixtures/history-cost.ts` | See §5. |

Bench results (command 6), 200/200 accepted for each strategy:

| Strategy | T1 P50/P95/max (ms) | T2 P50/P95/max (ms) | T3 P50/P95/max (ms) | Stale-ref actions | Max in-flight |
|---|---|---|---|---|---|
| fresh-list | 0.049 / 0.080 / 0.236 | 0.075 / 0.171 / 0.171 (n=14) | 0.034 / 0.052 / 0.085 | 0 | 1 |
| naive-remembered | 0.045 / 0.073 / 0.279 | 0.043 / 0.072 / 0.072 (n=16) | 0.031 / 0.054 / 0.120 | 0 | 1 |

These are in-memory decision timings, unaffected by this change.

**Reproduction outcomes:**
- F1 restored ledger and F1 empty ledger: `start` returns `ok:false`, the site counters are unchanged, and orders = 1, `submitOrder` = 1.
- F2: the message contains "日志" and not "购买台账损坏". The rendered view contains "日志" and not "购买台账：损坏". The ledger bytes are unchanged.
- C4-1 ×4: the notice and approval are `null`, and `purchaseReady` is `false`.
- C4-2: all four coercible values give `UNKNOWN_STRUCTURE` with `recognized:false`.

**New implementation tests:**
- Pre-arm backup restore: `arm`, `start` and `recover` are all refused, no counter changes, and every artifact keeps its exact bytes.
- Send-time orphan injection at the first `chooseSlot`: `chooseSlot` = 0, and `loopError` and the view name `runs/run-strayartifact`, which is preserved.
- Cause table: ledger missing, garbled journal, emptied ledger after a submit, and a foreign ledger entry each give the right cause, wording and `corrupt` flag. Arm is refused and no mutation is sent.
- The physical-path nit.
- Seven C4 edge cases: retained content after a closed hidden subtree, nested depth, inline styles, `<div hidden/>`, non-matching attribute names, hidden heading and template title, an unclosed hidden element, aria-hidden SVG icons, and a String-object heading.

## 5. F3: durable-history cost

The harness opens one contained app, runs fake default rehearsals up to 0, 10 and 50 history runs, and takes 30 samples after 3 warm-ups. There was no formal arm and no submit (`fakeSubmitCalls`: 0). Environment: Windows 11, Node v24.16.0; the storage type was not inspected. Run once.

| History runs | `ledger.entries()` P50 / P95 / max (ms) | `app.state()` P50 / P95 / max (ms) |
|---|---|---|
| 0 | 0.521 / 0.623 / 0.843 | 0.987 / 1.388 / 1.770 |
| 10 | 7.179 / 9.497 / 13.211 | 6.780 / 7.102 / 7.353 |
| 50 | 27.125 / 29.064 / 29.333 | 27.368 / 30.072 / 31.859 |

**Interpretation and limitations:**
- The cost grows roughly linearly, at about 0.5 ms per historical run. Each evidence check lists `runs/` and re-reads and re-verifies every recorded journal's hash chain.
- The same full check runs in `beforeSend` before **every** mutation. At 50 history runs, this measurement implies about 27 ms of local I/O and verification before each send on this machine. The in-memory T1/T2/T3 benchmark deliberately excludes this cost.
- `app.state()` now does one evidence pass, shared by both blockers, plus the `task.json` load. So it costs about the same as one `entries()` call.
- I did not measure a pre-change baseline in this session, so I make no before/after claim.
- These are numbers from one machine and a warm file cache. They are not a production latency bound, a cold-cache figure, an antivirus-affected figure, or any Apple timing.
- No caching was introduced, and no per-mutation check was weakened. A future option, not implemented and needing review, would be an append-only verified-prefix index whose own integrity is checked. Without that, any shortcut would be unverifiable.

## 6. F4: run-record-before-first-journal gap (documented, not redesigned)

**The window.** `TaskApp.start()` makes these calls in order:
1. `doc.runs.push(run)`, plus `formalArm.usedByRunId = runId` when armed;
2. `store.save(doc)`, which is durable;
3. `site.reset(scenario)`;
4. `new CrashableJournal(...)`, which creates `runs/<id>/` with `mkdir`;
5. the engine's first `append`, which writes the run-start and plan-binding records.

A crash or I/O failure between steps 2 and 5 leaves a recorded run whose journal does not exist. The `runs/<id>/` directory may or may not exist.

**Behaviour, unchanged and fail-closed.**
- `evidence()` reports `run-journal-unverifiable`: "运行 <id> 的日志 runs/<id>/journal.jsonl 缺失；无法确认该运行是否发送过操作".
- Start, recover and arm are refused, and no send can pass `beforeSend`.
- If an arm was attached, it is already marked used by that run, so it cannot be re-armed.

Local files alone cannot tell this harmless crash boundary apart from deletion of a journal that did record mutations. That is why it must stay blocked.

**Safe manual investigation path** (for the user or an operator; nothing here clears the block):
1. Do not modify, delete, rename or recreate anything in the task directory. First make a full read-only copy of the directory as a backup.
2. From the blocker or the view, note the named run id, then look at:
   - its `task.json` `runs[]` entry (`startedAt`, `rev`, `planHash`, and whether `capability` is non-null, meaning a formal arm was attached);
   - whether `runs/<id>/` exists, and whether it is empty;
   - the ledger entries;
   - `owner-history.jsonl` / `owner.json` for a crash around `startedAt`.
3. A recorded run with no journal file, no ledger entry, and a crash or I/O error close to `startedAt` is *consistent with* the F4 window. It is still not proof that nothing was sent.
4. Check the authoritative order status independently:
   - for the current fake mock, the `mock-site/state.json` order records;
   - for any future real mode, the person checks their own Apple order history themselves, in their own browser.
   The tool must not do this with stored credentials.
5. Whatever the result, the tool must not be "unblocked" by:
   - deleting history;
   - writing an empty or edited ledger;
   - creating a new task or purchase identity for the same purchase;
   - resubmitting.

   No reviewed in-app acknowledgement or clearance flow exists. Any further purchase is a deliberate human decision outside the automatic flow. Codex will write the user-facing wording.

**Optional redesign, considered and not implemented.** Writing the journal's run-start record before saving the run into `task.json` moves the window, but does not remove it. A crash then leaves a journal that `task.json` does not record, which F1's orphan rule also blocks. Both orders fail closed; only the reported cause would change. Making the step atomic would need a different durable design that preserves F1. I left the current order in place to avoid an unreviewed change in recovery semantics.

## 7. Known limitations (retained)

- **Scope of F1.** This protects against a partial local restore that leaves any independent run artifact behind. It is not server-side exactly-once. If `task.json`, the ledger **and** `runs/` are all rolled back or deleted together, the task looks pristine and the tool cannot detect a prior purchase. The mock site's order records are not consulted, because they are fake test state, not evidence.
- **Conservative blocking.** Any stray file or directory under `runs/` (for example, one left by a backup tool or editor) blocks the task until a human investigates.
- **C4 is a markup filter, not computed visibility.** Stylesheet or class-based hiding, `opacity`, off-screen positioning, closed `<details>`, hydration, and script-generated content are not evaluated. Class-hidden text can therefore still be read as displayed. HTML results never exceed `PUBLIC_CATALOG_ONLY` and never attest controls, stock, SKU, slots or readiness. Tag scanning is regex-based, with bounded input (2 MiB); pathological unbalanced-quote markup could be slow.
- **Physical path.** The nit fix is tested with an injected resolver, not a real junction.
- **No type-check.** `tsc` was not run, because no install or tooling is allowed. Node strips types only, so type errors would not fail the tests.
- **Reporting gaps.** I did not run `git status`/`git diff` (not on the approved command list). The changed-path list in §2 is from my own edit log. History-cost was run once, and no pre-change baseline was measured.

## 8. Requirement mapping (R01–R10, impact of this change)

- **R07** (restart/recovery keeps truth and identity) and **R09** (one purchase identity, single-use formal capability): strengthened by F1 and F2. Partial restores and unexplained run artifacts can no longer re-enable start, arm, recover or send.
- **R10** (visible, honest app state): F2 adds cause-specific Chinese status in the blocker, the send-time error and the rendered view.
- R01–R06 and R08 (plan binding, configuration blockers, refusal→fresh-list reselection, none vs failure, pause): logic unchanged. They are covered by the unchanged passing cases and the 27/27 rehearsal.
- C4-1/C4-2/C4-3 belong to the C-004 read-only public-entry preflight. They support no R-level readiness claim.

## 9. Real evidence vs simulation

All new tests, the rehearsals, the bench and history-cost use FAKE plans, the local mock site and contained `.local/test-runs` directories. No live website call, browser interaction, account/session read, credential, real order, payment, time selection or reservation took place. The C4 fixtures are synthetic HTML and DOM snapshots; they are not observations of Apple pages. No SKU, interface, slot capacity, reservation duration or launch readiness is claimed.

## 10. Permission denials and budget

- One denial: the full-suite command with a `>` redirect wrapper (§4 #3). It was re-run in the approved plain form and that run succeeded. There were no other denials.
- Budget: about USD 3.3 of 8 used when this report was written. Not exhausted.

## 11. Checkpoint (resumable)

- State: all C-003-R2 code, tests and this report are written. The protected reviewer files pass 9/9, the full suite passes 144/144, rehearse is 27/27, bench ran, and history-cost ran.
- Nothing was committed or pushed.
- Next step (Codex):
  1. Independently inspect the diff of the paths in §2.
  2. Re-run the five approved commands.
  3. Decide whether the conservative `runs/` orphan rule and the documented F4 behaviour are acceptable.
  4. Then request my read-only re-review of the resulting immutable source manifest.
- Open decisions for management:
  - user-facing wording of the F4 limitation;
  - whether a reviewed human-acknowledgement flow for blocked tasks should ever exist;
  - whether per-mutation evidence-check cost at large history counts needs a verified index design.
