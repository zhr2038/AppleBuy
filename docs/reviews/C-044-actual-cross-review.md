# Actual original-session C044 final review

Root audited all22 current own Read deliveries and exact180 unchanged map; actual firstParty Opus5.5/xhigh AGREE. Root independently verified1037/24 and decides bounded acceptance. No actual unpaid/receipt/full-goal claim. Original report follows.

# C-044 cross-review: exact-180 bounded software

## Verdict: **AGREE**, with no blockers

I agree that the exact-180 candidate (SHA `71a90f59…394714e`) is acceptable as **bounded software**. It is not evidence of real Apple compatibility, and the full goal is not complete. I can't hash files or run commands, so the 177 protected byte-identical paths, source identity, 1037/1037 Node and the 24 native results are Root's evidence. I did not re-verify them. Root alone decides final acceptance.

## Scope, honestly stated
- **Reads:** I read all 22 required files to EOF with my own Read calls in this call. `page-program.js` was read in two pages, lines 1–408 and 409–508.
- **Compaction:** the conversation was compacted automatically partway through.
  - Files 1–16 were read before compaction. Files 17–22 were read after it.
  - After compaction, the system re-inserted the task sheet and `C-044-actual-verification.json`. I don't count those as my reads.
  - I did not re-read files 1–16 to EOF after compaction. My judgment on them rests on my earlier reads in this call, plus three Grep spot-checks run afterward on the current `page-program.js:222-233,324,326`, `chrome-port.js:18,99-107` and `c044-native-status-isolation.mjs:150,204,226-227`.
- **Tools and actions:** only read-only tools (Read, Grep). 0 permission denials, 0 writes, 0 commands or tests, 0 network access, 0 private, home, log or `.local` result reads.
- **Usage:** the last budget meter shown to me was about $2.53 of the $6 cap. I can't see turns or elapsed time, so I can't confirm I stayed within 32 turns / 900 s. Root's receipt is authoritative.

## What I checked

**Production change** (only `page-program.js`; `job.js` and `chrome-port.js` read fully and unchanged per the manifest hashes):

- **Shared route rule (`page-program.js:222`).** The same regex is used to classify the page (line 233) and to filter receipt links (line 324).
  - It adds the observed detail route `detail/<ref>/<ref>`.
  - It keeps the old one-segment order link, except a segment of exactly `list` or `detail`.
- **Receipt link filter (line 324).** A link is kept only if it is visible, its text is exactly `查看订单` or `查看订单详情`, it uses https, and its host is `www` or `secure\d*` under `www.apple.com.cn`. If more than one distinct link remains, none is used.
- **The change only blocks; it never adds acceptance.**
  - The guard (line 233) can only turn an `ORDER_DETAIL` or `ORDER_RECEIPT` result into `UNKNOWN`.
  - It applies on detail and receipt routes only, and only when the page also shows pending prose.
  - The rule never builds an address and adds no new host.
- **Lookup (`chrome-port.js:99-107`).**
  - It follows only the `orderDetailLink` of the exact verified receipt.
  - It checks the link against `allowedMerchantUrl` and the host permission before navigating.
  - The 40-wait retry limit and the "retry only after a script-injection failure" rule are unchanged.
  - The detail page must show `ORDER_DETAIL`, the exact order-reference hash, and verified purchase and slot. The job then also checks `purchaseMatches` and the exact accepted slot.
- **Native status wins over pending prose.**
  - A detail page counts as not unpaid if any `.rs-od-itemstatus` text is outside the three pending words, or if the cancelled marker is present.
  - That case becomes `UNKNOWN`, so it is not a verified step, `receiptVerified` is false, the lookup returns unknown, and the final order stays unconfirmed.
  - Hidden, empty, unknown and mixed statuses are also blocked, which is the conservative direction.

**The 53 author test cases** (`test/checkout-c044-order-route.test.ts`). The count adds up: 1+16+4+1+8+1+1+2+12+6+1 = 53.

| Lines | Cases | What they show |
|---|---|---|
| 58–65 | 1 | Accepted links: the deep route, a trailing slash, the secure host, the old alias, and the same link twice |
| 66–87 | 16 | Rejected links: http; non-.cn, look-alike and non-Apple hosts; list; under-list; account; signIn; bare `detail`; 1-, 3- and empty-segment detail paths; two segments without `detail`; `details/A/B`; `Detail/A/B`; `orders/…` |
| 88–96 | 4 | Wrong link text, hidden link, deep plus alias, two different deep links → no link kept |
| 97–106 | 1 | Which addresses count as a detail page (`ORDER_DETAIL`) |
| 107–119 | 8 | Cancelled, picked-up (FAKE wording), model plus status, hidden, empty, pending plus cancelled, marker only, cancelled plus pending help text → `UNKNOWN` at both the deep and alias addresses |
| 120–123 | 1 | Native cancelled status on a receipt → `UNKNOWN`, receipt not verified |
| 124–129 | 1 | Boundary: a status that is a pending word does not block, and an extra model mention leaves `purchase.verified` false |
| 158–163 | 2 | Deep and alias links each followed once → confirmed; reads `[CHECKOUT,CHECKOUT,href]`; 1 wait; 0 commands; final intent, expiry, history and accepted slot kept |
| 164–181 | 12 | Followed detail pages that must not confirm: terminal statuses or marker, and missing or wrong pending, ref, quantity, store, time or slot → unconfirmed, with the pending record unchanged |
| 182–193 | 6 | Receipts never followed: deep plus alias, list link, malformed link, non-Apple link, cancelled receipt, no ref → 0 navigations, 0 waits |
| 194–204 | 1 | Cancelled detail: start grant revoked; presenting it again → `BLOCKED`; read-only reconciliation reads once and does not navigate again |

