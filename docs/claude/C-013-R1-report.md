# C-013-R1 delivery report (Claude, implementer)

Session `[original Claude session retained privately]`, model `claude-opus-5-5`, effort `xhigh`. This is an implementer report, not acceptance. Codex owns independent acceptance and I did not review or approve my own work. REAL_PURCHASING_READY remains **false**.

## Scope read

- **Read for this task:**
  - `docs/tasks/C-013-R1.md`
  - `CLAUDE.md`
  - `docs/reviews/C-013-functional-findings.md`
  - `docs/reviews/C-013-bounded-agreement.md`
  - `docs/reviews/C-013-Claude-cross-review.json` (the receipt)
  - the complete `review/c013-functional-findings.test.ts`
  - all affected current sources: `control.js`, `job.js`, `owner.js` and the relevant parts of `page-program.js` and `chrome-port.js`
  - the relevant parts of `test/checkout-r1-public-configuration.test.ts` and `test/checkout-job.test.ts`
- **Read only partially or earlier:**
  - `docs/reviews/C-013-Claude-cross-review.md` is my own previous output. This task read it only by grep of headings and P3 rows.
  - `docs/requirements.md` was read completely in C-013-REVIEW in this same session. Here only the R01-R10 and A01-A14 rows were re-read, for the mapping below.
  - `page-program.js` was read in its AUTH, memo and action sections, not every decoder line.
- **Not read:** the C012 and C010/C011 Codex delta bodies. No attribution question needed them.
- **Manifest check before edits:**
  - Command: `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-013-R1-input-candidate-manifest.json`
  - Result: ok, 120 files, `bdc3f674ad5f951a548433909e89a6b76e135512d2db40deebc66014f01d20e5`.
  - I did not rerun it after edits; its checksum is expected to fail now.

## Design decisions and reasons

### P3-1: grants cannot outlive one handler (`control.js`)

**Root cause:** the module-level `finalGrant` was cleared only inside the owned lock callback. If the approval, Web Locks or ownership check rejected the call first, the grant stayed in memory and a later Resume picked it up.

**Repair:** grants now exist by construction only for the duration of one call. Clearing a variable at every exit would be easier to get wrong.

- `finalGrant` and `activeGrant` are no longer module state.
- The Final click builds a grant locally. It first checks the explicit review checkbox and the durable record:
  - REVIEW phase;
  - not sent;
  - not reconcile-only;
  - not retired.
- The grant is passed as `run(false,{finalGrant})`.
- The advance (Start) grant is a local `startGrant`, created only inside the owned lock after the preflight digest and tab match.
- Resume and Rebind pass no grant, so a rejected attempt has nothing to leave behind:
  - unchecked approval;
  - missing locks;
  - lock error;
  - failed ownership;
  - preflight mismatch;
  - storage or session exception;
  - job exception.

**Exception handling:**
- The whole owned body is inside try/catch/finally. Storage, session and constructor errors now show a Chinese status instead of an unhandled rejection.
- A lock-request error is caught outside and shows `执行未能安全开始；记录保持不变…`.
- A storage error while building the final grant shows `最终确认未完成；未发出订单`.

**Durable truth:** the control page never writes the task record. Sent/unknown truth, `revokedGrantIds` and `finalIntent.sent` stay where the job keeps them. Pause and Stop now only signal the job, because there is no module grant left to clear.

### P3-2: retirement without Web Locks (`control.js`)

- With `navigator.locks` absent, Retire returns early with `浏览器缺少执行互斥能力，无法安全退役；记录保持不变`. It does not call retire and does not write.
- Lock-request or storage errors are caught and shown as `退役未完成；记录保持不变`.
- Nothing is deleted. There is still no `remove` or `clear` call.

### P3-3: duplicate delivery at the observed AUTH route (`page-program.js`)

On `/shop/signIn/orders`, a command whose id is already in this document's `__applebuyExecuted` memo now returns `{delivered:false,touched:true,reason:'OperationAlreadyDelivered'}`. In unstructured mode it throws `OperationAlreadyDelivered`.

- A command not in the memo is still reported positively untouched with `AuthenticationRequired`.
- The branch reads only the memo:
  - no DOM, credential or field read;
  - no memo addition;
  - no click.
- `ChromePort` already maps any `touched:true` result to `MutationResultUnknown`, so the job keeps the pending action and does not repeat it.
- The route pattern itself is unchanged. The P3-4 bare `/shop/signIn` route was not broadened.

### P3-5: consecutive untouched bound with verified-progress reset (`job.js`)

