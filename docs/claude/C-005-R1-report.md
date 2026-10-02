# C-005-R1 implementation report: terminal omission (F5-1) and safe executor finalization (R3-a)

Author: Claude (Opus 5.5), session `11941a88-…`, 2026-10-02. Offline repair only. No live-site navigation, no mutations, no real purchase/payment/order/reservation. Codex owns acceptance; nothing here self-approves.

## Baseline reproduced before any edit

`node --test review/terminal-omission.test.ts review/loop-finalization.test.ts` → 12 tests, **3 pass / 9 fail** (8 F5-1 cases + R3-a). This matches Codex's reproduction. The R3-a failure was `idle()` rejecting with `TaskStateUnavailable`, thrown by the end-of-run `#refreshLastRun()` in the loop finalizer.

## F5-1 design: a durable per-store/date "terminal floor"

**Rule implemented** (Codex clarification). Within one run, for plans with `slotSelection: "last-offered-per-store-date"`:

- Each recognized list raises a per-(store, date) floor. The floor is the latest terminal offer, ordered by start then end, that any list of this run established for that group, whether or not the offer is selectable.
- An offer is eligible only when both of these hold:
  - it is the terminal offer of its group in the newest list (the existing rule);
  - it is not earlier than that group's floor.
- So omitting a terminal, or offering a shorter slot with the same start, can never authorize an earlier sibling.
- A reoffered same terminal or a later offer stays eligible, still subject to suppression, attempt caps and freshness.
- Store/date groups are independent.

**Where it is enforced:**

- `src/plan.ts`:
  - `preferredSlotOffers(plan, offers, floor?)` takes an optional floor.
  - New helpers: `slotGroup`, `laterSlot`, `terminalOffers`, `parseSlotKey`, `SlotEdge`.
  - Without the selector the function returns its input unchanged, so plans without the selector keep their old behaviour and plan hash. The plan schema and `planHash` are untouched.
- `src/engine.ts`, decision: `#eligibleSorted` applies the floor.
- `src/engine.ts`, send time: `authorize()` re-checks the floor for `chooseSlot` against the newest list immediately before sending, in addition to the existing ref, selectability and suppression checks. A list that arrives while an op is only prepared raises the floor. The prepared op is then cancelled as `superseded-by-newer-list` and the engine re-decides, so nothing earlier is ever sent.
- Unknown/sent ops are untouched: they stay pending/UNKNOWN and are reconciled. A newer list still cannot create a second mutation; the protected C005 case passes.

**Durability (restart):**

- Why a new record: list records carry no slot keys, so the floor could not be rebuilt from existing records.
- `#onList` now appends one primary journal record, `type: "terminal"`, with fields `seq` and `slotKey`. It is appended only when a group's floor actually rises, and before that list's `list`, `decision` and `intent` records.
- Fields are unchanged: the record reuses existing allowlisted fields (`seq`, `slotKey`), so the journal allowlist, validation and hash chain are unchanged.
- `#replay` rebuilds the floor from two sources:
  - `terminal` records;
  - `chooseSlot` `intent` records. A chosen offer was the terminal when it was prepared, which also covers journals written before this repair.
- Derived `refusal`/`decision` records are not needed. The protected case that slices at the REJECTED outcome passes.
- Pause/resume does not clear the floor; a restart rebuilds it.
- Plans without the selector write no `terminal` records.

**Fail closed:**

- If a replayed `terminal` record or `chooseSlot` intent slot key cannot be parsed (for example it was redacted or tampered with), `#floorUnreadable` is set. The engine then makes no automatic choice for that run: it takes over with the reason `last-slot-evidence-unreadable` ("最晚时段记录无法读取：为安全起见不自动选择时段，请人工检查").

**Diagnostics (Chinese):**

| Situation | Reason | Chinese text |
|---|---|---|
| Earlier offers exist and are within plan and caps, but the last-slot rule excludes them | `last-slot-restricted` (decision record reason; refresh/phase reason) | "按“每个门店/日期只选最晚时段”规则：该日最晚时段已被拒、不可选或从最新列表消失，不回退到更早时段（不等于无货），继续有限刷新" |
| Refresh limit reached in that state | `refresh-limit-last-slot-restricted` | "……不回退（不等于无货）" |

`confirmed-none` (an explicit none signal or all offers disabled), `no-eligible-slot` (nothing within the plan) and `query-failed` are unchanged and stay distinct. A `terminal` record and the restricted decision also have Chinese journal renderings in `formatRecord`.

**Actual-site alignment.** No slot length, end time, number of dates or date value is a constant. Grouping uses observed store/date. Ordering compares observed HH:MM start, then end. The historical Pro observation (native date/time controls, 15-minute choices) is not encoded as a contract, and Duo U02–U06 remain unverified (per the two probe documents). Fixtures stay explicitly FAKE.

## R3-a design (`src/app/task-app.ts`)

