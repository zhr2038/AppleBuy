**Verdict: bounded AGREE** on the C-135 change to `src/desktop/checkout-runtime.mjs`. The new startup retry does not repeat tab creation or any mutation, leaves the host, address and unknown-result checks unchanged, and gains no buyer authority. Delivery or identity errors, missing permission, cancellation and malformed output never turn into availability or success. One non-blocking finding (C136-1): cleanup is not confirmed if `close()` is called while a startup request is in flight. I found it by reading the code; I did not run it.

## How the startup retry behaves (`checkout-runtime.mjs:21-45`)

**One create, then reads only.** `api.create(BAG)` runs once, before the loop (`:21`). Inside the loop the only calls are `api.tabs.get` and `observe()`. `observe()` builds a `ChromePort` in observe mode, which cannot act (`chrome-port.js:13,39`), and only reads the store. Nothing calls `store.put`, update, remove or create again.

**Bounds.** The loop stops at 150 attempts or a 15-second deadline, whichever comes first (`:27-28,41`). The attempt cap still holds if the system clock jumps.

**Cancellation.** At the top of every attempt it checks closing, owner loss and `lease.owned` (`:29`).

**Checks left unchanged:**
- **Address:** a page that is no longer loading must pass `allowedMerchantUrl`, otherwise it fails with `UnsupportedMerchantPage` (`:33`).
- **Host permission:** a refusal stays terminal as `CurrentHostPermissionMissing` (`chrome-port.js:21`).
- **Document:** if tab metadata leaves the status undefined, the read still goes through the peer, which requires `status==='complete'` and the page-shape and private-key filters (`checkout-rpc-peer.js:47,57-62`).

**Byte checks.**
- The peer, ChromePort, NativeCheckoutApi, contract, page-program, job, worker, channel, owner-lease, host, broker, installer, bridge and the C121/C127 tests have the same hashes in the C-135 manifest as in the C-131 manifest.
- That comparison is a spot check of about 25 paths. It uses the C-131 manifest as I read it in C-133, not a fresh C-136 read.
- So I have not independently confirmed that `checkout-runtime.mjs` is the only changed file across all 286.

**Errors after a poisoned channel.** A timeout or a reply identity mismatch marks the API as poisoned. After that, the next request throws `NativeCheckoutAlreadyRunning` before sending anything (`native-checkout-api.mjs:7,10,12`), so no further frame goes out.

## Findings (none block purchase safety)

**C136-1: a close during startup can leave cleanup unconfirmed (from reading the code, not run).**
- `open()` is not one of the operations that `close()` waits for. `closeOnce` waits only on those (`:13,127`).
- If the GUI closes, or the owner lease is lost (`:20`), while a startup request is in flight, the close path calls `api.close()`. That request then throws `NativeCheckoutAlreadyRunning` (`native-checkout-api.mjs:7`).
- The result: `cleanupConfirmed=false`, the lease is not released, the session's own tab may stay open, and the rejected `closePromise` is kept, so cleanup is never retried.
- Requests are in flight for only part of each poll, but the 15-second loop makes the window much wider than the single read the old code did.
- C135 test 4 sets `runtime.closing=true` directly instead of calling `close()`, so this path is not tested.
- The failure is visible (it surfaces as `DesktopBrowserCleanupUnconfirmed`), and there is no mutation or false success.
- **Assumption:** this applies only if the real close handler calls `NativeCheckoutApi.close()`. That handler is in `native-checkout-channel.mjs`, which was not on my read list.
- **Suggested repro:** in `world()`, wrap `chrome.tabs.get` so it calls `f.runtime.close()` (without awaiting it) during the first loading read. Then assert `cleanupConfirmed`, `w.tabs.size===0` and `releases===1`.
- **Suggested fix:** make `closeOnce` wait for the startup read to finish before it sends `closeSession`.

