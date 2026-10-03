# C-016 cross-review: bounded offline agreement on the 129-file candidate

I agree with Codex's bounded offline repair on exactly these bytes and found no blocking defect. Both permitted commands passed with no denials. One caveat up front: I wrote this repair, so this is a consistency check alongside Codex's independent review, not approval of my own work.

## Identity and commands
- **Candidate:** 129 files, SHA `69970b51edab3be858d312a77c2e8b42e258c9dc56a79f96a182e7003fd33708`.
- **Manifest check:** `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-016-candidate-manifest.json` returned ok, 129 files, no mismatches. `page-program.js` hashes to `4c25e938…b931`; ChromePort and job match the input bytes (`7c091d9a…`, `f9e0d799…`).
- **Full suite:** `node --test "test/*.test.ts" "review/*.test.ts"` passed **440/440**, with nothing failed, cancelled, skipped or todo, in 5899.65 ms. The output was truncated, so I grepped my own saved output file for the totals only.
- **Restrictions:** I ran no other command and made no edits or writes. I spawned no agents and touched no browser, site, network, `.local`, credentials or history.
- **Budget:** the harness notice showed about $1.0 of $5 used, as a cumulative figure. I have no structured usage counters, no turn or time cap was hit, and there was no provider quota.
- **Not approved:** the historical 128-file (`ea7de818`) and 127-file (`f4036ec0`) sets are not approved as this candidate.

## What I read
**Read in full, fresh in this task:**
- `docs/requirements.md` (this fills the gap Codex noted in my implementation trace)
- the task sheet
- `C-016-candidate-manifest.json`
- `C-016-independent-review.md`
- `C-016-actual-verification.json`
- `C-016-details-findings.md` and `.json`
- `docs/claude/C-016-report.md`
- `page-program.js` (265 lines), `chrome-port.js` and `job.js` (234 lines)
- the protected `review/c016-details-events.test.ts`
- `test/checkout-c016-details.test.ts`
- `C-015-bounded-agreement.md`

**Reused from my implementation work, not re-read:** `test/checkout-page-program.test.ts` lines 1–70 and `test/checkout-c013-decoder.test.ts`.

**Not reviewed:** controller/owner/`control.js`, the `src/` app and the rest of the repository. This is not a full repository review.

## Each review point against the current code
- **Native, current, unique receiver before each value** (`page-program.js:166-167`, `:176`): exactly one visible input may carry the field's label. It must be a native input, enabled, not read-only, of type text/tel/email or none, and not a password or one-time-code field. Each pass requires `bind(key)===c.bound[key]` before writing.
- **All bindings before the first write** (`:248`): any missing binding stops with nothing written. The unrecognised-binding cases, the 8 untouched receiver cases and the protected test pass.
- **Changes after synchronous or queued event work** (`:199-208`): the re-entered pass stops if any of these changed:
  - the URL, or the `main` element;
  - the page step (now DETAILS), purchase verification, or the whole decoded page state (price, quantity, store, pickup, slot summary);
  - the visible input set: same elements and the same label/type/autocomplete/disabled/required/read-only states;
  - the same enabled Continue button.

  It also stops if more than 2000 ms passed since the write. Route changes to sign-in, a missing `main`, an unsupported URL or a changed order reference exit early and still report touched, because the command id is already recorded as delivered.
- **Touched after a write, untouched before it:** `touched` is set before the first value is written, and every re-entered pass starts as touched. Pre-write failures report untouched.
- **Repeat and restart behaviour:** a repeated id, including one arriving while values are still being filled, is reported as already delivered and touched. ChromePort turns every touched result into "result unknown". The job keeps the pending `fillDetails` (`job.js:137-142`, `:218`), reconciles it only on reaching PAYMENT, and never fills again; the vertical tests confirm a restart sends nothing more.
- **No data or pre-filled fields** (`:251`): Continue is clicked once from the current page reading; tested.
- **Required fields** (`:208`, `:251`): checked before Continue in both paths.
- **Privacy:** values stay inside the command; they never enter internal state, results, error reasons or stored job records. Tests check reads, results, ChromePort errors and stored rows.
- **Unchanged protections:** the slot gate, chooseSlot, selectDate and the `submitOrder` final grant read as intended. `job.js` is byte-unchanged per the manifest. The c012/c013/c015 suites pass.

## Exact event boundary
**Covered before the next value or Continue:**
- all synchronous `input`/`change` listeners, because `dispatchEvent` runs them synchronously;
- every microtask they queue, at any depth, including MutationObserver callbacks;
- zero-delay timers queued before the program's own boundary timer, plus the microtasks those timers queue.

**Not covered:**
- timers queued from inside those timers;
- timers with a positive delay;
- animation frames;
- MessageChannel/postMessage tasks (for example React scheduler passive effects) and `scheduler.postTask`;
- network or fetch responses;
- server validation, and any merchant decision based on the written values.

Ordering between the page's timers and the extension's timer in real Chromium is assumed, not verified.

**Input-to-change limitation:** between `input` and `change` only the receiver binding is re-checked. In the protected sign-in-route case, `change` still fires on the first receiver after the route changed. No new value and no Continue follow.

**Strict false stops:** the following stop as "unknown" and hand over to a person:
- inputs re-rendered as new elements;
- label text changes, for example a validation message inside a `<label>`;
- inputs added or removed;
- any change in the decoded page state, including footer terms links;
- a boundary longer than 2000 ms. A throttled background tab likely exceeds this.

## Non-blocking observations
1. **Missing required field.** If a required field isn't covered by the supplied data, the values are written first and then the result is "needs a human, touched". It isn't an untouched stop before writing. This doesn't violate the criteria, since the page might fill the field itself, and the person completes it.
2. **Pre-existing, unchanged:**
   - Sign-in detection only looks inside `main`. A sign-in dialog outside `main` could still let Continue be clicked, but no pickup value can reach it.
   - The job labels a page-reported touched failure `mutation-transport-lost`.
   - Re-entered early exits report the misleading reason `OperationAlreadyDelivered`.
   - A different command id during the boundary is not blocked here. That relies on the job's single owner (A08).
3. **Untested branches.** A receiver hidden after the first event, and a type change to something other than password, are handled by the visible-input check but have no dedicated test.

## Still separate and open
- P3-C and P3-D.
- Real Apple details-page labels, refusal, date and order contracts, and native Chromium/ISOLATED behaviour.
- Scopes from earlier reviews that were never reviewed.

This is offline details-repair agreement only, not installed-extension or one-click order acceptance. **REAL_PURCHASING_READY=false.** No new purchase authority exists, and the Pro single-order authority is consumed.

## Next business step
1. Codex records the bilateral C-016 agreement on `69970b51…`.
2. The user confirms the extension was loaded manually and approves the current-host grant for C014.
3. C014 can then run read-only, and check the real details-page labels and input types with no mutation.
