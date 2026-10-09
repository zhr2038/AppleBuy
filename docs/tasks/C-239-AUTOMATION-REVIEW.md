# C239 consolidated review of all five C238 automation tracks

English; original reviewer session; E:\Apple Store; exact claude-opus-5-5/max. Reviewer only. Accepted baseline C237343. New347 candidate C238 SHA2688c9f53e415751eab02db3ae390898f5085c6dbd6eaf42bb896f1dc03c953c. Read C238 task and native-order evidence; no private source material. Human asked to advance all five features in one batch, not successive micro-reviews.

Fresh full EOF:
1. web/checkout-connector/order-audit.js
2. web/checkout-connector/checkout-rpc-peer.js
3. web/checkout-connector/checkout-rpc-contract.js
4. web/checkout-connector/checkout-native-link.js
5. web/checkout-connector/page-program.js
6. web/checkout-connector/r2-protocol.js
7. src/desktop/native-checkout-api.mjs
8. src/desktop/native-purchase-worker.mjs
9. src/desktop/owner-lease.mjs
10. src/desktop/checkout-runtime.mjs
11. src/desktop/app.py
12. src/desktop/pickup_profile.py
13. test/checkout-c238-orders.test.ts
14. test/desktop_c238_test.py

Review functional correctness and failure boundaries, not broad unchanged-repo redesign:
- Account orders use one normal owned order-list tab and its actually displayed matching detail link. Raw reference/account/href stay browser-local, hashed/closed outputs only. Private fields are not persisted in logs or sent to Python. Empty/paginated/unrecognized lists do not prove no pending order. Every completed scan closes its owned tab; auth retains it for ordinary user/authorised operator login, without repeated login/refresh.
- R1 and R2 share the runtime preflight: a positive pending or uncertain same-model order stops a new buy; sent final goes to readonly reference lookup. Already-sent C235 never resubmits. No historical ledger mutation or new authority from query status. Quantity and slot are absent on the native detail and stay null; realOrderVerified remains false. UI may report the exact same order's unpaid/cancelled/fulfilled state, but cannot claim complete independent quantity/time verification. Missing original reference stays unconfirmed instead of guessing an order from similar SKU.
- New API dispatch is lease-checked; pause/owner-loss after awaited read stops continuation. Strict executor version checked before production native startup. Query authentication uses bounded AuthContinuation, including before R2 starts; same checkout's existing auth/late-page continuation stays intact. No new task expiry or final authority.
- Optional pickup profile is Windows current-user DPAPI, opt-in, atomic encrypted write; no passwords/tokens or plaintext files. Tests use temporary paths and fictional data. Default session-only, valid merchant prefills unchanged. Cancelling save preference deletes only the saved profile, not current fields or purchase records.
- Same already-granted native host reconnects at most3 times; no permissions.request, new host or purchase grant. Wait for old browser job terminal before replacing its peer; do not assume disconnect cancels sent merchant actions. Desktop only reopens a confirmed-terminal child, retains task protections and stops retries after pause/owner-loss or its3-attempt bound. Inspect whether stopping/closing/stale messages can undo this.
- UI stays two main actions. Query status must replace stale receipt display; current terms still require one explicit submit. Advanced recovery remains explicit and cannot be silently authorised by order query or automatic reconnect. Ordinary credential entry is not auto-filled by product code: reuse current normal Chrome and automatically continue after login; challenge/permissions/payment remain human.

Root full1943Node/88Python/108protected and23new focused cases passed. Actual fully FAKE Tk preview used one fake submit then same-order cancelled query, normally closed. A final UI-only text/title correction followed that full pass and88Python passed again; JS test bytes/source were unchanged. Reviewer final full command must attest current exact347 bytes. Initial fixture context length/execute arguments and a real fullwidth-colon reader failure were preserved and repaired, no old assertions changed. Actual normal Chrome currently shows the same C235 order cancelled; prior C235 unpaid proof is historical. No real purchase/payment/slot or installed347 test in this batch.

Exact foreground commands once sequentially (no cd prefixes, extra wc, background shell or other commands):
1. python -B tools/delegation/verify_candidate_manifest.py docs/reviews/C-238-candidate-manifest.json
2. node --test test/checkout-c238-orders.test.ts test/checkout-c236-receipt.test.ts test/desktop-c123-native-link.test.ts
3. python -B tools/delegation/run_review_checks.py docs/reviews/C-238-candidate-manifest.json

No edits/reports, private/home/profile/customer/transcript/authentication files, personal browser, agents, deployment, publishing or unapproved scripts. Supporting public source reads permitted; only owned isolated loopback FAKE browser tests. Return actual scoped AGREE/DISAGREE with blocking findings, concrete reproductions and clearly nonblocking limits. 64turns/1500seconds/USD12 local caps. Model and actual metadata are verified by Codex from structured output; history-aggregate usage is not this call's spend. All fifteen original order-history/purchase safeguards are not presumed reviewed merely from this feature review. No second real order.
