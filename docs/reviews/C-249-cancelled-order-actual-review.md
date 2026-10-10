# Actual reviewer report

## C-249 delivery report: cross-review of the C248 new purchase after a cancelled order

**Verdict: AGREE, limited to the C248 change in Candidate351** (SHA `6beee32c…bcddbc370`). I found no material problems. This does not approve the whole repository or the live goal. It also does not resolve the historical C235 missing order: that record is archived unchanged with its sent final and pending submit.

### Commands (exact, once each, in order, foreground)
1. `verify_candidate_manifest.py`: `{"ok": true, "files": 351, "sha256": "6beee32c…bcddbc370", "mismatches": []}`
2. `node --test …`: 78/78 pass, 0 fail (35 in the C248 file, 43 in the C238/C240 files).
3. `run_review_checks.py`: all 5 steps passed.
   - Manifest before and after: OK.
   - Protected files: 108/108.
   - Python: 94/94.
   - Node: 1998/1998.
   - `ownedTreeCleanupConfirmed` was true at every step; no timeouts.

All merchant results are FAKE local fixtures. They are not live Apple behaviour, real orders or real speed.

### Review areas
- **Identity link to the old order:**
  - The new transition requires explicit approval, an explicit association, a valid hash and an active session (`cancelled-order-purchase.mjs:21`).
  - The old task must be a valid, expired review-restart task from another session, with a sent final and a dispatched `submitOrder`. If it stores a reference, that reference must match (`:10-11`, `:23`).
  - The worker accepts only `W` plus 6–30 digits, refuses it alongside a supplied hash, and hashes it with SHA-256 (`native-purchase-worker.mjs:60-66`). Otherwise the runtime uses the stored hash (`checkout-runtime.mjs:124`).
  - Which basis was used is recorded in `identityBasis` (`:38`).
- **Old record kept unchanged:**
  - The old record is checked as unchanged before and after it is archived, and the archive's content hash must match a fingerprint taken earlier (`:22`, `:35-36`).
  - A compressed backup of the same record is stored (`:38`). Validation requires the backup and the physical archive to be identical, then re-checks the old record (`:16-17`).
  - The old record is never edited; the new record only replaces it after a check (`:39-40`).
  - The browser-side executor (R2) cannot change the new fields (`r2-protocol.js:6`, `r2-executor.js:38`).
- **Only a cancelled order passes:** the page must show native status cancelled, the exact product title, ¥9,999 and one item row (`order-audit.js:26`). The result is checked again at `:26` of the purchase file. Anything uncertain becomes `unknown` and the transition is refused.
- **Read scope on the existing order tab:**
  - Only fixed official order-detail URLs are queried, at most 20 tabs. References are hashed inside the extension and exactly one must match (`order-audit.js:11-19`).
  - Before the read it checks tab status, URL, path and permission; after the read the URL must be unchanged and there must be one result from the main frame (`:20-24`). The read itself uses a fixed function in an isolated world.
  - It returns no reference, link or customer data (`:27`).
  - Only the allowed keys and plan are accepted, the call is refused while R2 is running, and it requires the owner lease (`checkout-rpc-peer.js:28-31,42-45`, `owner-lease.mjs:46`).
- **Interruption and duplicates:**
  - The session is re-checked as active at every step (`:21-39`), and there is a single commit (`:40`).
  - A new record cannot be used for a second transition (`:11`); a test confirms the second call is refused.
  - The GUI sends the request once (Python test). The old submission flags are cleared only after the commit (`checkout-runtime.mjs:126`, `app.py:566-568`).
  - The test with the real on-disk store and contention for the owner lock confirms the rejection.
