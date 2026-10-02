# C-013-R3 delivery report (Claude, implementer)

Session `[original Claude session retained privately]`, model `claude-opus-5-5`, effort `xhigh`. This is an implementer report, not self-approval. Codex owns independent acceptance, and an exact new-source consistency agreement is still required. REAL_PURCHASING_READY remains **false**.

## Inputs read
- **Read in full:**
  - `docs/tasks/C-013-R3.md`
  - `docs/reviews/C-013-decoder-findings.md`
  - `review/c013-decoder-findings.test.ts`
- **Partly read:** `docs/reviews/C-013-Decoder-Claude-review.md`, lines 1–30. The rest is my own decoder-review report from this session.
- **Current source and tests:**
  - **`web/checkout-connector/page-program.js`:** read in full in the decoder review. It is unchanged since then, and I edited it in place this task.
  - **`job.js`:** lines 104–143 and 170–234 read.
  - **`review/c012-checkout-findings.test.ts`:** lines 30–61, to check which fake page harnesses run the slot step.
  - **`review/c013-functional-findings.test.ts`:** lines 50–79, for the same reason.
  - **`docs/requirements.md`:** R01–R10 rows re-read for the mapping below.
- **Codex's timer additions:** a search confirmed that `review/c012-native-selection-findings.test.ts` and `test/checkout-page-program.test.ts` now include `setTimeout`. Both pass unchanged.
- **Harnesses without timers:** the C-012 checkout findings and the R1 public-configuration harness only read pages. They never run the slot step through the page program.
- **Reused from earlier in this session:** CLAUDE.md, the remaining requirements, and the controller and owner context.

## Root causes
1. **Duplicate delivery check came too late.** The page program compared the command's expected evidence *before* consulting its delivered-id memo. A delivered command whose own click changed the page was therefore reported as positively untouched if sent again (`OperationEvidenceChanged`, `touched:false`).
2. **Continue was decided too early after the slot change.** The program waited only one microtask turn. Work the page queued from the change event deeper than that, or in a zero-delay timer, ran after the check and after the click.

## Design decisions
**1. Delivery truth comes first (`page-program.js`, action preamble).**
- The order of checks is now:
  1. authorization, command id and task id;
  2. the memo: a known id gives `touched:true`, `OperationAlreadyDelivered`;
  3. the expected-evidence comparison: a mismatch gives untouched `OperationEvidenceChanged`;
  4. the id is added to the memo.
- A genuinely new id with stale evidence therefore stays positively untouched and clicks nothing.
- Ids are still memoized only after the evidence check, exactly as before, so nothing new becomes "delivered".
- This now matches the sign-in-page branch, which already consulted the memo first.

**2. Continue is decided after the change event's task boundary (`chooseSlot`).**

*Before the selection is written:* the program captures the single enabled `继续填写取货详情` control from the verified observation. If it is not present, the command fails positively untouched.

*After writing the selection and dispatching `change`:*
1. It takes the private DOM fingerprint, as before, and records `Date.now()`.
2. It waits for one browser task boundary with `setTimeout(0)`. By the HTML event-loop model:
   - all microtasks, at any nesting depth, finish before the next task;
   - zero-delay timers the page queued earlier run before ours.

   This is a defined event-loop boundary, not a chosen count of microtask yields.
3. It re-reads the current page and gates on all of the following:
   - the fingerprint is unchanged since the change event;
   - it is the same connected native time selector, the only one on the page, and it is enabled;
   - the selected option is the commanded, enabled terminal, by index and by time text;
   - the same selected date;
   - SLOTS with complete lists;
   - identical item, quantity, quote and store;
   - identical date and time lists;
   - the same live, connected, enabled Continue control — a replaced or disabled control fails;
   - the boundary took no more than `SETTLE_LIMIT_MS`, 2000 ms.
4. If the gate passes, Continue is clicked immediately, with no further wait. If it fails, the result is `SlotEvidenceChangedAfterSelection` with `touched:true`.

