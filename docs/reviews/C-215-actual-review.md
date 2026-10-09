# Actual Opus 5.5/max report — rejected candidate, not acceptance

# C-215 consolidated R1+R2 review: delivery report

## Verdict: DISAGREE (narrow)

There is one material regression in R2, F-A below. It was reproduced by tracing the code, not by running a new test. It does not compromise safety: I found no duplicate final, no native click without an acknowledged durable write, no fallback, no login automation and no profile copy. Apart from F-A, the six critical checks hold within the evidence limits stated below. The R1 (C212) portion on its own has no new material finding. This is a review result, not acceptance.

## Commands (each run once, in order, in the foreground)

1. `python -B tools/delegation/verify_candidate_manifest.py docs/reviews/C-214-candidate-manifest.json`
   - **Passed.** It ran before the second context compaction, and its exact output text was not kept.
   - Command 3 verified the same manifest twice: 328 files, sha256 `47011963…4b12`, no mismatches.
2. `node --test test/desktop-c214-r2.test.ts test/checkout-c214-r2-native.test.ts test/checkout-c209-controlled-review.test.ts test/desktop-c212-review-recovery.test.ts test/checkout-c212-bounded-waits.test.ts`
   - **50 tests: 50 passed**, 0 failed, cancelled or skipped; 14,681 ms.
3. `python -B tools/delegation/run_review_checks.py docs/reviews/C-214-candidate-manifest.json`
   - **All 5 ordered checks passed.** Each had exit code 0, no timeout and `ownedTreeCleanupConfirmed: true`.
   - Manifest OK (328 files, `47011963…`); protected tests 108/108; Python 66/66; full Node suite 1829/1829.
   - The manifest was verified again after the tests and was unchanged.

## Material finding

### F-A (Medium): an action the desktop deliberately never released stays recorded as possibly sent

**Trace**
- In the browser, `store.put` publishes a checkpoint and then waits for `r2Ack` (`web/checkout-connector/r2-executor.js:68-74`).
- On the desktop, `r2-browser-run.mjs:26-28` writes the checkpoint to disk and re-reads it. If a pause arrived during that write, `:29` sends `r2Pause` instead of `r2Ack`.
- `r2Pause` calls `stop()`, which rejects the browser's waiting promise (`r2-executor.js:15,29`). The browser therefore can never click.
- The job's write-ahead save is at `job.js:515`. R1's truthful correction follows at `job.js:516-519`: it sets `dispatched:false` and `finalIntent.sent=false` and records "control-changed-after-write; not dispatched".
- In R2 that save throws instead of returning, so the correction never runs. Any further save would also fail the `live()` check.
- Result: the shared journal keeps the write-ahead `pending` without `dispatched:false`. For `submitOrder` it also keeps `finalIntent.sent=true` (`job.js:508`). R1, running the same job against the desktop store, records the truthful not-dispatched state.

**Second trigger: an explicitly refused ack**
- If the 2.5 s watchdog fires during a slow desktop write, `live()` throws at `r2-executor.js:49`, before the waiting promise is resolved.
- The desktop then throws at `r2-browser-run.mjs:30` and leaves the same record.
- An error reply proves the action was not released. A transport timeout or poisoned connection is genuinely ambiguous and should stay unknown.

**Impact**
- The failure is on the safe side: no duplicate and no unauthorized action.
- But the shared cross-adapter journal becomes false in the conservative direction, and it happens on a control R2 was meant to keep. Pause works even while a step is running (`native-purchase-worker.mjs:44`).
- For ordinary steps, the action is never re-sent, so the task gets stuck.
- For the final, an unsent click becomes an "unknown sent final". Submit is then refused, and every successor path requires `legacyFinalProofClear`, so the programme cannot finish this task. The user can only check the order list and act manually in the preserved window.

