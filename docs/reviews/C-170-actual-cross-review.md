# C-170 review report: final contact-only preflight (C-169 candidate)

## Verdict: bounded AGREE

The C-169 candidate does what the sheet asks. On a contact-only step the page already recognizes, every explicitly supplied value is checked before the first live write. It is tested on a disconnected copy of its input, which keeps the input's type, pattern and required attributes and its length limits. The values are also checked against the source input's custom error and its minimum and maximum length. Every other visible required input must already be valid.

Any refusal returns an untouched `PickupDetailsRequireHuman` result: no events reach the page and Continue is not clicked. Values never appear in results. The old guards on Continue are unchanged: re-entry, receiver identity and the final `requiredInvalid()` check.

This agreement covers only this preflight. It is not a claim about all 298 files, depth-3 live recovery, any order, or the goal. **I am not labelling C-168 as accepted.** The sheet says C-168 was partial, and my own C-168 report disclosed the same gaps.

## Fresh reads (all before any command)
- All 14 listed resources were read to the end of the file this round, in order of need.
- `page-program.js` (641 lines) and `job.js` (508 lines) each needed two contiguous reads because of the read tool's per-call size limit. Each second read reached the end of the file.
- I made no extra reads or searches, and did not rely on earlier reads.

## Commands (run separately, in order, in the foreground, with exact text)

| # | Command | Result |
|---|---|---|
| 1 | `python -B tools/delegation/verify_candidate_manifest.py docs/reviews/C-169-candidate-manifest.json` | ok: 298 files, sha256 `35e29aa1…836c06e0`, no mismatches |
| 2 | `node --test test/checkout-c167-contact-preflight.test.ts test/checkout-c149-personal-invoice.test.ts test/checkout-c051-contact-transition.test.ts test/checkout-c016-details.test.ts` | 54 tests, 54 pass, 0 fail/cancelled/skipped: C016 10, C051 23, C149/C151 12, C167 6, C169 3 |
| 3 | `python -B tools/delegation/run_review_checks.py docs/reviews/C-169-candidate-manifest.json` | all 5 ordered checks pass: manifest; 108/108; 61 tests with 0 failures; full Node 1588/1588 (1585 + 3); manifest. `ownedTreeCleanupConfirmed: true` every time, no timeouts |

## Analysis
- **The change.** `page-program.js:608` adds `e.minLength>=0&&value.length<e.minLength` next to the existing maxLength and custom-error checks. The fix is correct:
  - Chrome sets `tooShort` and `tooLong` only after user edits, so neither a copy given a value by script nor the live input after the scripted write would flag them.
  - The new C169 minimum-length case therefore genuinely depends on this fix. Without it, the write and Continue would go ahead.
  - The pattern case exercises the copy's `patternMismatch`. The maximum-length case exercises the explicit check.
  - All three new cases assert `reason==='PickupDetailsRequireHuman'`, `touched===false`, no events and no Continue.
- **The copy.**
  - `cloneNode(false)` keeps all constraint attributes.
  - A custom error is not copied, so it is checked on the source input.
  - The value is set with the isolated-world native setter, and the copy is never attached to the page, so the page sees no events.
  - Email value cleanup (trimming, newline removal) applies equally to the copy and the live write. The length checks use the raw supplied length, which is stricter.
  - An empty supplied value is refused, because every recognized contact field is required.
- **It cannot be bypassed for contact-only commands.**
  - The job sends `contactOnly:true` only when `!purchaseMatches` and `contactStepCurrent` both hold (`job.js:457-460`).
  - On the page, `detailsStep` (`page-program.js:464`) accepts such a command either through `purchase.verified` or through `contactStep.verified`. The two exclude each other, because the contact step requires zero iPhone mentions.
  - Any change in the page between reading it and acting fails the expected-evidence comparison (line 556) and returns untouched.
- **Truthfulness.**
  - The refusal is thrown before `touched` is set, and is caught at line 635 as untouched.
  - ChromePort (`chrome-port.js:53`) passes on a 60-character static reason.
  - The job clears pending and records `untouched-not-sent` (`job.js:492-500`).
  - The page program has no value-echo path.
- **Old unknown preserved.** `chrome-port.js` and `job.js` are unchanged, so nothing can resume, re-send or authorize a fourth adoption.

