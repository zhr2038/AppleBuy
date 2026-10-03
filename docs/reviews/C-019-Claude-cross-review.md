Checks are finished (the manifest matches and the full suite passes 506/506). The structured cross-review report is below.

# C-019-CROSS-REVIEW report

## Verdict

**`verdict`: `DISAGREE`**

All the listed focus areas match Codex's bounded offline milestone except one. The task requires that unknown scope produce zero commands in both layers. I found a synthetic but reproducible condition where an invalid cart scope still makes the controller send one `viewBag` command, which the page carries out (finding F1). The effect is small: one click on a control named `查看购物袋`, no addition, checkout, slot, order or payment, and no repeat. But it does break the "zero commands" requirement, so I cannot agree. I found this by reading the source, not by running it: the read-only profile lets me neither write nor run a new test.

## Candidate

- **Files:** 136
- **SHA256:** `43023e74c1fd0d19a688f099f1492a971a3e39d2ecf9e08755e1643a999b8722`
- **Verifier result in this run:** `{"ok": true, "files": 136, "sha256": "43023e74…8722", "mismatches": []}`
- **Superseded:** the 135-file `050df4aa…`/500 result is history only and is not used to approve anything.

## Reviewed scope

- **Changed source, all of it:**
  - `page-program.js` (309 lines): the bag mode block, the R1 `bagScoped` gates, phase order, the extras block, and both checkout branches.
  - `job.js` (241 lines): the C-019 sticky checkout write-ahead line and how it interacts with the pending, untouched and `dispatched:false` paths.
- **Unchanged constraints:** `chrome-port.js` (42 lines): the act and expected-evidence contract, untouched pass-through, and the public-config mutation refusal.
- **Tests:** the five required test and review files.

This is not a review of the whole repository.

## Fresh Read calls in this invocation

Every file below was read in full with a numbered Read.

**Before this session's context compaction:**
- the task sheet;
- `docs/requirements.md`;
- `C-019-R1-candidate-manifest.json`;
- `C-019-independent-review.md`;
- `C-019-implementation-trace-audit.json` (541 lines);
- `C-019-public-bag-observation.json`;
- `C-019-public-config-followup.json`;
- `C-019-human-bag-cleared.json`;
- `C-019-R1-findings.md`;
- `C-019-actual-verification.json`;
- `C-019-R1-actual-verification.json`.

For these I rely on my compaction summary of those real reads. Some of them were later re-attached automatically by the harness; those attachments are not counted as new reads.

**After compaction:**
- `docs/claude/C-019-report.md` and `C-019-R1-report.md`;
- `page-program.js`, `job.js` and `chrome-port.js`;
- `review/c019-observed-bag.test.ts`;
- `test/checkout-c019-observed-bag.test.ts` and `test/checkout-c019-scope.test.ts`;
- `test/checkout-job.test.ts` and `test/checkout-r1-public-configuration.test.ts`.

**Other read-only tools:**
- One Grep of `docs/reviews/C-019-*.json` for `查看购物袋|添加到购物袋|我要取货`. It found nothing.
- One Grep of the saved test output, for the summary and for the C019 test count.

I did not read any raw invocation records.

## Commands run (exact strings)

1. `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-019-R1-candidate-manifest.json`
   - Result: ok, 136 files, `43023e74…`, no mismatches.
2. `node --test "test/*.test.ts" "review/*.test.ts"`
   - Result: **tests 506, pass 506, fail 0**, cancelled 0, skipped 0, todo 0.
   - 25 of the passing tests are C019 tests: 15 reviewer + 7 + 3.

## Findings

### F1: an invalid cart scope can still lead to one `viewBag` command

**Severity:** low. **Status:** blocking, because the task's "zero commands" rule is explicit.

**Source:**
- `page-program.js:117`: the BAG phase test correctly refuses when `bagScoped && !bag`, but the phase order then carries on.
- `page-program.js:118`: `else if(exact('查看购物袋').length===1)phase='ACCESSORIES';` has no `bagScoped` guard. `verifiedStep` is true (line 121).
- `job.js:171`: ACCESSORIES sends `viewBag` with no purchase condition. The write-ahead at lines 213–219 sets `resourceWritten=true`.
- `page-program.js:262`: the `viewBag` branch has no `bagScoped` guard either, so the page clicks.

**Conditions that trigger it (synthetic):**
- the page is `/shop/bag`;
- any invalid-anchor shape from the R1 tests: a duplicated, hidden or `aria-hidden` `ol[data-autom="bag-items"]`;
- one visible, enabled button inside `main` named exactly `查看购物袋`;
- no AUTH, CONSENT, PROCESSING, order, or REVIEW/DETAILS/SLOTS/PAYMENT/FULFILLMENT markers.

For example: `cart()` plus any `invalidScopes` mutation plus `p.main.add(el('BUTTON','查看购物袋'))` in `test/checkout-c019-scope.test.ts`.

**What the source implies would happen (traced, not run):**
- The page reports phase `ACCESSORIES` instead of `UNKNOWN`.
- The controller's actions are `['viewBag']`: one click, `resourceWritten=true`, so the task can no longer be retired.
- Once the 8000 ms deadline passes, the result is `NEEDS_VERIFICATION` with reason `mutation-result-unconfirmed; no automatic repeat`.

