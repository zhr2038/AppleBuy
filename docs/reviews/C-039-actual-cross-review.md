The reads are done; here is the review report.

# C-039 cross-review: delivery report

**Overall verdict: AGREE on all six items, within the stated bounds.** I found nothing blocking, but there are six non-blocking notes (F1–F6). This is a review, not acceptance: it does not approve main, Apple behaviour, speed or one-start readiness. For my own `job.js` change it is a same-author consistency check only, not self-approval.

## Verdicts

| Item | Verdict | Basis |
|---|---|---|
| Exact 173-file identity and bounded scope | **AGREE** | Command 1 passed: 173 files, SHA `832c8404…a00cf`, no mismatches. The only changed base source is `job.js`; the new files are the navigation test and `c039-native-pipeline.mjs`. Both are labelled FAKE and end at UNKNOWN with no acceptance, hold or order claim. |
| Fresh full read coverage | **AGREE** (one caveat below) | Every required file was read in full during this task. The session hit an automatic context compaction partway through. |
| Commands, results and cleanup | **AGREE** | All four commands ran. One mistake on command 4 is disclosed below. |
| Reproduction and acceptance fixes | **AGREE** | Root's two fixture fixes are correct, and all seven assertions are unchanged. |
| Error, denied, unrun and cap disclosures | **AGREE** | The C-038-R1 quota, the denied Write and the unrun tests are recorded accurately in the project records. This task's own deviations are listed below. |
| Author distinctions | **AGREE** | Root wrote `c039-native-pipeline.mjs` and the two fixture fixes: cross-author review by me. I wrote the `job.js` repair and the seven original tests: same-author check only, with Root's independent runs as the cross-check. |

## Commands run

1. `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-039-candidate-manifest.json`: OK, 173 files, SHA matches, no mismatches.
2. `node --test test/checkout-c038-navigation.test.ts`: 7/7 passed.
3. `node test/c039-native-pipeline.mjs`: 8/8 passed.
   - Cleanup: 8 browser contexts closed, browser closed, server closed, no errors.
   - Side effects of this approved command:
     - It wrote a new result file under `.local/reviewer/c039-native-<timestamp>/`. I did not read it.
     - It loads Playwright from the Codex runtime cache in the home folder.
     - It starts the installed Chrome program headless with a temporary profile, not the personal profile or extension.
4. `node --test --test-reporter=dot "test/*.test.ts" "review/*.test.ts"`
   - **Deviation:** I first ran it piped through `| tail -n 15`. That is a pipe outside the exact allowed form, and the output had no counts.
   - I then ran the exact command once. It printed only dots, with no failure markers and no failure section.
   - I did not count the dots exactly. The result is consistent with Root's 943/943, but it is not an independent numeric confirmation.

**Coverage caveat:**
- After the compaction I re-read in full: `job.js` lines 25–377 (lines 1–24 were read before the compaction), `page-program.js` lines 1–497 (the whole file, no gaps), the C-036 pickup evidence, `c039-native-pipeline.mjs`, and the matching lines of `chrome-port.js`.
- The remaining required files were read in full before the compaction. I now know them only through my own working summary.
- I did not read the private transcript.

## Review of Root's native integration (cross-author)

- **No skipped steps in the successful journeys.** The test runs the real `merchantDocument` source against native page markup; no decoded results are canned.
  - Its assertions require an `openProduct` or `openBag` command, exactly 2 side-tab bag reads (1 tab opened, 1 closed), at least 2 order-summary opens with matching closes, and exactly one each of store, date (`4`), time (`21:15 – 21:30`) and Continue.
  - When starting from an existing matching bag item, it requires zero Add to Bag.
- **Failure cases.** The wrong-item bag and two-item bag stop as BLOCKED. 150 failed side reads stop as NEEDS_VERIFICATION with nothing added. A missing secure8 permission stops as NEEDS_USER before anything is done on the new host. In every failure case: no store selection, no time selection, no Continue.
- **Late slot result.** The read after Continue is made to fail. The job keeps a pending `chooseSlot` as NEEDS_VERIFICATION. A restart on the same saved state does nothing new: the action counts are identical.
- **Cleanup is real.** Each scenario closes its browser context in a `finally` block; the browser and server are closed at the end; the run is marked failed if any context remains or cleanup reports an error. Requests to any other origin are aborted and websockets are closed; the record shows 0 blocked requests, meaning nothing else was attempted.

