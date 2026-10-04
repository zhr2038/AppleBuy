# Actual original-session C043 final review

Root audited fresh21 current reads and exact177 unchanged map; actual original firstParty Opus5.5/xhigh AGREE. Root owns bounded acceptance and independent984/18 runs. Full/live goal remains incomplete. Original report follows.

# C-043-CROSS-REVIEW: fresh exact-source consistency review of the 177-file candidate

## Verdict

**AGREE** for the exact 177-file candidate (SHA `b9d9b8f9…2672`) as bounded software, in the FAKE scope only.

- **No blockers.** The non-blocking observations below are for you to decide on.
- **What the agreement covers.** I wrote the C040 and C043 production changes and the 31 author tests, so this is a same-author consistency check. The cross-author evidence is your own reproduction and your test runs, and final acceptance is yours.
- **What it does not cover.** It is not acceptance of the whole repository, the full goal, live operation, Duo, real refusal handling, a real slot hold or official speed.
- **What I could not check myself.** I computed no hashes and ran no tests or commands. The match between the files I read and the manifest rests on your hash check. The 984/984 suite, the 2/2 protected run and the two 8/8 native runs, with their cleanup, are your results, not mine.

## Read scope in this call

Context was compacted once during this call. The one task-sheet read before compaction does not count. Neither do two files (the task sheet and the C023 test) that the harness re-injected after compaction. I re-read all 21 files myself afterwards, each to end of file with no gaps or truncation. The numbers are the last line each Read returned; where that line is empty, it is the file's trailing newline.

| # | File | Lines read |
|---|---|---|
| 1 | `docs/tasks/C-043-CROSS-REVIEW.md` | 1–51 |
| 2 | `docs/requirements.md` | 1–90 |
| 3 | `docs/tasks/C-043-LOOKUP-RECOVERY.md` | 1–51 |
| 4 | `docs/tasks/C-040-R1-CROSS-REVIEW.md` | 1–21 |
| 5 | `docs/reviews/C-043-candidate-manifest.json` | 1–188 |
| 6 | `docs/reviews/C-043-actual-verification.json` | 1–77 |
| 7 | `docs/reviews/C-043-independent-verification.json` | 1–1201 |
| 8 | `docs/reviews/C-040-R1-user-restoration-verification.json` | 1–71 |
| 9 | `docs/reviews/C-040-R1-user-restoration-review.md` | 1–125 |
| 10 | `docs/reviews/C-040-R1-independent-verification.json` | 1–658 |
| 11 | `docs/claude/C-043-report.md` | 1–235 |
| 12 | `web/checkout-connector/job.js` | 1–385 |
| 13 | `web/checkout-connector/chrome-port.js` (current tip, after the edit) | 1–113 |
| 14 | `web/checkout-connector/page-program.js` | 1–170, 171–340, 341–498 |
| 15 | `review/c043-independent-native-lookup.mjs` | 1–227 |
| 16 | `test/checkout-c043-lookup.test.ts` | 1–138 |
| 17 | `test/c040-native-order.mjs` | 1–229 |
| 18 | `test/checkout-c040-recovery.test.ts` | 1–95 |
| 19 | `test/checkout-c023-final-lookup.test.ts` | 1–89 |
| 20 | `test/c039-native-pipeline.mjs` | 1–154 |
| 21 | `test/checkout-c038-navigation.test.ts` | 1–75 |

**Extra searches beyond the 21 files (public project only):**
- **`lookupOrder|scriptTransport` in `web/`.**
  - Only `chrome-port.js:18` sets the transport flag.
  - It is read only at `job.js:186` and `chrome-port.js:99`.
  - The only caller of the port's lookup is `job.js:221`.
  - The other hits (`render.js`, `desktop/motor.js`) are names in the separate mock UI.
- **The same pattern in `src/`.** Nine files in the offline engine match.
- **`chrome-port|checkout-connector` in `src/`.** No matches, so nothing in `src/` imports this connector. I did not open those nine files.

## C040: autonomous recovery (not yet accepted, included here)

- **Only a rejected injection is flagged as script transport.**
  - A rejected `executeScript` throws `ScriptTransportRejected` with `scriptTransport:true` (`chrome-port.js:18`).
  - A missing, errored, multi-frame or empty result throws an unflagged `CurrentDocumentUnrecognized` (`:19`).
  - A closed tab (`tabs.get` throws), an unsupported address (`UnsupportedMerchantPage`) and a missing permission (`CurrentHostPermissionMissing`) all fail before injection, unflagged (`:13`, `:15`).
