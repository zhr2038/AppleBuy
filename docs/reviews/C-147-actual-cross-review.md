I've finished the checks and am writing up the review.

# C-147 review: native summary fix and bounded same-cart re-entry

**Verdict: bounded AGREE.** In the current 291-file candidate, the native summary binding fix and the bounded cart-transfer re-entry are correct for what I checked. I found nothing unsafe that I could reproduce. Some test gaps and one measurement gap remain (listed below), and C-143 F3 is still open. Everything I ran used FAKE test data; none of this has been checked live.

## Commands run (in order, in the foreground, exactly as listed in the sheet)
1. **`python -B tools/delegation/verify_candidate_manifest.py docs/reviews/C-145-candidate-manifest.json`**: passed. 291 files, sha256 `19c8610759880963dc5cc2a59bb359dc91a5bd8d95abd5e00c36dcd1f80d9ac5`, no mismatches.
2. **`node --test` on the c145, c146, c142 and c084 tests**: 45 tests, 45 passed, 0 failed, cancelled or skipped.
   - C145: 3 tests. C146: 7. C142: 12. C084–C103: 23.
3. **`python -B tools/delegation/run_review_checks.py docs/reviews/C-145-candidate-manifest.json`**: all 5 checks passed in order.
   - Manifest check: 291 files.
   - Focused tests: 108 of 108.
   - Python tests: 54, no failures or errors.
   - Full Node suite: 1556 of 1556.
   - Manifest check again: 291 files.
   - Every check exited 0, none timed out, and every check confirmed cleanup of its own processes (`ownedTreeCleanupConfirmed: true`).

## What I checked
- **Summary fix (`chrome-port.js:68`)**
  - `readSummary` now sends `documentId=this.last.documentId`. That satisfies the `checkoutCommand` contract.
  - The peer still rejects the command unless all of these match: the current document, the exact last page (`expected`), no reused command ID, and the task/tab binding.
  - A readonly port cannot read the summary, and a replaced document is rejected. Both have tests that pass.
  - Codex reports the old code failed this test and the new code passes. I did not run the old code, so I can't confirm that.
- **Depth limit, correct at the boundary**
  - The new source is checked with `sourceAllowed(old,2)`, and the new record is re-checked with `transferRecordValid(row,3)` before it is written.
  - The depth is worked out from the actual nesting of records, never from a stored count.
  - A source whose history already holds 3 transfer links is rejected at the bottom with `remaining<=0`, so a 4th link is never written.
  - Handoff and empty-restart links don't use up the limit. An empty restart can't wrap a transfer: `sourceGeneration` returns null for a transfer record (`empty-restart.mjs:11`). So the limit can't be reset by alternating the two.
- **Archive and folding**
  - The archive must have exactly the keys `oldActionOutcome`, `originalSnapshot` and `retiredAt`. Its fingerprint must match, and the whole archive must exactly equal one rebuilt from `originalTask`.
  - Only after that check passes does `compactTransferLayer` drop the duplicate copies. The current layer, including extra fields inside `desktopTransfer`, is still scanned for finals and slots, and the original is scanned through `sourceAllowed` and `sourceSlotWindowsExpired`.
  - The generic 3000-node limit is unchanged (`browser-session.mjs` hash unchanged).
- **A final in the current record versus one in an ancestor.** The distinction is correct:
  - **Readonly lookup** (`validateDesktopCartTransfer`) doesn't scan the current record for finals, but does scan every ancestor. So the protected UNKNOWN_FINAL readonly reconcile still works, and its test (`c084:43-50`) is unchanged according to the manifest hash.
  - **Source for a new buyer** (`sourceAllowed`) also scans the current record, so a final there rejects it. A buyer in a different context in purchase mode is still refused by `browser-session`.
- **Dual markers and malformed plans.** At each transfer link, exactly one marker is required, and both handoff and empty-restart markers are rejected. The plan and plan digest are checked at every link.
- **Wrong or empty cart, and no Add.** The transfer only uses a readonly port. It needs two matching reads: the bag, a verified step, the `/shop/bag` path, a matching item within the price cap, no extras, and the same document. `job.js` line 472, which stops cart-only records from adding, is unchanged.
- **Source changed during the transfer.** The stored record is compared again by its full content before the write; the C086 changed-record test passes. The time between that comparison and the write is still covered only by the lease, which is F3 below.

