# C-089 review of the C088 four-file repair (frozen 233-file candidate `ca2aed98…ac24`)

## Verdict

**AGREE**, limited to the C088 four-file change in candidate `ca2aed9804c442f9846e76e9de4ac1d5813bffe84e6e9a6c7d8ba69dc1dcac24`.

- **What I agree with:**
  - The N7 conditions (a)–(d) are met.
  - The N9 fix works.
  - The N8 and D1 disclosures are in the GUI, and F8 stays fail-closed.
  - No old test assertion I could compare was weakened.
  - The purchase plan, the revocation of the original task, and every final-order or merchant-action permission are unchanged.
- **One new Low finding, N10:** the N9 fix leaves a stale "read-only" flag in one narrow error path. It never fails open. It does not block this limited agreement, but it should be fixed or explicitly accepted before live use.
- **What I do not certify:** live operation, the installed GUI, crash recovery, or the whole goal.
  - The export file for the original task is still missing and the last bag observation was empty, so the real Pro unpaid order is still blocked and unverified.
  - C086 remains rejected.

## What the repair does, checked against my C087 conditions

| Condition | Result | Evidence |
|---|---|---|
| N7(a): recovery requires a different, string context | **Met.** A same-context reconcile of a live transferred buyer now throws `DesktopReadonlyHandoffRequired` before any ChromePort, job or write. The new check only adds conditions, so it is strictly narrower. | `browser-session.mjs:28-29`; the rest of the file matches my full C087 copy line for line |
| N7(b): reconcile disabled at transfer and on every result that is not read-only | **Met.** The reconcile button is disabled when the transfer is sent (advance is disabled too). On each result it is enabled only for read-only results. No `progress` or `blocked` handler enables it. | `app.py:261`, `app.py:321-322` |
| N7(c): Node and Python tests | **Met.** The new Node test checks the rejection, an unchanged row, an unchanged write count and zero commands. The new Python test checks the reconcile button after the transfer send and after a non-read-only result. | `desktop-c084-cart-transfer.test.ts:80-84`; `desktop_c078_test.py:69-73` |
| N7(d): the different-context tests still pass | **Met.** The three C086 restart tests (AUTH, REVIEW, unknown final) pass. | command 3 |
| N9: a `blocked` event never re-enables advance for a read-only record | **Met.** `checkout_readonly` is set from `ready` and `result`, and `blocked` respects it. A test covers it. | `app.py:307,314,321`; `desktop_c078_test.py:65-68` |
| N8: the chosen disclosure option | **Met in the GUI.** The read-only message tells the operator to check the official order page after a restart, and says the programme does not resubmit. Docs are not updated (the `README.md` hash is unchanged). That was half of my option, but it is acceptable as the sheet's stated choice. | `app.py:319` |
| D1: disclosed at consent and at Pause | **Met.** The checkbox says that after a pause or restart the task can only be reconciled read-only, not bought. The Pause status repeats this. | `app.py:160`, `app.py:277` |
| F8: truthful and still fail-closed | **Met.** The Pause status warns that a forced stop may leave the task lock behind and need manual handling. It is a conditional warning: it does not detect whether a forced kill actually happened. There is no PID, age or unlink workaround. | `app.py:277`; `task-store.mjs` and `interactive_child.py` hashes unchanged |
| No new authority | **Met.** `app.py` only disables controls, sets flags and changes text; the transfer message it sends is unchanged. `PRO_PLAN`, the Add/configuration block for transferred carts (`job.js:463`), the source revocation (`job.js:210`) and the read-only final-order gate (`job.js:309`) are unchanged. | manifest comparison below |

## Finding N10 (Low): a stale read-only flag after a successful transfer

**Cause**
- `checkout_readonly` is set to true by the `ready` event for the imported read-only task (`app.py:307`). It is cleared only by a `result` event (`app.py:321`), never by `progress`.

**Trigger**
1. The transfer write succeeds.
2. The follow-on advance throws before any `result` is sent. The worker's transfer branch then sends only `blocked` (`purchase-worker.mjs:46,48`).
   - A realistic case: the first run after the transfer reaches REVIEW without stopping at sign-in, and then `prepareReview` throws on a changed review page, a missing terms link or a transport error (`checkout-runtime.mjs:35,53`).

**Consequence**
- `app.py:314` keeps advance disabled, reconcile is already disabled, and transfer cannot be repeated.
- The operator's only option is Pause. Under D1 that permanently turns the transferred buyer read-only.
- Nothing is repeated and no permission is gained. The C086 code would have re-enabled advance here (the N9 behaviour). So this is a narrow availability regression created by the N9 repair.

**Reproduction (worked out from the code; not run, because I may not write tests)**
1. Use `fake_app()`.
2. Send a `ready` event with read-only true, then call `poll()`.
3. Set `transfer_confirm` to true, replace `checkout.send` with a list append, and call `transfer_checkout()`.
4. Send a `progress` event with read-only false and call `poll()`.
5. Send a `blocked` event and call `poll()`.
6. Expected on the current code: `advance_button.state=='disabled'`.

