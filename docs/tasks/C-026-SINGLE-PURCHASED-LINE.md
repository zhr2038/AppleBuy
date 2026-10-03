# C026 — preserve one purchased line without counting accessibility titles as units

English; same `E:\Apple Store`; resume the unique original private session; exact first-party `claude-opus-5-5` / `xhigh`. You are the primary technical designer and implementer. Choose the concrete implementation. No agents, network, browser, extension/account/private data, publication or shutdown. The user cancelled shutdown. No real bag/slot/order/pay permission is added.

Read fully this task, the original `codex_claude_pickup_project_prompt.md`, `docs/requirements.md`, `docs/reviews/C-025-Claude-feasibility.md`, `C-025-actual-verification.json`, `C-025-Codex-assessment.md`, `C-025-native-checkout-observation.json`, `C-026-before-verification.json`, `C-026-input-candidate-manifest.json`; current `web/checkout-connector/page-program.js`, `job.js`, `chrome-port.js`; full independent `review/c026-purchased-groups.test.ts`; previous `review/c024-checkout-money.test.ts` and `test/checkout-c024-evidence.test.ts`.

The Chrome controlling extension was restored. Codex's current supported read-only evidence: one purchased bag line, explicit quantity1/total9999; the human entered checkout/logged in. The FULFILLMENT page has one actual shipment group/product strip but two exact title representations, one being a screen-reader legend. The opened summary has only public subtotal/total9999 and no observed product/quantity. Normal opening/closing that disclosure is read-only and needs no new generic confirmation; Codex did it without choosing fulfillment/slots/orders. No native quantity contract was established, and the old rebound task remains permanently read-only. Do not implement a route that guesses quantity from money, one group, a title or old flags. Do not claim your earlier unexecuted H5 proposal was already verified before Codex's new cases.

Fix the actual independently reproduced guard defect, keeping the one-unit requirement and usable positive behavior:

1. Two independently purchased product groups/rows with matching text cannot be treated as one planned product just because every title equals the planned title and a separate synthetic quantity1 exists. Item proof and corresponding action must be unverified/untouched.
2. A single recognized purchased group may legitimately repeat its title for accessibility, as the actual native observation shows. Preserve that synthetic explicit-quantity1 interface positive. A title count is not a unit count. Unknown quantity still stops.
3. A second independent group introduced after reading must not remain equivalent evidence for a prepared action; no pickup click.
4. The actual ChromePort/PurchaseJob fake transport must stop before any action for duplicate groups. A previously sent Checkout must remain unconfirmed with its original pending record; no clear/repeat/new action based on wrong group proof.
5. Keep recognized bag anchoring, hidden/duplicate bag protections, current-money/cap, correct-store, native-choice, missing/conflicting quantity, fresh re-entry, permanent readonly task, unknown-final/no-repeat and pause/restart guards intact. Do not weaken old tests or acceptance.

These are FAKE structural adversaries, not observed Apple two-unit behavior. All seven root cases are protected. The source149 accepted bytes are unchanged. Input150 SHA `5afded29c3af7af96e01ce3dec008fb6a1cab71cff5dbae78c9b735571677f52` is accepted149 plus this new seven-case review file. Full pre-change actual716/711/5; all original709 pass. Initial fixture716/714/2 and its correction are disclosed in the before receipt; use the corrected input. Do not approve another source map using that hash.

Allowed writes only: `web/checkout-connector/page-program.js`, a new `test/checkout-c026-lines.test.ts`, and `docs/claude/C-026-report.md`. Do not edit/delete any input test/review file, requirements, manifest, extension permissions, job/ChromePort, private state or other source. If the bounded source cannot fix it correctly, explain the precise missing scope rather than weakening the tests or inventing live facts.

Profile implementation32 turns/900 seconds/USD6 CLI cap. Only exact unchained Bash:

1. `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-026-input-candidate-manifest.json` (before changes; afterward a mismatch is expected and must not be hidden).
2. `node --test review/c026-purchased-groups.test.ts`
3. `node --test test/checkout-c026-lines.test.ts`
4. `node --test "test/*.test.ts" "review/*.test.ts"`

Return and save an actual report: files/behavior changed, how the one-group screen-reader representation differs from two purchased groups, actual tests/counts/intermediate failures, scope fully/partially read, limitations/denials/caps and unexecuted paths. Do not approve your own work. No native actions or timing claim; missing live checkout quantity is still a business blocker. Codex independently verifies all changes and failure paths, then sends the exact current candidate back to the same original session for consistency review.
