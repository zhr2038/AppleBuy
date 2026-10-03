# C018 independent review — bounded offline evidence compatibility

Codex inspected the actual three-file patch and complete current `job.js`, `chrome-port.js` and `page-program.js`, the author report and new implementation test. The first displayed current page-program read was truncated in its middle; a separate read filled lines76-190 before this assessment. This is independent review, not the author's self-approval.

Exact candidate:133 files, SHA `4ead4c58aa4e9551db8b1c631fedec39a3a53e98ca3ee99f33d9e5fcff2e8fa5`, `C-018-candidate-manifest.json`. Compared with132-file input `7c3ab1049bed5c08d2c77f2679e83c5044c549aa770885ca895f66ae065c13aa`, only `web/checkout-connector/job.js`, `page-program.js` and `chrome-port.js` changed, and one10-case implementation test was added. All66 input test/review paths, all other source, control/HTML/manifest, dispatch tools and settings remain unchanged. Git tracked plus non-ignored untracked source inventory exactly matches the133-file map. No new runtime helper or dependency was added.

## Findings and independent evidence

Before the patch, the protected16-case transport/persistence reviewer had4 failures; the full suite was467/471 with all455 old cases passing. Independently after the patch, the full suite is481/481, exit0, no failures/cancelled/skipped/todo, duration6160.1735ms at2026-10-03T04:40:32.719851+00:00. This includes the protected16-case reviewer and10 author cases. Logs remain private; public counts and actual scope are recorded in `C-018-actual-verification.json`.

Canonical comparison recursively ignores JSON object-member order while preserving JSON values/types, array order/length and member presence. The page-side implementation stays inside the serialized function; malformed/non-string expected evidence remains positively untouched, with no command-id consumption. Authorization and delivery-memo checks retain precedence. Actual changed evidence is still refused before a write. The stored normalized plan compares semantically, but exact schema/digest/tab checks and explicit rebind rules remain intact. `normalizeIntent`, the control digest and legacy-extras migration are unchanged.

The port fingerprint also uses the same semantic comparison. This additional changed comparison is justified: member-order-only freshness would otherwise make an unchanged refused slot eligible in another generation. An independent frozen-input/current-code check over fake queue observations produced old generations `[1,2,3,4,5]` and current `[1,1,2,2,3]`. Reordered identical members keep generation; actual enabled-state and date-array-order changes advance it. `C-018-generation-boundary.json` is explicit fake evidence, with zero merchant actions.

The protected negatives still reject changed choice state, array ordering, null-to-zero, boolean-to-number and missing/extra evidence. Changed tab, model or cap remains blocked with unknown history retained. The author cases additionally exercise malformed expected evidence, delivery-memo replay, serialized re-entry, wrong digest, legacy no-extras normalization and plan-array changes. Unknown Add to Bag remains preserved and reconciled without repeat. Confirmed unpaid returns without observation or a second execution. Validation and purchase storage remain separate; no reset, erase, retirement, automatic rebind, increased retry bound or untouched-counter reset was introduced.

The JSON-compatible domain matters: undefined/functions/NaN are not new supported evidence types. Existing JSON serialization behavior for such non-JSON inputs is not broadened by this change.

## Actual Claude execution and report qualification

Actual implementation returned successfully on the sole specified first-party `claude-opus-5-5`, requested `xhigh`; full structured modelUsage, primary/auxiliary models, permissions, caps and process cleanup were checked. No provider quota, timeout, permission denial, network or agent use occurred. Reported36 turns with a30-turn CLI setting and cumulative resumed-session usage are recorded as reported counters, not a quota failure or incremental billing. Root verified the complete persisted output of the actual full-suite Bash result:481/481. Five actual shell calls matched the task allowlist. All five written paths match the authorized scope.

The trace verifies13 fresh complete Reads and one partial page-program re-read. The author's report also claims later complete task/port re-reads, but no second complete Read is present in this captured invocation. Those repeat claims receive no verified-read credit. The initial required complete reads did occur. The exact consistency review must freshly read its required scope instead of relying on any claimed repeat. The author's statement that added files would mismatch the old manifest is imprecise: that verifier checks listed hashes; root separately checked new-file inventory for this candidate.

## Acceptance boundary and recovery

Codex finds no blocking issue in this bounded offline repair after these independent checks. Actual exact author consistency agreement is still pending; a task dispatch or tests alone cannot supply it.

The human native `repeated-untouched-failures` report is preserved. Neither installed extension bytes, native per-action reason nor actual browser serialization order was captured. The offline defects are proven; the native cause remains unproven. After precise agreement, the next step is a controlled human reload and bounded public Pro configuration ending before Add to Bag, retaining all existing validation/purchase records. If it still stops, preserve its exact report and investigate without blind retries or state deletion.

No new purchase, order, payment or real pickup-slot authorization exists. No bag/slot/order/payment action was performed for this task. Native installation/API execution, real list refusal/freshness/acceptance contracts, Duo current SKU and flow, checkout date semantics, application-created endpoint and real timing remain open. `REAL_PURCHASING_READY=false`; the full goal remains active.
