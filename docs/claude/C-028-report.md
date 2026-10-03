# C-028-R1 delivery report (Claude, implementation)

Model: `claude-opus-5-5` (first-party). The `xhigh` effort setting is not observable from inside the session and is not claimed as verified. No agents invoked, no public network, no personal Chrome/desktop/extension/account, nothing published, nothing pushed or committed. **No self-approval: this is a candidate for Codex's independent rerun and review.**

## Outcome summary

| Item | Status |
|---|---|
| F1 wrong-product gap (four Codex repro placements) | **Fixed in `page-program.js`**; independent review file 4/4 pass (Codex recorded 4/0/4 before the fix; I did not rerun it before editing) |
| New implementation tests `test/checkout-c028-extra-text.test.ts` | 18/18 pass (one intermediate failure, in my own test shape, described below) |
| Full suite | 751/751 pass |
| F2 browser self-check hardening (`review/browser-self-check.mjs`) | **NOT DONE: write PERMISSION DENIED** by the harness, although the task sheet allows that file. Not worked around |
| Rendered-Chrome versions of the four F1 cases | **NOT RUN**: they depend on the denied self-check edit. F1 is proven in Node fakes only |
| Approved browser self-check, unchanged script | 10/10 pass with the new guard in place |

## F1 design decision and reasons

Root cause: the item rules in `merchantDocument` read only visible `h1,h2,h3,p,span,div` elements of at most 180 characters. The C027 group rule also accepts any ancestor of the strip or copy as "related". So any of the following could sit next to the recognized strip/copy pair and never be counted:

- bare text nodes;
- other element types (LI, STRONG, LABEL, TD, B, EM);
- long text;
- hidden text;
- text inside an ancestor of the copy, such as the H2.

Fix (non-bag paths only), added right after `oneLine` in `web/checkout-connector/page-program.js`:

```js
const mentions=e=>(norm(e?.textContent).match(/iphone/gi)??[]).length;
const anchors=[...new Set(groups.length>0?[strip,copy]:lines(productRe).map(x=>x.e))].filter(Boolean);
const soleMentions=mentions(main)<=anchors.filter(e=>!anchors.some(o=>o!==e&&within(o,e))).reduce((n,e)=>n+mentions(e),0);
```

`soleMentions` is now required by `exactProduct` on the group and generic paths. How it works:

- **Scope of the count:** `main.textContent` includes every text node in main: hidden, bare, any element type, any length.
- **What the anchors are:** the recognized `strip` + `copy` on the secure-checkout group path, or the single outermost generic title line.
- **The rule:** every case-insensitive "iphone" in main must belong to one of those accepted anchors' own text.
  - Nested anchors count once (outermost only), so a duplicate anchor cannot absorb an extra mention.
  - An ancestor that holds the known copy is never an anchor, so it lends no identity to further product text.
- **Why "iphone" rather than the full title:** every model variant is caught, including a different model, a missing capacity, or upper case.
- **Bounded:** one linear text read of main plus at most two anchor reads. It does not depend on selectors, element types or lengths.
- **No data exposure:** only an integer is derived. No page text is returned, stored or logged, and no contact or authentication field is read.
- **Why `<=`:** in a real DOM, main's text contains the anchors' text, so `<=` is effectively equality. Some older flat test fakes have an empty `main.textContent`, and the `<=` form keeps them working without editing protected tests.
- **Unchanged guards:** the real-DOM accessible-title positive (rendered self-check plus the c027 positive), generic ambiguity, missing/current quantity, cap, store, extras and the no-repeat memo. They are all still exercised by the 751-test suite and the 10 rendered checks.
- **Bag path unchanged:** the observed bag legitimately contains other "iPhone" mentions (remove button, AppleCare offer, recommendations). It keeps its structural OL/LI line count and `stray` rule.

## Changed files

- `web/checkout-connector/page-program.js`: the F1 guard (comment, plus 3 lines of code and one changed `exactProduct` expression).
- `test/checkout-c028-extra-text.test.ts` (new): 18 FAKE tree-DOM / FAKE ChromePort tests.
- `docs/claude/C-028-report.md` (this file).
- `review/browser-self-check.mjs`: **unchanged (write denied)**.

### New tests (18)

**Positives:**
- observed one-group shape with the option-label wrapper and explicit1 (delivers selectPickup once);
- generic single title line with explicit1;
- a generic title wrapper holding a non-product child.

**Missing-quantity guard:** still stops.

**Group-path negatives** (each: itemVerified false, model null, delivered false, touched false, 0 clicks):
- hidden SPAN in the group;
- LABEL beside the delivery options;
- bare title in the group's own text;
- bare title in the option wrapper, before and after the fieldset;
- upper-case `IPHONE` in B directly in main;
- other model without capacity in EM;
- TD row outside the group.

**Generic-path negatives:**
- LI title;
- long P with filler (over 180 characters);
- hidden duplicate DIV.

