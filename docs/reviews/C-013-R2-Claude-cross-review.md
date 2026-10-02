# C-013-R2-CROSS-REVIEW verdict

**I agree with the repaired offline source, within its limits, and it is not ready for real purchasing.** I wrote R1 and R2 myself, so this is a consistency review, not an independent second review. Codex owns acceptance and my agreement cannot override it.

## Candidate identity
- **Manifest:** `docs/reviews/C-013-R2-candidate-manifest.json`
- **Files:** 123
- **SHA-256:** `dbf68f221619e94d002aadd4c7adb3701dde0f22077ad470fed9703dfcca9732`
- The older 119-file agreement and the 374-test run play no part in this verdict.

## Commands run (approved list only)
| Command | Result |
|---|---|
| `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-013-R2-candidate-manifest.json` | `{"ok": true, "files": 123, "sha256": "dbf68f22…9732", "mismatches": []}` |
| `node --test "test/*.test.ts" "review/*.test.ts"` | 393 tests: 393 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo; 5979.1113 ms |

Nothing else was run: no browser, network, extension install, host grant, merchant action or dependency change.

## Checks against the final bytes
- **Local grants (P3-1):** `finalGrant` and `startGrant` are now created inside each click handler; there is no module-level grant. A denial or exception before the job is created throws the grant away. A plain Resume never carries a final grant.
- **Cancelling preparation before any new action (R08 blocker):**
  - Each handler records the cancellation counter at the moment of the click: Start, Resume, Rebind, Final, Validate and Retire.
  - `run` checks it again at entry, inside the lock, after the record read and digest, and after the private session read. That last check comes directly before `new PurchaseJob`, with no wait in between.
  - Final checks again after its record read. Validate and Retire check after their reads.
  - A cancelled handler creates no job, uses no grant and writes nothing. Once a job exists, Pause/Stop act through the job's existing checks before anything is sent.
  - Codex's independent cancellation criteria pass 6/6, including both positive controls.
- **Already-sent and unknown results survive:** the control page never changes durable pending or unknown records. A cancelled Final cannot come back through Resume. A fresh Final after an unknown result does not send again.
- **Sign-in page memo is conservative (P3-3):** at `/shop/signIn/orders`, a command id that was already recorded returns `touched:true` and `OperationAlreadyDelivered`. It does not read the page or add a new memo entry. The port then reports the result as unknown, not as a retryable failure.
- **Bounded retry of untouched actions (P3-5):**
  - The stored streak resets only on a verified `reached` reconciliation or a verified slot acceptance.
  - Each run has its own cap of 12.
  - Stored values are type-checked (safe integer, at least 0, no more than the recorded total), and old records are migrated conservatively.
  - A validation restart keeps the counts on the same tab and digest.
- **Waiting at an already selected store (P3-6):**
  - The wait is limited by `maxWaitMs`.
  - If it times out, the result is NOT_READY, with text saying no slot is held and availability is not established.
  - If the store evidence changes during the wait, the result is NEEDS_VERIFICATION and nothing is clicked again.
  - A store that is not yet selected is still selected normally.
  - A local selection never produces `acceptedSlot` and is never treated as a reservation.
- **Other protections kept:**
  - single owner through Web Locks;
  - one bag (`bagAddStarted`) and one final send (`finalIntent.sent`);
  - first three dates only, with no fourth or earlier-date fallback;
  - explicit refusal and latest-list handling;
  - price, extras, quantity and store proof;
  - the current-page boundary;
  - pause before send;
  - no repeat after an unknown final result.

I found no P0, P1 or P2 code defect in the repaired scope. I judged R01–R10 and A01–A14 through these protections and the 393-test run. I did not re-read each requirement row in this pass.

## Remaining issues (none block offline agreement; none grants evidence or authority)
**P3 usability:**
1. **Validate lock failure is unhandled.**
   - Reproduction: make the fake `navigator.locks.request` reject, then click Validate. The rejection escapes the click handler as an unhandled rejection. No job, no write and no action follow.
   - Expected acceptance: a try/catch with a Chinese status such as `验证未能开始；记录保持不变`, and a test showing no unhandled rejection.
2. **Pause/Stop only reach their own control page.**
   - Reproduction: page A holds the lock and is running. Pressing Pause on page B changes only B's counter, and A keeps going. B's message says "本控制页", so it does not claim otherwise.
   - Expected acceptance, if wanted: a stop signal shared across pages that the job checks before sending. That is a policy decision.
3. **A completed Prepare survives Pause.** It grants nothing by itself: Start still needs a fresh click, approval, the final-review box and a matching digest and tab.
4. **Misleading status on an idle page.** Clicking Pause when nothing is running still shows "进行中的准备已取消". Expected acceptance: a separate idle message.
5. **The per-run cap resets when a person starts a new run.** The stored streak is kept, so this is by design.

**P2 assumptions about Apple's page shape (not verified):**
- The P3-6 "already selected" test may rely on the decoder's labelled store field. If the real page shows the store but needs a radio click to load slot controls, the wait would end at NOT_READY instead of clicking. That fails safe, but could lose a slot.
- Still unresolved from earlier rounds:
  - date placeholder (P2-1);
  - upsell or repeated titles (P2-2);
  - slot validation that completes later (P2-3);
  - the bare `/shop/signIn` page (P3-4);
  - real refusal text;
  - full signed-in summaries;
  - pickup dates that depend on payment.

**Older Pro-SKU collector gap:** I did not read `web/chrome-connector/*` in this cycle. The gap stays open and is not fixed.

## What I did not read in this pass
- **R2 delta patch:** headers only. I wrote it, and I read the final `control.js` lines 18–95 directly. The rest of `control.js` I read during R1/R2.
- **`job.js`, `page-program.js` and all four C-013 test bodies:** read during R1/R2 in this session, not re-read now. R2 changed only `control.js`.
- **`page-program.js` decoder:** never fully read.
- **R1 report, R1 independent review and R1 verification JSON:** reused from earlier in this session. I re-read the R2 report, R2 independent review, R2 verification JSON and task sheet.
- **Not read at all:** the C-012, C-010 and C-011 delta bodies; `web/chrome-connector/*`; the contents of `C-013-R2-input-candidate-manifest.json`.
- **`docs/requirements.md`:** reused unchanged from the same-session baseline.

## Denials, caps and quota
- No permission denials.
- No quota, session-limit or 429 error.
- About $1.08 of the $4 cap used; well under the 32-turn and 900-second limits.
- I wrote no files.

## Verdicts
- **OFFLINE_REPAIRED_SOURCE_AGREEMENT: AGREE.** This applies only to the exact 123-file candidate `dbf68f22…9732`, and only in the offline, fake-data scope. It comes with the self-authorship caveat and the issues listed above, and Codex owns final acceptance.
- **REAL_PURCHASING_READY: NO.**
  - The extension has not been installed or granted access.
  - Apple's current secure contracts, real refusal behaviour and real timing are not established.
  - The one-Pro order authorization has been used up, and there is no new authority for a bag, slot, order, payment or Duo.
  - No task, test or arrangement here counts as runtime readiness.
