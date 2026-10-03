# C-019 delivery report — observed one-item official bag (Claude, claude-opus-5-5)

Status: implemented and locally tested. **Not self-approved.** Codex has to verify the failure paths independently and needs a review of consistency with the precise current source before acceptance or any human reload. `REAL_PURCHASING_READY=false`. There is no current order, slot or payment authority.

## 1. Design decisions and reasons

The repair adds a bag-scoped decode. It is inert outside the observed structure and leaves every legacy path byte-for-byte equivalent in behaviour. Bag mode is active only when both conditions hold:

- the path is `/shop/bag`;
- `main` holds exactly one `ol[data-autom="bag-items"]`, and that list is visible.

In every other case, including other pages, two lists, a hidden list, or the older test fakes that return `[]` for unknown selectors, the generic C-018 decoder runs unchanged.

### `web/checkout-connector/page-program.js`: changed purchase proofs and action gates

1. **Purchased lines.** The purchased lines are the `LI` children of that list. The item proof needs all of the following:
   - exactly one line;
   - exactly one visible `H2` in that line, whose normalized text equals `model capacity color`;
   - no other visible text matching the product pattern anywhere in `main`, other than the title, text inside it, or its ancestors.

   **Reason:** the previous decoder counted product-prefixed ancestor text, such as `iPhone 18 Pro 256GB 黑色数量1…`, as extra product lines. Two lines or another product text still block.
2. **Quantity.** The existing quantity rule is unchanged, and in bag mode the single visible `数量` control must also lie inside the single purchased line. The hidden select clone is never used because it is invisible.
3. **Total.** The total rule is unchanged. The observed sibling pair `总计` + `RMB 9,999` normalizes to one total line. Any second, different total line still makes the total null.
4. **Unselected inline offer.** Inside the single line, a container counts as an unselected offer only if all of these hold:
   - it is a visible `.rs-inline-recommendation`;
   - its text starts with `添加`;
   - it contains no `移除` button or link;
   - it contains no checked input, checkbox or radio;
   - it is not related to the title (neither containing nor contained);
   - it holds no select.

   Only such an offer's own subtree text is cut out (exact raw `textContent` substring removal) before the AppleCare and trade-in marker test.
   - Every other marker still sets `extras=true`: other textual elements anywhere in `main`, and the line's full text with the offers removed.
   - A removal control in the line other than `移除` or `移除 <exact item>` also sets `extras=true`, as does more than one such control.

   **Reason:** the task states that ordinary recommendation text does not prove a purchased extra. Actual extra lines, conflicts and unrecognized structure keep blocking.
5. **Checkout recognition, and therefore the BAG phase in bag mode.** The checkout candidates are every `button`, `a`, `input[type=submit]` or `[data-autom="checkout"]` in `main` that is named `结账`/`安全结账` or carries `data-autom=checkout`. Hidden candidates are included on purpose. The BAG phase needs one of:
   - exactly one candidate, which is visible, enabled and named `结账`/`安全结账`; or
   - exactly two candidates forming the observed pair: both visible, both enabled, both named `结账`, both with `data-autom=checkout`, one only in `.rs-bag-checkoutbutton-header` and one only in `.rs-bag-checkoutbutton-bottom`.

   The pair is one semantic action, and only the **bottom** control is clicked. Any third control (even hidden), `安全结账` beside the pair, an unnamed `data-autom=checkout` link, or a disabled member means no checkout control. The phase is then not BAG, and nothing is clicked.
6. **Fulfillment and store in bag mode.** `purchase.store=null`, `purchase.fulfillment=null` and `purchase.verified=false`, even when `店内取货`, `取货地点：…` or `Apple 大连恒隆广场；今天取货` appear.

   **Reason:** bag availability prose is not a selected fulfillment or a held date. Legacy pages keep the C-012 F-K rules unchanged.
7. **Checkout action gate in bag mode.** This runs after the unchanged authorization, memo and canonical evidence comparison, and it decodes the current page again. It needs:
   - `itemVerified`;
   - `extras===false`;
   - `totalCny<=plan.maxTotalCny`;
   - a decided control that is still connected, visible and enabled.

   Otherwise the result is a positively untouched failure. The legacy checkout branch is unchanged (`&&!bag`).
