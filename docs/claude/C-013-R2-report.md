# C-013-R2 delivery report (Claude, implementer)

Session `[original Claude session retained privately]`, model `claude-opus-5-5`, effort `xhigh`. This is an implementer report, not self-approval or final agreement. Codex owns independent acceptance. REAL_PURCHASING_READY remains **false**.

## Scope read

- **Read in full for this task:**
  - `docs/tasks/C-013-R2.md`
  - `docs/reviews/C-013-R1-independent-review.md`
  - `docs/reviews/C-013-R1-actual-verification.json`
  - the complete `review/c013-preflight-cancellation.test.ts`
  - current `web/checkout-connector/control.js`
- **Already in context from R1 in this same session, not re-read:**
  - `CLAUDE.md` (system-provided)
  - `docs/requirements.md` (unchanged baseline; the task allows reuse)
  - my R1 report
  - `owner.js`, `job.js` and the relevant existing tests: `review/c013-functional-findings.test.ts`, `test/checkout-c013-continuity.test.ts`, and the `control.js` source assertions in `test/checkout-chrome-port.test.ts`
- **`docs/reviews/C-013-R2-input-candidate-manifest.json`:** its content was not opened; it was verified with the approved command only.

## Root cause

The fault was in the order of steps. Pause and Stop only called `job?.pause()` / `job?.stop()`, and `job` exists only after every preparation await has completed:
- the Final handler's record read;
- lock acquisition;
- the owned record read and digest;
- the private session read.

A Pause or Stop arriving during any of those awaits found `job===null` and was lost. The older handler then resumed, created a job with its final or advance grant, and sent `submitOrder`.

## Repair (`web/checkout-connector/control.js` only)

**A per-page cancellation epoch.**
- `cancel(kind)` increments `epoch`.
- If a job already exists, it also calls `job.pause()` or `job.stop()`. Otherwise it shows `已暂停/已停止：本控制页进行中的准备已取消，未创建执行，未发出新动作；如需继续请重新明确操作`.

**Every purchase-relevant handler captures its epoch when clicked.** `ticket()` runs synchronously at click time, before any await, for:
- Start, Resume and Rebind, through the `run(…,{live=ticket()})` default;
- Final, which passes its own ticket into `run`;
- Validate;
- Retire.

**Each handler re-checks the epoch after its awaits:**
- **`run`:** checks at entry, at the start of the owned lock body (after lock acquisition), after the record read and digest, and after the private session read. That last check is the final statement before `job=new PurchaseJob(…)` and the synchronous start of `job.run`. No await separates them, so any later Pause or Stop is always handled by the job's existing pre-send checks.
- **Final:** checks after its record read, before building a grant.
- **Validate:** checks after its validation-record read, before creating the job. That read was moved out of the constructor argument; behaviour is otherwise unchanged.
- **Retire:** checks after its record read, before calling `retire()`.

**What a cancelled handler does.** It shows the cancellation status and returns:
- it creates no job;
- it uses or keeps no grant, because grants are still local to the handler (R1 design);
- it writes nothing.

Durable already-sent or unknown records are never touched by the control page.

**Exceptions.**
- A read or lock error after cancellation is caught by the existing R1 handling: `最终确认未完成`, `执行已停止…` or `执行未能安全开始…`.
- No unhandled rejection, no job, no action.

**Later actions.**
- A fresh explicit click after cancellation captures the new epoch and proceeds under the normal checks: approval, final review, record state, preflight digest and tab, lock ownership.
- Resume never carries a final grant, so it cannot revive a cancelled confirmation.

**Rebind** now returns its `run` promise so tests can await it. It is still read-only reconciliation.

**Unchanged:** purchase conditions, authorization rules, bound dates, slot selection, job and transport code, and backend assumptions.

## Changed files

| File | Change |
| --- | --- |
| `web/checkout-connector/control.js` | Cancellation epoch, Pause/Stop `cancel()`, epoch checks in run, Final, Validate and Retire, Rebind returns its promise, page-scoped Chinese status. |
| `test/checkout-c013-cancellation.test.ts` | New: 13 tests using the actual `control.js` and `PurchaseJob` with FAKE DOM, storage, locks and port. |
| `docs/claude/C-013-R2-report.md` | This report. |

