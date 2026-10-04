# C-044 delivery report: observed official detail route and trustworthy terminal-order handling

Author: Claude Code (primary designer/implementer). Root owns independent reproduction, review and final acceptance. Implementation
and green tests below are NOT acceptance.

## 1. Outcome

- `page-program.js` now recognizes the observed `/shop/order/detail/<seg>/<seg>` address shape both as a read ORDER_DETAIL page and as
  the single receipt detail link, keeps the old single-segment alias, and lets an authoritative native item status
  (`span.rs-od-itemstatus` that is not a pending word, or the `.rs-od-itemsummary-canceled` marker) override any pending prose.
- Root's protected native repro: 4/4 PASS after the fix (1 PASS / 3 FAIL before). C043 2/2, C040 8/8, C039 8/8 native PASS.
  Targeted unit run 95/95 PASS. Full Node regression exited 0, but its counts were not read (section 5).
- `chrome-port.js`, `job.js`, permissions, manifest, dispatcher, README, appearance, old tests and both Root protected native
  regressions were not changed.

## 2. Design decisions and reasons

1. **Fix only the failing layer.** `allowedMerchantUrl` in `chrome-port.js:3` already admits `order(?:\/[^?#]*)?`. Two one-segment
   regexes in `page-program.js` rejected the deep shape: the ORDER_DETAIL phase test and the receipt `detailLinks` filter. One shared
   `orderDetailPath` replaces both, so the read page and the followed link cannot disagree. `chrome-port.js` is not "genuinely
   needed":
   - `lookupOrder` still navigates only `o.orderDetailLink` from the exact verified receipt;
   - the navigation still requires `allowedMerchantUrl` and the origin's existing permission;
   - the lookup is still bounded by the C043 shared 40 × 50 ms wait budget;
   - the lookup still requires ORDER_DETAIL, the exact hash, `purchase.verified` and `slotSummary.verified`.
2. **Narrow address shape.** The regex is
   `^/shop/order/(?:(?!(?:list|detail)(?:/|$))[^/]+|detail/[^/]+/[^/]+)/?$`.
   - It accepts the old alias (one segment, as before) or `detail` followed by exactly two non-empty segments, the observed shape.
   - It rejects `order/list…`, bare `order/detail`, `detail` with one, three or empty segments, two segments without `detail`,
     `details`, `Detail`, `orders/…`, account and sign-in pages.
   - Host and scheme checks are unchanged: https only, `www.apple.com.cn` or `secure[N].www.apple.com.cn`.
   - The one narrowing versus old behaviour: a single-segment alias literally named `detail` is no longer an order address.
   - Nothing is ever constructed from refs. The address is only a gate: confirmation still needs every decoded page fact.
3. **Native status outranks prose.** The observed detail DOM (historical Pro records) carries each item's own state in
   `h2.rs-od-itemtitle > span.rs-od-itemstatus` and marks cancelled items with `.rs-od-itemsummary-canceled`. On an order-detail or
   receipt route that shows pending prose, the page is UNKNOWN when any native status element in `main` (any visibility) is not exactly
   a pending word, or when any cancelled marker exists. UNKNOWN means:
   - no ORDER_DETAIL;
   - `receiptVerified` is false;
   - the lookup returns `unknown`;
   - the job keeps `final-result-unconfirmed; no resubmission`.

   Reasons:
   - Generic page prose (help text, the FAKE conflicting pending prose) cannot be trusted over the item's own native state.
   - Hidden or empty statuses are treated conservatively.
   - A multi-item page with any cancelled item fails closed.

   The guard does NOT rely on the existing sole-product-mention rule. That rule happens to fail Root's FAKE h2 form, which has the
   model plus a status, but it would not fail a status-only h2.
4. **Lazy, route-scoped evaluation.** The guard runs only after pending prose is found on an order or receipt route. Old fixtures
   with hand-made `main` stubs (`checkout-page-program.test.ts:18`, `checkout-c018-evidence-order.test.ts:32`) never reach it, and
   bag/checkout stages are unaffected.
5. **No job change.** The existing job already provides what C-044 requires:
   - it never clears `pending`/`finalIntent` without an independent exact unpaid detail;
   - it revokes the run's start grant on any non-confirmed gate;
   - it BLOCKs a revoked grant;
   - it gates read-only runs at once with no lookup.

   The new tests exercise these paths unchanged.

## 3. Changed files

