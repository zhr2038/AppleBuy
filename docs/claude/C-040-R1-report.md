# C-040-R1 delivery report (Claude)

Task: `docs/tasks/C-040-R1.md`: complete a one-start current-native checkout without replay. This is **not self-accepted**. Acceptance is Root's decision, after its own runs.

## 1. Inputs read and pre-edit verification

**Fresh full reads for this task:**
- `docs/tasks/C-040-R1.md`
- `docs/requirements.md`
- `docs/tasks/C-040-NATIVE-ORDER.md`
- `docs/reviews/C-040-actual-verification.json`
- `docs/reviews/C-040-independent-findings.json`
- `docs/reviews/C-040-R1-input-candidate-manifest.json`
- `docs/claude/C-040-report.md`
- `web/checkout-connector/job.js`
- `web/checkout-connector/chrome-port.js`
- `web/checkout-connector/page-program.js` (both pages)
- `test/c040-native-order.mjs`
- `test/checkout-c038-navigation.test.ts`
- `test/checkout-c023-final-lookup.test.ts`

Some of these reads happened before an automatic context compaction in this same session. After compaction I re-read the parts I edited or built against:
- chrome-port.js, in full;
- job.js lines 14–23 and 150–259;
- c040-native-order.mjs, in full;
- checkout-c038-navigation.test.ts and checkout-c023-final-lookup.test.ts, in full.

**Targeted compatibility checks (Grep on public repository files only):**
- page-program.js: the `verifiedStep` rule, the REVIEW phase detection, and the fillDetails/continuePayment controls.
- job.js: the write-ahead `deadline` and `maxWaitMs`.
- `review/c021-auth-handoff.test.ts`: its fake port throws plain errors, so its outcome is unchanged.
- requirements.md: the R01–R10 rows.

**Pre-edit manifest check.** I ran `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-040-R1-input-candidate-manifest.json` before any source edit. Result: `{"ok": true, "files": 174, "sha256": "3e53ba829b9b085c26e82d65ea844e0fd1d0df5f0905225bb2938b3e0d5962fe", "mismatches": []}`.

## 2. Changed scope

| File | Change |
|---|---|
| `web/checkout-connector/chrome-port.js` | `observe` reports a *rejected* `scripting.executeScript` promise as `ScriptTransportRejected` with `scriptTransport:true`. A *returned* frame result that is missing, failed or has no decode stays `CurrentDocumentUnrecognized`, with no flag (unchanged). |
| `web/checkout-connector/job.js` | (1) New `CONTINUING` set. (2) The observe-catch re-read is extended to those actions, only for flagged transport rejections. (3) A bounded read-only wait was added to the pending `submitOrder` reconciliation. |
| `test/c040-native-order.mjs` | Updated: the RED scenario is now GREEN with a full document route and four targeted losses; normal scenarios no longer call `resume()`; all prior assertions kept. |
| `test/checkout-c040-recovery.test.ts` | New: 10 focused cases over the actual ChromePort and PurchaseJob. |
| `docs/claude/C-040-R1-report.md` | This report. |

Nothing else was touched:
- page-program.js, the source actor/refusal catalog, every other test and reviewer, README, settings, dispatch, `.claude/` and `.git/`;
- `test/checkout-c038-navigation.test.ts` and every old assertion are byte-unchanged.

## 3. Design decisions and reasons

### A. Script-transport read loss after a sent later step

**Where classification happens: ChromePort.** Only ChromePort can tell the two failures apart:
- **Rejected injection promise.** Chrome rejects the promise when the target frame is removed or replaced during a document change, which is exactly the C040 RED.
- **Resolved but unrecognized result.** The promise resolves, but the frame result has no result or carries an error. The document was reached, and the read itself failed.

Only the first is labelled `scriptTransport`.

Other failures happen before injection and keep their own class, with no flag:
- permission loss (`CurrentHostPermissionMissing`);
- a closed or missing tab (`tabs.get` throws);
- a non-merchant URL (`UnsupportedMerchantPage`).

