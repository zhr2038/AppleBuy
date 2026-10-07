# C-152 review: invoice-write test and radio-id evidence

**Verdict: bounded AGREE** for the new C151 test and the radio-id evidence. Production code is unchanged against the manifests. This covers only that scope: not the whole 292-file candidate, live behaviour, orders, speed or the overall goal.

## Commands (the three listed ones, in order, in the foreground)
1. **`verify_candidate_manifest.py` on `C-151-candidate-manifest.json`**: passed. 292 files, sha256 `77f8dcfa…99c97`, no mismatches.
2. **`node --test` on the c149, c051 and c058 tests**: 55 of 55 passed (C149 12, C051 23, C058 20), 0 failed, cancelled or skipped.
3. **`run_review_checks.py` on `C-151-candidate-manifest.json`**: all 5 checks passed and each confirmed cleanup of its own processes.
   - Manifest: 292 files.
   - Focused tests: 108 of 108.
   - Python tests: 54, no failures or errors.
   - Full Node suite: 1568 of 1568. That is one more than C-150's 1567, which matches the one new test.
   - Manifest again: 292 files.

## Production is unchanged
I compared the C-151 and C-149 manifests line by line. Both list the same 292 paths in the same order.
- Only one hash differs: `test/checkout-c149-personal-invoice.test.ts` (`43223175…` → `569a281c…`).
- These are identical: `page-program.js` `96b307ce…`, `job.js` `f76bc16f…`, `chrome-port.js` `25acfddf…`, the c051 and c058 tests, all of `src/desktop/*`, and the delegation tools.
- I compared the path plus the first 8 hex characters of each hash. Command 1 then confirmed every file on disk matches C-151 in full.

## The new C151 test closes F1 (`test/checkout-c149-personal-invoice.test.ts:37-54`)
I traced the test through the unchanged code, and it passed.
- **Real code path.** It runs the real `PurchaseJob` and `ChromePort.act` and the real `merchantDocument` writer (`page-program.js:512-519, 602-609`) on the FAKE invoice page.
- **Slot continuation.** The bound unknown `chooseSlot` continues to the contact step (`job.js:348-350`). The test asserts that `acceptedSlot` has `CONTACT_SLOT_BASIS` and that there is no final intent.
- **Write path.**
  - Only the identity input gets input/change, once each.
  - All 3 radios and the prefilled header get no events. Personal stays checked and the header value is unchanged.
  - Continue is clicked exactly once. That indirectly proves the FAKE suffix was written, because a required empty field would have blocked Continue (`page-program.js:546`).
- **No resend.** The only command sent is `['fillDetails']`, so there is no second slot, checkout or final. The page stays on the details step, and by code reading `job.js:359-360` stops with "mutation-result-unconfirmed; no automatic repeat".
- **No leaks.** The FAKE header and suffix appear in no page result or command reply, and the saved record contains neither them nor `privatePickupData`.

## F2 evidence closure
`C-149-public-invoice-evidence.json` now records the 3 radio ids and `radioIdsActuallyObserved: true`. The ids match the decoder's `group + '-' + value` rule and the test fixture. The file holds only public labels, ids and flags, with no customer values.

## Minor findings (none unsafe, none blocking)
- **N1 (Low): final state not asserted.** The test checks `pending.action === 'fillDetails'` but not the final state or reason. "No resend" is still proven by the command list and the click count.
- **N2 (Low): the evidence file isn't pinned.** It isn't in any manifest, and the session-start git snapshot showed it as untracked, so it could change without detection. It also doesn't record the header's visible, enabled or readonly state, which the decoder requires. A mismatch would fail closed.
- **N3 (Info): weaker record check.** The record check looks for `"5432"` in quotes, while the result checks use a plain substring. This is a reasonable trade-off to avoid false matches inside UUIDs or timestamps.
- **N4 (Info): not covered by this test.**
  - Moving on to the payment step on the invoice page (C051 covers it on a page without radios).
  - A document replacement (the document id is constant).
  - A direct assertion of the written value.
- **Still open from C-150:** the F3 negative cases and the F4 older behaviour, unchanged.

## R01–R10 (all FAKE test data)
| Requirement | Status in this review |
|---|---|
| **R01** | The plan is unchanged, and the invoice gives no purchase authority. |
| **R02** | Radio ids are now in the evidence, but the file isn't pinned and isn't live-confirmed. |
| **R03** | One contact write, then Continue. |
| **R04, R05** | No second slot. |
| **R06** | An unconfirmed result stays pending. |
| **R07** | One `fillDetails`, never resent. |
| **R08** | The human final is still required. |
| **R09** | No real order. |
| **R10** | No private values in results or records. |

No requirement is accepted by this review.

## Real evidence versus simulation
- Every test used FAKE data on an owned `127.0.0.1` page in a local test Chrome. I did not contact personal Chrome, the account or Apple.
- The radio-id observation, the live slot send and the paused buyer state are Codex's claims, and I didn't check them.
- The patch is not deployed; the peer still has the 291 build. I didn't install, reload or reconnect anything, or read the private record.

## Things you should know
- **Permission denial.** My first Bash call used an unapproved shell prefix and was denied without execution. I then ran the exact listed command 1, which succeeded.
- **Context compaction.** The context was compacted mid-round, after 8 of the 11 reads and before any command.
  - After it, I re-read in full the C-151 manifest, `page-program.js`, `job.js`, `AGENTS.md`, `requirements.md`, `run_review_checks.py` and `process_tree.py`.
  - The sheet, the C-150 review, the evidence file and the c149 test were provided again in full by the harness, not by new reads from me.
- **Extra read.** After the commands I read `docs/reviews/C-149-candidate-manifest.json`, which isn't on the list, for the scope comparison.
- **`chrome-port.js`** isn't on the list. My statements about it rely on the C-150 read plus its unchanged hash.
- **Model and limits.**
  - The environment reports `claude-opus-5-5`, but I can't confirm the xhigh effort or `modelUsage` from inside.
  - The displayed budget was about $1.91 of $5, which is a total for the resumed session, not this round alone.
  - I can't measure turns or elapsed time against the 35-turn and 600-second limits.
  - There were no errors and no budget or quota failures.
- **Manifest label.** The C-149 manifest's `task` field says C-150; this is cosmetic.

**Changed files:** none. No memory was written.

**Checkpoint:** C-152 is complete. Possible follow-ups for Codex: assert the final gate state (N1), pin the evidence file (N2) and add the F3 tests. Any live check needs human-operated deployment first.
