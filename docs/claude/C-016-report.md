# C-016-DETAILS-EVENTS — Claude delivery report

Implementer: Claude (claude-opus-5-5). This report is not acceptance. Codex owns criteria and independent review.

## Input

- I ran `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-016-input-candidate-manifest.json` **before editing**. Result: `{"ok": true, "files": 128, "sha256": "ea7de818c4c3be1b9023c3b0bd75f609eaf56b06b431a351a396ff259b9f94cc", "mismatches": []}`.
- I ran the same command **after editing** without rewriting the manifest. Result: `ok:false`, 128 files, sha `4d587c17…1554`. The only mismatch is `web/checkout-connector/page-program.js`. The other 127 manifest files are byte-identical, including:
  - `chrome-port.js`;
  - `job.js`;
  - all reviewer files;
  - every existing implementation test.

## Changed files

| Path | Change |
| --- | --- |
| `web/checkout-connector/page-program.js` | `fillDetails` repair. This is the only source change. |
| `test/checkout-c016-details.test.ts` | New file, 10 tests. |
| `docs/claude/C-016-report.md` | This report. |

`chrome-port.js` did not need a change: the design relies on its existing contract, where only `{delivered:false,touched:false}` counts as untouched.

## Design and reasons

The design continues the accepted C-015 re-entry pattern: every merchant-visible decision is made from a synchronous decode of the current document, with no await between that evidence and the action.

1. **Binding before the first value (`page-program.js:163-170`, `:246-253`).**
   - Every supplied key is bound before any write. If any binding fails, the result is positively untouched.
   - `bind(key)` accepts a receiver only when:
     - it is the *only* visible `input` carrying one of the key's labels. Uniqueness now also counts disabled or wrong-type visible duplicates, which is stricter than before;
     - it is `instanceof HTMLInputElement`;
     - it is enabled and not `readOnly`;
     - its `type` is absent, `text`, `tel` or `email`;
     - its `autocomplete` contains neither `password` nor `one-time-code`.
   - Authentication pages are already the AUTH phase, so `fillDetails` is not recognized there.
2. **One value per pass (`fillDetail`, `:174-181`).**
   - Before writing, the receiver must still be exactly the original binding, and that binding must still be the current unique allowed one.
   - The program then:
     1. sets the value through the native setter;
     2. dispatches `input`;
     3. re-checks the receiver binding synchronously, then dispatches `change`;
     4. waits for a `setTimeout(0)` task boundary;
     5. re-enters `merchantDocument` with `internal.details`.
   - Values stay in `command.privatePickupData`. They are never copied into `internal`, results or errors.
3. **Re-entered gate (`:199-209`).** This pass's synchronous decode must satisfy all of the following. Any failure gives `DetailsEvidenceChangedAfterInput` with `touched:true`.
   - The value was written within 2000 ms. This mirrors the slot settle limit.
   - The URL `href` is the same.
   - `main` is the same object.
   - The phase is DETAILS and `purchase.verified` holds.
   - The whole decoded `out` is identical to the verified one. This covers product, quantity, total, store, fulfillment, slot summary, phase, path and payment method.
   - The visible input set is identical: the same element identities in the same order, with the same label, type, autocomplete, disabled, required and readOnly state (no values).
   - The same live, enabled, connected `继续选择付款方式` control is present.

   After that the program either sends the next value (step 2 again) or, when all values are sent, checks required validity and clicks Continue. That click follows the gate synchronously.
4. **No supplied data / pre-filled.** Nothing is written, so the original synchronous decode is still current. Required validity is checked and Continue is clicked once, as before.
5. **Touched truth.**
   - `touched=true` is set before the first setter call.
   - Every re-entered pass starts touched.
   - Early exits during re-entry (AUTH route, unsupported URL, missing main) use the memo-aware `report()`. The id is already in the memo, so they return `touched:true`.
   - ChromePort turns any touched or `delivered:false` reply into `MutationResultUnknown`.
   - The job keeps pending `fillDetails` and polls only until its deadline. It never re-sends; reconciliation happens only by reaching PAYMENT.

### Event scope covered

Before the next value or Continue, all of the following have run and their effects are judged from a fresh decode:

- synchronous `input`/`change` handlers;
- every microtask they queue, at any nesting depth;
- zero-delay timers queued before the program's boundary timer.

**Not covered:**

- longer timers;
- animation frames scheduled after the boundary;
- network or XHR responses;
- server-side validation;
- whether merchant state depends on the written values;
- MAIN-world versus ISOLATED-world task ordering in real Chromium, which is unverified because the Node fixture has one world.

## Requirement mapping

