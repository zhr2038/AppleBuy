Actual terminal C077 report for the old exact222 source. Verdict DISAGREE; no acceptance. Codex subsequently reproduced6 negatives and repairs N1 in C078.

# C-077 cross-review report (reviewer: claude-opus-5-5, read-only)

**Verdict: DISAGREE.** I do not agree that the exact222 bounded software (manifest `C-076-candidate-manifest.json`, SHA `77dddf6f…d93e82`) is ready. The five fixes (F1, F2, F3, F4, F6) are correct as implemented. One new blocking problem, N1, means the "permanent revocation" of the old extension after a desktop handoff can still be undone. I am not approving live use or the whole goal. Root's final acceptance and an actual unpaid Pro order are separate from this review and still open.

## N1 — after handoff, the extension can become a buyer again (blocking)

**Where:**
- `web/checkout-connector/control.js:201`, `:211-219`, `:35`, `:159`
- `web/checkout-connector/job.js:122-126`, `:165-186`, `:206-208`
- `web/checkout-connector/desktop-handoff.js:6-9`
- `web/checkout-connector/pre-final-restart.js:22`

**What triggers it.** There are two ways in, and both use only ordinary UI actions:

- **(a) Retire after export.** Start from a resolved bag-only task (one verified item in the bag, no slot, final or unknown fact, clean history). The user exports it, so it gains `reconcileOnly:true` plus `desktopHandoff`, and then clicks Retire.
  1. `control.js:201` sees `reconcileOnly` and calls `finishReadOnlyBag` → `job.retireReadOnlyBag`.
  2. `resolvedReadOnlyBag` (`job.js:122-126`) never checks `desktopHandoff`, so the record becomes `RETIRED` with `readOnlyRetirement` (`job.js:183`).
  3. The status text at `control.js:217` then tells the user to re-check and confirm a new purchase.
  4. Prepare (`control.js:35`) issues a new task ID, because the previous record is `RETIRED`.
  5. Start reaches `job.js:206`, which creates a fresh successor. The guard at `job.js:208` passes because the record is resolved, the ID is new and the grant is new.
  6. The port is created with `authorized:true` (`control.js:159`). The C037 flow then checks out the bag item, and the final button (`control.js:229`) is allowed, because the successor has no `reconcileOnly`.
- **(b) Export of a record that is already RETIRED.** `desktop-handoff.js:6` accepts any valid Pro record, whatever its state. Start then goes straight to the fresh successor at `job.js:206`. The guard at `:208` does not apply when the record was retired the ordinary way (no `readOnlyRetirement`).
- **Follow-on gap.** In the successor, `desktopHandoff` survives only inside `retiredHistory`. The F2 guard (`pre-final-restart.js:22`) checks only the top level, so restart is no longer blocked either.

**Consequences:**
- The export message "原插件购买权限已永久停止" (`control.js:82`, "the original extension's purchase authority has been permanently stopped") becomes untrue.
- The extension can submit an order while the desktop holds an imported copy of the ledger that no longer matches. This breaks R07/R09 and the one-owner ledger.
- **Second buyer:** today `browser-session.mjs:29` blocks every imported `reconcileOnly` record, so the desktop cannot also buy. Once Root adds a way for the desktop to buy from an imported record (and every import is `reconcileOnly`), two buyers could produce two units.
- **The current legacy record is not exposed**, going by the public C-060/C-064 docs (I read no private ledger):
  - (a) cannot happen: the record's `retiredHistory` holds an archived pending `chooseSlot`, so `resolvedReadOnlyBag` is false;
  - (b) cannot happen: the record is not `RETIRED`.

**Repro:** traced from source only and re-verified after compaction. It was not executed, because I had no Write access and no extra commands were authorized. A suggested test using the `checkout-c060-control.test.ts` VM harness:
1. Seed a resolved bag-only record, check `handoffConfirm` and click `exportDesktop`.
2. Click `retire`, with the fake port returning a verified BAG holding one matching item.
3. Click `prepare`, check `approve`, then click `start`.
4. Today, expect an authorized successor and merchant commands such as `openBag`/`checkout`. After the fix, expect 0 commands and 0 writes after export.
5. Repeat with a `RETIRED` record exported and then started.

**Acceptance criteria:**
1. `retireReadOnlyBag` and the retire handler refuse any record that has `desktopHandoff` at the top level or anywhere in `retiredHistory`: 0 reads, 0 writes, no `RETIRED`.
2. `job.run` refuses a fresh successor from a `RETIRED` record whose chain carries `desktopHandoff`, and does so before any port call or write.
3. Export refuses `RETIRED` records, or marks them as permanently unable to have a successor.
4. `pre-final-restart.js:22` also checks nested history (defence in depth).
5. The existing C030/C034/C037/C060 successor flows for records that were never handed off still pass.

## How the fixes hold up
- **F1 — correct.** `job.js:297` blocks any `readOnly` or `reconcileOnly` run before receipt adoption or lookup, whatever the port mode.
  - I accept Root's refinement at `chrome-port.js:117`: an unauthorized purchase-mode port cannot navigate, while an explicit observe port with an already-bound reference is the inherited read-only C023 lookup.
  - No production path reaches an observe-port lookup inside a reconcileOnly or rebound run.
  - Low residual, existing before this change: `job.js:301` adopts a receipt reference on `purchaseMatches` alone, but only in the authorized original run.
