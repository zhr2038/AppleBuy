# C-141 review: bounded AGREE for the C140 startup/close drain change

**Verdict: bounded AGREE.** Only explicit `Runtime.close()` and `pause()` are covered, checked with FAKE fixtures against the 288-file candidate (`ad1c45e1…d431`). I found no defect that affects purchase safety. The change avoids both problems the sheet asks about: native request overlap, and a close/open promise cycle. All three allowed commands passed (manifest ok; 29/29 focused; 108 focused, 54 Python and 1534/1534 full Node tests, with the manifest ok before and after).

## Why it works (`src/desktop/checkout-runtime.mjs`)

**No close/open cycle**
- `open()` starts `openOnce()` as a separate inner promise, `this.starting` (lines 17-18).
- `closeOnce()` waits for that inner promise and all tracked operations (line 137). It never waits for the outer `open()` promise or its error handler.
- `open()`'s error handler waits for `close()` (line 19). The inner startup never waits for `close()`.
- The owner-loss callback calls `close()` (line 27), but nothing in the startup path waits on that call.
- A deadlock would need `close()` to be awaited from inside a tracked operation or the startup. Neither the runtime nor the worker does that: the worker's stop handler and its `finally` are not tracked.

**No native request overlap**
- `closeSession` only runs after the startup promise and every tracked operation have settled. `observe()` is now tracked as well (line 55).
- Every entry point checks `closing` before its first native request. From that check to the request, the path has no await, and the operation is already in `operations`.
- Operations created after close's snapshot either throw before any request, or are awaited through a snapshot member:
  - startup → `observeInitialPage` → `observe`;
  - `transfer` / `restartEmpty` → `advance`.
- `NativeCheckoutApi` also refuses any concurrent request (native-checkout-api.mjs:7).

**Cancellation**
- `closing` and owner loss are checked after each awaited step: store read (line 25), lease (line 28), and launch (line 30, which also checks `lease.owned`).
- The launched `closeBrowser` is assigned before the launch check, so a channel launched during a close still gets closed.
- A tab create that was already sent can finish. That tab is then removed by `closeSession`, and readiness is refused (line 18).

**Late callbacks**
- After close or owner loss, `observeOnce` stops reporting state (line 62). Owner loss reports exactly one `ownerLost` state.

**Uncertain cleanup stays uncertain (by reading the code)**
- If a request timed out, the API is poisoned. `api.close` then throws, so `closeOnce` lands in its error handler.
- The result is `cleanupConfirmed=false` and `DesktopBrowserCleanupUnconfirmed`. The lease is not released, and nothing reports a false success.

**Everything else unchanged**
- Compared with the earlier runtime text, `executeOnce`, `advance`, `transfer`, `restartEmpty`, `prepareReview`, `submit` and `resume` are unchanged.
- Pending, final, history, expiry and authority handling is untouched.
- Startup never writes the ledger: the tests assert 0 writes and an unchanged row.

## Findings (none blocking or affecting purchase safety)

**F1 — missing test: close during startup when transport is uncertain.**
No C140 test covers a startup request that times out and poisons the API.
- **Reproduce:** use a FAKE world with a short `timeoutMs` and an exchange that never replies to the first startup `getTab`. Call `close()` while that request is in flight.
- **Acceptance:**
  - `close()` rejects with `DesktopBrowserCleanupUnconfirmed`;
  - `cleanupConfirmed===false` and `releases===0`;
  - no commands sent, no ledger writes, row unchanged;
  - a second `close()` returns the same rejection.

**F2 — limit: draining has no close-specific deadline.**
- Close waits for whatever is in flight to finish:
  - a standalone observe can make up to three more sequential read requests (`tabs.get`, `permissions.contains`, `merchantDocument`), each with a 10 s timeout;
  - startup adds the current request plus at most 100 ms.
- Nothing is mutated while it waits: the port is observe-mode, and new operations stop at the `closing` check.
- This can exceed the parent's 5 s stop wait (`interactive_child.py:78`), which then kills the process tree. That is the forced-stop path, which the sheet excludes.
- Close only finishes if the injected `store`, `acquireOwner` and `launch` finish. In production, the lease helper has a 3 s ready timeout, and `launch` spawns without waiting.

