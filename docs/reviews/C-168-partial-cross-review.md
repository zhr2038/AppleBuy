# C-168 review report: contact-only native-validity preflight

## Verdict: bounded AGREE

The C-167 change does what the sheet asks. On a contact-only step the page already recognizes, the program checks each explicitly supplied value on a disconnected native clone before writing anything to the live form. Values that fail native validity, a source custom error, or an over-limit length are refused. Any other visible required input that is already invalid is also refused. In every refusal the result is positively untouched: the page sees no events and Continue is not clicked. Values never appear in results. Continue still depends on the old re-entry, receiver-identity and final `requiredInvalid()` checks. This agreement covers only this scope. It is not a claim about all 298 files, live recovery of the depth-3 source, any order, or the overall goal.

## Commands (run separately, in order, in the foreground, with exact text)

| # | Command | Result |
|---|---|---|
| 1 | `python -B tools/delegation/verify_candidate_manifest.py docs/reviews/C-167-candidate-manifest.json` | ok: 298 files, sha256 `2a21a998…4da432`, no mismatches |
| 2 | `node --test test/checkout-c167-contact-preflight.test.ts test/checkout-c149-personal-invoice.test.ts test/checkout-c051-contact-transition.test.ts test/checkout-c016-details.test.ts` | 51 tests, 51 pass, 0 fail/cancelled/skipped (C016 10, C051 23, C149/C151 12, C167 6) |
| 3 | `python -B tools/delegation/run_review_checks.py docs/reviews/C-167-candidate-manifest.json` | all 5 ordered checks pass: manifest ok; 108/108; 61 tests with 0 failures; full Node 1585/1585; manifest ok again. `ownedTreeCleanupConfirmed: true` every time, no timeouts |

These match the Codex verification file (51 focused tests and 1585 full tests).

## Scope check
- The manifest records `page-program.js` as `6d857e32…` (it was `96b307ce` in C-163). The only new file is `test/checkout-c167-contact-preflight.test.ts`.
- These are unchanged from C-163: `chrome-port.js`, `job.js`, the c149, c016, c051 and checkout-page-program tests, `run_review_checks.py`, `process_tree.py` and `verify_candidate_manifest.py`. No old test or assertion was changed.

## Analysis (`page-program.js:602-619`)
- **Placement:** the check runs after the existing allow-list, type, length and suffix checks, and after `bind()` has identified each receiver. It runs before `fillDetail`, which is the first live write. Its error is thrown before `touched` is set, so the job sees an untouched result.
- **Gating:** it applies only when `command.contactOnly===true` and the current observation has `out.contactStep?.verified===true`. Requiring both matches the observed C165 step, and it explains why the old C016 fake-DOM cases (whose fakes have no `validity`) are left alone.
- **Clone validation:**
  - `cloneNode(false)` keeps the type, pattern, required, minlength and maxlength attributes.
  - The value is set on the clone with the isolated-world `HTMLInputElement.prototype.value` setter, so a page override cannot intercept it.
  - The clone is never attached, so it fires no input or change events and no tree mutations. The test events confirm this indirectly.
  - If the setter cannot be found, the check fails closed.
- **customError:** this is not copied by cloning, so the source element's `validity.customError` is checked directly. That is correct: a merchant rejection cannot be laundered through the clone.
- **maxLength:** checked explicitly, which is correct because the browser sets `tooLong` only after user edits.
- **Unbound receivers:** every visible `input[required]` that has no supplied value must already pass `validity.valid`. A valid prefilled email therefore stays as it is. An invalid prefilled email with no correction is refused. Nothing guesses a value.
- **No value echo:** the refusal reason is the fixed string `PickupDetailsRequireHuman`. Test 3 asserts that neither value appears in the result.
- **Continue still gated:**
  - The old re-entry path is unchanged: URL, same `main`, `detailsStep`, the expected JSON, the inputs and their signature, the same live Continue, and the 2000 ms limit.
  - So is the one-value-per-pass rule and the `requiredInvalid()` check before clicking.
  - Nothing forces Continue or touches a disabled control.
- **Old unknown preserved:** the change is confined to the page program. Nothing changes pending or history handling, adoption depth or the transport-unknown handling in `job.js` or `chrome-port.js`. It cannot resume, re-send or authorize a fourth adoption.

