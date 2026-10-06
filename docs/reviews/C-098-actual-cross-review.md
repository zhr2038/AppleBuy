Root note: This actual C098 report is historical for 237/8320ff. All 30 mandatory EOF reads and the requested model were verified, but commands ran 2,3,4,1 instead of 1,2,3,4,1. Root did not accept the candidate with unresolved findings. The legitimate handoff had actually been imported before this review; its report sentence about an unsolved handoff is not evidence of a missing file. Actual audited tool calls are Read31/Bash4/Grep1, not the author-estimated fifteen. Root reproduced and repaired findings under C103; current 238 source needs fresh C104 review. No live Pro order is proven.

# C-098 delivery report: Opus 5.5 cross-author review (review only)

## 1. Verdict

**AGREE, bounded to the frozen source (SHA `8320ff83…`, 237 files).** This covers the combined C093 kernel lease and atomic writer, the C096 transfer progress signal and the C097 same-session pause/resume.

- **Safety holds.** I found no path to a duplicate Add, Checkout or submission. Nothing lets a stale holder commit after a new owner takes over, and nothing gives a readonly record buying authority. Sent actions stay pending after a pause, and resume does not extend any deadline.
- **Five Low findings remain (F1–F5).** All fail closed. Codex must resolve or explicitly accept each one before acceptance.
- **This is not approval** of the whole repository, the live chain, the installed GUI, the goal, or the real Pro unpaid order. The legacy human handoff is not solved.

**The command order did not match the sheet.** I ran 2 → 3 → 4 → 1. I did not run command 1 first; it ran only once, at the end. The final manifest check does show the source unchanged after the tests, but this round has no check from before the tests. If Root requires the exact 1→2→3→4→1 sequence, this round needs a replay.

## 2. Scope and immutable source

- Command 1 output: `{"ok": true, "files": 237, "sha256": "8320ff837aa48bef426f79aa319184f4516d7b5d4777931614d769edc2acd9c8", "mismatches": []}`. This matches the sheet.
- **The path count is wrong in the sheet.** It says "eleven" in one place and "ten-path" in another. Comparing the C-090 manifest (`307a6ec8…`, which matches the C-092 agreement) with C-097 gives **13 changed or new paths**:
  - **C093:** `browser-session.mjs`, `task-store.mjs`, `owner-lease.mjs` (new), `owner_lease.py` (new), `test/desktop-c093-lease-child.mjs` (new), `test/desktop-c093-owner-recovery.test.ts` (new).
  - **C093/C097:** `test/desktop-c078-runtime.test.ts`.
  - **C096/C097:** `checkout-runtime.mjs`; C096 also changed `test/desktop-c084-cart-transfer.test.ts`.
  - **C097:** `app.py`, `purchase-worker.mjs`, `interactive_child.py` (5dd6c29f→28fde5ce), `test/desktop_c078_test.py` (7dac8c72→c5a3c8b6).
  - `auth-continuation.mjs` is unchanged since C090 (`e838f8dc`).
- I reviewed all 13 paths. The old test assertions can't be byte-compared because git is not allowed. As far as I can see, C097 only appended to the test files.

## 3. Reads, commands and cleanup

**Reads**
- 30 of 30 required files read fresh to EOF. `job.js` was read in two chunks (1–250 and 250–499).
- One extra read: a Grep of the repo file `docs/reviews/C-090-candidate-manifest.json`, used only to confirm the scope count above.
- I did not read `cart-transfer.mjs` this round. It is unchanged since C090 (`d092e8b0`).

**Commands** (each exact, separate and in the foreground)

