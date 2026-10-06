# C-087 cross-review of the C086 changes (frozen 233-file candidate `0c90acc4…8160`)

## Verdict

**DISAGREE** for exactly the 233-file candidate `0c90acc40ada28b0e0025328246e8a6ee6bdf89bd6b4e94899459fd82dd38160`.

- **Why:** the N2 repair introduces one Medium regression, N7. An ordinary GUI button that stays enabled after a transfer can permanently turn the new buyer into a read-only task, without any new owned context. That contradicts the N2 claim "after a new owned context". It fails closed: no repeated add or submission, and no order.
- **What I agree with (offline fake fixtures only):**
  - N3 and N4.
  - Most of N5.
  - The rule that an emptied cart can never trigger an Add.
  - Permanent revocation of the original task.
  - The guard that only an already-bound final reference hash may be looked up.
- **What I do not certify:** live operation, the installed GUI, the whole goal, or any real unpaid order. No transfer and no programme unpaid order has happened.

## Findings

### N7 (Medium): a same-context reconcile permanently downgrades a live transferred buyer

**Cause**
- `browser-session.mjs:28` sets `recover=old?.desktopContext&&validateDesktopCartTransfer(old,{sessionId:old.desktopContext})`.
- It never requires `old.desktopContext!==api.sessionId`. `checkout-runtime.mjs:25` does have that check.

**Trigger**
- `reconcile_button` ("核对导入的旧任务") is enabled at `app.py:307` when the read-only handoff is first shown.
- `transfer_checkout` (`app.py:256-263`) disables only the transfer and final-submit controls. Result handling (`app.py:319-322`) never touches the reconcile button. So it stays enabled for the whole transferred session.
- The worker accepts a reconcile whenever no run is active, including during the post-transfer login watch: `purchase-worker.mjs:41-43` stops the watch first.

**Consequence**
- `job.run` with `rebind` sets `s.reconcileOnly=true` permanently (`job.js:242`).
- Afterwards purchase is rejected (`browser-session.mjs:34`), and a second transfer is rejected because the transferred row has no top-level handoff (`cart-transfer.mjs:24`).
- The only purchase path for the bag the operator just took over is lost after one click. Safety is intact (the port is observe-only, `browser-session.mjs:47`), but the outcome contradicts the claim. The C086 restart tests only use a different context (`FAKE-restarted`).

**Reproduction (worked out from the code; not executed, because I may not add tests)**
1. In the c084 FAKE world, complete a transfer to AUTH or REVIEW using api `A`.
2. Call `runDesktopSession({store, api: A, tabId: 7, mode: 'reconcile'})`.
3. Expected on the current bytes:
   - the stored row has `reconcileOnly===true`, with 0 merchant commands;
   - a later purchase with `A` rejects with `DesktopLegacyResultStillUnconfirmed…`;
   - `transferExistingCart` rejects.

**Acceptance conditions**
- (a) Recovery at `browser-session.mjs:28` also requires `typeof api.sessionId==='string'&&old.desktopContext!==api.sessionId`. A same-context reconcile of a row that is not reconcile-only then rejects with `DesktopReadonlyHandoffRequired` and zero writes.
- (b) `app.py` disables `reconcile_button` when the transfer is sent and on every result that is not read-only.
- (c) A new Node test covers a same-context reconcile after a transfer: it is rejected, the record is unchanged, and there are 0 merchant commands. A new Python test checks that the reconcile button is disabled after transfer plus result.
- (d) The existing tests with a different context still pass.

### N8 (Low): the bound-reference lookup does nothing end to end

- `browser-session.mjs:55-56` computes `boundOrderIndependentlyObserved`, but the worker never sends it (`purchase-worker.mjs:47`) and it is never saved.
- After a restart the new tab opens at BAG. `lookupOrder` only follows a receipt link that is on the current page (`chrome-port.js:125-131`), so the result is always `unknown`.
- The guard itself is correct: it needs `finalIntent.sent` plus a 64-character hex hash, and does not navigate unless an exact receipt is on the current page. It fails safe.
- **Acceptance:** either
  - add a direct fixture that reaches `unpaid/independent` from a bound receipt, and show that result to the GUI without bypassing the job's own reconciliation; or
  - explicitly document in the UI and docs that this lookup is not functional after a desktop restart and that a human must check the order.

  Do not add any reconstructed account or order address.

### N9 (Low): advance is re-enabled on a read-only record

