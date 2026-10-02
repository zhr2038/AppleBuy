# C-012-R1: actual repair, quota interruption and Codex completion

Current verdict: **PASS_CODEX_ONLY_OFFLINE_REPAIR_VERIFICATION_PENDING_CLAUDE_AGREEMENT**. The extension is uninstalled and real purchasing is not ready. This report is Codex-authored; it is not the missing Claude delivery report.

## Actual collaboration and attribution

The actual original-session Opus 5.5/xhigh C-012 review returned successfully on October 2 and rejected the 115-file candidate for wrong-store proof and repeated bag additions. Its partial C-010/C-011 agreement remains limited to the disclosed read scope. [Actual review](C-012-Claude-cross-review.md).

Actual C-012-R1 reached its 1,800-second wall cap with owned process cleanup confirmed; no final modelUsage/report returned. A timeout did not authorize Codex takeover. Codex checked the saved five-file partial repair, ran 322 passing tests and returned an independently reproduced fulfillment conflict in the same session.

Actual C-012-R1-CONTINUE ran October 3 00:17:37–00:24:03 Asia/Shanghai, 386.59 seconds, 15 reported turns. It returned `is_error:true`, exit 1 and a genuine session-limit message reporting **04:10am Asia/Shanghai**. It was not a timeout. Structured modelUsage names only `claude-opus-5-5`; the dispatcher successful-delivery model gate is false because the provider emitted a synthetic error event. There is no delivered final report or mutual acceptance. Owned process cleanup is confirmed; no second implementer was running when Codex took over under the user's existing quota exception. No private invocation or billing data is published. [Sanitized receipt](C-012-R1-verification.json).

Claude's saved changes are `page-program.js`, `job.js`, `chrome-port.js`, `control.js`, `control.html` and the new `test/checkout-r1-public-configuration.test.ts`. They implement the observed normal no-trade-in/no-AppleCare dependency, fixed no-extras intent, durable single bag-addition history, explicit fulfillment control precedence, expiry-safe final lookup, truthful known pre-send pause, positively untouched failures, elapsed-time polling, separate public-config/observe modes, constrained retirement, read-only rebind and grant invalidation. Codex's first run of the final partial returned **339 pass / 3 fail / 342 tests**; the three failures were cross-VM prototype assertions in the new emulated transport.

Codex then changed exactly two implementation files; the exact additional diff is [C-012-R1-Codex-completion.patch](C-012-R1-Codex-completion.patch):

- `page-program.js`: exact store-name binding instead of accepting an allowed prefix with a second store; conflicting/multiple quantity lines cannot be overridden by one select; after the native time `change`, production evidence, actual selection, date, store/product/price and controls are checked again before Continue. Drift stops with `touched:true`; it is not a safe-to-repeat untouched result.
- `test/checkout-r1-public-configuration.test.ts`: clone VM results at the emulated Chrome document boundary, matching actual structured-clone transport and retaining all strict assertions. No acceptance criterion or expected result was weakened.

Codex added independent fault criteria in `review/c012-native-selection-findings.test.ts`. Five initial cases returned **1 pass / 4 fail** before the source completion: reset-to-earlier time, disabled/control/date/store/product drift, quantity contradiction, and composite store evidence. The positive terminal control passed beforehand. A queued microtask quote-drift case was also added and passes after repair. The original eleven reviewer cases and all **23** review files present before takeover remain byte-identical. Permission declarations, packages, hooks and management tools were unchanged.

## Independent verification and practical limits

`node --test --test-reporter=tap "test/*.test.ts" "review/*.test.ts"` returned **348/348 pass**, zero failed/skipped/cancelled/todo, 5,875.2081 ms. `git diff --check` passed. The current 118-file source manifest verifies SHA256 **`c188ab67d092bbfa04edd56c322ffc1733af8a5f57d362993211e9d413b919ad`**. The historical rejected 115-file manifest was preserved, not overwritten.

In the user's actual Chrome, Codex ran production PurchaseJob/ChromePort/serialized merchantDocument on an isolated native-DOM fixture. One start selected no trade-in, re-observed the enabled no-AppleCare choice, selected it and stopped `VALIDATED` before Add to Bag: zero resource attempts, no purchase-task record. The Chrome API transport, host permission, document ID, storage and official-looking location are emulated; this does not prove extension installation or standalone `executeScript`. One fake local sample took 13 ms; this is not an Apple timing benchmark. Screenshots and raw evidence remain private.

The existing offline core was independently run with `node src/cli.ts rehearse --scenario refuse-then-accept --json`: first refusal, fresh-generation reselection, accepted continuation and `REHEARSAL_ENDPOINT`, all six checks pass, final submits 0. This uses project mock-v0, not Apple. The current official Pro page's normal two-option dependency was separately observed through allowed Chrome controls; no new bag, slot, order or payment action occurred.

Still unverified: actual current-source Claude agreement including all Codex code; extension installation/exact-host grants and native transport; secure merchant bag/details/review/receipt/date fields; real refusal/updated-list signals; Duo checkout mechanism; protected-profile integration; actual app one-start Apple latency. Refusal anchors remain intentionally empty. A checkbox/normal progression is not a held slot; unpaid-order pickup timing may be determined after payment. The earlier Pro order authorization is consumed.

## Exact recovery and the user's next-cycle shutdown instruction

Use [C-012-R1-REVIEW](../tasks/C-012-R1-REVIEW.md) after the reported next reset, original session `11941a88-4609-4e7f-a2f8-78c5b5837285`, same `E:\Apple Store`, English, exact Opus 5.5/xhigh. Verify the current manifest and no unresolved/active invocation before dispatch. The automated recovery must be verified separately; a scheduled task is not a review result.

The user now asks to continue normally after the next Claude reset and, when that next cycle actually hits provider quota, save project/test/recovery state and shut down. Do not shut down for this already-recorded quota event, consume quota artificially, treat a local wall/turn/cost cap as provider exhaustion, or broaden merchant/installation authority. Save and sync reviewed public output first, record any sync failure, stop only owned project processes, pause the follow-up after its one-cycle shutdown action, and do not force-close unrelated applications.
