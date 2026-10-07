# C-150 review: personal-invoice contact step

**Verdict: bounded AGREE.** In the current 292-file candidate, the new decode only recognizes the exact personal-invoice group. It gives no purchase, slot or hold authority, and it keeps every original contact-only guard. I found nothing unsafe that I could reproduce. There are test gaps and one evidence gap, listed below. Everything here used FAKE test data; none of it was checked live.

## Commands run (in order, in the foreground, exactly as listed in the sheet)
1. **`python -B tools/delegation/verify_candidate_manifest.py docs/reviews/C-149-candidate-manifest.json`**: passed. 292 files, sha256 `7d80ba6c25f98e58e6775165f3a5031aa6c4ee87c6b866e5509dfbddd573ba59`, no mismatches.
2. **`node --test` on the c149, c051 and c058 tests**: 54 tests, 54 passed, 0 failed, cancelled or skipped.
   - C149: 11. C051: 23. C058: 20.
3. **`python -B tools/delegation/run_review_checks.py docs/reviews/C-149-candidate-manifest.json`**: all 5 checks passed in order.
   - Manifest check: 292 files.
   - Focused tests: 108 of 108.
   - Python tests: 54, no failures or errors.
   - Full Node suite: 1567 of 1567.
   - Manifest check again: 292 files.
   - Every check exited 0, none timed out, and every check confirmed cleanup of its own processes.

## Change scope
I compared the C-149 manifest against the accepted C-145 manifest (via one Grep after the commands):
- `page-program.js` changed (`f96efbb7…` → `96b307ce…`), and `test/checkout-c149-personal-invoice.test.ts` is new.
- These are unchanged: `job.js` `f76bc16f…`, `chrome-port.js` `25acfddf…`, the c051 test `0837e471…`, the c058 test `c1c9c968…`, `run_review_checks.py` and `process_tree.py`.
- I didn't run a diff of the other 287 files.

## What I checked (`page-program.js:424-441`)
- **Malformed, hidden, duplicate and other radios**
  - The page must show exactly 3 visible radios, all of them in the invoice group. Exactly 3 inputs carry the group name, counted at any visibility.
  - Each option must match its exact id, value, `type=radio`, visibility, enabled state, not required, not readonly, parent `DIV.form-selector`, exactly one visible label inside main, and exact label/accessible-name text.
  - Any extra, hidden, missing, renamed or `role=radio` control fails recognition.
  - The header must be exactly one input named `invoiceHeader` (at any visibility) with the exact id, `type=text`, visible, enabled, optional, writable and the exact label.
- **Company or VAT selected.** `checked(e)===(i===0)` requires personal checked and the other two unchecked. Both cases have tests that pass.
- **Contradictory order facts.** The invoice clause only replaces `radios.length===0`. Every other guard still applies, including:
  - zero iPhone mentions, no quantity, `件商品` or `数量` text;
  - no store radios or values, no fulfillment choice, no selects or dates;
  - no pickup, AppleCare or trade-in text, no slot summary, no order reference;
  - no dialog, and exactly one companion-bar total.

  The invoice labels don't trigger any of these patterns.
- **Sensitive values.**
  - The decode reads only attributes, the public option `value` constants and label text. It never reads the header's `.value`.
  - `contactStep` keeps its old shape. `fillDetails` binding rules don't include any invoice label, and radio inputs can't bind.
- **Retained slot handling.** `job.js` is unchanged:
  - `sentSlotBound` and `contactStepCurrent` still require the originating purchase run, a matching money basis, no final intent and `!reconcileOnly`.
  - A readonly run keeps `chooseSlot` pending (C149 readonly test, C058).
  - A slot already continued never gets a second slot.
  - REVIEW still needs `sameAcceptedSlot` with the current slot summary, plus a human final grant.