- `app.py:313` sets `advance_button` to `normal` on any `blocked` event while the worker is busy, even for a read-only record. A double click during a reconcile is enough to trigger it.
- The purchase is still rejected with a readable message, but this contradicts N5's "readonly purchase controls disabled".
- **Acceptance:** track the read-only state from `ready`/`result` and keep advance disabled on `blocked`. Add a Python test: ready(read-only) → blocked → advance stays disabled.

### D1 (must be disclosed): pausing a transferred task ends programme buying for it

- Every worker restart is a new context.
- At the next Begin, `observe` reports `legacyReadOnly` (`checkout-runtime.mjs:25-26`), and the GUI automatically reconciles (`app.py:309-311`).
- The task therefore becomes permanently read-only, so R08 "resume" is not available. Neither Pause nor Begin warns the operator.
- This matches the sheet's stated design, but it needs a Chinese warning at transfer consent and at Pause.

### D2 (minor)

- If closing drains a transfer, `transfer()` then calls `advance` (`checkout-runtime.mjs:49`). That rejects with an "already running" style message, which is misleading at shutdown.
- The re-check in `execute` (`checkout-runtime.mjs:30`) keeps this safe.

## The C086 claims checked one by one (offline fake fixtures only)

| Claim | Result | Evidence |
|---|---|---|
| N2: read-only recovery after a new context | **Partial.** Recovery in a new context works: `browser-session.mjs:28-29`, `job.js:242`, and the 3 C086 restart tests pass. Purchase is rejected afterwards (`:34`). No replacement receipt is adopted (`chrome-port.js:117,125,131`; the `job.js:309` gate). **But "new" is not enforced (N7).** | |
| N2: only an already-bound hash may be looked up | AGREE that the guard is correct. The lookup is not functional end to end (N8). | `browser-session.mjs:55` |
| N3: any unexpired or missing slot window blocks a transfer | AGREE. The whole history is walked. A missing `expiresAt`, a pending `chooseSlot` deadline, a cycle, or more than 3000 nodes all block. The checkbox is at `app.py:160`. **Caveat:** this is the local 30-minute task window, not a proven Apple hold duration. Whether the old checkout stopped rests only on the operator's confirmation. | `cart-transfer.mjs:25`, matching test passes |
| N4: the transfer is tracked as active and close drains it | AGREE. `live()` is checked before the write. The pause-during-write and cancel-before-write tests pass. | `checkout-runtime.mjs:45-50`, `closeOnce`, `:30` |
| N5: readable errors, suffix check, controls disabled on stop/end, stop cleanup rejection caught | AGREE. | `purchase-worker.mjs:7-18,40`; `app.py:259-260,274-275,302-304` |
| N5: read-only purchase controls disabled | **Partial (N9).** | `app.py:307,320` OK; `:313` not |
| An emptied cart never triggers an Add, and the original task stays revoked | AGREE. | `job.js:463`, `job.js:210`; C084 tests pass |
| 20 transfer / 1435 Node / 12 Python tests pass | Reproduced (see the commands below). | |

## F8: why fixing the logical record does not fix crash recovery

- **The two kinds of recovery need different things.** The logical read-only recovery (the N2 path) only works if `open()` can take the physical lease, which is an exclusive `.owner` file (`task-store.mjs:10-11`, `checkout-runtime.mjs:15`). After a forced process death the stale marker blocks every later open, including the read-only one. So N2 recovery is unreachable in exactly the crash case. It only works after a graceful close.
- **The app's own Pause can cause the forced death.**
  - `interactive_child.py:74-81` waits 5 s and then kills the process tree.
  - A drain can take longer than that, because one step may wait up to 15 s (`maxWaitMs`, `browser-session.mjs:50`).
  - Per my earlier full read, cleanup then counts as confirmed, so the GUI says "已停止" while the lease is left behind. That is a truthfulness gap under R06.
