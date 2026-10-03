# C-024 delivery report — current checkout summary evidence toward pickup progression

Author: Claude (`claude-opus-5-5`), implementation only. This is not an acceptance. Codex reviews and tests it independently. The full Duo goal remains unproved. No real purchase authority was used or supplied.

## 1. Design and reasons

The business change is limited to `web/checkout-connector/page-program.js`. `job.js`, `chrome-port.js`, UI, permissions, settings and the dispatcher are unchanged.

**Summary total recognized on official checkout only.** The new code is in the decoder, next to `labelledTotal`.

- **Scope.**
  - The host must be `secure[N].www.apple.com.cn` and the path `/shop/checkout[/]`. That is the scope of the October 3 supported read-only observation.
  - Off this scope the widget is ignored. The www host, the bag and other paths keep the labelled-total behaviour exactly.
- **Candidates.** These are all supported controls in `main` (`button,a[role="button"],input[type="submit"]`, hidden ones included) whose `data-autom` is `companionbar-button`.
  - Nothing outside `main` and no non-control element is read.
  - A first draft used a document-wide query. Older protected fakes answer any `document.querySelectorAll` with their links, so it broke 6 C015 cases. The final form reuses the button query the decoder already uses.
- **Evidence.** The total is evidence only when all of these hold:
  - there is exactly one candidate;
  - it is a visible `BUTTON`;
  - its NFKC-normalized caption matches `^显示订单摘要[:：]? RMB <amount>$`, where the amount is either grouped as `\d{1,3}(,\d{3})*` or plain `\d+`, optionally followed by `.dd`;
  - the amount is greater than 0.
- **Ambiguous evidence.**
  - Two widgets, even equal ones, make the checkout total `null`. So does a hidden twin, a hidden widget, another caption, `¥`/`USD`, a `起` suffix, a malformed group, a negative amount or zero.
  - Distinct widgets are never deduplicated.
- **Agreement with labelled totals.** If labelled `总计/合计/…` totals are also present, the existing single-labelled-total result must equal the button amount; otherwise the total is `null`. With no widget, `total` is exactly the old `labelledTotal`.
- **What it does not do.**
  - The summary dialogue (split `小计`/shipping/`orderTotalValue` spans) is never read.
  - The widget never supplies quantity.
  - `purchase.itemVerified` is still `exactProduct && qty===1 && Number.isFinite(total)`, with quantity coming only from the existing explicit `数量` line or select logic.

**Action guards.** These are in the same file, in the FULFILLMENT action branch.

- `selectPickup` additionally requires:
  - a fresh `0 < purchase.totalCny <= plan.maxTotalCny`;
  - no `storeConflict`.
- `selectStore` additionally requires a fresh `0 < purchase.totalCny <= plan.maxTotalCny`.
- Everything else already in place stays: the `expected` digest comparison (stale price leads to `OperationEvidenceChanged`, untouched), the executed-id memo, and the visible and enabled control checks. No disabled control is forced.

**Why this is the minimal design.**

- `job.js` already blocks FULFILLMENT with `pickup-conditions-not-verified` when `itemMatches` is false. It also refuses to reconcile a pending `checkout` without a current item match.
- So recognizing money without quantity cannot open a path. It only moves the residual blocker to quantity, which is the truthful state.
- The page-level guards make a cap or zero violation untouched even if a caller bypasses the job.

## 2. Changed files

- `web/checkout-connector/page-program.js` (modified; the only business file).
- `test/checkout-c024-evidence.test.ts` (new; 25 Claude FAKE cases).
- `docs/claude/C-024-report.md` (this report).

No other input file was edited.

- Not edited: the 82 protected test/review files, including `review/c024-checkout-money.test.ts`.
- Not edited: `docs/reviews/*`, `docs/tasks/*`, `.claude/` and `.git/`.
- No output manifest was produced, because that command was not authorized.

## 3. Acceptance mapping (C-024)

1. **Totals.**
   - The single visible, supported summary button is the current total only on secure `/shop/checkout`.
   - These all give `null` or no authorization: two or more widgets (even equal); hidden ones; outside `main`; non-control elements; dialogue-only values; subtotal captions; other currencies; zero; disagreeing labelled totals.
   - An over-cap total is decoded, but `itemMatches` and the new page guards refuse it.
   - The old `quotedCny` is never used as the current total (test "explicit unit but no current total … stays unconfirmed").
