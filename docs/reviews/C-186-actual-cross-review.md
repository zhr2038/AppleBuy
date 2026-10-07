# C-186 review report: inline full-source backup (C-185 candidate)

**Verdict: bounded AGREE.** This approval covers only the C-185 candidate (manifest sha256 `f36f70792aa9eae075824d2105b33508f9a70cfb5eccf34f64b2260165d88fae`, 307 files), within the stated threat model, with the limits below. It is not an approval of the whole repository, a live run or the goal. No earlier SHA approval is reused.

## Command results (exact text, foreground, in order)

1. `python -B tools/delegation/verify_candidate_manifest.py docs/reviews/C-185-candidate-manifest.json` → `ok: true`, 307 files, sha `f36f7079…`, no mismatches.
2. `node --test test/desktop-c185-inline-source.test.ts test/desktop-c183-ended-draft.test.ts test/desktop-c183-archive.test.ts test/checkout-c181-expiry.test.ts test/checkout-c183-host-setup.test.ts` → **48/48 passed**, 0 failed, cancelled or skipped.
3. `python -B tools/delegation/run_review_checks.py docs/reviews/C-185-candidate-manifest.json` → **all 5 ordered checks passed**:
   - manifest check: ok;
   - focused subset: **108/108**;
   - Python: **64** run, 0 failures, errors or skips;
   - full Node: **1657/1657**;
   - manifest recheck: ok.

   The runner reported `ownedTreeCleanupConfirmed: true` and `timedOut: false` for every step.

## F1 (crash ordering): closed for the stated threat model

- **The backup is always required.** `ended-draft.mjs:19` decodes the backup *before* the archive is read at `:20`. Any problem with the backup returns null, whether or not the archive exists.
- **Decoding checks every bound** (`:12–13`):
  - exact keys and codec;
  - `0 < bytes ≤ 16M` and packed length ≤ 2M;
  - the base64 must re-encode to the same string;
  - `gunzipSync` is capped at `maxOutputLength = 16M`;
  - the byte count must match;
  - the SHA-256 must equal the `sourceArchive` digest stored in the same atomic row;
  - the JSON must be canonical.
- **Only a missing archive file falls back** (`:20`). A non-ENOENT error returns null. Lease loss and tamper errors from `task-store.mjs` carry no error code, so they also fail closed.
- **All old-source checks run on the reconstructed record** (`:23`) before any buyer proof: hash, `stoppedCheckoutDraftSource`, new task and context, and the kept schedule.
- **The backup is proven decodable before commit.** `renewEndedDraft` checks it with a prospective `validateEndedDraft` (`:38`) before the `put`.
- **Each crash state holds the full source:**
  - Before the transition, the old ledger row is the source. Replaying the archive is idempotent (EEXIST, then verify).
  - After the transition, the new row carries the full source. If the archive name was lost because there is no directory fsync, ENOENT selects the backup.
  - If the `.archives` directory itself is lost, `archiveDirectory` recreates it (`task-store.mjs:15`). `lstat` then raises ENOENT, so the same fallback applies.
- **This does not weaken the missing-source check.** A row with no backup still fails. A missing archive is accepted only when a backup that matches the committed digest is present.
- **What this patch does not claim:**
  - With no archive, the active ledger is the only source of trust; there is no independent second copy. This matches the task sheet's stated limit for the disk and the active-ledger write.
  - No physical power cycle was performed. The crash was simulated by unlinking the archive name.

## F2 and F3: both fixed

- **F2:** `native-purchase-worker.mjs:54` now reads 「本次结账结果未确认；须重新核对实际已保存记录，未重复下单。」 It no longer claims the old row was kept.
- **F3:** every `ready` event at `app.py:402–408` resets `checkout_can_renew_ended` and switches the checkbox label to the renewal text or the ordinary text.
  - A stale renewal flag cannot be acted on. After a renew `result`, `readOnly` is absent, so the transfer button stays disabled (`:428`).
  - The worker also re-checks eligibility when it receives the request.

## Findings and test gaps (low severity; none blocks)

