# C253: action-bound pickup rejection and automatic login continuation

The human requested immediate correction, fewer repeated controls, and direct deployment without waiting for Claude for this revision. Codex implements and self-verifies; no Claude invocation or independent-review claim is made. Existing one-unit Pro/R609/price/date/no-extras/no-payment conditions remain.

## Implementation

- Recognize the observed native pickup-option-invalidated alert only in the native fulfillment document. Text alone never resolves an uncertain final. A newly executed final records its exact command, intent, task, plan, document-local trace, absent prior alert and actual synchronous dispatch before a later observation can bind the rejection.
- Only that originating, unintervened, unexpired purchase can continue. Preserve the complete sent intent, pending command, accepted choice and rejection proof in an append-only bounded `finalRejections` array. Save before new actions, retain all prior archives and the original date cohort/floors, advance to the next original day, and select its terminal offer. Do not Add, recreate Checkout, switch to delivery, roll to a fourth date or reuse a final consent.
- R1 and R2 use the same production controller/parser. Native command allowlisting admits only the bounded rejected-final identity on `chooseSlot`; R2 durable patches preserve the rejection history and verify the exact transition from the preceding sent final.
- A pre-slot recovery stopped only at account authentication now waits for ordinary login and automatically rechecks the original approval/source/account/expiry/cart. Pause, unknown account and active unpaid order do not create a new attempt. Clear stale login wording only, not arbitrary diagnostics.

## Boundaries

Legacy submitted records did not capture this new command witness. The implementation MUST NOT manufacture it afterward or reinterpret a user-changed page as an originating reply. The currently retained old submitted record therefore remains intact; this release does not silently make it retryable. An unknown final, generic error, lost document, altered total, duplicate alert, receipt/reference, expired task or human intervention cannot release a final.

The existing routine Apple login delegation permits Root's supported normal browser form operation. This patch does not save or automatically fill passwords, expand host permissions, automate challenges or remove action-time legal confirmation during tool-operated testing. The product's existing single current-terms button remains explicit. Optional local pickup-data storage remains unchanged.

The old F1 plain-RETIRED orders-enabled entry issue is outside this repair. No personal Chrome profile, cookie, authenticated request, account identifier or order reference is test input.

## Verification

New tests exercise the real controller and a contained real Chrome renderer with FAKE merchant responses: first final rejected, next original terminal selected, fresh terms required, then one FAKE unpaid receipt, never duplicate success. They also cover proof mismatch, unknown outcome, human intervention, legacy witness absence, replaced main, duplicate error, price difference, final-date exhaustion, durable-write failure and login/pause continuation. All old assertions remain unchanged.

Initial controller reproduction: 3 positive/commit-bound tests fail against the old implementation; 12 protected negative cases pass. After repair all 26 new checks pass. Initial whole-source pass had all 2048 Node checks pass and one Python diagnostic-preservation regression; the production message update was narrowed without changing the old assertion. Exact final results are recorded separately with the candidate map.

Deployment means the source at the existing extension/application paths is updated. Personal Chrome must actually reload the module to execute C253. Root cannot operate forbidden browser-internal management/connection pages through an alternate tool. Do not equate source publication, isolated tests or a user reload report to an actual new unpaid order.