- **Only steps that were already sent get a re-read** (`job.js:186`). All of these must hold:
  - the run is not read-only;
  - the pending step was dispatched;
  - the step is either one of the C038 navigating actions, or a flagged rejection for `chooseSlot`, `fillDetails`, `continuePayment` or `submitOrder` (`:22`);
  - the clock is before the step's original deadline;
  - the existing wait limits allow it (`:172`).
- **Nothing is reset.** The deadline is written once (`:354`) and never changed. Nothing is sent again, because each pending branch either clears the step on fresh evidence, continues reading, or returns. Pause, stop and grant checks still run on every pass (`:178–179`, `:190–191`).
- **Final processing completes inside the first start.** The order is:
  1. the read-only check comes first (`:213`);
  2. the run waits only while the page shows processing or the final click's own unchanged review document, within the original deadline (`:216`);
  3. the receipt hash is captured (`:217`);
  4. the separate detail lookup runs (`:221`);
  5. the order is confirmed only if it is independent and unpaid, with the exact hash, matching purchase conditions and the exact accepted slot (`:222`);
  6. otherwise the run stops with `final-result-unconfirmed; no resubmission` (`:223`).
- **A lost submit result is still a separate, truthful stop.** The run ends with `mutation-transport-lost` and revokes the start grant (`:368`, `:85`). A read-only check then stays unconfirmed, and presenting the revoked grant again is `BLOCKED` (`:164`). Only a later Resume confirms. Your native run shows exactly this sequence.

## C043: lookup retry (`chrome-port.js:93–110`)

- **One shared budget of 40 waits × 50 ms.** A single `waits` counter covers the read helper (`:99`) and the poll after navigation (`:105`).
  - The helper rethrows once `waits>=40`, and the poll loop stops at `waits<40`, so there are never more than 40 waits.
  - Before this change, the 40 waits applied only after navigation, so the change adds no time.
- **Only flagged failures are retried, and every attempt re-checks everything.**
  - Any other error is rethrown at once.
  - Each attempt is a full `observe`: tab, address allow-list, host permission, then the result checks.
- **No repeated navigation or mutation.**
  - `tabs.update` sits outside every loop (`:104`), and only after the address and permission checks on the link the receipt actually showed (`:103`).
  - A retry calls only `observe`, which injects with `args:[plan]` and no command, so the page program returns at `page-program.js:319` before any write path.
- **No navigation once the budget is spent.** The `waits<40` guard at `:101` prevents it.
- **The lookup cannot change any recorded state.** The port is given only `P` and the hash (`job.js:221`). Pending state, deadline, final intent, history and expiry are never touched. The C023 lookup after expiry is still allowed (`job.js:175`, `:177`, `:191`).
- **Wrong, missing, sign-in or unrecognized pages never confirm.** They fail the port's final check (`:107`) or the job's exact matching (`job.js:222`), and nothing is resubmitted.

I traced the old regression tests against the current code and they hold:
- the C040-R1 "sent final … confirms once" test still gives 4 waits;
- the C023 "lost detail read" test now retries 40 times silently (its FAKE wait does nothing), then ends unconfirmed; Resume then confirms with the single original navigation;
- the C038 generic-unknown test still stops with 0 waits and 2 reads.

## Your protected native reproduction

- **It runs the production code.** It imports the real `PurchaseJob` and `ChromePort` (`:18–19`), and runs the real `merchantDocument` source on the rendered page (`:134–138`).
- **It injects exactly one read-only rejection,** after the observed order link was followed (`:126`).
- **The first start confirms with every count at one.** There is one start run (`:183`), each action happens once and there is one backend order equal to `EXPECTED_ORDER` (`:184`). There is exactly one navigation (`:185`).
- **Everything else is FAKE:** Chrome, permissions, URLs and document IDs, grant and storage, merchant pages and backend, and timing. The FAKE `tabs.update` waits for a full load (`:122`), so the rejection is injected, not caused by real timing.

## The 31 author tests

The groups add up to 31:

| Group | Tests |
|---|---|
| Confirmed in the run that sent the final | 3 |
| Bounded at 40 waits | 4 |
| Stop at once: permission, closed tab, two bad addresses, three malformed results | 7 |
| Never confirmed: sign-in, unknown page, unverified/missing fields, wrong identity, wrong spec, price, store, date or slot | 13 |
| No navigation without host authority | 2 |
| Read-only checks never wait or navigate | 2 |