No other file changed.

## Exceptions and stages covered by the new tests

- **Start with a prepared advance grant**, cancelled during lock acquisition, the owned record read or the session read, by both Pause and Stop (6 cases). Each leaves no action and an unchanged durable record, and a later Resume sends nothing. A positive control shows that an uncancelled Start uses the advance grant once.
- **Final**, stopped during lock acquisition: Resume sends nothing; a fresh explicit Final proceeds once; a repeated Final and Resume never resend the unknown final.
- **Exception after cancellation:** the record read, session read or lock request throws after release. The rejection is contained, there is no action, and the record is unchanged.
- **Rebind**, cancelled during lock acquisition or the record read: nothing is written. Positive control: an uncancelled Rebind marks `reconcileOnly`.
- **Validation**, cancelled during its record read: no validation job and no validation record. Positive control: an uncancelled run records `VALIDATION_STOPPED` at REVIEW.
- **Retirement**, cancelled during its record read: no state change. Positive control: retirement still works.
- **Pause after the job exists** (held at observe): the existing job pause blocks the send (state `PAUSED`, no pending, final not sent), and Resume sends nothing.

The independent criteria themselves cover Final's record read and session read under both Pause and Stop.

## Commands actually run (approved list only)

| Command | When | Result |
| --- | --- | --- |
| `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-013-R2-input-candidate-manifest.json` | before edits | `ok`, 122 files, `85d037f394b6455de8b15f45a60f085b95ad86794d9e2dd3311a9165e819e478`, no mismatches |
| `node --test review/c013-preflight-cancellation.test.ts` | before edits | 6 tests: 2 pass, 4 fail (the four reproduced Pause/Stop × record/session cases) |
| `node --test review/c013-preflight-cancellation.test.ts` | after the core repair | 6/6 pass |
| `node --test "test/*.test.ts" "review/*.test.ts"` | after the new tests | 393/393 pass |
| `node --test "test/*.test.ts" "review/*.test.ts"` | final bytes (after the status text was scoped to "本控制页") | **393 tests, 393 pass, 0 fail**, 0 skipped/cancelled/todo, about 5977 ms |
| `node --test review/c013-preflight-cancellation.test.ts` | final bytes | **6/6 pass**, about 77 ms |
| `node --test review/c013-functional-findings.test.ts` | final bytes | **8/8 pass**, about 76 ms |

393 = the 380-case input candidate + 13 new implementation tests.

## Unrun checks, caps and denials

- The manifest command was not rerun after edits; it is expected to fail against the changed bytes.
- Nothing else was run: no browser, extension installation, host grant, network, site observation or action, authentication, or dependency change.
- There were no permission denials and no quota, session-limit or 429 errors. About $1.3 of the $4 cap was used by the time of this report.

## Known limitations and evidence boundary

- **Cancellation is per control page.** The epoch is in memory. A Pause or Stop in a second control page cannot reach a job or preparation owned by another page; this is pre-existing. Web Locks still give one owner, and the new status text explicitly says "本控制页" so it does not claim to have stopped another page.
- **Prepare and Observe are read-only and are not cancelled.** A completed `prepared` preflight survives Pause or Stop. It grants nothing by itself: a later Start still needs a fresh explicit click with approval, the final-review checkbox and a matching digest and tab, and it creates a new grant id. Whether Pause should also discard preflight is a policy choice I did not make.
- **An action already in flight can still complete.** Once `act` has been called, it may complete remotely. Its pending or unknown record is preserved and reconciled, never repeated (existing job behaviour).
- **Pre-existing, out of scope:** a lock-request rejection in the Validate handler is still unhandled.
- **Evidence boundary:** all evidence is offline and FAKE. Standalone extension access and live Apple contracts remain unverified. No new order, payment, slot-hold or Duo authorization exists; the historical one-Pro authorization is consumed.

## Resumable state

The repair is complete: 6/6 and 8/8 independent criteria pass and the full suite passes at 393/393. Nothing is pending on my side. Next step: Codex's independent inspection, rerun and current-source agreement. Any returned defect resumes from `control.js` and `test/checkout-c013-cancellation.test.ts`.
