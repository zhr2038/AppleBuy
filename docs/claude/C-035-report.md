# C-035 delivery report — verified empty bag to one automatic addition (Claude, claude-opus-5-5)

Status: implementation candidate for Codex review. Not self-approved, not accepted, and not evidence of live readiness.

## Design and reasons

1. **Parser contract: explicit `EMPTY_BAG` phase** (`page-program.js`). It is used only on `/shop/bag` when there is no purchased-list anchor of any visibility: `[data-autom="bag-items"]`, `.rs-bag-items` or `.rs-iteminfos`. All of the following must hold:
   - Exactly one `#bag-content` in main.
   - Exactly one `.rs-bagempty` (a DIV), one `.rs-bag-header` (an H1 whose normalized text is 「你的购物袋中没有商品。」) and one `[data-autom="bag-empty-continueshopping-button"]` (an A reading 「继续购物」 that resolves to `https://www.apple.com.cn/store`).
   - All four are visible, and the scope nests as observed: content ⊃ box ⊃ heading and anchor.
   - `#bag-content` contains no other control.
   - Main contains no checkout control (named or `data-autom=checkout`) and no processing/loading text or alt/aria label.
   - The page shows no visible dialog.
   - No alert. Any non-empty live region must sit inside `#bag-content` and match only the observed removal-notice form.
   - Once the box and any notice are cut out, the rest of `#bag-content` contains no goods, money or quantity words.

   Saved, favorite and recommended products outside `#bag-content` are ignored. Their names and prices never become purchase facts, because `purchase` is all-null on `EMPTY_BAG`. AUTH, CONSENT and PROCESSING keep priority, and an anchored cart stays BAG/UNKNOWN as before. Anything else is UNKNOWN, including a 404, a bare heading, a missing anchor, hidden or duplicate scopes, processing, or a contradictory list.
   - I kept the phase label Root's reproduction expects (it contains `EMPTY`). `verifiedStep` is true, so nothing in that check was weakened.
2. **Consumable, run-local empty proof** (`job.js`). In a purchase run, a fresh `EMPTY_BAG` read creates `emptyProof={documentId,seq,at}` as a local variable. It requires a run that is not validating, not read-only and not rebound, with no pending record and `bagAddStarted===false`.
   - **Never persisted.** Only sanitized history events are stored: `verified-empty-bag {readSequence,at}` and `empty-bag-proof-consumed {emptyReadSequence,addReadSequence}`.
   - **What keeps it.** It survives only reads of the same empty document, or reads of this plan's own product path (`/shop/buy-iphone/<slug>(/x/a)?`) in ENTRY/VARIANT/PRELAUNCH/PROCESSING, within `emptyProofMs=60000`.
   - **What drops it.** Any other read drops it: bag, accessories, checkout, unknown, another path, a new empty document, a stale sequence (which already stops the run), or expiry. Pause, stop, any gate and any restart lose it because it is run-local.
   - **Use at Add.** The C034 gate `retired-cart-holds-earlier-item` is unchanged, except that a current proof lets exactly one `addBag` pass it.
   - **Consumption.** The proof is consumed in the same write-ahead save as `bagAddStarted=true`. Only a positively untouched Add reply restores it.
   - **What it never changes.** `retiredCart`, `retiredHistory`, `history`, `reconcileOnly`, revoked grants and pending/final records are never altered by it.
   - **Started additions.** A task whose own addition already started stops with `bag-addition-already-started; an empty bag does not authorize a second addition` (NEEDS_VERIFICATION).
