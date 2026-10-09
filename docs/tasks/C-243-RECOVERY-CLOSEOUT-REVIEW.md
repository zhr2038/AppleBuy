# C243 final consolidated recovery closeout

Same original session, E:\Apple Store, English, exact claude-opus-5-5/max. Reviewer only. C241 actual DISAGREE confirmed earlier B1/B2/late-reference and integration fixes and left M1 (closed auth tab breaks subsequent queries/cleanup). C242 independently reproduces and fixes it. Candidate348 SHA7580ccd072886f97b48eed890fedc2cf498f6c39d948c9f273a11ba983c78fc2. This verdict covers the integrated C238+C240+C242 five-feature result, not a claim that rejected C240 was accepted.

Read C242 task. Fresh EOF:
1. web/checkout-connector/order-audit.js
2. web/checkout-connector/checkout-rpc-peer.js
3. web/checkout-connector/checkout-native-link.js
4. src/desktop/native-purchase-worker.mjs
5. test/checkout-c238-orders.test.ts
6. test/desktop-c240-worker-auth.test.ts

Other behaviour files are byte-identical to the C241-reviewed C240 snapshot. Page-program/r2-protocol change only the executor version to C242. Root has preserved and hash-verified old348. Reuse your prior review of unchanged code. No original assertions weakened.

Material closure criteria:
- Only official onRemoved for an owned id or the exact Chrome missing-owned-tab error confirms a tab is gone. Clear that local audit id/map/auth timer/focus, never a purchase journal or final. A later user/programme query may create one fresh owned readonly tab. Unknown auth queries stop their watcher instead of fighting a user's tab close.
- Missing already-removed owned tabs no longer break closeSession. Generic permission/transport errors still cannot be called cleaned. Listener registration tolerates a permission-only API facade and is disposed on closed peers/disconnect; no leak across sessions. Unrelated tab events are ignored.
- Root found an additional integration failure: permanently poisoned native API left the worker alive, so existing bounded GUI reconnect could never happen. The worker now stops readers and closes its input on that irreversible local transport state; its existing runtime/contained-process cleanup runs before GUI can reopen. No new grant, source context reuse, final resubmission or unknown-result clearing. Pause disables GUI retries as before. Check direct-input and automatic-auth observation failure paths.

Root M1 old run rejected and retained id7/map1; repaired run unknown/idnull/map0. Poisoned worker old did not close; repaired tests close without a second final. All fixtures are fictional, no private or real order. First C242 full run was1960/1961 because the new listener assumed api.tabs existed in a protected permission-only fixture. Production code now treats the optional event surface as optional; old test unchanged and its six cases pass. Final exact full result is in C242 verification/current logs.

Only three foreground commands once sequentially, no additional shell commands or prefixes:
1. python -B tools/delegation/verify_candidate_manifest.py docs/reviews/C-242-candidate-manifest.json
2. node --test test/checkout-c238-orders.test.ts test/desktop-c240-worker-auth.test.ts test/checkout-c236-receipt.test.ts test/desktop-c123-native-link.test.ts
3. python -B tools/delegation/run_review_checks.py docs/reviews/C-242-candidate-manifest.json

No edits/reports, private/home/profile/transcript/customer/auth reads, agents, personal browser, deployment/publishing or real merchant activity. Only owned loopback FAKE tests. Return concise actual AGREE/DISAGREE with unresolved material findings, coverage/results and limits promptly after required checks. Known nonblocking limits (no password autofill, initial installation/update human step, native detail quantity/time absent, empty/pagination contracts unobserved, old foreign-context missing reference unknown, original recovery attestations) remain disclosed; do not expand into unrelated hardening. 40turns/900seconds/USD8 local caps. Root verifies actual structured modelUsage/provider/canonical/max, full reads/commands/errors/denials/cleanup and unchanged bytes. No second real order.