8. **Extras on other pages.** REVIEW and all non-bag pages use the unchanged marker and line logic. The offer exclusion applies only when the phase is BAG and bag mode is active.

### `web/checkout-connector/job.js`: one write-ahead line

`if(command.action==='checkout')s.bagAddStarted=true;` sits next to the existing `addBag` write-ahead.

**Reason:** with C-019 a task can now check out a bag it did not fill itself, which is the observed situation. Before this line, such a task could later reach a configured product page and issue `addBag`, which would make two items (R07). The flag is never reset for checkout, so the untouched path keeps it. Nothing else in the controller changed. Not changed: counters, history, digest/tab/plan binding, grants, the pending/deadline logic, refusal freshness and the slot floors.

### `chrome-port.js`

Unchanged.

## 2. Changed files

- `web/checkout-connector/page-program.js`: bag-scoped decode and gates, plus a header line.
- `web/checkout-connector/job.js`: one write-ahead line plus a comment.
- `test/checkout-c019-observed-bag.test.ts`: new, 7 FAKE tests.
- `docs/claude/C-019-report.md`: this report.

No other file was changed. The 67 input test/review files (including the protected `review/c019-observed-bag.test.ts`), the requirements, manifests, tools, settings, extension permissions and HTML were not edited. No helper or dependency was added.

## 3. R01-R10 mapping

| Requirement | How this change relates |
| --- | --- |
| R01 | Exact item, quantity 1 and the price cap are rechecked on the bag at the page (new) and in the job (unchanged `itemMatches`). |
| R02 | Unrecognized bag structure, extra controls and authentication remain explicit blockers. |
| R03 | The observed bag can now progress without redoing configuration. Nothing clears the bag or adds to it again. |
| R04/R05 | Unchanged. Slot logic is untouched, and bag availability prose is not a slot or a hold. |
| R06 | Ambiguous, hidden or disabled controls give UNKNOWN or a positively untouched failure, never success. |
| R07 | One checkout. Write-ahead before the send. A lost or unknown reply is never repeated. There is no addition after checkout. |
| R08 | AUTH remains a human gate, and pending or unknown truth is preserved across restart and a new grant. |
| R09 | FAKE only. No real action was taken. |
| R10 | There is no UI change. Untouched history entries remain explainable. |

## 4. Commands actually run (exact strings) and results

1. `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-019-input-candidate-manifest.json`
   - Run before any edit.
   - Result: `{"ok": true, "files": 134, "sha256": "72923741c7f01f39ad5413c047bc8b6f64ba8834de32f0fe72162734e5fdccf2", "mismatches": []}`.
   - Not re-run after the edits. The two edited source files legitimately differ now. The verifier hashes only the listed files, so it does not detect the two new unlisted files.
2. `node --test review/c019-observed-bag.test.ts`
   - Run after the edits: 12/12 pass.
   - No pre-edit baseline run by me. The 8/12 figure comes from Codex's `C-019-before-verification.json` (489/493 overall).
3. `node --test test/checkout-c019-observed-bag.test.ts`
   - First run: 6/7. My integration test expected `NEEDS_USER` when a fresh start grant was presented at the FAKE AUTH page after the delivered checkout. The controller returned `BLOCKED` instead, with no action.
   - Second run: 6/7. The returned object had no `history` field.
   - After correcting my own test expectations, the final run was **7/7**. I corrected the assertions to `BLOCKED`, no action, pending and `bagAddStarted` preserved, and stored history not shortened.
   - I did not assert or inspect the exact BLOCKED reason string.
4. `node --test "test/*.test.ts" "review/*.test.ts"`
   - Run once after the final edits: **tests 500, pass 500, fail 0**, cancelled 0, skipped 0, todo 0. That is 493 earlier tests plus 7 new ones.

No other shell command was used. There was no network, browser, extension, CDP or profile operation.

## 5. Integration and restart evidence (all FAKE, real `ChromePort` + `PurchaseJob` + serialized program in a VM)

- **Bag to checkout to FAKE AUTH:**
  - The write-ahead `pending` (same id and action) is stored before the send, checked in `beforeAct`.
  - Exactly one bottom-control click; header 0, offer 0.
  - Result: `NEEDS_USER`/`auth`, with pending checkout kept and `bagAddStarted` and `resourceWritten` true.