- **N1 (wording, advisory):** after a committed renewal, if a later `advance` from AUTH fails, `native-purchase-worker.mjs:43` still says 「…原记录保持…」 ("original record kept").
  - The source record really is preserved.
  - But `advance` may already have saved the new row (for example, a checkout write-ahead), so the sentence can be read as "nothing changed".
  - Lines `:38` and `:49` use the same pattern.
- **N2 (performance, unmeasured):** every `job.run` save now carries the roughly 297,000-character backup through the owner-lease writer with fsync.
  - Saves happen on every read (`job.js:277`) and before every action (`:488`), including at the slot step.
  - Every session entry decodes and re-serialises the roughly 13MB source several times.
  - I did not measure either cost. Timing on a synthetic row of about 13MB is advisable before relying on slot-selection speed.
- **N3 (liveness only):** if an archive exists but is damaged or locked, validation refuses even though a valid full backup is inline. This is the intended fail-closed choice. With fsync before link, a damaged archive should be unlikely.
- **T1:** the four backup-tamper cases run *after* the archive was unlinked (`c185 test:13`). "Fails even if the archive exists" is proven by the code order (`:19` before `:20`), not by a test.
- **T2:** no test isolates a backup with valid base64 and gzip but the wrong SHA, a packed string over 2M, or non-canonical JSON.
  - Base64, the byte count and the decompression cap are covered.
  - The comparison at `:21` is redundant, because both copies must match the same digest. It is harmless.
- **T3:** the EMPTY_BAG and VARIANT cases assert only `commands []` and `realOrderVerified false`. They do not show that the `job.js:475` guard is what refused.
- **T4:** the owner-loss case flips `live` on the FAKE store. It does not revoke a real lease between archive and put.
- **Carried forward:** stray `.tmp` files in the archives directory (which hold the full private source) are never swept.
- **Non-finding:** the backup path skips `readArchive`'s `validStored` check. This is covered: the SHA binds the backup to a digest that `archiveSnapshot` produces only for `validStored` rows (`task-store:26`), and that digest must equal the source fingerprint (`ended-draft:34`).

## Retained limits, unchanged

The C-184 limits stay in force: F4 (context lifetime), F5 (earlier slot hold not proven released), F6 (same-document bag read) and F7 (existing quote-comparison limit).

## Real versus FAKE

- **Real:** `DesktopTaskStore`, the owner lease, the atomic ledger write and the archive filesystem, all under `.local/test-runs`.
- **FAKE:** the browser API, the Apple pages, approvals, the source record and the order result.
- No personal source was used.
- I cannot verify Codex's 13,298,591-byte / 297,000-character figures.
- No contact with Apple, no order, no slot hold, no deployment.

## Disclosures

- **Changed files: none.** No reports, ledger, browser, GUI, registry or permission changes; no other agents invoked; nothing pushed or published.
- **Compaction:** one mid-session compaction, after 16 complete reads plus `app.py` lines 1–210 and before any command.
  - For these files I hold only the summary of my pre-compaction read: AGENTS.md, requirements.md, the C-184 sheet, the C-184 review, cart-transfer, browser-session, checkout-runtime, owner-write-frames, owner_lease.py, and native-purchase-worker lines 1–37.
  - The harness restored the full content of these after compaction: the C-186 sheet, the C-185 verification JSON, the c185 test, the c185 fixture and task-store.
- **Split reads:** `app.py` (1–210, then 211 to end) and `job.js` (1–280, then 281–510).
- **Extra reads:** after the three commands I re-read `ended-draft.mjs` and `native-purchase-worker.mjs:38–59` to cite exact lines. Both are on the 24-file list and the reads were read-only.
- **R01–R10:** I have not reproduced the mapping. I no longer hold the exact R-numbered text after compaction and will not invent it.
- **Errors, denials, timeouts:** none.
- **Caps:** the budget shown is $2.24 of $8. It may include resumed history. I cannot measure turns or wall-clock time from inside the session, so the 50-turn and 1200-second caps must be verified externally.
- **Model:** the model and effort level must be confirmed from `modelUsage`.
- **Cleanup:** I did not check it myself beyond the tests' own `finally` blocks and the runner's cleanup flags. Inspecting `.local/test-runs` would have needed a fourth command, which the task does not allow.