**Where policy happens: the job.**
- `NAVIGATING` (C038-R1) is unchanged.
- `CONTINUING = {chooseSlot, fillDetails, continuePayment, submitOrder}`: these are the sent later steps whose normal result may be a new document.
- A failed read for one of these actions is repeated only when all of the following hold:
  - the error carries `scriptTransport === true`;
  - the run is not read-only;
  - the pending action is dispatched;
  - `now < pending.deadline`, the original 8000 ms write-ahead deadline, never extended;
  - the existing poll bounds allow it (`maxWaitMs` per episode, `maxPolls`, 50 ms waits).
- Nothing is ever sent again.

**Acceptance still needs a trustworthy fresh decode,** through the existing branches:
- `chooseSlot` needs a DETAILS, PAYMENT or REVIEW page with a verified progression slot, a matching purchase and the exact slot.
- `fillDetails` and `continuePayment` need the reached phase, `verifiedStep`, and matching conditions or payment.
- `submitOrder` goes to the final branch below.
- An expired deadline, a returned-unrecognized decode, permission loss, a closed tab, a stale sequence, read-only mode, or a challenge/auth/unknown page each keeps its existing stop.

**The accepted C038 test is untouched and still passes.** Its fake port throws a plain `CurrentDocumentUnrecognized` after a slot, with no flag, so it still stops with 0 waits and 2 observes.

**Same-document control steps are excluded.** `selectPickup`, `selectStore`, `selectDate` and `selectPayment` keep the immediate stop.

**Limitation.** In real Chrome, `executeScript` can reject for reasons other than frame replacement, for example a page that cannot be accessed or a tab closing mid-call. Every such rejection can at most buy a bounded read-only re-read inside the original deadline. The next read runs `permission()` again, so permission loss and closed tabs then stop under their own class. A rejection is never turned into acceptance.

### B. Normal final processing within the initial run

In the `submitOrder` pending branch, the existing read-only gate still comes first. Then, if either of these is still shown:
- `PROCESSING`, or
- the final click's **own** unchanged review document: phase `beforePhase` (REVIEW), the same `documentId` as the write-ahead, `verifiedStep`, and `purchaseMatches`,

the job waits read-only, while `now < pending.deadline`, the original deadline, under the existing poll bounds.

Once that wait ends, the unchanged C-023 path runs: receipt hash capture, then `lookupOrder` over the receipt's own detail link, then `CONFIRMED_UNPAID` only on an exact independent unpaid match. Otherwise it stops at `final-result-unconfirmed; no resubmission`.

The wait never does any of the following:
- resubmit;
- clear or reset `pending` or `finalIntent`;
- create a new deadline or extend authority;
- navigate.

These cases get no wait and go straight to the old lookup (unit-tested):
- an old or expired final deadline (still eligible for independent lookup);
- another review document;
- a review whose purchase differs, e.g. two units;
- AUTH, challenge or unknown pages.

Read-only mode never waits, navigates or buys.

## 4. Actual runs (this task)

All runs were on owned loopback with FAKE Chrome, merchant, backend and authority. There was no Apple or external network, no personal profile or extension, and no real cart, slot, order or payment.

| # | Command | Result |
|---|---|---|
| 1 | `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-040-R1-input-candidate-manifest.json` | ok; 174 files; 0 mismatches (before edits) |
| 2 | `node test/c040-native-order.mjs` | **8/8 PASS**, `passed:true`, `completionPassed:true`, exit 0 |
| 3 | `node --test test/checkout-c040-recovery.test.ts` | 9 pass / **1 fail**: my own test expected `acceptedSlot === null`, but a fresh task row has the member absent (undefined). The production assertions before it on that line passed. I changed the expectation to `s.acceptedSlot??null` (a test-only fix). |
| 4 | `node --test test/checkout-c040-recovery.test.ts` (after the fix) | **10/10 pass**, 0 fail, duration ≈84 ms |
| 5 | `node --test --test-reporter=dot "test/*.test.ts" "review/*.test.ts"` | 953 dots, no failure markers, exit 0. The dot reporter prints no numeric totals; the count is of the visible dots (47 full rows of 20, plus 13). Root's independent run supplies the authoritative numbers. |

