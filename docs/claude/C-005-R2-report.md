# C-005-R2 implementation report: safely recovering incomplete historical terminal evidence (F5-2)

Author: Claude (Opus 5.5), session `11941a88-…`, 2026-10-02. Offline repair only. No live site, no `.local` reads, no customer data, no real mutation. Codex owns acceptance.

## Problem

Under R1, replaying a last-slot journal without `terminal` facts rebuilt floors only from chosen intents. An observed but unchosen store/date group therefore lost its restriction, and a shorter new list could authorize an earlier sibling. Codex's protected `review/legacy-terminal-evidence.test.ts` showed this: 1 pass / 2 fail on the R1 bytes.

**Why a "list marker" is insufficient.** Codex's legacy simulation drops `terminal` records but copies `list` records unchanged. A flag on the list record would survive that and wrongly certify the history as complete. Completeness must be proven by a count that the missing records cannot satisfy.

## Design: every list's terminal facts are committed with an exact count

**Writing** (`src/engine.ts` `#onList`, last-slot plans only):

- Before any decision on a recognized list, the engine journals one `terminal` record (`seq`, `slotKey`) for every store/date group in that list. In R1 it journaled only the groups whose floor rose.
- It then writes the `list` record with a new integer field `groups`, the number of groups. The `list` record is the commit.
- Plans without the selector write neither, so their records are byte-for-byte the old shape.

**Replaying** (`#replay`). The floor is proven complete only if every `list` record of a last-slot run satisfies one of these:

- it has `groups = N`, and exactly N `terminal` records with the same epoch and seq immediately precede it (N may be 0, with no batch);
- it lacks `groups` (original format), has `count = 0`, and has no preceding batch. A list without offers established nothing.

The proof fails in any of these cases:

- original-format lists that established offers;
- Codex's simulated legacy history, where `groups = N` but no terminal records are present;
- a crash inside a batch: the batch has no list record, or is followed by a different batch or epoch;
- any removed `terminal` record.

On failure, `#floorBlock = "last-slot-history-incomplete"`. Unreadable slot keys keep R1's `last-slot-evidence-unreadable`.

**Behaviour when blocked.** Missing history is treated as uncertainty, never as permission:

- **Reconciliation first.**
  - An unknown final submit is still looked up read-only first (`#onStart` order is unchanged), and a confirmed lookup is honoured.
  - An unknown choice is still reconciled from page evidence, and its accepted or rejected truth is recorded.
- **Then no new mutation.** `#onStart` (when no op is pending), `#decide` and `#prepare` take over with the bounded Chinese reason. The `#prepare` gate covers chooseSlot, advance and submitOrder: "本次运行的日志无法证明各门店/日期已出现过的最晚时段（旧版本日志或写入中断）：为避免回退到更早时段，已停止自动选择/继续；已发送操作仍只读核实，不重发，请人工核对".
  - Advance and submit are blocked too because the original C-005 engine had the F5-1 defect. A slot it accepted cannot be proven to satisfy the user's last-slot condition, so continuing automatically could complete an earlier-slot checkout.
- **Nothing is erased.** The run, its identity, history and ledger are preserved. No offers are inferred from the shorter new list or from the chosen group. A takeover restart restores as `restored-TAKEOVER` (a restart is not a resume). After resume, the block re-applies, because incompleteness is a permanent property of that run's history.

**New-history runs stay automatic.** Complete batches restore every group's floor across pause and restart. Same or later reoffers remain allowed within the existing suppression, attempt and freshness bounds. The three-date vertical path completes even with a restart after each refusal.

**Journal compatibility.**

- `src/journal.ts` allowlists one additional integer field, `groups`. Older journals still validate unchanged. The hash chain, redaction and other fields are unchanged.
- The record type `terminal` is the one already introduced in R1.

**Considered and rejected:** reconstructing a legacy list from a later list with an identical fingerprint. It is technically verifiable, but it adds surface for little benefit, and Codex asked not to infer missing offers.