**Acceptance conditions**
- Update `checkout_readonly` from `progress` events that carry an explicit boolean `readOnly`.
  - `execute` always sends one (`checkout-runtime.mjs:34`); `observe` progress events do not.
  - Alternatively, have the worker send an explicit non-read-only state after the transfer write.
- Add two Python tests:
  - (i) transfer → progress(read-only false) → blocked: advance is enabled;
  - (ii) transfer fails before the write → blocked: advance stays disabled.

## Minor observations (not blocking)

- **O1:** After a transfer that fails before writing, reconcile and transfer stay disabled for the rest of the session. Recovery is Pause, then Begin; Begin automatically reconciles the unchanged imported task and re-enables transfer. This fails closed.
- **O2:** The consent text no longer says the old unknown record is kept ("旧未知记录保留"). It is still true in the code (the archive) and in other status messages.
- **O3:** These residuals are unchanged:
  - D2 (the "already running" message when closing drains a transfer);
  - no direct fixture for the worker's transfer messages;
  - the bound-reference lookup is still computed but not sent (`browser-session.mjs:55-56`, `purchase-worker.mjs:47`).

## Scope check: only four paths changed

- **Manifest comparison:** I compared the C088 manifest against the C086 manifest I read in C087, for every entry under `src/desktop`, `web/checkout-connector`, `tools/delegation`, the desktop tests, `README.md` and `package.json`.
  - Only `app.py`, `browser-session.mjs`, `desktop-c084-cart-transfer.test.ts` and `desktop_c078_test.py` differ.
  - I did not compare every other row by eye. The manifest verifier confirms the bytes match the C088 map.
- **Old assertions:**
  - **Python test:** lines 1–64 match my full C087 copy; the change only adds tests.
  - **`browser-session.mjs`:** only line 28 differs.
  - **`app.py`:** the changes I found (lines 160, 261, 277, 307, 314, 319, 321-322) account exactly for the 360→363 line growth. I could compare only lines 250–324 and line 160 against old copies.
  - **c084 test:** it grew from 80 to 85 lines, consistent with one appended test. I could not compare lines 1–79 byte for byte because I had no old copy and `git` is not an allowed command.
- **Root's claim that the new Node test failed before the fix:** not verified by me (no `git` access). It is consistent with my C087 analysis of the old code.

## Commands (separately, in order, foreground, no pipes or redirects)

| # | Command | Result |
|---|---|---|
| 1 | manifest check | `ok:true`, 233 files, `ca2aed98…ac24`, `mismatches:[]` |
| 2 | Python `desktop_c0*_test.py` | `Ran 14 tests … OK` |
| 3 | 5 targeted Node files | 41 pass, 0 fail; transfer tests = 9 C084 + 11 C086 + 1 C088 = **21** |
| 4 | full Node suite, dot reporter | 1436 dots by my count (71×20+16); no failure marks; exit 0. This reporter prints no summary line. |
| 1 (repeated last) | manifest check | identical result |

- **Cleanup:** no browser or native fixture was launched. Command 2's worker test writes its own owned worker receipt under `.local/` (`interactive_child.py:20-22`); I did not read it.

## Files read to the end (18 of 18, fresh in this session, no compaction)

- All 18 required files, including the C-089 task sheet.
- `job.js` was read in two adjacent chunks (lines 1–422 and 423–499) because of the per-read size limit; every other file was a single complete read. No gaps.
- **Not read:** `.local/`, home folders, `docs/plan.md` (not on the list), git history.

## Real evidence vs simulation

- Everything ran against fake APIs, fake widgets and offline fake fixtures.
- No Apple access, GUI or browser operation, account use, transfer, slot, order or payment happened.

## R01–R10 (only what this change affects)

| Requirement | Status |
|---|---|
| R01 | Plan unchanged. |
| R03 | The no-Add rule for transferred carts is unchanged. |
| R06 | The N8 and F8 messages are now truthful disclosures. |
| R07 | No repeat in any path; N7 and N10 both fail closed. |
| R08 | N7 fixed; D1 disclosed; N10 narrows recovery in one error path. |
| R09 | Fake only. |
| R10 | Chinese disclosures added. |
| R02, R04, R05 | Not touched. |

## Limits, errors and permission denials

- **Errors and permission denials:** none.
- **Tool calls:** 19 Read and 5 Bash; no Grep, no edits, no other agents.
- **Budget:** about USD 1.6 of 10 at the last reading.
- **Turns:** about 11 of 48.
- **Wall time:** I cannot measure it from inside the session; the dispatcher's metadata is authoritative.
- **Changed files:** none.

## Checkpoint

The review is complete. If Codex fixes N10:
1. Run command 1 on the new manifest.
2. Check the two N10 Python tests and the `progress`-driven flag.
3. Re-run commands 2–4.
4. Repeat command 1 last.
