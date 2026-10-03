# C-029-SUMMARY-INTEGRATION delivery report (Claude, implementation)

Model: `claude-opus-5-5` (first-party). The effort setting cannot be observed from inside the session and is not claimed. No agents invoked, no public network, no personal Chrome/desktop/extension/account, nothing published, pushed or committed. **No self-approval: this is a candidate for Codex's independent rerun and review. It does not claim official one-click order readiness. A final unpaid official order still needs current concrete approval.**

## Outcome summary

| Item | Status |
|---|---|
| Semantics assessment of 「1 件商品」 | Done (below). Accepted as a **bounded** quantity provenance `order-summary`; the units-vs-lines question is **not resolved by evidence** and is disclosed with the minimal missing fact |
| Runtime chain: summary disclosure → sanitized count/money → current one-unit conditions → next FAKE checkout action | Implemented in `page-program.js`, `chrome-port.js`, `job.js` and `control.js` (one line) |
| New tests `test/checkout-c029-summary.test.ts` | 38/38 pass on the first run, with no intermediate failures |
| Full suite `test/*.test.ts` + `review/*.test.ts` | 789/789 pass (751 baseline plus 38 new); no protected test changed |
| Approved browser self-check (unchanged script) | 16/16 pass, `realOrderCreated:false`. **It does not exercise the new path**: the reviewer fixture has no summary dialog. Codex owns any harness extension |
| C-028 candidate manifest | Before the changes: `ok:true`, 156 files, `9a82d72b…3c57ff6`, no mismatches. After the changes: `ok:false`, sha `3f986d80…aa8bee`, with exactly the 4 changed connector files mismatched (expected; not hidden) |
| Permission denials | 1 (see Denials) |

## 1. Semantics decision: what 「1 件商品」 can and cannot support

**What the page actually states** (sanitized observation `docs/reviews/C-029-native-summary-evidence.json`):

- The disclosure is a visible `DIV role=dialog aria-modal=true` outside `main`, titled by a visuallyhidden 「订单摘要」.
- It contains exactly one `SPAN.rs-companionbar-items` with the text 「1 件商品」. That span sits inside `P.rs-companionbar-bagitemrow` → `.rs-order-item-details` → `.rs-companionbar-ordertotal` → `.rs-companionbar-ordersummary-section`.
- The money rows read 小计 RMB 9,999, 运费 免费, 总计 RMB 9,999.
- Closing the dialog restores a visible `main` with one summary button.
- Main itself shows one product group, strip and accessible-copy pair, and no quantity control.

**Reading.** 「件」 is a piece classifier, and 「N 件商品」 is a self-labelled count of goods for the whole current order.

- If Apple counts **units**, 「1 件商品」 means exactly one unit.
- If Apple counts **lines**, it means one distinct line whose unit quantity is not stated.

**Unknown:** nothing in the evidence, and no official document, establishes which of the two Apple computes. I do not claim an Apple contract.

**Minimal missing fact:** an authorized normal observation (or an official statement) of the same summary for **one line with selected quantity 2**.

- If it reads 「2 件商品」, the count is a unit count and the summary alone proves one unit.
- If it reads 「1 件商品」, the count is a line count and cannot prove quantity.

**Decision.** The design accepts 「1 件商品」 as quantity provenance `order-summary` only together with conditions that, under the line-count reading, still exclude a hidden quantity of 2:

- **Explicit one-unit money basis (job level).** The order total must equal the money this task recorded while quantity was explicit: the bag total at checkout (`bagTotalCny`, recorded in the checkout write-ahead from a bag page whose 数量 1 was verified), or else the Add to Bag quote (`quotedCny`).
  - This is a *change detector*, not a quantity source.
  - Under the line-count reading it is doing real exclusion work: a 2-unit line would double the total.
  - A task with no recorded basis is **BLOCKED**, never guessed.
- **Defence in depth, which I do not claim as proof:**
  - The plan cap (9999) equals the observed one-unit total, so a 2-unit order also fails the cap.
  - The existing REVIEW check requires `total === quotedCny`.
- **Never used as a quantity source:** price, title, group count, a stale bag flag, or cached hidden text.

If Codex or management judges that the line-count reading makes this insufficient, the minimal change is a single guard. Require the minimal missing fact above before `quantitySource==='order-summary'` may set `itemVerified`. Everything else in the chain stays usable as a diagnostic.

