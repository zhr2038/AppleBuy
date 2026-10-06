# C141 cross-author review of startup and observation drainage

English read-only review, same E:\Apple Store/original terminal C138 resumed privately, first-party claude-opus-5-5/xhigh,40turn/900seconds/USD5. No edits/reports/private/home/ledger/profile/auth/network/browser/GUI/registry/permissions/agents/publishing. Earlier context or compaction is not fresh reading. Current288 manifest C-140-candidate-manifest.json; sole production delta from accepted287 is checkout-runtime.mjs, only added test is desktop-c140-close-drain.test.ts. No worker/channel/host/permission/merchant/old assertions changed.

C136-1 was independently reproduced: close during native startup metadata leaves cleanup false/one FAKE tab/zero release. Root first five tests fail4/pass1; an incomplete intermediate edit retained2fail13pass; final8new tests/full1534 pass, original private repro now cleanuptrue/zero tab/one release/no purchase/ledger write. Runtime now has an inner startup promise that settles without outer cleanup, cancellation after awaited owner/launch boundaries, separately tracked standalone observes, suppressed late observed callback, pause/close drainage of starting plus operations. Judge whether this avoids both native request overlap and a close/open promise cycle. Preserve owner loss, pause, expiry, authority, pending/final/history and no-repeat semantics. No artificial successful cleanup when transport remains uncertain.

Bound the result to explicit Runtime.close/pause semantics. The worker installs its normal stdin handler after initial open, and the parent has a short forced-stop budget; forced death/pre-ready worker cancellation is NOT fixed or claimed by this runtime-only patch. A completed native request can still fail cleanup if the underlying API is poisoned, and that must remain unconfirmed. No browser/authentication test or new buy is authorised. Actual prior programme reached one Pro bag/checkout/AUTH, then idle stop terminal and window expired; current C139 readonly fresh context foundqty1/9999/noextras/unchanged ledger. Human authentication remains pending; don't turn that cart observation into account identity or new buyer rights.

Return precise bounded AGREE/DISAGREE and concrete findings/repro/acceptance criteria. No whole288/full GUI/runtime worker lifecycle/account/real slot/refusal/hold/order/speed/goal claim. Read every listed file fresh to EOF before the three exact foreground commands, in order. No prefix/cd/separators/pipes/redirect/parallel/background/substitution. Only contained FAKE tests/owned child cleanup; no personal Chrome or Apple access. Disclose all errors/denials/read gaps; modelUsage history aggregate is not this round spend.

## Fresh current EOF reads

1. AGENTS.md
2. CLAUDE.md
3. docs/requirements.md
4. docs/tasks/C-141-STARTUP-CLOSE-REVIEW.md
5. docs/reviews/C-140-candidate-manifest.json
6. docs/reviews/C-140-codex-verification.json
7. docs/tasks/C-140-DRAIN-STARTUP.md
8. src/desktop/checkout-runtime.mjs
9. test/desktop-c140-close-drain.test.ts
10. test/fixtures/c121-native-world.mjs
11. src/desktop/native-checkout-api.mjs
12. src/desktop/native-checkout-channel.mjs
13. src/desktop/native-purchase-worker.mjs
14. src/desktop/interactive_child.py
15. src/desktop/owner-lease.mjs
16. docs/reviews/C-138-bounded-agreement.md
17. tools/delegation/run_review_checks.py
18. tools/delegation/process_tree.py

## Exact allowed commands

1. python -B tools/delegation/verify_candidate_manifest.py docs/reviews/C-140-candidate-manifest.json
2. node --test test/desktop-c140-close-drain.test.ts test/desktop-c135-initial-loading.test.ts test/desktop-c121-native-checkout.test.ts test/desktop-c127-startup.test.ts
3. python -B tools/delegation/run_review_checks.py docs/reviews/C-140-candidate-manifest.json
