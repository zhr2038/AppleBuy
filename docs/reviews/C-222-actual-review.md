# Actual Opus5.5/max bounded review of source331

# C-222 delivery report: R2 deployment guards (G2, F-C, G3)

## Verdict: **AGREE (bounded)** on the combined candidate

The candidate is the C220 map: 331 files, sha256 `12955811175044dfa8f0391ccf008b5ee32ff71eaa366ec4fbffaec5481efb21`.

- **G2, the F-C marker guard and G3 are all resolved**, and R1 is unaffected.
- **C216's F-A and F-B protections are not regressed.**
- **I found one Low, fail-closed point where G2 interacts with G1**, described below.
- This is a review result only. It is not acceptance, not a claim that the system is ready for live use, not a claim that it will always be available, and not evidence about real orders.

## G2: resolved — checkpoints from a stopped run are skipped

- **The change:** `r2-browser-run.mjs:44` now also requires `status.paused!==true`. A checkpoint from a run the browser has already stopped is never applied, written or acknowledged, so no candidate is created.
- **It does not report a pause that never happened.**
  - The desktop's own `paused` flag is only set by its own `r2Pause` calls (`:42`, `:53`).
  - `finishRun` therefore finds no candidate and corrects nothing.
  - The result is not reported as PAUSED (`:60`); it becomes `R2ExecutionUnconfirmed` (`:61`) because the browser's job failed when its waiter was rejected.
- **It does not change records already on disk.** Any pending action from an earlier, acknowledged checkpoint stays exactly as it was (unknown).
- **Test:** the new stopped-checkpoint test confirms zero journal writes and zero commands, and the call is rejected.

## F-C marker guard: resolved for the marker

- **The guard:** `r2-protocol.js:20-23` rejects a browser patch whose `finalIntent` has its own `notDispatched` field unless the previous intent already had a marker with byte-identical content (`R2FinalMarkerHostOnly`).
- **Only the desktop path creates markers.** The desktop's correction writes to the store directly (`r2-browser-run.mjs:30`), not through `applyRowPatch`, so it is unaffected.
- **The legitimate retry path still works.**
  - An unchanged marker can be carried forward, or dropped when a new intent is created (`job.js:500` builds a new intent with no marker).
  - Carrying a marker onto a different intent id gives no authority, because `knownUnreleasedFinal` also requires a matching `intentId` and `sent===false`.
  - Dropping a marker only makes the system stricter.
- **What happens when the guard fires:** the desktop throws before writing anything, the cleanup runs, and the unwritten checkpoint is not corrected. The task stops.
- **Tests:** the new unit tests cover adding a marker, changing one, carrying one unchanged and dropping one. The C216 native retry test now passes through the guard (marker carried while resuming, then dropped by the new intent).

## G3: resolved

- `:27` builds the marker only from the desktop's own `runId`, `candidate.sequence` and `candidate.sha256`. These are exactly the fields `:18` has already matched against the receipt; the browser's receipt object is used only for that comparison.
- A `kind` value or extra keys in the receipt can no longer be stored. The new test confirms the constant kind is kept and the extra key is absent.

## No effect on R1, no regression of F-A/F-B

- **R1 does not use the changed code.**
  - `applyRowPatch` has a single production caller, `r2-browser-run.mjs:46` (fresh search).
  - `runInBrowser` is used only for the browser executor (`browser-session.mjs:64-66`; file unchanged).
  - `R2_VERSION` is compared only when `executor==='browser'` (`checkout-runtime.mjs:44`). The other files that import from `r2-protocol.js` take only the unchanged `R2_OPERATIONS`.
- **Every other key file is byte-identical to C216** (hashes compared): `job.js`, `browser-session.mjs`, `checkout-runtime.mjs`, `review-progress.js`, `page-program.js`, `r2-executor.js`, `native-checkout-api.mjs`, `checkout-rpc-peer.js`, `task-store.mjs`, all C214/C216 tests and the c121 fixture.
- **F-B timing is untouched** because `r2-executor.js` is unchanged.
- **F-A correction logic is unchanged** apart from G3, which stores identical values for legitimate receipts.
- **All C216 F-A/F-B cases pass**, including the slow-fsync tests (3,028 / 3,089 ms) and the heartbeat case (2,917 ms).

## Residuals (none blocking)