Each unconfirmed case asserts:
- the original deadline (`start+8000`), the sent intent and grant, expiry and history;
- the revoked grant;
- `commands==['submitOrder']`;
- the exact list of navigations.

I found no weakened old assertion in the current C023, C040-R1 and C038 tests. I cannot diff bytes myself; byte-identity of the other 175 input files is your evidence.

## Non-blocking observations

1. **A pause can be overtaken by the one lookup navigation.** Pause and stop are not checked inside `lookupOrder`. C043 lets the read before navigation take up to about 2 s when reads are rejected. A pause pressed in that window does not prevent the single read-only navigation to the receipt's own link. Before this change the window was one read, and the post-navigation poll never checked pause either. Passing a cancellation check into the lookup would close this.
2. **Any rejected injection is treated as transport,** not only a removed frame. This is bounded and every attempt re-checks tab, address and permission.
3. **A read that never settles is still unbounded.** This was already the case.
4. **Permission loss during the lookup is reported generically.** `job.js:221` swallows the error class, so it ends as generic unconfirmed, not `NEEDS_USER` with the permission origin. This was already the case; the outcome is truthful but less specific.
5. **Rejections before navigation reduce the polls left for the detail page.** A detail page slower than about 2 s still ends unconfirmed, and Resume recovers it (C023).
6. **Two FAKE fixtures are looser than the real page program.** The wrong-detail tests use FAKE pages where `verified:true` sits beside quantity 2; the real page program would mark that unverified. Rejection still comes from the job's own matching. And because of the retry, the C023 lost-read test now covers a permanent loss rather than a single one.

## Real evidence versus simulation

- **FAKE:** all Chrome interfaces and permissions, the pages for details, payment, review, receipt and order detail, URLs, hashes, grants, clocks, storage, the backend order, the injected rejections, and the 35/150 ms timings.
- **Observed and reused from earlier evidence:** the sanitized C035/C036/C029 bag, pickup, date, time, R609 store label and order-summary shapes.
- **Local engineering bounds, not Apple guarantees:** the 40 × 50 ms lookup budget, the 8000 ms pending deadline and the 30 s wait limit.
- **Not established:**
  - real Chrome rejection messages and timing;
  - whether Apple's receipt shows a detail link of this shape;
  - how long the real detail page takes to load;
  - the real contract after slot selection, and any slot hold.
- **No claim follows** about the personal installed extension or Apple.

## Outstanding goal gaps

- The production refusal catalog is still **EMPTY** (`page-program.js:2`, `:317`).
- Real Duo is still behind approval, not on sale, has no pickup, and its Continue is disabled (`page-program.js:273–280`; `job.js:262`).
- The single real Pro order authorized under C008 is already used. No new slot, order, payment or host authority follows from this review.

## R01–R10 for this candidate

- **R03:** a transient read loss after a sent step, or during the lookup, no longer forces a new Start.
- **R04, R06:** transport loss, an unrecognized page, sign-in, processing and a wrong detail page stay distinct; none of them implies success.
- **R07:** one final submission and no replay; an uncertain final is settled only by exact independent proof.
- **R08:** pause and stop are checked on every pass and read-only runs never wait or navigate (see observation 1).
- **R09:** FAKE only.
- **Unchanged:** R01, R02, R05 and R10.

## History and deviations

- **C-043 implementation:**
  - I ran one command with an unauthorized `| grep` pipe appended. It is a deviation, not an approved command, and I did not repeat it.
  - I deliberately did not open the saved full-suite output.
  - The pre-fix totals were not visible to me.
- **C-040-R1 review:** I claimed 16 files fully read, but only 14 were delivered.
- **C-040-R1 implementation:**
  - the reported 60 turns against a cap of 48 is a discrepancy you recorded;
  - my "roughly 32 turns" was an estimate, not an actual figure;
  - 6 lines of `job.js` and 1 native-test line were left unread;
  - the first unit run was 9 pass / 1 fail.
- **C-040:** two private-output Grep attempts were denied (not retried) and one no-op Edit failed.

## This call

- **Tools:** Read and Grep only. No Bash, Write, Edit, tests, network, private paths, transcript or agents, and no files were written.
- **Calls after compaction:** 23 Reads and 3 Greps.
- **Problems:** 0 permission denials, 0 tool errors, no quota or budget exhaustion.
- **Turns, time and cost:** I give no actual figures. Your structured receipt governs, against the cap of 32 turns / 900 s / USD 6.
- **Shutdown:** none.

**Checkpoint:** the review is complete and nothing is pending on my side. The next step is your acceptance decision, including whether to track observation 1.
