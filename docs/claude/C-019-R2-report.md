# C-019-R2 delivery report (Claude, claude-opus-5-5)

Task: `docs/tasks/C-019-R2.md`. This repairs cross-review finding F1, which Codex reproduced in `docs/reviews/C-019-R2-findings.md`. **This report does not approve itself.** Acceptance belongs to Codex and the independent reviewer. `REAL_PURCHASING_READY=false`.

## 1. Defect

On `/shop/bag`, two kinds of page fell through the phase order to the generic ACCESSORIES branch:

- **Unknown list scope:** the purchased-list anchor `ol[data-autom="bag-items"]` is duplicated, hidden or aria-hidden (`bagScoped=true`, `bag===null`).
- **Ambiguous checkout:** there is exactly one visible list, but the checkout is ambiguous (`bag!==null`, `bag.checkout===null`).

The BAG branch correctly refuses both kinds of page. But when exactly one visible enabled `查看购物袋` control was present, the next line returned `phase='ACCESSORIES'` with `verifiedStep=true`. The controller (`job.js:171`) then sent `viewBag`, and the page clicked it.

## 2. Design decision (minimal) and reasons

Only `web/checkout-connector/page-program.js` changes, in three places:

1. **Line 14:** a provenance header comment for C-019-R2.
2. **Lines 119-121 (decoder):** a C-019-R2 comment, plus a `!bagScoped` guard on the two generic navigation fall-throughs that come after BAG:
   ```js
   else if(!bagScoped&&exact('查看购物袋').length===1)phase='ACCESSORIES';
   else if(!bagScoped&&exact('添加到购物袋').length===1)phase='VARIANT';
   ```
3. **Line 264 (structured action):**
   ```js
   else if(command.action==='viewBag'&&phase==='ACCESSORIES'&&!bagScoped)click('查看购物袋');
   ```

Reasons:

- **One rule, already in the code.** R1 established that `bagScoped` means "this page has committed to the observed cart scope". An anchored bag page is now either the recognized BAG, an earlier human or stage gate (AUTH, CONSENT, PROCESSING and the rest, all unchanged), or UNKNOWN. UNKNOWN is already in `verifiedStep=false`. It is also in the controller STOP set, so it gives NEEDS_USER/`unknown` with no command, no write-ahead (`pending=null`, `resourceWritten=false`) and no bag-addition flag.
- **Both layers are covered by the decoder guard.** A direct structured `viewBag` command now meets phase UNKNOWN. After the unchanged authorized, memo and canonical-evidence checks, it reaches `ActionNotRecognizedForCurrentStage` with `touched=false`. The controller meets the same UNKNOWN and stops.
- **The guard at the click site (line 264) is extra protection.** It ties the only `查看购物袋` click to the same no-anchor condition, even if the decoder order changes later. Today it is redundant with the decoder guard, so no test exercises it on its own.
- **Why VARIANT is guarded as well.** It is the same fall-through, one line later. Without the guard, an anchored unknown cart plus a synthetic `添加到购物袋` control would decode as VARIANT, a product-configuration phase from which `addBag` is reachable. The guard costs one condition and closes that fall-through in the same way. ENTRY needs no guard: its path test (`/shop/buy-iphone/`) cannot match `/shop/bag`.
- **No redesign.**
  - Unchanged: the phase order, BAG/checkout rules, the purchase/extras decode, canonical comparison, memo and delivery truth, slot and details continuation, the private-value rules and all of `job.js` / `chrome-port.js`.
  - No merchant contract is invented. Neither `查看购物袋` nor `添加到购物袋` has been observed on the bag page; they appear only in synthetic tests.

What is preserved:

- **No-anchor accessories:** a page with no anchor (`bagScoped=false`) keeps ACCESSORIES and its one View Bag click. This covers both the reviewer positive with the anchor renamed to `FAKE-legacy-items` and my own positives on the `/shop/bag` and `/shop/buy-iphone/iphone-18-pro` paths.
- **Recognized cart:** a single visible cart still decodes as BAG, because BAG comes before ACCESSORIES, and it checks out exactly once (bottom control of the pair).
- **AUTH:** stays AUTH.

## 3. Changed files

| File | Change |
| --- | --- |
| `web/checkout-connector/page-program.js` | Two comment lines plus three `!bagScoped` guards (lines 14, 119-121, 264). This is the only changed manifest file. |
| `test/checkout-c019-navigation-scope.test.ts` | New. FAKE offline DOM harness modelled on `test/checkout-c019-scope.test.ts`. 4 tests. |
| `docs/claude/C-019-R2-report.md` | New. This report. |

