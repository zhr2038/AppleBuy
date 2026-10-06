# C-143 review: bounded AGREE

My verdict is **bounded AGREE** with the C-142 change as scoped. It adds a separate, read-only "expired empty-start source" check (provenance only, never buyer authority) and lets an explicitly approved cart-only transfer accept that source. I found no way for a hidden final, the price, the quantity, a malformed lineage, a record with both markers, or a context crossing to get past it. The findings below don't block acceptance.

## Process and disclosures
- **Reads:** all 18 listed files were read to EOF after the context compaction: 19 Read calls, with job.js in two parts (lines 1–424 and 425–508). Seven of these files were also read before the compaction. After it, the harness re-attached some earlier file contents, but I re-read every file myself and didn't rely on those copies.
- **Other tools:** no Grep, Glob, or other tool calls. There were no edits, memory writes, ledger, private, home, profile, browser, network, or registry access, and no agents.
- **Commands:** exactly the three listed commands, one at a time in the foreground. None was rejected or failed, and there were no read gaps.
- **Model:** the session reports claude-opus-5-5. I can't see modelUsage or verify the xhigh effort level from inside.
- **Budget:** the displayed $3.42 of $5 is a whole-session total including work before the compaction, not this round's spend. About 12 turns were used of 40. I can't measure the 900-second limit.
- **Delta check:** I did not compare the C-140 and C-142 manifests file by file (the C-140 manifest wasn't on the read list). The "only cart-transfer.mjs and empty-restart.mjs changed" claim comes from Codex. Partial support: checkout-runtime.mjs still has the C-141 hash `1b8ebf90…`.

**Changed files: none.**

## Verified by reading the code and the tests
1. **No revived buyer authority.**
   - `validateReadonlyExpiredEmptySource` (`src/desktop/empty-restart.mjs:21-24`) is used only by the cart-transfer source check (`src/desktop/cart-transfer.mjs:11`), as far as the files I read show.
   - `validateEmptyRestart` still rejects read-only records (`empty-restart.mjs:17`).
   - Purchase mode still rejects them too (`browser-session.mjs:36`).
   - The test asserts `validateEmptyRestart(before)===null`.
2. **Lineage checks.** `sourceGeneration` (`empty-restart.mjs:7-13`) checks:
   - schema, the four human attestations, task ID, plan digest, and that each generation's context matches its row;
   - that the source fingerprint matches the original task;
   - exactly one archive, with a matching snapshot hash;
   - that the generation number is exactly the previous one plus 1, at most 3 deep;
   - that the root is a read-only handoff.
   
   On top of that, the top row must be read-only with a finite `expiresAt` that has already passed, and the final-history check runs over the whole row.
3. **Both markers on one row** (handoff and empty-start): rejected without falling through to the new check (`cart-transfer.mjs:10`, `empty-restart.mjs:9`).
4. **Context crossing.**
   - The new row is bound to the current session (`cart-transfer.mjs:22`, `job.js:209`).
   - In another context it is treated as read-only, and purchasing from there is rejected (`browser-session.mjs:37-40`).
   - The transfer doesn't require the new session to differ from the source's context, but neither does the existing handoff path. The source being read-only and expired, plus explicit approval, covers this.
5. **Hidden final, price and quantity.**
   - The full-history final check runs on creation (`cart-transfer.mjs:30`) and again on validation (`:22-23`).
   - Two bag reads must show the same document and the same item: path `/shop/bag`, the right model/capacity/colour, quantity 1, total above 0 and at most ¥9,999, and no extras (`:33-38`).
6. **Cart-only, and not generalised.**
   - `job.js:472` blocks configure, continue, Add, open-product and view-bag for any transferred row.
   - A reconciled transfer row carries neither top-level marker, so neither the transfer path nor the empty-start restart path will accept it as a source.
   - The full source and archive are cloned, and nested pending unknowns are kept.

## Findings (none blocking)
- **F1 (low, tests): missing negative cases.** The new code should reject all of these, but no test exercises them:
  - a row with both markers;
  - a generation number off by one;
  - a context that doesn't match the generation's context;
  - two archives, or an archive that doesn't match;
  - a plan that differs (for example, no extras field);
  - a reconciled transfer row used as a source;
  - an `expiresAt` that is NaN or a string.

  Example: after `fixture()`, set `f.w.row.desktopHandoff={schema:'applebuy-desktop-handoff/v1',id:'FAKE',originalSnapshot:f.w.row.desktopEmptyRestart.originalTask}`. **Acceptance:** each case is rejected with zero writes and an unchanged row. I didn't run these, because only the three exact commands were allowed.
- **F2 (operational limit, by design).** The adopted row gets a new 30-minute window. If it expires or its context ends, for example while human authentication is still pending, the program has no further recovery, because transfer rows aren't valid sources. **Acceptance:** Codex documents this. Any later broadening needs its own task and review.
- **F3 (low, existing before this change).** In `checkout-runtime.mjs:92`, the transfer's "still live" check doesn't include `this.lease?.owned===true`, while the empty-start restart's check does (`:106`). Losing ownership between the second bag read and the write is caught only if the lease's lost-ownership callback fires and starts closing. **Acceptance:** add the lease check, plus a FAKE test where ownership is lost before the write, expecting zero writes.
- **F4 (informational, fails safe).** The transfer row stays valid only while the source's `expiresAt` is in the past by the current clock. If the system clock moves backwards, the row stops validating and checkout stops.
- **F5 (informational).** "Exactly one item" relies on the page decoder (page-program.js, which I didn't read) and on a quantity of 1. The old slot-window check uses the task's local expiry as a stand-in, with no Apple evidence of how long a slot hold lasts. Both behaviours are unchanged.

## Commands and results
1. Manifest verify: ok, 289 files, `ee1488e87cc83f090e392b7ffcfcfd4b534a3fd665c26d3bd2168bc8f2d84d23`, no mismatches.
2. `node --test` on the c142, c130 and c121 files: 26 tests, 26 passed, 0 failed.
3. Review runner, all five ordered checks passed and cleanup was confirmed for each:
   - manifest ok;
   - 108/108 focused tests;
   - 54 Python tests with 0 failures, errors or skips;
   - 1546/1546 full Node tests;
   - manifest ok again.

**Not run:** the F1 cases, any live, GUI or real-browser check, and the manifest-to-manifest diff.

## Requirements mapping
- **R01:** the fixed Pro plan, cap and no-extras are enforced.
- **R06 and R07:** unknown outcomes are preserved; a final is never resubmitted and Add is never repeated.
- **R08:** explicit approval and pause/live checks are kept.
- **R09:** FAKE data only, zero real actions.
- **R02, R03, R04, R05 and R10:** not affected by this change.

## Real evidence versus simulation
All the data above is FAKE; I did not read the real record, customer data or session ID. Adopting the real cart would also need the real source to be read-only already (which takes a reconcile write in the new context), its lineage and hashes to pass, and no history event matching `/final/`. None of that is verified. The anonymous BAG read in C-141 proves no account identity.

I make no claims about the whole 289 files, the real account, a live cart transfer, real slots, refusal, hold, order, speed or the overall goal. Human authentication is still pending.

**Checkpoint:** C-143 review complete at 289 files / `ee1488e8…4d23`. Next is Codex's decision on F1–F3; I made no source or ledger changes.