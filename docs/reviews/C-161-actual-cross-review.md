## C-161 review report

**Verdict: AGREE, limited to the C-160 delta.** The delta is closed BAG observation metadata plus a fixed whitelist of error codes. I found no data leak, no effect on purchasing authority, and no change to old unknowns. There are three non-blocking findings, listed below. This verdict does not cover the whole 294-file candidate, whether the real cart is correct, why the transfer stalled, any order, or the goal.

### Commands (run separately, in order, in the foreground, exact text)
| # | Command | Result |
|---|---|---|
| 1 | `python -B tools/delegation/verify_candidate_manifest.py docs/reviews/C-160-candidate-manifest.json` | ok, 294 files, sha256 `073105e5…71df5`, no mismatches |
| 2 | `node --test test/desktop-c160-bag-diagnostic.test.ts test/desktop-c140-close-drain.test.ts test/desktop-c146-cart-reentry.test.ts` | 20 tests, 20 pass, 0 fail (5 C160, 8 C140, 7 C146) |
| 3 | `python -B tools/delegation/run_review_checks.py docs/reviews/C-160-candidate-manifest.json` | 5 ordered checks all passed: manifest; 108/108 focused node tests; 54 Python tests (0 failures, errors or skips); 1573/1573 full node suite; manifest again. Cleanup of the owned process tree was confirmed each time |

### Scope
- **Changed:** `checkout-runtime.mjs` and `native-purchase-worker.mjs`.
- **Added:** `checkout-diagnostic.mjs` and the C160 test.
- **Unchanged (same hashes as C-158):**
  - `browser-session`, `cart-transfer`, `job`, `chrome-port`, `page-program`
  - the c121 fixture and the c140/c146 tests
  - the tools
- I did not run `git diff` because it is not an allowed command. I judged the delta from manifest hashes and full-file reads, not a line-by-line diff.

### Data leaks
- **`bagPlanCheck`** (`checkout-diagnostic.mjs:3-9`) returns exactly 9 keys:
  - a constant `schema`;
  - 6 booleans built from `===`;
  - `quantity`: a safe integer from 0 to 200, otherwise null;
  - `totalCny`: a finite number above 0 and up to 1,000,000, otherwise null.
- No strings, URLs, references, document IDs or customer fields are copied.
- Progress events go through `safeState` (`checkout-runtime.mjs:11,63`), so `bagCheck` never appears in them.
- `bagCheck` is emitted only on the worker's observe/reconcile/submit result line (`native-purchase-worker.mjs:45`). It is not in `ready` and not in the AuthContinuation result.
- **Error path:** `safeCheckoutDiagnostic` returns either a member of the static set or a constant (`checkout-diagnostic.mjs:11`). Caller-controlled text never passes through. A thrown non-Error, a missing message or a `String` object all fall back to `CheckoutResultUnconfirmed`. The accompanying `message` is a fixed Chinese string.

### Authority effects
- A read-only search shows `bagCheck`, `bagPlanCheck`, `safeCheckoutDiagnostic` and `diagnosticCode` appear only in the runtime (2 hits), the diagnostic module (2), the worker (3) and the C160 test (5). No decision code reads them.
- `observeOnce` only reads the store; it never writes.
- The transfer guards in `cart-transfer.mjs:47-62` run their own observes and are unchanged. A passing `bagCheck` grants nothing.

### Error codes vs raw messages
I traced all 14 whitelisted codes to real throw sites with static strings:
- 8 in `cart-transfer.mjs` (lines 47–61);
- `chrome-port.js:18,21,24`;
- `native-checkout-api.mjs:10-13`;
- `native-checkout-channel.mjs:16-23`;
- the `DesktopOwnerLeaseLost` sites in the runtime, owner-lease and task-store.

Every other message collapses to the generic code. That is safe but loses detail; see F2.

### Types and boundaries
- An observation that is null or not in the BAG phase (AUTH, DETAILS, undefined) gives `null`.
- A missing purchase gives all-false match booleans and null numbers.
- `verifiedStep` is true only for `===true`, and `extrasClear` only for `===false`, so both fail closed.
- `quantity`:
  - non-integer, negative or above 200 gives null;
  - 0 is reported;
  - `-0` serialises as `0` (harmless).
