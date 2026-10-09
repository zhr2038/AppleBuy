# Actual Opus5.5/max bounded review — source330

# C-218 delivery report: completing the interrupted C-217 review

## Verdict: **AGREE (bounded)** on the combined R1+R2 candidate

The candidate is the C216 map: 330 files, sha256 `8b2e917ae0872e1c65a6d0db58b1f0bdaf3dfe7c25333ba68d17ee0f301dcd2b`.

- **F-A is resolved** for every trigger the sheet names.
- **F-B is resolved.**
- **No new material finding.** The new residual issues below are all Low or Info, and every one fails closed (the task stops rather than acting).
- **What this is not:** a review result only. It is not acceptance, not approval to deploy, and not evidence about real orders. C215's DISAGREE is superseded only for F-A and F-B.

## F-A: resolved

All line references in this section come from files I read in full during C-218.

- **A not-sent receipt can only describe a write the browser never released.**
  - `r2-executor.js:15`: `stop()` creates the receipt (`r.unreleased ??= {runId, sequence, sha256}`) only while a write waiter is outstanding, and then rejects that waiter.
  - `:52`: an ack clears the waiter and the checkpoint in one synchronous step before resolving. A checkpoint that has been released can therefore never get a receipt later.
  - `:70`: a new write is refused while a waiter exists and after a stop. So there is at most one receipt per run, and `??=` keeps the first.
- **The browser must confirm the stop is final.**
  - `:31`: `r2Finish` is refused while the job is still running or a waiter exists.
  - `r2-browser-run.mjs:14`: the desktop requires `finished===true`.
- **The receipt must match exactly, and the intent must be new.**
  - `:18`: run, sequence and hash must all match the desktop's own candidate.
  - A candidate exists only in two cases: a pending action with a new id that is not already marked `dispatched:false` (`:47`), or a new unsent final draft with no pending action (`:48`).
  - The candidate is recorded only after the durable write and read-back (`:49-52`), and cleared after a successful ack (`:55`).
- **The row on disk must be unchanged before correcting.**
  - `:19` re-reads and compares the whole row; `:21` and `:23` re-check the pending action and the final intent; `:25` ties the pending final to its intent; `:30` writes and reads back.
  - The owner lease is held by `runDesktopSession` (`browser-session.mjs:25-27`; verified against unchanged bytes, not re-read in C-218).
- **Silence or a refusal alone never triggers a correction.**
  - A timeout poisons the API connection (`native-checkout-api.mjs:10`). `r2Finish` then cannot be called, so the run ends with `R2StopUnconfirmed` (`r2-browser-run.mjs:73`) and the old unknown state stays.
  - A negative reply only leads to a correction if a later, final `r2Finish` returns a matching receipt.
- **The correction resets nothing else.** It changes only `pending.dispatched`, `finalIntent.sent`, `finalIntent.notDispatched`, `state` and `reason`. Expiry, deadlines, source and history are untouched.

## F-B: resolved

- **2.5 s idle heartbeat:**
  - It is set when the run starts (`r2-executor.js:39`), refreshed by each poll while the run is live (`:44`) and refreshed again after an ack (`:52`).
- **15 s ack window:**
  - `:46` sets `ackDeadline=now+15000` only when it is null, at the first poll that offers a waiting checkpoint.
  - Later polls refresh only the heartbeat, which `live()` and the watchdog ignore while that window is active (`:13`, `:40`).
  - A new checkpoint clears the window (`:72`) and can only exist after the previous waiter has gone (`:70`), so each checkpoint gets exactly one window.
- **Abandoned browser runs still stop.** The watchdog checks every 250 ms (`:40`): within 2.5 s when idle, within 15 s once a checkpoint has been offered.
- **Availability tradeoff:**
  - If the desktop dies mid-write, the browser run stays blocked on its waiter, holding the browser lock, for up to 15 s. It can take no action during that time.
  - The refusal of further R1/R2 operations lasts until the session is closed anyway (F-D).
  - In return, writes up to 15 s now succeed. Writes longer than 15 s become a truthful "not dispatched" correction instead of a false unknown.
- **Expiry branches:**
  - Task expiry is checked before the write-ahead (`job.js:504`). An expired unsent record is refused at run start (`r2-executor.js:38`) and by `review-progress.js:11`.
  - The 8 s `submitOrder` deadline is computed before the write (`job.js:507`), so a slow ack eats into the time allowed to see the result. The outcome is a conservative unknown, the same as a slow R1 local write.
  - Final grants last at most 60 s (`browser-session.mjs:54`). They are checked at `job.js:497` and again at click time (`page-program.js:699`, from the C-217 search).

## Every ordering examined