*Effects on the transport and the job:*
- The transport reports that failure as `MutationResultUnknown`.
- The job keeps the pending `chooseSlot` and moves to NEEDS_VERIFICATION. It never retries, retargets or clicks Continue later for that command.

*Why `setTimeout` and not MessageChannel:* MessageChannel tasks use a different task source and can run *before* a pending zero-delay page timer, so they would miss the protected case.

*Why a staleness bound:* hidden-tab throttling (about 1 s) or a frozen page could delay the boundary. A selection older than 2 s is then not treated as current. This is a local staleness bound, not a merchant timing contract.

*Unchanged:* job, transport, controller, permissions, the existing tests, and all other actions and decoder rules.

## What the current-state guarantee covers
**Covered.** Continue is clicked only if all of the following are true in the current document, at the moment of the click:
- the native selection still shows the commanded terminal, on the commanded date;
- item, quote and store are unchanged;
- the lists are complete;
- the controls are the same connected elements;
- nothing visible has drifted since the change event.

All of this holds after every microtask the page queued, and every zero-delay timer it queued before ours.

**Not covered and unverified:**
- page timers with a positive delay, or chains of timers that are queued after our boundary;
- network or server-side asynchronous validation;
- Apple's real slot acceptance or refusal behaviour and timing.

**Ordering assumption.** The extension's code runs in Chrome's separate extension (isolated) world, while the page's own scripts run in the page's world. That our timer runs after the page's earlier zero-delay timers across those two worlds relies on Chromium putting both on the same frame timer queue. The HTML specification guarantees timer order only within one world, so this was verified only on the Node fake.

**What a click proves.** A successful Continue still proves nothing about a reservation. The job accepts a slot only from the next verified step (DETAILS, PAYMENT or REVIEW), and the slot is recorded as "not a hold guarantee".

## Changed files
| File | Change |
|---|---|
| `web/checkout-connector/page-program.js` | Memo before the expected-evidence check. The slot step now waits for the change task boundary, has a bounded staleness check, and verifies the live Continue control is the same element before clicking it. Header line added. |
| `test/checkout-c013-decoder.test.ts` | New, 8 tests using the actual serialized page program, `ChromePort` and `PurchaseJob` with FAKE DOM and transport. |
| `docs/claude/C-013-R3-report.md` | This report. |

No other file changed. The independent tests, existing tests, fixtures, manifests, controller, permissions and Codex's timer additions are untouched.

## New implementation tests (FAKE only)
1. **Duplicate during the wait:** the same id sent again while the slot step waits at the boundary is touched and `OperationAlreadyDelivered`. Continue is clicked exactly once, by the original.
2. **New id, stale slot evidence:** positively untouched. No selection is written and nothing is clicked.
3. **Changes during the wait:** store, date, selector replacement, quantity, or the terminal becoming disabled — each queued both as a nested microtask and as a zero-delay timer, 10 cases in all. Each gives unknown with no Continue.
4. **Continue changes or the page goes busy:** Continue is replaced by a new element, or Continue is disabled, or the page shows the busy marker. Unknown, and no continuation control is clicked.
5. **Staleness bound:** a selection 2001 ms old is not continued. At exactly 2000 ms it continues once (positive control).
6. **Harmless change event:** a change event that leaves the page the same still continues exactly once.
7. **Full path, failure:** job → transport → page program. A nested reset after the change leaves a preserved unknown `chooseSlot` (NEEDS_VERIFICATION, no accepted slot, no Continue). A restart neither repeats nor continues.
8. **Full path, positive control:** an unchanged terminal continues once. The slot is accepted only after the next step (details) is observed, with "not a hold" as its basis. The run then stops at the authentication gate.