**Older guards.**
- No existing test was changed. The author wrote only the report, the new test file and `page-program.js`.
- `checkout-c043-lookup.test.ts` (31 cases) still pins the 40-wait limit, stop-on-non-transport-failure, the 13 never-confirm cases, the permission and route refusals, and read-only reconciliation.
- `checkout-c023-final-lookup.test.ts` (11 cases) still covers the old one-segment alias, grant handling and the control-page status text.
- C040, C039 and the C043 native files use the old one-segment alias, which is still accepted.

**Cross-author review of Root's two native files.**
- **`c044-native-order-route.mjs`** covers four cases: legacy baseline with the network guard, deep success, deep cancelled, and deep picked-up.
  - It asserts one action path, one exact FAKE order, navigations equal to `[detailHref]`, and that the order page was read.
  - Weakness: its terminal pages use a model-plus-status h2, so product ambiguity alone could also block them.
- **`c044-native-status-isolation.mjs`** closes that gap.
  - Its h2 shows only the status, and the decoder's actual result on the native order page is recorded at line 150.
  - Line 204 asserts `purchaseVerified` true, `slotVerified` true, the exact ref hash, and phase `UNKNOWN`. That shows the status guard alone decides the outcome.
  - It is a synthetic projection, not an observed Apple page. I found no flaw in it.

## Non-blocking notes
1. **The old alias is broad.** Any single segment other than exactly `list` or `detail` is still accepted, for example `/shop/order/details`, `/Detail`, `/listing` or `/account`. Only the multi-segment forms `details/A/B` and `Detail/A/B` are rejected.
   - **My C-044 report §2.2 overstates the exclusions.** It says `details` and `Detail` are rejected, but only the multi-segment forms are. Following such a link is a read-only GET to an allowed host and still cannot confirm without the full detail proof.
2. **`chrome-port.js:103` re-checks only `allowedMerchantUrl`,** which allows any `/shop/order` path. The narrower rule lives only in the decoder. This is pre-existing and unchanged.
3. **The author's vm tests check only the phase** for the status-only cancelled case, not `purchase.verified`. Root's native isolation test supplies that proof.
4. **Line 102 uses `notEqual(ORDER_DETAIL)`** rather than `equal(UNKNOWN)`. That is adequate, just slightly weaker.
5. **Stale comment** at `c044-native-status-isolation.mjs:226`: it says "All 4 …" but the code requires 2. Cosmetic only.
6. **Corrections to my C-044 history:**
   - "C-040-R1 exceeded its turn cap" should read "a reported 60-versus-48 turn counting/enforcement discrepancy". It is not proof of enforcement, and not proof that the run stayed within 48.
   - My earlier "no errors" statement is wrong. Root records 2 Bash tool errors, which were the expected pre-fix RED nonzero exits. "0 denials, 0 command deviations" still stands.
7. **Earlier history still stands:** C-043's unauthorized `| grep`, C-040's private-output Grep denials, and C-040-R1's 14-of-16 read coverage.

## Real versus FAKE
- **Observed, on historical records only:**
  - the `/shop/order/detail/<ref>/<ref>` route;
  - the `你的订单详情。` title;
  - `span.rs-od-itemstatus` reading `取货已取消` inside `h2.rs-od-itemtitle`;
  - the `.rs-od-itemsummary-canceled` marker.
- **FAKE:**
  - the receipt and its link;
  - the unpaid wording, proof and ref format;
  - quantity, slots and extra fields;
  - the picked-up wording;
  - all API, grant, storage, backend and timing behaviour.
- **Still unresolved for a future real unpaid page:**
  - The model-in-h2 plus full-title-h3 layout is a product-identity problem.
  - A real unpaid status worded outside the three recognized tokens would stop as unconfirmed.

I make no claim of real unpaid, receipt or Duo compatibility, an installed personal API, a hold, real speed, or whole-repo or full-goal acceptance.

## Full goal: still incomplete
- The real refusal catalogue is still empty.
- The Duo approval notice, not-on-sale state, no pickup and disabled Continue are preserved, and no positive merchant contract was invented.
- No new real order, payment, slot or host authority was used; only the C008 permission. No shutdown.
- **R01–R10:** this review changes no requirement status. I'm not restating a per-requirement mapping, because after compaction I don't have `requirements.md` verbatim in context and won't reconstruct it from memory.