- **Safe direction (Codex's choice to make):**
  - Use a lock that the operating system releases when the process dies, for example a file handle held open with exclusive sharing, or a mutex owned by the worker. Or let the parent issue a token and remove the marker only after the Job Object reports zero active processes and the token matches.
  - Never use PID checks or age-based heuristics.
  - Getting the lease back must never clear pending, `reconcileOnly` or slot-window facts. The rule against repeating actions stays.
  - Until then, the UI must say the lease was kept and needs manual handling, and recovery claims must be limited to graceful close.
- I do not claim crash recovery is fixed.

## Test gaps

No direct fixture covers:
- the worker's transfer messages (`purchase-worker.mjs:46`, including the post-login watch);
- a same-context reconcile after a transfer (N7);
- the reconcile button state after a transfer;
- the bound-reference lookup;
- restart reconciliation driven through the worker and GUI rather than the module.

## Commands run (separately, in order, foreground, no pipes or redirects)

| # | Command | Result |
|---|---|---|
| 1 | manifest check | `ok:true, files:233, sha256 0c90acc4…8160, mismatches:[]` |
| 2 | Python `desktop_c0*_test.py` | `Ran 12 tests … OK` |
| 3 | 11 targeted Node files | 60 pass, 0 fail; the 20 transfer tests (9 C084 + 11 C086) all pass |
| 4 | full Node suite, dot reporter | 1435 dots by my count (71×20+15); no failure markers; exit 0. This reporter prints no summary line. |
| 5 | `c060-native-restart.mjs` | 2/2 PASS; cleanup: 2 contexts closed, browser and server closed, `errors:[]` |
| 6 | `c040-native-order.mjs` | 8/8 PASS; network 56 allowed / 1 blocked (the planned 127.0.0.2 guard, aborted, 0 server hits); cleanup: 8 contexts closed, browser and server closed, `errors:[]` |
| 1 (repeated last) | manifest check | identical: `ok:true`, 233 files, same SHA, no mismatches |

- Commands 5 and 6 started headless Chrome only against owned `127.0.0.1` fixtures, and loaded Playwright from the Codex runtime folder under the home directory (F7). I did not read that folder.
- Both scripts wrote result files under `.local/`, which I did not read.

## Coverage of the 47 required files

- Items 1–7, 9–25 and 27–47 were read to the end earlier in this same review session, before the conversation context was compacted (summarised to free space).
- After compaction I read items 8 (the C086 manifest) and 26 (`page-program.js`) to the end. `page-program.js` was read in two adjacent chunks, lines 1–300 and 300–617, because of the per-read size limit; nothing was skipped.
- After compaction I also re-checked the key regions of `browser-session.mjs` (whole file), `checkout-runtime.mjs:20-54`, `app.py:250-324`, `chrome-port.js:112-135`, `purchase-worker.mjs:36-53`, the `rebind` lines in `job.js`, the R01–R10 rows of `requirements.md`, and the network-guard lines of `c040`.
- **Gap:** for the other files, my knowledge after compaction depends on the session summary plus those re-checks.
- **Not read:**
  - `.local/` files;
  - home or Playwright runtime files;
  - the untracked `docs/reviews/C-086-publication-verification.json`, which is not on the list;
  - `docs/plan.md`, which is not on the C-087 list and which I did not rely on.

## Real evidence vs simulation

- Every test and native script is an offline fake or an owned-localhost fixture.
- No Apple access, live transfer, slot, order or payment happened.
- I did not operate any GUI, browser or account myself.
- The export file is missing and the last bag observation was empty, so no real unpaid order exists. F7 (Playwright runtime path) and F8 remain declared limitations.

## R01–R10 (only what this change affects)

| Requirement | Status |
|---|---|
| R01 | Plan unchanged; the digest must match before a transfer. |
| R02 | Open requires the ledger and the lease. An F8 stale lease fails closed with a misleading stop message. |
| R03 | A transferred cart is never Added to or re-configured. |
| R04/R05 | Not changed. |
| R06 | N8 (result dropped, so it stays truthfully unknown); F8 stop message. |
| R07 | No repeat in any tested path; N7 fails closed. |
| R08 | N7, N9, D1 (no resume for a transferred task). |
| R09 | Fake only; at most one order holds in the fixtures. |
| R10 | Chinese messages are readable; N9 control-state mismatch; no warning at Pause. |

## Limits, errors and permission denials

- **Errors and permission denials:** none.
- **Read truncation:** none was left unresolved (`page-program.js` was read in two chunks).
- **Budget:** about USD 6.0 of 10 used at the last reading.
- **Turns and wall time:** I cannot measure the turn count or wall time from inside the session. Because of the compaction, the 96-turn / 1200-second caps may have been approached or exceeded; the dispatcher's metadata is authoritative.
- **Changed files:** none. I wrote nothing, published nothing and started no other agents.

## Checkpoint

The review is complete. To resume after Codex repairs:
1. Run command 1 on the new manifest.
2. Check the N7 conditions (a)–(d), N9, and the N8 fixture or disclosure.
3. Re-run commands 2–6.
4. Repeat command 1 last.
