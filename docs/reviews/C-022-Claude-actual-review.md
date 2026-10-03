**Verdict: DISAGREE** for the combined candidate: 143 files, SHA `cfdcb7e40117d8a033cb53a2dba573fc05bbcbc56bb9bce355bfed006bfb1646`.

The C022 quantity repair and the C021 purchase-safety behaviour hold up. One C021 status-truth defect blocks agreement (F1 below): it breaks C-021 acceptance point 2, which requires the status to tell the last read page apart from an unread current page. Codex should reproduce F1 independently and resolve it; I made no edits.

## Identity and tests (actual runs)
- **Manifest:** `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-022-candidate-manifest.json` returned `{"ok": true, "files": 143, "sha256": "cfdcb7e4…1646", "mismatches": []}`.
- **Full suite:** `node --test "test/*.test.ts" "review/*.test.ts"` gave tests 636, pass 636, fail 0, cancelled 0, skipped 0, todo 0, duration 6584 ms. I grepped this run's saved output and found no `✖` lines. The tool did not print the numeric exit code separately and reported no non-zero exit.

## Reading scope
I read these files in full:
- the task sheet and `docs/requirements.md`
- `C-022-QUANTITY.md`
- all eight required review documents
- `chrome-port.js`, `job.js`, `control.js`, `control.html`, `page-program.js`
- the five required test/review case files

I did not read `manifest.json`, `owner.js` or the other test files. They were only executed.

## Blocking finding
**F1 — the status can label a stale page as the current page.**
- **Cause:** `observationCurrent` is stored in the task record and is only reset at `job.js:121`, just before an observe attempt.
  - Any stop that happens before that line, or after a command is sent, still shows `observationCurrent:true` from `job.js:56` together with an old `lastPhase`.
  - `control.js:33` then shows it as "页面：X" (current page) instead of "最近已读页面：X" (last read page).
- **Repro A (stale read from an earlier run):**
  1. Store a valid FAKE task with `observationCurrent:true`, `lastPhase:'BAG'`, pending `checkout`, and `expiresAt` in the past.
  2. Run it in purchase mode (Resume). It stops as EXPIRED at `job.js:118` before any read.
  3. The status shows "状态：EXPIRED；页面：BAG；待确认动作：结账…".
  - The same happens with the stops at `:101` (binding differs), `:107`, `:108`, and with pause/step-bound at `:115–120`.
- **Repro B (after a command is sent):**
  1. A FAKE BAG read verifies the item, then the checkout is written ahead (`:220–226`).
  2. `act` throws, so the run stops as `mutation-transport-lost` at `:232`.
  3. The status still shows "页面：BAG", although the page after the checkout was never read.
  - Pausing while `act` is running gives the same result at the next loop-top PAUSED stop (`:120`).
- **To accept:**
  - `observationCurrent` is true only after a valid read in the current run, and is reset before a merchant command is dispatched.
  - In practice: reset it at the start of `run()` before any save or stop, and at write-ahead or immediately before `act`.
  - Add FAKE cases for A and B, and keep all 636 existing cases passing unchanged.
- **Scope of the defect:** it does not send any mutation and does not affect C022.

## Non-blocking observations
- **O1:** The `hostOrigin` field is auto-filled at `control.js:33` and stays filled. While it is non-empty, it takes priority over the selected-tab and public first-use requests (`control.js:19`). The requested host is still whitelisted and Chrome still prompts, so this is a UX surprise rather than a safety issue.
- **O2:** Reconciling a `CONFIRMED_UNPAID` task returns at `job.js:106` without updating the status. `control.js:80` sets none either, so the page keeps showing the previous text.
- **O3:** Calling `mode:'reconcile'` directly at job level with a different tab or digest still writes `state:BLOCKED` (`job.js:101`). The pending action, history and expiry are kept. The UI blocks this case earlier (`control.js:77–78`), and Codex's test expects it.

## Verified without findings
**C021**
- **Missing-host permission:** the error carries only the validated origin.
  - It passes the whitelist twice, in `job.js:19` and `control.js:16`, with no query or port.
  - An undisclosed (opaque) URL falls back to the generic transport-failure stop.
- **Same-tab readonly reconcile:**
  - A missing, retired or corrupt task is never recreated.
  - Grants are discarded, and `mode:'reconcile'` cannot be combined with rebind.
  - Expiry is exempt only for this read and `expiresAt` is never written.
  - There is no polling (`:145`, `:152`, `:157`) and no `lookupOrder` for an unknown final submission.
  - No path reaches `act` (double defence: observe-only port plus early returns at `:155–157`).
  - It sets no `reconcileOnly`, and the existing restriction set by a human rebind is kept.
- **Control page:**
  - It runs under the ownership lock and checks the cancellation ticket after every await.
  - It reads no session data and needs no purchase checkbox.
  - Condition and tab gates are separate, and the binding summary shows only whitelisted values.
- **C017 amendment:** the test now requires exactly 27 sorted IDs (the 25 old ones plus `hostOrigin` and `reconcile`), so uniqueness still holds, and `final` must still be disabled. Old permission and action cases are present, but I did not byte-diff them against the prior file (no diff command was allowed).

**C022**
- The text of each outermost select is removed once, before the 180-character limit, and quantity text outside the selects is kept.
- A select whose literal quantity disagrees with the selected value still yields no quantity.
- The default line parser and the logic for cart anchors, the checkout pair, one unit, price cap, no extras and the delivery memo are unchanged; the new lines shift later code uniformly by 5.
- An old View Bag task on a proved BAG reconciles with zero clicks.
- I checked by hand that replacing the first matching occurrence (instead of the select's own text) cannot turn a real single-digit conflict into a pass.

## Limitations
- I could not run my own repro scripts; only the two exact commands were allowed. F1 is based on reading the code, and Codex needs to confirm it.
- All tests use a FAKE DOM and FAKE Chrome. Native confirmation of the quantity repair is still pending.
- The FULFILLMENT page still shows no explicit quantity and splits the summary price. This adapter gap remains open.
- Still unverified: whether real Chrome discloses the tab URL so the automatic-origin path can be reached, real refusal feedback, a native one-click order, the Duo contract, and speed.
- This review does not make the candidate ready for real purchases, and it grants no new bag, slot, order or payment authority.
- I hit no permission denials. I used about 11 turns and about USD 3, within the 48-turn and USD 10 caps. I had no live wall-clock reading, but the commands themselves took well under the 1800 s cap. There were no provider quota errors.
- I wrote no files or memory, and did not shut down.
