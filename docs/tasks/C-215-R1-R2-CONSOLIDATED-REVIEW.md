# C215 integrated R1 and parallel corrected-R2 review

The human explicitly requires Codex implementation, strict adherence to the corrected C211 Markdown, and immediate R2 work alongside R1. You review in English in this same directory with exact claude-opus-5-5/max after provider quota recovery. C213 was prepared but never invoked and is superseded by this combined task. Do not split this into separate micro-reviews. No source edits or acceptance of your own earlier work. Return one integrated AGREE/DISAGREE with reproducible material findings and scope limitations.

Read AGENTS, CLAUDE, requirements, the corrected (top) C211 roadmap, C212/C214 implementation tasks, C212/C214 implementation evidence, and C214 manifest. C211's archived extension-only and clean-namespace recommendations are withdrawn. The human superseded the condition that R2 must wait for R1 live failure. R2 keeps the Python window and shared desktop journal, moves the ordinary PurchaseJob/ChromePort/recognition into the bridge, and carries only high-level commands/status and atomic journal acknowledgements through native messaging. No personal Chrome installation or real order was exercised by the new tests.

## Fresh full read scope

Production:
- web/checkout-connector/review-progress.js
- web/checkout-connector/page-program.js
- web/checkout-connector/job.js
- web/checkout-connector/chrome-port.js
- web/checkout-connector/checkout-rpc-contract.js
- web/checkout-connector/checkout-rpc-peer.js
- web/checkout-connector/checkout-native-link.js
- web/checkout-connector/r2-protocol.js
- web/checkout-connector/r2-executor.js
- web/checkout-connector/owner.js
- src/desktop/native-checkout-api.mjs
- src/desktop/browser-session.mjs
- src/desktop/checkout-runtime.mjs
- src/desktop/expired-review-restart.mjs
- src/desktop/auth-continuation.mjs
- src/desktop/native-purchase-worker.mjs
- src/desktop/r2-browser-run.mjs
- src/desktop/owner-lease.mjs
- src/desktop/task-store.mjs
- src/desktop/interactive_child.py
- src/desktop/app.py
- tools/delegation/invoke_claude.py

Tests:
- test/checkout-c209-controlled-review.test.ts
- test/desktop-c212-review-recovery.test.ts
- test/checkout-c212-bounded-waits.test.ts
- test/desktop-c192-host-scope.test.ts
- test/desktop-c214-r2.test.ts
- test/checkout-c214-r2-native.test.ts
- test/desktop_c214_test.py

Supporting public validators/owner/archive code may be read as needed. No .local, home profiles, credentials, private journal/HDF, authenticated traffic, personal browser, permission changes, other agents, publication or installation. No arbitrary network. The allowed test runner may start its own contained loopback-only FAKE browser.

## Critical acceptance checks

1. All C213 R1 questions still apply: source-disclosed REVIEW proof vs missing merchant store/slot, native trusted-radio own-write distinction, current same-document final consent, immutable original cohort/floors/refusals, exact once-only stopped continuePayment successor, preserved archives/unknowns, receipt/detail unobserved and no final resend.
2. Does R2 actually run PurchaseJob and ordinary read/act within the browser renderer while retaining the same task file and kernel lease? Are snapshot identity/proofs bounded, complete and current? Does every pending/final reach the original atomic writer and receive the exact sequence/hash acknowledgement before a native click? Can patching alter history, deadlines, ownership or plan? No second namespace, retired-source bypass or old actor revival.
3. Trace startup, chunk corruption, duplicate requests, origin Web Lock contention, cross-adapter competition, pause during awaited permission/Chrome calls, pipe loss, unacknowledged writes, watchdog expiry, late replies and final uncertainty. Does disconnect halt future dispatch without pretending an in-flight merchant action was cancelled? Can a stopped run restart implicitly, or fall back to R1 after delivery uncertainty?
4. Confirm auth and late-render settling now stay in the browser actor, are observation-only, preserve document/run/source identity and the original task window, and stop on challenge/throttle/merchant errors. No login automation in R2, no default-profile attachment, no stronger extension permissions, no extension-page tool workaround. Existing document-scoped injection/recognizers remain reused; registered-script or MutationObserver changes have not been claimed.
5. Review the actual renderer-local test: production modules execute in contained Chrome over loopback with normal native FAKE DOM; Chrome API, merchant address, authority and order remain FAKE. Separate that from component fixtures, physical temporary journal tests, installed extension proof and real unpaid-order acceptance. Confirm the normal Python launch selector does not copy profiles or duplicate workers.
6. Review known scope limits honestly: receipt/detail and real refusal feedback remain unobserved, live native connection performance is not measured, and deployment/merchant/security blockers remain shared. The first real order must be verified on the same receipt identity/detail with current terms, without inventing a held date or retrying unknown final.

## Exact foreground commands, once in this order

1. python -B tools/delegation/verify_candidate_manifest.py docs/reviews/C-214-candidate-manifest.json
2. node --test test/desktop-c214-r2.test.ts test/checkout-c214-r2-native.test.ts test/checkout-c209-controlled-review.test.ts test/desktop-c212-review-recovery.test.ts test/checkout-c212-bounded-waits.test.ts
3. python -B tools/delegation/run_review_checks.py docs/reviews/C-214-candidate-manifest.json

No extra shell commands, wrappers, background processes, package hooks, line-count commands or report files. Read/Grep/Glob on allowed public project sources is permitted. Record true fresh EOF coverage and command results; inherited compaction is not a fresh read. Stop on source/map mismatch. Budget80turns/2400seconds/USD15 CLI cap; caps are not provider quota. Any genuine quota interruption is a partial review, not an approval. Codex verifies actual modelUsage/provider/CLI max/denials/coverage/outputs/process cleanup and unchanged bytes before accepting anything.
