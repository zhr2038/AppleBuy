# C-003-REVIEW — independent review after quota recovery

Status: prepared, not dispatched yet. Dependency: C-003 quota stop and Codex takeover. This task is **review only**. English communication, actual `claude-opus-5-5` with Extra (`xhigh`), same `E:\Apple Store` project. Do not implement, self-approve your earlier code, publish, alter criteria/tests or read private `.local` logs/configuration.

Read the complete project baseline, requirements, `docs/status.md`, `docs/reviews/C-003-codex-takeover.md`, `docs/reviews/C-003.md`, the source manifest and actual source/test changes. Your prior C-003 implementation stopped on a session limit; Codex then repaired the actual defects listed in the takeover report, under the user's explicit exception. You must now independently examine those repairs and their interactions with the code you wrote.

Review the actual kernel lock, physical directory identity, shutdown ordering and late replies; task-wide ledger cross-checks across restarts/plan edits/missing or corrupt state; pause/prepared/send/outcome/recovery boundaries; browser control lease, duplicated tab IDs and loopback origin/host checks; capability binding, expiry and unknown-final-submit read-only behavior; displayed bound target and historical truth. Check the preserved independent reviewer tests and implementation tests. Do not assume passing tests are sufficient; supply a runnable reproduction for any remaining issue.

Run only approved plain Node commands from the already configured project directory; do not prefix them with `cd`, combine shell commands, install packages or launch another implementer. Tests may only mutate their contained disposable fixture directories and terminate their own child handles. You may run `node --test "test/*.test.ts" "review/*.test.ts"` and `node src/cli.ts bench --runs 200 --warmup 20 --seed 1`. You may not modify files under this read-only profile.

Return an English evidence-based review with: reviewed source manifest, actual checks and outcomes, concrete findings with file locations/reproduction/acceptance conditions, missing coverage, and a clear agreement or disagreement with Codex's **offline-only candidate** assessment. Real SKU/checkout/slot mechanisms and user purchase configuration remain unverified; no real readiness agreement is possible from fake tests. Do not rubber-stamp or pretend quota failure is approval. If no material issue remains, explicitly state that the Codex takeover changes are acceptable for this bounded offline milestone, with unresolved real-adapter limitations retained.

Invocation after confirmed reset, only if no other Claude invocation is active:

```powershell
python tools/delegation/invoke_claude.py C-003-REVIEW --profile review --resume 11941a88-4609-4e7f-a2f8-78c5b5837285 --turns 45 --timeout 1200 --budget 6 --allow-command 'node --test *' --allow-command 'node src/cli.ts bench *'
```

Codex must inspect the structured success/model receipt, preserve your actual report, resolve findings and independently rerun checks before recording mutual agreement. No real order, payment, reservation, authentication bypass or Git publication is authorized for this review.