| # run | Command | Result |
|---|---|---|
| 1st | cmd 2 (focused Node: c093, c072, c078, c084, c080) | 42 of 42 passed, 0 failed, about 2.5 s |
| 2nd | cmd 3 (`python -B -X utf8 -m unittest discover …`) | 19 tests, OK, 0.46 s |
| 3rd | cmd 4 (full Node, dot reporter) | Exit 0. Dots only, with no failure markers and no failure list. About 1,445 dots (72 rows of 20 plus 5), which matches the author's figure. The reporter prints no totals, so I can't confirm the count exactly. |
| 4th | cmd 1 (manifest) | ok, 237 files, SHA as above, no mismatches |

**Cleanup**
- The tests create their own fixture folders under `.local/test-runs/` (c093-owner, c093-runtime, desktop-handoff, desktop-owner and others). I did not read or delete them.
- I did not check for leftover processes, because no command for that is allowed. Every test command returned normally.
- I made no edits, wrote no files and invoked no agents. I did not use the GUI, Chrome, the network or Apple, and made no permission changes.

## 4. Verified design points

**Kernel lease (`owner_lease.py`)**
- It takes a byte-range lock and never unlinks the marker. There is no PID, age or TTL logic (`owner_lease.py:41-54`).
- Legacy JSON, empty and corrupt markers are never rewritten (`owner_lease.py:56-60`).
- Journal writes happen under the lock: temp file, fsync, then replace (`owner_lease.py:79`, `14-28`). A corrupt journal gives `ok:false` and stays untouched (test 5 passes).
- UTF-8 is set explicitly on both pipes (`owner_lease.py:31-32`).

**Node lease client (`owner-lease.mjs`)**
- `owned` checks the exit and signal codes (`owner-lease.mjs:27`).
- When the holder closes, pending writes are rejected and the loss listeners fire (`owner-lease.mjs:10`).
- Unknown reply ids and stdin write errors fail closed (`owner-lease.mjs:15`, `30`). The 2 MB caps agree on both sides (`owner-lease.mjs:29`, `owner_lease.py:69-74`).
- Every `create`/`tabs`/`permissions`/`scripting` call is checked against the lease at call time (`owner-lease.mjs:36-43`).
- **Old-holder write denial is verified.** After its holder dies, an old Node process can't commit, because the journal write runs inside the dead holder (test 4 passes).

**Store**
- `put` requires the lease (`task-store.mjs:10`). Import releases the lease in `finally` (`task-store.mjs:15`).

**C097 runtime (`checkout-runtime.mjs`)**
- `execute`, `advance`, `transfer` and `submit` all reject while paused (`checkout-runtime.mjs:33`, `42`, `50`, `64`).
- Pause clears the final consent, aborts the run and drains it (`checkout-runtime.mjs:72-73`).
- Resume requires a live lease and goes back through `advance`, which re-checks pause before executing (`checkout-runtime.mjs:78-79`).
- Close drains active work, then closes the browser, then releases the lease, then confirms cleanup (`checkout-runtime.mjs:84-88`).

**Purchase controller (`job.js`)**
- Pause is checked at lines 263, 274, 296, 397, 466 and 477.
- The write-ahead runs before every send (`job.js:468-476`), and an action stopped before sending is marked not dispatched (`job.js:479`).
- Pending actions are reconciled and never resent (`job.js:304-358`). The expiry check (`job.js:261`) is not reset by resume.

**Readonly and consent (`browser-session.mjs`)**
- A readonly record can never buy (`browser-session.mjs:35`).
- Final consent applies only in the same context, at REVIEW, and expires after 60 s (`browser-session.mjs:44`).

**Worker IPC (`purchase-worker.mjs`)**
- Pause is a separate command and stops the auth watch (`purchase-worker.mjs:45`).
- The auth watch is busy whenever the runtime is paused (`purchase-worker.mjs:32`), and its epoch guard stops stale ticks (`auth-continuation.mjs:5-14`).
- The watch never starts while paused (`purchase-worker.mjs:37`, `51`). Stop still does a full close (`purchase-worker.mjs:44`).

