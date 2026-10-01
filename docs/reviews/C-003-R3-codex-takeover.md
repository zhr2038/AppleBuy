# C-003-R3 — actual quota interruption, Codex completion and pending agreement

Recorded 2026-10-01, Asia/Shanghai. **TESTED_OFFLINE_CANDIDATE / PENDING_ACTUAL_CLAUDE_CROSS_REVIEW**. C-004 has prior bounded read-only agreement; C-003 has no final agreement. Overall automatic real Duo purchase remains unavailable.

## Actual invocation and authorship

Codex independently reproduced R2-1/R2-2 before changing product code: four protected cases failed, zero passed. Older and latest journal directory substitutions caused actual `EISDIR` on state/start/recover/arm; reopening threw, and future-plan editing falsely claimed a final submit. The original journals were kept beside the replacement directories. No additional fake site operation occurred and task/ledger/original-journal bytes were preserved.

C-003-R3 was actually dispatched in English to the original session `11941a88-4609-4e7f-a2f8-78c5b5837285`, `E:\Apple Store`, requested `claude-opus-5-5` and Extra (`xhigh`), implementation-only permissions. It ran **21:43:12–21:48:51**, **338.23 seconds**, **20 actual turns**, then returned **exit 1**, `is_error:true`, and the exact quota response: "You've hit your session limit · resets 1:20am (Asia/Shanghai)". No permission denial occurred. This means the next reported reset is **2026-10-02 01:20 Asia/Shanghai**, not a successful delivery or review opinion.

Stream evidence includes actual Opus 5.5 tool calls and one product edit, **`src/journal.ts`**. The final synthetic quota message makes the whole-call model/success gate false. No different implementation model is accepted. No test command or designated delivery report was returned by Claude in this call. Its partial journal repair was preserved and independently inspected; Codex did not relabel the quota result as success.

The user's direct authorization permits Codex takeover on actual quota exhaustion, followed by actual Claude review. Codex completed **`src/app/task-app.ts`**, **`src/app/task-store.ts`**, **`src/app/owner-lock.ts`** and added **`test/journal-io-boundaries.test.ts`**. These new Codex product changes have runtime verification but **await independent Claude cross-review**. The protected reviewer tests existed before takeover and all 16 protected files retain their saved hashes. Codex's examination of its own new implementation is not an independent author review.

## Repair and evidence contract

- Claude's `readJournal` repair performs one read, maps `ENOENT` to missing and other read exceptions to unreadable, and does not trust partial data or retry. Only bounded error codes survive; OS messages carrying local paths are omitted. Chain/schema/plan-binding validation remains intact.
- Codex names unreadable older/latest journal artifacts accurately, renders a normal blocked state, and catches unexpected evidence-check errors as unknown evidence rather than trusted empty history. Each action checks fresh evidence; `state()` only shares its current synchronous result and never caches it across calls.
- Start/recover/arm and send-time checks retain their conservative gates. The new send-time filesystem-error test proves choose/advance/submit mutation calls all remain zero and the prepared journal bytes remain unchanged.
- Unexpected task-load or latest-run initialization failures close the owned mock site and release the acquired OS lock before returning a Chinese refusal. Acquisition-time owner-history writes also release their own server on failure. A failed clean-exit metadata write still releases the OS lock and reports the write failure; it never invents a clean durable record.
- Saving a future plan accurately distinguishes unsafe evidence from an observed final-submit record. Editing does not remove restrictions, consume an authorization or rebind an existing run.

No automatic history clearance, retry, new identity, ledger manufacture or permission change was added. Preserve the entire task directory when evidence is inconsistent. The safe investigation path requires a human to inspect artifacts and independently verify authoritative order state; no reviewed clearance action exists. Partial backup restores are detected when independent artifacts remain. Complete rollback/deletion of every artifact is not detectable; no server exactly-once guarantee is claimed.

## Actual verification

