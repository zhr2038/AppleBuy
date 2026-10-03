# C-031-CROSS-REVIEW: DISAGREE

**Verdict: DISAGREE** for the exact 161-file candidate with sha256 `5b323fa3c52dae4a56a290140b378c85fe10f3bba1103accb3a0b1b78f93ff0b`. I did not assess the earlier pre-README hash `9d8ac4ee…`, and I am not approving it.

The blocking problem is in C030: the bounded claim that there is "no … marker reset or second add" does not hold. I found it by tracing the code. I did not execute it, because this review allowed no edits and no custom commands.

## Blocking counterexample: a successor task can add to the bag again

**What the retired record proves.** `retireReadOnlyBag` only retires a record after a fresh read shows exactly one matching item in the bag. That item was added by this executor (`bagAddStarted:true`, `resourceWritten:true`). It stays in the bag after retirement.

**Trace for a new run started on a product page after that retirement:**
1. `job.js:118` builds the new task as `{...fresh(), retiredHistory}`. `fresh()` sets `bagAddStarted:false` (`job.js:116`).
2. The `??=` at `job.js:131` does not override `false`.
3. Line 166 does not apply, there is no pending action, and `reconcileOnly` is undefined on the new task (line 208).
4. Lines 212–214 do not apply on an ENTRY or VARIANT page.
5. At line 216, the `bagAddStarted` check (line 218) passes, so there is no gate.
6. On a verified variant within the price cap (line 228), outside validation mode, line 230 sets `command={action:'addBag'}`.
7. Line 274 writes it ahead and line 276 marks the bag addition started, then the command is sent.

**Why this conflicts with the stated rules:**
- Task item 2 says "no … marker reset or second add". The marker is reset for the successor.
- R07 forbids duplicate additions, and A05 says duplicates must not duplicate mutations.
- The code's own C-019 rule at `job.js:277` says that once the bag holds the item, "this task never adds afterwards". The successor drops that fact even though `retiredHistory` still contains the old `bagAddStarted:true`.

**Test coverage.** The only test of a successor run (`test/checkout-c030-retirement.test.ts:25-31`) starts on the BAG page, where line 278 handles it correctly. No test in the C030 file or in `review/browser-retirement-self-check.mjs` starts the successor on ENTRY, VARIANT or a configurable PRELAUNCH page.

**Concrete scenarios:**
- **Same Pro plan:** a second Pro is added to a bag already known to hold one.
- **Duo after the 16 October 20:00 preorder opening:** a Duo is added next to the retired Pro. The BAG check then blocks on mismatched contents (`job.js:233`), but only after the cart has been changed, and at launch time.

**What limits reachability:**
- The user must approve a new start.
- "Prepare" needs a visible `/shop/open/salespolicies` link on the product page (`control.js:28`, `page-program.js:260`). I have no evidence either way on whether real product pages show one.
- Nothing in `control.html:16` or README line 13 warns the user that the retired item is still in the bag.

**Suggested acceptance criteria (Codex decides the design):**
- A successor of a `resolved-pre-slot-bag` retirement must never reach `addBag`. For example, carry the predecessor's bag fact forward, or add a dedicated gate with truthful Chinese status text.
- Codex must also decide whether public `configureProduct` and PRELAUNCH preparation should stay available.
- Add new tests, without editing old ones:
  - the successor's first read is VARIANT, ENTRY or configurable PRELAUNCH, for both the same plan and a Duo plan: no `addBag` is sent, and the stop reason is truthful;
  - the existing BAG-start successor test still ends with `['checkout']`.

## Other bounded items

All of the following stay within their stated limits; I found no further counterexample.

1. **C029 order summary:** Within its bounds:
   - quantity comes only from the piece label, with money used only as a change detector;
   - only the single exact close control `关闭` is clicked;
   - a pending Checkout is acknowledged without repeating it, and summary reads are bounded.

   Residuals:
   - The reason text at `job.js:176`, "explicit-one-unit-basis", overstates what the basis is (`bagTotalCny ?? quotedCny`).
   - The 15-second freshness limit, settle timing, the real Duo summary, later-stage summaries and counts other than one remain unverified on real pages.