## 2. Design and reasons

Disclosure is ordinary UI reading: open the companion-bar summary, read it, close it. It creates, holds or changes no merchant resource, so it needs no new human confirmation. It is still separate from purchase steps:

- It is a distinct action `readOrderSummary`.
- It is never available to observe, validation (public-config) or rebound read-only ports, nor to an unknown-final lookup.

There is no online model in the path.

### `web/checkout-connector/page-program.js` (`merchantDocument`)

- **Lines 133–198 (decoder).**
  - The main-page quantity is renamed `mainQty`.
  - A summary record `globalThis.__applebuySummary` (isolated world, per document, like the existing `__applebuyExecuted` memo) counts only when **all** of these hold:
    - same `main` element object;
    - same exact URL;
    - age ≤ 15 s;
    - zero visible dialogs (`dialog`, `role=dialog/alertdialog`, `aria-modal`);
    - companion total unchanged;
    - same order-context fingerprint: URL, companion buttons (text/visible/disabled), total, group and strip count, strip/copy text, product lines, iPhone mention count, and whether main shows quantity.
  - If main also shows quantity, the two must agree, otherwise quantity is `null`.
  - New sanitized outputs:
    - `quantitySource` (`main` / `order-summary` / `main+order-summary` / `null`);
    - `orderSummary` (`not-read` / `not-current` / `current`, with count, money and the reader key);
    - `summaryReadable`. This is true only in checkout stages FULFILLMENT–REVIEW, with an exact product, no quantity in main, no visible dialog, exactly one visible enabled companion BUTTON, and a total equal to its caption and within the cap.
- **Lines 283–414 (actor `readOrderSummary`).** Runs only when `summaryReadable` is true and a non-empty `summaryKey` is given, after the existing expected-evidence equality.
  1. Delete the old record and mark `touched`.
  2. Click the companion button and wait ≤ 1.5 s for **exactly one** visible dialog.
  3. Recognize the observed structure strictly. Each of these must be exactly one: title 「订单摘要」, section, item SPAN in the observed ancestry, whole-text match `^\d{1,2} ?件商品$` and occurrence of 件商品 in the dialog, and one row each for 小计, 运费 免费 and 总计.
  4. Click exactly one visible enabled close BUTTON named 关闭/Close.
  5. Wait for zero dialogs and a visible `main`.
  6. Require subtotal = total = current companion total, and an unchanged `main`, URL and main signature.
  7. Only then store the record and return `{goodsCount,subtotalCny,totalCny,shipping:'免费'}`.

  The function returns no text, URL, ID, contact data or storage.

### `web/checkout-connector/chrome-port.js`

- **Option `orderSummary`.** Effective only for an authorized `mode:'purchase'` port. Each port instance gets a random `summaryKey`.
- **`observe`.** Accepts a summary-sourced quantity only if `readBy` equals this port's key **and** this port's last successful read was on this exact `documentId`. Otherwise the quantity is masked to unverified, and `act` refuses (`summaryUsable===false`). This covers restart, a second control page and another port.
- **`readSummary(plan, taskId)`.** Runs on the last observed document only, and returns `{read:true,…}`, `{read:false,touched,reason}`, or throws.

The observe and act `executeScript` argument shapes are unchanged.

### `web/checkout-connector/job.js`

- **Line 24.** `validStored` accepts an optional finite `bagTotalCny`.
- **Line 54.** `maxSummaryReads=30`.
- **Lines 130–141.** A summary read happens only when all of these hold:
  - the page says `summaryReadable`;
  - quantity is not already summary-sourced;
  - the port has the capability;
  - the run is not read-only, validating, rebound or an unknown-final lookup;
  - the task is not awaiting a chooseSlot result on the same phase.

  Each read writes a sanitized `order-summary-read` history entry (read flag, count, total, short reason). A successful read or an untouched refusal re-observes, bounded by the read limit. Anything else stops as `NEEDS_VERIFICATION 'order-summary-not-verified; no purchase action'`.
- **Line 144.** The one-unit money basis check: `BLOCKED 'order-summary-money-differs-from-explicit-one-unit-basis'`.
- **Line 245.** The checkout write-ahead records `bagTotalCny`.

Unchanged:

- write-ahead pending before every mutation;
- pending/unknown reconciliation, no-repeat, the final lookup;
- the existing FULFILLMENT gate `pickup-conditions-not-verified`, which still decides with quantity 2 or 0, or when no summary capability exists;
- authority, pause/stop, and the public-configuration stop endpoint.

### `web/checkout-connector/control.js`

Lines 60–61: the purchase run port gets `orderSummary:!rebind`. Reconcile, observe, prepare and validate ports are unchanged and cannot read the summary.

**Not changed:** `control.html`, the manifest and permissions, `.claude`/`.git`, fixtures, review tests, all existing tests, and requirements/acceptance documents.

## 3. Test coverage (`test/checkout-c029-summary.test.ts`, 38 cases, all SYNTHETIC/FAKE)

The fake dialog follows the sanitized observed structure. Labelled synthetic: the 关闭 close label, every count other than 「1 件商品」, every money change, other dialogs, redraws, clock and restarts.

**Decoder and actor**

- Unread: quantity `null`, pickup untouched.
- Observed `1 件商品`: opened, read and closed once; then quantity 1, source `order-summary`, sanitized output; pickup once.
- Counts 2 and 0: read but never one unit; pickup untouched.
- Unrecognized summaries are closed then stopped (7 cases):
  - wording without a number;
  - split unit;
  - shipping not free;
  - missing title;
  - extra hidden count element;
  - extra hidden 件商品 phrase;
  - count outside the observed ancestry.
- Money mismatches (3).
- No disclosure attempted (0 button clicks) when over cap, the title is wrong, or main already states quantity.
- Hidden pre-rendered dialog that the click does not show.
- Other dialogs: already visible, appearing with the summary, appearing after the read.
- Dialog that does not close.
- `main` changes between open and close.
- Stale record (5): total change, title change, `main` redraw, TTL exceeded (fake clock), and a new document (fresh page instance with no record).
- Main quantity added after the read governs.
- A change between the summary-backed observation and the action leaves pickup untouched.

**ChromePort**

- Observe, default and public-config ports cannot disclose.
- A second port (restart or second page) sees the record as unverified, and `act` throws `CurrentOperationNotAuthorized`.

**PurchaseJob (vertical)**

- A pending `checkout` is reconciled through the summary. With `bagTotalCny` 9999, the acts are exactly `['readOrderSummary','selectPickup']`: pickup clicked once, no repeat, pending cleared, one sanitized history entry.
- Count 2 gives `BLOCKED pickup-conditions-not-verified` after only the read.
- No basis or a differing basis gives BLOCKED.
- An unrecognized summary gives NEEDS_VERIFICATION with no purchase action.
- No capability gives the C028 behaviour (acts `[]`).
- Reconcile mode: no reads.
- Unknown `submitOrder`: lookup only, with no read and no action.

## 4. R01–R10 mapping

- **R01:** one unit, exact product and cap are still enforced. Summary quantity is additionally tied to the explicit one-unit money basis.
- **R02:** the summary is recognized structurally with a fail-closed unknown. Other dialogs or auth stop the read.
- **R03:** removes the C028 permanent FULFILLMENT stop on the observed page shape without a human step; the read is automatic and bounded.
- **R04–R06:** unchanged slot logic. The read is suppressed while a chooseSlot result is awaited on the same phase.
- **R07:** one in-flight mutation, write-ahead and no-repeat are unchanged. The read is not a mutation, never runs during a pending submit, and is bounded (30 per run).
- **R08:** pause/stop is checked before the read path as before. Rebound and reconcile runs never read.
- **R09:** FAKE only. No real order, payment or slot occupancy.
- **R10:** no UI change. The history entry is sanitized; Chinese UI text is unchanged.

## 5. Commands actually run (exact, unchained)

1. `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-028-candidate-manifest.json`
   - Before the changes: `{"ok": true, "files": 156, "sha256": "9a82d72ba377812d3f4e2bf55c28ad8ddd26f1ebee48389ad7d116cef3c57ff6", "mismatches": []}`.
   - Rerun after the changes: exit 1, `{"ok": false, "files": 156, "sha256": "3f986d80a6e2c172f94b7d6faa6aacb134e3336fc81236fefdf4038830aa8bee", "mismatches": ["web/checkout-connector/chrome-port.js", "web/checkout-connector/control.js", "web/checkout-connector/job.js", "web/checkout-connector/page-program.js"]}` (expected).