- **Fresh dates:** the new task starts from current dates, with no old dates and empty floors (`:37`, `job.js:163`); the tests confirm this.
- **Proof wiring for R1 and R2:**
  - For R1, a record carrying the new marker needs a proof valid for the current session (`browser-session.mjs:44,64`). The job also binds the proof to the task (`job.js:229-231`).
  - For R2, the proof is passed through and unknown proof keys are rejected (`browser-session.mjs:67`, `r2-executor.js:8,38`).
  - The two version strings are confirmed: `page-program.js:19` `C248-new-purchase-v1` (this one line only, not a full-file review) and `r2-protocol.js:3` `C248-v1`.
- **Same controller continues the purchase:** after the commit it calls `advance`, runs a clear account preflight, then uses the existing `runDesktopSession` (`checkout-runtime.mjs:93,96,127`). The final step is still separate and explicit: the descriptor is reset (`:123`), and final consent is fresh, bound to the task and accepts terms (`browser-session.mjs:51-55`). A test reaches REVIEW without submitting, submits once (FAKE), and rejects a repeat.

### Non-blocking notes
1. **Missing archive file:** `validateCancelledOrderPurchase` has no fallback to the backup when the archive file is missing (`:16`), unlike `ended-draft.mjs:21` and `expired-review-restart.mjs:40`. If the file is lost, the new task is blocked rather than made unsafe. I did not review the store's archive retention.
2. **App restart (by reading, not tested):** the proof is tied to the current session (`:15`). If the desktop app restarts before the new task finishes, the record can still be read, but purchase mode throws `DesktopEndedDraftProofUnconfirmed`, and no transition can start from a C248 record. This creates no duplicate, but Root should keep one app session from the new-purchase step through the final.
3. **Untested code:**
   - The worker's order-number branch is not exercised by the listed tests.
   - No test covers the URL changing during the read.
   - R2 has not run end to end with the C248 proof; only immutability is tested.
4. **Two matching tabs:** if two open tabs show the same order detail (including the extension's own audit tab), the result is `unknown`. Root should keep exactly one such tab open.
5. **GUI:** while the GUI is paused it skips events, including the new-purchase signal (`app.py:523-524`), so the old flags can stay visible longer. The panel is not disabled after the owner lease is lost, but the runtime refuses the action (`:122`).
6. **Store not checked:** the cancelled-detail check ignores the pickup store; identity rests on the reference hash, full product match and ¥9,999.
7. **Legacy link is human attestation:** the operator's association is not proof that the cancelled order is the C235 submission. The clear account preflight (`:27-28`) is the guard against an unpaid duplicate.

### Limits kept from earlier reviews
- Native pages do not show quantity or pickup time.
- The empty-list and pagination behaviour of real Apple pages is still unverified, and a clear account check depends on it.
- Sign-in is ordinary and done by a person, with no password autofill.
- The first extension or native-host install or update needs a person.
- A missing reference from another session stays unknown, and the earlier recovery attestations still apply.
- Root does all live work. The C235 final is not replayed.

### Scope, honesty and caps
- **Read:** all 17 files to the end. `job.js` was read in two pages because of the read size limit.
- **Not read:** other unchanged files, including the task store, `chrome-port.js` and the rest of `page-program.js`. I ran no git diff, so "only these files changed" and "no old test changed" rest on Root's claim plus the manifest check.
- **Partial reads:** after the context was compacted mid-review I partly re-read `checkout-runtime.mjs` and `browser-session.mjs`, re-read all of `cancelled-order-purchase.mjs`, and searched `job.js` for `itemMatches`. One search of `C-248-codex-verification.json` returned no matches. I did not read the compacted transcript.
- **Caps:** cost was about USD 4.4 of the USD 10 cap. I cannot check my own effort setting, elapsed time against 1,500 seconds, or exact turn count; Root's structured record is authoritative.
- **Not done:** no edits, report files, other agents, network use beyond the listed tests, deployment, publication, or reading of private or customer data. There were no permission denials and no tool errors.

Root audit: modelUsage is resumed-history aggregate; the reviewer cost estimate is not an independently established invocation spend. Exact structured model/provider/max,17 EOF,3 commands, tests, source immutability and cleanup are verified.