## Findings (none block this scope)
1. **F1, Low: `minlength` is not checked.** Like `tooLong`, `tooShort` is set only after user edits. A value shorter than `minlength` therefore passes the clone check, and it also passes `requiredInvalid()` after a write made with the native setter. The suffix is protected by `/^\d{4}$/`, but email and phone are not. There is no evidence about whether the real fields use `minlength`. Suggested fix: add `e.minLength>=0&&value.length<e.minLength` next to the maxLength check.
2. **F2, Low: the check runs once, before the first write.** It does not run again on later re-entry passes. If the merchant reacts after the first value is written (a new custom error, a newly required input, a changed pattern), the run can still be left partially written. The old checks then catch it as touched at Continue or as drift, so the system stays truthful but the window is not closed. It also does not cover required `textarea` or `select` elements, or visible non-required inputs. Re-checking the remaining bound keys on each re-entry would narrow the gap.
3. **F3, Info: a refusal leads to retries and a vague message.** The job treats an untouched `PickupDetailsRequireHuman` like any other untouched result. It clears pending and retries up to `maxUntouched`=3, writing pending ahead each time. The stop it eventually reaches says "repeated-untouched-failures; human check required". The specific reason is only in the history. This fails safely, but the R10 status shown to the user does not say "contact field needs a human".
4. **F4, Info: other DETAILS writes are not covered.** Any DETAILS write outside the contactOnly and verified-contactStep pair, including the full-purchase branch, keeps the old partial-write exposure. This was a deliberate scope choice to keep the C016 tests unchanged, and the C165 run that actually happened was contact-only.
5. **F5, Low: test gaps.**
   - No C167 test asserts `result.reason==='PickupDetailsRequireHuman'`, so the untouched assertions would also pass for a different refusal.
   - No test covers a value longer than `maxlength`, a `pattern` mismatch or `minlength`.
   - The tests use one fixture shape, with only the identity input empty.

## R01–R10
- **R03:** no re-selection or full refresh is added.
- **R06:** a refusal is reported as untouched, never as success.
- **R07:** one value per pass and the old unknown and depth-3 truth are kept.
- **R08:** custom errors and invalid receivers go to a human (F3: the shown reason is generic).
- **R09:** the tests run only against a FAKE page on 127.0.0.1 with no merchant contact.
- **R10:** values are kept out of results and records (F3 covers the reason text).
- R01, R02, R04 and R05 are not affected.

## Real evidence versus simulation
- The only real-world fact involved is the sheet's description of the C165 email `typeMismatch`, which I did not observe myself.
- All test data, locations and DOM are FAKE, served from a locally owned 127.0.0.1 page.
- The new code is not deployed (`actualNewCodeDeployed:false`), and no real order or recovery has been verified.

## Disclosures
- **Permission denials or errors:** none this round.
- **Changed files:** none. I wrote no memory, made no network, browser, GUI or registry access, and invoked no agents.
- **Test side effects:**
  - Commands 2 and 3 launch headless system Chrome with temporary Playwright contexts, and load Playwright from the home `.cache`.
  - These are side effects of the allowed commands, not browsing by me.
  - The harness confirmed cleanup.
- **Partial reads:**
  - `job.js`: around lines 440–507, plus a grep.
  - `requirements.md`: lines 33–57, plus a grep for R01–R10.
  - The manifest: checked by grep. Its full hash check passed through commands 1 and 3.
  - `run_review_checks.py` and `process_tree.py`: read in full earlier in this session (C-164), not re-read this round. Their hashes are unchanged.
  - I did not view a diff against the old `page-program.js`.
- **No extra checks:** I ran no reproduction beyond the three commands.
- **Context compaction:** the context was compacted once during C-168, after the reads and before the commands. I re-read the C-168 sheet, the C-167 sheet, the verification file and the c167 test afterwards.
- **Model and budget:**
  - I am running as claude-opus-5-5 by my own report; the effort level has to be checked externally.
  - The cumulative USD display (about $2.91 of $5) is not this round's cost.
  - I did not measure wall-clock time against the 600-second limit.

## Checkpoint
C-168 review is complete: bounded AGREE with F1–F5 above. Live recovery of the depth-3 unknown source is still a separate, unresolved requirement.