**Nested anchors:** a synthetic shape where strip and copy nest. One extra LI is still detected, which proves the outermost-only dedupe.

**Staleness:** extra text added after the command was prepared makes it stale and leaves it untouched.

**PurchaseJob over the fake ChromePort:** with a bare-title header it ends `BLOCKED` / `pickup-conditions-not-verified`, with no action sent and 0 clicks.

## Exact commands and results (in order)

1. `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-028-input-candidate-manifest.json` (before changes): `{"ok": true, "files": 155, "sha256": "b01f1aa9fc2581a067877f26c755d0fea210dd9578a952dc28cf4351499b0ec5", "mismatches": []}`
2. `node --check web/checkout-connector/page-program.js` (after the edit): no output, exit 0.
3. `node --test review/c028-extra-text.test.ts` (after the edit): tests 4, pass 4, fail 0.
4. `node --test "test/*.test.ts" "review/*.test.ts"` (after the edit, before the new test file existed): tests 733, pass 733, fail 0.
5. `node --test test/checkout-c028-extra-text.test.ts`: **intermediate failure**, tests 18, pass 17, fail 1.
   - Failing test: "nested strip/copy anchors count once" (positive half, itemVerified false).
   - Cause: my test shape, not the guard. `groupLine` requires `norm(strip.textContent)===fullVariant`, and my strip wrapped the option labels.
   - Fix: I rebuilt the synthetic nested shape so the strip's only text is the legend copy, with the labels outside the strip. No production change was made for this.
6. `node --test test/checkout-c028-extra-text.test.ts`: tests 18, pass 18, fail 0.
7. `node review/browser-self-check.mjs` (unchanged script, new page program): 10/10 PASS.
   - stdout: `{"passed":true,"cases":10,"passedCases":10,"result":"E:\\Apple Store\\.local\\reviewer\\browser-selfcheck-2026-10-03T17-25-32-194Z\\result.json","realOrderCreated":false}`
8. `node --test "test/*.test.ts" "review/*.test.ts"` (final): tests 751, pass 751, fail 0.
9. `node --check web/checkout-connector/page-program.js` (final): no output, exit 0.
10. `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-028-input-candidate-manifest.json` (after changes): exit 1. **Expected mismatch, not hidden:**
    - `{"ok": false, "files": 155, "sha256": "167f5e082b90d5f21a6da4ca265d7670279ed442e71f8be8c13ba8d058b0c8d7", "mismatches": ["web/checkout-connector/page-program.js"]}`

The exact command `node review/browser-self-check.mjs` is the only browser command run. No other Bash was used beyond the six approved commands, apart from two `tail` reads of my own background test stdout files under the session temp directory.

## Permission denial, read scope and caps

- **DENIED:** `Write` to `E:\Apple Store\review\browser-self-check.mjs` returned "File is in a directory that is denied by your permission settings". I did not retry through Edit or Bash and did not copy the file elsewhere. As a result, **every F2 item is undelivered**:
  - direct normal-chain proof (1 add / first/second/third terminal choices / exactly 2 refusals / 1 final click / 1 order);
  - FAKE order unpaid status and full field read with an explicit independent-lookup count;
  - specific over-cap and redraw stop evidence;
  - measured page-network counters with honest scope;
  - cleanup derived from successful closes, with a failure artifact and nonzero exit;
  - AUTH check from valid explicit1 with a fresh operation id.

  The current self-check still has the C027 weaknesses: it hard-codes `allOwnedBrowsersContextsServersClosed=true`, swallows close errors, and reuses `FAKE-selfcheck-command` after the qty2 rejection in the AUTH check. A complete replacement was written but rejected by the tool, so it exists nowhere on disk. Its design, for whoever is granted the write:
  - unique command ids;
  - qty2 and AUTH split. AUTH starts from qty=1 with `FULFILLMENT` and itemVerified true, then adds the empty password field, asserts `AUTH`, and sends a fresh id expecting exactly `{delivered:false,touched:false,reason:'ActionNotRecognizedForCurrentStage'}`. A reused id would give touched true and reason `OperationAlreadyDelivered`, per `page-program.js:19-21,299,357-359`;
  - the four rendered F1 placements on fresh qty=1 pages;
  - normal/lost-reply evidence read directly:
    - `#merchant-counts` 1/3/1/1/1;
    - journal `refusal` slotKeys equal to `FAKE 大连直营店|2099-01-01|21:15-21:30` and `…|2099-01-02|21:15-21:30`;
    - `accepted` and `acceptedSlot` equal to `…|2099-01-03|21:15-21:30`;
    - `#order` dataset with status unpaid, `FAKE-order-` id, product id/model/capacity/colour, quantity `1`, total `9999`, store, pickup, and the accepted terminal date/start/end;
    - `只读查单` count equal to the `observe-request`/`lookup-order` journal count;
  - over-cap:
    - all counts 0;
    - merchant step `product`;
    - `#condition` total `10000` with every other condition equal to the plan;
    - preparation failure recorded;
    - 0 engine mutations;
  - redraw:
    - counts add-only;
    - merchant step `slots`, seq `5`;
    - `MANUAL_VERIFICATION`;
    - exactly one `unknown` journal record of kind `chooseSlot`;
    - no slot result;
  - network counters from the context route and WebSocket handlers, with an assertion of 0 blocked requests;
  - cleanup counted per successful close, with errors recorded, `passed=false` and exit 1 on any failure, and `result.json` always written.

  Those redraw/unknown assertions were never executed, so their exact engine end-state values are unverified.
