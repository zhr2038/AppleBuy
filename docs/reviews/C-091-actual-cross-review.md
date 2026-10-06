# C-091 review of the C090 N10 two-file repair (frozen 233-file candidate `307a6ec8…d308`)

## Verdict

**AGREE**, limited to the two-file N10 repair (`src/desktop/app.py` and `test/desktop_c078_test.py`) in candidate `307a6ec85eb391c8851898c12e89aa044eb9ed642ca2298c2f4cce60165dd308`.

The repair meets the N10 acceptance conditions I set in C-089. The N7 and N9 boundaries are unchanged. It adds no new authority.

I do not certify live operation, the installed GUI, the worker transfer messages, crash recovery, or the whole goal. The export of the original task and the production ledger are still missing, and the last bag observation was empty. So the real unpaid Pro order is still unverified and the goal stays blocked.

## What changed

- **`app.py`:** grew from 363 to 364 lines, by one line:
  - **New line, `app.py:316`:** `if isinstance(v.get('readOnly'),bool):self.checkout_readonly=v['readOnly']`. It runs for both `progress` and `result` events.
  - **Unchanged lines checked:** each line I noted in C-089 is identical in content, some shifted by one:
    - 160 (consent checkbox), 261 (transfer disables reconcile and advance), 277 (Pause message), 307 (`ready` sets the flag) and 314 (`blocked` respects the flag) are at the same numbers.
    - The read-only message (old 319) is now 320, and the `result` handling (old 321-322) is now 322-323.
- **`desktop_c078_test.py`:** grew from 76 to 88 lines.
  - Lines 1–73 match my earlier copy: lines 1–64 as compared in C-089, plus the C088 tests at 65–68 and 69–73. No old assertion was changed.
  - Two tests were added at lines 74–80 and 81–86.
- **Other files:** the hashes I recorded in C-089 are unchanged in the C-090 manifest: `browser-session` `5655482b`, c084 test `8f3ed068`, `job.js` `9dbcb104`, `cart-transfer` `d092e8b0`, `checkout-runtime` `509f678a`, `purchase-worker` `47c9d4cc`, `task-store` `0d1e4b8b`, `interactive_child` `5dd6c29f`, `README` `8399b158`. `app.py` changed `6607e53c`→`68c4472e`; the Python test changed `e15d7219`→`7dac8c72`.
- **Not compared by me:** the remaining manifest rows. Root says the other 231 hashes are unchanged; the verifier only proves the files match the C-090 map.

## N10 acceptance check

| Condition from C-089 | Result | Evidence |
|---|---|---|
| Update the read-only flag only from `progress` events that carry an explicit boolean `readOnly` | **Met.** | `app.py:316` |
| Test (i): transfer, then non-read-only progress, then `blocked` → advance enabled | **Met.** The test also asserts reconcile stays disabled. | `desktop_c078_test.py:74-80` |
| Test (ii): transfer fails before the write, then `blocked` → advance stays disabled | **Met.** | `desktop_c078_test.py:81-86` |

**Why the flag only moves on real evidence**

- **Transfer path:** a non-read-only `progress` is only emitted inside `execute()` when it is not reconciling (`checkout-runtime.mjs:34`). Inside a transfer, `execute()` is reached only after `transferExistingCart` has finished, which includes the store write (`checkout-runtime.mjs:48-49`, `cart-transfer.mjs:36`).
- **No false resets from other events:**
  - Progress from `observe()` and the final `onState(safeState(result))` carry no `readOnly` key (`checkout-runtime.mjs:8,26-27,35`). So sign-in polling cannot clear the flag.
  - Reconcile progress carries `readOnly:true`.

**Before the fix:** Root says test (i) failed and test (ii) passed on the old code, 15 of 16 overall. I did not run the old code because `git` is not an allowed command. My reading of the code agrees: without line 316, test (i) gets `disabled`. Test (ii) is a regression guard, not a failing test.

## N7 and N9 boundaries (unchanged)

- **N7(b):** `progress` still never touches the reconcile button. It changes only on `ready`, on `result` (`app.py:323`), on transfer (261), on Pause (274) and when the worker ends (304).
- **Results:** line 322 still sets the flag with `is True`, so the outcome is the same as in C088.
- **N7(a):** the backend guard is unchanged (`browser-session.mjs:28-29`). A same-context reconcile is rejected before any job runs, so it cannot emit `progress(readOnly:true)`.
- **N9:** a `blocked` event after a read-only `ready` with no progress still keeps advance disabled (`desktop_c078_test.py:65-68`, passing). Reconcile progress keeps the flag true.
- **No new authority:** the flag only controls GUI buttons. The backend still refuses to buy for a reconcile-only record (`browser-session.mjs:34`) and still requires the purchase permission fields (`browser-session.mjs:39`). No message sent to the worker, plan, revocation or final-order gate changed.

