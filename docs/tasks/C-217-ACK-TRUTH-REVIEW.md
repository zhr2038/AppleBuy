# C217 integrated follow-up to actual C215 DISAGREE

Continue the original Opus 5.5/max review session, English, same E:\Apple Store. C215's actual broad review and 29 EOF reads remain evidence for unchanged files, not for these new bytes. Read C-215-actual-review.md, C-215-actual-verification.json, C-216-ACK-TRUTH-FIX.md, C216 verification and manifest. Review the material F-A and related F-B fix plus the final-draft boundary Root independently reproduced. This is one follow-up to the integrated R1/R2 review, not another architecture plan. No edits, private reads, personal browser, other agents or publication.

## Fresh EOF reads

1. src/desktop/r2-browser-run.mjs
2. web/checkout-connector/r2-executor.js
3. web/checkout-connector/r2-protocol.js
4. web/checkout-connector/review-progress.js
5. src/desktop/browser-session.mjs
6. src/desktop/checkout-runtime.mjs
7. test/desktop-c216-ack-truth.test.ts
8. test/checkout-c216-ack-native.test.ts
9. web/checkout-connector/checkout-rpc-peer.js
10. src/desktop/native-checkout-api.mjs

First eight files are the exact delta from C214; the last two unchanged files substantiate negative/lost reply semantics. Supporting public source reads are allowed. All old assertions and all other C214 source files are unchanged. Do not read .local, homes, ledgers, credentials, raw auth or private conversation logs.

## Review requirements

- Independently assess Root's positive unreleased receipt, emitted only on a stopped unresolved checkpoint, then returned at terminal Finish. Host correction requires the exact run/sequence/hash, a newly introduced pending intent or newly introduced final draft, and unchanged re-read disk bytes under its lease. An old pending, missing/wrong terminal receipt or lost already-accepted ack must never become not-sent. If cleanup or persistence is uncertain, the old unknown remains. No source/history/deadline reset.
- Examine every ordering of pause, watchdog, disk write, read-back, ack, loss and terminal cleanup. Confirm a marker is never minted solely from a timeout or negative RPC. Examine whether the proof remains valid when the receiver stops after another checkpoint and whether an already-sent action could be relabelled.
- The final not-dispatched marker is bound to task/context/document/intent and this terminal receipt. Only that marker permits runtime/session/source-bound REVIEW to offer another fresh current consent; plain unsent legacy intents and all unknown sent finals keep prior restrictions. The new grant must differ and current merchant conditions must be reread. Native original controlled trace must not have consumed a final. No automatic final retry or successor.
- The 2.5-second heartbeat remains while no write checkpoint has been delivered; an offered checkpoint gets one separate 15-second fsync/ack deadline, not extended by polls. Task/command expiry stays unchanged. A stale unpolled browser actor still stops. Review the F-B availability tradeoff and all expiry branches.
- Five red reproductions were retained: pause during checkout/final write, two slow writes, and the earlier final-draft pause. New tests also cover explicit ack refusal, accepted ack with lost reply, inherited unknown and mismatched stop receipt. The new native-renderer test has FAKE merchant/API/storage but executes real production modules and DOM; it proves same-context source-bound consent after an unreleased final, then exactly one FAKE click and unknown-receipt non-repetition.
- C215 F-C/F-D/F-F and earlier unreassessed hardening remain disclosed limitations; do not label the full repo or real order accepted. If any lower finding becomes material due to this change, explain it. Receipt/detail/refusal/live speed and installation still need real evidence after software acceptance.

## Exact allowed foreground commands

1. python -B tools/delegation/verify_candidate_manifest.py docs/reviews/C-216-candidate-manifest.json
2. node --test test/desktop-c216-ack-truth.test.ts test/checkout-c216-ack-native.test.ts test/desktop-c214-r2.test.ts test/checkout-c214-r2-native.test.ts test/checkout-c209-controlled-review.test.ts test/desktop-c212-review-recovery.test.ts test/checkout-c212-bounded-waits.test.ts
3. python -B tools/delegation/run_review_checks.py docs/reviews/C-216-candidate-manifest.json

Run each once sequentially. No other commands/wrappers/background shell, line counts, report file or source edits. Loopback-only FAKE browser tests may run through the approved commands. Return AGREE/DISAGREE on the combined candidate, explicit F-A/F-B disposition, actual reads/outputs/limitations and remaining blockers. Codex independently audits actual modelUsage/firstParty/CLI max, commands/EOF, errors/denials/cleanup and source immutability. Budget48turns/1800seconds/USD10; cap is not provider quota.
