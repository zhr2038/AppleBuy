## C-085 delivery report (exact233 cross-author review)

### Verdict: **DISAGREE** for exact233 as the B1 delivery

The safety claims I was asked to check all hold:
- The transfer sends no merchant mutation.
- A transferred task can never Add, open the product page or configure later.
- The Chrome extension stays revoked.
- Each listed blocked case is blocked.
- The L1 and L2 fixes are present.

I disagree because of two Medium defects in the new transfer path. Both fail safe: neither causes a duplicate Add or a second order. This is not a live or whole-goal approval. B1 is **not** solved live: the current bag is empty and no export file exists. No real unpaid order exists.

### Claims verified in code (and by tests where noted)
- **No mutation during transfer:** both reads use an observe-only port (`cart-transfer.mjs`; `chrome-port.js:13` sets authorized false; `act` throws at `:39`).
  - Both reads must show the same document and purchase, on the bag path, with `itemMatches` true and `extras===false`.
  - The record is checked for changes before an atomic write (`task-store.mjs:9`).
- **existingCartOnly:** `job.js:463` blocks configureProduct, continueProduct, addBag, openProduct and viewBag. This runs before the write-ahead step at `:468`.
  - `openBag` is still allowed. It is navigation only and needs a verified product page plus a matching side read of the bag (`chrome-port.js:47-49`).
  - Tests 1, 7 and 9 pass.
- **Source stays revoked:** `job.js:208-210` requires a proof whose context matches `port.api.sessionId`. Only `browser-session.mjs:47` sets that proof.
  - The extension's `ChromePort` never sets it, and Chrome's API has no `sessionId`.
  - In the extension, `control.js:12` still blocks prepare, start, retire and final for any record carrying the handoff (`:38/154/205/234`).
- **Blocked cases:**
  - blank ledger (`checkout-runtime.mjs:14`)
  - empty bag, wrong quantity (2) and over-cap total (tests 2–4)
  - final facts anywhere in history (test 5)
  - no approval (test 6)
  - altered archive (test 8)
  - a different product, via `itemMatches` (code only, no test)
- **L1:** the final checkbox starts disabled (`app.py:162`). It is reset on ready/blocked/result/worker-ended (`:294-295`), enabled only when review is ready and no order is verified (`:317`), and disabled at transfer (`:258`).
- **L2:** a read-only record is rejected before any purchase job starts (`browser-session.mjs:33`). Reconcile mode never stamps a buying context (`:48`).

### Findings

**N2 (Medium) — after a transfer, any worker restart leaves the task stuck with no way to resume or reconcile it.** This makes the earlier F4 limitation apply to the real B1 path.
- **Cause:** the transfer proof is bound to a random ID created per process (`browser-api.mjs:10`). The GUI's Pause stops the worker (`app.py:268`). So does closing the window or a crash.
- **What happens after a new Begin:**
  - Purchase mode fails with `ContextIdentityUnconfirmed`, `ResultStillUnconfirmed` or `FinalHistoryUnconfirmed` (`browser-session.mjs:34-37`).
  - Reconcile mode fails because the row is not read-only (`:28`).
  - A new transfer fails because there is no top-level handoff.
  - Re-importing fails with `DesktopTaskAlreadyPresent` (`task-store.mjs:16`).
- **Consequence:** an unknown checkout, slot or final from the transferred task can never be reconciled by the programme. This conflicts with R07, R08 and A07.
- **Repro (derived from the code, not executed, because edits are forbidden):** in the c084 test harness:
  1. Run the transfer, then run purchase to REVIEW.
  2. Retry with `{...api, sessionId:'FAKE-restarted'}`. Purchase rejects (`/Unconfirmed/`), reconcile rejects (`/ReadonlyHandoffRequired/`) and transfer rejects (`/LegacyUnconfirmed/`).
- **Acceptance:** after a restart, the task must stay resumable, or at least reconcilable in read-only mode, through the existing lookup of the bound reference. Required tests: restart after AUTH, after REVIEW, and after a sent final whose result is unknown. Each must show zero resubmission and zero Add, with the extension still revoked.

**N3 (Medium) — the transfer does not check whether the old task may still hold a slot.**
- **Cause:** `cart-transfer.mjs` only requires that no final facts exist. It does not check the old task's pending chooseSlot or its accepted slot.
- **Contrast:** the C060 restart requires the old window and deadline to have expired and the old tabs to be closed (`pre-final-restart.js:24,31`). The checkbox text (`app.py:160`) does not mention the old checkout either.
- **Consequence:** the new task can check out and choose a slot while the old slot's status is unknown. This risks breaking the requirement against "multiple concurrent slot holds" (`requirements.md:62`). The real record's top-level pending action is Add, so this does not apply to it today, but the code accepts the general case.
- **Repro (code-derived, not executed):** give the original task an unexpired pending chooseSlot and a future `expiresAt`. The transfer then succeeds and the run reaches `chooseSlot`.
- **Acceptance:** require the old slot to have provably expired, as C060 does, or require a separately worded operator confirmation. Add a test for the unexpired case that expects zero writes.