| Check | Actual result |
| --- | --- |
| Protected new I/O/wording cases | **4/4 pass**, previously **0/4**; original reviewer files unchanged |
| Added implementation boundary cases | **6/6 pass**: send-time I/O, unexpected load/replay, unexpected evidence reader, acquisition-history write, clean-exit write |
| Full `node --test "test/*.test.ts" "review/*.test.ts"` | **154 pass**, 0 fail/skip/cancel, **5,712.7602 ms**, executed 22:01:35–22:01:41 |
| `node src/cli.ts rehearse --all --quiet` | **27/27 expected**, unexpected 0, non-local network accesses **0** |
| Actual updated-code browser flow | New fake run `run-iascbnhzze`: seq 13/generation 1 first choice explicitly refused; seq 14/generation 2 selected a different allowed slot; accepted and continued to pre-payment endpoint. Refusal 1, refresh 1, sent mutations 3, final submit **0**, fake orders **0** |
| Manifest utility | **56 files**, exact SHA below, no mismatch. Four malformed/traversal key fixtures rejected before reading source; resolved physical scope was code-inspected, not a new real-junction experiment |

The owned previous preview exited with code 1, and its durable owner record remained unclean. The actual new CLI reported `previous:"crashed"`. The prior run had already reached a terminal endpoint; its history was preserved, displayed as a historical snapshot, and not reused as actionable candidates. The new run obtained fresh observations. This is **not** reported as a graceful shutdown. Dedicated normal-close/quiesce tests remain part of the passing suite. Current preview only listens on loopback and runs fake data.

The benchmark and 0/10/50-history measurements remain the explicitly scoped **R2** receipts, not newly executed R3 performance claims. Decision-core/runner/benchmark behavior is unchanged; no speed advantage or Apple timing is claimed. The history-read cost still grows with history and is paid at mutation boundaries. No `tsc` or non-Windows machine acceptance is claimed.

## Immutable source and recovery point

The **56-file** manifest is `C-003-R3-source-manifest.json`, SHA **`7987df81952a2a30249dc5d4daae9ead98ee2f6e15c4a28b6474018b7f07621c`**. Compared with the R2 53-file receipt, four existing source files changed and three source files were added. R2's manifest remains historical. Public-safe actual execution receipt: `C-003-R3-verification.json`; management scope result: `C-003-R3-management-scope.json`.

Public reports' Windows CRLF endings were normalized to LF without changing their content or any tested source. The staged whitespace check retains one harmless, explicitly accepted extra EOF blank in Codex's protected `review/fixtures/journal-io-open.ts`; source bytes and all 16 protection hashes remain unchanged. No other staged whitespace error is accepted.

M-1's management utility now rejects traversal/noncanonical keys and validates the physically resolved source scope. T-1's actual `git show 513e08e:src/app/task-store.ts` blob SHA matches C-004's `2727837354084863f8769824308c6f27a2add5aabe26c634b7f78a402bb97afb`. The clean/hash check was at 20:19, not a blanket later-dispatch claim.

Next: after the reported quota recovery, first check no Claude invocation is running, then actually dispatch **`docs/tasks/C-003-REVIEW-R3.md`** in the exact original session with English, Opus 5.5/Extra and read-only scoped tools. Inspect the actual model/success gate and opinion; quota errors, test passes, schedules or Codex own review cannot establish mutual agreement. Existing `applebuy-claude` follow-up is scheduled for **01:25 Asia/Shanghai**, quiet while unchanged, and pauses only after both bounded milestones agree. Do not repeat unchanged calls before reset.

User preferences are saved privately; no real plan values, account data or private runtime logs are published. Current official public Duo configuration remains prelaunch and cannot reach pickup. U02–U06, SKU/store binding, slot hold/acceptance/refusal/reconciliation and payment remain unverified. The Pro probe is historical generic evidence, not Duo verification or authorization. No real order, payment or specific pickup slot was selected.
