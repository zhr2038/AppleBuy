# C222 final small R2 deployment-guard review

Same original Opus5.5/max session, English, E:\Apple Store, review only. C218 actually returned bounded AGREE on C216/source330 and recommended G2 and the F-C marker guard before choosing R2. The latest human request says make both R1/R2 usable, then compare deployment. Codex implemented those two prerequisites plus G3's explicit receipt projection. R1 business logic and all old tests/acceptance conditions remain unchanged. Current C220 manifest is the authoritative exact candidate.

Read C-220-R2-DEPLOYMENT-GUARDS.md, C-220-verification.json, C220 manifest, and C218 actual report/verification as needed. Fresh full EOF:
1. src/desktop/r2-browser-run.mjs
2. web/checkout-connector/r2-protocol.js
3. test/desktop-c220-marker-guard.test.ts

Check G2: stopped checkpoints are skipped without falsely marking a caller pause or changing already-durable pending results. Check F-C: a browser-supplied patch cannot add/change finalIntent.notDispatched, while unchanged marker carry and new-intent marker removal retain the correct fresh-consent path. Check G3: no arbitrary receipt data enters the marker or overrides its kind; only already-matched fields do. Ensure these changes do not affect R1 or regress C216's F-A/F-B protections.

Independent matched FAKE timing on the earlier 330 candidate found R1 faster, not R2: same six business actions, zero Add/final, same singleton BAG-to-REVIEW; 80 alternating samples, no failures, 10ms injected per native RPC small-ledger P50 R1~930ms/R2~1209ms. This is not Apple or installed-pipe speed. Codex retains R1 as the first-live recommendation; making R2 selectable is not a claim that it is faster. No requirement to optimise further or rewrite now.

Exact foreground commands, once in order:
1. python -B tools/delegation/verify_candidate_manifest.py docs/reviews/C-220-candidate-manifest.json
2. node --test test/desktop-c220-marker-guard.test.ts test/desktop-c216-ack-truth.test.ts test/checkout-c216-ack-native.test.ts test/desktop-c214-r2.test.ts test/checkout-c214-r2-native.test.ts
3. python -B tools/delegation/run_review_checks.py docs/reviews/C-220-candidate-manifest.json

No extra commands/wrappers/background shell, no private paths/home/profile/auth data, no network except the owned loopback FAKE test fixture, no personal browser, agents, edits, report files, deployment or publishing. Return one final combined-candidate AGREE/DISAGREE with G2/F-C/G3 disposition, actual fresh coverage/commands and residual limitations. C217/C218 prior actual reads remain evidence only for identical unchanged files. Do not claim real order, live readiness or unconditional availability. Codex verifies structured actual model/provider/max, commands/EOF, errors/denials/cleanup and unchanged source. Budget40turns/1200seconds/USD8; local limits are not provider quota.
