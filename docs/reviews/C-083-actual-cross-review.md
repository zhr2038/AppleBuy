# C-083 cross-review of exact231: AGREE for the bounded software only

I did not approve live use, real purchasing or the whole goal. **No real Pro unpaid order has been created or verified.**

- **What I reviewed:** the 231-file candidate whose map hash is `e4caca1982db14a76c74c3247a286dc6c8fdffd9446a3efd27339d646116203f`.
- **Frozen bytes:** command 1 returned the same hash with 0 mismatches at the start and again as the last command.
- **No edits:** I changed no files and wrote no report file.
- **Not done:** no live probe, worker, GUI, browser, account or Apple access, and no agents. The only network use was the owned localhost fixtures in commands 5 and 6.
- **Approval was not done:** I did not approve live use, real purchasing or the whole goal.

## Why AGREE (limited to the reviewed safety properties)

### 1. The C-077 N1 blocker is resolved
After export, the extension can no longer get buying authority back:
- **Retirement and restarts:**
  - `job.js:167` (retire) and `job.js:179` (read-only bag retirement) refuse any record carrying a handoff anywhere inside it.
  - `job.js:208` makes the same check before any purchase run, so the successor branch at `job.js:216` cannot be reached from a handed-off record.
  - `pre-final-restart.js:22` blocks the expired pre-final restart the same way.
- **Export:** `desktop-handoff.js:6` refuses to export a retired record.
- **Extension UI:** `control.js` checks the handoff at 38 (prepare), 154 (start/resume, except the read-only rebind), 205 (retire) and 234 (final).
- **Recovery probe:** `closed-checkout-probe.js:23`, which is outside the list but was read to EOF, rejects any record with `reconcileOnly===true`.
  - That flag is set by export and nothing clears it, so the probe cannot run on a handed-off record.

### 2. Read-only and public modes still cannot purchase
- **Read-only reconcile:**
  - It cannot send a merchant command: `job.js:307`, `353`, `358` and `360` all stop the run before any command is built.
  - Its port is unauthorized and in observe mode; `act` refuses that at `chrome-port.js:39`.
- **Rebind:** the port is unauthorized (`control.js:163`), and `job.js:240` plus `job.js:358` stop it before any command.
- **Validate:** it uses its own storage key and only public product choices (`job.js:206`, `461`; `chrome-port.js:40`).
- **Observe:** it never reads or writes a task (`job.js:204`).
- **Probe:** gated as described in point 1.

### 3. The C080 desktop reconcile path is sound
- **Exclusive owner:** it takes the owner lease (`browser-session.mjs:18`).
- **Existing record required:** it needs an existing, non-retired, read-only Pro record (`:25-28`).
- **Port limits:** the port is unauthorized, in observe mode, has no order-summary read, no pickup data and no final grant (`:44`).
- **No new task:** it reuses the existing task id and plan digest (`:49`).
- **No false confirmation:** `realOrderVerified` can only be true in purchase mode (`:50`).
- **Runtime wiring:** a reconcile never prepares the final review and never passes private data (`checkout-runtime.mjs:32-33`, `:42`).
- **GUI:** the window automatically picks reconcile when the worker reports a read-only record (`app.py:291-295`).

### 4. The C082 shortcuts are sound
- **Same guarded handlers:** Ctrl+Alt+P and Ctrl+Alt+S call the same guarded functions as the buttons (`app.py:166-167` and `:183-189`, which call `open_checkout`, `stop_checkout` or `stop`).
- **No private text in titles:** the window title only uses fixed labels (`app.py:173-181`). No field values or record text can reach it.

### 5. Concurrency, cleanup and privacy
- **Concurrency:**
  - The worker refuses a new command while one is running or the login watch is reading (`purchase-worker.mjs:30`).
  - Stop is always handled first (`:29`).
  - The runtime refuses overlapping work (`checkout-runtime.mjs:11` and `:28`).
  - Old-worker messages are dropped by generation (`app.py:283`).
- **Cleanup:**
  - If cleanup fails, the owner lock is kept (`checkout-runtime.mjs:61-62`).
  - A missing ledger stops the worker before Chrome launches (`checkout-runtime.mjs:13`).