**Non-blocking notes:**
- **F1 – the success check is broader than it needs to be.** All successful scenarios accept either `slot-result-unconfirmed` or `observation-transport-failed` as the final reason. Only the late-slot scenario's first run needs the second reason, because `chooseSlot` is deliberately excluded from read retry. Both outcomes are safe, but a check per scenario would catch more.
- **F2 – page loading is simplified.**
  - The fake `tabs.get` waits for the page to load and always reports `complete`, and `tabs.update` waits for navigation. So ChromePort's real loading-state polling is never exercised.
  - The navigation read loss is one injected error, not a real Chrome error.
  - An outdated document ID comes back as an error field rather than a rejected call. ChromePort treats both as failure (`chrome-port.js:17,43,58,80`), so the outcome is the same.
- **F3 – fixture markup differs from the observed pages.** All of these are covered by the "FAKE/invented" labels:
  - `<main>` is used instead of the observed DIV with role=main;
  - the bag list lacks the observed class, has a single quantity selector, and has a single 结账 button instead of the observed header/bottom pair;
  - the product page, accessories page and accessories URL are invented;
  - opening the summary makes the main area inert, which was not observed;
  - the time-slot heading text is invented.

  The date start state matters most. The fixture checks day 6 first, citing the "normally observed third-day property". But in C-036 that day-6 state came after the person clicked October 5 and October 6, and the saved attribute stayed on day 4. It is therefore not an observed starting state. It is the cautious choice, since it forces a `selectDate` step, but it must not be cited as Apple's starting-date behaviour.
- **F4 – late-failure coverage is limited.** There is no real processing delay. The restart passes no authorization, so reuse of a revoked authorization is not tested here.
- **F5 – what the test actually uses.** It runs the installed Chrome program with a temporary profile, not the personal one. Network isolation is shown only by the absence of attempts (0 blocked).
- **F6 – possible timing dependence.** The navigation-loss scenario assumes the fake Add to Bag counter is updated before the next main read. If not, the test would fail falsely; it could not pass falsely. It passed in my single run.

## Same-author consistency check of my `job.js` repair (`job.js:20, 179–183`)

The read-failure handling runs in this order: permission error stops at once, then the retry condition, then the stop.

**Retry is limited to all of these together:**
- not a read-only run;
- a delivered pending action;
- one of `openProduct`, `openBag`, `addBag`, `viewBag` or `checkout`;
- before the action's 8-second deadline;
- within the existing wait limits (per-wait time limit and total wait count).

**Behaviour against each requirement:**

| Requirement | How the code meets it |
|---|---|
| Never resend a write | Every branch of the pending-action block ends in `continue` or `return`, so `port.act` is reachable only when nothing is pending. |
| Pause and stop | The checks at the top of the loop stop the run before any read. |
| Expired authorization | Rechecked after each successful read (`job.js:187`). |
| Outdated reads | Still stopped by the sequence check (`job.js:184`). |
| Slot and final order | `chooseSlot` and `submitOrder` are excluded. |
| Undelivered pending action | Stops immediately. |

**Minor gaps:**
- retries leave no history entry;
- any read error, not just a navigation one, is retried until the deadline. It stays bounded and read-only.

No change is needed. Root's independent tests and the composed native scenario both exercise this repair.

## Disclosures and limits

- **Historical (C-038-R1):**
  - My Write to `review/browser-c038-main-chain.mjs` was denied by permission settings. I have not retried it or read its rejected input, and it was not accepted.
  - That session then hit provider quota at 1211.91 s and 24 turns. It produced no report and ran no tests.
  - My original navigation tests 1 and 2 had wrong fake page scripts; Root corrected them.
- **This task:**
  - The command 4 pipe deviation described above.
  - Turn and dollar use stayed within the 48-turn and USD 10 limits (about 15 turns, about USD 3.4 before this report).
  - I cannot measure wall-clock time. Because the session spanned a compaction, **the 1200-second limit may have been exceeded**; please check the actual session record.
- **What I did not do:** no Write or Edit, no memory writes, no git commands, no other shell commands, no network beyond the approved loopback test, no reading of private output or credentials, no other agents.
- **Still unverified:** the full goal, Duo, a real Apple slot refusal, the latest slot list, any hold, the personal installed extension, a real order, and speed. The original single Pro order authorization has been used up. Main remains at C037.