- **Not read, by instruction:** the `.local` result JSON from my own self-check run (it was denied in C027, and I did not work around that). Evidence is stdout only. No private logs, snapshots, account data or real screenshots were read. The self-check wrote its own FAKE screenshots and `result.json` under `.local\reviewer\browser-selfcheck-2026-10-03T17-25-32-194Z\`, and I did not open them.
- **Reads in this task:**
  - the task sheet;
  - the four review JSON/MD inputs and the requirements (read in this session; part of it happened before an automatic context compaction, and the R01-R10 rows were re-read);
  - `page-program.js`;
  - `review/browser-self-check.mjs`, `review/c028-extra-text.test.ts`, `review/c027-renderer-aggregate.test.ts`, `review/c026-purchased-groups.test.ts` (the controller section was re-read), `test/checkout-c026-lines.test.ts`, and the fixture HTML;
  - FAKE journey sources for end-state semantics: `src/app/dom-bridge.ts`, `web/desktop/fixture.js`, `web/desktop/motor.js` (chooseSlot), `web/desktop/app.js` (error reply), and the `src/engine.ts` journal/reconcile lines;
  - the `src/plan.ts` slotKey, and the `src/journal.ts` record header.
- **Caps:** profile 48 turns / 1500 s / USD 8.
  - The local USD counter read about USD 4.07 when this report was written. It is a local counter, not task billing.
  - Turn and wall-clock usage are not precisely observable from inside the session. Both are within the cap as far as I can observe. Codex should take the authoritative values from its own records.
  - No quota or budget exhaustion occurred.

## R01-R10 mapping (this change)

| Req | Effect |
|---|---|
| R01 | Quantity exactly one and an exact planned specification: additional product text anywhere in main can no longer let a non-conforming or multi-item checkout pass as one planned unit. |
| R02 | Unchanged; AUTH stage still recognized (the existing rendered check passed). The fresh-id AUTH proof is undelivered (denial). |
| R03 | No extra refresh/clicks; the check is read-only on the existing read. |
| R04/R05 | Unchanged slot logic; the normal fake journey still passes with 2 refusals (existing assertion only). |
| R06 | An unrecognized or extra-product structure becomes "not verified" (a safe stop), never success. |
| R07 | No-repeat memo unchanged; a stale prepared command is untouched (new test); restart, reload and second-tab checks still pass. |
| R08 | Unverified product leads to PurchaseJob `BLOCKED` with no merchant action (new test), i.e. human takeover. |
| R09 | No real order, payment, slot or account; FAKE only. |
| R10 | No UI change. |

## Known limitations

- F2 is entirely undelivered because of the write denial (see above). The F1 rendered-Chrome cases were not run, so F1 is proven only in Node tree fakes plus Codex's Node review cases.
- F3: the runtime Playwright dependency choice is unchanged. F4: unobserved later-page safe stops remain.
  - The new rule is stricter: if a real FULFILLMENT or later main legitimately contains other "iPhone" text (recommendations, notices, script/style text inside main), the result is an over-conservative safe stop. It can never be a wrong-product pass. Whether that happens on real pages is unobserved.
- The guard counts "iphone" only. A non-iPhone extra line (an accessory) in main is not detected by this count. Extras/AppleCare handling is as before.
- The bag path keeps its structural rule (OL/LI line plus `stray`) and is not covered by the new count.
- `<=` rather than strict equality is used for compatibility with flat fakes (explained above).

## Real evidence vs simulation

- **Real but not Apple:** the fresh headless Chrome run on 127.0.0.1 loopback (Playwright 10/10).
- **FAKE:** every quantity (synthetic `数量：1/2`), every extra title, the authentication field (empty FAKE password input), every order, refusal, slot and merchant. The parser input uses an explicitly FAKE lexical location; the full journeys use the old loopback-only DomMotor.
- **Not tested:** the installed extension, Chrome extension APIs, any Apple page, account or order.
- **Not established:** a real quantity contract, a real slot refusal, or a one-click official purchase.
- **Unchanged and not used:** the old rebound task stays read-only, the old single-Pro authorization was not used, and no new real resources or payment were created.
