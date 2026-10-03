# C024 — current checkout evidence adapter toward pickup progression

English, same `E:\Apple Store`, exact first-party `claude-opus-5-5` / `xhigh`, original private session. You design and implement the technical approach. Codex sets these business boundaries/acceptance. No other agent, browser/network/extension/account/private-data access, publishing, shutdown or real cart/slot/order/payment mutation. The user prioritizes working purchase flow over UI polish.

Next actual flow blocker is FULFILLMENT. Current supported readonly Chrome evidence before the driver required updating: one Pro256black title, no explicit quantity in the shipping product strip, one visible button `data-autom=companionbar-button` caption `显示订单摘要： RMB 9,999`. The summary dialogue had split subtotal/shipping/`orderTotalValue` spans, with no confirmed safe visible linkage/quantity; do not borrow hidden or unrelated dialogue data. Current decoder ignores this total structure, and quantity really remains unproved there. This task advances current-page evidence recognition and its safe normal-flow decision; it cannot invent missing quantity or use an old bag flag as current server proof.

Codex independently added14 FAKE cases derived from that public structure: full684/681/3, original670 all pass, accepted147 bytes unchanged. Input148 files SHA `9eff87ea10468fe6beb3a5c7cba09b96685b726f4b1d268d8d32319c2d3f5ac3`,82 protected test/review files. Actual captured layout is distinguished from synthetic explicit quantities/contradictions and checkout actions. Current native corrected BAG confirmation/driver update is still pending.

Read fully this task, `docs/requirements.md`, `docs/reviews/C-023-bounded-agreement.md`, `C-022-native-quantity-observation.json`, `C-024-before-verification.json`, `C-024-input-candidate-manifest.json`; full `review/c024-checkout-money.test.ts`, current `web/checkout-connector/page-program.js`, `job.js`, `chrome-port.js`.

Choose the minimal supported design. Business change limited to `page-program.js`; own cases only `test/checkout-c024-evidence.test.ts`; report `docs/claude/C-024-report.md`. Preserve every other148-input byte and all82 protected files, UI/permissions/settings/dispatcher. If completing quantity/flow needs additional live proof, state exactly what proof and where the workflow must stop; do not weaken the one-item matcher, create a shadow successful path, duplicate mutations or call it production-ready. No UI cosmetics or unrelated state-label cleanups.

Acceptance:

1. All14 independent cases and old670 pass. Recognize the one current visible supported checkout summary total as current currency evidence only in its observed official checkout scope. Existing labelled totals retain their behavior; conflicts/duplicate header widgets (even equal), hidden/off-route/subtotal/unsupported currency/zero/over-cap evidence cannot silently become authorization. Do not deduplicate distinct semantic widgets into one or reuse old quote as current total.
2. Quantity is never inferred from a title, one product line, price, prior run/bag or absence of a badge. In observed FULFILLMENT with no explicit quantity, purchase.itemVerified stays false, no pickup/store/slot/order command is delivered, and no no-stock/confirmed-order conclusion is emitted. Describe the exact residual needed for actual autonomous checkout, not just repeat that tests pass.
3. With a synthetic explicit one-unit quantity and otherwise matching fresh total/specification the normal selectPickup operation must remain usable; zero/two/unrecognized quantity, cap/spec/store conflict and stale price cannot. This positive is a tested interface, not evidence Apple renders that quantity.
4. Preserve quantity121/hidden/nested/literal-conflict repair, ambiguous cart/checkout controls, initial-three dates/terminal floors, refusal→fresh-list→accepted mock progression, unknown-final/no-repeat/expiry/grant/lock/pause/auth and readonly invariants. No disabled controls forced. Required runtime decisions stay local, no LLM in the purchase path.

Implementation28 turns/900s/USD5 CLI cap. Only exact unchained Bash:

- `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-024-input-candidate-manifest.json` before edits
- `node --test review/c024-checkout-money.test.ts`
- `node --test test/checkout-c024-evidence.test.ts`
- `node --test "test/*.test.ts" "review/*.test.ts"`

Return actual design, paths, command/count evidence, full/partial reads, denied/unrun/cap/provider limits, concrete missing native quantity contract and next executable validation. No self-approval; Codex independently reviews/tests and dispatches precise-source consistency. Full Duo goal remains unproved and no new real purchase authority is supplied.