**Same cause, valid scope:** a valid single anchor whose checkout controls are unrecognized (a hidden third clone, a disabled member, or `安全结账` beside the pair) also falls through to ACCESSORIES. So C-019's statement that in this case "nothing is clicked" only holds when no `查看购物袋` control is present.

**Evidence status:** the C-019 review JSONs contain no `查看购物袋`, so this structure was never observed on Apple's bag. It is a synthetic DOM, at the same evidence level as Codex's R1 duplicate-anchor negatives. I am not claiming anything about how Apple's pages actually behave.

**Possible fix (not implemented; the implementer chooses):** on `/shop/bag` pages where `bagScoped` is true, stop the phase order from falling through to ACCESSORIES and VARIANT (guard lines 118–119, or classify a failed bag-scoped decode explicitly as UNKNOWN). Add regressions for both the invalid-anchor and the valid-anchor/unrecognized-checkout shapes.

VARIANT fall-through currently produces no command: `nextChoice` is null off product paths, and `variantVerified` needs the product title and spec choices. Guarding it as well would be harmless.

### Focus areas consistent with Codex's milestone

**One item, spec, price cap and extras:**
- Bag mode proves the item from the line's single H2 title, rejects other product text, and requires the single quantity select to sit inside that line.
- The total must be one unique line. The page checks `≤ maxTotalCny`; the job's `itemMatches` also requires a total above 0.
- Extras are true for any marker outside an offer, any marker in the line once the offer text is stripped, more than one line or quantity line, other product text, or an unexpected removal control.
- Because the cap equals the price of the one item (9,999), any paid extra pushes the total over the cap.

**Double checkout control:**
- Hidden candidates are counted on purpose.
- The observed pair counts only if both are visible, enabled, named exactly `结账` and carry `data-autom=checkout`. Only the bottom control is clicked.
- A third control, `安全结账` next to the pair, or a disabled member means there is no checkout control.

**Invalid list scope:**
- With an anchor present, no item, quantity, store, pickup or legacy checkout fact is borrowed from elsewhere on the page, and the legacy checkout branch is guarded by `!bagScoped`.
- In every demonstrated shape, the page layer is positively untouched and the controller sends no action (the only exception is F1).
- An unknown-scope page that shows FULFILLMENT, PAYMENT, DETAILS or REVIEW signals is BLOCKED, because there is no item or purchase match and no accepted slot.

**AUTH truth:** AUTH is tested first in the phase order, and its test passes.

**Fresh evidence at checkout:**
- Order: authorization → memo → canonical comparison → `memo.add` → a new decode gate (item, `extras===false`, cap, and a control that is still connected, visible and enabled).
- `touched` is set immediately before the click.

**Write-ahead and no repeat:**
- A checkout write-ahead sets `bagAddStarted` and it stays set: the untouched path and the `dispatched:false` path reset it only for `addBag`.
- Timeout, restart, lost reply, a fresh grant, or returning to the bag or product page never produce a repeat or a re-add. All of these are covered by passing tests.

**Validation stops first:** `job.js:153` returns `VALIDATION_STOPPED` before building a command, and `chrome-port.js:22` refuses anything other than the product-page choices.

**Preserved state:** history, binding, grants, dates, floors, and refusal/reselection logic are untouched. The test chain plan → two fresh refusals → third terminal slot → accepted → unpaid passes.

### Non-blocking notes

- The R1 report's claim that the phase "falls through to `UNKNOWN`" is conditional (see F1).
- **Phase order (unchanged legacy, and unobserved):** a visible `我要取货` radio on a valid bag would put FULFILLMENT ahead of BAG.
- **First-match text removal:** `strip` removes only the first matching occurrence of an offer's text. The consequence is conservative, because each element is also checked on its own.
- **Reviewer test preservation:** I can only verify the final reviewer-test hash through the manifest. That the original 12 assertions are byte-identical is Codex's own check.

## Corrections to earlier counts and spend

- **Count:** the "67 input test/review files" in my C-019 report is actually **68**. R1 had 69 input paths, and the final inventory has 70 test/review files.
- **Earlier spend figures:** "$5.4 of $8" (C-019) and "$1.2 of $5" (R1) were local estimates only. The `modelUsage` figures of about $91.8 and $93.26 are counters for the resumed session, not incremental billing.
- **This review:** used about $2.1 of the $6 local cap. That is a local estimate, not provider quota.

## Still unverified

- the native installed identity and native API behaviour;
- the real destination after `结账`, and whether the header and bottom controls are equivalent;
- the real offer and remove labels, and the structure of a purchased AppleCare child line;
- whether Apple ever renders duplicated or hidden anchors, or `查看购物袋`, inside the bag's `main`;
- which handler caused the earlier bag transition;
- the human's report of deleting the cart: it rests only on that report, I attribute it to neither program, and the current bag contents have not been observed again;
- refusal, date, slot-hold and order contracts;
- adaptation for Duo;
- `REAL_PURCHASING_READY=false`.

No new addition, slot, order or payment authority exists.

## Denials, quota and restore point

- There were no permission denials and no provider quota event. I made no Edit or Write calls, and there was no network, browser or merchant access.
- **Restore point:**
  - the working tree on branch `codex/c015-quota-checkpoint-20261003` equals the 136-file candidate `43023e74…`, verified in this run;
  - nothing was changed, committed or published during this review;
  - the next step is for Codex to decide on F1 (repair it or explicitly accept it as out of scope) before accepting the milestone.
