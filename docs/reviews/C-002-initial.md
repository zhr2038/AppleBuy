# C-002 independent review — repairs required

Reviewer: Codex. Date: 2026-10-01. Decision: **not accepted**. No product source has been published as an accepted milestone.

The real Claude implementation session is `cc5b30a2-ea93-4a97-9c0b-f4ac8e78d684`, using `claude-opus-5-5` with Extra (`xhigh`). The dispatcher reached its 1,200-second wall budget and terminated its own subprocess. This was a time-budget stop, with no observed quota exhaustion. There was no final structured delivery report. Resume this exact session for repair; no concurrent implementer is authorized.

## Successful evidence

Codex independently ran `node src/cli.ts rehearse --scenario refuse-then-accept` with exit 0. The trace proved plan loading, first automatic selection, explicit `slot-full` rejection, fresh generation and reference, different authorized second choice, explicit acceptance, automatic advance, and `REHEARSAL_ENDPOINT`. All six flagship checks passed. One mock bag/product context was retained and `submitOrder` was never called. This verifies the happy vertical flow only.

## Blocking findings

Codex ran `node --test review/*.test.ts`: **8 tests, 0 passed, 8 failed, 0 skipped**, exit 1. These are reviewer-owned reproductions; the implementation must satisfy them without weakening or deleting them.

| Finding | Reproduction | Required behavior |
| --- | --- | --- |
| F1, A06/A09/A10 | `review/queued-action.test.ts`: acceptance emits `advance`, then a pause, over-budget price, or challenge arrives in the port's post-events | Revalidate authorization and current control/page state at actual port dispatch. An emitted but unsent command must not make a request after these events. Keep journal truth about prepared versus actually dispatched actions accurate. All three cases currently send advance. |
| F2, A07 | `review/crash-boundary.test.ts`: crash after a durable accepted/rejected outcome but before derived records, then restart and supply a fresh same-content list | Replay the durable outcome itself. Do not forget acceptance or immediately choose a refused slot again. Both crash boundaries currently repeat the first selection. |
| F3, A07 | `review/journal-integrity.test.ts`: semantic ledger corruption such as `[{}]`, `[null]`, partial entry, invalid status; or valid journal hash chain whose initial run-start lacks planHash | Fail closed as unknown/consumed or refuse recovery. Corruption must not look like empty history. Initial plan binding is mandatory, not conditional on the field being present. |
| F4, A11 | `review/network-guard.test.ts`: ordinary `net.connect({host: '203.0.113.1', port: 443})` passes Node's normalized array to Socket.connect | Reject before transport. The reviewer replaces transport with a safe spy, so this reproducer never actually accesses the network. Current guard misses this call form. Audit supported ordinary socket/DNS/fetch call forms rather than patching just the one literal fixture. |
| F5, R01/A06, supplementary review | `review/plan-binding.test.ts`: construct an active task, then mutate the caller-owned plan's price, nested product, store, or arrival constraint | Bind this run to the originally reviewed conditions. An immutable snapshot, deep freeze, or explicit changed-binding block is acceptable. None of these external changes may silently enlarge authorization. |

Supplementary independent run: `node --test review/plan-binding.test.ts` failed all four tests before implementation repair. The complete reviewer suite now contains 12 cases. F5 is a newly evidenced R01/A06 failure, not new product scope.

F6, A14, supplementary benchmark review: `node --test review/benchmark-boundary.test.ts` failed one case. For the seed-1 first fresh-list run, the simulated slot-acceptance boundary is **271 ms**, but `simulatedMsToAccept` reports **576 ms**, including subsequent advance and endpoint observation. Measure the named acceptance boundary accurately, or relabel and separately report the required acceptance metric. The full reviewer suite now has 13 cases. Also remove the stale benchmark assertion that this repository has no commits: there is a verified management commit. When Git metadata is not read, report it as unmeasured rather than inventing its absence.

Reviewer-owned API adaptation during repair: the new `Engine.authorize(command)` distinguishes prepared commands from actual sends. Codex added an explicit asserted authorization step to the crash-boundary reproducer before supplying its outcome. Its crash boundary and no-repeated-choice assertions are unchanged. Claude must not alter reviewer tests.

Codex broadened F4 independent coverage with callback/promise DNS and string/URL/Request fetch tests, always replacing actual transports with safe spies first. These add two cases (15 total) without any external probes.

## Outstanding delivery

Finish original C-002 acceptance coverage, Chinese README/run/config instructions, benchmark evidence, and an English delivery report. Explain cross-process ownership and DOM/UI limitations honestly. Verify test helper recursive cleanup resolves inside the intended `.local/test-runs` directory before deletion, as required by this Windows environment. Do not touch the real Apple site, live purchase resources, credentials, or Git publication.

The official-entry read-only evidence in `docs/reviews/official-entry-20261001.md` is separate from this mock implementation. Real checkout and slot contracts remain unverified.
