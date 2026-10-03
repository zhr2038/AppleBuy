# C034 — preserve the known one-item cart across a resolved read-only successor

English, same `E:\Apple Store`, exact original recorded session, first-party `claude-opus-5-5` / `xhigh`. You are the primary technical designer/implementer now that an actual useful original-session review completed after quota recovery. Codex owns requirements/repro/independent acceptance. No agents, public network, personal Chrome/extension/account, private home/log/config/screenshot/input-value reads, publication, shutdown or real merchant actions. Do not work around denied reads; public task/report/source and approved commands are sufficient.

Read fully this task, `docs/requirements.md`, `docs/reviews/C-031-actual-cross-review.md`, `C-031-cross-review-verification.json`, `C-034-reproduced.json`, `C-034-input-candidate-manifest.json`, `docs/reviews/C-030-codex-takeover-report.md`; current `job.js`, `control.js`, `control.html`, `README.md`, `test/checkout-c030-retirement.test.ts`, `review/c034-successor-cart.test.ts`, `review/browser-retirement-self-check.mjs`. Don't claim unlisted whole-repository review.

Your actual C031 review returned DISAGREE for161/5b323fa3. Codex independently reproduced **six wrong additions and one positive BAG-start case**, using the actual current PurchaseJob and FAKE cart/transport. The first reviewer PRELAUNCH mock lacked a selected-choice acknowledgement, hiding two negatives; it was corrected before the final6/1 evidence. No product code or old tests were changed to create the finding. New input162 files include that protected reviewer test. The original161 bytes remain identical.

Business acceptance:

- Ending a resolved permanently-read-only cart rehearsal leaves its one item in the real cart; it cannot mean the cart is empty. A new task from ENTRY, VARIANT or configurable PRELAUNCH must not append another Pro or a Duo beside that Pro on the basis of reset markers/new authority alone.
- Preserve predecessor cart facts/history across the successor and restart. Public preparation may remain separately available if it performs no merchant resource action; don't disable that user capability unnecessarily. Choose the concrete design; do not simply delete history, renew old grants, weaken one-unit/no-extras checks or assume an empty cart from a human checkbox.
- The positive matching BAG-start successor must still perform exactly `['checkout']` with no Add to Bag. Avoid turning every valid matching-cart successor into a permanent stop.
- Any gate must truthfully tell the user that the old cart still holds an item and what normal next observation is required. A changed desired model doesn't authorize removing the prior item or shipping it. Do not invent a live empty-cart contract or undispatched merchant query. Disclose the residual if new cart-empty handling is outside this small repair.
- All seven protected reviewer cases must pass; all prior861 tests and existing4 rendered retirement cases remain. Add your own focused coverage including restart/predecessor facts and same/different-plan cases. No edits to protected old tests/reviewer tools/fixtures.

Fix the related README stale guidance that retired cart still contains its item. Small nits from your actual review can be corrected in README: public identifier case is lower-case `mk2m4ch/a`; old final paragraph's C010/C011 pending-review wording is historical and must not look current. No visual redesign.

Allowed writes only `web/checkout-connector/job.js`, `control.js`, `control.html`, `README.md`, new `test/checkout-c034-successor.test.ts`, `docs/claude/C-034-report.md`. Do not edit the page parser/ChromePort, source requirements, manifests/permissions/settings/MCP, review files, old tests, dispatcher, Git or earlier reports. If another scope is needed, explain and return without altering it. You cannot self-approve.

Exact unchained Bash only:

1. `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-034-input-candidate-manifest.json` (must pass before edits; mismatch after edits is expected, never approval)
2. `node --test review/c034-successor-cart.test.ts`
3. `node --test test/checkout-c034-successor.test.ts`
4. `node --test --test-reporter=dot "test/*.test.ts" "review/*.test.ts"`
5. `node review/browser-retirement-self-check.mjs`

Profile48turns/1200seconds/USD8. Return actual design, file changes, requirements/repro mapping, actual test outputs/errors/denials/caps, unrun limits and next precise checkpoint. Compact full reporter doesn't print totals; don't read private saved output or invent personally observed totals. Codex reruns the complete suite independently after delivery, then obtains real fresh-source agreement before acceptance/main. Current161 rejected candidate stays historical.

Duo public white256/15999/mk2m4 path and October16 20:00 preorder/October23 release are current recorded public facts, not live stock or online-pickup contracts. New Pro/Duo order/pay/slot submission remains unauthorized; original real Pro one-order authority was consumed, and normal Pro pickup/store preview question is still pending. User revoked shutdown.
