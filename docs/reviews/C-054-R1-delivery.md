# C-054-R1 delivery report: all three blockers fixed in `job.js`

All three of Root's blockers are fixed, and all seven required commands passed. Both protected reproductions pass 17/17 (Root's run had 12/17). I have not approved this myself; acceptance is Root's decision. Nothing was committed.

## What changed
The C054 shortcut that compared raw date text first (`samePickupDay`) is removed. Review (`job.js:417`) and the independent order lookup (`job.js:285`) now share one slot check, `sameAcceptedSlot` (`job.js:92`). It returns "no match" in three situations, one per blocker:

1. **Missing slot facts (blocker 3).** Both the saved slot and the observed slot must have a non-empty date and valid start and end times. Missing facts no longer compare equal, so a sent final with no slot stays pending and unknown and is never resubmitted.
2. **Ambiguous saved dates (blocker 2).** `cohortAmbiguous` (`job.js:85`) treats ambiguity as a property of the three saved first dates.
   - If any two of them could be the same calendar day, every representation of every member is blocked, including an exact raw match.
   - "Could be the same day" means same month and day, and the years are not two different explicit years.
   - Labels, earliest-time limits, cursor, refusals and history are never changed. Nothing is merged, dropped or rebound, and no year is assumed.
3. **Invalid calendar text (blocker 1).** `CALENDAR_SHAPED` (`job.js:83`) decides which labels count as dates. A date label must be a real day, even when both strings are identical. It counts as a date if it starts with:
   - an English month word or abbreviation followed by a number;
   - `[N年]N月N日`, including full-width digits;
   - a numeric `N-N` or `N/N` form;
   - `今天`, `明天`, `后天`, `today` or `tomorrow`.

   Any other label is treated as an opaque FAKE or legacy label and still needs exact equality, so `FAKE-c023-date`, `FAKE-date` and `FAKE-10月23日` work as before. Different unknown strings never match.

Supported formats are unchanged, and no reader grammar was broadened. The wider date classification above can only block a match; it never creates one. All purchase, quote, no-extras, payment, current-terms, reference, expiry, read-only and final-intent rules are unchanged.

## Changed files
- **`web/checkout-connector/job.js`:**
  - two header lines;
  - three new local helpers at lines 79–97; no new source file;
  - the two decision sites now call the helper.

  `calendarDay` and `sameCalendarDay` are unchanged.
- **`test/checkout-c054-calendar.test.ts`:**
  - The four contrary exact-cohort expectations in the two final test bodies now expect `BLOCKED` at review and `NEEDS_VERIFICATION` at lookup, with zero new actions and pending/final preserved. This is the change the task sheet explicitly permits.
  - All other earlier assertions are byte-unchanged, including the valid opaque-label case.
  - 67 new cases are appended:
    - 18 identical invalid or unsupported date labels, each tested at review and at lookup;
    - 7 identical valid or opaque labels that still progress, each tested at review and at lookup;
    - 5 ambiguity cases, including an ambiguous set blocking a *different* member, plus controls where distinct explicit years or opaque/invalid members are not ambiguous;
    - 6 missing or malformed slot-fact cases, each tested at review and at lookup.
- Both Root reproductions and every other file are untouched.

## Requirement mapping
| Item | How this change covers it |
|---|---|
| R01 / A06 | No other day or year can be matched, invalid dates gain no equality, and no context is invented. |
| R04 | The slot must be shown on the page with full facts; it is never inferred from missing data. |
| R06 | Missing, malformed, invalid or ambiguous dates stay blocked or unknown. |
| R07 / A07 | A sent final with unknown outcome is only ever looked up, never resubmitted, and missing data never confirms it. |
| A12 | Grant, terms and single-order rules are unchanged. |

R02, R03, R05 and R08–R10 are not affected.

## Commands (each run as its own call)
| # | Command | Result |
|---|---|---|
| 1 | Manifest check, before edits only | ok: 192 files, sha `e2f86067…`, no mismatches |
| 2 | Both protected reproductions | **17/17 pass** |
| 3 | Calendar author tests | **140/140 pass** |
| 4 | Full suite | **1282 dots, exit 0** (1125 baseline + 12 + 5 + 140) |
| 5 | `c051` native | 3/3 pass; 3 contexts closed, browser and server closed, no errors |
| 6 | `c050` native | 9/9 pass; 9 contexts closed, browser and server closed, no errors |
| 7 | `c040` native | 8/8 pass; guard request aborted with 0 server hits; network 56 allowed / 1 blocked; 8 contexts closed, browser and server closed, no errors |

Command 7 wrote its own `.local` result file, which I did not read.

## Errors, denials and budget
- **Permission denials:** 0. **Tool errors:** 0. No failing test runs this round.
- **Usage:** about 13 CLI turns of 24 and about $1.75 of $8. I did not measure wall-clock time.
- **Not done:** no private, transcript, `.local` or network reads; no other agents; no commits.

## Known limitations
- The ambiguity rule is deliberately cautious. It blocks every member of an ambiguous set, even one whose own day is unique, and it treats an unyear pair with contradicting weekdays as possibly the same day.
- Calendar-shape detection is prefix-based. An opaque legacy label beginning with a month-like word plus a digit (for example `marker5`) would now have to be a valid date. No existing test uses such a label, and this can only block, never confirm.
- The lookup's money check is still the existing cap check, not equality with the original quote.

## Real evidence vs. simulation
Everything in these tests is FAKE: observations, grants, receipts, lookups and orders. The real evidence is limited to the `october5` / `october6` date choices observed earlier. Per the latest direct pickup instruction, the old after-payment date statement is no longer treated as a pickup limitation. Real pickup, review, receipt and detail page structures are still unseen. No unpaid order or slot hold is proven, and the paused C046 buyer is untouched.

## Checkpoint
The work tree holds uncommitted edits to `job.js` and the calendar test. The next step is Root's independent verification and acceptance decision.