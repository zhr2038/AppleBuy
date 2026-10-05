# C058 repair independently reproduced recovery defects

Implementation task, original terminal C056 session, same E:\Apple Store, English, exact first-party claude-opus-5-5/xhigh. Codex owns acceptance. C056 returned actual AGREE but Root rejects delivery over the reproductions below; do not relabel them non-blocking because some code predates the probe. No independent author may weaken these criteria. Input C058-candidate-manifest.json contains the unchanged196 candidate plus one new protected Root test (197 files). Read this task, requirements, C-058-independent-findings.md, the manifest and every affected production/test file to EOF before repair. Do not access private/home/transcripts or compaction artifacts.

## Reproduction and required behaviour

Run `node --test test/checkout-c058-recovery-repro.test.ts`. Before repair it has four failures and one passing originating-purchase control; all API, storage and merchant effects are FAKE. No real website, customer data or personal browser belongs in this task.

1. **False old-slot acknowledgement, two cases.** ChromePort seeds lastChoice from the old pending chooseSlot even for an observe-only replacement port. A different DETAILS document with verified purchase but no slot summary is converted to the old accepted slot. An actual PurchaseJob read-only rebind then clears the old unknown pending slot even when the new document's own verified summary says a different date. Required: a readonly/rebound replacement context cannot manufacture acknowledgement from the stored old choice; keep the pending resource and acceptedSlot null without replay or new authority. Preserve the positive originating authorised purchase-port progression and C051 same-context contact continuation. Claude chooses how the binding/evidence distinction is represented; do not invent merchant correlation or a no-hold guarantee.
2. **Competing context missed.** A disclosed official /shop/checkout/ is supported by the normal address guard but missed by the probe's literal path test. Required: both accepted checkout path forms prevent a second recovery checkout; no writes/action when blocked. Query failure/undisclosed context remains unknown, not global absence.
3. **Nested legacy final falsely absent.** taskDiagnostic only inspects top-level retired history. A finite nested legacy final is reported false. Required: a provable nested prior final yields true, and bounded/malformed/cyclic/overflow uncertainty never yields a positive absence. Keep the fixed privacy whitelist, no raw IDs/refs/hashes/URLs/contact/history/error values and no website or grant/action side effect.

Root's five tests are immutable. Add meaningful author tests in a new test/checkout-c058-author.test.ts if needed; no old test/fixture/assertion may be altered. Preserve original pending/final/history/expiry/date/floor/plan/quantity/store/price/extras facts and permanent readonly authority. No takeover of C057 or cosmetic changes. Non-blocking count6/probe-display/comment suggestions may be deferred unless necessary to these three fixes.

## Scope and validation

Allowed production edits only web/checkout-connector/chrome-port.js, job.js, control.js, closed-checkout-probe.js, task-diagnostic.js, and only as necessary for these fixes. No HTML/manifest/package/dispatcher/permissions/hooks/MCP changes. No agents, network to Apple, personal profile, authenticated requests, private screenshots or publication. Native network only the existing isolated owned FAKE loopback tests, after inspecting their public isolation source. Do not bypass any permission denial through a different tool/path.

Allowed Bash commands, each separately without append/pipe/filter/redirection:
1. python tools/delegation/verify_candidate_manifest.py docs/reviews/C-058-candidate-manifest.json (before editing only; old input will not approve repaired bytes)
2. node --test test/checkout-c058-recovery-repro.test.ts
3. node --test test/checkout-c058-author.test.ts (only if created)
4. node --test --test-reporter=dot "test/*.test.ts" "review/*.test.ts"
5. node test/c051-native-contact-repro.mjs
6. node test/c050-native-dates.mjs
7. node test/c040-native-order.mjs

Return exact changed files, repair evidence, full test/cleanup results, errors/denials/caps and remaining limits. Do not self-approve or claim installed/live/unpaid/Duo/full-goal readiness. Root will independently inspect, rerun targeted/full/native checks and create a fresh output manifest, then obtain actual full-scope consistency review. The prior C056 report also claimed all26 fresh EOF reads, but actual Read calls omitted test/checkout-c054-date-repro.test.ts; a test run does not substitute for this mandatory read. A later exact review must cover every required file honestly.
