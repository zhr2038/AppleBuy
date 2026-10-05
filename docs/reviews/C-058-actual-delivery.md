# C-058 delivery report: recovery guards

All three fixes are in and the tests pass. Root's reproduction went from 1 pass / 4 fail before repair to 5/5 after. My 20 new tests, the full suite and the three loopback-only native scripts also pass.

There is one design conflict Root needs to rule on. An old protected test expects a human rebind to accept a slot acceptance that the port itself reports (details under fix 1). Codex owns acceptance; I am not claiming it, or any live, installed, unpaid, Duo or full-goal readiness.

## Changed files
| File | Change |
|---|---|
| `web/checkout-connector/chrome-port.js` | Lines 11–13: only a purchase-mode port takes the stored slot choice. Lines 15–17: new `detachStoredChoice()`. |
| `web/checkout-connector/job.js` | Line 12: header note. Lines 226–228: read-only and rebound runs detach the port's stored choice. Lines 309–311: a refusal is recorded only in the originating purchase run. |
| `web/checkout-connector/closed-checkout-probe.js` | Line 28: the competing-checkout check now matches `^/shop/checkout(/|$)`, case-insensitive. |
| `web/checkout-connector/task-diagnostic.js` | Lines 13–33: new bounded nested check. `priorSlotOrFinalPresent` now comes from it. |
| `test/checkout-c058-author.test.ts` | New: 20 tests, all with fake API, store, clock and pages. |

`control.js` is unchanged. No HTML, manifest, package, permission or hook files were touched, and no old test, fixture or assertion was altered.

Running native command 7 also wrote its own artifact, `.local/c040-native-order/2026-10-05T13-28-32-457Z/result.json`. I did not read it.

## Design decisions
**Fix 1: an old slot choice is never acknowledged from another context.** This works at three levels:
- **Port setup:** an observe-only port never takes the stored choice. This fixes Root test 1.
- **Run context:** when a run is read-only, a human rebind, or any later run of a rebound task, the job tells the port to drop its stored choice and stored accepted slot. That covers the port `control.js` builds for a rebind (unauthorized, but purchase mode, with the old pending). It also covers a later authorized Resume of a rebound task. In all of these the pending choice stays unknown and the accepted slot stays empty.
- **Refusals:** a refusal shown to a read-only or rebound run is not recorded. Otherwise it would clear the pending choice, add a refusal and advance the date.

**Why there is no job-level guard on acceptance (needs Root's decision):** I first added one. The full suite then failed the protected test `R1 explicit human tab rebind…` (`test/checkout-r1-public-configuration.test.ts:230-239`). That test expects a rebind to accept a verified slot acceptance reported by a synthetic port.
- I may not change that test, so I moved the protection to where the false acknowledgement was manufactured: the port's stored choice.
- As a result, the real ChromePort can no longer produce that acknowledgement in a read-only or rebound run, but a custom port that reports acceptance itself still can.
- Root should decide whether that old contract should remain.

**Fix 2: competing checkout.** The pattern accepts both address forms the address guard allows (`/shop/checkout` and `/shop/checkout/`). It also blocks deeper paths and other letter cases, which only ever stops the probe. The check runs before any read, write or action. A failed tab query still stops as unknown. Tabs whose address Chrome doesn't disclose stay unknown, and nothing claims that no other checkout exists.

**Fix 3: nested legacy final.** The retired chain is now walked to any depth, with limits of 50 entries per list and 200 records in total.
- **Yes (`true`):** any accepted slot, any final intent, or a pending `chooseSlot`/`submitOrder` anywhere in the chain. I also count a `final-not-dispatched` history event as proof of an earlier final; that rule is my own addition.
- **No (`false`):** only when the whole finite chain was read and every record is a clean, well-formed retired record.
- **Unknown (`null`):** a malformed, cyclic, repeated or over-limit chain. This field can now be `null`.
- The output is still only a boolean or `null`. No IDs, references, hashes, URLs, contact details or history values are shown, and nothing is sent to the website.

## Test results (each command run separately)
| Command | Result |
|---|---|
| 1. manifest check, before editing | ok, 197 files (run before the context reset) |
| 2. Root repro, before repair | 5 tests, 1 pass, 4 fail (matches Root) |
| 2. Root repro, after repair | 5/5 pass |
| 3. author tests | 19/19 first run, 19/19 after a title fix, 20/20 final |
| 4. full suite, first run | 1 failure: R1:235 (above) |
| 4. full suite, final run | 1332 pass, 0 fail (1307 before + 5 Root + 20 author) |
| 5. `c051-native-contact-repro` | 3/3 pass; cleanup: 3 browser contexts, browser and server closed, no errors |
| 6. `c050-native-dates` | 9/9 pass; cleanup: 9 contexts, browser and server closed, no errors |
| 7. `c040-native-order` | 8/8 pass; alternate-loopback guard aborted; 56 requests allowed, 1 blocked; cleanup: 8 contexts closed, no errors |

**Not run:**
- The manifest check after editing (allowed only before editing).
- `test/c048-native-bag.mjs` and the `review/*.mjs` native scripts (not on the allowed list).
- `git status`/`git diff`.
- Anything live.

## Reading coverage
- **Read in full after the context reset:** the four edited production files, `job.js`, `control.js`, the chrome-port, c051, c040-recovery, c021 (test and review), c055 and r1 test files, and all three native scripts.
- **Read before the context reset, not re-read after it:** the task sheet, the findings, Root's repro test, the manifest and `requirements.md`. Afterwards I only searched `requirements.md` for the R01–R10 rows.
- **Not read in this session:** `test/checkout-c054-date-repro.test.ts`, which is outside C-058's scope. Root's finding stands: my C056 report wrongly claimed it had been freshly read.

## R01–R10 mapping
- **R04, R06, R08:** an old choice stays pending/unknown in read-only and rebound contexts; rebound tasks stay permanently read-only.
- **R05:** refusals are recorded only for the context that sent the choice.
- **R06, R10:** the diagnostic now reports yes/no/unknown, with the same privacy limits.
- **R07:** both checkout address forms block a second recovery checkout.
- **R09:** everything here is fake; there was no Apple request.
- **R01–R03:** unchanged.

## Known limitations
- **Behaviour change:** a same-tab read-only check no longer acknowledges a pending slot. Only the original purchase Resume can, and that run is blocked once the task window has expired. So an expired task's old slot now stays unknown.
- The probe only sees tabs whose address Chrome discloses. `/shop/signIn` tabs are not treated as competing checkouts.
- Deferred non-blocking items (refusal count 6, probe display, comments) were not addressed, and C057 was not started.

**Evidence boundary:** all checks used fake API, store, clock and pages, or owned loopback pages. No Apple behaviour, product code (SKU), slot capacity, hold or "no order exists" claim was made or used.

**Errors, denials and budget:** no permission denials. The only error was the intermediate R1 failure, fixed by the redesign above without changing any assertion. About $5.0 of the $10 budget was used.

**Checkpoint:** repair complete, nothing committed. Next is Root's independent inspection, a fresh output manifest, and the decision on the R1 rebind contract.
