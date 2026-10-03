# C-015-CROSS-REVIEW: delivery report (Claude, read-only)

## Verdict
**I agree with the bounded offline repair on these exact bytes: 127 files, SHA256 `f4036ec0385cecbd07ab4fe9887f6926b316115bb8c50c4d8cd57481692d78e6`.** I found no concrete remaining defect in the C-015 scope. This is not self-approval: Codex owns acceptance. **REAL_PURCHASING_READY: false.** There is no new authority to order, hold or pay.

## Commands (the two exact approved strings, no prefix)
| Command | Result |
|---|---|
| `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-015-candidate-manifest.json` | `{"ok": true, "files": 127, "sha256": "f4036ec0…78e6", "mismatches": []}` |
| `node --test "test/*.test.ts" "review/*.test.ts"` | **420 tests: 420 pass**, 0 fail/cancelled/skipped/todo, 5986.0783 ms |

The manifest lists `page-program.js` at `c5bb8e50…ec72`. `chrome-port.js` (`7c091d9a…`) and `job.js` (`f9e0d799…`) have the same hashes as in the C-013-R3 manifest, which confirms neither file changed.

## Reading
**Read in full this task:**
- the task sheet and `docs/requirements.md`;
- the candidate manifest, `C-015-independent-review.md`, `C-015-actual-verification.json` and `C-015-Claude-delta.json`;
- `docs/claude/C-015-report.md` (current version; only the session id was redacted);
- the complete current `page-program.js` (lines 1–234) and `chrome-port.js` (1–40);
- the complete `review/c015-async-evidence.test.ts`, `test/checkout-c015-evidence.test.ts`, `review/c013-decoder-findings.test.ts` and `test/checkout-c013-decoder.test.ts`.

**Read partly:** `job.js` lines 90–234. That covers pending reconciliation, terminal and floor selection, the REVIEW final gate, write-ahead, and how untouched and unknown replies are handled. Lines 1–89 were not re-read: the intent and grant normalization, and the `STOP` set and its helpers.

**Not read:** I didn't re-review the controller, owner or the rest of the repository. I didn't open Codex's private derivative test or any raw evidence.

## Assessment of each point the task asked about
1. **Every action that shared the hash await.**
   - With a new reference, the first pass calls `return merchantDocument(...)` straight after the digest (line 146), before any command handling.
   - The second pass re-reads everything (URL, sign-in route, `main`, purchase fields, controls) and takes the hash from the cache. It has no await before any decision.
   - That covers all 13 actions, including submitOrder's grant check and click (line 226).
   - Pages with no reference, or with two or more, never await.
2. **Observation is consistent after the hash.** A read returns only the second-pass result, so the hash belongs to the label shown in that same snapshot.
   - `receiptVerified` and the `job.js:123` capture of `orderRefHash` therefore see a single snapshot.
   - The re-read happens at most once per call.
3. **Changed, missing or ambiguous reference.**
   - Changed: a read returns UNKNOWN `order-reference-changed`; a command gets a report that respects the delivered-id memo. Tested.
   - Missing or ambiguous after hashing: no hash, so the command's `expected` no longer matches and it stops untouched. A receipt with no reference doesn't verify. This is correct from reading the code, but **not directly tested**.
4. **Early exits (unsupported URL, sign-in route, missing `main`).** A structured command gets `{delivered:false, touched:prior}`. The sign-in-route behaviour is identical to before; it's just factored into the shared helper.
   - Unsupported URL and missing `main` previously returned a read object, which the transport treated as unknown. They now report untouched. That is truthful, because the command wrote nothing in this document.
   - In the job, untouched clears the pending action and counts toward the untouched bound. A final submit that was untouched still requires fresh confirmation.
5. **Already-delivered ids.** The memo is checked in the second pass before the evidence comparison. Every early exit and the changed-reference exit check it too.
   - Two copies of the same id that both wait on the hash: whichever reaches `memo.add` first wins, and the other is reported touched.