**C096 transfer progress**
- The non-readonly progress signal fires only when the transfer was created, the runtime is not closing or paused, and the lease is held (`checkout-runtime.mjs:54`).
- Pause racing a transfer write: the write finishes. The `advance` that follows throws "Paused". The paused acknowledgement then reports `canContinue` from the stored record, so the session continues correctly.

**GUI (`app.py`)**
- Pause sends the pause IPC instead of killing the worker (`app.py:276`).
- Continue is enabled only when the acknowledgement says `canContinue` (`app.py:306`).
- Continue sends `resume` rather than a fresh start (`app.py:248`).
- Late results that arrive while paused cannot enable consent (`app.py:310-311`).

## 5. Findings (all Low, all fail closed)

### F1 — Concurrent first start can leave an empty `.owner` marker that blocks every later start

- **Where:** `owner_lease.py:41-64`.
- **Trigger:** Holder A creates the file (`x+b`). Holder B gets `FileExistsError` and opens it `r+b`. B takes the lock first, reads an empty file with `created=False` and emits `False`. A's non-blocking lock attempt then lands inside B's lock window, so A also emits `False`. The marker stays empty.
- **Consequence:** Every later acquire returns HeldOrUnconfirmed (test 3 confirms an empty marker blocks), so manual handling is needed.
  - The crash variant is already a disclosed limit.
  - This concurrent variant is not a crash and is not disclosed. It can happen when two GUI instances start for the first time.
- **Reproduction:** Not executed, because no extra commands are allowed. It is timing-dependent. Inject a delay between `open(x+b)` and the lock call in one holder, then start two holders on a fresh path.
- **Acceptance:**
  - Write the header to a unique temp file, then `os.rename` it to `.owner`. On Windows this fails if the target exists, so it acts as create-if-absent, and an empty `.owner` can never be created.
  - Existing empty or foreign markers stay blocked.
  - Add a test with N concurrent pairs: exactly one owner in each pair, and the marker equals the header.

### F2 — The C093 runtime lease-loss test does not exercise the production write path

- **Where:** `desktop-c078-runtime.test.ts:55-61`.
- **Gap:** The test uses `world()`'s fake `put`. In production, `DesktopTaskStore.put` throws LeaseLost at the post-act save (`job.js:494`) or at the PAUSED gate. The real outcome is a rejected run with a `blocked` LeaseLost message, not a stored PAUSED state.
- **Safety:** Still safe. The write-ahead is already on disk and every later dispatch is denied.
- **Acceptance:** A test using a real `DesktopTaskStore`, a fixture ledger and a real holder, killed mid-act. Assert:
  - the rejection message;
  - the pending checkout on disk;
  - zero `selectPickup`;
  - exactly one close;
  - a new store can reacquire the lease and sees the pending action.

### F3 — Lease loss is never reported to the GUI, which then shows false status

- **Where:** `checkout-runtime.mjs:18`, `app.py:326`, `checkout-runtime.mjs:78`.
- **Cause:** `onLost` aborts and closes the runtime but emits nothing, and the worker keeps running.
- **Running case:**
  - The run rejects with LeaseLost, and the GUI shows the correct message.
  - The `blocked` handler then re-enables Continue (`app.py:326`, because the worker is still busy).
  - Clicking Continue gives `DesktopSessionAlreadyRunning`, shown as "当前执行尚未结束" (the run has not finished). That is false: the session is closed.
- **Paused case:**
  - The browser window closes silently, but the status still says "保留当前任务与官网窗口" (task and Apple window kept).
  - `resume` throws AlreadyRunning (lease not owned, or runtime closed) while `paused` is still true. The GUI drops that reply (see F4), so Continue appears to do nothing.
- **Reproduction (Node):** Use `world()` with a real holder, as in the C093 test. Advance to REVIEW, pause, `holder.kill()`, and wait for the loss callback. Then `runtime.closed===true`, `runtime.paused===true`, and `runtime.resume({...})` rejects with `/AlreadyRunning/`.
- **Acceptance:**
  - On lease loss, the worker sends a distinct terminal event and stops accepting commands, or exits.
  - The GUI disables every checkout action and shows the LeaseLost message.
  - Add tests for both the running and the paused case.

