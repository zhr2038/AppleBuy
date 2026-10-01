# C-002-DOCS — Correct the delivery scope after independent acceptance

Owner: Claude Code. Reviewer: Codex. Resume the same C-002 session, `cc5b30a2-ea93-4a97-9c0b-f4ac8e78d684`.

Codex independently ran the real documented npm wrapper (`npm.cmd test` on PowerShell), with **86/86 passing, 0 skipped**, and all **27/27 CLI scenarios passed**. The independent 200 measured runs/policy benchmark also passed and reproduced your honest no-speed-advantage conclusion. Source correctness findings F1-F6 are resolved for the stated single-process offline milestone. No further source edits are authorized in this task.

Before publication, correct one material documentation overclaim in **README.md and docs/claude/C-002-report.md only**:

`runScenario` creates its default persisted ledger under the freshly generated run directory. The CLI scenarios are intentionally isolated, repeatable mock fixtures. Repeated separate CLI runs therefore do not reuse a purchase ledger. Codex reproduced two consecutive runs of `node src/cli.ts rehearse --scenario formal-submit-unknown --json`: both independently sent one MOCK submission and stopped in MANUAL_VERIFICATION. This is safe rehearsal, but it contradicts an unqualified claim that the current CLI blocks a new run for the same plan after unknown submission.

Clarify everywhere the guarantee is discussed:
- The engine's restart/new-run protections are verified **when callers reuse the same journal/ledger or shared state directory**, as the tests do.
- The current CLI creates independent isolated fake scenarios; it does **not** provide task-wide persisted ownership/ledger or an integrated resume command.
- Cross-run and cross-process integrated guarantees are unimplemented and mandatory in C-003 before real adaptation can be considered ready. No real order or payment capability exists.
- Do not say "only the purchase ledger blocks a second submit" as a current CLI guarantee.

Retain the working milestone, honest benchmark, current fake labels, and all limitations. Do not change product source, tests, examples, package scripts, management criteria/review files, or tools. No shell/network/agents/Git operations are allowed. Only Read/Glob/Grep and scoped README/report edits are available.

Also update the old sentence describing the reviewer crash harness: Codex now explicitly asserts `authorize()` before supplying a simulated outcome. This was a reviewer-owned adaptation; do not suggest you changed the tests.

End with a concise English report of exact corrected statements and any remaining inconsistency. Maximum 12 turns, 5 minutes wall time, USD 2 estimated budget; Opus 5.5, Extra. This is a delivery truthfulness correction, not a second failed source repair round.
