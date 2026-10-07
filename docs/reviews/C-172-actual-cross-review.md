## C-172 review: bounded AGREE, with non-blocking findings

The new exception is defensible as a narrow, one-time, explicitly attested last link. It does not disguise a bypass of the three-transfer guard. This verdict covers only the C-171 exception and the files I read. It says nothing about the whole repository, live readiness, the one unpaid order, or the overall goal.

**Changed files: none.** I wrote nothing: no report, memory, ledger or source change.

### Commands (all three exact, foreground, separate, in order)
1. **Manifest check:** `ok:true`, 299 files, sha `2e5aef08…5cefca`, 0 mismatches.
2. **Focused tests (c171, c146, c084):** 50 tests, 50 pass, 0 fail.
3. **`run_review_checks`:** passed all five ordered checks.
   - Manifest: ok.
   - Owned node subset: 108/108.
   - Python unittest: 61, with 0 failures, errors or skipped.
   - Full node suite: 1608/1608.
   - Manifest again: ok.
   - Each check reported exit 0, no timeout, and `ownedTreeCleanupConfirmed:true`.

The 50/1608 counts match Codex's claims, and command 1 confirms the changed-file hashes listed in the manifest.

### Why the authority is defensible
- **The ordinary path still stops at three.** `transferExistingCart` (`cart-transfer.mjs:60-66`) uses `sourceAllowed(old)` with `remaining=2`. Its recursion reaches `transferRecordValid(d1,0)`, which returns false, so a depth-3 source is rejected. The C146 bound test and the C171 "ordinary fourth denied" test both pass.
- **The exception is strictly narrower.** `transferExpiredContactOnce` (`:68-73`) requires:
  - all five flags `===true` before any read;
  - `depth(old)===3`;
  - every ordinary check, via `sourceAllowed(old,3)`;
  - the expired NEEDS_VERIFICATION shape with an unknown, dispatched `fillDetails`, a verified slot from the original date set, and all deadlines passed;
  - `sourceSlotWindowsExpired`.

  It reuses the shared `writeCartSuccessor` (`:74-88`). That path takes two stable single-item BAG reads (no extras, under the price cap), checks the stored record is byte-identical and the lease is live, validates the new record before writing, and writes once.
- **It cannot be repeated.** The marker is valid only when the depth is exactly 4 (`:38`). It must have exactly the expected keys and be bound to the source fingerprint. The source shape is re-derived from the embedded `originalTask` at `createdAt`. A fifth transfer fails both ways: on the exception path `depth!==3`, and on the ordinary path the recursion runs out. Beyond depth 4, `depth()` returns null.
- **No Add, no inherited slot or final.**
  - The new record comes from `createPurchaseRecord`, with `pending`, `finalIntent` and `acceptedSlot` all absent.
  - The existing-cart-only rule (`job.js:472`) blocks Add, product configuration and navigation to the product page.
  - Finals in the old source are scanned recursively.
- **An unknown final still reconciles read-only.** `transferRecordValid` deliberately does not scan the new task's own layer for finals (`:40`). Read-only runs skip the handoff guard (`job.js:212`) and stop with "no resubmission" (`job.js:311`). The generic C086 UNKNOWN_FINAL test passes.
- **No hold release is invented.** The code infers nothing from local expiry (comment at `:67`). The three confirmations are recorded only as operator attestations.

### Findings (none blocking)
1. **Low – a successful write is reported as a failure.**
   - `checkout-runtime.mjs:108` throws `DesktopTransferCancelled` after the new task has already been durably written.
   - The worker (`native-purchase-worker.mjs:48`) then shows a generic "not confirmed" message, and no progress event is sent, unlike the ordinary path at `:94`.
   - Retrying `transfer-contact` fails closed (depth 4), so nothing is duplicated, but the operator may wrongly believe nothing was created.
2. **Low – test precision.**
   - The "active earlier slot deadline" case (`test/desktop-c171-contact-recovery.test.ts:26`) edits `originalTask` without recomputing its fingerprint and archive. It is therefore rejected by the fingerprint check (`cart-transfer.mjs:30`), not by the slot-deadline guard.
   - None of the 11 guard tests checks which error caused the rejection.
   - Missing negative tests:
     - marker on a depth-3 record, or with an extra key;
     - source `pending.dispatched:false`;
     - `acceptedSlot.date` outside `initialDates`;
     - a source state other than NEEDS_VERIFICATION;
     - `live()` false before the first read;
     - a depth-4 record at UNKNOWN_FINAL reconciling read-only.