- **Privacy:**
  - Pickup details travel only over the worker's standard input.
  - Error output is discarded (`interactive_child.py:24-26`).
  - Only fixed, filtered fields are ever sent back to the window (`checkout-runtime.mjs:7`).

## Findings (none blocking within the bounded scope)

| ID | Severity | Where | Problem | What would close it |
|---|---|---|---|---|
| L1 | Low | `app.py:158-160`, `249`, `254-256`, `304` | The final-consent checkbox is always enabled. It is cleared when a run starts, but not when the review becomes ready. So the "I checked the current order" box can be ticked before the review page exists. The submit click itself still has to come after the review is ready. | Disable the box until a review-ready result arrives, and clear it on every ready/blocked/result event. A Python test should show that a tick made before the review cannot reach submit. |
| L2 | Low | `browser-session.mjs:32-37`, `:45`; `checkout-runtime.mjs:39` | A reconcile stamps the current session onto the imported record. Within the same worker, a later "continue" then treats that record as the session's own: it skips the legacy guards at lines 33-35, and the tab check passes after the rebind. Only `job.js:208` and `job.js:358` stop it. The C080 test at `test/desktop-c080-reconcile.test.ts:17` confirms this: it expects the job-level "revoked source" error, not a session-level rejection. There are no effects, but one layer of protection is gone. | Treat a record as the session's own only if it is not read-only and has no handoff, or don't stamp the session during reconcile. A test should show the rejection happens before the purchase job is created. |
| I3 | Evidence gap | `app.py:186-189`, `:285-288`, `:178` | In C-082, the worker had already ended at the missing-ledger stop, so the window no longer counted the checkout as running. Ctrl+Alt+S then ran the idle offline-runner stop, which shows the same "已停止，旧记录保留" title. That evidence does not prove pausing a running checkout. | Pause evidence taken while a checkout worker is alive, with a title or event that tells checkout stop apart from offline stop. |
| I4 | Info | `purchase-worker.mjs:29` | The stop handler awaits browser cleanup with no `catch`. If cleanup fails, Node's default unhandled-rejection behaviour can end the process, so the exit code 2 and the "cleanup unconfirmed" message (`:40`) are not guaranteed. It still fails safe because the owner lock is kept. I found this by reading the code and did not run it. | Add a catch, plus a test with a failing browser close that checks the message, exit code 2 and the kept lock. |
| I5 | Info | `app.py:166-167` | `<Control-Alt-p>` and `<Control-Alt-s>` do not fire with Caps Lock on. This is usability only. | Optional: also bind the upper-case keys. |

## Residual limits (unchanged from earlier reviews)
- **Partial launch (L):** if closing the browser fails during a partial launch, the runtime still reports cleanup as confirmed and relies on the Windows Job Object to kill it (`purchase-worker.mjs:12`).
- **Login watch (I):** it re-arms on every login gate (`purchase-worker.mjs:22-24`).
- **F4:** the session id is per process, so a desktop-owned task cannot resume after the worker restarts (`browser-api.mjs:10`).
- **F5:** a document change between the identity check and running a command is still not caught on the command path (`browser-api.mjs:28-30`, `65-69`).
- **F9:** unknown actions nested in non-final history are not scanned.

## Declared limitations and blockers (must be disclosed)
- **Playwright dependency (F7):** the worker loads Playwright from the existing Codex runtime cache in the home directory (`purchase-worker.mjs:10`). The programme cannot run without it.
- **Stale owner lock (F8):**
  - Cause: pausing a checkout worker that takes more than 5 seconds forces a process-tree kill (`interactive_child.py:78-80`).
  - Effect: the owner file is left behind (`task-store.mjs:10-11`), so every later start is refused.
  - This fails safe, but there is no recovery inside the programme; someone has to remove the lock manually.
- **Whole-goal blocker (B1):** in production the programme has no way to buy.
  - A blank ledger stops before launch (`checkout-runtime.mjs:13`).
  - An import must be read-only and carry the handoff (`task-store.mjs:15`), and stays permanently read-only (`job.js:208`/`358`, `browser-session.mjs:34`).
  - Every passing "confirmed unpaid" result comes from FAKE retired fixtures, which do not prove the imported task can buy.