| Ordering | Outcome | Correct? |
|---|---|---|
| Pause before the desktop receives checkpoint N | Receipt N exists, but the desktop never wrote N, so there is no candidate and no correction | ✓ |
| Pause while N is being written (`:53`) | Receipt N matches → correction (tested for checkout, submitOrder and the final draft) | ✓ |
| Write or read-back of N fails | No candidate, no correction; the old or unknown state remains | ✓ |
| Ack explicitly refused (ok:false, or 15 s window expired) | The waiter is still outstanding → receipt N → correction (tested) | ✓ |
| Ack request lost before it arrived (connection not poisoned) | The browser still holds N → receipt N → correction | ✓ (same code path as a refused ack; no separate test) |
| Ack accepted but the reply was lost | Waiter already released → no receipt for N; any receipt names N+1 or later → stays unknown (tested) | ✓ |
| Any RPC times out | Connection poisoned → no `r2Finish` → `R2StopUnconfirmed` → unknown | ✓ |
| Browser stops after a later checkpoint | Receipt names N+k, which does not match → unknown (tested: inherited unknown, forged hash) | ✓ |
| Pause after a non-final ack, before the action is sent | No receipt → pending action stays unknown. `job.js:516-519` cannot save its correction in R2 because the write is refused | ✓ conservative |
| Cleanup fails (job still running after about 30 polls, finish refused, finish reply lost) | `R2StopUnconfirmed` → unknown | ✓ |
| Session closed or peer closed | A receipt is created but nothing can collect it → unknown (F-D) | ✓ fails closed |
| Pause during the final-draft ack round trip | **G1** below → the draft is left as a plain unsent final | fails closed |

An already-released action cannot be relabelled as "not sent" by this protocol. A forged receipt would require modified extension code (the F-C class of issue).

## The final not-dispatched marker and the retry path

- **Only one place creates the marker:** `r2-browser-run.mjs:27`. A fresh C-218 search of `src` and `web` found no other producer.
- **What the marker is tied to:** `knownUnreleasedFinal` (`review-progress.js:4-7`) requires `sent:false`, the marker kind, and matching intent, task, context (`desktopContext`) and document (`lastDocumentId`). It also checks that the receipt fields are well-formed.
- **Where it is accepted:** only at `review-progress.js:11`, `checkout-runtime.mjs:88-89,115,119` and `browser-session.mjs:52`.
  - Sent finals and plain unsent finals are still refused.
  - `legacyFinalProofClear` still blocks successor tasks.
- **What a retry requires:**
  1. Fresh consent no more than 60 s old, on the same document.
  2. A new random grant (`browser-session.mjs:54`), which must differ from the previous grant id (`job.js:496`).
  3. Current money, payment, extras, terms and expiry re-checked (`job.js:494,497`).
  4. `final-not-dispatched` is added to history (`:498`), the review-progress id must match (`:499`), and the intent is replaced, which drops the marker (`:500`).
- **The page-side record still guards the click.** `finalSent` is set immediately before the click (`page-program.js:699`). In the receipt path the click never ran, so the original record is unconsumed.
- **No automatic retry:** `r2-executor.js:83` stops when a final intent exists.
- **The native renderer test confirms the sequence** (`checkout-c216-ack-native.test.ts:47-52`, from the C-217 read): a positive not-sent result, then fresh consent, then exactly one FAKE click. With the receipt missing, it is refused, and a repeat still produces one click.

## New residuals (none blocking)

- **G1 (Low; fails closed; R1 has the same issue)**
  - **Trigger:** a pause arrives during the `r2Ack` round trip of a final draft. The browser has already moved on to the pending-final checkpoint, which the desktop never writes. The receipt names N+1, there is no candidate, and the draft stays a plain unsent final without a marker.
  - **Effect:** consent is then refused (`checkout-runtime.mjs:88`), so the user must finish manually. This is predicted from the code; I did not run it.
  - **Reproduction:** wrap the exchange and call `runtime.pause()` after a real `r2Ack` whose acknowledged row has a draft and no pending action.
  - **Possible fix (Codex decides):** treat a final receipt for exactly sequence+1 after this run's acknowledged draft as equivalent evidence.
- **G2 (Low): a stopped run's checkpoint is still processed.**
  - `r2-executor.js:47` still returns a stopped run's checkpoint, and `r2-browser-run.mjs:44` ignores `status.paused`.
  - The result is a wasted durable write, a refused ack and then a correction. It is truthful, but avoidable by skipping checkpoints when `paused` is true.
- **G3 (Info): browser-supplied receipt data is copied into the stored marker.**
  - `:27` spreads the browser's receipt object into the marker. Any extra keys get stored, and a `kind` key would override the constant (which only makes the marker invalid).
  - Building the marker from the three values the desktop has already matched would avoid this.
- **G4 (Info): two gaps in how the correction is recorded and reported.**
  - The correction writes no history event; one is added only when a retry happens (`job.js:498`).
  - After a correction in the cleanup path, the caller still receives the original error.
- **Untested cross-adapter path:** an R1 session can use a marker that R2 created, because the checks don't depend on which executor runs. By tracing, this is as safe as an R2 retry, but no test covers it.

## Earlier findings carried forward