3. **Low/Info – wider than the name suggests.** `expiredContactSource` (`:12-17`) never checks `acceptedSlot.basis===CONTACT_SLOT_BASIS` (`job.js:103/349`). So a full-identity DETAILS step also qualifies, and the test's slot has no `basis` field. The safety effect is small, because neither case involves a final.
4. **Info – what the attestation can show.** The marker (`:72`) always writes three constant `true` values. `sameAccountOrdersChecked` cannot distinguish "checked and found no unpaid order" from just "checked".
5. **Info – existing behaviour applied one more time.** The new task starts with `initialDates:null` and a fresh refusal count (`job.js:153`). It will therefore fix a new set of three dates, which bears on `requirements.md:19`. The ordinary transfers already did this; the exception adds one more occurrence.

### Practical remaining limits
- **Reliance on operator attestations.** Merchant expiry, the stopped old checkout, and "same account, no unpaid order" are unverifiable operator statements. They are not programme authentication and not proof that Apple released the old hold.
- **Uncertainty about the retained old slot.** The old accepted slot (and possibly the unknown details write) may still be held by Apple. If the new task picks a slot while it is, that would conflict with "no multiple concurrent slot holds" (`requirements.md:64`). Only the operator's report of the merchant's timeout message stands against this.
- **Source-size growth.**
  - Each layer stores the old record about three times: `originalTask`, the archive copy, and its `originalSnapshot` (`:83-84`). The record therefore triples per layer.
  - The real depth-3 size is unknown to me. If it is above roughly 5.3 MB, the depth-4 write would exceed the 16 MB stream limit and fail without creating anything.
  - The 3,000-node scans fail closed.
  - Validation repeats hashing at every recursion level, so its cost grows faster than the depth.
- **Loss of the native connection.**
  - Before the write: nothing is written, and a retry is possible.
  - After the write: see Finding 1.
  - New tasks are tied to their native session ID (`cart-transfer.mjs:56`). If a reconnection or a deployment produces a new ID, the depth-4 task becomes read-only permanently, and no fifth transfer exists. I did not read `native-checkout-channel.mjs`, so I have not verified whether the ID survives a reconnection. Practically, all intended code (including the C170 preflight) should be deployed before this one-shot recovery is used.
- **The real record may not match.** If the real depth-3 record differs in any field (state, `reconcileOnly`, `dispatched`, the date set), the operation stops with no write. I did not read the private record.

### R01–R10 mapping (only as far as this change affects them)
- **R01:** the plan, quantity 1, price cap and no extras are unchanged. The date set is re-fixed (Finding 5).
- **R02:** two BAG reads are required, and missing facts stop the operation.
- **R03:** no Add, product reconfiguration or bag clearing.
- **R04/R05:** the controller is unchanged.
- **R06:** the old `fillDetails` outcome is kept as `oldActionOutcome:'unknown'`.
- **R07:** single owner and a single write; no repeat of Add or the final; a fifth transfer is blocked. Freedom from concurrent holds is not provable.
- **R08:** pause, close or loss of ownership cancels before the write.
- **R09:** all data is FAKE, and the five flags must be explicit.
- **R10:** the worker messages are in Chinese. How the new error names map to diagnostics is unknown, because `checkout-diagnostic.mjs` was not read.

### Real evidence versus FAKE data
Every test fact is FAKE: sessions, bag documents, totals, merchant pages and attestations. No Apple page, account or private record was read or produced. The statement that the merchant said the operation timed out comes from the task sheet, and I have not verified it. Per the C-171 verification record, nothing is deployed, the new buyer is not active, and no real order has been verified.

### Disclosures
- **Context compaction:** one occurred during C-172, after 13 of the 16 required reads and before any command. Afterwards I read `job.js` and the two tools, and re-read `cart-transfer`, `checkout-runtime`, the worker and `requirements.md`. The C-172 sheet, the C-171 verification record and the c171 test were supplied again after the compaction. I did not re-read `AGENTS.md`, the C-171 sheet, the manifest, `browser-session`, `owner-lease` or the c146 test afterwards. Their contents came from earlier this session, and command 1 confirms none of them changed.
- **Size cap:** `job.js` was too large for one read, so I read it in two contiguous parts (lines 1–424 and 425–508).
- **Not read:** `checkout-diagnostic`, `empty-restart`, `task-store`, `owner-write-frames`, `chrome-port`, `native-checkout-channel`, `auth-continuation`, the c084 test and `verify_candidate_manifest.py`.
- **No diff:** I ran no git command; the changed-file scope rests only on the manifest hashes.
- **Command 3's broad suites:** they may start local headless browser processes. I did not inspect which ones; the tool reported owned-process cleanup confirmed for all five checks.
- **Clean run:** no permission denials, errors or timeouts.
- **Usage:**
  - Budget shown is about $2.5 of $6, over about 22 tool calls.
  - The model is self-reported as claude-opus-5-5; I cannot see the effort level.
  - The external modelUsage and trace, not this report, govern acceptance.

**Checkpoint:** the C-172 review is complete. Optional follow-ups for Codex are Findings 1–3, plus checking whether the native session ID survives a reconnection. Live use still needs deployment through the permitted flow, plus every current fact the sheet lists.
