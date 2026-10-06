# C-092 command replay on the unchanged C-090 candidate

## Result: COMPLIANT

I ran both allowed commands exactly as written in the task sheet: one at a time, in the foreground, in order, with command 1 repeated last. I added no `cd` prefix, `&&`, `;`, pipe, redirect, wrapper, retry or extra command. All three runs passed against candidate `307a6ec85eb391c8851898c12e89aa044eb9ed642ca2298c2f4cce60165dd308`.

This only closes the procedural gap from C-091, where my three commands carried a `cd "E:/Apple Store" &&` prefix and did not match the exact-command gate. C-091 was not compliant on that point. This round is not a new code review and does not approve anything live.

## Commands and their actual output

| # | Command, exactly as run | Output |
|---|---|---|
| 1 | `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-090-candidate-manifest.json` | `{"ok": true, "files": 233, "sha256": "307a6ec85eb391c8851898c12e89aa044eb9ed642ca2298c2f4cce60165dd308", "mismatches": []}` |
| 2 | `python -B -X utf8 -m unittest discover -s test -p "desktop_c0*_test.py"` | 16 dots, then `Ran 16 tests in 0.494s` and `OK` |
| 1 (repeated last) | `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-090-candidate-manifest.json` | identical to the first run |

- **How the commands ran:** the Bash tool passed each string unchanged to its built-in Git Bash shell. The working directory was already `E:\Apple Store`; I did not change it.
- **Cleanup:** command 2's worker test writes its own receipt under `.local/` (`interactive_child.py:20-22`). I did not read it. No browser, GUI or native fixture was launched.

## Files read to the end

- I read 2 of 2 required files, each in one complete read: `docs/tasks/C-092-VERIFY-COMMANDS.md` and `docs/reviews/C-090-candidate-manifest.json` (240 lines, 233 entries, top-level sha matching the verifier output).
- I read nothing else.

## Limitations still in force

These come from C-089 and C-091 and are unchanged:
- **N10a:** if the follow-on advance throws after the transfer write but before the job reports its first state, advance stays disabled. This fails closed.
- **F8:** after a forced stop, a stale task lock may remain and needs manual handling.
- **Restart:** a transferred task can only be checked read-only after a restart; buying cannot resume.
- **Final order:** it must be checked by hand after a restart. The bound-reference lookup is not used from a restarted bag.
- **Untested paths:** there is no direct fixture for the worker's transfer messages, and the live GUI is unverified.
- **Node suite:** the 1436 Node results are C088 historical checks and were not rerun here, as the sheet says.
- **Real order:** the original task export and the production ledger are missing, so the real unpaid Pro order is unverified and the goal stays blocked.

I make no whole-repository, live or real-order approval. Everything here was offline and fake: no Apple, Chrome, GUI, network, account, ledger or authentication access.

## Errors, denials and budget

- **Errors and denials:** none.
- **Tool calls:** 2 Read and 3 Bash; no edits, writes, Grep, agents or publishing.
- **Budget:** about USD 0.27 of 3 at the last reading, and about 6 of 12 turns.
- **Wall time:** I cannot measure it from inside the session; the dispatcher's record is authoritative. The sheet notes that `modelUsage` is a historical total, not this round's spend.
- **Files changed:** none.

## Checkpoint

The task is complete and nothing is pending.