**N4 (Low) — Pause does not wait for an in-flight transfer.**
- **Cause:** the transfer never sets `this.active`, and `closeOnce` (`checkout-runtime.mjs:44-48,65-68`) only waits for `this.active`.
- **Consequence:** the browser can close and the lease can be released while a transfer is running. A write already past its last `live()` check lands after "closed" is emitted (`purchase-worker.mjs:29`). Combined with N2, that record is then stuck.
- **Acceptance:** track the transfer as active and await it during close, with a test.

**N5 (Low) — GUI and error-message gaps.**
- The error map in `purchase-worker.mjs:7` has no entry for the `DesktopTransfer*` errors, for `DesktopReadonlyHandoffRequired`, or for the combined message thrown at `browser-session.mjs:33`.
  - The "继续本次 Pro 购买" button is enabled even when the record is read-only (`app.py:302`), so a user can reach the combined message. They then see only generic text, and the window title does not change.
- The transfer button and checkbox are not disabled when the worker ends or is stopped (`app.py:268-273,296-300`). Clicking afterwards only produces a harmless send failure.
- `transfer_checkout` (`app.py:256-260`) skips the 4-digit check on the identity suffix. The page program still rejects a bad value before touching the page (`page-program.js:591`).

**N6 (Low) — test gaps.**
- No Python test covers L1 or the transfer GUI (a grep of `test/*.py` found nothing).
- `runtime.transfer` and the worker's transfer action have no tests.
- Untested transfer cases: two reads that differ, a record changed mid-transfer, cancellation, a different-product bag, `extras:null`, a restart (N2), and an unexpired slot (N3).

### Earlier residuals
- **Unchanged:** F5 (document race, `browser-api.mjs:65-69`), I3 (native Pause evidence only shows an idle stop), I4 (the stop handler at `purchase-worker.mjs:29` has no catch) and I5 (Caps Lock and the shortcuts at `app.py:169-170`).
- **Declared:**
  - **F7:** Playwright is loaded from the Codex runtime in your home directory (`purchase-worker.mjs:10`, and line 20 of both native scripts).
  - **F8:** a stale `.owner` file blocks startup with no automatic recovery (`task-store.mjs:10-11`, `interactive_child.py:78-80`).
- **Escalated:** F4 became N2, and F9 became N3.

### Commands (each run separately, in the foreground)
| # | Result |
|---|---|
| 1 (first) | ok, 233 files, sha `f1115167…6fe80a1`, 0 mismatches |
| 2 | Python: 9 tests, OK (0.444 s) |
| 3 | Node: 49 tests, 49 passed, 0 failed |
| 4 | Dot reporter: no failure markers. I counted about 1424 dots, but the reporter prints no summary line, so the total is not confirmed. |
| 5 | c060: 2/2 PASS. Cleanup: 2 contexts closed, browser and server closed, no errors. |
| 6 | c040: 8/8 PASS. The 127.0.0.2 guard request was aborted (0 server hits). 56 requests allowed, 1 blocked. Cleanup: 8 contexts closed, browser and server closed, no errors. |
| 1 (last) | Identical to the first run: 233 files, same sha, 0 mismatches |

- **Network:** only the owned 127.0.0.1 fixtures, using headless Chrome. No Apple access.
- **Artifacts:** the tests wrote files under the ignored `.local` directory. I did not read them.
- **Changes:** I changed no files and ran no git commands. I did not touch the untracked `C-084-publication-verification.json`.

### Read coverage, permissions and budget
- **Coverage:** all 45 items were read to the end of file in this session. Items 1–9, 10, 11, 13, 14, 41–45 and lines 1–422 of `job.js` were read before an in-session context compaction. `job.js` (lines 423–499) and the rest were read after it, and `browser-session.mjs`, `checkout-runtime.mjs` and parts of `app.py` and `job.js` were re-read.
  - The `page-program.js` read hit the read-size cap and was finished with an offset read.
  - Extra greps: `requirements.md`, the C-083 review, and `test/*.py`.
- **Permissions:** no denials and no errors.
- **Budget:** the USD meter showed about $3.96 of $10 at the last check (a whole-session total). Turns and wall time cannot be measured from inside the session, and no cap was hit.

### R01–R10 mapping
- **R06:** the transfer treats an empty, other or unknown bag read as a stop, never as a fact.
- **R07:** one executor and no duplicate Add both hold. Reconciling after a restart **fails** (N2).
- **R08:** Pause stops new actions. Resuming a transferred task after Pause **fails** (N2, N4).
- **Requirement against concurrent slot holds:** at risk (N3).
- **R01–R05, R09, R10:** this change does not affect them, and they remain unverified live.

### Real evidence vs simulation
Every role, merchant reply, approval and browser in these tests is FAKE. The transfer has never run against Apple, and no real order exists.

### Checkpoint for re-review
Codex fixes N2 and N3, ideally also N4–N6, and publishes a new manifest. The re-review then reads the changed files to the end, runs the same six commands, and confirms the repro conditions above now fail closed with tests.