3. **Ordinary navigation, no invented interface** (`openProduct`).
   - **Write-ahead.** The job writes `openProduct` ahead like other commands, which keeps it restart-safe. It is excluded from `resourceWritten` because it creates no merchant resource. It is also not in `PUBLIC`, so the validation job and the `public-config` port reject it.
   - **ChromePort.** It accepts `openProduct` only in an authorized `purchase` port whose last read was a verified `EMPTY_BAG`. First the page program re-verifies, in that exact `documentId`, that the decode is unchanged; it does this with the structured-command check and writes nothing. Only then does the port call `tabs.update` to the fixed public entry: `https://www.apple.com.cn/shop/buy-iphone/iphone-duo` (C-031 `initialProductPath`) or `/iphone-18-pro` (October 1 probe). This follows the existing `lookupOrder` navigation precedent. The port then polls `tabs.get` (at most 150×100 ms) for a completed product-page tab.
   - **Configuration.** After arrival, configuration uses the existing public steps (configure, continue, Add, View Bag, Checkout).
   - **Not using 继续购物.** I chose not to click 「继续购物」. Its `/store` target is outside the allowed URL set, and the reached page is unobserved.
4. **Pending `openProduct` reconciliation.**
   - Arrival on the plan's product page in ENTRY/VARIANT/PRELAUNCH clears it.
   - While `EMPTY_BAG` or `PROCESSING` is still shown, the job polls within the deadline.
   - Otherwise it drops the record with a `product-page-not-reached` note and stops with NEEDS_VERIFICATION. The next run then starts clean, so a lost navigation never becomes a permanent stop.
5. **Kept protected behavior.** C034 tests pin `HOLDS` with zero actions on a product page that has no current proof. For that reason, after pause, restart, PRELAUNCH wait or expiry, the person reopens the bag page and clicks 「恢复本任务」, which gives a fresh read; the program does not navigate to the bag by itself. That is one click, not a manual addition. A populated predecessor is still BLOCKED. An exact one-item, no-extras BAG still checks out once.
6. **Chinese UI text** (`control.js`, `control.html`, `README.md`):
   - an action name for `openProduct`;
   - explanations of the empty-bag path in the HOLDS, NOT_THIS, preflight, retirement and `retiredCart` notes;
   - help for `product-page-not-reached` and the started-addition stop.

   All C034-asserted substrings are kept.

## Changed files (all within the allowed scope)

- `web/checkout-connector/page-program.js`: the `emptyBag` decoder, the all-null purchase when empty, the `EMPTY_BAG` phase and the write-free `openProduct` re-verification branch.
- `web/checkout-connector/job.js`:
  - `openProduct` added to `ACTIONS`; new `NAVIGATION` set and `productPathOf`;
  - `emptyProofMs`; the proof lifecycle; pending `openProduct` reconciliation;
  - the `EMPTY_BAG` branch; the proof check at Add; consumption and untouched restore;
  - the `resourceWritten` exemption; an updated comment.
- `web/checkout-connector/chrome-port.js`: `PRODUCT_ENTRY`, plus the `openProduct` authorization, re-verification and navigation.
- `web/checkout-connector/control.js`, `control.html`, `README.md` (line 13): Chinese text.
- New: `test/checkout-c035-empty.test.ts` (19 FAKE tests) and this report.
- No old tests, reviewer tools, fixtures, requirements, evidence, manifests, settings or Git were edited.

## Requirements and reproduction mapping

- **R01:** Same fixed plan, one unit and cap. Add is still only at VARIANT with `variantVerified` and a quote within the cap. BAG continuation still requires `itemMatches` and `extras!==true`.
- **R02:** Empty-bag recognition comes only from the observed current structure, and the product entries come from recorded public evidence. Blockers are reported as reasons.
- **R03:** The program never clears or removes anything from the bag. It navigates only from a verified empty bag and otherwise uses the existing normal configuration.
- **R06:** `EMPTY_BAG` is distinct from UNKNOWN, PROCESSING, 404 and BAG. Malformed, hidden, duplicate or contradictory structure is UNKNOWN.
- **R07:** One Add per proof and the proof is consumed. Pending unknown Add/Checkout/final records are kept and not repeated. Stale sequences stop. Restart needs a fresh read. There is no exactly-once claim.
- **R08:** Pause or stop loses the proof. Pending truth is kept. HOLDS and NOT_THIS remain human takeover points.
- **R09:** No real action, and every test is FAKE. No new real order, payment or slot authorization is implied.
- **R10:** Chinese status and action text. History events contain only sequences and timestamps.
- **R04/R05:** Unchanged.
- **Root reproduction:** 2 FAIL / 7 PASS before the change, 9/9 PASS after.