| Requirement / acceptance | How this repair addresses it |
| --- | --- |
| R01 / A06 | Purchase/store/quantity/total/fulfillment/slot-summary drift after any value blocks the next value and Continue. |
| R02 / A10 | Authentication inputs (password, one-time-code, `*password` autocomplete) and the AUTH route never receive pickup data. |
| R03 | The stable flow fills each field once and continues once. No-data/pre-filled details progress once. Nothing is disabled wholesale and there is no blanket manual stop. |
| R06 / A07 | After the first write, every blocked or unknown branch is touched, and ChromePort reports `MutationResultUnknown`. Before the first write, failure stays positively untouched. |
| R07 / A05 | The delivered-id memo is unchanged. A repeated id is touched and never re-fills. On restart the vertical job polls without re-sending. |
| R08 | Unknown means NEEDS_VERIFICATION, so a human checks. |
| R09 / A11 | Only FAKE fixtures were used. No real action, order, slot hold or payment. |
| R10 / A13 | No values appear in reads, results, error messages or durable job rows; the tests assert this. |

## Commands and results (exact strings only)

| Command | Result |
| --- | --- |
| `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-016-input-candidate-manifest.json` (before edits) | ok, 128 files, `ea7de818…94cc` |
| `node --test "review/c016-details-events.test.ts"` | **10/10 pass**, 129.8 ms |
| `node --test "test/checkout*.test.ts" "review/c012*.test.ts" "review/c013*.test.ts" "review/c015*.test.ts" "review/c016*.test.ts"` (first run) | 168/169. See below. |
| Same targeted command (after the fix) | **169/169 pass**, 600.2 ms |
| `node --test "test/*.test.ts" "review/*.test.ts"` | **440/440 pass**, 5913.5 ms. That is 430 input tests plus my 10 new tests. |
| `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-016-input-candidate-manifest.json` (after edits) | Expected mismatch, `page-program.js` only |

**Why the first targeted run failed:** protected `test/checkout-page-program.test.ts` "detail values stay out of observation…" failed because my first draft also required `tagName==='INPUT'`, and that fixture's `Input` keeps `tagName:'DIV'`. I removed the redundant tagName check and kept `instanceof HTMLInputElement` as the native-binding check. The protected test was not modified.

## Fault branches exercised by my tests (FAKE)

- **Drift queued after the first value**, each through both a nested microtask and a zero-delay timer: price, busy, receiver disabled, receiver replaced, extra field, `main` replaced, Continue replaced, Continue disabled. All are touched with no second write and no click.
- **Drift queued after the last value:** quantity. Both writes stay touched, with no click.
- **Synchronous receiver rename inside the `input` handler:** the result is `PrivateFieldReceiverChanged`, `change` is never dispatched and the next value is not sent.
- **Untouched cases with no write:** password type, one-time-code, `current-password` autocomplete, `search` type, `hidden` type, readOnly, a disabled visible duplicate label, and a non-native element.
- **Positive controls:**
  - no supplied data with a valid pre-filled required field gives one click;
  - benign same-value event work gives one click, each field receives `input,change` once, and a repeated id is touched.
- **Empty required field after written values:** `PickupDetailsRequireHuman`, touched, with no click.
- **Settle limit:** 2001 ms stops; 2000 ms continues.
- **Actual ChromePort:**
  - receiver replacement gives `MutationResultUnknown` twice;
  - the error message contains no values and there are no further writes;
  - a stable page is delivered once.
- **Vertical (production `PurchaseJob` → ChromePort → page program):**
  - drift run: NEEDS_VERIFICATION with pending `fillDetails`; a restart adds no new calls or writes, and durable rows contain no values;
  - stable run: one slot Continue, both values once, one details Continue.

## Limitations and incomplete checks

- **Everything is FAKE.** The real Apple details-page labels, input types, redraw behaviour, validation and network effects are unobserved.
  - The field aliases remain unverified.
  - No real browser, Chromium scheduling or React controlled-input behaviour was tested.
- **Strictness may produce false stops on a real page.** These cases stop as touched unknown and need a human check:
  - inputs re-rendered as new nodes after each value;
  - a visible input set changed by validation UI;
  - any decoded-`out` change;
  - a boundary longer than 2000 ms, for example in a throttled background tab.
- **Change event after an input-handler drift.** Between `input` and `change` only the receiver binding is re-checked; a full purchase decode needs re-entry. If the `input` handler changed the purchase evidence, `change` is still dispatched on the same receiver, which already holds its value. The next value and Continue are still blocked.
- **Diagnostic reason in re-entered early exits.** These return `reason:'OperationAlreadyDelivered'` with `touched:true`, from the unchanged memo-aware `report()`. The reason is diagnostic only and is never surfaced through ChromePort for touched results.
- **Commands not run.** I ran no git status or diff, because those are not among the allowed exact commands. Unchanged protected bytes are evidenced only by the manifest verifier, and the two new files are outside that manifest.
- **Out of scope here:** native installation is unconfirmed; the current-host grant is still required; C014 has not been dispatched; P3-C/P3-D remain open; **REAL_PURCHASING_READY remains false**.
- **No permission denials or provider quota events** occurred in this task.

## Real evidence versus simulation

Nothing in C-016 used Apple pages, network, authentication, browser, real values or real order/slot/payment actions. All behaviour shown above is the production page program and ChromePort/PurchaseJob code running against synthetic Node VM DOM fixtures.
