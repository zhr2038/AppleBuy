# C-020-CART-STAGE — repair anchored-cart stage recognition

Codex dispatches this independently reproduced business defect; you are the technical designer and primary implementer. Work in `E:\Apple Store`, English, exact first-party `claude-opus-5-5` at `xhigh`, resuming the unique original session retained by the dispatcher. No replacement model or additional agent.

## Goal and evidence

Correct the executable cart/stage confusion so advance-start automation respects the current recognized step, keeps the single normal cart checkout usable, and stops unknown carts before any command. Requirements R02,R03,R06,R07,R08; A01,A04,A06,A07,A09,A10. This continues the real one-start purchase objective; it is not a UI/design task.

Read these complete current inputs before editing:

- `docs/requirements.md` and the current section of `docs/plan.md`;
- this task, `docs/reviews/C-020-cart-stage-findings.md`, `docs/reviews/C-020-before-verification.json` and `docs/reviews/C-020-input-candidate-manifest.json`;
- the full `review/c020-cart-stage.test.ts`;
- the full `web/checkout-connector/page-program.js`, `web/checkout-connector/job.js` and `web/checkout-connector/chrome-port.js`;
- `docs/reviews/C-019-R2-independent-review.md` for the explicitly bounded prior acceptance and its disclosed residual.

Input identity:138 files SHA256 `f8c406f91a12ef80b3b4b53551f8ba2f1a4eae81b3b2310ef62ace017dbab7a1`,72 protected test/review files. Actual Codex baseline537 total/520 pass/17 fail, all prior515 pass. All137 prior source bytes are unchanged. The independent cases have explicit negative direct-command and controller paths plus normal cart/checkout and human-gate positives.

## Deliverable scope

Choose and explain the implementation method. Limit business changes to `web/checkout-connector/page-program.js`, add implementation tests in the new `test/checkout-c020-cart-stage.test.ts`, and write `docs/claude/C-020-report.md`. Preserve every other input byte, all72 protected test/review files, permissions/settings, controller, ChromePort and dispatcher. If evidence requires expanding scope, report the concrete limitation instead of silently editing outside it. Do not write management/review/task documents or claim final acceptance.

## Acceptance

1. All22 independent cases pass. Unknown or ambiguous anchored carts cannot borrow foreign fulfillment/payment/details/review controls as step authority: decode UNKNOWN/verifiedStep=false, direct foreign-stage operations remain untouched, and PurchaseJob emits zero commands/pending resource writes.
2. The recognized one-item observed-style cart keeps BAG and takes exactly its previously proved bottom checkout even alongside the synthetic fulfillment decoy. No blanket fail-closed shortcut may break this positive.
3. AUTH, CONSENT and PROCESSING keep their human/processing priority. Ordinary no-anchor checkout still selects pickup and proves only the unchanged user's plan. The already accepted public configuration endpoint and normal terminal/refusal/fresh-reselection/acceptance chain remain passing.
4. Fresh evidence, exactly one item, noextras/cap/store/date/time conditions, delivery truth, pause/write-ahead/pending, unknown-result reconciliation, memo and no-repeat boundaries must remain intact. No disabled control is forced and no user purchase condition is expanded.
5. Add your own meaningful cases covering your repair and its positive boundaries. Run the reviewer test, your implementation test, and complete approved regression. Report exact tests, all counts, errors, unexecuted checks and remaining limits.

This is entirely offline. The malformed/stage-decoy combinations are not observed Apple contracts; do not invent merchant APIs, refusal signals or live readiness. The user has deleted the cart and paused the executor. No real browser, extension operation, network, private file, account/auth value, cart/slot/order/payment mutation, publishing or unrelated project access is authorized. Do not read `.local`, private Claude history or unrelated tool-result files.

## Budget and allowed commands

Implementation profile:28 CLI turns,900 seconds wall cap,USD5 CLI cap. Local caps are not provider-quota exhaustion. Only these exact Bash commands are allowed, directly with no shell chaining/wrappers:

1. `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-020-input-candidate-manifest.json`
2. `node --test review/c020-cart-stage.test.ts`
3. `node --test test/checkout-c020-cart-stage.test.ts`
4. `node --test "test/*.test.ts" "review/*.test.ts"`

Run the input verifier before editing. A later mismatch on legitimate delivered source is expected and cannot approve added files; Codex will independently build a complete new candidate. Do not reinterpret that mismatch, task success, a permission error or a local cap as exhausted provider quota.

Return the report with design decisions, actual modified files, requirement/test mapping, executed command counts/results, unrun tests, permission/cap/provider failures, accurate reading scope, offline-versus-live boundaries and the exact repair checkpoint. Do not approve your own work or weaken the independent acceptance packet.