- **F-C (still Low).** Patches are validated by key name only, so the new marker could in principle be forged. But forging it needs modified extension code that could click directly anyway, and a retry still requires the page-side record and fresh human consent.
  - Recommended: have the desktop reject browser checkpoints that add or change `finalIntent.notDispatched`.
- **Unchanged and still open:** F-D, F-E (Info), F-F, H1 and H2.
- **H4 and H6:** partially addressed.
- **H3, H5 and H7:** still not re-assessed.

## R1 vs R2 (October 9 steering)

| | R1 (desktop executor) | R2 (browser-local executor) |
|---|---|---|
| **Software readiness** | No open material finding. C216 does not change R1 behaviour, because only R2 creates the marker. | F-A and F-B resolved. Open issues: G1, G2, F-C, F-D. |
| **Regression risk** | Low | Higher: newest distributed protocol. G1-type orderings are checked by reading the code only. Every failure mode found fails closed. |
| **Pause during the final** | The correction itself is truthful (`job.js:516-519`), but there is no marker, so the user must finish manually. | Retry is possible after a matching receipt. The G1 window behaves the same as R1. |
| **Speed** | Every read and action crosses the native RPC (one request at a time). Journal saves are local. | Reads and actions stay inside the extension. Each save costs a poll, write, fsync, read-back and ack. Both pace their loops at 500 ms (`browser-session.mjs:68`, `r2-executor.js:76`). **Net effect unmeasured.** |
| **Deployment prerequisites** | Installation proof, management acceptance, real page contracts. | Same, plus: extension updated together with the desktop to `C216-v1` (a mismatch is refused at `r2-browser-run.mjs:35`), an F-D recovery procedure, and real bridge-page behaviour (timer throttling, browser lock) still unmeasured. |
| **Still unproven on the real site (both)** | Real REVIEW page, final click → receipt and order detail → CONFIRMED_UNPAID, merchant refusals, challenge/throttle pages (F-F), live speed, installation. | Same. |

**Recommendation for the first live attempt:**
- **Neither is deployable for a real purchase on the current evidence.**
- **Default to R1.**
  - Safety at the final step is equivalent.
  - R1 has fewer distributed failure modes.
  - R2's only clear advantage is the final-pause retry, which depends on a rare user action.
- **Choose R2 only if** Codex's identical offline measurement shows a material improvement on the slot → REVIEW path, and G2 plus the F-C marker guard are added.
- **In either case:** one executor per task, and never a second real order.

## Commands (each run once, in order, in the foreground)

1. `python -B tools/delegation/verify_candidate_manifest.py docs/reviews/C-216-candidate-manifest.json`
   - Output: `{"ok": true, "files": 330, "sha256": "8b2e917a…dcd2b", "mismatches": []}`
2. `python -B tools/delegation/run_review_checks.py docs/reviews/C-216-candidate-manifest.json`
   - All 5 checks: exit code 0, no timeout, `ownedTreeCleanupConfirmed: true`.
   - (1) manifest OK; (2) protected tests 108/108; (3) Python 66 tests, 0 failures, errors or skips; (4) Node 1841/1841; (5) manifest unchanged. Overall: complete and passed.

The 62 focused tests were not re-run separately. The 1841 Node total matches C215's 1829 plus the 12 new C216 tests, which suggests the new tests ran within the full suite.

## Reads in C-218

- **Required context:** C-218 sheet (24 lines), C-217 sheet (35), C-216 fix (11), C-216 verification (40), C-217 quota verification (56), C-216 manifest (337).
- **Fresh full reads to end of file:** `r2-browser-run.mjs` (76 lines), `r2-executor.js` (97), `review-progress.js` (27).
- **Supporting reads (disclosed):**
  - `job.js` lines 492-527;
  - a search of `src` and `web` for the marker;
  - a search for `deadline` in `checkout-rpc-contract.js`: only the `COMMAND_KEYS` entry; no check at send time was found;
  - my earlier `C-215-actual-review.md` (140 lines), re-read so the F-C to H7 items are restated accurately.
- **Checked against unchanged bytes but not re-read in C-218:** the other seven C-217 files.
  - Their earlier content shown here again after compaction is not counted as a C-218 read.
  - The `page-program.js` lines cited above come from the C-217 search only.

## Limitations and disclosures

- **No permission denials, tool errors, provider quota interruptions, edits or created files** in C-218.
- **No private, browser, agent or publication actions.**
- **Session state:** this session continues from a compacted summary of C-217. C-217 itself ended on a real provider quota limit (recorded in its verification file).
- **Model and effort:** I run as `claude-opus-5-5`, but I cannot observe the `max` effort setting or model usage. Codex must audit both.
- **Budget:** about USD 3.5 of 10 and 8 of 48 turns. Wall time is not visible to me.
- **Unverified items:**
  - Chrome shutdown is as reported by the test runner.
  - Playwright, the system Chrome and the test fixtures were not read.
  - G1 is predicted by tracing the code and was not executed.
  - Real receipt, order detail, refusal handling, speed and installation all remain unproven.
