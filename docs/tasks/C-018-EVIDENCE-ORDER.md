# C018 — preserve semantic evidence and purchase bindings across object-member order

Freshly read the COMPLETE current `docs/requirements.md`, this task, `docs/reviews/C-018-evidence-order-findings.md`, `docs/reviews/C-014-human-readonly-feedback.json`, full `web/checkout-connector/page-program.js`, `chrome-port.js`, `job.js`, `control.js`, protected `review/c018-evidence-order.test.ts`, the applicable old public-configuration/job/continuity tests, and C017 bounded agreement. Do not count a prior-session read as this requested fresh read. Exact input is `docs/reviews/C-018-input-candidate-manifest.json`:132 files SHA `7c3ab1049bed5c08d2c77f2679e83c5044c549aa770885ca895f66ae065c13aa`, all131 C017 files unchanged plus the one independent reviewer. Same workspace and original recorded session, English, exact first-party claude-opus-5-5/xhigh; no substitute model or agent.

## Demonstrated problem and required outcome

Human native public configuration currently fails; its actual per-action cause, installed bytes and JSON ordering are unverified. The independent offline transport/persistence permutation demonstrates4 failures out of16 new cases, full467/471 with all455 old cases passing. Fix this concrete compatibility issue without claiming it establishes the native cause.

You choose the implementation. Semantically identical JSON-compatible evidence and normalized bound plans must not differ solely because object members arrive in another order, including nested objects. Field values/types, array ordering, presence/absence and meaningful facts remain exact and fail closed on change. The serialized page function must remain self-contained and usable across its existing re-entry boundaries. No unsafe eval, foreign state or undocumented Apple network interface.

One public-configuration run under the permuted fake transport must select each prerequisite once, re-observe between choices, verify the configured item/quote and stop before Add to Bag. Preserve separate validation storage and the old purchase task. Identical reordered persisted plans must remain attached to the original task, digest and tab. Unknown Add to Bag stays preserved and reconciled without automatic repeat; confirmed unpaid history remains completed without a second page read/action. Actual tab, model, price cap, digest or plan changes must stay blocked.

Keep current exact digest/legacy-extras migration compatible; do not change the task identity or let a mismatched digest through to make a test pass. Do not reset/erase validation or purchase state, retire/rebind automatically, reset untouched counters, relax freshness/memo/type/field/date/slot/authorization/unknown-result checks or increase bounds. Native controlled reload and a later real bounded result remain separate verification. No new purchase or resource action is authorized.

## Allowed implementation and evidence

Write scope: `web/checkout-connector/page-program.js`, `job.js`, `chrome-port.js`, `control.js` only if justified by this defect; at most one new local helper under `web/checkout-connector/` if needed and compatible with serialized injection; one new implementation test `test/checkout-c018-evidence-order.test.ts`; `docs/claude/C-018-report.md`. Keep changes minimal and explain every changed comparison. Other source/HTML/manifest/open/owner/declarations, all old tests, every `review/` file, requirements, input manifest, dispatch tools/settings must remain untouched. No dependencies, browser/native/extension-manager access, network, agents, private files/storage/history/credentials or publishing. Do not create an HTTP surface, use CDP/profiles or any alternate access into a blocked internal page.

Only these exact shell commands, without flags/chaining/wrappers/redirection:

- `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-018-input-candidate-manifest.json` (before edits; input mismatch after an allowed edit is expected)
- `node --test review/c018-evidence-order.test.ts`
- `node --test test/checkout-c018-evidence-order.test.ts`
- `node --test "test/*.test.ts" "review/*.test.ts"`

Report actual changed files, source comparison semantics, exact passed/failed tests, pending/history preservation, all full-versus-partial reads and remaining native limitations. Do not self-approve. Codex independently inspects changes, runs tests/failure paths and obtains actual precise-scope consistency agreement before any human reload. A provider quota error must be reported as such with actual evidence; local wall/turn/dollar caps or successful completion are not quota. No empty work to consume quota.
