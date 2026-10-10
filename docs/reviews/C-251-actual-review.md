# Actual C251 report

I recommend accepting Candidate355 for the planned continuation of the current purchase: **AGREE, no material findings.** All four required commands passed. I found one latent defect in the new preflight memory that does not affect the continuation and should be fixed before any fresh purchase is started from a retired task (F1 below). This does not approve the whole repository or the live goal, does not cover the earlier failed candidate 34e9095c, and claims no live order.

## Commands (exact, once each, in order, foreground)
1. `verify_candidate_manifest.py`: `{"ok": true, "files": 355, "sha256": "f2b571b5…8db1", "mismatches": []}`
2. `node test/c250-preflight-repro.mjs`: `{"phase":"REVIEW","accountLookups":1,"checkouts":1,"finals":0}`, exit 0.
3. `node --test …` (four files): 102/102 pass, 0 fail (24 C250, 35 C248, 43 C238/C240/C242/C244).
4. `run_review_checks.py`: all 5 steps passed.
   - Manifest before and after: OK.
   - Protected: 108/108.
   - Python: 96/96, with 0 failures, errors or skips.
   - Node: 2022/2022.
   - `ownedTreeCleanupConfirmed` was true at every step; no timeouts.

All merchant and order results are FAKE.

## Review areas
- **Remembered account check (identity and lifetime):**
  - It is stored only after a check that came back `clear`, and `clear` is only accepted with a signed-in account, an account hash and a count (`checkout-runtime.mjs:94`, `:118`).
  - It is tied to task, plan, current session and the held owner lease (`:108-109`), kept only in memory, and cleared on close (`:233`).
  - Sign-in, unknown or existing-unpaid results are never remembered (tested).
  - The new-purchase and continuation steps run their own fresh check first, and the advance right after them reuses it (`:133`, `:142`).
- **`clear` is never used as proof about a sent final:**
  - The memory is only read before any final has been sent (`:93`).
  - After a final is sent, the same-order lookup always runs (`:92`, `:104`; tested: the lookup count goes 1 → 2).
  - Final consent is still built only from the person's explicit choices at that moment (`browser-session.mjs:51-55`).
- **Source and owner races:**
  - The continuation requires an old task from a different, stopped session (`cancelled-order-purchase.mjs:33`) and checks that the session is still active and the owner lease is still held.
  - It confirms the old task is unchanged before archiving, after archiving and after its own check (`:44-45`, `:48`); a concurrent change is tested.
- **Old records and unknowns kept:**
  - The whole current task is archived, with a matching backup (`:45`, `:47`).
  - Each check of the new task walks the full chain: new task → first new-purchase task → the C235 task with its original final unchanged (`:19` → `:18`).
  - The unknown result of the old pickup click stays in the archive; the new task has nothing pending (tested).
- **Once only, before any slot or final:**
  - The old task must be a first-generation purchase task (`:26`); this makes the continuation single-use, and a repeat is refused (tested).
  - The old task must have no final, reference, accepted slot, dates, floors, refusals or rejections, and no slot or final in its history. Its pending step must be checkout or pickup selection, with the time limit passed and the step actually sent (`:26-28`). Each of these refusals is tested.
  - Because the old task never saw any dates, the new task's first view defines the first three dates; no old dates are carried over.
- **Real merchant expiry is required:** the program itself loads the checkout page in a separate probe tab and must see the session-expired marker on `/shop/sorry/session_expired` (`:38-41`). Root's earlier heading-only observation is not used.
- **No second Add:**
  - The new task is marked as already added (`:46`).
  - A shared job rule that R2 cannot change blocks the product, variant and empty-bag pages (`job.js:407`), on top of the existing rules (`:412`, `:462`); tested with the mutable flag cleared.
  - Two stable bag reads must show the same single item with no extras (`:43`).
- **Same controller, final stays separate:** the continuation moves on through the normal production controller and reaches REVIEW with one checkout and zero Adds (tested). The GUI sends `reopen-initial` with the checkout address but no final consent, and an address with a query string is refused (Python tests). Versions confirmed: `page-program.js:19` `C250-checkout-session-v1`, `r2-protocol.js:3` `C250-v1`.