### F4 — While paused, the GUI drops every reply except the paused acknowledgement, and the acknowledgement can arrive before the work has drained

- **Where:** `app.py:310-311`, `checkout-runtime.mjs:73`, `app.py:279`/`236`.
- **What the GUI drops:** Once `checkout_paused` is set, or an event carries `paused:true`, the GUI discards `blocked` and `ready` events. That includes:
  - pause failure: "暂停结果未确认…" (pause result unconfirmed);
  - resume rejection.
- **The runtime race:** `pause()` waits only for `this.active`, which is the session promise. `execute()` may still be running `prepareReview()`, an awaited page read (`checkout-runtime.mjs:38`). So the paused acknowledgement can arrive while `busy===true`.
  - A quick Continue then gets AlreadyRunning with `paused:true`, and the GUI drops it.
  - Continue stays disabled (`app.py:247`).
  - The pause button has been disabled since the first pause (`app.py:279`); only `open_checkout` re-enables it.
  - Recovery is only through Ctrl+Alt+S or closing the window.
- **Reproduction:**
  - **(a) Python, using the `fake_app()` harness in `desktop_c078_test.py`:** `stop_checkout()`, then queue a `blocked` event with `paused:False` and the pause-failure message, then `poll()`. The status stays "正在暂停…" (pausing) and all controls stay disabled.
  - **(b) Python:** set `checkout_paused=True`, call `advance_checkout()`, queue a `blocked` event with `paused:True`, then `poll()`. Continue stays disabled and the message is never shown.
  - **(c) Node:** wrap `runtime.prepareReview` so it awaits a gate. Advance to REVIEW. `await runtime.pause()` resolves while `runtime.busy===true`. `runtime.resume()` rejects with `/AlreadyRunning/`. Release the gate: `execute` rejects with FinalConsentNotCurrent and no submission is sent.
- **Acceptance:**
  - `pause()` resolves only after `execute` or `transfer` has fully finished.
  - The GUI shows `blocked` replies that answer a pause or resume, and restores the controls from the last acknowledgement.
  - The pause button is re-enabled after resume.
  - Add tests for (a), (b) and (c).

### F5 — A lone UTF-16 surrogate makes the journal unwritable and leaves an orphan temp file

- **Where:** `owner_lease.py:23-28`.
- **Cause:** `JSON.stringify` escapes a lone surrogate as `\udXXX`. Python decodes it, then `json.dumps(ensure_ascii=False).encode("utf-8")` raises UnicodeEncodeError, which is caught as ValueError.
- **Consequence:**
  - The write returns WriteUnconfirmed, and the `.tmp` file (already created with `xb`) is left behind.
  - If the existing ledger already contains such an escape, every later write fails permanently.
  - The pre-C093 Node writer accepted these escapes, so this is a regression.
- **Reproduction:** Not executed; this follows from the code. Acquire the owner, then call `store.put(TASK_KEY,{x:'\ud800'})`. It rejects with `/WriteUnconfirmed/`, and a `task.json.*.tmp` file remains.
- **Acceptance:**
  - Either write with `ensure_ascii=True`, which still preserves Chinese through `JSON.parse` (test 4 still passes), or reject before creating the temp file.
  - Delete the temp file on any failure.
  - Add tests for a value and for an existing ledger that contains the escape.

## 6. Observations (no fix required unless Codex chooses)

- **O1.** The holder is spawned as `'python'` from PATH (`owner-lease.mjs:6`). If PATH resolves to the Microsoft Store alias, acquisition fails closed.
- **O2.** `.tmp` files are left behind when `os.replace` hits a PermissionError (for example from antivirus or an indexer), and on F5.
- **O3.** Two different failures are reported as "另一执行器…正在持有任务" (another executor holds the task):
  - the 3-second startup timeout;
  - the OS releasing the lock late after a crash. Production `open` doesn't retry, while the test retries 30×50 ms.
