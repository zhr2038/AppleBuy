# C-015 — close independently reproduced asynchronous action/evidence race

Meaningful bounded offline repair, not an installation workaround or quota probe. Same `E:\Apple Store`, unique original session retained privately, English collaboration, exact `claude-opus-5-5` / `xhigh`. Read full requirements, this task and the findings. Claude owns the technical solution; Codex owns criteria and independent acceptance. No self-approval.

Current input: **126 files**, SHA **`c37b239a27e9c057cc647c8726956d18aeb0f57b38597db2af82bef82413adff`**, manifest `docs/reviews/C-015-input-candidate-manifest.json`. The accepted C013 source's 125 bytes are unchanged; Codex added only `review/c015-async-evidence.test.ts`. Exact input checks: **413 total, 409 passing, four failing**; targeted six have two controls passing/four failing. All events, order identity, final grant, DOM and clicks are explicitly FAKE. Real merchant applicability remains unknown; do not infer that an actual Apple final page includes this anchor.

Read `docs/reviews/C-015-async-evidence-findings.md`, `.json`, the complete current `web/checkout-connector/page-program.js`, `chrome-port.js`, relevant `job.js` final-authorization call path, the new protected reviewer test, and unchanged tests relevant to your design. Do not read `.local`, credentials, history or raw browser data. Earlier C013 repair acceptance is bounded; this newly reproduced gap now blocks purchasing-source acceptance.

Reproduction: a recognized REVIEW fixture has exact one-unit plan, price, pickup store, Alipay, allowed terms and slot summary, plus one synthetic order-reference text. The page program snapshots purchase evidence and then awaits the reference digest. An injected digest microtask changes price to 99999, quantity to two, store outside the plan or URL to the human-auth route. The current program compares `expected` with the old decoded output, then sends the final FAKE click: all four independently fail. A current unchanged review without an order anchor still submits once; changed price before command decoding already stops.

Acceptance:

- A DOM action must use current same-document conditions at its actual decision point. Purchase, route/auth, controls, price, quantity, store, fulfillment, extras, date/time and final-grant drift during any decoding await cannot authorize a stale action. Do not weaken plan/merchant or final-grant checks, and do not turn an unknown into acceptance/refusal/no stock.
- Protect all action paths sharing this decoding gap, not only this one button. Keep the self-contained serializable ISOLATED program and truthful touched/untouched handling. If no write preceded an asynchronous decoding mismatch, structured delivery is false/untouched. Already-delivered ids remain touched and cannot repeat.
- A design may remove the action-path await or reject unsupported reference-bearing action pages instead of re-validating after the await. The protected test's alternate branch expressly permits a genuinely synchronous decision when no injected drift occurs; disclose which branch executes, never call an unexecuted fault proven. Keep stable normal positive behavior.
- Preserve observed public no-trade/no-AppleCare dependency, first-three-date terminal floors, unknown-result persistence and no-repeat/restart safeguards. Independently add implementation tests for adjacent action paths and relevant asynchronous observation/transport cases. Do not manufacture Apple interfaces, slot-refusal text, native Chrome installation or real speed.

You may edit only `web/checkout-connector/page-program.js` and, only if your design needs it, `web/checkout-connector/chrome-port.js`. You may create a new implementation test `test/checkout-c015-evidence.test.ts` and English report `docs/claude/C-015-report.md`. All 29 reviewer files and every existing implementation test are protected. No controller/job source edits, dependencies, scripts, permissions, tests weakening, install/grants, new agents, network/browser/site action, private reads or publication. If the permitted scope cannot safely solve the observed defect, return the exact dependency and evidence; do not expand scope.

Implementation profile: 40 requested turns / 1200 seconds / USD5 CLI cap. Only these exact Bash commands, no `cd`, shell composition, prefix/suffix or redirection:

```text
python tools/delegation/verify_candidate_manifest.py docs/reviews/C-015-input-candidate-manifest.json
node --test "review/c015-async-evidence.test.ts"
node --test "test/checkout*.test.ts" "review/c012*.test.ts" "review/c013*.test.ts" "review/c015*.test.ts"
node --test "test/*.test.ts" "review/*.test.ts"
```

Verify the input manifest before editing; it will intentionally mismatch after your authorized changes, so do not rewrite it or claim its old SHA approves new code. Deliver actual changed paths, coverage, branch evidence, commands/counts, limitations and remaining missing official contracts. Codex will read actual code, re-run tests and build the final candidate; any subsequent agreement is about that exact candidate.

No new order/hold/payment authority; historical Pro authorization consumed. Installation consent is received but actual user loading remains unconfirmed. Current-host access requires separate action-time consent. C014 live verification stays gated; this task uses no live actions. Only a genuine new provider quota in this already-restored productive cycle triggers Codex's save/sync/normal shutdown. Completion, cap, auth/permissions or install prerequisites are not quota; do not exhaust quota artificially and do not shut down yourself.
