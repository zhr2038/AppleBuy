# C-232 review report: C231 native REVIEW compatibility

**Verdict: AGREE.** This covers only the C231 candidate. I found no material findings. This is a reviewer verdict, not acceptance. I didn't edit any files.

## Command results (each run once, in order, in the foreground)

1. `python -B tools/delegation/verify_candidate_manifest.py docs/reviews/C-231-candidate-manifest.json`
   - Returned `ok:true`, 338 files, SHA256 `17025b03…3110b2d`, no mismatches.
2. `node --test` on the five test files the sheet lists.
   - 58 tests, 58 passed, 0 failed, 0 skipped.
   - All 8 C231 tests passed, along with the C204, C205, C207, C209, C212 and C229 tests.
3. `python -B tools/delegation/run_review_checks.py docs/reviews/C-231-candidate-manifest.json`
   - Completed all 5 ordered checks with exit code 0. No timeouts, and cleanup was confirmed each time.
   - The manifest matched before and after the checks.
   - Test counts: 108/108, 70/70 (Python) and 1890/1890 passed.

## What I read in this session

Read in full to the end of the file:
- `docs/tasks/C-232-…md` and `docs/tasks/C-231-NATIVE-REVIEW-COMPATIBILITY.md`
- `docs/reviews/C-231-current-review-evidence.json`
- `web/checkout-connector/page-program.js` (1–744)
- `web/checkout-connector/r2-protocol.js` (1–25)
- `test/checkout-c231-native-review.test.ts` (1–33)

I also used two read-only searches of unchanged code:
- Every place the two version strings are used.
- Uses of `bag-items` and `currentReviewProgress` in the C204 and C209 tests.

## What I checked

**Purchased item still has to be proven** (`page-program.js:169-175,182,198-199,401`)
- The native-list check only applies on the secure checkout page, when there is exactly one usable 立即下单 button and at least one `ol[data-autom="bag-items"]`. Hidden lists are counted too.
- Once a list is present, the item check has no fallback to the generic text check (`:175`). It fails if any of these is wrong:
  - not exactly one list, or the list is hidden;
  - not exactly one child, the child isn't an LI with `data-autom` `bag-item-N`, or the item is hidden;
  - not exactly one visible title matching the planned SKU;
  - another `.rs-iteminfo-title` anywhere in main;
  - add-on child containers that aren't empty;
  - more than one "iPhone" in main's full text, hidden text included.
- The title is the only accepted product mention (`:182`). So the parent block that combines title, quantity and price adds no second product.
- Quantity still comes only from the explicit 数量 text or control (`:204-208`). The total parsing (`:211-222`) is unchanged.
- No-extras (`:401`) uses the native item count. Visible markers or a second quantity line still force extras to true.

**Payment provider** (`:448-457`)
Only two things were relaxed:
- The caption can be 付款方式 or 付款详情.
- The Alipay image can sit anywhere in the same cards block, as long as that block has exactly one H3 (hidden ones are counted).

All the other negative checks remain:
- one billing section;
- one image in main, with the image class and alt text 支付宝;
- exactly one image in the section;
- no inputs or selects in the section, and no radios, checkboxes or selects anywhere in main;
- no dialog;
- no 微信, 分期, 信用卡 or 银行卡 text in the section.

**`_s` query tolerance** (`:29`, used at `:446,507,509,523`)
- If the address isn't identical, both addresses must:
  - have the path exactly `/shop/checkout`;
  - have no username, password, port or fragment;
  - have at most one query key, and only `_s`;
  - have the same origin.
- The same main element, `intervened===false`, the stage, `finalSent`, and the task and plan checks are all still required.
- The saved trace address is never rewritten, no trace field is cleared, and no new way to re-create the trace was added. The existing guard at `:686` still stops a second slot attempt.
- Where the address must match exactly (`:240,537,595,640`), it still must.
- One check got stricter: `:513` now marks the trace as intervened when the flow returns to the slot, fulfillment or bag steps under a different `_s`.

Reasoning from the code, not a captured cause: under C230, a changed `_s` meant the programme's own Alipay radio click wasn't recognised as its own. That click fires trusted input/change events, so the trace was marked as intervened and the stage never advanced. That would produce the same three trace codes the live run reported.

**Final, pending, history and unpaid rules are unchanged**
- `submitOrder` (`:725-727`) and the unpaid-order rules (`:316-317,325`) are the same as in the accepted code.
- In `r2-protocol.js`, only `R2_VERSION` changed. The mutable-field list and the final-marker guard are identical.
- Both version constants are only used through imports (`checkout-rpc-peer.js:37`, `expired-*-restart.mjs`, `checkout-runtime.mjs:45`, `r2-browser-run.mjs:35`, `r2-executor.js:18`). An extension still running the C229 build will be refused, not run.

**Tests**
- The C204 fixture uses the same native list (`checkout-c204-native-review.test.ts:21`). So the C204 tests for duplicate lists, a second item, a hidden list, the wrong SKU, quantity two, and provider cases now run through the new list check, and they pass.

## Non-blocking notes

- **N1:** The two positive C231 tests only check `reviewProgress` from the page program. The six negative tests check that `currentReviewProgress` returns null through `ChromePort`, but no matching positive test runs the real layout through that same path. From the code:
  - five negatives fail in the page program for the intended reason: item count, title, extras marker, provider image, or `_s` rule;
  - the foreign-task negative fails at `review-progress.js:13`.
- **N2:** I confirmed the `_s` rejections for a fragment, port, credentials, a different host, a different path and a repeated `_s` by reading the code only. The tests only cover a foreign query key.

## Limits

- **FAKE tests only.** The C231 test loads Playwright from the Codex runtime cache under the home folder. It launches the installed Chrome headless with a new temporary profile, not the personal browser, and blocks every non-loopback request and websocket. There was no Apple traffic, order, payment or slot hold, and no live order is accepted.
- **Live evidence is Codex's.** The real-page facts come from Codex's sanitized observation, which I didn't see myself.
- **Cause not captured.** The historical event and main-element cause wasn't captured. If the live page replaces main between steps, C231 will still stop with `document-changed`.
- **Paused run cannot continue.** Its existing trace is marked as intervened and stays refused. Nothing clears it and there is no generation 3. Finishing it needs a new explicit human decision.
- **No `git diff`.** It isn't one of the allowed commands. I compared against the C230 code from my earlier C-230 review (this session resumed after its context was summarized), and the full file set relies on the manifest scripts.
- **Requirements not re-read.** I didn't re-read `requirements.md` in this session, so I'm not giving an R01–R10 mapping. The change only affects REVIEW-step evidence and trace continuity.
- **Caps self-reported.** The model is claude-opus-5-5; I can't confirm the max effort setting myself. Spend so far is about USD 1.42 of 8, and I didn't measure elapsed time.
- **No problems to report:** no permission denials, no tool errors, and no source, report or `.claude` changes.