- **Still unverified:** the old Add/slot attempt is still unknown. The real account, login, slot, checkout, final step, unpaid order and deployment are all unverified.

## Commands (run separately, in order, in the foreground, with no pipes, redirection or filters)
1. `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-082-candidate-manifest.json`: ok, 231 files, the expected hash, 0 mismatches.
2. `python -B -X utf8 -m unittest discover -s test -p "desktop_c0*_test.py"`: 9 tests, OK (0.457 s).
3. `node --test` on the 10 listed files: 40 passed, 0 failed (1498.9 ms).
4. `node --test --test-reporter=dot "test/*.test.ts" "review/*.test.ts"`:
   - Only dots were printed, with no failure markers or failure section, and the tool reported no error.
   - I did not count the dots myself, so I cannot confirm Codex's 1415.
5. `node test/c060-native-restart.mjs`: 2 passed.
   - Cleanup: 2 contexts closed, browser closed, server closed, no errors.
   - It wrote a result file under `.local/reviewer/`, which I did not read.
6. `node test/c040-native-order.mjs`: 8 passed, all FAKE.
   - Network: the localhost guard request was aborted with 0 server hits. All other traffic was the fixture's own (56 allowed).
   - Cleanup: 8 contexts closed, browser closed, server closed, no errors.
   - It wrote a result file under `.local/c040-native-order/`, which I did not read.
7. Repeat of command 1, run last: identical result.

**Denials, errors and caps:**
- Permission denials: 0. Tool or command errors: 0.
- Spend: about $3.9 of $10 by the in-session counter before writing this report. That is a context figure, not provider billing.
- I cannot measure turns or wall time myself, and the invocation spanned a context compaction. Root should audit the 72-turn and 1200-second limits.

## Read completeness
**Read to EOF in C-083 (including after the compaction):**
- Sheet items 1, 2, 3, 5, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 19, 21, 22, 23, 24, 40 and 41.
- Also `closed-checkout-probe.js`, which is not on the list.
- `chrome-port.js` (item 25) was checked only with targeted searches covering `act`, `readSummary`, `readBag`, `readBagAfterAdd` and `lookupOrder`.

**Not re-read to EOF in C-083 (gap):**
- Items 4, 6, 7, 17, 20, 25 (full), 26 and 27–39.
- I read them in full earlier in this same session during C-077 and C-079, but their text is no longer in my context after compaction.
- I treat them as unchanged based on the earlier C-078 comparison and Codex's stated changed paths. Command 1 confirms the whole 231-file map, not each of these files individually against my earlier reads.
- Finding (d) from my earlier notes (a startup failure in `process_tree` allowing another start) depends on that earlier reading.

## R01–R10
- **Exercised only with FAKE data:**
  - R01: fixed Pro plan, one unit, ¥9,999 cap, the fixed store.
  - R04 and R05: slot choice and refusal.
  - R06: unknown results.
  - R07: one owner and no resubmission (the commands above).
- **Covered by this review's checks:**
  - R08: the pause and stop paths, with I3 as the evidence limit.
  - R09: read-only and public modes cannot purchase, and there is no real mode in this review.
  - R10: Chinese window with fixed title labels and no private data in the title.
- **R02:** only Root's earlier public configuration check counts as real evidence.
- **Not met for the real goal:** B1 above.

## Real evidence vs simulation
- **This review's tests:** every one used FAKE data or local fixtures.
- **Real-world facts:** the only ones come from Codex's own records, which I did not reproduce:
  - C-082 native window titles: the missing-ledger stop and the idle stop.
  - The empty live bag.
  - Root's earlier public configuration check.
- No private identifiers or denied inputs appear in this report.

## Resumable checkpoint
- **Done:** all commands, including the final repeat of command 1, and the verdict.
- **Optional follow-up if Root wants a full EOF re-read:**
  - Re-read items 4, 6, 7, 17, 20, 25, 26 and 27–39 against the same frozen hash, with no other steps.
  - That would resolve the read gap above. I don't expect it to change the verdict, because the safety guards are in `job.js`, which I re-read in full in C-083.