| File | Change |
|---|---|
| `web/checkout-connector/page-program.js` | Before the phase cascade: `orderDetailPath`, `PENDING`, `nativeNotUnpaid` (with C044 comments). The pending branch is now route plus native guard. The `detailLinks` filter uses `orderDetailPath`. No other line changed. |
| `test/checkout-c044-order-route.test.ts` | New. 53 tests. |
| `docs/claude/C-044-report.md` | New (this report). |

**New test design.** It has two layers.

- **Decoder layer.** The actual `merchantDocument` runs in `node:vm` over a minimal FAKE element tree. The tree supports
  tag/.class/[attr] selector lists and throws on unsupported selectors.
- **Job layer.** The actual `ChromePort` and `PurchaseJob` run over FAKE Chrome. Its `executeScript` runs the exact function the port
  sends (`q.func`) through the same vm decoder and refuses and counts any command. The scenario is a stored row whose one FAKE final
  was sent with an unknown result.

Coverage:

- **Accepted links:** deep address on secure8, www and `secure.` with a trailing slash; the old alias; the same deep link twice.
- **Rejected links (16):**
  - http;
  - `.apple.com`, a look-alike suffix, and a non-Apple host;
  - the order list and a page under it;
  - account and order sign-in pages;
  - bare `order/detail`, and `order/detail` with one, three or empty segments;
  - two segments without `detail`, `details`, `Detail`, `orders`.
- **Link presentation and multiplicity:** wrong text; hidden link; deep plus alias; two different deep links.
- **Detail phase by address:** ORDER_DETAIL only at the accepted shapes; not at list, malformed, account or sign-in addresses; UNKNOWN
  at non-Apple or http addresses.
- **Native terminal scope, at both deep and alias addresses:**
  - observed cancelled status without a model mention;
  - FAKE picked-up wording;
  - Root's model-plus-status form;
  - hidden status; empty status;
  - pending plus cancelled statuses;
  - cancelled marker alone;
  - cancelled status plus FAKE pending help text.

  A receipt carrying a native cancelled status is not verified.
- **Rule-boundary control (labelled FAKE):** a native status that is itself `待付款` does not block. A model mention in that h2 still
  leaves product identity unproven.
- **Job: confirmations (FAKE).** The deep link and the alias link each confirm. Each test asserts:
  - navigations equal `[link]`;
  - reads equal receipt, receipt, detail;
  - 1 wait;
  - 0 commands.
- **Job: deep detail faults (12).** Each gets one navigation and a separate detail read, and stays `NEEDS_VERIFICATION` with pending,
  finalIntent, expiry, history and slot kept. The faults are:
  - observed cancelled status; picked-up (FAKE wording);
  - Root form plus help text; cancelled marker;
  - no pending state (route, title and facts only);
  - no ref; another ref;
  - money but no quantity (no inference from CNY9999); two units;
  - another store; no time; another slot.
- **Job: receipt faults (6), never navigated:** deep plus alias links; list link only; malformed deep link; non-Apple deep link; native
  cancelled status; no ref.
- **Job: authority.** A cancelled detail with a start grant:
  - the first run stays unconfirmed and the grant is revoked;
  - a second run with the same grant is BLOCKED `advance-authorization-cleared-by-human-intervention`, with the sent final kept;
  - read-only reconcile reads once, makes no new navigation and sends 0 commands.

## 4. Pre-fix failures

- **Command 2** (`node review/c044-native-order-route.mjs`), before the edit:
  - `legacy-route-baseline` PASS.
  - `observed-deep-route-with-fake-unpaid-proof` FAIL: start ended `NEEDS_VERIFICATION` (`final-result-unconfirmed; no resubmission`)
    at ORDER_RECEIPT, because no link was retained.
  - `observed-cancelled-native-status-conflicting-fake-pending` FAIL and `observed-picked-up-native-status-conflicting-fake-pending`
    FAIL: both on a deep-equal assertion, the navigations requirement.
  - Overall `passed:false`, guard aborted (blockedDelta 1, serverHits 0), cleanup ok.

  This matches Root's recorded `C-044-independent-findings.json`.
- **Command 1**, run with the new test before the edit: exit code 1.
  - The visible head showed all C023 tests and the C043 tests up to the truncation passing.
  - The visible tail showed C044 job deep-detail negatives failing with `navigations [] !== [DEEP]` (cancelled title/status, cancelled
    marker, no pending state, no ref, another ref, and more).
  - About 19.7 KB in the middle and the final totals were truncated by the harness and not read, so the exact pre-fix C044 pass/fail
    count is unknown.
