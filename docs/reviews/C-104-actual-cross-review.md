Root note: historical conditional appraisal only; actual Bash overlap and full-suite failure prevent acceptance. Current bytes differ under C105.

I'm giving a **bounded AGREE**: the C103 source repairs for F1–F5 hold up in the 29 required files, and I found nothing that breaks the one-owner, write-ahead, pause or consent rules. This is not acceptance, for three reasons:
- **Command run is invalid.** I sent commands 3, 4 and the final 1 together in one batch. The sheet required separate sequential calls, and I can't prove they ran in order or that the final command 1 ran last.
- **Command 4 exited 1** with one failing test, so Root's "1453 Node pass" is not reproduced by this run.
- **Two new Low findings**, N1 and N2, need Root to reproduce them.

## Repair appraisal

| Finding | My conclusion | Basis |
|---|---|---|
| **F1** marker header | Repaired in logic; the test is weaker than claimed (N1) | `owner_lease.py:34-51` writes and fsyncs a temporary `.init` file, then `os.link`s it to the marker. If the marker already exists the start reuses it. The marker is never written or unlinked. Legacy and empty markers are rejected unchanged (`:76-78`, the C093 tests pass). Any other link error fails closed. |
| **F2** production write path | Repaired | The C103 test uses a real `DesktopTaskStore` and holder. The holder is killed while checkout is blocked, after its write-ahead is on disk. The post-action write is rejected by the ownership check at `task-store.mjs:10`. Exactly one close, zero `selectPickup`, and the next owner reads the same pending action. The test's `acquireOwner` override only skips `mkdir`. |
| **F3** owner loss | Repaired | `checkout-runtime.mjs:19` sets `ownerLost`, clears consent, aborts, emits one fixed state and closes after draining. All entry points refuse after loss. `purchase-worker.mjs:24` stops the login watch, closes input and exits after cleanup. `app.py:304-308` disables controls and drops everything except `worker-ended`. No end-to-end worker test exists, because the worker needs Playwright. |
| **F4** drainage and GUI | Repaired; GUI text issue (N2) | `track()` (`checkout-runtime.mjs:12`) covers the whole chain: advance returns execute, and transfer returns advance. `prepareReview` runs inside execute. Operations started after a pause refuse immediately. Readonly detection in pause (`:84`) now matches `observe` (`:28`). Failed pause and rejected resume are now shown (`app.py:319-324`). |
| **F5/O2** journal writes | Repaired | `ensure_ascii=True` is serialized before the temporary file exists (`:23`). Cleanup touches only the holder's own uuid-named temporary file (`:31-32`). On-disk text becomes `\u` escapes, which parse to the same JSON. |

Other areas the sheet asked about:
- **Consent:** cleared at every execute start, pause, close and owner loss; submit refuses while paused or closing.
- **Login-watch epoch:** blocks stale resumes, and the busy check includes paused.
- **IPC lifetime:** the worker ignores input lines once closing.
- **Watch reads during pause:** they aren't drained by pause or close, but they only read, and their progress output is suppressed while paused.

## New findings

**N1 (Low, test evidence): the "eight Windows contention pairs" are sequential on the repaired code.**
- **Cause:** the fixture hook (`test/desktop-c103-owner-fixture.py:12`) fires only when the marker is opened with `x+b`. The repaired holder never does that (`:36`/`:51` use `r+b`; `:40` opens the `.init` file).
- **Effect:** A reports ownership before B is launched (test lines 50-53). B's hook never prints, and the interleaving branch at line 51 never runs. The new race path is never exercised deterministically: both starts miss the marker, one link wins, the other gets "already exists", then both race for the lock.
- **Inference I haven't verified:** the winner's `.init` unlink (`:50`) could hit a Windows sharing violation if the loser already has the marker open. The winner would then fail closed and leave a stray hard link; one owner would still result.
- **Acceptance:** a fixture that pauses at those points and fails if the interleaving didn't happen. It should assert exactly one owner and an exact header, and record whether a leftover `.init` file remains.

**N2 (Low, GUI truth): the pause message tells the user to click a disabled button.**
- **Cause:** `app.py:317` always says 「点"继续本次 Pro 购买"先核对原结果」.
- **Effect:** for a readonly pause (the imported-task path the user is actually on), Continue is disabled and only 核对导入的旧任务 is enabled (`:314-315`). The same mismatch occurs for `CONFIRMED_UNPAID`, and for a pause before the first write.
- **Reproduce:** with `fake_app()`, send `{'type':'paused','readOnly':True,'canContinue':False}`.
- **Acceptance:** derive the message from the acknowledgement, and add a test.

**Non-blocking:**
- The "Pause re-enabled after resume" GUI test can't tell the difference, because the pause acknowledgement already re-enables Pause (`:316`).
- After a worker crash while paused, the status still says the window is kept.
- C098 observations O1, O3–O7 and O10 remain; O8 is partly addressed and O11 is addressed.

## Commands, EOF and immutability
- **Reads:** all 29 required paths read fresh to EOF (`job.js` in two chunks) before any command.
- **Extra access:** one Grep of `test/dom-bridge.test.ts` and a partial re-read of `requirements.md`, both only to classify the failure and map requirements.

| # | Command | Result |
|---|---|---|
| 1 | manifest check (first) | exit 0: 238 files, `ad802939…ef83`, no mismatches |
| 2 | focused Node | exit 0: 50 tests, 50 pass |
| 3 | Python | OK: 23 tests |
| 4 | full Node | **exit 1**: by counting the dot output, 1453 tests with 1 failure, "DOM bridge rejects foreign origins…" at `dom-bridge.test.ts:63` (`fetch failed`, `bad port`) |
| 1 | manifest check (last) | exit 0: identical result |

- **Calls 1 and 2** each ran alone, in that order.
- **Calls 3–5** were the batched calls; their order is unproven.
- **The command 4 failure** is in a file outside the nine changed paths. My guess, unverified, is that the operating system assigned a loopback port that `fetch` blocks.
- **Source immutability:** hashes matched before testing. I made no edits or writes. "Unchanged after tests" is only as strong as the uncertain ordering above.

## Mapping and evidence boundary
- **Requirements:**
  - **R07 / A08:** F1, F2 and F4.
  - **R08 / A09:** F3 and F4.
  - **R06 / A07:** unknown pending action is preserved and a new owner reads it.
  - **R09:** everything here is fake; nothing real was attempted.
  - **R10:** the Chinese GUI messages, including N2.
  - **R01–R05:** unchanged in this delta.
- **Real:** Windows byte locks, Python and Node processes, hard links on E:, the Job Object, and isolated fixture files.
- **Fake:** the browser, the Apple pages, plan approvals and the unpaid order.

Known limits stand as listed on the sheet: human authentication, legacy unknown action with no final proof, permanently readonly source, a cart-only transfer can't restart an empty bag, POSIX unverified, and no real whole-chain run or speed data. I make no live, goal or speed claim and report no goal-tool activation.

## Denials, budget and checkpoint
- **Denials:** none. No other agents, private reads, network use or writes. Test fixtures under `.local/test-runs` were not read.
- **Budget:** about $3.31 of $10 used, about 31 Read calls, 1 Grep and 5 Bash calls; usage figures are the resumed-history aggregate.
- **Not saved:** the lesson "one command per turn" is not saved to memory, because home-directory writes are prohibited.
- **Checkpoint:** C-104 is returned with a bounded AGREE and N1/N2. Next steps for Root:
  1. Reproduce and repair N1 and N2.
  2. Re-run command 4 to see whether the dom-bridge failure is intermittent.
  3. Request a fresh review in which each of the five calls is issued in its own turn.
