# C251 review of C250 preflight placement and bounded initial-checkout continuation

English, reviewer only, same original session/E:\Apple Store/exact claude-opus-5-5/max. Read C250 task, C250 actual live evidence and C250 verification. The human's authorized additional Pro flow has added exactly one item and sent checkout/selectPickup, but no slot/date/final. It is stopped normally, cart remains one/9999. C249 accepted Candidate351 remains historical. This review covers Candidate355 SHAf2b571b504f619150dc5127713a83d5dfa2199f337bf76a13415f6c42bcd8db1; do not approve earlier failed355/34e9095c or claim a live order.

Fresh complete EOF:
1. src/desktop/cancelled-order-purchase.mjs
2. src/desktop/checkout-runtime.mjs
3. src/desktop/native-purchase-worker.mjs
4. test/fixtures/c250-cancelled-world.mjs
5. test/c250-preflight-repro.mjs
6. test/desktop-c250-checkout-continuation.test.ts
7. test/desktop_c250_test.py
8. test/desktop-c192-host-scope.test.ts
9. test/desktop-c240-worker-auth.test.ts
10. docs/reviews/C-250-existing-source-diff.patch

Additional fresh source excerpts (the rest is unchanged from actual C249, not claimed freshly re-read): app.py lines428-452 and542-580; job.js lines395-475; page-program.js line19; r2-protocol.js lines1-4. The public diff contains all changed tracked source lines against accepted f86ee1d. No old assertions changed; the two old VM fixtures only import/inject the new mandatory helper so the real new worker body can execute.

Changes and important boundaries:
- Runtime preflight is remembered only in memory for a positively checked task/plan/current context under a live owner. Reuse it during that purchase instead of re-authenticating account orders in the middle of checkout. It is never persisted, and task/context/owner changes invalidate it. Closing clears it. Unknown/auth/absent identity cannot cache; sent-final lookup and current final consent remain independent. The explicit new-task/recovery helpers already perform a fresh clear preflight; their committed immediate advance reuses that result.
- One generation2 continuation for a generation1 C248 task, only before any current slot/date/final. It requires elapsed pending checkout/selectPickup, complete validated source chain, a different stopped-owner context, current version/host, clear authenticated account, normal programme GET with exact session-expired path+merchant marker, two stable one-item BAG reads and unchanged source. Complete current source is archived with matching backup; all original C235 final/unknowns stay preserved. It creates a distinct continuation task for the SAME authorized purchase, with existing-cart-only marker. It never re-adds even if a mutable Add flag is cleared; shared Job guard covers ENTRY/VARIANT/EMPTY_BAG. Generation3 or a slot/final source is refused.
- Uses the existing Python recovery checkbox/address/control and private worker command; no new permissions. Current terms/final remain separate. New exception messages are fixed public strings, not raw private errors.

Evidence: copied all351 accepted source blobs into an isolated baseline and verified their hashes. The same public controlled repro runs the actual old Runtime and yields UNKNOWN/3 account lookups/1 checkout/0 finals (assertion failure), while current Runtime reaches REVIEW/1 lookup/1 checkout/0 finals. This is a FAKE model, not evidence of the merchant's exact invalidation mechanism. Root observed actual repeated account authentication during checkout followed by an expired heading; the exact expiry URL was not captured before cleanup and is explicitly null in the live report. Do not replace the required new programme expiry probe with that Root observation.

Root current24 new Node,2 new Python,43 existing order/auth checks,108 protected,96 Python and2022 Node all pass with exact map before/after and cleanup. Earlier failures are recorded in C250 verification: one missing-cache undefined-equality bug repaired, new fixture/default fixes, and two existing VM dependency injections; no weakened assertions. All merchant/order tests are FAKE; the current live journal is untouched while developing.

Exact foreground commands, once each sequentially, no other shell commands/prefixes:
1. python -B tools/delegation/verify_candidate_manifest.py docs/reviews/C-250-candidate-manifest.json
2. node test/c250-preflight-repro.mjs
3. node --test test/desktop-c250-checkout-continuation.test.ts test/desktop-c248-new-purchase.test.ts test/checkout-c238-orders.test.ts test/desktop-c240-worker-auth.test.ts
4. python -B tools/delegation/run_review_checks.py docs/reviews/C-250-candidate-manifest.json

Review all changed paths above, especially cache identity/lifecycle, never using clear as final proof, source/owner races, parent archive/unknown retention, once-only no-slot/no-final scope, true merchant expiry requirement and no-Add preservation. Use prior actual C249 review for unchanged code. Return actual AGREE/DISAGREE with material findings and remaining scope limits. No edits/reports, private paths/transcripts/customer/browser/auth data, other agents, personal Chrome, external networking, deployment or publish. Only existing isolated tests.48turns/1200seconds/USD10 local caps. Root verifies structured model/provider/max, full/excerpt reads, exact commands, errors/denials, cleanup and unchanged source.