## Changed files (relative to R1 bytes)

- `src/engine.ts`:
  - journals all group terminals per list, plus a `groups` commit count;
  - replay completeness check;
  - `#floorBlock` gate in start, decide, prepare and eligibility.
- `src/journal.ts`: `groups: "int"` allowlisted.
- `src/messages.ts`: Chinese reason `last-slot-history-incomplete`.
- `test/last-slot-history.test.ts` (new): 8 implementation tests.
- `docs/claude/C-005-R2-report.md` (this report).

R1 changes remain (`src/plan.ts`, `src/app/task-app.ts`, `src/mock/scenarios.ts`, `test/last-slot-floor.test.ts`). None of the 20 protected reviewer files, management criteria, `.claude/`, `.git/` or manifests were edited.

## Actual commands and results

| Command | Result |
|---|---|
| `node --test review/legacy-terminal-evidence.test.ts review/terminal-omission.test.ts review/last-slot-policy.test.ts review/loop-finalization.test.ts test/last-slot-floor.test.ts` | 34 / 34 pass (F5-2: 3 / 3) |
| `node --test test/last-slot-history.test.ts` | 8 / 8 pass |
| `node --test "test/*.test.ts" "review/*.test.ts"` | **198 / 198 pass**, 0 fail / cancelled / skipped / todo |
| `node src/cli.ts rehearse --all --quiet` | 29 scenarios, 29 as expected, 0 mismatches, non-local network access 0 |

The CLI writes its own run journals under the project's local run directory by design; I did not read them.

## Implementation tests added

1. **New history:** the three-date path, with a restart after every durable refusal, stays automatic and reaches the rehearsal endpoint.
2. **Partial crash:**
   - restoring after the first `terminal` record, or after all terminal records but before the list record, gives TAKEOVER with "incomplete" and zero dispatches, even when a later shorter list is offered;
   - restoring after the committed list record chooses normally.
3. **Persistence:** incompleteness survives a resume, a later complete batch and another restart. The evidence slice is not modified.
4. **Original format:**
   - no `terminal` records and no `groups`, with offers present, blocks;
   - an original-format none-signal list with no offers does not block.
5. **Legacy unknown choice reconciled as accepted:** the accepted truth is kept, there is no advance, and the outcome is TAKEOVER with "incomplete".
6. **Legacy unknown final submit:** the only command is a read-only lookup; the confirmed order is honoured (ORDER_CONFIRMED_MOCK); there is no resubmit; the ledger stays consumed.
7. **No selector:** no `terminal` records and no `groups` field.
8. **Chinese diagnostic:** the text is bounded.

## Limitations and residual findings

- **Legacy runs:** a last-slot run journaled by the original C-005 build or by R1 (whose lists lack `groups`) can never resume automatic slot choice. After reconciliation it stays in manual handling. The user can stop that run; any new run then starts with complete history. This is deliberate fail-closed behaviour.
- **Journal size:** each last-slot list now writes one record per store/date group. This is bounded by list size and refresh limits.
- **Checks not run:**
  - live site or browser (not authorized);
  - manual app UI walkthrough (C-006 scope);
  - the explicit `rehearse --scenario last-slot-omitted-terminals --plan examples/plan.last-slot.fake.json --json` form. It was not run again in R2. The same fake-plan file path is exercised by `test/last-slot-floor.test.ts`, and the scenario also passed under `rehearse --all`.
- **Permission denials:** none.
- **Budget:** the 900-second wall limit cannot be measured from inside the session.

## Checkpoint

The repair bytes are on disk, the full suite passes (198/198), and all CLI scenarios match (29/29). Next step, for Codex:

1. Inspect the diff.
2. Re-run the F5-2 red cases, the full suite and the CLI.
3. Establish the immutable current manifest for these bytes.
4. Seek bounded C-005 agreement.

C-006 has not been started.
