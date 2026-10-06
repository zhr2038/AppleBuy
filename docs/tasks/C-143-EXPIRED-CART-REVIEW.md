# C143 cross-author review of cart-only recovery for an expired empty-start descendant

English read-only review, same E:\Apple Store/original terminal C141 resumed privately, first-party claude-opus-5-5/xhigh,40turn/900seconds/USD5. No edits/reports/private/home/ledger/profile/auth/network/browser/GUI/registry/permissions/agents/publishing. Read current files fresh, not compaction/history. Current289 manifest C-142-candidate-manifest.json. Only production deltas from accepted288 are cart-transfer.mjs and empty-restart.mjs; only new test is desktop-c142-expired-cart.test.ts. No old assertion, merchant/permission/native changes.

The actual existing-cart recovery is blocked by old source shape: original handoff -> legitimate empty-start attempt -> checkout/AUTH -> context terminal/task expired -> new readonly reconciliation. It now carries desktopEmptyRestart, not a top-level original desktopHandoff, so the previous cart-only factory rejected it even when the current cart is the same unique capped Pro. Root reproduced that exact FAKE generated shape1red/7pass; final12cases/full1546Node passed. Actual old pending checkout/source archive remain untouched; this task has performed no real new adoption/Checkout/auth. Human authentication still required.

Review the new separate readonly expired empty-source PROVENANCE checker, not buyer-authority checker. It requires valid bounded existing generation/archive/fingerprint/plan identity, readonly and expired top record, and recursive no-final. Existing validateEmptyRestart must still reject readonly; no raw marker can revive the old task. Cart transfer creation and validation now accept either the validated original handoff or this provenance, still requiring explicit approval/current-context confirmation, no final/old active slot window, twice-fresh matching one-item/cap/noextras bag, unchanged source/live owner, complete source/archive preservation. New task remains existingCartOnly; it cannot Add from an empty/failed/different cart later. Review malformed lineage/dual markers/context crossing and any hidden-final/price/quantity escape. Existing cart-transfer descendants beyond this narrow added source kind are not newly supported and must not be silently generalized.

Return precise bounded AGREE/DISAGREE, concrete findings/repro/acceptance. No whole289/real account/live CartTransfer/real slots/refusal/hold/order/speed/goal claim. All test data are FAKE; current real record/customer/SID must not be read. Run only the three exact commands sequentially after the listed fresh EOF reads, no prefix/cd/separators/pipes/redirect/background/parallel/substitution. ModelUsage history aggregate is not round spend. Report actual read gaps/errors/denials, don't claim current identity from an anonymous cart.

## Fresh current EOF reads

1. AGENTS.md
2. CLAUDE.md
3. docs/requirements.md
4. docs/tasks/C-143-EXPIRED-CART-REVIEW.md
5. docs/tasks/C-142-EXPIRED-CART-SUCCESSOR.md
6. docs/reviews/C-142-candidate-manifest.json
7. docs/reviews/C-142-codex-verification.json
8. src/desktop/cart-transfer.mjs
9. src/desktop/empty-restart.mjs
10. src/desktop/browser-session.mjs
11. src/desktop/checkout-runtime.mjs
12. web/checkout-connector/job.js
13. web/checkout-connector/chrome-port.js
14. test/desktop-c142-expired-cart.test.ts
15. test/desktop-c130-successor-chain.test.ts
16. tools/delegation/run_review_checks.py
17. tools/delegation/process_tree.py
18. docs/reviews/C-141-bounded-agreement.md

## Exact allowed commands

1. python -B tools/delegation/verify_candidate_manifest.py docs/reviews/C-142-candidate-manifest.json
2. node --test test/desktop-c142-expired-cart.test.ts test/desktop-c130-successor-chain.test.ts test/desktop-c121-native-checkout.test.ts
3. python -B tools/delegation/run_review_checks.py docs/reviews/C-142-candidate-manifest.json