**Why the tests miss it**
- `desktop-c214-r2.test.ts:40-44` pauses *after* the checkout click was sent.
- `:66-70` stops *after* the ack. There the desktop cannot know what happened, so keeping the action unknown is correct.
- `:76-83` never reaches a write.

**Reproduction (not executed; adding tests is outside my role).** Use the `r2()` fixture with `f.w.phase='BAG'` and `f.w.count=1`. Wrap `f.runtime.store.put` so that for `v.pending?.action==='checkout'` it does one of the following after the real write:
- (a) calls `f.runtime.pause()` without awaiting it;
- (b) waits 3,000 ms.

Expected under the R1 rule: `pending.dispatched===false`. Predicted actual: no `checkout` in `f.w.commands`, but `dispatched` is undefined, and a later resume never sends the checkout. Repeated on `submitOrder`, the prediction is `finalIntent.sent===true` with zero final clicks.

**Suggested fix (Codex decides).** Whenever the desktop withholds the ack, or receives an explicit refusal rather than a transport loss:
1. confirm the stop with `r2Pause` and then `r2Finish`;
2. durably write the R1-equivalent not-dispatched correction under the lease;
3. add tests for both triggers, including `submitOrder`.

## Lower findings

- **F-B (Low–Medium; untested):** the ack must arrive within 2.5 s of the poll that delivered the checkpoint, with no heartbeat in between (`r2-executor.js:39-44`).
  - In that window the desktop hashes the whole record, re-reads the journal, does the leased atomic write with fsync, and re-reads again (`r2-browser-run.mjs:25-28`).
  - Large records or a slow disk would trigger F-A's second case. Physical-write tests use only small records, and real latency is unmeasured.
  - A separate, longer deadline for the ack would fix this.
- **F-C (Low; defence in depth):**
  - The desktop validates patches by key only. Nothing checks that `finalIntent`, `bagAddStarted`, refusals, rejected dates, initial dates, floors, `pending.deadline` or the rolling history only move forward. Those rules now rest on job code running in the extension rather than on the desktop.
  - `R2_VERSION` is a constant string, so it catches old extension versions but not modified code.
- **F-D (Low; fails closed):** after a pipe disconnect or `R2StopUnconfirmed`, the extension's stale run keeps refusing new R2 runs and all R1 page operations until the session is closed or the extension reloads. Nothing restarts implicitly.
- **F-E (Info):** the user's private pickup details travel inside the hashed R2 snapshot and stay in extension memory for the run. They are not a journal field, so they are not persisted.
- **F-F (Low):** the CHALLENGE/THROTTLE stop checks (`r2-executor.js:87`, `auth-continuation.mjs:14`) never fire.
  - `page-program.js` never produces those phases; a search found no match. Its only `merchantError` source is the session-expired page (`:27,33`).
  - A real throttle or challenge page would be observed read-only every 500 ms, for at most 5 minutes and never past the task window. No action is taken, so this is not a safety issue.

## Critical checks 1–6

1. **The C213 R1 questions hold.** Taken as enumerated in the C-215 sheet:
   - The REVIEW proof is a labelled controlled-document witness. The merchant store and slot stay null, and `heldSlotVerified` is false. The window text promises no reservation (`app.py:442-445`).
   - Trusted human input invalidates the witness, as do a replaced main element or a return to the slot page.
   - Final consent is same-document, at most 60 s old, and bound to the current terms and review progress.
   - The successor copies the original dates, floors, cursor and refusals, and sets the accepted slot to null. It is once-only, and 8 bad source shapes are refused before any probe.
   - Archives and backups are hash-checked.
   - The receipt/detail page is unobserved, and the final is never resent.
2. **R2 structure holds, except for F-A and F-C.**
   - R2 uses the same journal and kernel lease.
   - The snapshot is uploaded in bounded, hashed chunks and checked as current before begin, run and every write.
   - An exact sequence/hash ack precedes every native action; the fixtures assert this.
   - Identity, deadline, plan and archive fields are immutable.
   - There is no new namespace, and retired, readonly or foreign-context records are refused.