- **Send-time check.** If `doc()` fails, a bounded Chinese error is thrown: "已停止发送（本操作未发出）：任务文件 task.json 无法读取或解析；原文件已保留、不会覆盖，请人工检查". No raw path or exception text is included, and the op is never sent.
- **Loop `.catch`.** A new `loopFailureZh` function keeps the existing bounded "已停止发送…" diagnostics as they are, so existing tests are unchanged. It maps `TaskStateUnavailable` to the task.json message, and any other error to "执行器异常停止（<bounded errno code>）：未自动重发，请人工检查".
- **Finalizer.** `#loop = null` is set first. `#refreshLastRun()` and `#changed()` are each guarded. A failure sets a bounded task.json diagnostic and never rejects `idle()`/`close()`. The unreadable file is not rewritten.
- **`close()`.** The cleanup is wrapped in `try/finally`: site close, timer settlement and the OS lock release always run.

## Changed files

- `src/plan.ts`: floor-aware `preferredSlotOffers`; group/order/terminal/parse helpers.
- `src/engine.ts`: floor state, durable `terminal` record, decision and send-time enforcement, restricted diagnostics, replay rebuild, fail-closed on unreadable evidence.
- `src/messages.ts`: Chinese reasons and journal renderings.
- `src/app/task-app.ts`: R3-a send-time, catch, finalizer and close guards.
- `src/mock/scenarios.ts`: new scenario `last-slot-omitted-terminals`.
- `test/last-slot-floor.test.ts` (new): 7 implementation tests.
- `docs/claude/C-005-R1-report.md` (this report).

No reviewer test, management criterion, `.claude/`, `.git/` or `.local` content was edited or read.

## Commands and results

| Command | Result |
|---|---|
| `node --test review/terminal-omission.test.ts review/loop-finalization.test.ts` (before) | 12 tests: 3 pass / 9 fail (baseline) |
| `node --test review/terminal-omission.test.ts review/loop-finalization.test.ts review/last-slot-policy.test.ts` | 24 / 24 pass |
| `node --test test/last-slot-floor.test.ts` | 7 / 7 pass |
| `node --test "test/*.test.ts" "review/*.test.ts"` | **187 / 187 pass**, 0 fail / cancelled / skipped |
| `node src/cli.ts scenarios` | lists `last-slot-omitted-terminals` |
| `node src/cli.ts rehearse --scenario last-slot-omitted-terminals --plan examples/plan.last-slot.fake.json --json` | see below |

Detail of the rehearse run:

- `REHEARSAL_ENDPOINT` (`reached-mock-pre-payment`), with no mismatches.
- Dispatched, in order:
  1. chooseSlot 2099-01-01 17:30–18:00, refused and removed;
  2. chooseSlot 2099-01-02 17:00–17:30, refused and removed;
  3. chooseSlot 2099-01-03 16:30–17:00, accepted;
  4. advance.
- 0 submits, 0 orders. The earlier 10:00 siblings stayed in every list and were never chosen.
- The generic scenario test also checks 0 stale refs and at most 1 concurrent op.

Note: by its existing design, the approved rehearse command writes its run journal under the project's local run directory. I did not read it.

## R01–R10 mapping

Labels follow the existing test labels.

- **R01:** plan binding is unchanged (frozen and hash-bound; the selector is in the hash).
- **R04/R05:** refusal leads to the fresh list, then the next authorized terminal, with a send-time recheck.
- **R06:** "restricted" is kept distinct from confirmed-none, no-plan-match and query failure.
- **R07:** durable floor rebuild; fail closed on unreadable evidence; unknown ops are reconciled, never resent.
- **R08:** the floor survives pause/resume.
- **R09/R10:** bounded Chinese diagnostics; finalization and lock release are safe.
- **R02/R03:** not affected.

## Not run / limitations / residual findings

- Not run:
  - live site or browser (forbidden and unnecessary);
  - manual app UI check (UI clarification is the next task);
  - `rehearse --all`.
- There were no permission denials in this task.
- I read the required probe documents and my returned cross-review through targeted searches, not complete reads.
- **Residual 1:** each group's `terminal` record is a separate synchronous append. If the process dies between two of them (before that list's `list`/`decision`), only some groups of that list are recorded. Any group whose record was not appended loses this list's floor after restart; groups already recorded keep theirs. This is a narrow window and no decision had been made on that list.
- **Residual 2:** for runs journaled by the pre-repair build, the floor is rebuilt only from `chooseSlot` intents, so groups that were observed but never chosen are not restored.
- **Residual 3:** after `last-slot-evidence-unreadable`, resuming re-enters takeover for the rest of that run (fail closed; a human must decide).
- **Residual 4:** generic executor errors now show a bounded code rather than raw exception text. This is a display change.
- The 900-second wall-clock budget cannot be measured from inside the session and may have been exceeded. Turns and cost are within budget.

## Checkpoint

All edits are listed above, and the full regression is green (187/187). Next step, for Codex:

1. Inspect the diff.
2. Re-run the protected tests and the full regression plus scenarios.
3. Create a new immutable manifest for these repair bytes.
4. Request the bounded C-005 re-review.

I have not created or changed any manifest.
