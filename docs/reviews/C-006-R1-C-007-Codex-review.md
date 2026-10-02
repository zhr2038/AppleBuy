# Codex quota takeover: C-006-R1 / C-007 candidate

This is a runnable, tested offline candidate, **awaiting an actual independent Claude review**. Codex authored the quota-takeover changes and cannot independently approve its own implementation. Earlier bounded mutual agreement on C-005-R2 does not approve this candidate or real purchase readiness.

## Exact identity and attribution

Whole candidate: 83 public source/documentation/management files, SHA `6e1d83f904a1c1479d310c4c927a3e189ee2561393e7dc9e2d6cf171f40e13a7`. Runtime source scope: 77 files, SHA `01e61f991a41e08d6689a181c7db21b74978266434b5f099e033b0519806dc66`. The complete maps and check receipts are [candidate manifest](C-006-R1-C-007-candidate-manifest.json), [runtime manifest](C-006-R1-C-007-source-manifest.json) and [verification](C-006-R1-C-007-verification.json).

The actual combined Opus invocation exhausted session quota after 27 turns at 14:40, reporting an 18:10 Asia/Shanghai reset. Codex proceeded under the user's explicit quota exception. The private 69-file pre-takeover snapshot is retained. The [sanitized source delta](C-006-R1-C-007-Codex-delta.patch) contains exactly 20 files changed or added after that snapshot. Four pre-existing unchanged entry/example files are newly covered by the whole-candidate manifest; they are not attributed to Codex implementation.

| Files | Codex change |
| --- | --- |
| `src/launch.ts` | Strict sanitized observation boundary; complete synthetic-only date binding; durable terminal floors; page epochs; fresh-reference checks; pause and pending-result precedence; ownership replacement invalidates references. |
| `src/app/launch-session.ts` | Same TaskApp owner, durable marker/state/observation digests, restart and concurrent-writer checks, engine pending/ledger precedence; empty unobserved sessions may follow a future-plan edit, recorded sessions cannot silently rebind. |
| `src/app/server.ts` | Local replay assets and guarded observation routes under the existing token/origin/tab lease; successful replacement ownership invalidates recorded page references. |
| `src/launch-replay.ts`, `src/cli.ts` | Supported offline AST replay command, no real site port or external network actions. |
| `web/launch/observer.js`, `web/launch/samples.js` | Native-option visibility, native radio state/labels, inherited disabled state, selected pickup evidence, strict calendar/time parsing, configurable synthetic markup. These were unfinished Claude files at takeover. |
| `web/launch/replay-samples.js`, `web/launch/index.html`, `web/launch/replay.js`, `examples/plan.launch.fake.json` | Actual browser DOM exercise, stage samples, narrow untrusted observation import, unknown-result fixture, clearly fake four-date negative case. |
| `web/render.js`, `web/app.js`, `web/index.html`, `web/style.css` | Effective next-run capability warning beside both start paths; expiry/plan mismatch truth; idle expiry updates and stale-warning click guard; default to the example matching the saved plan; folded replay link and local styles. |
| `test/launch-boundary.test.ts`, `test/launch-session.test.ts`, `test/next-run-outcome.test.ts` | 24 added meaningful cases over the 201-test earlier C-006 candidate, including current DOM facts, terminal/date restrictions, corruption, ownership, unknown results and capability copy. The 20 protected reviewer files were unchanged. |
| `tools/delegation/verify_candidate_manifest.py`, `README.md` | Narrow read-only whole-candidate hashing utility and concise Chinese supported-run instructions. |

Management requirements/status/task/runbook/review files were separately updated by Codex. The existing dispatch-lease implementation was independently process-tested again and is included for Claude's separate management review; it was not modified during this takeover. Private DPAPI configuration and merchant receipts are outside the public source map and are not supplied to Claude.

## Actual checks

At 17:40, all check runs bracketed source hashing and confirmed the same exact 83-file identity before and after:

- 225 Node tests passed, zero failed/cancelled/skipped/todo; 20 protected reviewer files unchanged.
- All 29 purchase-engine CLI scenarios matched their contracts.
- File-plan terminal-removal vertical: first-day terminal refusal, second-day terminal refusal, third-day terminal acceptance and continuation to rehearsal endpoint, zero final submissions.
- Supported launch-replay CLI: 20 offline AST cases, unknown result preserved, zero external requests and zero real actions. AST is explicitly distinguished from browser/Apple evidence.
- Two actual process-level dispatch-lease tests passed. An initially wrong package-style unittest invocation failed to import the sibling helper; the correct direct script invocation passed. No product fix was inferred from that command error.

Codex actually operated the user's Chrome on the current local candidate: the three-date primary example reached the endpoint after two explicit refusals, with zero mock final submissions/orders. Nineteen DOM cases covered native selects, native date radios, changed roles/order, maintenance/partial/entry restoration, terminal omission, a fourth date, missing year, unselected pickup, wrong product, identity/consent, unknown structure, 429/403, 503 and transport failure. The fourth-date sample initially substituted the third date when the plan contained only three dates; Codex reproduced the wrong selected date, added a regression and repaired the fixture to actually offer an extra synthetic date. This does not authorize another date.

Actual browser replacement ownership changed epoch 21 to 22 and removed the old candidates while retaining terminal/date evidence. A second actual Chrome tab had disabled observation controls and its claim returned the explicit no-stealing message. Pause/resume required fresh observation and retained the omitted-terminal restriction. The synthetic unknown submission remained pending through maintenance, changed layout, native date-radio restoration and document reload; no site submission was sent by that fixture. Process restart preservation/corruption and real core-engine pending precedence were tested independently in Node, with an earlier actual clean local process restart additionally recorded under ignored reviewer evidence.

Browser state checks wait for a new observation sequence; an initial immediate snapshot read the previous SSE state and was not accepted as proof. The last source change after the 19-case browser run only chose the already-ready primary example by default; the current homepage was reloaded separately. It did not change the replay producer or decision files. Current screenshots and detailed local receipts remain ignored.

Codex also left the armed simulated-formal page idle for its actual 30-minute window. The primary warning changed to expired without a reload. Starting afterwards reached `BLOCKED formal-capability-expired`; fresh diagnostics for that run reported observe 3, choose 2, advance 1, submit 0 and simulated order records 0. The first immediate advanced snapshot still displayed the previous run and was discarded. This is local FAKE authorization/UI evidence, with unchanged core gating; it is not merchant payment-window or real-order evidence.

## Boundaries and recovery

This candidate has no unattended Apple mutation adapter. Only complete known synthetic observations can create offline recommendations; imported observations never establish execution authority or real date completeness. Missing year, conditions or list completeness fail closed. Marker/digest checks detect partial missing/rollback/inconsistent evidence; coherent replacement of every independent artifact is not guaranteed detectable. Existing engine ledger and journal protections remain intact.

The separately authorized real Pro pilot actually produced one unpaid order in Chrome. Its one-order authorization is consumed; no second real order may be created after expiry. No payment occurred. [Actual Pro result and timing](Pro-Chrome-unpaid-pilot-20261002.md) do not prove application speed, real refusal/reselection, a guaranteed slot hold, Duo compatibility or launch success.

Restore from the exact manifest and [C-007 cross-review task](../tasks/C-007-CROSS-REVIEW.md), using the original Claude session, Opus 5.5/xhigh, read-only profile and one dispatcher. Actual Claude review remains **PENDING**. Resolve reproducible findings and require both reviewers' scoped agreement before final acceptance.
