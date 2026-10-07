**Verdict: bounded AGREE.** Within C-182's scope, the C-181 candidate does what the sheet says. I found no defect that blocks acceptance. The findings below are Low/Info: one small authority widening and gaps in test strength.

## Commands (exactly three, in order, foreground, no denials)
1. `python -B tools/delegation/verify_candidate_manifest.py docs/reviews/C-181-candidate-manifest.json` → ok. 300 files, sha `5405e653…`, 0 mismatches.
2. `node --test test/checkout-c181-expiry.test.ts test/checkout-c043-lookup.test.ts test/desktop-c121-native-checkout.test.ts` → 55/55 passed (C181 13, C043 31, C121 11).
3. `python -B tools/delegation/run_review_checks.py docs/reviews/C-181-candidate-manifest.json` → all 5 checks passed, none timed out, cleanup confirmed each time:
   - manifest ok
   - 108/108
   - Python 61/0/0
   - full Node 1622/1622
   - manifest ok

## Confirmed by reading the code
- **URL lists stay separate.**
  - `checkoutUrl` is unchanged (`checkout-rpc-contract.js:9`). `checkoutObservedUrl` adds only the exact path `/shop/sorry/session_expired` over HTTPS, with no credentials or port (`:11`).
  - Creating a tab is still limited to the bag or product entry page (`checkout-rpc-peer.js:32`).
  - Navigating a tab still requires `checkoutUrl` (`:41`). Commands require `checkoutUrl` for the tab's current address (`:49`).
- **ChromePort.** Only `permission()` uses the new observation helper (`chrome-port.js:19`). Every navigation site still uses `allowedMerchantUrl` (`:44,48,62,91,128`). The host-permission check is unchanged, and `manifest.json` is not in the modified set.
- **Decoder (`page-program.js:26-33`).**
  - It runs before the general URL check.
  - It needs exactly one main element (hidden ones count toward that total), and it must be visible. Inside it, exactly one visible H1 must match `你的操作已超时。` after normalisation.
  - It reads no inputs and returns UNKNOWN with `verifiedStep:false`.
  - It refuses commands through `report()`, which respects the delivery memo (`:22-24`).
  - When the program re-enters itself after a write, the memo was already recorded (`:565`), so the result is correctly `touched:true`.
- **Controller (`job.js:277`).**
  - The new stop runs after the read is saved and after the pause/stop check. It runs before the start-grant check, the summary read, the C064 add-error recovery and pending reconciliation.
  - `gate()` changes only the state and reason, plus the existing revocation of a start grant (`:162`).
  - Pending action, final intent, accepted slot, history and caps are untouched.
  - When a final order was already sent (`finalLookup`), the new stop is skipped and the existing lookup runs, ending in "final-result-unconfirmed; no resubmission" (`:311-322`).
  - An expiry page that fails the strict check reads as UNKNOWN and falls into the existing stops (`:354/359/364`).

## Findings
- **F1 (Low, scope).** The peer's shared `tab()` helper (`checkout-rpc-peer.js:14`) accepts the expiry URL for every tab operation, including `updateTab` (`:40-44`). C-181 limits the expiry page to reading and removing the tab.
  - So navigating away from an expired tab is now allowed if a navigation authorisation (from a delivered open-product/open-bag command) or a receipt read was still recorded when the tab changed.
  - It only happens in a race. The destination is still checked by `checkoutUrl` and the existing authorisation, and there is no merchant mutation. It is untested.
  - Similarly, ChromePort's `act()` and `readSummary()` now get past `permission()` on an expiry tab. The refusal now happens in the page program (`page-program.js:31`). The job's stop prevents this path in practice.
- **F2 (Low, test).** The peer command-rejection check (c181 test line 15) does not prove what it claims. Its `expected:'{}'` does not match the recorded read, so line 52 would reject the command anyway. The new guard at `checkout-rpc-peer.js:49` is never independently tested.
- **F3 (Low, test).** The controller cases (test line 16) are thin:
  - The submitOrder case asserts no reason or state. Because `orderRefHash` is null, the lookup returns immediately and never reads the expiry page.
  - The rows have no accepted slot, history or grant, and the `NEEDS_VERIFICATION` state is not asserted.
  - No case covers no pending action, reconcile mode, or an expiry page that fails the strict check.
  - By code reading, all of these paths behave correctly.
- **N1 (Info).** The expiry stop is not durable. No history event is recorded, and the next run clears the reason (`job.js:251`). A later run started by a person falls under the existing rules (stale pending actions stop without repeating, `:354/361`). Lifecycle handling after a pre-final session ends is the declared next engineering step.
- **N2 (Info).** The helpers and decoder also accept the expiry path on `secure*.www` hosts, but it was only observed on `www`. The effect is only a stop, so this fails safe. Unlike C064's page-not-found check, there is no page-title requirement.

## Requirement mapping
- **R06:** expiry is UNKNOWN. It is not read as no stock, a refusal or success.
- **R07:** an uncertain final order still goes through the existing lookup with no resubmission.
- **R08 / A10:** the task stops with a clear reason for a person to handle.

Nothing was added for retries, renewal, a fifth transfer, emptying the cart, extra slot holds or a hold-release claim.

## What is real and what is simulated
- **Real:** C180's observation of the expiry page, and the public template, which is structural evidence only.
- **Simulated:** every test uses FAKE data against localhost (127.0.0.1) and FAKE browser APIs.
- **Not done:** the actual app was not loaded. I did not reproduce the "8 pass / 5 fail" result from before the change.
- **Not claimed:** the goal (one unpaid Pro order before Duo), live readiness, release of any server-side slot hold, or a real order.

## Disclosures
- **Compaction during C-182.** The context was compacted after 8 of the 15 reads and before any command.
  - After compaction, I have the C-182 and C-181 sheets, the verification JSON and the c181 test as full text.
  - For AGENTS.md, `requirements.md`, `run_review_checks.py` and `process_tree.py`, I have only my summary of the full reads made before compaction.
- **Read caps.**
  - `page-program.js` was cut off at line 405 of 649 by the token limit, so I read the rest from line 406 to the end.
  - `job.js` was read in two parts: lines 1–300 and 301–508 (end of file).
  - All 15 resources were read to the end. Nothing outside the list was read: no prior manifest, no git diff.
- **Errors and permissions:** no permission denials, no errors, no timeouts. I ran no git commands and made no edits.
- **Test browser cleanup:**
  - Command 3 confirmed cleanup of everything it started.
  - Command 2 relied on the test's own `after()` cleanup and exited cleanly. I did not list processes to check for stray Chrome instances, because that is outside the allowed commands.
- **Budget:** about $3.5 of $6 spent before writing this report, and about 20 tool calls.
- **Model:** claude-opus-5-5; the reasoning effort is verified externally.

**Changed files:** none.

**Checkpoint:** C-182 is complete. If Codex wants to tighten things:
- **F1:** restrict `tab()` URL acceptance to getTab, removeTab and read-only page reads.
- **F2:** give the peer command test a matching `expected` value so the new guard is actually tested.
- **F3:** assert the reason and state, and cover the remaining paths.
