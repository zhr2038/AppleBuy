# C038 autonomous current-executor main-chain verification

## Business priority

The user needs one advance-configured start to reach official pickup and the terminal offered time, without sitting at the computer to drive each test. No visual work. C037 is actually accepted and published on main:171 source files, SHA05831e2ff72645f1d79cd1d2f3878b23868a0b8b8d931f9639739df7a2ff17b9. Existing complete offline order/reselection demonstrations use DomMotor; current native tests exercise actor/port fragments, not their complete orchestration. Your C037 report also noted native openBag and a nonempty side read are untested. Resolve this distinct main-chain verification gap, not another repetition of old mock counts.

You choose the verification design and implementation details within the established environment. Use actual unmodified production PurchaseJob, ChromePort and merchantDocument together, with native rendered DOM and clearly FAKE transport/merchant/authority/navigation/storage. A shim may supply only the Chrome plumbing and normal owned-loopback page transitions; it must never supply canned decoded observations, replace production decision/guards, or claim genuine installed-extension APIs. Ordinary DOM controls drive all simulated transitions. Record which facts are observed versus invented fixture dynamics.

## Required complete fresh reads

Read this task; docs/requirements.md; docs/reviews/C-038-input-candidate-manifest.json; docs/reviews/C-037-bounded-agreement.md; docs/reviews/C-035-official-cart-evidence.json; docs/reviews/C-036-normal-pickup-evidence.json; web/checkout-connector/job.js; chrome-port.js; page-program.js; review/browser-c035-boundary-self-check.mjs; review/browser-c036-pickup-self-check.mjs; review/browser-c037-store-repro.mjs; review/browser-self-check.mjs. Paths abbreviated after the first file in a directory refer to that same directory. Only normal paged Read on public inputs if tool-size limits otherwise prevent complete coverage. No private transcript after compaction.

## Acceptance

1. A repeatable self-running current-executor native journey starting with a normally recognized current empty bag: normal product entry and configured no-trade/no-Care, fresh two-read native bag boundary, exactly one simulated Add, re-check sole matching bag, checkout, pickup, current explicit one-piece summary, normal unselected R609/full Dalian label, first of the initially offered three dates and its21:15-21:30 terminal. Reach exactly one FAKE normal continue toward pickup details, then stop at a clearly declared simulated endpoint. Do not invent Apple acceptance/refusal/hold/order; the endpoint may be a safe known stop after observing the simulated next phase.
2. A complete corresponding already-matching-one-item journey starting on the product page: actual native nonempty side reads, production openBag actor/port normal navigation and re-check, zero Add, same normal checkout/pickup/summary/store/terminal progression. This proves the untested native branches along a composed job, not a test-only act() returning delivered.
3. Small meaningful integration fault coverage: other/two cart items before Add, side-read change or failure, and restart/late-result during a slot continuation. Wrong/unknown must not become empty/refused/no-stock, must not continue purchasing incorrectly, and must not produce a second Add or slot continuation. No weakening pending/final/readonly/PRELAUNCH/plan/quantity/price/store/date guards. Keep cases tied to this new composed journey; do not expand hundreds of mirrored unit cases.
4. One self-running command is sufficient, no human clicks. Use isolated headless fresh temporary profiles and owned127.0.0.1 server/contexts, block all other page origins and websockets, don't use personal profiles/accounts/extensions/credentials. After success AND errors cleanly close every owned side tab/context/browser/server; fail verification if cleanup fails. Emit a concise report under ignored .local with action/count/phase evidence and truthful simulation flags. Record reproducible local timing as local-only; no official speed claim.
5. Every171 accepted source/test/review file stays byte-identical. The old simulator remains intact and its full unpaid-order/reselection result remains historical bounded evidence. If actual current orchestration exposes a runtime defect, deliver the faithful RED reproduction and exact expected behavior; do not repair production code in this call. Codex will independently reproduce then dispatch a limited fix. Do not manufacture green by canned reads, preselecting required controls, skipping normal side reads/openBag/summary, deleting assertions, pre-writing success/pending state, or widening fake plan conditions.

## Allowed artifacts and commands

New artifacts only: review/browser-c038-main-chain.mjs, optional review/fixtures/c038-*.html or review/c038-*.mjs helpers, optional test/checkout-c038-main-chain.test.ts, and docs/claude/C-038-report.md. Existing171 source files, README/package/dispatcher/rules/permissions remain protected. No dependency downloads, hooks/MCP/config changes, project/private reads, source publication or other agents. Do not write sanitized manager reviews yourself.

Exact commands permitted:
- python tools/delegation/verify_candidate_manifest.py docs/reviews/C-038-input-candidate-manifest.json
- node review/browser-c038-main-chain.mjs
- node --test test/checkout-c038-main-chain.test.ts (only if created)
- node --test --test-reporter=dot "test/*.test.ts" "review/*.test.ts"
No other shell/git/cd chains, retries/workarounds for old denied resources. Read/Grep/Glob public project sources instead. Actual permitted command repeats are allowed only when new changes/failures justify them. English report: exact read/changed scope, actual paths/commands/counts/cleanup, red/green findings, FAKE boundaries, real unverified limits, precise recovery point, no self-approval.

Original same session/E:\Apple Store, first-party claude-opus-5-5/xhigh.48turns/1200seconds/USD10. No personal Chrome/Apple network, force-disabled controls, private data, real cart/slot/order/payment, installation, new permissions or shutdown. Original unique Pro order authority is consumed. Full Duo goal is incomplete.