- **Expected but not separately executed.** Without the native guard, the alias-address "observed cancelled native status" decode
  test would yield ORDER_DETAIL: the alias route was already recognized and a status-only h2 keeps the sole product mention. I did not
  run a mutation build to demonstrate this; it is reasoning from the code, not an observed result.

## 5. Commands and results (after the edit; each its own exact Bash call, no pipes/redirection/filters)

| # | Command | Result |
|---|---|---|
| 1 | `node --test test/checkout-c044-order-route.test.ts test/checkout-c043-lookup.test.ts test/checkout-c023-final-lookup.test.ts` | tests 95, pass 95, fail 0, cancelled 0, skipped 0, todo 0 (C023 11, C043 31, C044 53) |
| 2 | `node review/c044-native-order-route.mjs` | 4/4 PASS; `passed:true`, `completionPassed:true`; see below |
| 3 | `node review/c043-independent-native-lookup.mjs` | 2/2 PASS; guard aborted, blockedDelta 1, serverHits 0; cleanup 2 contexts, no errors |
| 4 | `node test/c040-native-order.mjs` | 8/8 PASS; guard aborted, blockedDelta 1, serverHits 0; cleanup 8 contexts, no errors |
| 5 | `node test/c039-native-pipeline.mjs` | 8/8 PASS; cleanup 8 contexts, no errors |
| 6 | `node --test "test/*.test.ts" "review/*.test.ts"` | The tool reported no non-zero exit (the earlier failing run had shown "Exit code 1"). The output (112.4 KB) was persisted by the harness to a private tool-results file, which I declined to read. Counts, skips and todos are therefore UNREAD and not claimed. Root counts independently. |

Command 2 details, per case:

- **Legacy baseline:** start and consumed-grant `CONFIRMED_UNPAID`; navigations `[https://www.apple.com.cn/shop/order/FAKE-C040-0001]`;
  order read 1.
- **Deep FAKE unpaid:** start `CONFIRMED_UNPAID` in the first run; navigations
  `[https://secure8.www.apple.com.cn/shop/order/detail/FAKE-ORDER/FAKE-LOOKUP]`; order read 1.
- **Cancelled and picked-up:** start `NEEDS_VERIFICATION`; one deep navigation; order read 1.
- **Every case:** orders 1, submit 1, no repeated mutation.
- **Guard:** aborted, blockedDelta 1, serverHits 0. Network: 28 allowed, 1 blocked (the guard). Cleanup: 4 contexts, browser and
  server closed, no errors.

**Not run:** any command outside the six. No browser against a real site, no personal Chrome or extension, no network to Apple.

**Unread output:**
- the middle and totals of the pre-fix command 1 output;
- the full command 6 output;
- the native `result.json` files under `.local`, whose printed paths are not permission.

## 6. R01–R10 mapping

| Req | C-044 effect |
|---|---|
| R01 | Plan identity is unchanged. A recognized address never relaxes product, quantity, cap, store, date or slot. Tests cover no or other ref, missing quantity, two units, other store, missing or other slot. |
| R02 | Only the evidenced official detail address shape is recognized. No SKU, store id, entry or launch claim. Duo remains behind observed approval, not-on-sale, no-pickup and disabled 继续. |
| R03 | No extra navigation or refresh: at most one observed-link navigation per lookup, as before. |
| R04 | Slot selection is unchanged. Confirmation still needs the exact accepted slot. |
| R05 | Unchanged; the real refusal catalog is still EMPTY. |
| R06 | Native terminal state and route-only, price-only or no-pending pages are an unknown order result, never unpaid success. |
| R07 | No resubmission. Pending, final intent, deadline, expiry and history are kept. Read-only reconcile never looks up or navigates. C043 shared bound unchanged. |
| R08 | A non-confirmed final revokes the run's grant. Reuse is BLOCKED and the result needs human verification. |
| R09 | No real order, payment or slot. All runs use FAKE documents, Chrome and backend on owned loopback with the guard. |
| R10 | No UI or appearance change (forbidden by scope). The existing Chinese status text and reason are unchanged. |

## 7. Real evidence versus FAKE

**Observed (Root, normal desktop Chrome, one authorized existing-account login, historical Pro records only):**
- the address shape `/shop/order/detail/[private]/[private]` on secure8.www.apple.com.cn;
- `DIV role=main`;
- title `你的订单详情。`;
- `h2.rs-od-itemtitle > span.rs-od-itemstatus` with `取货已取消` (and a picked-up text whose wording is not recorded);
- the `.rs-od-itemsummary-canceled` item marker;
- the product h3, store and price selectors.