**New durable field `untouchedStreak`.** It counts positively untouched failures since the last trustworthy progress.
- It is reset to 0 in exactly two places, both of which require a delivered pending action whose result is verified from current evidence:
  - the existing verified `reached` reconciliation (phase, verified step, item/purchase conditions, and the per-action selected choice, pickup, date or payment proof);
  - verified `chooseSlot` acceptance.
- Nothing else resets it:
  - another list or generation;
  - an unproven or unconfirmed result;
  - `touched` or unknown transport;
  - not-dispatched recovery;
  - a verified slot refusal;
  - restart.

**Gating:**
- The protected consecutive bound keeps its exact reason: `untouchedStreak > maxUntouched` gives `'repeated-untouched-failures; human check required'`. Four consecutive failures still stop.
- New absolute per-run bound: `maxUntouchedPerRun`, default 12, counted in memory per `run()` and never reset within it. Exceeding it gives `'untouched-failure-run-limit; human check required'` (NEEDS_VERIFICATION).
- `maxSteps`, `maxPolls` and the elapsed-time wait bound still apply.

**History:** `untouchedFailures` stays cumulative.

**Validation and migration:**
- `validStored` accepts `untouchedStreak` only as a safe integer ≥ 0, and not above a recorded `untouchedFailures`.
- A legacy record without a streak migrates conservatively with `streak := total`, meaning all old failures count as consecutive.
- A record with a streak but no total migrates `total := streak`. This keeps the existing legacy-field deletion test valid without weakening it.

**Restart behaviour:**
- Public-configuration validation used to start a fresh record on every run. A new validation run on the same tab and plan digest now inherits both counts, so restarting cannot reset the streak.
- An invalid prior validation record is still ignored, as before. Validation never touches the purchase key.

**Known residual:** the per-run bound resets when a human starts a new run. The durable streak does not reset, so once exhausted each human Resume allows exactly one further untouched attempt until verified progress occurs. This matches the earlier cumulative behaviour.

### P3-6: already-selected allowed store waits (`job.js`)

In FULFILLMENT, after the existing item, price and fulfillment-conflict gates, the store counts as "already selected" only if both hold:
- `fulfillmentChoice==='pickup'` (the native pickup control is checked);
- `purchaseMatches`: verified exact product, quantity 1, pickup, an allowed store and total ≤ cap.

Then:
- **Selected:** a bounded `poll(maxWaitMs)` with 50 ms port waits, inside the existing elapsed-time and poll-count caps. There is no click and no busy loop.
- **Loading never ends:** gate `NOT_READY`, reason `selected-store-controls-not-loaded; no slot held, availability not established`.
- **Evidence changes within the same wait episode:** gate `NEEDS_VERIFICATION`, reason `selected-store-evidence-changed-while-loading; not clicked again`. This covers a missing, unverified or disallowed store and a flip to delivery, including across an intervening PROCESSING poll. It does not re-click.
- **Item or price contradiction:** the existing `BLOCKED` `pickup-conditions-not-verified`.
- **AUTH and other STOP phases:** the existing human gate.
- **Not proven selected:** an unselected, unverified or disallowed store, or a missing pickup-control proof, still gets one normal `selectStore`, or `selectPickup` when fulfillment is not pickup.

Local selection never sets `acceptedSlot`. Only the existing verified acceptance at DETAILS, PAYMENT or REVIEW does.

## Changed files

| File | Change |
| --- | --- |
| `web/checkout-connector/control.js` | Local per-call grants; whole-run exception handling; retire guard and catch; Pause/Stop simplified. |
| `web/checkout-connector/job.js` | `untouchedStreak` (validation, migration, fresh record, carry into validation restart); `maxUntouchedPerRun`; resets only on verified progress; selected-store bounded wait with an evidence-change gate. |
| `web/checkout-connector/page-program.js` | AUTH branch reports a memoized command as touched and already delivered. |
| `test/checkout-c013-continuity.test.ts` | New: 15 focused FAKE tests. |
| `docs/claude/C-013-R1-report.md` | This report. |

No other file was changed, including the review criteria, existing tests, manifests, README/package, permissions, `.claude/`, `.git/` and `.local/`.

## New tests (`test/checkout-c013-continuity.test.ts`, all FAKE)

- **P3-1 (5 tests):**
  - a storage failure while building the final grant;
  - a missing lock or lock error during final confirmation;
  - an exception inside the owned run;
  - a Start refused for missing preflight;
  - two explicit confirmations each give one distinct grant with Resume in between, a sent `finalIntent` refuses a new grant, and the control page never writes.
- **P3-2 (1 test):** retirement lock error, busy owner and storage failure change nothing; a retirable task still retires.
- **P3-3 (2 tests):**
  - the AUTH memo matrix: structured and unstructured, memoized and fresh, no memo; the memo is never extended; DOM access throws;
  - a job-level touched report keeps `pending`, does not count as untouched and stops at `auth`.