- **G2 makes the G1 gap slightly wider (Low; fails closed; reasoned from the code, not run).**
  - Scenario: the desktop acknowledges the final draft, then the browser stops on its own before the desktop polls the pending-final checkpoint. In practice this means the desktop stalled for more than 2.5 s at exactly that point.
  - On C216, the desktop would have written that checkpoint, corrected it and allowed a retry with fresh consent.
  - On C220, the checkpoint is skipped and the draft stays a plain unsent final. Consent is then refused and the user must finish manually. No click is possible either way.
  - The G1 fix suggested in C218 would also cover this.
- **Broader F-C forward-only checks are still Low and unchanged.** A patch can still remove `finalIntent`, and `sent` is not enforced to only move forward.
  - A carried marker combined with `sent` going false → true → false would bring the marker's authority back.
  - The legitimate job never does this: only `job.js:508` sets `sent=true`, and only on an intent that never carries a marker. Doing it would require modified extension code.
  - Optional hardening: allow a carried marker only when `next.id===prior.id && next.sent===false`.
- **Still open from earlier reviews:** G1, G4, the untested R1 retry after an R2 marker, F-D, F-E, F-F, H1 and H2. H3, H5 and H7 have still not been re-assessed.
- **R2 deployment requires the extension and desktop to ship together at `C220-v1`.** An older peer is refused (tested).
- **Still unproven on the real site:** receipt, order detail, refusal handling, speed and installation.

## Timing (C219)

- C219's FAKE-only measurement (10 ms injected per native RPC) gives:
  - R1: 60 native RPC messages, P50 930 ms.
  - R2: 78 messages, P50 1,209 ms; 1,380 ms with 300 KB of fake history.
- This matches the code: R2 avoids page-read round trips but adds a poll-and-ack round trip for every journal save.
- It is not Apple, installed-pipe or disk speed, and it was measured on the 330-file candidate, not C220. The data supports keeping R1 as the first-live recommendation.

## Commands (each run once, in order, in the foreground)

1. `python -B tools/delegation/verify_candidate_manifest.py docs/reviews/C-220-candidate-manifest.json`
   - Output: `ok: true`, 331 files, `12955811…efb21`, no mismatches.
2. `node --test test/desktop-c220-marker-guard.test.ts test/desktop-c216-ack-truth.test.ts test/checkout-c216-ack-native.test.ts test/desktop-c214-r2.test.ts test/checkout-c214-r2-native.test.ts`
   - **32 tests, 32 passed**; 0 failed, cancelled, skipped or todo; 14,611 ms.
3. `python -B tools/delegation/run_review_checks.py docs/reviews/C-220-candidate-manifest.json`
   - All 5 checks: exit code 0, no timeout, cleanup confirmed.
   - Manifest OK; protected tests 108/108; Python 66 tests, 0 failures; Node 1845/1845; manifest unchanged afterwards.

## Coverage in C-222

- **Fresh full reads to end of file:**
  - `r2-browser-run.mjs` (76 lines);
  - `r2-protocol.js` (25);
  - `desktop-c220-marker-guard.test.ts` (31).
- **Context read:**
  - C-222 sheet, C-220 task, C-220 verification, C-220 manifest;
  - C-218 actual verification;
  - C-219 comparison.
- **Supporting searches (fresh):**
  - which files import `r2-protocol` and `r2-browser-run`, and who calls `applyRowPatch`;
  - `R2_VERSION` and `executor` in `checkout-runtime.mjs`.
- **Not read:**
  - `C-218-actual-review.md`: I relied on my own C-218 report in this session instead.
  - the c121 fixture: unchanged, so what `f.w.writes` counts is inferred from its name and the test results.
- Everything else rests on the earlier actual reads of byte-identical files.

## Limitations and disclosures

- **None of the following occurred:** permission denials, tool errors, quota interruptions, compactions, edits, report files, network beyond the loopback FAKE test fixture, or private, browser, agent or publication actions.
- **Model and effort:** I run as `claude-opus-5-5`, but I cannot observe the `max` effort setting or model usage. Codex must verify both.
- **Hash comparison:** I compared the security-relevant entries of the 331-file map by hand, not every entry. The scripted manifest checks passed.
- **Budget:** about USD 1.6 of 8 and 9 of 40 turns. Wall time is not visible to me.
- **Process cleanup:** Chrome shutdown is as reported by the test runner.
- **R01–R10 mapping:** not produced, since this is a review.