I made no other shell commands, pipes, redirections, `cd` or git calls. The native script prints a `.local/...result.json` path at the end; I did **not** open or grep it, or any other persisted output.

### Native scenario facts (from the script's own stdout)

**Every scenario:**
- Exactly one each of: checkout, pickup, time, slotContinue, detailsContinue, payment, paymentContinue and **submit**.
- Store and date events: 0.
- summaryOpen = summaryClose = 5.
- **1 backend unpaid order**, equal to `EXPECTED_ORDER`.
- Actions equal the 7-step PATH with no repeats.
- Details were written once by native events: each of the 5 fields fired input 1 and change 1, with the exact FAKE values. They are absent from the durable row.
- **One actual ChromePort receipt-link detail lookup** via FAKE `tabs.update`: `https://www.apple.com.cn/shop/order/FAKE-C040-0001`.

**Per scenario:**

| Scenario | Runs | Time | Reads (bag / checkout / details / payment / review / receipt / order) |
|---|---|---|---|
| native-order-confirmed-unpaid | **start:CONFIRMED_UNPAID**, consumed-grant:CONFIRMED_UNPAID (no resume) | 922 ms | 4 / 11 / 6 / 9 / **8** / 2 / 1 |
| submit-result-lost-readonly-revoked-resume | start:NEEDS_VERIFICATION (`mutation-transport-lost`), readonly:NEEDS_VERIFICATION (no navigation, no command), revoked-grant:BLOCKED, resume:CONFIRMED_UNPAID, consumed-grant:CONFIRMED_UNPAID | 875 ms | — |
| detail-quantity-two-unconfirmed | start:NEEDS_VERIFICATION, `final-result-unconfirmed; no resubmission`, initial run only, no resume, 1 submit | 941 ms | — |
| detail-price-over-cap-unconfirmed | same | 897 ms | — |
| detail-other-spec-unconfirmed | same | 881 ms | — |
| detail-other-slot-unconfirmed | same | 880 ms | — |
| detail-slot-proof-missing-unconfirmed | same | 864 ms | — |
| **document-route-read-loss-recovered** (formerly the C040 RED) | **start:CONFIRMED_UNPAID**, consumed-grant | 1082 ms | 4 / 10 / 5 / 8 / 5 / 2 / 1 |

- **Normal scenario.** Review reads went from 7 (C040 start plus resume) to 8 in a single run. That is the bounded wait across the 150 ms FAKE processing.
- **Document route.** Every post-slot stage is loaded as a new document. Exactly one targeted frame-removal rejection fired after each of `chooseSlot`, `fillDetails`, `continuePayment` and `submitOrder`, each waiting for that step's own new document. The run sent no replay: slotContinue 1, paymentContinue 1, submit 1.
- **Reference hash.** In each success scenario the run asserted `orderRefHash === sha256('FAKE-C040-0001')`. The hex value was not printed.
- **Guard.** `http://127.0.0.2:1053/FAKE-c040-guard`: aborted, blockedDelta 1, serverHits 0. Network: allowed 56, blocked 1 (only the guard URL).
- **Cleanup.** contextsClosed 8, browserClosed true, serverClosed true, errors [].

### Unit cases (`test/checkout-c040-recovery.test.ts`, actual ChromePort/PurchaseJob, FAKE Chrome)

1. **Classification.**
   - A rejection gives `scriptTransport`.
   - A returned null result gives `CurrentDocumentUnrecognized`, unflagged.
   - Permission loss and a closed tab are unflagged, with 0 injections.