- `totalCny`:
  - Infinity, NaN, strings, values ≤0 or above 1,000,000 give null;
  - a total above the 9,999 cap but within range is reported, and `matchesPlan` is then false because it uses `itemMatches`.

### Old unknowns
- `pendingAction` and `legacyReadOnly` are reported, never changed.
- The catch branch changes no runtime state.
- The C160 tests assert 0 writes, no commands and an unchanged row.
- The C146 tests still block a replacement write for hidden-final, archive-extra, original-tamper, active-old-slot and dual-marker records.

### Findings (none blocking)
- **F1 (Low, test gap):** No test exercises the worker's stdin/emit path. The claims "forwards `bagCheck` on observe" and "`diagnosticCode` on catch" are verified only by reading the code. The tests also don't assert the exact `bagCheck` key set, so a future extra key would still pass. Only one positive whitelist code is tested.
- **F2 (Info):** `runtime.transfer` goes on to call `advance` after a successful write (`checkout-runtime.mjs:95`). Errors from that advance (the `browser-session.mjs:20-45` messages, `DesktopSessionPaused`, and so on) produce the same `CheckoutResultUnconfirmed` as an unlisted failure before the write. The only way to tell them apart is the progress event `{NEEDS_USER, BAG}` emitted after `created` (line 94). So another generic result still would not prove whether the successor record was written. Those static messages could be safely added to the whitelist.
- **F3 (Info):** `bagCheck` leaves out three things the transfer guard depends on:
  - whether the path matches `/shop/bag` (`cart-transfer.mjs:55`);
  - whether the bag stayed the same across two reads (line 56);
  - the `initialSequence: old.lastRead` port setting (line 51). `observeOnce` builds its port without it (`checkout-runtime.mjs:60`).

  An all-true `bagCheck` therefore does not show that the transfer's own reads will pass. I did not read `chrome-port.js` this round, so this is not a claimed cause. A closed `bagPathMatches` boolean would add no privacy risk.
- **Outside the delta (not verified this round):** the worker's result line forwards `result.phase` and `result.state` without the `PHASES` filter that `safeState` applies.

### R01–R10
| Req | Status |
|---|---|
| R01 | Plan unchanged; `bagCheck` only compares against `PRO_PLAN` |
| R02 | Helps report blockers; does not establish real page evidence |
| R03 | No clicks, refreshes or navigation added |
| R04 | No change to slot logic |
| R05 | No change to slot logic |
| R06 | Malformed input gives null/false, never a match; unknown stays generic |
| R07 | No new mutation; transfer guards unchanged; a generic blocked does not mean a retry is safe |
| R08 | Pause/stop unchanged; observe still suppresses progress events while paused, closing or after owner loss |
| R09 | 0 writes and 0 actions in the tests; no real-mode change |
| R10 | Diagnostics are sanitised codes; the operator's rendering was not reviewed (private, not read) |

### Real evidence vs simulation
All the tests use FAKE merchant, API and owner data. The actual purchase connection, the read-only reconcile, the generic-blocked transfer and Root's stub diagnostic come from the task sheet and Codex's verification JSON; I did not observe them. `newDiagnosticsLive` is false.

### Disclosures
- **Context compaction:** it happened mid-round, after 8 of the 14 reads and before any command. Afterwards I re-read `checkout-runtime`, `checkout-diagnostic` and `requirements.md`; the task sheet, verification JSON and worker were back in context. I did not re-read `AGENTS.md` or the manifest JSON; commands 1 and 3 verified the manifest.
- **Extra reads:** besides the 14 listed files, I ran 2 read-only searches inside the repo (`src`, `web`, `test`, `review`, `tools`) to trace the whitelist throw sites and find consumers.
- **Model:** the environment reports `claude-opus-5-5`. I cannot verify the xhigh effort or the structured `modelUsage` from inside.
- **Budget and limits:**
  - About $1.47 of $5 shown; that figure is the resumed-history total, not this round's spend.
  - About 9 of 35 turns used.
  - I did not measure wall-clock time, so I can't confirm the run stayed within 600 seconds.
- **Access:** no permission denials. No network, browser, private ledger, home directory, profile or operator access.

**Changed files:** none. No memory writes.

**Checkpoint:** C-161 is finished and nothing is pending. Codex decides on F1–F3. I do not recommend repeating the transfer on the strength of `bagCheck` alone.