## F1 — latent defect
- **What happens:** after a `clear` check, `executeOnce` now always calls `rememberPreflight(current)` (`checkout-runtime.mjs:93-96`). That function throws `DesktopPreflightSourceChanged` unless the task belongs to the current session (`:109`).
- **Which path breaks:** existing code still allows starting a purchase from a RETIRED task with no session or another session's id, and gives the purchase a new task id (`browser-session.mjs:48,50,73`; `job.js:239`; modelled at `desktop-c078-runtime.test.ts:11`). With orders enabled, which the production worker always uses (`native-purchase-worker.mjs:16`), that start now stops after the account check. Before C250 it continued.
- **Why it is not blocking:** the code stops before any merchant action, and the planned continuation is unaffected. I found no desktop code that writes a plain RETIRED task: `app.py` has no retire control, and desktop RETIRED copies are read-only archives.
- **Why the tests miss it:** every test with orders enabled uses a task from the current session or a sent final; the RETIRED tests run with orders disabled.
- **Second problem on the same path:** even without the throw, the memory would be keyed to the retired task's id, so later resumes would look up account orders again in the middle of checkout.
- **How to confirm:** I found this by reading only; the sheet's command limits ruled out running my own test. Codex can confirm it with the C078 test setup using `ordersEnabled:true` and a valid `clear` result: `advance()` should reject with `DesktopPreflightSourceChanged`.

## Other notes
1. **Before the final:** the final no longer triggers its own fresh account-list check, and the remembered check survives pause/resume. The memory is not tied to the account hash. This follows the C250 design; protection then rests on the check at the start of the session plus the person's "existing orders checked" confirmation and the existing review checks (`:171`).
2. **One continuation only:** another worker restart or expiry before this continuation finishes leaves the purchase blocked. There is no third generation, so nothing unsafe happens.
3. **Expiry probe dependency:** the continuation only works if the merchant still shows the expiry page for that checkout address when probed; otherwise it stops.
   - The probe's handling of the address and the meaning of that page path come from previously accepted code; I did not re-read them.
4. **Missing archive file:** there is still no fallback to the backup if the archive file is missing (carried over from C249). It is blocked, not unsafe.
5. **Session id guard:** `reopenBeforeSlots` lacks the explicit string session-id check that the new-purchase step has (`:31` vs `:52`). This is robustness only; production session ids are always strings.
6. **PRELAUNCH page:** this page is not in the new shared no-Add rule, but the already-added marker still blocks an Add there (`job.js:412`).
7. **Untested:** the continuation running in the browser executor (R2) end to end; the GUI reading the `canReopenInitialCheckout` flag (the Python tests set it directly); the worker's new Chinese error messages.
8. **Not reproduced:** I did not run Root's comparison against the old runtime (UNKNOWN / 3 lookups / 1 checkout / 0 finals); it was not in my command list. I also could not run git to check the diff against f86ee1d, but my fresh reads match the patch.

## Limits kept from earlier reviews
- Native order pages do not show quantity or pickup time.
- The empty-list and pagination behaviour of real Apple account pages is still unverified, and a `clear` check depends on it.
- Sign-in is ordinary and done by a person, with no password autofill.
- The first extension or native-host install or update needs a person.
- A missing reference from another session stays unknown.
- The historical C235 order is not resolved; its final is preserved and its cancellation is separate evidence.
- Root does all deployment and live work.

## Reads, honesty and caps
- **Read:**
  - C250 task, live evidence and verification.
  - All 10 listed files to the end.
  - The required excerpts (`app.py` 428-452 and 542-580, `job.js` 395-475, `page-program.js:19`, `r2-protocol.js` 1-4).
- **Extra reads for F1:** searches for `RETIRED` and `ordersEnabled:true` in the source and tests, and `checkout-c238-orders.test.ts` lines 33-44. Unchanged code otherwise relies on the C249 review.
- **Caps:** cost was about USD 2 of 10. I cannot check my own effort setting, elapsed time against the 1,200-second cap, or exact turn count; Root's structured record is authoritative.
- **Not done:** no edits, report files, private paths or transcripts, customer, browser or sign-in data, other agents, network use, deployment or publication. There were no permission denials and no tool errors.

Root verified structured model/provider/max, all required full/excerpt reads, commands, tests, cleanup and unchanged source. Usage is resumed-history aggregate; the reviewer cost estimate is not an independently measured invocation spend. Root reproduced F1 separately with no writes or merchant commands.