6. **Slot re-entry and the synchronous gate.** After the change-task boundary, the program calls itself again with a fresh or inherited hash cache. That call can never await, because a new label on the slots page counts as a changed reference.
   - The gate and `c.next.click()` (lines 172–177) run in the same synchronous run as the re-read.
   - Any exit at that point is reported touched, because the id is already in the memo. Its reason text, "already delivered", is cosmetically misleading, but the transport only sees "touched" and returns unknown.
   - Codex actually ran this scenario against the old bytes and got `delivered:true`. That closes the counterexample I had only reasoned about.
7. **Same live elements.** `main`, the time selector and the Continue button must be the identical elements, and connected and enabled.
8. **Price, store, date, list and control drift.** The gate compares:
   - the purchase details as JSON (total, store, quantity, fulfilment);
   - the date and time lists;
   - the selected date and `listComplete`;
   - phase `SLOTS`, the page fingerprint and the 2000 ms limit.
9. **Grant expiry.** `g.expiry<=Date.now()` is evaluated in the synchronous second pass. Tested.
10. **Normal positive behaviour.** The review, payment, bag and slot positive tests each click exactly once, and the R3 positive tests still pass.
11. **Unknown-result, restart and the one-phone terminal rules.** `job.js` is unchanged:
    - write-ahead before every action;
    - a pending `chooseSlot` or `submitOrder` is never resent;
    - the first-three-date freeze, terminal floors and stale-refusal rules all still hold.

## Correcting my report's "P3-E still open" sentence
`docs/claude/C-015-report.md` line 112 says "Still open: P3-C, P3-D and P3-E". **That is wrong for these bytes.** P3-E was exactly the gap where the page program awaited the digest between reading the page and acting on it. It is closed within the tested offline scope by this repair.

Whether any real actionable Apple page actually shows an order reference is still unknown. **P3-C** (the raw order id in the detail link and path) and **P3-D** (the page-level date-selection asymmetry) stay open and are not claimed fixed. I can't edit the report under this read-only task, so this paragraph is the correction.

## Non-blocking notes (not acceptance conditions)
- **Coverage gaps.** There are no direct tests for:
  - a missing or ambiguous reference after hashing;
  - a reference appearing on the slots page during re-entry;
  - fillDetails, selectStore, selectDate or configureProduct under hash drift (they share the same code path).
- **Old commands without the structured flag.** In the slot re-entry, a command not marked structured that hits an early exit gets a read object. Production `ChromePort` always marks commands structured.
- **fillDetails write-then-click.** fillDetails checks only the target button's live connection and enabled state after its synchronous writes. This is a synchronous, pre-existing pattern that doesn't share the hash await, and the job reconciles the step from PAYMENT.

## Kept separate (unverified)
- **Real Apple pages:** whether a real actionable page shows an order reference.
- **Chrome:** scheduling of the extension's isolated world versus the page, `crypto.subtle` timing, and network or server validation after the slot change.
- **Merchant contracts:** Apple's refusal, date and order-detail behaviour.
- **Other scope:** the old Pro collector and other unreviewed areas.
- **Setup and speed:** latency is unmeasured. Installation and read-only consent have arrived, but manual loading of the extension and its control page are unconfirmed, and current-host access needs separate approval.

The earlier C-013 acceptance and its tests are historical evidence only.

## Denials, caps, usage
- **Permission denials:** none. **Quota or 429:** none.
- **Changes:** no Write or Edit, and no network, browser, site or agent action.
- **Unrun:** the protected-test drift-branch flag. I inferred it from the code path and my own `mutated===true` assertions; Codex's private 6/6 is the run evidence.
- **Usage:** the harness notice read $0.92 of the $5 cap after my last read. That is a harness notice, not structured usage, and I infer no incremental cost from it.

## Next step
Codex records bilateral bounded offline agreement on manifest `f4036ec0…78e6`. The next business step is the user manually loading the extension and confirming its control page, then a separate action-time grant for the current host.