Nothing else was written: none of the other 135 input files, the 70 protected test/review paths, settings, dispatch, permissions, control files or HTML. Nothing was committed.

## 4. New tests (`test/checkout-c019-navigation-scope.test.ts`), all synthetic

The test cases use 12 anchored shapes that are not a recognized checkout bag:

- **Unknown list scope:**
  - second empty anchor (with the pair and with a single control);
  - second hidden anchor;
  - hidden anchor (with the pair and with a single control);
  - aria-hidden anchor (with the pair and with a single control).
- **One visible list with ambiguous checkout:**
  - hidden third `data-autom=checkout` clone;
  - disabled bottom member of the pair;
  - disabled single control;
  - `安全结账` beside the pair;
  - a second visible `结账` beside the single control.

The four tests:

1. **Anchored unknown cart plus `查看购物袋`, for each of the 12 shapes.**
   - Decode: phase UNKNOWN, `verifiedStep=false`.
   - Direct structured `viewBag`: deep-equals `{delivered:false,touched:false,reason:'ActionNotRecognizedForCurrentStage'}`, with 0 clicks.
   - Controller: NEEDS_USER/`unknown`, actions `[]`, 0 clicks, `pending=null`, `resourceWritten=false`, `bagAddStarted=false`.
2. **Anchored unknown cart plus `添加到购物袋`, for each of the 12 shapes.** Same assertions, with a direct `addBag` command.
3. **AUTH gate.** An anchored unknown cart plus `查看购物袋` plus a password field gives:
   - decode AUTH with `verifiedStep=false`;
   - direct `viewBag` not delivered and untouched;
   - controller NEEDS_USER/`auth` with zero actions, `pending=null` and `resourceWritten=false`.
4. **Positives.**
   - No-anchor `查看购物袋` on the bag path and on the entry path: ACCESSORIES with `verifiedStep=true`; direct `viewBag` gives `{delivered:true}` with 1 click.
   - The controller sends exactly `['viewBag']`, clicks once, and then stops at the synthetic AUTH document that follows.
   - A recognized single visible cart (single control and pair) beside `查看购物袋` stays BAG. A `viewBag` there is untouched with 0 clicks. A fresh `checkout` clicks only the bottom control once; the top control and View Bag stay at 0 clicks.

## 5. Commands actually run (only the four allowed strings) and results

| # | Command | Result |
| --- | --- | --- |
| 1 | `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-019-R2-input-candidate-manifest.json` (before any edit) | `{"ok": true, "files": 136, "sha256": "0094ff4f62c852ebebb955097358b546705d01c477940d11610352333d5ac34c", "mismatches": []}` |
| 2 | `node --test review/c019-observed-bag.test.ts` (before any edit) | 20 tests, 16 pass, **4 fail**: the four R2 negatives (ACCESSORIES instead of UNKNOWN; `['viewBag']` instead of `[]`). This reproduces F1. |
| 3 | `node --test review/c019-observed-bag.test.ts` (after the edit) | **20/20 pass**, 0 fail. |
| 4 | `node --test test/checkout-c019-navigation-scope.test.ts` | **4/4 pass**, 0 fail. |
| 5 | `node --test "test/*.test.ts" "review/*.test.ts"` | **515 tests, 515 pass**, 0 fail, 0 cancelled, 0 skipped, 0 todo (duration_ms 5982.612). 515 = the 511 inputs + 4 new. |
| 6 | `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-019-R2-input-candidate-manifest.json` (after the edit) | Exit 1, as expected: `{"ok": false, "files": 136, "sha256": "e2f64c3da4760ca62d4eef42f489a9ed4faa7ba0323a33cf92ed74b534397865", "mismatches": ["web/checkout-connector/page-program.js"]}`. |

Notes on these results:

- **Full-suite output:** it was too large for the tool, so the harness saved it to a file. I read the summary lines and any `✖` lines with a content search; there were no `✖` lines.
- **Verifier after the edit (row 6):** the only listed file that changed is `page-program.js`.
  - The verifier hashes only listed files, so it cannot see the two new files.
  - `e2f64c3d…` is that same listed set with the new `page-program.js`. It is not a manifest that Codex has issued.

## 6. Tests not run, and limits of the tests

- **The new test file was never run against the code before the fix.** I expect it to tell the two apart:
  - before the fix, test 1 would decode ACCESSORIES and test 2 would decode VARIANT;
  - but this was not shown by running it.
  - The reviewer file's 4 failures before the fix (row 2) are the executed demonstration for the ACCESSORIES case.
- **The guard at the click site (line 264) is not exercised on its own.** It is unreachable while the decoder guard holds.
- **No browser, extension, internal page, CDP, profile, network or real Apple page was used.** Native loaded identity, API behaviour and the live DOM remain unverified.

