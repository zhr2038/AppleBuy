# C237: one consolidated review of the simplified R1 desktop and native receipt status

English, original reviewer session, E:\Apple Store, exact claude-opus-5-5/max. Reviewer only. Candidate C236:343 files SHA256 `849387f3ee64348784737adf2407f31139e94f36ffe8343541de251faa23f63b`. Baseline accepted C234340 is unchanged except the explicit delta below. Read C236 task and docs/R1-operation.md. The human wants fewer controls and clarity about nonautomatic steps. Do not expand into a new recovery, authentication or receipt-detail subsystem.

Fresh complete EOF required:
1. src/desktop/app.py
2. src/desktop/ui_flow.py
3. src/desktop/browser-session.mjs
4. src/desktop/checkout-runtime.mjs
5. src/desktop/native-purchase-worker.mjs
6. src/desktop/purchase-worker.mjs
7. web/checkout-connector/page-program.js
8. web/checkout-connector/chrome-port.js
9. web/checkout-connector/checkout-rpc-contract.js
10. web/checkout-connector/checkout-rpc-peer.js
11. web/checkout-connector/job.js
12. web/checkout-connector/r2-protocol.js
13. web/checkout-connector/r2-executor.js
14. test/checkout-c236-receipt.test.ts
15. test/desktop_c236_test.py

Review the reduced default-R1 UI using existing guarded handlers; one explicit current-terms submit action, no auto-accept, double-submit, stale-ready, pause, owner-loss, readonly or late-result authority. Hidden legacy widgets are state holders only. Existing security checks and prior history remain. Backend current consent remains authoritative. A result signal must not manufacture complete independent-order verification.

The C235 real programme final was already sent and independently verified by Root as one unpaid Pro order through its matching authenticated detail. No additional real action is permitted. The actual receipt had official secure host, /shop/checkout/interstitial, exact visible H1 awaiting payment, one product H2 and one order-number anchor. The displayed guest detail href contains customer data and is never exported. All fixtures use fictional values. New native receipt reading returns only a SHA256 order reference and partial facts; quantity, amount, store, fulfillment, extras and slot remain explicitly unknown. Own sent final may pin this hash but pending/final stay retained, with no repeat. Fresh bounded receipt signal does not mean authenticated detail lookup is complete. Old/readonly receipts must not claim a current complete order. Observation URL additions must not add navigation/mutation permission. Validate composed R1/R2 paths and privacy at peer/native/worker/GUI boundaries. Independent native detail verification and preflight account-order listing are explicitly remaining work.

Root exercised an actual Tk GUI with completely replaced FAKE runners: default, current review, receipt and advanced panel; normal close, no browser/journal/merchant use. Renderer tests use production parser and composed native Runtime with isolated FAKE merchant/API data. Initial composed startup failures exposed the observation URL guard and were fixed in production; no prior tests or assertions weakened. These are software tests, not live deployment or a second order.

Exact foreground commands once, sequentially, no extra shell commands:
1. python -B tools/delegation/verify_candidate_manifest.py docs/reviews/C-236-candidate-manifest.json
2. node --test test/checkout-c236-receipt.test.ts test/checkout-c040-recovery.test.ts
3. python -B tools/delegation/run_review_checks.py docs/reviews/C-236-candidate-manifest.json

No edits/reports, private/home/profile/transcript/customer/authentication files, personal browser, agents, deployment or publishing. Read public unchanged supporting source as needed. Only owned loopback FAKE test traffic. Return scoped actual AGREE/DISAGREE, material findings, actual coverage and limits. 64turns/1500seconds/USD12 local caps. Codex audits structured modelUsage, firstParty/canonical5.5/CLImax, fullRead, commands, errors/denials, cleanup and unchanged bytes. Nonblocking limitations do not justify endless micro-reviews.
