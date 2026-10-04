# C044: observed official detail route and trustworthy terminal-order handling

Claude Code is primary designer/implementer; Root owns requirements, independent reproduction/review and final acceptance. English, exact original session, E:\Apple Store, firstParty claude-opus-5-5/xhigh. Read this task and docs/requirements.md completely. Choose the narrow implementation yourself; do not treat Root's old route inference as an approved technique.

## Actual current evidence and problem

Root used normal desktop Chrome only, opened the order-status link actually shown on the Duo page, and performed one authorized normal existing-account login. No credentials were returned to the model or newly copied, no CAPTCHA/security bypass, no AppleBuy host permission change, no new cart/slot/order/payment action. Relevant historical Pro records were already picked up or cancelled; no current unpaid record or actual new receipt was observed. Private refs, contacts, account values, URLs and authenticated requests are omitted from your inputs.

Current official account product links and separately opened detail pages use `/shop/order/detail/[private]/[private]` on secure8.www.apple.com.cn. Root captured the visible main DIV role=main, native title `你的订单详情。`, h2.rs-od-itemtitle with span.rs-od-itemstatus (`取货已取消`; also normal picked-up text), product h3 and store/price selectors. This does NOT prove current quantity, extras, slot/date, or unpaid/receipt recognition. Do not derive quantity one from CNY9999.

The actual production outer ChromePort URL allow-list already permits deep order paths. The failing layer is page-program.js: its ORDER_DETAIL recognition and observed receipt-link filter both accept only a one-segment order path. Root's old-alias native baseline passes; the deep-alias FAKE unpaid case cannot confirm in its initial run because no detail link is retained. Two native terminal negative cases currently remain unconfirmed but fail the required independent navigation/read, not because existing code falsely confirmed them.

Root's protected native repro reuses actual Job/Port/merchantDocument with the observed route shape and terminal title/status selectors. All refs, receipt/unpaid proof, quantity/slot beyond captured facts, Chrome/storage/authority/backend/dynamics/timing are FAKE. The conflicting pending prose in terminal tests is a deliberate FAKE fault, not an observed Apple case. Keep that distinction explicit.

## Fresh complete inputs

- This task; docs/requirements.md.
- docs/reviews/C-043-bounded-agreement.md; C-043-cross-review-verification.json.
- docs/reviews/C-044-input-candidate-manifest.json; C-044-normal-order-evidence.json; C-044-independent-findings.json.
- web/checkout-connector/job.js; chrome-port.js; page-program.js.
- review/c044-native-order-route.mjs; review/c043-independent-native-lookup.mjs.
- test/c040-native-order.mjs; test/checkout-c043-lookup.test.ts; test/checkout-c023-final-lookup.test.ts.

Fresh normal public paged Read is permitted to EOF, no gaps. Never read a private transcript/compaction path, .local output or any credential/customer material. Printed native result paths are not permission. Record actual coverage honestly.

## Required behavior and scope

Support the actually observed normal detail route shape when reading a current official page or following a single link explicitly observed on a verified receipt. Preserve the old bounded software compatibility. Never construct an endpoint from refs, bypass authentication, weaken host/permission/document checks, enlarge install permissions, or navigate an unobserved link. Lookups remain read-only, finite, one observed-link navigation and no mutation replay.

An authoritative native item status that says pickup cancelled/already picked up must never confirm a new unpaid order, even beside conflicting generic pending prose or unrelated help text. Ambiguous/missing/wrong identity, product, quantity, cap, store, date/slot, unpaid or independent detail evidence remains unconfirmed. A route alone is not order proof; a historical cancelled order cannot clear sent intent, revive a grant or authorize another purchase. Keep the original pending/expiry/history/retired/readonly/authority truth and C043 shared lookup bounds.

Do not claim actual unpaid or actual receipt compatibility from a newly labelled FAKE positive test. Explain exactly what current negative/route evidence establishes and which positive contract remains missing.

Allowed writes only: page-program.js and chrome-port.js if genuinely needed; new test/checkout-c044-order-route.test.ts; docs/claude/C-044-report.md. All other178 input paths, every old test and both Root protected native regressions must retain bytes. No job/permissions/manifest/dispatcher/README/appearance change. No manager docs/reviews or review write. A denied resource stays denied; no other tool/path workaround.

## Exact allowed commands

1. node --test test/checkout-c044-order-route.test.ts test/checkout-c043-lookup.test.ts test/checkout-c023-final-lookup.test.ts
2. node review/c044-native-order-route.mjs
3. node review/c043-independent-native-lookup.mjs
4. node test/c040-native-order.mjs
5. node test/c039-native-pipeline.mjs
6. node --test "test/*.test.ts" "review/*.test.ts"

No appended pipeline, redirection, output filter, extra shell command, private output read/Grep/Glob, network, personal Chrome/extension/merchant action, other agent or publication. Previous appended grep was a deviation, not precedent. Decline harness-persisted private outputs; Root independently reruns and counts. Native commands only guarded owned-loopback FAKE isolated profiles, no real website/session.

## Acceptance

- Protected4 native cases pass: existing alias baseline; observed deep alias with explicitly FAKE exact unpaid proof confirms in the first start; cancelled/picked-up native statuses get a genuine separate detail read yet remain unconfirmed. One backend FAKE order/final per case, one observed-link navigation, no repeated mutation, owned cleanup and guard pass.
- Meaningful author faults for wrong/non-Apple/list/account/malformed routes, multiple/conflicting links or statuses, missing identity and native terminal scope; old C023/C043 guards/assertions unchanged. No successful unpaid result from terminal/history/price/route alone.
- Existing C0432/C0408/C0398 native and full Node regressions remain green with no skips/todos/weakening.
- Report actual edits, pre-fix failures, tests/commands, unread output, denials/deviations, facts versus FAKE and remaining real contracts. Actual structured turns/time/usage belong to Root's receipt; resumed modelUsage may be historical aggregate, not this call's spend.
- Implementation and green tests are not final acceptance. Root independently reruns, checks exact new manifest, and requests fresh original-session exact-source agreement before acceptance/main.

48 CLI turns /1200seconds /USD8. Duo remains behind observed approval/not-on-sale/no-pickup/disabled-Continue. Real refusal catalog is EMPTY. No new order/payment/slot or host authority; C008 permission remains used. No shutdown.
