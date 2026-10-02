# C-012-R1 continuation — preserve working repairs, close pickup proof, finish tests/report

Resume ONLY `11941a88-4609-4e7f-a2f8-78c5b5837285`, exact `claude-opus-5-5`, `xhigh`, English, `E:\Apple Store`. C-012-R1 reached its 1,800-second wall limit; the dispatcher confirmed all owned processes exited. It did not return a final structured result or delivery report. This is a timeout, not verified quota exhaustion. Do not start over or roll back working repairs. No other implementer is running.

Continue the exact requirements/scope of `docs/tasks/C-012-R1.md`. Read current five changed files (`page-program.js`, `job.js`, `chrome-port.js`, `control.js`, `control.html`), current implementation tests, the protected `review/c012-checkout-findings.test.ts`, and `docs/reviews/C-012-R1-independent-check.md`. Do not repeatedly re-read unrelated/unchanged historical bodies. Finish the implementation, meaningful tests and actual English delivery report. You may read all nine C-012 source files and the four checkout test bodies to close the unread scope of your earlier review. Do not self-approve your fixes.

Codex independently checked your saved partial changes: only the five allowed files changed; all 23 protected review files were unchanged at that checkpoint. The full suite returned 322/322 pass (before a new independent finding below). The ten initial protected repro assertions pass. A real Chrome native-DOM offline harness running production controller/program/ChromePort with an explicitly emulated transport and official-looking location completed both native option changes in order and stopped `VALIDATED` before Add to Bag, zero attempted resource actions, with the actual `public-config` mode and separate validation key. One local fake sample took 11 ms; it is NOT an Apple speed measurement or standalone extension proof. Do not claim any actual installation, permission grant, Apple bag/slot/order/payment action.

NEW required P1 F-K: `page-program.js` still defines pickup as a checked `我要取货` OR generic `店内取货`/`到店取货` prose. A synthetic visible UI has `我要取货` unchecked and `送货上门` checked, an allowed store checked, matching one product/quantity/total, generic `店内取货`, dates/time controls and `继续填写取货详情`. The decoder reports verified pickup and SLOTS despite the explicit conflicting fulfillment choice. Codex added a protected assertion after your timeout and independently reproduced it: 1 test, 0 pass, 1 fail. This is a purchase-condition defect, not styling. Selected/unselected current fulfillment controls must take precedence over generic/summary prose. With explicit pickup choice present and unselected, or conflicting/ambiguous/disabled selection, do not verify pickup or advance slot/checkout mutation. A later page without that choice needs unambiguous current merchant evidence; unsupported shapes remain blocked. Preserve legitimate no-radio synthetic summary paths, and cover contradictory/multiple-selection fixtures.

Remaining delivery:

1. Repair F-K without modifying the protected review test.
2. Add production decoder/action/controller integration tests for the observed public no-trade-in/no-AppleCare dependency and `public-config` stop/observe-only/no-purchase-key boundaries. Add meaningful tests for grant invalidation, retire/rebind, polling/hydration, pause/restart/unknown and enabled-date freezing as needed. Preserve existing assertions; adapt only a justified protocol/interface change and disclose it. Do not hide a failure with a simpler mock observation that skips the production decoder/action.
3. Run the exact approved suite and protected repro commands. Full suite now includes eleven protected cases. Do not alter the old historical manifest to make a verifier pass.
4. Return/write `docs/claude/C-012-R1-report.md`: exact changed files and attribution, each original finding and F-K result, actual commands/counts, no-extras fixed condition binding, validation/reconciliation rules, permission denials/quota/caps/unrun checks, and real-contract blockers. Source readiness is distinct from real purchasing readiness. You still cannot approve your own work.

Scope remains only `web/checkout-connector/` (unchanged permission declarations), `test/checkout-*.test.ts` or new checkout implementation tests, and that report. Do not edit `review/`, requirements/acceptance/docs owned by Codex, management tools, original manifests, credentials, `.local`, `.claude`, `.git`, packages or unrelated paths. No browser/network/merchant operation or other agent. No push.

Approved exact commands:

```text
node --test "test/*.test.ts" "review/*.test.ts"
node --test --test-reporter=tap review/c012-checkout-findings.test.ts
node --test "test/checkout-*.test.ts"
git diff -- web/checkout-connector test
```

Finish this small continuation without a new architecture rewrite. If a genuine quota/cap/permission blocker occurs, report it exactly and preserve the five existing repairs. Codex will independently inspect the final diff and run real native-DOM offline validation again before any bounded acceptance.