2. **Slot then rejection then DETAILS.** 1 wait, accepted slot reconciled, `chooseSlot` sent once, then a safe AUTH stop.
3. **Slot then returned-unrecognized.** Immediate stop, 0 waits, pending kept.
4. **Persistent rejection.** 150–161 waits, stop at the original `start+8000` deadline (never extended), pending kept.
5. **Read-only reconcile with a rejection inside the open deadline.** 0 waits, 1 read, 0 commands.
6. **Stored sent final: rejection, own REVIEW, PROCESSING, receipt.**
   - Outcome: `CONFIRMED_UNPAID`, with 4 waits (3 job plus 1 lookup), 0 commands, 1 link navigation.
   - Bounds: the run finished inside the deadline, and the final intent was kept.
7. **Four final variants, each with no wait, no navigation and no command, pending and final intent unchanged:**
   - expired deadline with REVIEW shown;
   - expired deadline after a rejection;
   - another review document;
   - a review showing two units.

## 5. R01–R10 mapping (this delta only)

- **R04, R06:** the transport-loss vs unrecognized-document distinction. A lost read never implies an accepted slot or success; acceptance needs a fresh verified progression.
- **R07:** no duplicate slot, field, payment or final write; the original pending deadline is bounded; uncertain finals are reconciled through the independent lookup only.
- **R08:** read-only mode never waits or navigates; permission, auth, challenge and unknown pages keep their stops; pause and stop are still checked on each loop pass.
- **R09:** FAKE only; no real slot, order or payment.
- **R03:** normal later document navigation no longer forces a new Start.
- **No change:** R01, R02, R05 and R10, plus the Chinese UI.

## 6. Failures, denials and caps

**History (C040):**
- Two forbidden private-output **Grep attempts were DENIED**. They were not successful reads; my C040 report wrongly called them reads. Neither resource was retried, accessed by any other tool, or the subject of any permission request.
- One unchanged (no-op) Edit failed.
- Earlier fixture-run failures remain part of the history.

**This task:**
- One failing unit-test run (run 3 above), caused by my own test expectation and fixed in the test only.
- No permission denials occurred.
- No agents, publication, dependency, security or profile changes, and no shutdown.

**Caps:**
- 48 turns / 1500 s / USD 10.
- I don't have exact wall-clock or turn counters. By my count, this task used roughly 32 tool turns across the compaction. The visible spend was about USD 4 when this report was written.
- Root's audit of the actual logs is authoritative.

## 7. Known limitations and the boundary between evidence and simulation

**Observed facts** (sanitized C035/C036/C029): bag, pickup, date and time option shapes, the R609 label, and the summary dialog shape.

**INVENTED, not Apple evidence:**
- details, payment, review, receipt and order-detail markup;
- the later-page `运费 免费` (free shipping) row;
- slot and store prose;
- the single-segment order URL;
- the backend order store;
- same-document and new-document post-slot routing, and the frame-removal loss injection;
- the 35/150 ms timings;
- all Chrome interfaces, authority, identity and storage.

**What this work does not establish:**
- The real Apple post-slot contract, slot hold or reservation duration, and real final-processing time are unknown.
- The 8000 ms pending deadline is the existing write-ahead bound, not an Apple fact. A real final that takes longer still ends in a truthful `final-result-unconfirmed` and needs a later lookup.

**Still unverified:** the real Chrome rejection message set, real Duo, the personal extension path, official speed and the full source goal. The refusal catalog is unchanged.

**Real Chrome rejection limit.** A real `executeScript` rejection for a reason other than frame replacement also gets the bounded read-only re-read (see §3A). It cannot produce acceptance.

## 8. Resumable checkpoint

The code and tests above are complete. The permitted commands were run as listed: native 8/8, exit 0; unit 10/10; full suite 953 dots with no failure markers, exit 0.

Next owner action: Root's independent manifest, diff and run audit. Changed or new paths:
- chrome-port.js
- job.js
- c040-native-order.mjs
- checkout-c040-recovery.test.ts
- this report
