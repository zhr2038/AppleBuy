# C-110 delivery report: review of the C109 changes

**Verdict: bounded AGREE** for the exact 242-file candidate `c5a8f9058c3b530da440a25d22fe61f8f3c7f10643f9c826b8b1943902cdab66`. I found no blocking issues. The fixes for F1, F2 and F3, the browser and retention argument forwarding, and the control locking are correct in the files I read. All five ordered checks passed.

The C108 condition still applies: only the user may tick the session-retention box, with specific approval. Code cannot tell a human tick from an automated one, so that rule depends on people, and I cannot verify it.

This review does not authorise keeping login sessions, logging in, or making any purchase. It also does not cover the whole repository, the live site, default login, actual retention, an installed purchase, the unpaid Pro order, speed, POSIX, or the overall goal.

## The three fixes and related checks

- **F1 (where the session is saved, how to revoke it)** — `src/desktop/app.py:156`
  - The label now shows the folder: `ROOT\.local\desktop\browser-profiles` (`chrome` or `msedge` subfolder). This matches `ownProfile` at `browser-choice.mjs:17-20`.
  - It says unticking does not delete saved data. That is accurate: an unticked run uses a temporary context (`launch` + `newContext`).
  - It says to revoke, the person signs out themselves, then deletes the folder after closing the programme. Closing first is the right order, because a running saved-session context locks the folder.
  - Nothing deletes data automatically or looks up credentials.
- **F2 (consent reset after a confirmed end)** — `app.py:353-357`
  - `keep_session.set(False)` runs only inside `if self.checkout.terminal():`, which requires `done` and `cleanup_confirmed`.
  - If cleanup is not confirmed, every control stays locked. Nothing can switch retention on except the checkbox: it starts off (`app.py:154`) and `start.pyw` has no option for it.
- **F3 (old failure message cleared only after a confirmed new start)** — `app.py:249-250`
  - The message is cleared only after `checkout.open(...)` returns True.
  - This runs on the Tk thread, before the next `poll()`, so a failure from the new worker is still shown afterwards. Messages from the previous run are dropped by the generation check (`app.py:318`).
- **Forwarding and locking**
  - The screen choice `Edge` becomes `msedge`, and the retention tick is passed as a real Boolean (`app.py:249`). It becomes `--browser=X` plus an optional `--keep-session` (`interactive_child.py:95-96`), which `browserConfig` reads correctly.
  - The browser picker and checkbox are disabled after opening and re-enabled only after a confirmed end.
- **Tests**
  - Two new tests in `desktop_c107_test.py:13-20` would have failed on the C108 code, which matches Codex's record of 2 failures among 7 focused tests.
  - In `desktop_c078_test.py:23`, the shared fake window now includes `keep_session`. The existing end-of-run test needs it.
- **Existing safeguards kept**
  - Execution ownership, the read-only handoff, unknown and final-order handling, pause, and the consent checks are unchanged in the files I read.
  - Failure messages remain display-only and cannot re-enable buying while paused (tested).

## Findings (none blocking)

- **N1 – missing negative tests.** Found by reading `desktop_c107_test.py:13-20` and `desktop_c078_test.py:27` (the fake `terminal` always returns True). No test checks that:
  - consent stays set and controls stay locked when the run ends without confirmed cleanup;
  - the failure message is kept when `open` returns False or raises an error;
  - the screen choice `Edge` becomes `msedge` at the window level. It is only tested one layer down, in `CheckoutRunner`.

  The code is correct by inspection. **Acceptance:** optional regression tests.
- **N2 – the save path is written twice.** The label (`app.py:156`) and `ownProfile` (`browser-choice.mjs:17-20`) build the same path separately, and no test ties them together or checks the F1 wording. They match today. **Acceptance:** optional.
- **Carried over from C108:**
  - **F4:** a bad argument makes `purchase-worker.mjs:7` exit without a message. This is low risk, because `CheckoutRunner.open` only builds checked arguments.
  - **F5 (remainder):** unchanged since C108.

## Fingerprints compared with C107/C108