- **Restart with a fresh start grant at AUTH:** `BLOCKED`, no action. The stored pending, task id and `bagAddStarted` are unchanged, and history is not shortened.
- **Human back to a fresh bag:** `NEEDS_VERIFICATION`, `…no automatic repeat`, 0 clicks.
- **Configured product page:** no action, the Add to Bag click count is 0, and the reason is `…no automatic repeat`.
- **Reply lost after the page ran:** `mutation-transport-lost`, one click. Restarting with a grant at AUTH and then at the bag sends nothing.
- **Reply lost before the page ran:** 0 clicks, and a restart at the bag gives `no automatic repeat` with 0 clicks.
- **FAKE total drift between observe and act:**
  - The result is a positively untouched `OperationEvidenceChanged`, with no clicks.
  - The task is then `BLOCKED bag-conditions-not-verified`.
  - A later configured product page gives `bag-addition-already-started`, with 0 adds. This depends on the `job.js` line.
- **Public-config validation at the bag:** `VALIDATION_STOPPED`, no action, only `VALIDATION_KEY` written.
- **Existing chain preserved:** plan → offered slots → terminal → explicit FAKE refusal → refreshed re-selection → accepted endpoint. This is still covered by the unchanged `test/checkout-job.test.ts`, which passes in the 500/500 run.

## 6. Observed versus synthetic

- **Observed** (Codex's supported read-only public observation, `C-019-public-bag-observation.json`), used as structure only:
  - the URL;
  - DIV role=main;
  - OL/LI `data-autom` and classes;
  - the H2 title class;
  - the `数量` select and the hidden clone;
  - the two `结账` controls with their ids and container classes;
  - the inline offer text and its container class;
  - the `总计` sibling pair;
  - the availability prose.
- **Synthetic:**
  - every action result, navigation, the AUTH page and its URL;
  - lost replies, document ids and the clock;
  - the offer button label `添加`;
  - all adversarial elements (labels marked 合成);
  - the configured product page.

  Neither my fake DOM nor Codex's is a real Chrome DOM.
- **Not verified:**
  - the native loaded identity;
  - the real checkout destination after `结账`;
  - whether Apple's real page has hidden checkout clones (any would block, by design);
  - the real labels of the remove and offer controls;
  - the real structure of a purchased AppleCare child line;
  - which handler caused the observed bag transition;
  - any refusal, date, slot hold or order contract.

  The human pause report is kept as reported. Codex sent zero merchant actions, and so did I.

## 7. Reading disclosure

In this invocation, before context compaction, I used Read on the complete task sheet and the complete versions of:

- `docs/requirements.md`;
- `C-019-observed-bag-findings.md`;
- `C-019-public-bag-observation.json`;
- `C-019-before-verification.json`;
- `C-018-bounded-agreement.md`;
- `C-019-input-candidate-manifest.json`;
- `review/c019-observed-bag.test.ts`;
- `page-program.js`, `chrome-port.js` and `job.js`;
- `test/checkout-page-program.test.ts`.

For those reads I rely on my compaction summary. After compaction:

- the harness re-attached the task sheet, findings, observation and before-verification contents. Those were **not** new Read calls;
- I made full Read calls on `test/checkout-job.test.ts` and `test/checkout-r1-public-configuration.test.ts`;
- I made partial Reads of `page-program.js` (lines 1-125 and 200-239) for editing;
- I did not re-read `job.js` or `chrome-port.js`. The `job.js` edit matched an exact existing line.

I used a Grep of the R01-R10 rows in `requirements.md` for section 3.

## 8. Limitations, denials and quota

- The offer exclusion depends on the observed class `.rs-inline-recommendation` and on text starting with `添加`. If Apple renders the offer differently, the bag blocks (`extras=true`). That is safe but stops.
- Long containers over 180 characters outside the line are not marker-checked. This is the same limitation as the legacy decoder, and the line itself is always checked in full.
- Only the bottom control of the pair is clicked. Whether Apple treats the header and bottom controls identically is not verified.
- There were no permission denials and no provider quota event. The work used a local dollar budget of about $5.4 of $8 by the end of testing. That is a local cap, not provider quota.
- **Resumable checkpoint:** all edits are in the working tree, the full suite passes 500/500, and the next step is Codex's independent review. Nothing is committed: per the task, no commit or push was performed.
