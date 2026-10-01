# C-003: actual quota stop and Codex takeover

This is a Codex-authored report, not a Claude delivery report or Claude approval. The user explicitly authorized Codex implementation after actual Claude quota exhaustion and requires later Claude review and mutual agreement.

## Dispatch receipt

Actual C-003 invocation used CLI 2.1.286, `claude-opus-5-5`, `--effort xhigh`, project `E:\Apple Store`, scoped implementation tools and no other agents. Session `11941a88-4609-4e7f-a2f8-78c5b5837285` ran from 2026-10-01 08:37:22 UTC to 08:57:27 UTC (1204.27 seconds). It ended with exit code 1 and `is_error: true`, reporting a session limit resetting at 20:20 Asia/Shanghai. The primary implementation messages used Opus 5.5; the terminal quota message was synthetic, and the dispatcher's successful-delivery/model-verification gate correctly remains false. This is not a successful completion receipt.

Two attempted compound shell commands were denied (repository/layout inspection and a benchmark followed by `echo`). Permissions were not broadened or bypassed. There is no Claude completion report for this invocation. Its partial code was preserved. Before takeover, Codex saved a private hash inventory of the actual source/test/web handoff under ignored `.local/reviewer/`.

## Claude's partial implementation

Claude chose the existing zero-dependency Node architecture: the shared Engine/runEngine core, a task store and task-wide ledger, kernel-held local IPC ownership, persistent invented mock-site state, a loopback-only HTTP/SSE service, local browser assets, Chinese controls, in-process tests and actual child-process crash/contention tests. `src/app/**`, `src/mock/live-site.ts`, `web/**`, application CLI, runner hooks and render timing came from this actual Claude invocation. These are invented offline contracts, not Apple contracts.

## Independently reproduced defects repaired during takeover

| Finding | Actual reproduction | Codex change |
| --- | --- | --- |
| Old loop survives clean close | Hold the second choose reply, await close; `running` remained true | Quiesce the runner before releasing ownership; pause durably, detach replies, reject closed-instance actions, clear owned mock/refresh timers |
| Missing ledger loses purchase history | Complete one unknown final submit, remove ledger, start accepted | Initialize ledger with task identity; missing ledger is unsafe, never silently recreated |
| Empty ledger loses purchase history | Same flow, replace ledger with `[]`, start accepted | Cross-check task-wide entries against final `sent` records of every validated run |
| Missing journal treated as never-started | Finish a run, remove its journal, start accepted | A recorded run without a verifiable journal blocks new mutations |
| Physical directory alias gets another lock | Open a Windows junction to the same task; both acquired ownership | Canonicalize physical directory for storage and lock address; case folding only on Windows |
| Restart fabricates zero historical counters | Finish refusal/acceptance, reopen; accepted slot disappeared and refusal count became zero | Reuse primary-fact replay for read-only historical display, retain durable timestamps, invalidate candidate references and label history |
| Editor plan relabels bound run target | Edit color after a run; status target used the new editor revision | Render the run's bound plan, separately from the future editor plan |
| Mid-run corruption bypasses startup checks | Corrupt ledger after choose preparation; two choices still reached the mock port | Validate task/ledger/journal evidence before every mutation; abort without sending or rewriting corrupt evidence and display the interruption |

The eight reproductions are retained in `review/app-handoff.test.ts`. Assertions were observed failing before the corresponding repair. The independent Windows multi-process lock test is in `review/app-ownership.test.ts` and `review/fixtures/owner-child.ts`; a status timeout never releases a live owner's lock.

Further Codex adjustments: browser client IDs are fresh per document, avoiding inherited sessionStorage IDs in duplicated tabs; no browser storage is required and durable purchase identity stays in the server task. Benchmark metadata now says the program did not query power settings, rather than claiming a permission failure; Codex separately read the current High Performance power scheme. Package/README identify a runnable offline candidate and pending Claude review.

Codex modified product paths after quota: `src/runner.ts`, `src/app/task-app.ts`, `src/app/task-store.ts`, `src/app/owner-lock.ts`, `src/app/view.ts`, `src/mock/live-site.ts`, `src/bench.ts`, `web/app.js`, `web/render.js`, `package.json`, and README. Original independent C-002 tests were preserved. New independent tests and management reports are Codex-owned. A pre-handoff hash inventory is private; do not ask Claude to read private logs or credentials to review these changes.

## Current scope and recovery

The original M1 acceptance remains valid. C-003 is a tested candidate, **PENDING_CLAUDE_CROSS_REVIEW**; Codex implemented repairs, so its own regression checks cannot replace the required independent Claude review. Do not mark final acceptance or mutual agreement before an actual successful Claude review of the current source manifest.

Resume with `docs/tasks/C-003-REVIEW.md`, using the exact recorded session, English, Opus 5.5 / Extra and read-only review tools. A thread heartbeat `applebuy-claude` is active for 20:25 Asia/Shanghai, after the reported reset. Automatic scheduling is not evidence that review has run. If Claude identifies an issue, reproduce it, repair within development scope, rerun affected and required checks, and obtain another actual review. No real purchase authorization exists.
