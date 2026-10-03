# C-019-R2 cross-review report

## Verdict
**`verdict`: `AGREE`**

This agreement covers only Codex's offline milestone for this repair. F1 is closed: a bag page with a purchased-list anchor that is not a recognized checkout bag no longer becomes ACCESSORIES or VARIANT. No View Bag or Add to Bag command is sent from either the page or the controller.

I found no concrete material violation within the scope the task sheet sets. I wrote the R2 implementation myself, so this is a consistency review, not independent acceptance of my own code. `REAL_PURCHASING_READY=false`.

## Candidate
- **Files:** 137
- **SHA256:** `12c6eeae9220e8e08e610650685e67689897d54d77874b7dbd4e25c91276da41`
- **Verifier result in this run:** `{"ok": true, "files": 137, "sha256": "12c6eeae…6da41", "mismatches": []}`
- **Unchanged files:** in the candidate manifest, `job.js` (`5a49b65f…`), `chrome-port.js` (`247010e9…`) and the protected reviewer test (`8467f13d…`) have the same hash prefixes as the R2 input manifest. So do the two earlier C019 test files (`d3a00dc8…`, `c8b9819f…`).
  - I took the input-side prefixes from my earlier R2 work. I did not re-read the input manifest in this run.
- **Changed and added files:**
  - `page-program.js` changes to `537076f0…`;
  - `test/checkout-c019-navigation-scope.test.ts` (`403cc757…`) is added.
- **Old results:** the 135-file/500-test and 136-file/506-test results are history only and approve nothing.

## Fresh Read coverage in this run
Every file below was read in full with a numbered Read; there were no partial reads.

| Kind | Files (lines) |
| --- | --- |
| Task and requirements | task sheet (34), `docs/requirements.md` (88) |
| Review records | `C-019-R2-candidate-manifest.json` (144), `C-019-R2-independent-review.md` (22), `C-019-R2-actual-verification.json` (284), `C-019-R2-findings.md` (14), `C-019-Claude-cross-review.md` (167), `docs/claude/C-019-R2-report.md` (198) |
| Evidence records | `C-019-public-bag-observation.json` (126), `C-019-current-public-handoff.json` (23), `C-019-human-bag-cleared.json` (15) |
| Source | `page-program.js` (312), `job.js` (242), `chrome-port.js` (43) |
| Tests | `review/c019-observed-bag.test.ts` (161), `test/checkout-c019-observed-bag.test.ts` (163), `checkout-c019-scope.test.ts` (102), `checkout-c019-navigation-scope.test.ts` (132), `checkout-job.test.ts` (133), `checkout-r1-public-configuration.test.ts` (292) |

I also ran two content searches of this run's own saved test output: the summary lines plus any `✖` lines, and a count of C019 tests. Text carried over in the compaction summary is not counted as a read.

## Commands (exact strings, only these two)
1. `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-019-R2-candidate-manifest.json`
   - ok, 137 files, `12c6eeae…`, no mismatches.
2. `node --test "test/*.test.ts" "review/*.test.ts"`
   - **515 tests, 515 pass**, 0 fail, 0 cancelled, 0 skipped, 0 todo (duration_ms 6043.6333). There were no `✖` lines.
   - 34 of the passing tests are C019 tests: 20 reviewer, 7 observed-bag, 3 scope and 4 navigation.

## Checks against the task's focus areas
- **F1 is closed in both layers.**
  - **Decoder (`page-program.js:120-121`):** ACCESSORIES and VARIANT now require `!bagScoped`. `bagScoped` is true only on `/shop/bag` when `main` contains an `ol[data-autom="bag-items"]` anchor.
  - **Controller:**
    - **Unknown list scope** (duplicated, hidden or aria-hidden list): phase UNKNOWN with `verifiedStep=false`. The controller stops at NEEDS_USER/`unknown` before building any command, so there is no write-ahead.
    - **Ambiguous checkout** (hidden third control, a disabled member of the pair, `安全结账`, a second `结账`): the same UNKNOWN stop.
  - **Direct structured command:** after the unchanged authorized, memo and canonical checks, it is reported `{delivered:false,touched:false,reason:'ActionNotRecognizedForCurrentStage'}`.
  - **Test evidence:**
    - the 4 reviewer negatives now pass;
    - the 12 shapes × View Bag/Add to Bag in the navigation test assert zero clicks, `pending=null`, `resourceWritten=false` and `bagAddStarted=false`.
  - **Click-site guard (`page-program.js:264`):** it is redundant today and no test exercises it on its own.
- **Normal paths still work.**
  - With no anchor, ACCESSORIES gives exactly one View Bag click: the reviewer positive, my positives on two paths, and the R1 product→bag flow `[…,'addBag','viewBag']`.
  - A recognized single-control or header/bottom bag still decodes as BAG, because BAG is tested first. Only the bottom control is clicked, once, and a View Bag control beside it gets 0 clicks.