2. `node --check web/checkout-connector/page-program.js`: no output (pass). It was run after the last `page-program.js` edit; the file was not changed afterwards.
3. `node --test test/checkout-c029-summary.test.ts`: 38 pass, 0 fail.
4. `node --test "test/*.test.ts" "review/*.test.ts"`: tests 789, pass 789, fail 0, cancelled 0, skipped 0.
5. `node review/browser-self-check.mjs`: 16/16 PASS, `"passed":true`, `"realOrderCreated":false`. The result file is under `.local/reviewer/browser-selfcheck-2026-10-03T18-51-03-917Z/`.

There were no intermediate test failures in this task.

## 6. Denials, caps and unrun items

- **Denial (1).** I tried a Bash `grep … | grep … | tail` on my own session transcript to recover the earlier manifest output. It was denied because it was not one of the five approved commands. I did not retry it via Bash. Instead I used the dedicated Grep/Read tools on that same session transcript, which the system had pointed to for pre-compaction details, and then reran approved command 1.
- **Context.** This session was compacted once mid-task; work resumed from the checkpoint without loss.
- **Caps.** The local USD counter read about USD 4.3 of 8 at report time; it is not billing. Turn count and wall time are not reliably measurable from inside the session.
- **Not run or not covered:**
  - No rendered-Chrome test of the summary path (the reviewer fixture has no summary dialog; harness extension belongs to Codex).
  - No real Apple page interaction of any kind in this task.
- **Read scope.** In full: this task sheet, the original prompt, `requirements.md`, the C-028 bounded agreement, cross-review verification and candidate manifest, the C-029 evidence, the five connector files, `review/browser-self-check.mjs`, `review/fixtures/current-public-checkout.html`, and `test/checkout-c028-extra-text.test.ts`. Other existing tests were consulted only for the specific behaviours I needed to preserve, not read in full. No private logs, config, screenshots, input values or account data were read.

## 7. Known limitations (not hidden)

1. **Units vs lines is unproven** (section 1). Under the line-count reading, the one-unit result relies on the explicit money basis.
2. **The close control's label (关闭/Close) was not observed.** The evidence only says one close control exists.
   - If the real control is not a BUTTON with that accessible name, the read fails with `OrderSummaryCloseUnrecognized`, leaving the dialog **open**, and the job stops with NEEDS_VERIFICATION.
   - The same applies when a second dialog appears with the summary: nothing ambiguous is clicked.
   - The job does not act afterwards, so this is fail-closed, but the user then sees an open summary dialog.
3. **Later stages are unobserved.** Whether SLOTS, DETAILS, PAYMENT or REVIEW have the same companion summary is unknown.
   - If the URL changes per stage, the record is not current there and the job re-reads (bounded).
   - If no summary button exists, quantity stays unknown and the existing gates stop.
4. **Untested on real pages:**
   - the 15 s TTL and 1.5 s settle waits;
   - the main-signature equality across open/close (a real page might re-render `main` on close and turn every read into `OrderSummaryContextChanged`);
   - the strict whole-text count pattern.
5. **Chosen money formats.** The record binds to the exact URL. Money parsing accepts only `RMB n,nnn[.nn]`, and shipping only `免费`.
6. **Scope of the money basis.** It is set by this implementation only for tasks that pass checkout after this change, or that have `quotedCny`. Older stored tasks without either are BLOCKED on the summary path.

## 8. Real evidence vs simulation

- **Real (authorized normal observation, sanitized, recorded by Codex/user):** the dialog structure, 「1 件商品」, the 9,999 money rows, 运费 免费, one close control, and `main` restored after close. That is all.
- **Simulation (FAKE DOM/Chrome API, labelled in the test file):**
  - every action result;
  - the close label;
  - all non-1 counts, money changes and extra dialogs;
  - redraws, clock, restart and second-port cases;
  - the whole job chain.

  None of these proves an Apple quantity, slot or order contract.

## 9. Resumable checkpoint

- **Working tree:** the four connector files are modified, and `test/checkout-c029-summary.test.ts` plus this report are new. Nothing is committed.
- **Next steps for Codex:**
  1. Independent review of the semantics decision (section 1) and the open-dialog fail-closed behaviour (section 7, item 2).
  2. An optional reviewer-harness rendered case with the observed summary dialog.
  3. If authorized, a normal read-only observation of the close control's accessible name, and of the qty-2 summary wording (the minimal missing fact).
