# C-075 cross-review delivery report (reviewer: claude-opus-5-5, readonly)

**Verdict: DISAGREE.** I do not agree that the exact221 bounded software (SHA `6daa2592…a4a011`) is ready. The C074 change itself is correct. Two problems block agreement: F2 is a new path to a second buyer, and F1 is the finding C059 left unreported.

**Permission denial.** The required final manifest repeat ("Repeat manifest last") was denied: the Bash tool reported "running in don't ask mode". As the task requires, I did not retry it through another tool or path. The only manifest result I have is from the first run (command 1 below), so the post-review integrity check is **not done**.

## Findings

**F1 — the C059 unreported finding (final lookup in a rebound run, through ChromePort). Blocking.** I completed it from source read fresh in this session.
- **Where:** `web/checkout-connector/job.js:296-307` and `web/checkout-connector/chrome-port.js:114-131`.
- **When it happens:** the task has a pending `submitOrder` with `orderRefHash == null`, and a run has `readOnly == false` but `s.reconcileOnly == true`. Two runs qualify:
  - a rebind run (`control.js:159`: `authorized:!rebind`, default mode `'purchase'`);
  - a later Start or Resume of a task that was already rebound or exported.
- **What goes wrong:**
  - Only `readOnly` stops the lookup (`job.js:297`).
  - `job.js:301` takes the `orderRefHash` from whatever matching, verified receipt the replacement tab shows.
  - `chrome-port.js:125` then navigates the tab (`tabs.update`) with no `this.authorized` check.
  - `job.js:306` can then mark the task CONFIRMED_UNPAID.
- **Consequence:** a separate or manual order for the same Pro configuration could be credited as this task's unknown final. The task's own unknown final would stop being tracked (R07/R09). This also goes against the inherited C058 rule that a rebound port must not manufacture the old choice.
- **Not affected:** readonly `reconcile` mode is correctly blocked (c023 line 84).
- **Proposed acceptance test:** a rebound run with a pending `submitOrder` on a tab showing a matching verified receipt should:
  - end `NEEDS_VERIFICATION` with reason `final-result-unconfirmed`;
  - leave `orderRefHash` null;
  - make 0 `tabs.update` calls.

  In addition, `lookupOrder` on an unauthorized port should never navigate.

**F2 — restart still works on a record already handed to the desktop. Blocking.**
- **Where:** `web/checkout-connector/pre-final-restart.js:23-24`.
- **The gap:** the restart checks never look at `old.desktopHandoff`.
  - `exportDesktopHandoff` (`desktop-handoff.js:9`) keeps the record's state and its pending `chooseSlot`, adding only `reconcileOnly:true` and `desktopHandoff`.
  - So an exported, expired pre-final `chooseSlot` record still passes the restart checks.
  - `control.js:130` then starts a new extension buyer with `authorized:true`, while the desktop owns the imported copy.
- **Consequence:**
  - The message at `control.js:82` ("原插件购买权限已永久停止", "the original extension's purchase authority has been permanently stopped") becomes untrue.
  - The one-owner rule and the old buyer's permanent revocation are broken, so there is a risk of two buyers and two units (R07/R09).
  - Nothing in `web/`, `src/` or `test/` checks `desktopHandoff` during restart.
- **Narrower than my earlier draft:** I no longer propose rejecting every `reconcileOnly` record. `pre-final-restart.js:37` records `originalReconcileOnly`, which shows rebound records were meant to be restartable.
- **Proposed acceptance:** restart refuses any record carrying `desktopHandoff`, makes 0 writes and 0 reads, plus a test for that.

**F3 — the desktop final consent is not bound to the reviewed page. Latent.**
- `src/desktop/browser-session.mjs:32-35` builds the final grant as a `start:true` grant.
- For start grants, job.js skips documentId binding at REVIEW (around line 447) and relies on `entryDocumentId`/`termsUrl` (`chrome-port.js:34`).
- Nothing calls this for a real purchase today.
- **Proposed fix:** a non-start grant with `documentId: old.lastDocumentId`.

**Lower-severity notes:**
- **F4:** the tabId comparison at `browser-session.mjs:31` does not identify a browser context, because DesktopBrowserApi tab ids restart at 1. It fails closed later.
- **F5:** `page.evaluate` runs in the main world, so there is a race between the documentId check and the evaluate. The `expected` check backstops it.
- **F6:** in the `finally` of `contained_child.py`, if `terminate_tree` raises, `done` is never set. app.py's wait could then block the Tk thread and leave `busy` stuck.
- **F7:** Playwright is loaded from the Codex runtime under the home directory, not bundled with the project.
- **F8:** after a crash, a stale owner lease file needs manual recovery. It fails closed.
- **F9:** the C074 guard only looks for final facts, so other unknowns nested in history pass. Desktop RETIRED records cannot be reached in production today.
- **F10 (task sheet text):**
  - it says "exact205/203" under an exact221 header;
  - entries 24 (C-065) and 32 (C-067) are listed twice;
  - "C061 … exact203".