| Path | C107/C108 | C109 |
|---|---|---|
| `src/desktop/app.py` | `35a06c8e…` | `dfaac406…` |
| `test/desktop_c078_test.py` | `0f5db690…` | `a85263d0…` |
| `test/desktop_c107_test.py` | `114d2f45…` | `6fe5ce3c…` |

The other 19 paths in my recorded baseline are identical. These include `interactive_child.py`, `start.pyw`, all the Node checkout files, the runner files, and the owner-lock files.

**Limitation:** I compared only those 22 paths, not all 242. The git status at session start lists exactly these three files as modified, which supports Codex's "3 paths changed" claim. I did not see a line-by-line diff, so "old assertions untouched" in `desktop_c078_test.py` is supported by the content but not checked byte for byte.

## Command run

`python -B tools/delegation/run_review_checks.py docs/reviews/C-109-candidate-manifest.json`. One foreground Bash call, run after all reads, with no other commands.

| Step | Result |
|---|---|
| 1. Manifest | exit 0; `ok:true`, 242 files, `c5a8f905…`, no mismatches |
| 2. Focused Node tests | 58 / 58 passed; 0 failed, cancelled or skipped |
| 3. Python tests | Ran 31; exit 0 |
| 4. Full Node suite | 1461 / 1461 passed; 0 failed, cancelled or skipped |
| 5. Manifest again | exit 0; `ok:true`, 242 files, `c5a8f905…`, no mismatches |
| Final row | `complete:true`, `orderedChecks:5`, `passed:true` |

No step timed out and nothing was cut off.

The runner does not check three things, so I checked or noted them myself:
- **Manifest validity:** the runner ignores the manifest's own "ok" flag, so I checked rows 1 and 5 myself.
- **Cleanup flag:** it is always written as true. A failed cleanup would raise an error before the row is printed.
- **Skipped/todo counts:** Node "todo" counts and Python skip counts are not read, so I cannot confirm they are zero.

The earlier unexplained single failure in the full Node suite is still on record; I make no assumption about its cause.

## Requirements R01–R10

| Req | Effect of this change |
|---|---|
| R01 | No change; the plan and its conditions are untouched (`browser-session.mjs` unchanged) |
| R02 | Login is still done by the person; retention needs an explicit tick and is explained by F1 |
| R03, R04, R05 | No change to the buying engine |
| R06 | F3 separates current failures from stale ones; messages are display-only and say the cause still needs checking |
| R07 | One worker only (a second open is refused); controls locked; reset only after a confirmed end |
| R08 | Pause and takeover unchanged; failure messages cannot re-enable buying |
| R09 | Every test uses fakes; retention consent applies to one run and is reset afterwards |
| R10 | Saved-session location, revocation steps and failure messages are shown in Chinese |

## Real evidence vs. simulation

Every check here was offline: fake window, fake browser objects and local processes. No browser was opened and there was no network access, retained profile, login, cookies, `.local` access, profile or ledger reads, real purchase, or slot. The HTTP 541 observation comes from Root's live session (still the old C107 Edge) and is not evidence that these fixes work. Nothing here shows that the defaults or retention solve the 541 error or reach the unpaid Pro order.

## Disclosures

- **Denials, errors, limits:** none. No permission denials, tool errors, timeouts, or budget or turn limits hit.
- **Tool use:** 19 required files read to the end, 1 Bash call, no Glob, Edit, Write or memory writes, no other agents. `docs/plan.md` is not on the C-110 required-read list and I did not read it.
  - The resumed context also re-showed, from summary restoration, earlier reads of the C-110 sheet, `.gitignore`, and the two runner files; I re-read the runner files fresh.
  - The structured tool counts Codex records are authoritative.
- **Model:** the environment reports `claude-opus-5-5`. I cannot check `xhigh` effort or the first-party provider myself; Codex must check them from `modelUsage`.
- **Usage:** the harness showed about USD 1.26 of 10 used after the command. This may include resumed history and is not the cost of this round.

## Checkpoint

C-110 review is complete. My output is this text only; I wrote no files.

Next steps (outside this task):
- Codex records the verification JSON.
- The specific retention consent remains pending and only the person can tick it.
- The live GUI is still the old C107 temporary Edge session.
- N1 and N2 are optional follow-ups.
