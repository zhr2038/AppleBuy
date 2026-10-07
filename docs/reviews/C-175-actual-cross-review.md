## C-175 review: bounded AGREE on the current C171 exception with F5 closed for the fourth link

The patch preserves the source task's date restrictions in the exceptional fourth task. The unchanged controller only ever tightens them while the task runs, so they survive storage and resume. It cannot pick a fourth date or an earlier same-day slot. The verdict covers only the C171 exception and F5. It says nothing about the whole repository, live readiness, the one unpaid order or the goal. I am not labelling the older C171 version accepted.

**Changed files: none.** I wrote no report, memory or source change.

### Commands (exact text, foreground, separate, in order)
1. **Manifest check:** ok, 299 files, sha `cccb2f64…e8bd7`, 0 mismatches.
2. **Focused tests (c171, c146, c084):** 51 run, 51 pass, 0 fail.
3. **`run_review_checks`:** all five ordered checks passed, each with exit 0, no timeout, and owned-process cleanup confirmed.
   - Manifest: ok.
   - Owned node subset: 108/108.
   - Python unittest: 61, with 0 failures, errors or skips.
   - Full node suite: 1609/1609.
   - Manifest again: ok.

These match Codex's 51 focused / 1609 full claim.

**Scope.** Compared with the C-171 hashes I recorded during C-172, only two files changed:
- `cart-transfer.mjs`: `839f629e…` → `24b9d4b1…`
- the c171 test: `484d394b…` → `38e6d80e…`

Every other file I tracked is unchanged: `checkout-runtime`, the worker, `job.js`, `browser-session`, `owner-lease`, the c146/c084 tests and the delegation tools. That is only a subset of the 299 files.

### What changed and why it holds
**Copy.** `writeCartSuccessor` (`cart-transfer.mjs:90`) copies exactly five fields from the old task, only on the exceptional path: `initialDates`, `floors`, `rejected`, `refusals` and `dateCursor`. The copy happens before the record is validated and before the single write (`:91-92`). No slot, pending action or final is copied, so none is inherited.

**Validation.** `schedulingRestrictionsKept` (`:28-32`) runs only on the exception branch (`:43`). The ordinary path is untouched (`:44`). It requires:
- the same date set;
- every old floor still present and at least as late;
- every old rejection kept exactly;
- the date position and refusal count never going down.

**The date set is never re-fixed.** The source must already have a date set, because its accepted slot has to be in it (`:16`). The controller fixes a set only when there is none (`job.js:444`).

**Late-run guards, from reading the whole of `job.js`:**
- **No fourth date:** the date is taken from the preserved set at the current position. Running off the end gives EXHAUSTED (`:445`).
- **No earlier slot:** floors are only ever raised (`:450`). An earlier last slot moves on to the next date instead of being chosen (`:451`).
- **Refusal limit kept:** a refusal adds to the list, the count and the position (`:343`). The preserved count leaves less room before the refusal limit of 5 (`:344`).
- **Contact continuation still works:** the slot-sending check stays consistent, because the floor equals the chosen slot's start when it is sent (`:113-116`).

**Storage and resume.** Nothing in `job.js` lowers or clears these five fields. Every saved fourth-task state therefore keeps passing validation, which runs again on every session and resume (`cart-transfer.mjs:59-63`). A hand-edited version that lowers them fails closed; the C174 test checks all five such edits.

**Old rejections cannot cause false stops.** Rejections carry generation numbers from the old checkout session, which the new session cannot compare against. In practice this never matters: a refusal always moves to the next date (`:343`) and dates in the set are unique. Preserved rejections therefore always belong to dates already passed, and the checks at `:452` and `:116` never meet them.

### Findings
**N1 – Info: limit of the F5 closure.**
- The fourth task inherits the third task's own date set.
- Ordinary transfers (unchanged) still start with no date set, and each re-fixes one when it reaches slot selection.
- So the third task's set may already differ from the set fixed by the first two tasks or the original task.
- The patch does not compare it with earlier layers, and I could not check the real private record.
- If Root means the original launch date set, Codex should confirm that the real third task's set equals the earliest set in the chain. Alternatively, the code could require that.

**N2 – Low: test depth.**
- The C174 test only validates hand-edited records. No test runs the fourth task through slot selection, raises a floor, saves, resumes or reaches EXHAUSTED. The fixture's fake browser accepts only `checkout` commands, so it cannot get that far.
- The fixture's source also cannot arise from the controller: its position is 1 while the accepted slot is on the first date, and that same slot is also in the rejection list.
- My conclusions above rest on reading the code, not on tests.

**N3 – Info.** The untouched-failure counters and the 30-minute window still restart in the fourth task. These are not date rules, but the consecutive untouched-failure limit (`job.js:497`) starts again from zero.

**Kept from C-172, not fixed by this patch:**
- **F1:** the runtime still reports a completed write as a failure (`checkout-runtime` unchanged).
- **F2:** the slot-deadline test is still rejected for the wrong reason (test line 26 unchanged).
- **F3:** the basis check is still missing.
- **F4:** the marker still records only constant `true` attestations.

The hold, size and reconnection limits also stay as documented:
- **Size:** the five copied fields add negligible size; each layer still stores the old record three times.
- **Hold:** preserving the floor makes it likely that the fourth task picks the same last slot the old task accepted. If Apple still holds that slot, this sharpens the risk of a second concurrent hold. Only the operator's attestation addresses it.

### Real evidence versus FAKE data
All test sessions, merchant pages, bag documents, dates and attestations are FAKE. No Apple page, account or private record was read. The verification record states nothing is deployed and no real order is verified.

### Disclosures
- **No compaction** occurred during C-175. The one during C-172 was disclosed in that report.
- **Size cap:** `job.js` was too large for one read, so I read it in two contiguous parts (lines 1–424 and 425–508).
- **Not read this round:** `browser-session`, `checkout-runtime`, the worker, `owner-lease`, `pre-final-restart.js`, `chrome-port`, the c146/c084 tests, `process_tree.py` and `verify_candidate_manifest.py`. My statement that only the controller in `job.js` changes these fields relies on hashes and on my C-172 reads.
- **Hash comparison:** it uses the C-171 hashes I recorded in C-172, not a fresh read of the C-171 manifest. I ran no git command.
- **Clean run:** no permission denials, errors or timeouts.
- **Usage:**
  - About $1.1 of $4 shown, over 14 tool calls.
  - The model is self-reported as claude-opus-5-5; I cannot see the effort level.
  - External modelUsage, trace and cleanup govern acceptance.

**Checkpoint:** C-175 is complete. Optional next steps for Codex:
- N1: confirm the real third task's date set against the earliest set in the chain.
- N2: add a test that runs the fourth task through slot selection and resume.
- Address the carried C-172 F1–F3.