3. **The fault trace holds, except for F-A and F-B.**
   - Covered: startup version check before any tab, chunk validation, duplicate runs, Web Lock contention, R1 operations refused during a run, a second kernel owner refused, and a single Python worker.
   - A pause during an awaited call stops before the next call; calls already in flight are not cancelled. Pipe loss stops the run, the watchdog works, late or mismatched replies poison the connection, and an unknown final is kept.
   - There is no implicit restart or fallback to R1: the executor is fixed per worker (`native-purchase-worker.mjs:10-12`) and the cleanup block only pauses and finishes.
4. **Login and late-render handling hold, with F-F.**
   - The waiting loop runs in the browser and only observes. It keeps the same run, is limited to min(5 min, task window) and at most 10 rounds, and R2 adds no desktop watcher (`:26`).
   - The native channel refuses saved profiles.
   - No manifest file appears among the changed files at session start, and only the merchant-document reader can be injected.
   - Per-document injection is reused.
5. **Test layers are kept separate:**
   - the contained loopback Chrome test with FAKE Chrome API, merchant and store;
   - component fixtures;
   - temporary physical journal tests;
   - the Python launch selector (no profile copy; one worker).

   No installed-extension or real-order proof is claimed.
6. **The stated limits are honest.** The C-214 checkpoint and verification files label everything FAKE. They state that receipt, real refusals, speed and deployment are unproven.

**Earlier hardening items:**
- Still open: H1 and H2 (`page-program.js:433-443`).
- Partially addressed: H4 and H6.
- Not re-assessed: H3, H5 and H7. Their definitions were lost in compaction, and my search found only an unrelated C-025 list.

## Coverage (actual reads in C-215)

- **Context:**
  - Read: the C-215 sheet, AGENTS, CLAUDE, requirements, the top of C-211, the C-212 and C-214 task sheets, both checkpoints, both verification files and the C-214 manifest.
  - Not read: `docs/plan.md` (not on the sheet's list).
- **Production files, 22/22 read to the end:**
  - 17 before the second compaction.
  - 5 after it: `auth-continuation.mjs`, `native-purchase-worker.mjs`, `interactive_child.py`, `app.py`, `invoke_claude.py`.
- **Tests, 7/7 read to the end**, after the second compaction.
- **Re-checks after compaction:**
  - Re-read `job.js:503-524`, plus two targeted searches.
  - The F-A citations for `r2-browser-run.mjs` and `r2-executor.js` come from their earlier full reads in this session, which were shown again after compaction.

## Limitations and disclosures

- **Superseded task:** `C-212-REVIEWER-SYNC.md` was not read or executed; C-215 supersedes it.
- **Compaction:** the context was compacted twice during this review.
- **No interruptions:** there were no permission denials and no quota interruption.
- **Model and effort:** I run as `claude-opus-5-5`. The dispatcher requested `max` effort, but I cannot observe effort or modelUsage; Codex must verify those.
- **Budget:** about USD 6.8 of 15 before this report and roughly 17 of 80 turns. I cannot see elapsed wall time.
- **Process cleanup:** command 3 reported cleanup as confirmed. For command 2, Chrome shutdown relies on the tests' own cleanup hooks. I ran no extra process check, because the sheet forbids extra commands.
- **Outside dependencies:** Playwright (from `~/.cache/codex-runtimes`) and the system Chrome were used only by the allowed test runner, and I did not read them. Page-level routing blocks non-loopback requests, but Chrome's own background traffic is not proven to be zero.
- **Not read:**
  - test fixtures (`c121-native-world.mjs`, `c185-ended-world.mjs`, the c078 Python helpers);
  - the extension manifest.
- **Unrun tests:** no reproduction test for F-A exists or was run.
- **R01–R10 mapping:** not produced, since this is a review.
- **Changes:** none. No files were changed or created, and no git operations, network access or source edits were made.
