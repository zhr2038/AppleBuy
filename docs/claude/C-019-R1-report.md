# C-019-R1 delivery report — unknown cart scope never falls back to checkout authority (Claude, claude-opus-5-5)

Status: implemented and tested locally. **Not self-approved.** Codex still has to check the failure paths independently and confirm consistency with the precise current source. `REAL_PURCHASING_READY=false`. There is no new order, slot-hold or payment authority. Native and live structures, refusal contracts and order contracts are all unverified.

## 1. Defect and fix

**Defect (Codex's findings, reproduced here before any edit: protected reviewer 13/15).** In the initial C-019 source, `bag` became `null` when `ol[data-autom="bag-items"]` was duplicated or hidden. The generic decoder then read unrelated visible prose, such as the title, `数量：1` and the total, as item and quantity proof. The legacy rule of one checkout control then declared BAG, and the legacy checkout branch clicked.

**Fix (only `web/checkout-connector/page-program.js`).** I added one derived flag:

```js
const bagScoped=bagLists.length>0;   // on /shop/bag only; bagLists is unchanged from C-019
```

When `bagScoped` is true but `bag` is null, which means a duplicated or hidden anchor, the page is unknown cart scope. Each changed proof or gate:

| Line | Before | After | Effect on an invalid scope |
| --- | --- | --- | --- |
| `exactProduct` | generic product lines when `!bag` | generic only when `!bagScoped` | model, capacity and colour are null; `itemVerified=false` |
| `qty` | `pageQty` when `!bag` | `null` when `bagScoped&&!bag` | no quantity is borrowed from outside prose |
| `purchase.verified/store/fulfillment` | suppressed only when `bag` | suppressed whenever `bagScoped` | bag prose never proves a store or pickup |
| BAG phase | legacy single-control rule when `!bag` | legacy rule only when `!bagScoped` | phase falls through to `UNKNOWN` (not a verified step) |
| legacy checkout branch | `&&!bag` | `&&!bagScoped` | defence in depth: no legacy click on any anchored bag |

**Effect on the controller.** The unchanged controller treats `UNKNOWN` as an existing STOP phase. It gates `NEEDS_USER`/`unknown` and sends no action. A checkout command on such a page reaches the unchanged final branch and returns `{delivered:false,touched:false,reason:'ActionNotRecognizedForCurrentStage'}`. Authentication detection runs earlier in the phase order, so AUTH stays truthful.

**Unchanged:** the single visible observed cart and every page without an anchor. Behaviour without an anchor is identical to C-018/C-019, including the legacy store and pickup prose rules.

I added two header comment lines. I did not change:
- `job.js`, including the sticky `bagAddStarted` checkout write-ahead line;
- `chrome-port.js`;
- canonical evidence comparison, memo, freshness, document, authentication or private-value rules;
- extras checks;
- single-checkout or pair semantics;
- bounds, grants, or binding/date/floor/refusal logic.

## 2. Changed files

- `web/checkout-connector/page-program.js`: the edits above.
- `test/checkout-c019-scope.test.ts`: new, 3 tests.
- `docs/claude/C-019-R1-report.md`: this report.

No other file was written. The 69 input test/review paths are untouched, including the protected `review/c019-observed-bag.test.ts` and my earlier `test/checkout-c019-observed-bag.test.ts`. Settings, dispatch, permissions, control and HTML are also untouched. No helper or dependency was added.

## 3. Commands actually run (exact strings) and results

1. `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-019-R1-input-candidate-manifest.json`
   - Run before the edits.
   - Result: `{"ok": true, "files": 135, "sha256": "39855f09a527a8494a4f58f9bc9269d01daaf0ecb65e3946fc25c07e71eff3d3", "mismatches": []}`.
   - Not re-run after the edits. `page-program.js` now legitimately differs. The verifier hashes only the files it lists, so it cannot detect the new unlisted test or report.
2. `node --test review/c019-observed-bag.test.ts`
   - Before the edits: 13/15. The two R1 scope negatives failed on `phase === 'BAG'`.
   - After the edits: **15/15**.
3. `node --test test/checkout-c019-scope.test.ts`
   - **3/3**, on the first run.
4. `node --test "test/*.test.ts" "review/*.test.ts"`
   - After the edits: **tests 506, pass 506, fail 0**, cancelled 0, skipped 0, todo 0. That is the 503 input tests plus 3 new.

No other shell command was used. There was no network, browser, extension, CDP, profile, private-data or merchant operation.

## 4. New test evidence (`test/checkout-c019-scope.test.ts`, all FAKE)

**Invalid scope: 5 shapes × 2 checkout layouts** (single control, and the header/bottom pair). The 5 shapes:

- a second empty visible anchor;
- a second anchor containing an identical line;
- a second hidden anchor;
- a hidden anchor with exact outside title/`数量：1`/total/`店内取货`/`取货地点` prose;
- an `aria-hidden` anchor with outside title and quantity prose.

For every combination:

| Layer | Result |
| --- | --- |
| Page decode | `UNKNOWN`, `verifiedStep=false`, `extras=null`; `itemVerified`, `verified`, quantity, model, store and fulfillment all false or null |
| Page command | exactly `{delivered:false,touched:false,reason:'ActionNotRecognizedForCurrentStage'}`, zero clicks |
| Real `ChromePort` + `PurchaseJob` | `NEEDS_USER`/`unknown`, zero actions; stored `pending=null`, `resourceWritten=false`, `bagAddStarted=false` |

**AUTH stays truthful.** An invalid scope plus a password field gives page phase `AUTH`, a positively untouched command and controller `NEEDS_USER`/`auth`, with zero actions.

**Positive controls.**
- The single visible observed cart, in single and pair layout with leading prose, still decodes BAG with `extras=false`. Store and fulfillment stay null, and the checkout command delivers exactly one bottom click.
- The legacy bag without an anchor still decodes BAG with the earlier legacy store/pickup proof and delivers one click.

The existing C-019 integration, restart, lost-reply, sticky-flag and validation tests pass unchanged in the 506/506 run.

## 5. Observed versus synthetic

- **Observed** (supported read-only public observation, `C-019-public-bag-observation.json`), used as structure only:
  - the `/shop/bag` URL;
  - DIV role=main;
  - OL/LI `data-autom` anchors;
  - the H2 title;
  - the `数量` select;
  - the header/bottom `结账` controls;
  - the `总计` pair.
- **Synthetic:**
  - every duplicated or hidden anchor and the outside prose;
  - the leading `商品：` prose;
  - the password field;
  - the legacy page without an anchor;
  - document ids, the clock and all action results.

Neither fake DOM is a real Chrome DOM.

## 6. Reading disclosure

In this invocation I made full Read calls on:

- the task sheet;
- `docs/requirements.md`;
- `C-019-R1-findings.md`;
- `C-019-R1-before-verification.json`;
- `C-019-R1-input-candidate-manifest.json`;
- `C-019-public-bag-observation.json`;
- `review/c019-observed-bag.test.ts`;
- `page-program.js`, `job.js`, `chrome-port.js`;
- `test/checkout-c019-observed-bag.test.ts`.

I did not re-read `page-program.js` after editing; each Edit call matched exact current text. I read the full-suite summary with a Grep of the persisted output file.

## 7. Limits, denials and restore point

- The scope rule applies only on `/shop/bag`, matching the C-019 bag mode. An `ol[data-autom="bag-items"]` anchor on another allowed path (for example `/shop/checkout`) is not interpreted. Those pages keep their unchanged generic decoding and gates.
- Whether Apple's real bag ever renders duplicated or hidden purchased-list anchors is unknown. If it does, the run stops at `NEEDS_USER`/`unknown`, which is safe but halts.
- C-019 limits remain unverified:
  - the real offer and removal labels;
  - the real checkout destination;
  - whether the header and bottom controls are equivalent;
  - the native loaded identity;
  - which run caused the bag transition.
- I hit no permission denial and no provider quota event. About $1.2 of the $5 local budget was used at the time of writing. That is a local cap, not provider quota.
- **Restore point:** working tree with the three files above changed or added on top of the 135-file R1 input (SHA `39855f09…`). The full suite passes 506/506. Nothing is committed or published. Next step: Codex's independent review.
