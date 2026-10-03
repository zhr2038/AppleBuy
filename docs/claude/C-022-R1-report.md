# C-022-R1 report — F1 status truth repair (Claude)

Implementation candidate only. Codex reviews and runs it independently; bilateral agreement still needs my later exact-source cross-review. Nothing here is self-approval.

## Changed files

| File | Change |
| --- | --- |
| `web/checkout-connector/job.js` | Two statements plus comments (business edit). |
| `test/checkout-c022-status-truth.test.ts` | New: 6 FAKE implementation cases. |
| `docs/claude/C-022-R1-report.md` | This report. |

`control.js` was not changed. No other input byte was edited: no quantity parser, manifest, permission, setting, dispatcher, earlier test, review or task document.

## Design

`observationCurrent` now means one thing: a valid read happened in this run, and no merchant command has been committed since. Two resets enforce it:

1. **Run entry** (`job.js`, after the legacy-migration line, before the binding check). Any persisted flag is cleared before the first possible save or stop. This covers binding-differs, CONFIRMED_UNPAID, consumed final intent, revoked start grant, the RUNNING save, and the loop-top step/expiry/stop/pause stops.
2. **Write-ahead** (`job.js`, in the write-ahead block, before its save). Once a command is committed, the page may change, so the write-ahead save, the not-dispatched control-change stop, a transport-lost stop, the post-act save, the untouched record and the next loop-top stop all report the old page only as the last read page.

The existing reset before each observe and the set-to-true after a valid read are unchanged, so a fresh valid read (including in readonly reconcile) still reports the page as current. `control.js` already renders `页面` vs `最近已读页面` from this flag, so no UI change was needed.

Unchanged deliberately: the CONFIRMED_UNPAID early return still writes nothing. Its returned record says not current, and the stored flag is cleared by the next run's entry reset before any notification. Pending, history, expiry, sent/unknown truth, grants, readonly restrictions and every command/gate decision are unchanged; only the status flag value differs.

## Requirement and test mapping

| Requirement | Coverage |
| --- | --- |
| R06/R10, C-021 acceptance 2: last read page vs unread current page | Codex review cases 1–7 (pre-read stops), 8–10 (lost/pause/stop after dispatch); my cases 2, 4, 5, 6 |
| Fresh valid reads stay current | Codex review cases 11–12 (readonly AUTH, View Bag on BAG); my cases 1 and 3 (a later read restores currentness) |
| R07/R08/A09: pending/sent/not-dispatched truth preserved | My cases 2 (`dispatched:false`, zero acts), 3 (untouched history), 5 (pending checkout kept); Codex cases 1–10 |
| Expiry/history/no-write preservation | My cases 4 (CONFIRMED_UNPAID: zero writes/reads/notifications) and 6 (expired Resume: zero reads/acts, pending/expiry/history kept) |
| Actual Chinese status text | My cases 5–6 drive the real `control.js` Resume path with a FAKE port class |

My 6 cases: (1) a valid read after a dispatched checkout makes the new page current again; (2) a control change between write-ahead and act is not dispatched and is not current; (3) an untouched command stays non-current until the next read; (4) CONFIRMED_UNPAID returns with no write/read/notification and is not current; (5) control status after a lost-transport checkout shows `最近已读页面：BAG`; (6) an expired Resume reads nothing and shows `状态：EXPIRED；最近已读页面：BAG`.

## Commands and results (actual)

1. `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-022-R1-input-candidate-manifest.json` before any edit: `{"ok": true, "files": 144, "sha256": "f8ac61e923be803777fe13a929d217064e55ad47d4fa22b96236794c29565349", "mismatches": []}`.
2. `node --test review/c022-status-truth.test.ts`: 12/12 pass, 0 fail.
3. `node --test test/checkout-c022-status-truth.test.ts`: 6/6 pass, 0 fail.
4. `node --test "test/*.test.ts" "review/*.test.ts"`: tests 654, pass 654, fail 0, cancelled 0, skipped 0, todo 0, duration 6064 ms. Grepping that run's saved output found no `✖` lines. The tool did not print the numeric exit code separately and reported no non-zero exit.

654 = the 648 before-repair cases (all original 636 plus Codex's 12) + my 6. The quantity121 repair, the 1/0/2 counts, the hidden/nested/independent conflict guards and the refusal/reselection mock chain are all inside the passing suite.

## Reading scope

Read fully in this task: `docs/tasks/C-022-R1.md`, `docs/requirements.md`, `docs/reviews/C-022-Claude-actual-review.md`, `C-022-actual-review-verification.json`, `C-022-R1-before-verification.json`, `C-022-R1-input-candidate-manifest.json`, `review/c022-status-truth.test.ts`, `web/checkout-connector/job.js`, `web/checkout-connector/control.js`. I also grepped `test/` and `review/` for uses of the flag and its status labels. The control-page harness in my cases follows the pattern in `test/checkout-c021-auth-handoff.test.ts`, which I read fully in the previous C-022 review, not in this task.

## Limits and residuals

- No new candidate manifest or file hashes: no command for that was authorized, so Codex must freeze the output identity.
- O1–O3 were not changed (no authority to expand UI/semantics). Related and also unchanged: a persisted `permissionOrigin` from an earlier failed read can still appear in the help text at a later run's pre-read stop. It is a whitelisted official origin and is cleared at the next observe attempt.
- All tests are FAKE. Native confirmation of the quantity repair, the FULFILLMENT quantity/split-total adapter gap, real refusal feedback, a native one-click order, the Duo contract and speed all remain unverified. The old human-rebound task stays permanently readonly. No new bag, slot, order or payment authority.
- No permission denials. Only the four authorized commands were run, unchained. Approximately 11 turns and USD 1.6 used, within the 28-turn/USD 5 cap; no live wall-clock reading, but the commands ran well under the 900 s cap. No provider quota error. No shutdown.

## Restore point

Input: 144 files, SHA `f8ac61e9…5349`. Output differs from it only in `web/checkout-connector/job.js`, plus the added `test/checkout-c022-status-truth.test.ts` and this report. Next: Codex independent review and test run; then my exact-source cross-review before bilateral agreement.