## Findings (none unsafe or reproducible)
- **G1 (Low): test gaps.** I checked these by reading the code but couldn't run anything beyond the three allowed commands.
  - Nothing tests UNKNOWN_FINAL → readonly reconcile → a new transfer attempt, which should be rejected with zero writes. The current-layer scan is only tested through `extraBranch.finalIntent`.
  - Nothing tests an empty-restart marker together with a transfer marker.
  - Nothing tests a middle link with a wrong context or plan, with the fingerprint and archive rewritten to match.
  - Nothing tests a non-finite `retiredAt` or a wrong archive key.
  - Nothing tests wrong-cart, empty-cart or no-Add for transfer links 2 and 3.
  - Cyclic in-memory input makes `canonicalJson` throw rather than return null. That fails closed, and JSON-backed storage can't contain cycles anyway.
  - The C146 depth test doesn't check which error the 4th transfer raises.
  - **Acceptance:** FAKE tests for each case that expect a rejection with zero writes and the specific error.
- **G2 (Low/Medium): record size and time are unmeasured.**
  - Each link stores about 3 copies of its source. Three links are therefore about 27× the empty-restart row, and the next record about 81×.
  - The record is validated with full-record `canonicalJson`/`structuredClone` passes at every level, and `sourceSlotWindowsExpired` re-validates each level again.
  - I didn't review the task store's size limits.
  - **Acceptance:** a FAKE record at maximum depth with a realistically sized empty-restart row, with its byte size and validation time recorded against the store's limits.
- **G3 (Info): no expiry requirement for transfer sources.**
  - A transfer-layer source doesn't need an expired `expiresAt`, unlike an empty-restart source. This matches the existing handoff behaviour, and slot windows are still enforced.
  - Inside an empty-restart chain, a stray extra `desktopTransfer` marker isn't rejected, but nothing reads it. That code (`empty-restart.mjs`) is unchanged.
- **G4: C-143 F3 is still open, as the sheet says.** `checkout-runtime` `transferOnce` checks `live` without checking the lease.
- **G5: the size of the change isn't diffed.**
  - I confirmed the scope from the manifest hashes (C-145 compared with C-142), the starting git status, and reading the code.
  - I did not run a diff, so I can't confirm that `chrome-port.js` changed by exactly one field.

## R01–R10
| Requirement | Status in this review (all FAKE test data) |
|---|---|
| **R01** | Plan, quantity 1 and price cap are checked at every link and in both bag reads. |
| **R02** | Nothing new. |
| **R03** | Re-entry doesn't add to the cart again. |
| **R04, R05** | Not touched. |
| **R06** | The old outcome is kept as `unknown`, and the summary read rejects stale documents. |
| **R07** | The depth limit holds, there's no Add, and reconcile runs first for UNKNOWN_FINAL. |
| **R08** | Human login stays human-only, and the pause/close tests pass. F3 is still open. |
| **R09** | No real order. |
| **R10** | No UI change. |

No requirement is accepted by this review.

## Real evidence versus simulation
- All my results come from FAKE fixtures and the mocked native stack.
- The "actual 289 programme" facts are Codex's claims. I didn't verify them, and I didn't read any real source, record or customer data.
- The new code hasn't been run live (`newPatchLiveVerified:false`).
- I make no claim about the whole 291-file candidate, the current account, the new code running live, refusals, holds, orders, speed, or the overall goal.

## Things you should know
- **Context compaction**
  - All 19 listed files were read to the end in this round before any command ran. My context was then compacted before the commands.
  - I did not re-read all 19 files afterwards. Four of them came back into context automatically: the C-147 sheet, the C-145 verification, `cart-transfer.mjs` and the c146 test. For the other 15, my analysis relies on a summary of my earlier reads.
  - The three manifest checks confirm that every file still matches its manifest hash.
  - After the commands I ran three Grep searches on listed files: `c084`, `empty-restart.mjs` and `requirements.md`.
  - My earlier one-line status message, which said the files had been read, refers to the reads before compaction.
- **Model, budget and limits**
  - The environment reports `claude-opus-5-5`, but I can't confirm the xhigh effort or the structured `modelUsage` from inside the session.
  - The displayed budget is about $2.69 of $7. That figure may be an aggregate that includes spend before the compaction, so it isn't an exact cost for this round.
  - I used about 10 tool calls. I couldn't measure elapsed time against the 1200-second limit.
- **Clean run**
  - I made no edits and wrote no files or memories.
  - I didn't access the network, a browser, Chrome or Apple.
  - Nothing was denied, nothing errored, and there were no budget or quota failures.

**Changed files:** none.

**Checkpoint:** C-147 is complete. If you want more, the next round would be Codex adding the G1 tests and the G2 measurement, fixing F3 separately, and then running the new code live under human supervision.