- **F2 — correct at the top level only.** The nested gap above is reachable only through N1.
- **F3 — correct.** `browser-session.mjs:35-36` makes a non-start grant bound to `documentId`, aged at most 60 s and owned by this desktop context; `job.js:447` enforces it.
- **F4 — correct.** `browser-session.mjs:30` blocks a record from another context that is not `RETIRED`.
  - Limitation: `sessionId` lasts only as long as the process. After a desktop crash, the desktop cannot reconcile its own unknown final. This fails closed.
- **F6 — correct.** `done` is always set. If cleanup fails, `busy` is held and the run is reported as unresolved.
  - Minor: if stop times out (3 s + 5 s), `busy` stays set until the app restarts. This fails closed.
- **Still open from C-075 (lower severity):**
  - F5: command/document race at `browser-api.mjs:65-69`.
  - F7: Playwright is loaded from the Codex runtime in the home directory.
  - F8: a stale owner lease after a crash.
  - F9: unknowns other than final facts nested in history.

## Commands
All commands ran separately, in the foreground and in order, with no pipes, filters or redirects, and none was denied.

| # | Command | Result |
|---|---|---|
| 1 | manifest check (C-076) | ok, 222 files, expected SHA, no mismatches |
| 2 | Python desktop tests | passed |
| 3 | targeted node tests (incl. c076 repro, c023 review) | passed |
| 4 | full node suite (dot reporter) | passed, exit 0 |
| 5 | c064 native | passed, reported own cleanup |
| 6 | c060 native | passed, reported own cleanup |
| 7 | c051 native | passed, reported own cleanup |
| 8 | c050 native | passed, reported own cleanup |
| 9 | c040 native | passed, reported own cleanup |
| 10 | c069 native | passed, reported own cleanup |
| final | command 1 repeated exactly, last | ok, 222 files, SHA `77dddf6f…d93e82`, no mismatches |

- **Missing counts:** the context was compacted partway through the review. The exact per-command test counts and cleanup lines were in the part that was compacted, and I am not reproducing them from memory. I did not re-run anything to recover them, because the task allows each command once plus the final repeat.
- **Native scripts:** I checked each script's isolation in source before running it. Each runs on loopback with owned fixtures.
- **Leftover files:** the native scripts write result files under `.local/`. I did not read them (not allowed) and did not delete them (no Write). Root owns them.
- **Processes:** no background processes or agents were started.

## Reading, gaps, caps and limitations
- **EOF reads:** I read all 101 unique required entries to their current EOF in this session. Because of the compaction, my record of the files read earlier is a summary, not the text itself. Root should treat it as my attestation.
  - Read before compaction: page-program.js (to EOF at line 618), all production modules, the c055/c056/c023/c058/r1/calendar tests, the native scripts, requirements and the docs from C-053 to C-070, AGENTS.md and CLAUDE.md.
  - Read after compaction:
    - C-071 task and C-072 verification;
    - C-073 and C-075 tasks;
    - C-074 verification, C-075 actual review and verification, C-076 verification, the C-077 task;
    - the c054 date and r1 tests, plus the c060-prefinal, c060-control, c062, c064 and c017 tests;
    - the C-074, C-072, C-060, C-062 and C-066 manifests.

  I also re-read the N1 and F1–F4 lines after compaction.
- **Not done:** the N1 repro was not executed. I did not run the live public probe, use the GUI, browser or account, read private, ledger, transcript or `.local` files, write anything, use agents or the network, or publish.
- **Caps:** the harness USD counter showed about $6.85 of $15 at the last check. It may include session history, so I don't claim it as this review's spend. I cannot measure the turn count or wall time, so I cannot confirm the 144-turn / 1800-second limits. I also cannot observe the model, provider or effort setting myself.
- **Changed files:** none.

## R01–R10 mapping
| Requirement | Status |
|---|---|
| R01 | Plan stays fixed to one Pro 256GB black, ¥9999 cap, Dalian, pickup: held |
| R02, R03, R10 | Not changed by this delta |
| R04, R05 | No regression from C062/C064; checked in tests and source |
| R06 | Unknown-final handling is fixed by F1/F3 |
| R07, R09 | **Fail** because of N1 (no one-owner guarantee after handoff) |
| R08 | Pause, stop and cleanup handling hold up; F6 fails closed |

## Evidence boundary
Every result in this review used FAKE loopback fixtures; none of it is Apple behaviour. The only real Apple facts come from Codex's earlier documents, which I did not reproduce:
- the C-072 public probe: VALIDATED / VARIANT / ¥9999 / `mjt74ch`, no Add sent;
- the C-064 live evidence and the C-069 public evidence.

C-076 records `actualProgrammeUnpaidOrderVerified:false` and `accepted:false`.

## Checkpoint
C-077 is finished with DISAGREE on N1. Next steps are for Root:
1. Reproduce N1 using the test sketch above.
2. Fix it per the acceptance criteria and issue a new exact manifest and task.
3. A re-review then needs the delta, the N1 tests and regression checks of the C030/C034/C037/C060/C076 paths.
