# C228: consolidated C227 review, exact Opus 5.5 / max

Review only in this directory, same original reviewer session. Codex implements. Candidate: C227 manifest, 334 files, SHA256 `4e88bbddf6ca5351a8dfd16fc2ab3164b5348e77e2e6ca136bdf42dcf102db64`. Earlier C224 accepted 331 files remains the comparison; all older assertion bodies are unchanged. No claims of current Apple root cause or real order readiness.

Read `docs/tasks/C-227-REVIEW-DIAGNOSTIC.md` and fresh complete EOF of these nine delta files:
- web/checkout-connector/page-program.js
- web/checkout-connector/job.js
- web/checkout-connector/review-diagnostic.js
- web/checkout-connector/r2-protocol.js
- src/desktop/checkout-runtime.mjs
- src/desktop/r2-browser-run.mjs
- src/desktop/app.py
- test/checkout-c227-review-diagnostic.test.ts
- test/desktop_c227_test.py

Read unchanged `src/desktop/browser-session.mjs`, `src/desktop/native-purchase-worker.mjs` and `web/checkout-connector/checkout-rpc-peer.js` as needed to verify end-to-end propagation. Root actually ran 20 new Node, 2 new Python, 108 protected, 68 Python and 1865 Node tests with owned cleanup. These are FAKE/offline evidence, not a merchant fix.

Check that closed diagnostic strings reveal no captured content/URL/ID/customer field, never supply authority or loosen current final/pending/expiry/ownership/recovery guards, and survive R1/R2 events into Chinese desktop status without enabling submit. In particular, absence of diagnostic or malformed diagnostic is not success; diagnostic readiness is never order readiness. Verify stable read/action comparison and no diagnostic-only second mutation. Identify material issues, not speculative scope expansion.

Only these exact foreground commands, in order:
1. python -B tools/delegation/verify_candidate_manifest.py docs/reviews/C-227-candidate-manifest.json
2. node --test test/checkout-c227-review-diagnostic.test.ts test/checkout-c209-controlled-review.test.ts test/checkout-c204-native-review.test.ts
3. python -B tools/delegation/run_review_checks.py docs/reviews/C-227-candidate-manifest.json

No edits or reports written, no agents, no private files/profile/authentication data, no personal browser, no network except the contained loopback FAKE fixtures, no deployment or publish. Do not inspect private invocation transcripts or compaction files. Return actual AGREE/DISAGREE with findings, read coverage, commands and limits. 40 turns / 1200 seconds / USD8 are local caps, not provider quota.
