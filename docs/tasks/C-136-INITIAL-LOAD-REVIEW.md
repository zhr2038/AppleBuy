# C136 cross-author review of initial native page loading

Read-only English review, same E:\Apple Store and original terminal C133 session resumed privately. First-party claude-opus-5-5/xhigh,40turn/900seconds/USD5. No edits/reports/private or home files/ledger/profile/cookies/auth/network/browser/GUI/registry/permissions/agents/publishing. Never treat compaction hints or earlier history as fresh reading.

Current286 manifest is C-135-candidate-manifest.json. The only new production delta from accepted C133285 is src/desktop/checkout-runtime.mjs; the only new test path is test/desktop-c135-initial-loading.test.ts. No extension/host/permission/old assertions changed. Root has reproduced two initial-load failures before repair and seven focused tests now pass, including bounded loading, delivery error, cancellation, invalid address and missing host. Full1521Node pass. Actual programme startup before the patch created its owned bag tab but returned NativeCheckoutResultUnconfirmed before observation, closed its owned tabs/context and broker normally. Loading/missing committed URL is a supported explanation, not an observed raw-tab field. The repaired actual read returned OBSERVED/EMPTY_BAG/legacyReadOnly and cleanupConfirmed true; no purchase or final/payment. No private/raw payload or new account authentication proof.

Review the bounded same-tab initial metadata/frame-read retry. It must never repeat create or any mutation, weaken host/address/unknown-result guards, change the old source or acquire buyer authority. Delivery or identity error, missing permission, cancellation and malformed output must not become availability or success. Optional metadata compatibility may allow a normal document read only through the unchanged transport/document guards. The 15-second deadline can be exceeded by the one already in-flight transport operation; no hard absolute-wall guarantee. Confirm cap/cancellation/owner cleanup and regression assertions. C133 bounded preparation approval cannot approve these new bytes. The user has specifically approved distinct registration/normal-Chrome programme progression to current review only; final submit/pay remains disabled, current account/old-checkout/no-unpaid facts are direct HUMAN attestation, not programme authentication.

Return precise bounded AGREE or DISAGREE with findings and actual evidence. Do not claim whole286/current extension deployment/account/refusal/hold/live order/speed/goal. Do not claim unread files were freshly read. Use only these three commands sequentially, after every listed fresh EOF read, and wait for each full result before the next command. No prefix/cd/separators/pipes/redirect/parallel/background or substitute commands. Only contained local FAKE tests and their owned process cleanup; no personal Chrome or Apple access.

## Fresh current EOF reads

1. AGENTS.md
2. CLAUDE.md
3. docs/requirements.md
4. docs/tasks/C-136-INITIAL-LOAD-REVIEW.md
5. docs/reviews/C-135-candidate-manifest.json
6. docs/reviews/C-135-codex-verification.json
7. src/desktop/checkout-runtime.mjs
8. test/desktop-c135-initial-loading.test.ts
9. web/checkout-connector/chrome-port.js
10. web/checkout-connector/checkout-rpc-peer.js
11. src/desktop/native-checkout-api.mjs
12. test/fixtures/c121-native-world.mjs
13. tools/delegation/run_review_checks.py
14. tools/delegation/process_tree.py
15. docs/reviews/C-133-bounded-agreement.md

## Exact allowed commands

1. python -B tools/delegation/verify_candidate_manifest.py docs/reviews/C-135-candidate-manifest.json
2. node --test test/desktop-c135-initial-loading.test.ts test/desktop-c121-native-checkout.test.ts test/desktop-c127-startup.test.ts
3. python -B tools/delegation/run_review_checks.py docs/reviews/C-135-candidate-manifest.json
