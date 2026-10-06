# C-138 review: bounded AGREE for the C137 late-Add hydration change

**Verdict: bounded AGREE.** I found no purchase-safety defect in the new branch. The verdict covers only `job.js:381-386` within the 287-file candidate (`fe999e77…1eed8e`), checked with FAKE fixtures. Both allowed commands passed: 23/23 focused tests, then 108 focused, 54 Python and 1526/1526 full Node tests, with the manifest verified before and after.

## What the new branch does (`job.js:381-386`)
- **When it runs:** only when all of these hold:
  - there is no pending action, and the run is not read-only or reconcile-only;
  - the phase is not a stop, PROCESSING or unprepared PRELAUNCH page;
  - the phase is `ENTRY`, the bag addition has not started, and `extrasConflict` is not true (line 374);
  - there is no next choice (`next` is falsy);
  - `continueAvailable!==true` and `configuration.complete===true`.
- **What it does:** it only waits and re-reads the page. It sends nothing, never forces a control and never invents Add.
- **How long it waits:** it uses the existing `poll(this.hydrationMs)`. That is a 3000 ms episode, an absolute cap of 2000 polls per run, and 50 ms between reads. Polling does not use up steps, and the episode timer only resets after a non-polling iteration (lines 258-260).
- **Checks on every re-read:** each re-read runs the full loop again. That includes the expiry, stop and pause checks (lines 263-265), the sequence number must increase (line 274), the pause/stop re-check after saving (line 276), and the start-grant check (line 277).
- **After the page becomes VARIANT, the existing chain is unchanged:**
  - wait while the product form is loading;
  - `variantVerified` must be true, with a finite, positive price of at most ¥9,999;
  - a fresh bag read (`readBag`): a separate inactive tab, two identical verified reads, a newer sequence number and a different document;
  - then exactly one `addBag`, recorded durably as started before it is sent (line 479).
- **The Add is tied to the current page:** `ChromePort.act` requires the same document ID as the last read, and the peer requires `command.expected === JSON.stringify(state.last.page)`. The bag read uses its own tab, so it never replaces the main tab's last page.
- **Stopped cases stay stopped:**
  - extras conflict → BLOCKED (line 374);
  - PRELAUNCH that cannot be prepared → NOT_RELEASED (line 367);
  - price over the cap → BLOCKED (line 393);
  - a control that never appears → NOT_READY "official-continue-disabled; availability not established". It never reports this as no stock (R06).

## Non-blocking notes (none affects purchase safety)
- **N1, test strength.** Test 2 (the `forever` case) also passes on the old code, which returned NOT_READY immediately with the same reason. It does not prove that any polling happened. Its 3151 ms runtime suggests the 3 s bound was reached, but nothing asserts that. Suggested acceptance: also assert `f.reads() > 2`, or an elapsed time of at least about 3000 ms. Test 1 (reads > 2, reaches REVIEW) and test 5 (BLOCKED, where the old code gave NOT_READY) do tell the old and new code apart. That matches Codex's "2 of 5 failed before the repair".
- **N2, whether it works on the real site.** I have not verified this.
  - The real ENTRY-to-VARIANT delay was never measured. The live 286 programme only saw VARIANT "later", during a separate read-only observation.
  - I did not check that `page-program.js` sets `configuration.complete===true` in that real state, because the file was not on the read list. Its hash `f96efbb7…` is the one in this manifest.
  - If either assumption fails, the result is the old safe stop, NOT_READY, which needs an explicit resume.
- **N3, shared wait budget.** The episode timer carries across ENTRY polling and any VARIANT `productFormLoading` polling that follows. Together they get one 3 s budget, so a slow Add control plus a slow form can still end NOT_READY ("product-form-not-ready"). This is a timing limit that stops safely, not a risk.
- **N4, cases the tests don't cover.** None of these is a safety gap, because the code paths are shared and I checked them by reading the code:
  - pause or stop during the new poll;
  - an extras conflict that appears only after hydration (the same line 374 applies);
  - ENTRY that later shows `continueAvailable===true`, which would send `continueProduct` as the code already did before this change.

## C136 residuals: unchanged, not fixed
C136-1 (closing during startup), C136-2 (broad read-error labels), C136-3 (one in-flight attempt can overrun the wall-time bound) and C136-4 (missing probes) are unchanged. `checkout-runtime.mjs` still has hash `dd7a5a6b…`, and lines 39 and 122-130 read the same as in C136.

## R01–R10 mapping
| ID | Effect of this change |
| --- | --- |
| R01 | Plan and ¥9,999 cap unchanged; the cap is enforced after hydration (test 5). |
| R02 | No effect on preflight. |
| R03 | Removes one manual resume within the normal flow: it only re-reads, with no forced control and no full-page refresh. |
| R04, R05 | Slot code untouched; not reviewed. |
| R06 | A control that never appears gives "availability not established", never no stock. |
| R07 | Still exactly one Add (`bagAddStarted` is durable; test 1 counts one addBag and one checkout). |
| R08 | Pause and stop are checked on every polled iteration (by reading the code; no C137 test). |
| R09 | FAKE only. |
| R10 | No UI change. |

## Commands and results
Both were run once each, in the foreground, in order, exactly as written in the sheet.
1. `node --test test/desktop-c137-late-add.test.ts test/desktop-c135-initial-loading.test.ts test/desktop-c121-native-checkout.test.ts` → 23 tests, 23 pass, 0 fail (11 C121, 7 C135, 5 C137), about 4.0 s.
2. `python -B tools/delegation/run_review_checks.py docs/reviews/C-137-candidate-manifest.json`:
   - check 1: manifest ok, 287 files, `fe999e77…1eed8e`, no mismatches;
   - check 2: 108/108 focused tests;
   - check 3: 54 Python tests, no failures, errors or skips;
   - check 4: 1526/1526 full Node tests;
   - check 5: manifest ok again;
   - every check reported owned-process cleanup confirmed, and the overall result was `passed: true`.

**Not run:** any real Chrome, Apple or live-worker test; the speed benchmark; `git diff`. I did not compare the 287-file map against C-135 myself. The claim that `job.js` is the only production change comes from the sheet and Codex's verification record.

## Real evidence vs. FAKE fixtures
- **Live behaviour is from the old 286 runtime** (`3b714ebc…`): ENTRY, then VARIANT, resume, BAG, then AUTH, as reported by Codex. Codex's record says the new patch has not been verified live.
- **The C137 tests are FAKE.** They alter page results at the fixture Chrome layer, so the real peer's key and privacy checks still run on the altered page.
- **I make no claim** for the whole 287-file candidate, the deployed or paused worker, the full one-click GUI, the account, refusal, hold, the order, speed or the goal.

## Disclosures
- **Changed files:** none. I wrote no memory and made no edits.
- **Errors and denials:** none, and no tool errors.
- **Read gaps:** none. All 15 listed files were read fresh to the end after compaction; `job.js` in two parts (lines 1-424 and 425-508). I issued the file reads as parallel Read-tool batches; only the two commands ran in the shell, one after the other.
- **Not accessed:** `.local`, ledger, profile, home, Chrome and Apple.
- **Model:** this session reports `claude-opus-5-5`. I cannot verify the xhigh effort level from inside, so root should check `modelUsage`.
- **Spend:** the displayed counter read about $1.79 of $5 after command 2. That figure is the history aggregate, not this round's spend.
- **Turns and time:** I estimate about 9 tool turns. I cannot measure wall time against the 900 s cap from inside, so root should check it.

**Checkpoint:** C-138 is finished. If a re-run is needed, repeat the 15 fresh reads and then the two exact commands, with no other actions.