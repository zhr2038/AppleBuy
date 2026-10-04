# C043: one-start completion through a transient order-detail read loss

Claude Code is the primary designer and implementer. Use the exact recorded original session, E:\Apple Store, English, first-party claude-opus-5-5/xhigh. Codex owns independent reproduction, requirements and final acceptance. Read docs/requirements.md and this task completely before working. Choose the implementation yourself within the narrow scope below.

## Actual reason for this task

The user's direct quota-restoration report was checked with a useful real C040-R1 review. It returned successfully: firstParty Opus5.5/xhigh,250.72 seconds,17 reported turns, no quota/error/denial/private access/write/command, owned cleanup complete. It reported AGREE for exact175 SHA0597f4e1b30e60bf862b50b3d43034509be18c7334f37da649c5c25ac645b992. Root's delivered-line audit found only14 complete required files: the task's20 lines and94 lines of checkout-c040-recovery.test.ts were missing. The report's assertion that all16 were fully reread is therefore not accepted. Root has not accepted or promoted175 to main; C039173 remains the last accepted source. Do not repeat the unsupported coverage claim.

Your observation1 identified a possible scripting read rejection after following the observed receipt link. Root independently reproduced that failure using the actual PurchaseJob, ChromePort and merchantDocument in the labelled isolated native fixture. Two scenarios: baseline PASS; one post-lookup read rejection FAIL. All native checkout/slot/fields/payment/final actions occurred once, exactly one FAKE backend order existed, the observed receipt link was followed once, but the initial start returned NEEDS_VERIFICATION / final-result-unconfirmed; no resubmission, with pending submitOrder. A second Start or human Resume is not the required normal transient-loss solution. This is an offline transport fault, not proof of Apple's actual navigation timing or real order creation.

## Fresh complete inputs

- This task and docs/requirements.md.
- docs/tasks/C-040-R1-CROSS-REVIEW.md and docs/tasks/C-040-R1.md.
- docs/reviews/C-043-input-candidate-manifest.json and C-043-independent-findings.json.
- docs/reviews/C-040-R1-user-restoration-verification.json and C-040-R1-user-restoration-review.md.
- docs/reviews/C-040-R1-independent-verification.json.
- web/checkout-connector/job.js, chrome-port.js and page-program.js.
- review/c043-independent-native-lookup.mjs (Root-owned protected regression).
- test/c040-native-order.mjs, test/checkout-c040-recovery.test.ts and test/checkout-c023-final-lookup.test.ts.

Use normal public paged Read for size limits with no gaps. No private transcript after compaction. Explicitly list actual unread lines or unsupported assertions rather than claiming complete coverage from summaries.

## Required outcome and scope

Make the already-sent final's independent detail lookup tolerate a bounded transient read transport rejection and complete within the INITIAL run when fresh matching detail proof becomes available. Never replay submit, create another order, reconstruct an order endpoint, follow an unobserved link, reset pending/final/history/authority/expiry or claim an unknown result accepted. Preserve actual permission/address/document checks and the existing original pending deadline. Permanent failure, malformed/unrecognized returned evidence, wrong quantity/spec/price/store/date/slot/identity, authentication and missing host authority remain unconfirmed. Read-only reconciliation must not navigate or perform purchase actions.

This requirement is functional: safe stopping alone does not satisfy one-start recovery for this bounded transient fault. Do not weaken any old assertions or the Root reproduction. Do not paper over it with a second run, automatic grant recreation, fixed success data, unconditional retries, canned lookup results or additional mutation.

Allowed writes only: web/checkout-connector/chrome-port.js and job.js if genuinely needed; new author tests test/checkout-c043-lookup.test.ts; docs/claude/C-043-report.md. All other175 input paths, especially page-program.js, old tests, review/c043-independent-native-lookup.mjs, permissions/manifest/dispatcher/README, must retain exact bytes. No unrelated source, appearance, permissions or package changes. No writing manager-owned docs/reviews or review resources. A permission denial is final for that resource; disclose it, do not retry through another tool or location.

## Exact allowed commands

1. node --test test/checkout-c043-lookup.test.ts test/checkout-c040-recovery.test.ts test/checkout-c023-final-lookup.test.ts
2. node review/c043-independent-native-lookup.mjs
3. node test/c040-native-order.mjs
4. node test/c039-native-pipeline.mjs
5. node --test "test/*.test.ts" "review/*.test.ts"

No other shell command, networking, private output read/Grep/Glob, personal Chrome, extension/control, other agent or publication. Native scripts may use only their guarded owned loopback fake fixtures and ephemeral profiles. Their printed .local result paths are not read permission. Use returned command output; Root reads private artifacts independently.

## Acceptance

- Root's baseline and one-transient-loss cases both confirm one exact unpaid FAKE order in the first start, one final submission/one observed-link navigation/no mutation replay, and clean owned contexts/browser/server.
- Add meaningful unit faults proving bounded permanent rejection, permission/closed/unsupported address stop, returned unrecognized/malformed evidence stop, exact wrong-detail nonconfirmation and read-only no-navigation; retain old C023 and C040 assertions unchanged.
- C040 native8 and C039 native8 remain green; full Node suite passes without skips, todos or weakening protections.
- Report actual changed files, test failures before fixes, complete scope, remaining real gaps and denials. Do not infer actual turns/cost from estimates; Root's structured receipt is authoritative and resumed modelUsage can include historical aggregate usage.
- Implementation and tests are not final acceptance. Root independently reruns changed/failure paths, checks exact new source manifest and asks for an actual fresh exact-source review before accepting.

48 CLI turns /1200 seconds /USD8. No new real Pro/Duo order, payment, slot submission, host permission or bypass authority follows. The real refusal catalog remains empty; Duo's official approval/not-yet-on-sale/no-pickup/disabled-Continue gate remains intact. No shutdown.