**C136-2: the retry treats more errors as "loading" than the code comment says.**
- The two retried error names cover every refusal from the peer: address not allowed (including a committed non-merchant URL), tab not owned (for example, the user closed it), peer busy or closed, document not ready, page not allowed, private-key output, and script not confirmed.
- `chrome-port.js:24` also turns a delivery timeout or identity mismatch during the document read into `ScriptTransportRejected`.
- **Still safe:** the poisoned-channel case ends on the next attempt without sending another frame, and every other case ends as `DesktopInitialPageUnconfirmed` within 15 seconds.
- **Cost:**
  - **Error labels:** the reported error is imprecise; delivery uncertainty is reported as `NativeCheckoutAlreadyRunning` or as cleanup unconfirmed.
  - **Delay:** a real refusal takes up to 15 seconds to fail.
- The invalid-address test goes around the peer with a Proxy, so the real peer path for that case is not tested.

**C136-3: how far the deadline can overrun.** It is one in-flight attempt, not one transport operation. An attempt can chain the loop's `getTab` plus `observe()`'s `getTab`, `containsHost` and `merchantDocument`, each bounded only by the API timeout (10 s by default; I did not read the production value). This is consistent with the sheet's "no hard absolute-wall guarantee".

**C136-4: gaps in test strength.**
- The delivery-error test throws from `exchange` instead of going through a real timeout, so the poisoned-channel close path is untested.
- There is no startup test for a reply identity mismatch.
- There is no test for owner loss during polling.
- Pausing during startup does not stop the read-only polling. Only the state callback is suppressed, which is consistent with R08.

**Already in the code before C-135 (not new):** if the user closes the tab, the peer's `closeSession` calls `tabs.remove` on a missing tab and fails, so cleanup is reported as unconfirmed.

## Commands, run once each in order after all 15 fresh reads

| # | Command | Result |
|---|---|---|
| 1 | `python -B tools/delegation/verify_candidate_manifest.py docs/reviews/C-135-candidate-manifest.json` | ok, 286 files, SHA `3b714ebc…1f3242`, no mismatches |
| 2 | `node --test test/desktop-c135-initial-loading.test.ts test/desktop-c121-native-checkout.test.ts test/desktop-c127-startup.test.ts` | 21/21 passed (C135 7, C121 11, C127 3) |
| 3 | `python -B tools/delegation/run_review_checks.py docs/reviews/C-135-candidate-manifest.json` | manifest ok · 108/108 focused · 54 Python, 0 failures/errors/skipped · 1521/1521 full Node · manifest ok · `passed:true`, cleanup of owned processes confirmed on every row |

The runner's focused list doesn't include the C135 file. It is covered by command 2 and the full run (1521 = 1514 + 7).

**Not run or not reproduced:**
- Codex's before-repair results (4 run, 2 failing).
- Codex's actual Chrome runs before and after the repair.
- The C136-1 repro.
- Any browser, GUI or Apple access.

## Requirements mapping
- **R02:** host permission and page recognition before reading.
- **R03:** same-tab reads only, with no navigation or refresh.
- **R06:** a loading tab or failed read never counts as availability or "none".
- **R07:** one create and no repeated mutation.
- **R08:** cancellation, with the C136-1 caveat.
- **R09:** no mutation on any startup path.

## Real evidence vs simulation
- Every test here is a local FAKE fixture.
- The actual Chrome outcomes are Codex's reports, which I did not observe:
  - before the repair, `NativeCheckoutResultUnconfirmed` after the create;
  - after the repair, OBSERVED, EMPTY_BAG and `legacyReadOnly`, with cleanup confirmed.
- "Loading, or no committed URL yet" is a supported explanation; no raw tab field proves it.

**Not approved:**
- the whole 286-file candidate;
- the current extension deployment;
- account identity or the human attestations;
- refusal handling, slot hold or a live order;
- speed or the overall goal.

The earlier C133 approval does not cover these new bytes. Final submit and payment remain disabled.

## Disclosures
- **Changed files:** none.
- **Permissions and errors:** no permission denials and no tool errors.
- **Reads:** 15 fresh reads, one per listed file.
- **Usage:** 3 Bash calls and about 6 tool turns of 40. The displayed spend is about $1.22 of $5.
- **Model:** I am running as claude-opus-5-5. I can't verify the xhigh effort setting or the wall time from inside, so Codex should check both in `modelUsage`.

**Checkpoint:** C-136 review is complete. Next is Codex's decision on C136-1. A re-run would need the same 15 reads and the same 3 commands at SHA `3b714ebc…1f3242`.