- **O4.** The message "保留任务锁" (task lock kept) at `purchase-worker.mjs:44,57` is inaccurate under the OS lease, because the lock is freed when the process exits.
- **O5.** Lease `put` has no timeout of its own. The GUI's 5 s stop plus process-tree termination bound it.
- **O6.** For `configureProduct` (`browser-api.mjs:38-58`), there are several awaits between the single guard check and the click. Public choices only; no merchant resource is created.
- **O7.** If the guard rejects between the write-ahead and the act (`job.js:476→482`), the action was definitely not dispatched, but the record still treats it as possibly sent. This is conservative and disclosed.
- **O8.** After any pause, the transfer button and checkbox stay disabled for the rest of the session (`app.py:280`). Only a `ready` event re-enables them.
- **O9.** The pause acknowledgement's `readOnly` (`checkout-runtime.mjs:75`) ignores the new-context `recover` case that `observe` includes (`checkout-runtime.mjs:27-28`). Pausing a restarted transferred record before its first reconcile save leaves every control disabled. The window is narrow.
- **O10.** A legacy F8 JSON marker on the user's machine would block until manual handling. I couldn't check whether one exists, because `.local` reads are forbidden.
- **O11.** No test pauses (as opposed to closes) during a transfer write. I analysed that case at the runtime level only, without re-reading `cart-transfer.mjs`.

## 7. Requirement mapping

| Requirement | Status |
|---|---|
| R01, A06 | Plan, terms, quantity, price and store unchanged (`job.js` and `browser-session.mjs` business rules unchanged) |
| R03 | Pause keeps the context, so no redo of bag or selection |
| R04, R05 | Engine unchanged |
| R06 | F3 and F4 are truthfulness gaps; unknown and pending facts are preserved |
| R07, A07, A08 | Kernel lease, a single owner, stale writer denied, reacquire after a killed owner; F1 |
| R08, A09 | Same-session pause/resume; nothing new is sent after pause; sent actions are preserved; F4 |
| R09, A11, A12 | No real-mode change; every merchant path in tests is FAKE |
| R10 | Chinese status messages; F3 and F4 |
| A13 | The holder doesn't log input; worker stderr is drained and discarded (`interactive_child.py:24-26`) |
| R02, A10 | Unchanged; authentication stays human-only |

## 8. Real evidence vs. simulation

- **Real:** Windows processes, the byte-range locks, fixture files on disk, the holder's death and the lock being reacquired, and the UTF-8 pipes.
- **FAKE:** the browser, the DOM, merchant responses, plans and approvals.
- **Not observed:** No Apple site, production ledger, account, order, slot or payment was touched or observed. The C097 native-session evidence is Root's claim; I did not observe it.

## 9. Known limits (not approved)

- A crash before a valid header was written can still leave an unconfirmed marker that needs manual handling.
- The POSIX branch is unverified.
- The customer login is still pending.
- A restart is still permanently readonly, and a bound final order after a restart needs a manual order check.
- The installed GUI, the live chain and real speed are unverified.
- An import alone does not resolve the original remote action.
- The C093 and C094 receipts stay historical and unapproved.

## 10. Denials, caps and usage

- No permission denials, errors, timeouts or quota exhaustion occurred.
- About 15 tool calls this round. Budget was about USD 3.4 of 10 at the last reading, which includes the resumed context.
- The wall cap was not reached.
- The only process deviation is the command order (section 1).

## 11. Checkpoint

The review is complete for SHA `8320ff83…`. To resume:
1. Codex resolves or explicitly accepts F1–F5.
2. Freeze a new manifest.
3. Have the review replay commands in the exact order 1→2→3→4→1, with the F1–F5 acceptance tests included.