## Findings (none block this scope)
1. **C-168 F1 (minLength): resolved** by line 608 and the C169 minimum-length test.
2. **C-168 F5 (test gaps): partly resolved.** Minimum length, maximum length and pattern are now covered and assert the reason. The original six C167 cases still do not assert `reason`, so they would also pass for a different untouched refusal. Low.
3. **F2, Low (still open): the check runs once.** The preflight runs only before the first write; re-entry (lines 537-547) does not re-check the remaining keys. A merchant reaction after the first write can still leave the run partially written. That case is caught as touched (drift or `requiredInvalid()`), so the system stays truthful but the window is not closed. Required `textarea` and `select` elements are not covered.
4. **F3, Info (still open): retries and a vague message.**
   - An untouched refusal is retried until `untouchedStreak` exceeds `maxUntouched=3`, each time with a write-ahead save and a fresh read. Nothing is written to the page.
   - The stop reason shown to the user is the generic `repeated-untouched-failures; human check required`. The specific reason exists only in the history (R10).
5. **F4, Info: other DETAILS writes are not covered.** DETAILS writes outside contact-only mode keep the old partial-write exposure. This was a deliberate scope choice; the C165 run that actually happened was contact-only.
6. **F6, Info (new): length limits are not enforced on untouched prefills.** For inputs no value is supplied for, the check relies on native `validity.valid`. Native validity does not flag a server-prefilled value that breaks minlength or maxlength, because those limits apply only after user edits. Such a prefill passes both the preflight and `requiredInvalid()`. This meets the sheet's literal "native valid=true" rule, and the C165 cause (`typeMismatch`) is caught regardless. The asymmetry should be recorded.
7. **F7, Info (records):**
   - The required read `C-167-codex-verification.json` is stale for this candidate. It still records sha `2a21a998…` and 51/1585 tests, and no C-169 verification record is in scope.
   - The manifest's `task` field says `C-170-CONTACT-FINAL-REVIEW` while its file name is C-169.
   - My commands independently established 54/54 and 1588/1588.

## R01–R10
- **R03:** no re-selection or full-page refresh is added.
- **R06:** a refusal is reported as untouched, never as success or as no stock.
- **R07:** one value per pass is kept, and so are the old unknown and depth-3 records.
- **R08:** custom errors and invalid inputs go to a human (F3).
- **R09:** tests use FAKE data only, on 127.0.0.1, with network blocked.
- **R10:** values are kept out of results and records (F3 covers the reason text).
- R01, R02, R04 and R05 are not affected.

## Real evidence versus simulation
- The only real fact involved is the sheet's account of the C165 email `typeMismatch` and partial write, which I did not observe myself.
- All data, the DOM and the location are FAKE, on a locally owned 127.0.0.1 page.
- The new code is not deployed, and no real recovery or order has been verified.

## Disclosures
- **Scope comparison not freshly verified:**
  - The C-167 manifest is not on the read list and was not re-read, so I did not diff all 298 files against C-167 or C-163.
  - The key unchanged hashes (`job.js f76bc16f`, `chrome-port.js 25acfddf`, c149, c016, c051, both tools) match values I recorded earlier in this session; that comparison is not from a fresh read.
  - I did not diff the old `page-program.js` against the new one. I reviewed the whole current file.
- **Permission denials:** none. **Errors:** none. **Context compaction during C-170:** none.
- **Changed files:** none. I wrote no memory and invoked no agents. I made no network, browser, GUI or registry access myself.
- **Test side effects:** commands 2 and 3 launched headless system Chrome through Playwright, loaded from the home `.cache`, using temporary blocked contexts. The harness confirmed cleanup.
- **Model and budget:**
  - I am running as claude-opus-5-5 by my own report; the effort level has to be checked externally.
  - The harness USD display was about $1.58 of $5 after the last command. This display is not the authoritative modelUsage figure.
  - About 9 tool turns were used. I did not measure wall-clock time against the 600-second limit.

## Checkpoint
C-170 review is complete: bounded AGREE on the C-169 candidate (sha `35e29aa1…`). C-168 remains not accepted. F2–F7 are open but non-blocking, and depth-3 live recovery is still a separate, unresolved requirement.