2. **Quantity.**
   - In the observed layout (title, product strip with no quantity, button), `itemVerified=false`.
   - A fresh job stops at BLOCKED `pickup-conditions-not-verified`.
   - After a sent checkout, the job stops at NEEDS_VERIFICATION `mutation-result-unconfirmed; no automatic repeat` with the pending checkout preserved.
   - In both cases the stop happens with zero commands sent. No status is CONFIRMED_UNPAID, EXHAUSTED or NOT_READY, and no stock reason is emitted.
   - These never prove one unit: a hidden `数量：1`, `数量：1件`, prose `共 1 件商品`, or two `数量：1` lines.
3. **Interface positive.** A synthetic `数量：1` plus the matching fresh total, specification and store reconciles the pending checkout and sends exactly one `selectPickup` (`delivered:true`, one click). The following cannot:
   - quantity 0 or 2;
   - an unrecognized quantity;
   - a total over the cap or of zero;
   - Pro Max;
   - a conflicting checked store (4 positively untouched attempts, then `repeated-untouched-failures; human check required`);
   - a stale price.

   This positive is a tested interface. It is **not** evidence that Apple renders a quantity there.
4. **Preserved invariants.** All of these are covered by the unchanged 670 prior tests:
   - the earlier quantity, cart/checkout and date fixes: quantity121, hidden, nested, literal-conflict, ambiguous cart/checkout controls, initial-three dates, terminal floors;
   - the refusal → fresh list → accepted mock progression;
   - the safety invariants: unknown final, no repeat, expiry, grant, lock, pause, auth and read-only.

   All runtime decisions remain local deterministic code. There is no LLM in the purchase path.

### R01–R10

| Req | Effect of this change |
|---|---|
| R01 product/price | Adds current checkout money evidence; cap/zero enforced at page action level too. Not a stock monitor; no availability claim. |
| R02 quantity 1 | Unchanged strictness; summary money never implies quantity. Remains the live blocker at FULFILLMENT. |
| R03 pickup/store | `selectPickup` additionally needs no store conflict and fresh valid total; `selectStore` needs fresh valid total. |
| R04 slot rules | Untouched (initial-three/terminal floors still pass). |
| R05 refusal/fresh list | Untouched (mock progression passes). |
| R06 checkout progression | Advances evidence recognition only; the actual FULFILLMENT progression still stops on missing quantity. |
| R07 no duplicate | No new mutation path; pending checkout preserved; no repeat. |
| R08 pause/human | Store-conflict path ends at bounded human stop. |
| R09 authorization | No new authority; grant/lock/expiry tests unchanged and passing. |
| R10 evidence truth | Observed vs synthetic clearly separated in test headers and this report; no stock/order conclusions emitted. |

## 4. Commands actually run (exact, unchained)

1. `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-024-input-candidate-manifest.json` (before edits) → `{"ok": true, "files": 148, "sha256": "9eff87ea10468fe6beb3a5c7cba09b96685b726f4b1d268d8d32319c2d3f5ac3", "mismatches": []}`.
2. `node --test review/c024-checkout-money.test.ts` → 14/14 pass. Run once with the first draft and again after the final fix; both 14/14.
3. `node --test test/checkout-c024-evidence.test.ts` → first 25 tests, 23 pass, 2 fail (my over-broad `noVerdict` regex matched the correct reason `mutation-result-unconfirmed`; the assertion was fixed, behaviour unchanged). Then 25/25, and 25/25 again after the final fix.
4. `node --test "test/*.test.ts" "review/*.test.ts"`:
   - (a) First draft, foreground, exit 1; output truncated by the tool.
   - (b) Same draft, foreground again with a longer timeout, exit 1, truncated again.
   - (c) Same draft, rerun in the background so the full log could be read → 709 tests, 703 pass, 6 fail, all C015 (`test/checkout-c015-evidence.test.ts`, whose fake `document.querySelectorAll` returns links for any selector). This led to the final main-scoped form.
   - (d) Final code, background, exit 0 → **709 tests, 709 pass, 0 fail**. That is the original 670, the 14 independent cases and my 25.

## 5. Reads