- **One item, spec, cap and extras proof; checkout pair; hidden, duplicate and ambiguous controls:** this logic is unchanged since my earlier review, and every C019 test for it passes.
- **AUTH and human gates:** AUTH is still tested first. The new AUTH cases (anchored unknown cart + View Bag + password field) give AUTH and zero actions.
- **Canonical, fresh and memo checks:** `page-program.js:247-256` is unchanged in content. Only the `viewBag` action condition gained `!bagScoped`.
- **Sticky flag, write-ahead and no-repeat across timeout, restart, untouched and lost reply:** `job.js` and `chrome-port.js` keep their input hashes. The integration, lost-reply and untouched-drift C019 tests and the `checkout-job` tests all pass.
- **History, binding, grants, relative dates, floors, refusal:** untouched. The chain plan → two fresh refusals → third terminal slot → one unpaid order passes.
- **Resource-free public validation:** `job.js:153` and `chrome-port.js:22` are unchanged. The validation tests pass, including "stops at the observed bag with no action or purchase-task write".
  - For an anchored unknown page in validation mode, the STOP check (`job.js:150`) now runs before the validation stop. The result is still zero actions.

## Findings
**Blocking:** none.

**Non-blocking observations:**
1. **The FULFILLMENT route is disclosed, unobserved and not approved for live execution.** FULFILLMENT (`page-program.js:117`) comes before BAG.
   - **Conditions:** on `/shop/bag`, one visible list holds one exact line with quantity 1 and an allowed total, and there is exactly one visible `我要取货` radio. Whether checkout is ambiguous makes no difference: a fully recognized bag behaves the same, and this order predates R2.
   - **What the code would do (read, not run):**
     - `itemMatches` passes (`job.js:174`), so the controller sends `selectPickup`;
     - the write-ahead sets `resourceWritten=true`, and the page clicks the radio (`page-program.js:270`);
     - extras are not checked at that stage. The REVIEW gate (`job.js:202`) still requires `extras===false` and the exact purchase before any submit.
   - **Unknown list scope is different:** with `bag===null`, every earlier stage has no purchase authority.
     - `itemVerified` is false, and `purchase.verified` and `store` are always false/null whenever `bagScoped` is true.
     - SLOTS cannot be reached. FULFILLMENT, DETAILS, PAYMENT and REVIEW stop at BLOCKED in the controller with zero commands, and every page action is rejected untouched.
     - So an unknown list scope sends zero commands in every phase, but the phase is not always UNKNOWN.
   - **Assessment:** this is not the F1 condition. Pickup is the plan's own fulfillment type, and no item is added, no checkout is clicked, and no slot or order is made. Still, no pickup radio has been observed on Apple's bag page, so this route must stay unapproved for live use until the real bag or stage contract is observed.
   - Not every anchored page is UNKNOWN.
2. **What the tests do not prove.**
   - The new author tests were never run against the code before the fix. The executed before-evidence is the reviewer file's 4 failures.
   - Each of those failing loops stopped at its first variant, as Codex's independent review correctly notes.
3. **No byte-diff of `page-program.js` against the rejected 136-file source.** Git is not among the allowed commands. My full read matches the stated change (three `!bagScoped` guards and two comments), but the claim rests on the manifest hashes and Codex's check, not on an independent diff of mine.
4. **Evidence boundary.**
   - **Synthetic only:** every `查看购物袋`, `添加到购物袋` or `我要取货` control on the bag path, every duplicated or hidden anchor, and every extra or disabled checkout control. None of these appears in the observation records.
   - **Historical:** the one-item bag observation, since the human reported clearing the cart.

## Still unverified
- the native installed identity and native API execution;
- real speed;
- the real destination after `结账` and whether the two checkout controls are equivalent;
- the structure of offer, removal and AppleCare child lines;
- whether Apple renders any of the synthetic controls above on the bag page;
- the refusal, slot-hold and order contracts;
- adaptation for Duo;
- approval of the whole repository.

No bag, slot, order, payment or re-add authority follows from this review.

## Denials, quota and restore point
- **Denials and budget:** no permission denial and no timeout. The local USD counter (about $1.3 of the $6 cap) is a local estimate, not provider quota, and no provider quota event occurred.
- **Not done:** no Edit or Write, no network, browser, private data, merchant action, other agent or commit.
- **Restore point:**
  - the working tree on branch `codex/c015-quota-checkpoint-20261003` equals the 137-file candidate `12c6eeae…`, verified in this run;
  - nothing was changed during this review;
  - Codex may accept only this offline milestone. The next authorized step is the read-only Observe of the current product page, with no Start, Resume, Submit, or re-adding an item to the cleared cart.