2. **C030 retirement itself:** Within its bounds:
   - binding and the fresh one-item, no-extras read are checked;
   - the read is observe-only and never reads the private session;
   - the lock, pause and storage-race guards hold;
   - history is preserved and the successor gets a new identity and authority.

   Only the successor gap above fails.
3. **C031 pre-release preparation:**
   - The gate at `page-program.js:228-235` requires the two observed notices as whole-element text, a disabled `继续`, the exact path and the model heading.
   - The approval notice still blocks.
   - A gate appearing after a public choice is reconciled at `job.js:203`.
   - An unknown final order and an already started bag stay blocked at `job.js:218`.
   - Changed wording or page structure fails closed to NOT_RELEASED. None of this is live-verified.
4. **Dispatcher and reviewer tools:** Limits are as stated. The file-tool deny rules are not an OS sandbox, and I did not test them. The implementation profile's Write/Edit access is unscoped. Chrome, merchant and storage are all FAKE.

## README (operator guidance)

- Line 5 correctly separates the pending 861/12 candidate from accepted main C028.
- Line 3 truthfully says the earlier purchase authority is consumed.
- Nits:
  - Line 7 writes `MK2M4CH/A`; the evidence records `mk2m4ch/a`.
  - Line 206 still says C-010/C-011 are "仍待实际 Claude 复审", which is stale.
- Gap: the README does not warn that a retired read-only bag still holds its item (linked to the blocking finding).

## Commands run

I ran exactly these four, unchained, in this order:

| # | Command | Result |
|---|---|---|
| 1 | `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-031-candidate-manifest.json` (before tests) | `ok:true`, 161 files, `5b323fa3…ff0b`, no mismatches |
| 2 | `node --test --test-reporter=dot "test/*.test.ts" "review/*.test.ts"` | No failure markers and no non-zero exit reported. The dot reporter prints no totals; my own count is 43 rows of 20 plus 1 = 861 dots, which matches the public self-verification |
| 3 | `node review/browser-summary-self-check.mjs` | 8/8 PASS, `passed:true`, 8 contexts closed, browser and server closed, no errors |
| 4 | `node review/browser-retirement-self-check.mjs` | 4/4 PASS, `passed:true`, 4 contexts closed, browser and server closed, no errors |
| 1 | Same manifest check again (after tests) | Identical result: unchanged |

- Both browser scripts wrote their own ignored artifacts under `.local/reviewer/` (timestamps 2026-10-03T21:30Z). I did not read them.
- Both scripts load Playwright from a Codex cache under the home directory and use the installed Chrome. They are Codex-authored self-checks, not independent proof.

## Read scope, denials, limits

- **Read in full:** all 30 required files, during this invocation. I did not read all 161 mapped files.
  - 25 of them were read before an automatic context compaction partway through this session. For those I worked from my own summary, plus targeted re-reads after compaction of `job.js:100-278`, `control.js:28`, `control.html:16` and the C030 test lines 10–33.
  - Extra Grep lookups were limited to README, `requirements.md` (R07) and terms-link fixtures.
- **Not read:** the runbook and other referenced documents.
- **Private transcript:** the compaction note pointed to a private transcript path. I did not read it, and I made no private or `.local` reads.
- **Denials:** no permission denials occurred.
- **Edits:** I made no edits, invoked no agents and used no network.
- **Budget:** the local counter showed about USD 3.7 of 8 when I last checked; that counter is not billing. I hit no cap interruption. I did not keep an exact turn count across the compaction.
- **Model and effort:** the model is `claude-opus-5-5`. The effort setting (`xhigh`) cannot be observed from inside the session.
- **What is real versus FAKE:**
  - Real evidence: only the recorded public Duo page and marketing observations.
  - FAKE: all test transport.
  - Not shown: no proof of an installed extension, a real order, stock, speed or the merchant's refusal behaviour, and no live readiness.

**Checkpoint:** the review is complete with DISAGREE. If the source changes, a new manifest and a fresh run of all four commands are needed.
