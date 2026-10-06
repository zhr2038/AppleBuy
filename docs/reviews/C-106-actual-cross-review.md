# C-106 cross-review: delivery report

**Verdict: AGREE, bounded.** This covers only the exact 239-file candidate (SHA `565cc5900d79207b63d036241219e21cc40d67245820f742991a561f6890300d`): the N1 and N2 repairs, the new ordered runner, and the unchanged owner, transfer and pause protections. I found no blocking defect. There are five low-severity runner/test items and one open determinism issue in the DOM test, all listed below. This is not acceptance and not a live, goal, speed, POSIX or whole-repo claim.

## What I ran and read

- **Reads:** all 24 required paths were read fresh to the end in this round.
  - 10 were read before a mid-task context compaction and 14 after.
  - I re-read the runner and `docs/requirements.md` after compaction. For `process_tree.py` and the manifest, my analysis relies on my notes from the earlier full read.
- **One Bash call, as required:** `python -B tools/delegation/run_review_checks.py docs/reviews/C-105-candidate-manifest.json`. I ran it once, alone, in the foreground, after all reads.
- **No other tool use:** no edits, file writes, memory writes, git commands, Grep, agents, network, GUI, Chrome or private reads.
- **Not read** (not on the list, so claims that depend on them are bounded): `verify_candidate_manifest.py`, `cart-transfer.mjs`, `auth-continuation.mjs`, `interactive_child.py`, `contained_child.py`, `job.js`, `chrome-port.js`.

**Command output: six rows, all passing.**

| Order | Check | Result |
|---|---|---|
| 1 | Manifest | ok, 239 files, `565cc590…300d`, no mismatches |
| 2 | Focused Node | 50/50, 0 fail / 0 cancelled / 0 skipped |
| 3 | Python | 24 tests, exit 0 |
| 4 | Full Node | 1453/1453, 0 fail / 0 cancelled / 0 skipped |
| 5 | Manifest | identical to order 1 |
| final | `complete` | true, `orderedChecks` 5, `passed` true |

Every row reports exit 0, no timeout, and cleanup confirmed.

- **Source unchanged:** I checked the manifest values myself, not just the exit codes. Rows 1 and 5 match each other and the sheet.
- **Not independently verified:** the claim that only five paths changed since C103 comes from Root's `changedPaths`. I did not diff against the C103 manifest, and I couldn't run git.

## N1: real two-holder interleaving — sound

The C103 test (`test/desktop-c093-owner-recovery.test.ts:39-61`) and the fixture (`test/desktop-c103-owner-fixture.py:11-49`) force every gate the sheet requires, in all 8 pairs:

1. Both holders miss the marker before either publishes (`:50`). The fixture blocks only on the first `r+b` `FileNotFoundError` for the exact owner path.
2. A publishes the full, fsynced header and then blocks inside the patched `os.link`, before its own cleanup runs (`:51`).
3. B gets `FileExistsError` (`publication-lost`) and then holds the real `msvcrt` byte lock while A is still blocked (`second-lock-held`).
4. Exactly one owner results (`:53`).
5. After both children close, the header is exact (`:58`) and no `.init` files remain (`:59`).

If a hook didn't fire, the next row would lack its `fixture` field and the assertion would fail, so the gates can't pass silently. Production `owner_lease.py:34-51` is the C103 hard-link logic I read.

On this E: drive, A deleting its temporary file while B holds an open handle succeeded. That is empirical evidence for this drive only.

Non-blocking observations:
- **N1-a:** the test asserts the owner count is 1 but not which holder won. Given the forced interleaving, B must be the owner. Asserting `right.owned===true && left.owned===false` would be stronger.
- **N1-b:** the fixture's `first` and `second` modes are not used by this test file. I did not search other files.
- **N1-c (theoretical, not observed):** the `finally` block sends `release` on the stdin of A, which may already have exited, and there is no stdin `error` listener. That is a possible EPIPE flake; production `owner-lease.mjs:7` does guard against this.

## N2: read-only pause guidance — sound

- The pause message now follows the acknowledgement (`src/desktop/app.py:317-322`):
  - read-only names 「核对导入的旧任务」, the reconcile button at `:151`, which is enabled at `:315`;
  - `canContinue` names 「继续本次 Pro 购买」, the purchase button at `:150`;
  - neither says the task cannot continue purchasing.
- `checkout-runtime.mjs:85` makes read-only and `canContinue` mutually exclusive.
- The new test (`test/desktop_c078_test.py:100-102`) is meaningful.
- **N2-a (low):** no test checks the message text for the `canContinue` case or the neither case.
- I did not reproduce Root's red baseline. Without a diff, my comparison of `app.py` is limited to the paused branch.

## Runner (`tools/delegation/run_review_checks.py`)