- **Full:**
  - the task sheet;
  - `docs/requirements.md`;
  - `docs/reviews/C-023-bounded-agreement.md`;
  - `docs/reviews/C-022-native-quantity-observation.json`;
  - `docs/reviews/C-024-before-verification.json`;
  - `docs/reviews/C-024-input-candidate-manifest.json`;
  - `review/c024-checkout-money.test.ts`;
  - `web/checkout-connector/page-program.js`, `job.js` and `chrome-port.js`.
- **Partial (debugging only):**
  - `test/checkout-c020-cart-stage.test.ts` 160–184;
  - `review/c020-cart-stage.test.ts` 110–131;
  - `test/checkout-r1-public-configuration.test.ts` 265–282 plus grep of `mount`;
  - `test/checkout-page-program.test.ts` 1–40;
  - grep-only views of fake `querySelectorAll`/`one`/`match` helpers across `test/` and `review/`.
- Background test logs were under the session temp output directory.

## 6. Limits, denials and unrun items

- **Permission denials:** none.
- **Not run:**
  - no browser, extension, network or account was used, and no live Apple page was read;
  - no output or candidate manifest was generated;
  - no individual protected test file was run alone (not an authorized command).
- **Cap:** 28 turns / 900 s / USD 5.
  - The local counter showed about USD 3.5 at the final suite run.
  - The turn count was near the limit.
  - Wall-clock time against 900 s was not measured by me and may have been exceeded.
  - The local USD counter is not provider billing.
- **Behaviour nuances to review:**
  - The money rule applies to every phase on secure `/shop/checkout`, but was natively observed only at FULFILLMENT.
  - `¥` captions and the www-host checkout are deliberately rejected or ignored.
  - A widget outside `main` or on a non-control element is ignored rather than treated as a conflict.
  - The labelled-total text deduplication that existed before is retained.

## 7. Real evidence vs simulation

- **Real (supported read-only observation, October 3, reported by Codex; not re-observed by me):**
  - secure checkout FULFILLMENT;
  - a Pro 256GB black title;
  - no explicit quantity in the shipping product strip;
  - one visible `button[data-autom=companionbar-button]` with caption `显示订单摘要： RMB 9,999`;
  - a summary dialogue with split spans whose linkage and quantity are not confirmed.
- **Simulated:**
  - every DOM, id, store, clock and Chrome API in both C-024 test files;
  - all explicit quantities, conflicts, hidden twins and dialogues;
  - the job/port transport.
- **No proof that Apple renders:** any quantity on FULFILLMENT, button uniqueness inside `<main>` across sessions, or a total that is stable after store selection.

## 8. Missing native quantity contract and next executable validation

**Residual for autonomous checkout.** The decoder needs a current, visible, checkout-scoped quantity fact for the single purchased line on FULFILLMENT and later checkout steps. Examples are an explicit `数量 N` text or an enabled single quantity control bound to that line. It must not be a title, one product line, the price, the summary total, the old bag proof or the absence of a badge.

**Where the workflow stops until then:**

- a fresh run stops at FULFILLMENT, BLOCKED `pickup-conditions-not-verified`;
- after a sent bag checkout it stops at NEEDS_VERIFICATION `mutation-result-unconfirmed; no automatic repeat`, with the pending checkout preserved.

No pickup, store, slot or order command is sent.

**Next executable validation.** This comes after the pending Chrome control extension update and the human's native BAG one-unit confirmation. It is a supported read-only observation of the same one-unit FULFILLMENT page, recording sanitized structure only:

- the host pattern;
- whether the companion button is inside `<main>`;
- the count of all `companionbar-button` elements, hidden included;
- the exact caption form;
- any visible quantity token and its DOM anchor relative to the product strip.

Opening the summary dialogue would be a new interaction requiring explicit human or Codex authorization. Only if one is given should the dialogue's line structure be captured.

If no visible quantity exists anywhere in the normal checkout, the business must decide whether some other first-party signal is acceptable. I cannot relax the condition. Encode the result as a FAKE fixture and test before any driver change.

## 9. Restore point

- Branch `codex/c015-quota-checkpoint-20261003`, uncommitted.
- Changes: `page-program.js` (summary-money block near the former single `total` line, plus the `selectPickup`/`selectStore` guards); the new test file; this report.
- To resume: rerun the three test commands above, then let Codex verify the candidate manifest and run its independent review.