- **P3-5 (4 tests):**
  - a durable sequence across five jobs: step bound, touched, unproven restart, verified progress, then the bound;
  - a validation restart keeps the streak;
  - legacy and malformed migration and validation;
  - alternating progress stops at the per-run limit after 13 untouched and 25 actions.
- **P3-6 (3 tests):**
  - never-ending loading gives bounded NOT_READY with no action or slot;
  - unselected, unverified, disallowed or unproven stores still get one normal selection;
  - store, fulfillment and price changes and AUTH during the wait, including across PROCESSING, stop without clicking.

## Commands actually run and results

| Command | When | Result |
| --- | --- | --- |
| `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-013-R1-input-candidate-manifest.json` | before edits | ok, 120 files, `bdc3f674…20e5` |
| `node --test review/c013-functional-findings.test.ts` | before edits | 8 tests: 2 pass, 6 fail (the expected reproductions) |
| `node --test review/c013-functional-findings.test.ts` | after P3-1/2/3/5/6 | 8 tests: 8 pass, 0 fail |
| `node --test "test/*.test.ts" "review/*.test.ts"` | first full run | 1 fail: the existing `R1 fixed no-extras intent…` test. A fresh row now carries `untouchedStreak` and that test deletes `untouchedFailures`, which my first validation rule rejected. I fixed the product rule (a streak without a total is valid and migrates conservatively). The test was not changed. |
| `node --test "test/*.test.ts" "review/*.test.ts"` | after that fix (final source) | **374 tests, 374 pass, 0 fail**, 0 skipped/cancelled/todo, about 6058 ms |
| `node --test review/c013-functional-findings.test.ts` | final source, last command | **8 tests, 8 pass, 0 fail**, about 88 ms |

374 = 351 prior + 8 protected + 15 new. The final source edit happened before both final runs, and the report file was written afterwards.

## Unrun checks, denials and caps

- The manifest command was not rerun after edits; the old checksum is expected to fail.
- No browser, extension installation, host grant, network, merchant observation or action, authentication, or account/order query was run.
- I ran no other command. There were no permission denials in this task, and no turn, USD or quota exhaustion; about $4 of the $10 cap was used when this report was written.

## R01-R10 mapping

- **R03:** the already-selected store is not clicked again.
- **R04:** local store selection is not treated as a reservation; the job waits for authoritative slot evidence.
- **R06:** loading versus none versus changed evidence versus authentication are distinguished, and a timeout never implies no stock.
- **R07:** duplicate delivery stays unknown at AUTH; there is no repeat after touched or unknown results; restart cannot reset the retry bound; one grant per explicit confirmation.
- **R08:** Pause and Stop still signal the job; the human gates at AUTH and on evidence change; sent and unknown truth is preserved.
- **R09:** no grant survives a rejected attempt; still at most one final per explicit confirmation; no real resource action.
- **R10:** concise Chinese gates for locks, retirement and exceptions; reasons are recorded in history and state.
- **R01, R02 and R05:** unchanged; existing conditions are not weakened.

## Known limitations and evidence boundary

- **All of this is offline and synthetic.** The control page, Web Locks, storage, merchant documents, observations and memo are FAKE. Nothing establishes a live Apple contract.
- **Unchanged and still UNVERIFIED:**
  - P2-1: preselected or placeholder date shapes;
  - P2-2: upsell and repeated-title extras heuristics;
  - P2-3: asynchronous slot-validation continuation;
  - P3-4: the bare `/shop/signIn` route.
- **The P3-6 selection proof depends on the existing decoder.** It uses the `fulfillmentChoice` and store proof from `page-program.js`, including the existing labelled-field store proof. If a real page shows a summary store field while its slot controls need a fresh radio click, the job now waits and then returns `NOT_READY` instead of re-clicking. That is safe but may need human action. Real behaviour is unobserved.
- **Run-bound semantics:** the per-run untouched bound resets on a human-initiated new run, and only the durable streak persists. An invalid prior validation record is ignored, as before.
- **Real-run readiness:** standalone extension access, secure checkout contracts, refusal text, slot timing and payment-dependent behaviour are unverified. No new Pro/Duo order, payment or slot-hold authorization exists; the historical Pro authorization was consumed.

## Resumable state

All five finding categories are implemented, the protected 8/8 pass and the full suite passes at 374/374. Nothing is pending on my side. Next step: Codex's independent inspection, rerun and current-source agreement. If defects come back, resume in this session from the three source files and this test file.
