# C020 — independently reproduced cart/stage confusion

This is an executable follow-up to the residual route disclosed in the accepted C019 R2 independent review. It does not revoke that review's bounded F1/View Bag acceptance or claim an observed Apple fault. The current C019137 source is unchanged. Codex added one independent22-case FAKE DOM/API test file; the actual complete run is **520/537**, with17 new failures,5 new positives and all515 original tests passing. See `C-020-before-verification.json` and `C-020-input-candidate-manifest.json`.

## F1 — anchored cart can take a foreign fulfillment stage

Priority: P1 for the offline purchase executor's recognition contract; blocks approving this route for live execution. Requirements: R02,R03,R06,R08 and A04,A06,A10.

Reproduction: on the FAKE `/shop/bag` document, keep one visible observed-style `OL[data-autom="bag-items"]`, one exact Pro256black purchased line, quantity1 and total9999. Make its checkout ambiguous through a disabled bottom pair member, a hidden third checkout, or an additional Safety Checkout. Append an enabled, unselected native-looking `我要取货` radio with a matching delivery group. These combinations/radios and all resulting clicks are synthetic, not official merchant evidence.

Actual: the decoder reports FULFILLMENT with `verifiedStep=true` and `purchase.itemVerified=true`. A fresh direct structured `selectPickup` is delivered. The real PurchaseJob/ChromePort code over a FAKE API sends exactly `['selectPickup']`; its synthetic radio is clicked. Subsequent result uncertainty does not undo the already-sent operation. All three variants run in separate decoder/direct/controller tests; this is stronger than the prior code-reading disclosure.

Expected: an ambiguous anchored cart is UNKNOWN with `verifiedStep=false`; direct foreign-stage commands are positively untouched and the controller sends no command, creates no pending mutation, and keeps `resourceWritten=false`. A label alone on an anchored cart cannot establish the normal checkout fulfillment stage.

## F2 — legitimate cart checkout loses precedence

Priority: P1 for functional progression within this same bounded repair. R03/R06, A01/A10.

Reproduction: preserve the recognized one-item cart and enabled observed header/bottom checkout pair; append the same synthetic fulfillment radio. Actual: FULFILLMENT replaces BAG and the controller sends `selectPickup` instead of the single proved bottom checkout. Expected: the recognized cart remains BAG and takes its previously proved checkout exactly once, with no decoy-radio click. This positive prevents a blanket stop-all-cart fix.

## F3 — other foreign stage labels misreport recognition

Priority: P2, R02/R06, A04/A10.

Three separate invalid-list variants with the synthetic pickup radio report FULFILLMENT even though item proof is false. Three separate ambiguous-checkout variants with a synthetic Details Continue, Alipay radio, or Place Order report DETAILS/PAYMENT/REVIEW and `verifiedStep=true`. Their later controller checks can block, but that does not make the decoded stage evidence valid. Expected: UNKNOWN without commands on this unknown anchored cart. The acceptance packet also requires AUTH/CONSENT/PROCESSING to retain their higher-priority human/processing gates, ordinary no-anchor checkout to remain usable, and the observed cart without decoys to keep its one checkout.

## Evidence and exact boundary

Input:138 files SHA256 `f8c406f91a12ef80b3b4b53551f8ba2f1a4eae81b3b2310ef62ace017dbab7a1`;72 protected test/review paths. All137 prior accepted bytes are preserved; only the new Codex reviewer test is added. Every DOM, URL, API, storage value and command here is a local fake. No account, cart, slot, order, payment, installed-extension state or real latency was accessed or changed.

The actual test command was `node --test "test/*.test.ts" "review/*.test.ts"`, exit1, zero cancelled/skipped/todo. The first recording helper counted Node's repeated failure summary twice after correctly checking537/520/17 and node exit1. Codex repaired only that private log parser and recorded the same completed output without repeating the test run. This was a recording error, not another test result or provider quota event.

Native human reload/Observe remains pending; the user explicitly deleted the cart. Retain old purchase history and no-repeat/unknown-result protections. No new merchant mutation authority exists. Fix/independent verification/actual precise Claude agreement must precede acceptance of new source. Full one-click real purchase, Duo contracts and merchant timings remain unverified.