## Remaining limitation N10a (Low; not blocking; disclosure only)

If the advance after a successful transfer write throws before the job's first state report, no non-read-only `progress` arrives. In that case advance stays disabled, which is the original N10 symptom on this narrower path.

- **Example:** a failure while setting up the browser connection, or on the first page read, before the job reports any state. The ownership checks themselves pass for the same context (`browser-session.mjs:31-40`).
- **Not verified:** whether `job.run` reports a state before its first browser call. `job.js` was not on this round's read list.
- **Safety:** it fails closed, with no duplicate. Recovery is Pause, which leaves the transferred task read-only permanently (D1).
- **Full fix, if wanted:** my alternative option, where the worker sends an explicit non-read-only state right after the transfer write.

## Earlier disclosures that still apply

- F8: a stale task lock after a forced stop needs manual handling.
- D1: after a restart the transferred task can only be checked read-only; buying cannot resume.
- After a restart, the bag cannot be used to look up the final order.
- There is no direct fixture for the worker's transfer messages, and the live GUI is unverified.
- O1, O2 and D2 from C-089.

## Commands (run one at a time, in order, in the foreground)

| # | Command | Result |
|---|---|---|
| 1 | `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-090-candidate-manifest.json` | `{"ok": true, "files": 233, "sha256": "307a6ec8…d308", "mismatches": []}` |
| 2 | `python -B -X utf8 -m unittest discover -s test -p "desktop_c0*_test.py"` | `Ran 16 tests in 0.472s`, `OK` |
| 1 (repeated last) | same as #1 | identical result |

- **Shell detail:** each command was prefixed with `cd "E:/Apple Store" &&` (the Bash tool runs in Git Bash).
- **Node suite:** not rerun, as the sheet says. The 1436 Node passes are C088 historical results. No Node source or test hash changed according to the hashes I compared.
- **Cleanup:** command 2's worker test writes its own receipt under `.local/` (`interactive_child.py:20-22`). I did not read it. No browser, GUI or native fixture was launched.

## Files read to the end

- **Required list:** 11 of 11, fresh in this session. Each was a single complete read with no gaps: `AGENTS.md`, `CLAUDE.md`, the C-091 sheet, the C-090 manifest, the C-090 verification file, the C-089 review and verification files, `app.py`, `desktop_c078_test.py`, `checkout-runtime.mjs` and `purchase-worker.mjs`.
- **Extra read, disclosed:** `src/desktop/browser-session.mjs` (unchanged project file, 59 lines), read to confirm where progress and guards are emitted. It is a project file, not a private one.
- **Not read:** `.local/`, home folders, the ledger, auth data, transcripts, git history, `job.js`, `docs/requirements.md` and `docs/plan.md`.

## Real evidence vs simulation

Only fake widgets, fake events and a local `node -e` echo worker were used. There was no Apple, Chrome, GUI, network or account access, and no transfer, time slot, order or payment.

## R01–R10

| Requirement | Status |
|---|---|
| R06 | The GUI's read-only state now follows the worker's explicit boolean. |
| R07 | No repeated action on any path; N10 and N10a both fail closed. |
| R08 | The availability regression from the N9 fix is resolved except N10a. Pause and D1 are unchanged. |
| R10 | No text changes. |
| R01–R05, R09 | Not touched by this change. |

## Limits, errors and permission denials

- **Errors and denials:** none.
- **Tools used:** 12 Read and 3 Bash; no Grep, no edits, no other agents, no publishing.
- **Budget:** about USD 1.03 of 10 at the last reading, and about 6 of 24 turns.
- **Wall time:** I cannot measure it from inside the session; the dispatcher's record is authoritative.
- **Files changed or written:** none.

## Checkpoint

The review is complete. If Codex closes N10a with an explicit worker state after the transfer write:
1. Verify the new manifest.
2. Read `purchase-worker.mjs` and `app.py` to the end.
3. Run the Python suite and the Node transfer tests.
4. Repeat the manifest check last.