## Actual commands and results

All six commands are the task's exact unchained commands:

1. `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-035-input-candidate-manifest.json`
   - Before edits: `ok:true`, 164 files, sha `a61e3d47…6b855d`, no mismatches.
   - After edits: `ok:false`, sha `e2f8582e…976885`. Mismatches are exactly `README.md`, `chrome-port.js`, `control.html`, `control.js`, `job.js` and `page-program.js`. These are expected and are not acceptance.
2. `node review/browser-c035-empty-repro.mjs` passed 9/9 and cleaned up (9 contexts closed, browser and server closed, no errors). I ran it twice, the second time on the final bytes.
3. `node --test test/checkout-c035-empty.test.ts`:
   - First run: 17 passed, 2 failed. My own expectations were wrong: after View Bag, a mismatching bag is reported by the existing reconciliation as `mutation-result-unconfirmed` (NEEDS_VERIFICATION), not BLOCKED. Both runs still stopped without checkout.
   - I corrected the expectations to the exact existing reasons. The job was not changed.
   - Rerun: 19 passed, 0 failed.
4. `node --test --test-reporter=dot "test/*.test.ts" "review/*.test.ts"`: dots only, no failure marks, exit 0. The reporter prints no totals; counting the printed dots by hand gives 901, which is consistent with 882 + 19.
5. `node review/browser-summary-self-check.mjs`: 8/8 passed with clean cleanup.
6. `node review/browser-retirement-self-check.mjs`: 4/4 passed with clean cleanup.

There were no permission denials, and no turn, time or USD cap was reached. The local counter read about USD 6.6 of 12; that counter is not billing.

## Not run or not covered

- No real Chrome, extension, Apple page, account or cart was used.
- `tabs.update` navigation and `executeScript` during navigation have not been exercised against real Chrome.
- The page program's `openProduct` command branch is not executed by any test. The ChromePort tests use a fake `executeScript`, and the native reproduction covers only the read decode.
- There is no rendered test of the removal-notice live region.

## Known limitations

- The contract is limited to the single observed structure and its exact Chinese text. Any rendering change gives UNKNOWN, which is a safe stop.
- The removal-notice allowance is my own interpretation. The notice text was observed, but where it is rendered was not recorded. A notice outside `#bag-content` gives UNKNOWN until a fresh read.
- The extra busy words (`处理中`, `正在加载`, `加载中`) and the goods/money word screen are my own additions. They can only withhold empty proof, never grant it.
- The 60 s proof bound is my choice. The product page cannot show items added from another tab or device inside that window. If that happens, the post-Add bag has two lines and Checkout is refused. There is still no exactly-once guarantee and no automatic removal.
- After proof loss the person must reopen the bag page and click Resume, because the protected C034 expectations forbid automatic bag navigation.
- A task whose own addition started never adds again even if the bag is verified empty. This existing constraint has no retirement path.
- Behavior change: any purchase-mode task without a started addition now navigates from a verified empty bag to the product page. Previously this stopped with `unsupported-merchant-stage`.
- The Duo is still not released. PRELAUNCH preparation stops NOT_RELEASED, and nothing is forced or enabled.

## Real evidence vs simulation

- **Real:** only Codex's October 3 sanitized normal-Chrome observation (`C-035-official-cart-evidence.json`) and the earlier public entry evidence.
- **Simulated:** the native reproduction is a loopback page holding that sanitized block plus FAKE variations. Every job, port and control test uses FAKE pages, Chrome APIs, storage, clock and authority.
- A mock or a manual Chrome cart test is not an installed-executor one-click order or Duo readiness.

## Next checkpoint

Codex should:
1. Review the six changed files and the new test.
2. Rerun commands 2–6.
3. Decide on the removal-notice allowance, the 60 s bound, and whether a later task may permit automatic bag navigation after proof loss. That change would require changing the protected C034 expectations, which is outside this scope.
4. Produce a new candidate manifest, then obtain fresh-source agreement before any bounded acceptance.