## Findings (none unsafe)
- **F1 (Low/Medium): the "never changes invoice" test never exercises the write path.**
  - In the C149 continuation test (`test/checkout-c149-personal-invoice.test.ts:30`), `port.act` is replaced by a stub. So `fillDetails` and Continue never run through `merchantDocument` on the invoice page.
  - Its checks that the radio and header are unchanged therefore don't test any write. I only confirmed that `fillDetails` leaves the invoice alone by reading the code.
  - **Acceptance:** a FAKE test that goes through the real `ChromePort.act` and `merchantDocument`, using a FAKE identity suffix and a FAKE prefilled header value. It should show:
    - only the identity input gets input/change events;
    - the radio states are unchanged;
    - the header value is unchanged and doesn't appear in page results or the record;
    - Continue is clicked once, with no slot action.
- **F2 (Low): the radio id format isn't in the saved evidence.**
  - The decoder requires each radio's `id` to equal `group + '-' + value`. `C-149-public-invoice-evidence.json` records the header id but not the radio ids.
  - If the live ids differ, recognition fails closed: the slot stays unknown with `NEEDS_VERIFICATION`. That is safe, but the patch would not move the live run forward.
  - **Acceptance:** add the observed public radio ids to the sanitized evidence, or confirm them with a readonly observation once the patch is deployed.
- **F3 (Low): cases rejected by the code but not tested.**
  - A disabled or required option, or an option outside `.form-selector`.
  - An `aria-label` mismatch, or a label with extra text.
  - A hidden 4th input with the group name.
  - A header that is missing, hidden, required, readonly, or has the wrong id or type.
  - A valid invoice group combined with one of the C051 contradictory facts.
- **F4 (Info): unchanged older behaviour.**
  - The contact-only check still ignores hidden radios with other names, and it doesn't check visible checkboxes or extra visible text inputs.
  - Continue submits Apple's default personal e-invoice with an empty optional header. What Apple does with that hasn't been observed. Invoice type isn't one of the plan conditions.

## R01–R10
| Requirement | Status in this review (all FAKE test data) |
|---|---|
| **R01** | The invoice group grants no product, store, quantity or slot authority, and the plan is unchanged. |
| **R02** | The page shape is recognized, but the evidence is partial (F2). |
| **R03** | Normal contact-step progression works. |
| **R04, R05** | Unchanged; no second slot. |
| **R06** | Unrecognized invoice shapes leave the slot unknown. |
| **R07** | One `fillDetails`, and no slot is sent again. |
| **R08** | The paused worker wasn't touched, and a human final is still required. |
| **R09** | No real order. |
| **R10** | No UI change, and no values appear in the output. |

No requirement is accepted by this review.

## Real evidence versus simulation
- Every test used FAKE data on an owned `127.0.0.1` page. I did not contact real Chrome, the account or Apple.
- The live facts (R609, the slot sent, the contact page reached, the login) are Codex's claims, and I didn't check them.
- The patch is not deployed to the native peer. I didn't install, reload or reconnect anything, or operate the worker.
- I make no claim about the whole 292-file candidate, live behaviour, orders, speed or the overall goal.

## Things you should know
- **Reads**
  - There was no context compaction during this round.
  - All 16 listed files were read to the end before the first command. `page-program.js` and `job.js` each took two reads.
  - After the commands, I also ran one Grep on `docs/reviews/C-145-candidate-manifest.json`, which isn't on the list, for the scope cross-check.
- **Model and budget**
  - The environment reports `claude-opus-5-5`, but I can't confirm the xhigh effort or `modelUsage` from inside.
  - The displayed budget is about $1.96 of $7. It may not be exact for this round, because the sheet says `modelUsage` is an aggregate over the resumed history.
  - I couldn't measure elapsed time against the 900-second limit.
- **Clean run:** nothing was denied, nothing errored, and there were no budget or quota failures.
- **Manifest label:** the C-149 manifest file's internal `task` field says `C-150-INVOICE-REVIEW`. This is cosmetic.

**Changed files:** none.

**Checkpoint:** C-150 is complete. If you want more, the next round would be Codex adding the F1 and F3 tests and the F2 evidence; the patch needs human-operated deployment before any live check.