**What holds up:**
- The C074 guard (`browser-session.mjs:9-15,28`) rejects every listed case, including cyclic and overflowing history, before any browser read or record write.
- Final reconciliation in the record's own desktop context is preserved.
- Importing a handoff cannot raise authority.
- The public probe cannot Add.
- C064 Add-error recovery is guarded: readonly and rebound runs make 0 bag reads, and a forged port proof is rejected.
- C062 only changes how a missing `acceptedSlot` is handled.
- C060's negative cases, pause handling, changed-record check, empty-bag requirement and successor creation all behave as described. The F2 gap is the exception.

## Commands, run separately, no pipes or redirects
1. **Manifest:** `{"ok": true, "files": 221, "sha256": "6daa25920b71acaa586a70d69559e10e6c001f182e0b36bd6d00d2a79da4a011", "mismatches": []}`. The final repeat was **denied** (see above).
2. **Python:** "Ran 6 tests in 0.399s OK".
3. **Targeted node tests:** tests 129, pass 129, fail 0, about 439 ms.
4. **Full node suite:** exit code 0. The dot reporter prints no summary, so the 1391 figure is my count of the dots (69×20+11).
5. **c064:** 4 PASS. Cleanup closed 4 contexts, browser and server, no errors.
6. **c060:** 2 PASS. Cleanup closed 2 contexts, browser and server, no errors.
7. **c051:** 3 pass. Cleanup closed 3 contexts, browser and server.
8. **c050:** 9 pass. Cleanup closed 9 contexts, browser and server.
9. **c040:** 8 PASS. The 127.0.0.2 guard aborted; 56 requests allowed, 1 blocked. Cleanup closed 8 contexts, browser and server, no errors.
10. **c069:** 7 PASS. Cleanup closed 7 contexts and the browser, no errors.

I checked how every native script isolates itself before running it: loopback-only routes, a self-check fixture, and WebSockets closed.

**Run-order discrepancy:** command 4 ran in the background at the same time as commands 5–7.

## Gaps, caps and history
- **Not read to the end of file:**
  - tests: `checkout-c054-calendar`, `checkout-c058-recovery-repro`, `checkout-c058-author`, `checkout-r1-public-configuration` (all four ran green, but I did not inspect them);
  - manifests: C-058-output, C-060, C-062, C-066 and C-072;
  - `page-program.js`.

  Because of these gaps, I can't confirm that every one of the 97 required reads was completed.
- **Not done:** no UI controls were used (as the task directs). CLAUDE.md was not re-read with the Read tool; I relied on the copy already in context.
- **Budget:** about $4.85 of $15 spent. I can't measure the exact turn count or wall time, so I can't confirm the 128-turn / 1800-second limits were met.
- **Earlier runs:**
  - C056 skipped the date-repro read.
  - C058 reported 63 turns while the CLI reported 48.
  - C059 ran out of quota at 868 s and its report was never delivered.
  - C073 was interrupted by Root, not by quota.
  - My own previous C-073 call ended without a report.
- **What I did not do:** no writes or edits, no private, authentication or transcript reads, and no agents, Apple, Chrome-profile or network access. The only permission denial was the final manifest repeat.

## R01–R10 mapping
| Requirement | Status |
|---|---|
| R01 | Plan fixed to one Pro, 9999, Dalian, which holds. |
| R02, R03, R10 | Not changed by this delta. |
| R04, R05 | C062/C064 do not regress them. |
| R06 | F1 means an unknown final can be resolved from another order's evidence. |
| R07, R09 | **Fail**, because of F1 and F2. |
| R08 | Pause and stop handling hold up. |

## Evidence boundary
Every test and native result in this review used fake loopback fixtures; none is Apple behaviour. The real Apple facts come only from Codex's earlier documents, which I did not reproduce:
- C-072 public probe: VALIDATED / VARIANT / 9999 / mjt74ch, `addSent:false`.
- C-064 live evidence and C-069 public evidence.

C-074 records `realProgrammeUnpaidOrderVerified:false` and `accepted:false`. I am not approving acceptance; Root must reproduce F1 and F2 itself.

## Suggested next steps for Codex (C068 priorities)
1. Fix F2.
2. Fix F1.
3. Then:
   - give desktop final consent a grant bound to the reviewed page;
   - give browser contexts a lasting identity;
   - add owner-lease recovery;
   - bundle Playwright;
   - make sure `contained_child.py` always sets `done`.

No real desktop purchase adapter or ledger migration exists today.