**F3 — wording only.**
A close during the initial read can fail startup with `DesktopSessionNotOpen` (from `observeOnce`) instead of `DesktopSessionCancelled`. Both stop safely, and the worker shows the same generic blocked message either way.

**C136 residuals**
- **C136-1:** fixed for explicit Runtime close/pause in FAKE fixtures. It is not fixed for forced death or cancelling a worker before it is ready. After an unconfirmed cleanup, the rejected `closePromise` is still memoized, which is intended.
- **C136-2 and C136-3:** unchanged.
- **C136-4:** partly addressed — C140 adds an owner-loss-during-startup probe. I did not check for a startup identity-mismatch probe.

## R01–R10 mapping
| ID | Effect of this change |
| --- | --- |
| R01, R03, R04, R05, R10 | Untouched. |
| R02 | Startup can be cancelled before any tab is created. |
| R06 | Uncertain cleanup stays unconfirmed. |
| R07 | No overlapping requests and no second create; a create that was already sent is cleaned up. |
| R08 | Close and pause wait for startup and observes to finish; no late "ready" or "observed" states. |
| R09 | FAKE only: 0 commands, 0 ledger writes. |

## Commands (exact, one at a time, in the foreground, in order)
1. `python -B tools/delegation/verify_candidate_manifest.py docs/reviews/C-140-candidate-manifest.json` → ok, 288 files, `ad1c45e1…d431`, no mismatches.
2. `node --test test/desktop-c140-close-drain.test.ts test/desktop-c135-initial-loading.test.ts test/desktop-c121-native-checkout.test.ts test/desktop-c127-startup.test.ts` → 29/29 pass (8 C140, 7 C135, 11 C121, 3 C127).
3. `python -B tools/delegation/run_review_checks.py docs/reviews/C-140-candidate-manifest.json` → all 5 checks passed, each with owned-process cleanup confirmed, `passed: true`:
   - check 1: manifest ok;
   - check 2: 108/108 focused tests;
   - check 3: 54 Python tests, no failures, errors or skips;
   - check 4: 1534/1534 full Node tests;
   - check 5: manifest ok again.

**Not run:** the F1 test, live startup cancellation (Codex records `liveStartupCancellationVerified: false`), forced stop of the worker or its parent, and anything involving Chrome, Apple, authentication or GUI.

## Real evidence vs. FAKE fixtures
- **FAKE:** all C140 tests use FAKE Chrome, merchant and owner objects around the production Runtime, NativeApi and Peer.
- **Codex's records, not verified by me:**
  - the private reproduction now shows cleanup true, 0 tabs and 1 lease release;
  - the C139 read-only observation found quantity 1, ¥9,999, no extras.
- **Not established:** that cart observation proves neither account identity nor any new right to buy, and human authentication is still pending.
- **I make no claim** for the whole 288-file candidate, the full GUI or worker lifecycle, the account, real slots, refusal, hold, order, speed or the goal.

## Disclosures
- **Changed files:** none. No memory written.
- **Errors and denials:** none.
- **Reads:** 18/18 read fresh to the end this round. I issued them as parallel Read-tool batches; only the three commands went through the shell.
- **Production delta:** I did not compare the full file list against the 287-file candidate myself. I spot-checked hashes against the C-137 manifest text I had read during C-138, and that text was not re-read this round:
  - only `checkout-runtime.mjs` changed (`dd7a5a6b…` → `1b8ebf90…`);
  - only `test/desktop-c140-close-drain.test.ts` is new;
  - the worker, channel, API, lease, interactive child, peer, port, page program, job and the C121/C127/C135/C137 tests have the same hashes.
- **Model:** `claude-opus-5-5`. I cannot verify the xhigh effort level from inside, so root should check `modelUsage`.
- **Spend and limits:** the counter read about $0.77 of $5 after command 3; it is the displayed aggregate, not confirmed round spend. I used 6 tool turns plus one short progress message. I cannot measure wall time from inside.

**Checkpoint:** C-141 is finished. If a re-run is needed, repeat the 18 fresh reads and then the three exact commands.