## 7. R01-R10 mapping

| Req | Effect of this repair |
| --- | --- |
| R01 | Unchanged. Product, quantity, cap and store conditions are untouched. An unknown cart cannot be used to advance a plan. |
| R02 | Unknown or ambiguous bag structure is reported as an unrecognized page (UNKNOWN), not as a navigable step. |
| R03 | No unnecessary navigation or click on a cart page whose structure is not recognized. Normal no-anchor View Bag navigation is preserved. |
| R04 / R05 | Unchanged (slot and refusal logic untouched). |
| R06 | Unrecognized structure stays distinct from a verified step: `verifiedStep=false`, no claim. |
| R07 | Zero commands, so there is no write-ahead (`pending=null`, `resourceWritten=false`). Sticky `bagAddStarted` and no-repeat are unchanged. |
| R08 | An unrecognized page and authentication both remain human takeover (NEEDS_USER `unknown` / `auth`). |
| R09 | No real order, payment or slot. Everything is FAKE DOM. The resource-free public validation endpoint (ChromePort/job validation mode) is unchanged. |
| R10 | Unchanged. No interface or text change; the existing `unknown` reason is reused. |

## 8. Real evidence versus simulation

**Observed earlier, public structure only** (`C-019-public-bag-observation.json`, read-only October 3 observation):

- the `/shop/bag` path, `DIV role=main`, the OL/LI anchor, the H2 title;
- the `数量` select;
- the header/bottom `结账` pair with `data-autom=checkout`;
- the inline AppleCare offer, the `总计` pair and the availability text.

The human later reported clearing the cart (`C-019-human-bag-cleared.json`), so the one-item observation is historical.

**Synthetic only:**

- every `查看购物袋` / `添加到购物袋` control on the bag path;
- duplicated, hidden or aria-hidden anchors, and third, disabled or `安全结账` checkout controls;
- the password field and the no-anchor accessories page;
- every command result and controller run.

Not verified: native loaded identity and API behaviour; the checkout, slot, refusal and order contracts; Duo adaptation.

## 9. Residual observation (not changed; outside F1; code reading only, not run)

FULFILLMENT (`findRadio('我要取货').length===1`) comes before BAG in the phase order. For a recognized single visible list with **ambiguous checkout** plus a synthetic `我要取货` radio, the code would behave as follows:

- `purchase.itemVerified` can be true;
- `job.js:174` would pass `itemMatches`;
- the page's `selectPickup` branch would accept it.

For the **unknown-scope** case (`bag===null`), `itemVerified` is false. The controller then gates BLOCKED with zero commands, and the page rejects the command untouched.

No `我要取货` control has been observed on the bag page. I left the phase order unchanged because the task forbids redesign. Whether this needs a separate finding is for Codex or the reviewer to decide.

## 10. Reads in this R2 invocation

**Full numbered Reads before context compaction** (14 files):

- the task sheet;
- `docs/requirements.md`;
- `C-019-R2-findings.md`;
- `C-019-R2-before-verification.json`;
- `C-019-R2-input-candidate-manifest.json`;
- `C-019-Claude-cross-review.md`;
- `C-019-cross-review-verification.json`;
- `C-019-public-bag-observation.json`;
- `C-019-human-bag-cleared.json`;
- `review/c019-observed-bag.test.ts`;
- `page-program.js`;
- `job.js`;
- `chrome-port.js`;
- `test/checkout-c019-scope.test.ts`.

**After compaction:**

- Full Reads again of `page-program.js` (310 lines, before editing) and `test/checkout-c019-scope.test.ts` (102 lines).
- Partial Read of `job.js` lines 150-181.
- Content searches (matching lines only) of:
  - `job.js`;
  - `docs/requirements.md` (the R/A rows);
  - the new `page-program.js` lines;
  - the saved full-suite output.
- After compaction the harness re-supplied the task sheet, the findings and the before-verification text. Those were not new Read calls on my part.

## 11. Permission denials, budget, restore point

- **Denials and budget:** no permission denial and no timeout. No provider quota event occurred. The local USD budget counter is a local estimate, not provider quota.
- **Not done:** no other agent, network, browser, private data, merchant action or commit.
- **Restore point:**
  - Branch `codex/c015-quota-checkpoint-20261003`; nothing is committed.
  - The working tree is the R2 input (136 files, `0094ff4f…`) except for the modified `web/checkout-connector/page-program.js`, plus two new files: `test/checkout-c019-navigation-scope.test.ts` and this report.
  - To undo: restore `page-program.js` to its manifest hash from `C-019-R2-input-candidate-manifest.json` and remove the two new files.