**What is sound:**
- There is no scope expansion: the command list is fixed (`:17-20`), there is no arbitrary input, and the manifest path must be under `docs/reviews/*candidate-manifest.json` (`:13-15`).
- Checks run strictly one after another: each uses `OwnedProcess.communicate`, which ends the job tree and raises if cleanup is unconfirmed.
- The exit code is nonzero when any check fails.

**Findings (low severity, fail-visible except where noted):**
- **R1:** `ownedTreeCleanupConfirmed: True` is a literal (`:26`). It is only truthful because unconfirmed cleanup raises, and that path produces a traceback with no structured row and no final row. It also doesn't report whether leftover descendants had to be force-killed after an exit 0, so a test that leaks processes would still pass.
  - *Acceptance:* catch the cleanup error and emit a row with `cleanup=false` and `passed=false`, stop, and return nonzero. Optionally report forced terminations.
- **R2:** the manifest rows pass on exit 0 plus a successful JSON parse (`:27-29`). They don't check `ok`, empty `mismatches`, the expected SHA, or that row 1 equals row 5. This relies on the unread verifier's exit code. I checked those values by hand for this run.
- **R3:** counts are parsed but not enforced (`:31-36`). Nonzero `skipped` or `todo`, or Python skips, would pass silently. This is the one real gap where a problem could be hidden. This run had 0 skipped.
- **R4 (informational):** a fixed 120 s timeout per check, which fails closed, and no duration field is reported.

## Prior protections — still hold (unchanged files, read fresh)

- **Owner loss:**
  - `checkout-runtime.mjs:19` handles a lost lease. Guards at `:34`, `:46`, `:56`, `:78`/`:82` and `:88` block further work.
  - `guardOwnedApi` in `owner-lease.mjs:36-43` checks the lease before each browser call, and `task-store.mjs:10` requires an owned lease to write.
  - The worker reports `owner-lost` and exits (`purchase-worker.mjs:24`).
- **Transfer:** `checkout-runtime.mjs:55-63`.
- **Pause:** the pause path drains operations before acknowledging (`:77-86`); resume is `:87-91`.
- **Purchasing conditions and finality:** `browser-session.mjs:32-46`, with the plan cap of ¥9,999 at `:7`.
- **Pending and unknown results preserved:** `desktop-c078-runtime.test.ts:46-50, 56-62, 74-89`.
- **Legacy markers never rewritten:** `owner_lease.py:76-78`.

Nothing I read weakens purchasing conditions, source revocation, pending/finality or unknown-result rules.

## DOM bridge port issue — not fixed

- The demo listens on port `o.port??0` and builds its URL from the port the OS assigns (`dom-bridge.ts:136-138`). The protected test then fetches that URL (`dom-bridge.test.ts:61-63`).
- To my knowledge, Node's fetch raises `bad port` only from its blocked-port check, so the C104 URL almost certainly had a blocked port.
- Every Fetch blocked port is at or below 10080, which Windows' default dynamic range (49152–65535) cannot assign. The inference therefore implies a non-default dynamic port range on this machine. That is unverified: I could not run `netsh`.
- **Impact:** this is not a blocker for this source review, because it is a fake loopback demo outside the purchase path. It is a blocker for any claim that the full suite is deterministic on this machine.
- *Acceptance:* capture the port in the failure message, check the dynamic port range read-only, then let Root decide on a fix to the protected test.

## R01–R10 mapping (this scope only)

- **R07/A08:** N1 single owner under simultaneous first start; owner-loss guards.
- **R08/A09:** pause drain; N2 read-only guidance; owner loss while paused.
- **R06/R07/A07:** pending and unknown results kept when the holder is lost; read-only reconcile.
- **R10:** Chinese guidance text.
- **R09/A11:** all checks used fake data; no real actions.
- **R01/A06/A12:** plan and final-consent gates unchanged.
- **Not covered:** R02–R05 and A14 speed.

## Real evidence vs simulation

Everything here is local and fake. The tests used real OS processes, locks and files under `.local/test-runs`, plus loopback HTTP. There was no Apple, Chrome, authentication or customer state, and raw customer state was never read. None of this verifies the human login, the empty-bag main chain, the installed whole chain, a real unpaid Pro order, speed or POSIX. The native session is still the old C097 paused one, and the goal tool is still blocked.

## Denials, errors and usage

- 0 permission denials, 0 tool errors, no caps or timeouts hit.
- The context was compacted once mid-task, as noted above.
- Cost reported by the harness: about $2.12 of $10. This is the resumed-history aggregate, not this round's spending. I did not measure turns or seconds; Root's trace is authoritative.

## Checkpoint

C-106 is complete: 24 of 24 reads, one Bash call with six passing rows, and this report. Nothing was written. Open items for Root, none blocking: R1–R4, N1-a/b/c, N2-a, and the DOM port-range check.