## Commands run (exact approved list, no prefixes)
| Command | When | Result |
|---|---|---|
| `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-013-R3-input-candidate-manifest.json` | before edits | `ok`, **124 files**, `310afe245146223570484a76498898449e7c9414bdc4fc96b8285a6a372f9031`, no mismatches |
| `node --test review/c013-decoder-findings.test.ts` | before edits | 6 tests: **2 pass, 4 fail** (P3-A, nested microtask changing the time, nested microtask changing the price, zero-delay timer) |
| `node --test review/c013-decoder-findings.test.ts` | after the page-program repair | **6/6 pass**, 106 ms |
| `node --test "test/checkout*.test.ts" "review/c012*.test.ts" "review/c013*.test.ts"` | first run with new tests | 136 tests: 135 pass, 1 fail. The failure was my own positive-control assertion: the job correctly keeps a delivered slot unconfirmed at a sign-in page (`job.js:135`). I fixed the test to continue through a fake details step; product code was unchanged. |
| `node --test "test/checkout*.test.ts" "review/c012*.test.ts" "review/c013*.test.ts"` | final product and test bytes | **136/136 pass**, 0 fail/cancelled/skipped/todo, 382.5181 ms |
| `node --test "test/*.test.ts" "review/*.test.ts"` | final product and test bytes | **407/407 pass**, 0 fail/cancelled/skipped/todo, 5892.2037 ms (399 input cases + 8 new) |

Both final runs used the final bytes of `page-program.js` and the new test file. Only this report was written afterwards, and it is not a test input.

## R01–R10 mapping
| Requirement | How this repair relates |
|---|---|
| **R04** | Local selection is still not a reservation. Continue is sent only for the current, verified native selection, and the slot is accepted only from the next verified step. |
| **R05** | No retargeting to an earlier slot and no blind repeat. A changed selection becomes unknown, never a refusal. |
| **R06** | Post-change drift, a busy page, a replaced control or a stale boundary is unknown (`touched:true`), never refused, confirmed none or accepted. A new stale command stays positively untouched. |
| **R07** | A duplicate delivered id cannot become untouched or click again, even when its own delivery changed the page. Nothing is resubmitted after an unknown. |
| **R08** | Pending and unknown truth is preserved; a human verifies. |
| **R09** | FAKE only. No real order, payment or slot occupancy. |
| **R01, R02, R03, R10** | Unchanged. No condition was relaxed; the extra wait is one task turn plus a bounded check. |

## Unrun checks, caps and denials
- **Manifest check on final bytes:** not run. The approved command checks the 124-file *input* manifest, which is expected to mismatch now that the bytes have changed. A new candidate manifest is Codex's to create.
- **Nothing outside the approved list:** no browser, extension, network, Apple page, authentication, installation, grant or dependency change.
- **No permission denials** for the exact approved commands.
- **No quota, session-limit or 429 errors.**
- **Usage:** about $1.6 of the $5 cap and about 20 of 40 turns at the time of writing.

## Known limitations
- **Real asynchronous validation is unverified.** Positive-delay timers, network checks and Apple's real behaviour and timing are not covered (see "What the current-state guarantee covers").
- **Ordering across worlds** is a Chromium implementation property, not a specification guarantee (see above).
- **The 2000 ms bound** is a local staleness choice, not an Apple contract. Under heavy background throttling, Continue may therefore become unknown rather than proceed.
- **The fingerprint is strict:** any visible drift after the change blocks Continue, including harmless re-renders. This fails safe, but a real page that re-renders benignly would stop at NEEDS_VERIFICATION. That needs authorized real observation and must not be loosened from fake fixtures.
- **Speed cost:** one extra task turn plus a second read before Continue. This is not measured on a real site.
- **The decoder review's P3-C, P3-D and P3-E** (raw order id in the link and path, page-level date-selection asymmetry, digest await) and the P2 page-shape assumptions remain open. They were not in this task's scope.

## Resumable checkpoint
The repair is complete. All 6 independent decoder criteria pass, and every earlier protection passes. Next step: Codex inspects the delta, creates the new candidate manifest, re-runs the tests independently, and a consistency agreement is reached on the exact new bytes. Any returned defect resumes from the `chooseSlot` block and action preamble in `page-program.js`, and from `test/checkout-c013-decoder.test.ts`.