**FAKE:**
- all refs and receipts, and every receipt detail link;
- every pending/unpaid prose (the conflicting pending prose beside terminal statuses is a deliberate fault, not an Apple case);
- the `订单号：` label form, quantity `数量：1`, the slot lines, and the picked-up wording `已取货 9月 17`;
- the native `待付款` status in the boundary control;
- documents, Chrome APIs, storage, grants, backend, timing and the clock.

The two FAKE positive confirmations (deep and alias) show only that the software can follow and read the shape. They do NOT show
actual unpaid or actual receipt compatibility.

**What current evidence does establish:**
- A real detail page of this shape can be recognized as an order-detail address.
- A real cancelled or picked-up native state is recognized as not-unpaid and can never confirm.

## 8. Remaining real contracts (missing positive evidence)

1. A real current unpaid detail page: its pending wording, and whether it has a native `rs-od-itemstatus` and with what text. A real
   unpaid native status other than the three pending words would fail closed: UNKNOWN, unconfirmed.
2. A real order receipt after the final, and whether it shows a `查看订单`/`查看订单详情` link of this shape
   (`receiptLinkWithThisRouteObserved:false`).
3. Real product identity on the detail page. The observed h2 (model) plus h3 (full title) would fail the sole-mention rule, so even
   a real unpaid detail would stay unconfirmed until that contract is observed and specified.
4. The real order-reference label format inside `div.rs-od-order-number`, which the hash needs.
5. Real quantity, extras, and pickup date/time rendering on the detail page. Quantity is never derived from CNY 9999.

## 9. Known limitations

- The guard is deliberately conservative. Empty, hidden or unknown native statuses, and any cancelled marker on a multi-item page,
  fail closed.
- The FAKE DOM is minimal (no layout or computed style). The native suites cover the real browser path only with FAKE pages.
- There is no mutation build proving the guard is decisive (section 4).
- C-043 cross-review observations stay open and are not addressed here:
  - no pause/stop check inside the lookup;
  - any rejection is treated as transport;
  - a hung read is unbounded;
  - `job.js:221` catch drops the error class.

## 10. Reads, denials and deviations

- **Inputs freshly read to EOF:**
  - this task and `docs/requirements.md`;
  - C-043 agreement and cross-review JSON;
  - the C-044 manifest, evidence and findings;
  - `job.js`, `chrome-port.js`, `page-program.js`;
  - `review/c044-native-order-route.mjs`, `review/c043-independent-native-lookup.mjs`;
  - `test/c040-native-order.mjs`, `test/checkout-c043-lookup.test.ts`, `test/checkout-c023-final-lookup.test.ts`.

  After a context compaction, parts were re-read: `job.js` 160–225; `chrome-port.js` 85–112; `page-program.js` 28–47, 216–225,
  286–319; the C043 test; and a Grep of `grant` in `job.js` and of R01–R10 in `requirements.md`.
- **Extra public reads:**
  - `test/checkout-c015-evidence.test.ts` lines 1–70;
  - Greps over `test/` and `review/` (detail-route and DOM-library use, `merchantDocument` users, pending words, `querySelector`
    stubs in `checkout-page-program.test.ts`, `checkout-c018-evidence-order.test.ts`, `checkout-c020-cart-stage.test.ts`).
- **No reads of** any private transcript, compaction path, `.local` output, harness-persisted output, credential or customer
  material.
- **Permission denials in C-044:** none.
- **Deviations in C-044:** none. All six commands ran exactly, each as its own call. They ran sequentially except commands 2–5, which
  ran as four parallel separate calls. There were no pipes, redirection or filters.
- **History (earlier tasks, disclosed again):**
  - C-043 appended an unauthorized `| grep`, a deviation and not precedent;
  - C-040 had two denied private-output Grep attempts;
  - C-040-R1 exceeded its turn cap.
- **Turns, time and usage:** belong to Root's receipt. The harness cost display may be a resumed aggregate.

## 11. Resumable checkpoint

- **State:** the `page-program.js` edit is complete. The new test and this report are written. All six allowed commands were run after
  the edit. Nothing was committed, pushed or published.
- **Next (Root):**
  - independently rerun commands 1–6 and count command 6;
  - verify the new manifest; only `page-program.js` changed among the 178 inputs, plus the two new files;
  - request original-session exact-source agreement before acceptance or main.
- **Open real contracts:** section 8. A future normal observation of an actual unpaid detail and receipt is required before any claim
  of real compatibility.
