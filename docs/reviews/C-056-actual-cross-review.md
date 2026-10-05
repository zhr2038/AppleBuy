# C-056 exact combined cross-review — delivery report

## Verdict

**AGREE** for exact196 BOUNDED SOFTWARE: manifest `C-056-candidate-manifest.json`, source SHA `6f8daaff73e1f7f26bb0e7eed626804e1d23430c5be5a52fcf588f16dc76573d`.

I found no blocking defect. There are six non-blocking observations, listed below.

- **C054/R1 calendar code:** this is my own code, so this is only a same-author consistency check. Root's 17 protected reproductions are the independent verification.
- **C055/C056:** this is a cross-author review of Root's code.
- **Acceptance:** this is not acceptance. Root owns final acceptance.
- **Not established:** whole-repo, installed-extension, live-site, speed, Duo or full-goal readiness; a held slot; a new unpaid order; any new authority.

**Timing:** the run happened after the 14:50 reset. The c040 output path is timestamped `2026-10-05T12-47-14Z`, which is 20:47 Asia/Shanghai.

## Commands

Each was run separately with no pipe, filter or redirection.

| # | Command | Result |
|---|---|---|
| 1 | `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-056-candidate-manifest.json` | `{"ok": true, "files": 196, "sha256": "6f8daaff…6573d", "mismatches": []}` |
| 2 | targeted 6 files | 191 tests, 191 pass, 0 fail/cancelled/skipped/todo, 214.8 ms |
| 3 | full suite (dot reporter) | 1307 dots in 65 rows of 20 plus 7; no failure marks and no failure section |
| 4 | `node test/c051-native-contact-repro.mjs` | 3/3 pass; cleanup: 3 contexts closed, browser and server closed, no errors |
| 5 | `node test/c050-native-dates.mjs` | 9/9 pass; cleanup: 9 contexts closed, browser and server closed, no errors |
| 6 | `node test/c040-native-order.mjs` | 8/8 PASS; completion passed; guard aborted (blockedDelta 1, serverHits 0); network 56 allowed / 1 blocked; cleanup: 8 contexts closed, browser and server closed, no errors |
| 1 (repeat, last) | same manifest command | identical: ok, 196 files, same SHA, no mismatches |

- **Targeted breakdown (command 2):** 17 C056 + 8 C055 + 9 C017 + 12 date-repro + 5 R1-repro + 140 calendar.
- **Output disclosure:** the 191 individual ✔ lines from command 2 are not copied into this report; none were ✖. The native JSON results are summarised above, not reproduced verbatim.
- **c040 output file:** c040 wrote a new file under `.local\c040-native-order\…\result.json`. I did not read it.

**Native isolation, checked from source before running:**
- All three scripts launch fresh headless Chrome without a persistent profile.
- The test server binds `127.0.0.1` on port 0.
- The context route lets only its own origin through and aborts everything else; WebSockets are closed.
- c050/c051 block service workers.
- In-page guards throw unless the hostname is `127.0.0.1`.

## Review points

**Calendar C054/R1 (same-author).** All three Root defects are fixed in `job.js:83-96`:
- February 30: calendar-shaped labels must be valid days even when the two strings are identical.
- Ambiguous cohort: `cohortAmbiguous` runs before any comparison.
- Missing facts: a missing date, start or end on either side never compares equal.

Behaviour that is kept:
- Valid aliases and opaque labels such as `FAKE-…` still progress.
- A year on one side only never matches.
- The helpers are pure, so the raw dates, cursor, floors, refusals, history, expiry and final intent are never written.
- The four strengthened exact-cohort expectations are at `checkout-c054-calendar.test.ts:191-193`.
- The c023, date-repro and R1-repro test hashes are unchanged from the R1 manifest.

**C055 diagnostic.** `task-diagnostic.js` builds a fixed-whitelist summary:
- States, phases, actions, models and colours come from fixed sets.
- Dates are shown only if `calendarDay` parses them; times must match a strict pattern.
- Everything else is a boolean or a bounded number.
- No IDs, hashes, URLs, contact data, history text or error text are output.

The handler (`control.js:74-84`):
- reads only `TASK_KEY`, under `withPurchaseOwner`;
- makes no write, private-session read, site/tab call or buyer creation;
- re-checks the pause epoch before output;
- shows only a fixed error message on failure.

The C055 tests run the actual `control.js` handler in a VM with fake Chrome APIs.

**C056 probe.** `closed-checkout-probe.js` checks all of the required points:
- **Eligibility (line 23):** expired, unresolved `chooseSlot` from SLOTS, no final intent or accepted slot, not read-only, and an exact plan/digest match.
- **History (lines 8-15):** nested retired history is checked, bounded at 200 rows.
- **Original target gone (line 27):** the old tab ID is absent from a successful `tabs.query`, and the selected tab is present. A query error or an invalid ID stops the probe.
- **Bag (line 37):** a verified BAG page at `/shop/bag` holding one matching item, total equal to the stored basis, and `extras===false`.
- **Write-ahead:** the probe record is saved as PREPARED (`dispatched:false`), then SENT_OR_UNKNOWN, then the single `act`. A pause between the steps restores a truthful "not sent".
- **Original record untouched:** every save checks the original fields byte-for-byte (`OriginalChanged`).
- **No repeat:** once any probe record exists, the send branch is unreachable, so nothing repeats across timeout, AUTH, missing host permission, restart, pause or an untouched result.
- **Stopping:** it stops after observing a step; unexpected or failed reads stay unknown.
- **No other purchase actions:** there is no path to Add, store, date or slot selection, contact, payment or final submission.

Two further checks:
- The page program needs `command.taskId` for this command (line 519), and the probe supplies it. `planDigest` is only needed for the final submit (line 584).
- The final summary/status strings never claim that no other hold exists.

**Control pipeline.**
- Both new handlers capture the pause epoch at click time and pass `live` into the work.
- `cancel()` reports a possibly-sent checkout truthfully (`control.js:95` and `:185`).
- The probe port is built without private pickup data; no session read occurs.

**Permissions and packaging unchanged.** The hashes match the R1 manifest for:
- `manifest.json`, `package.json`, all `tools/delegation/*`;
- `job.js`, `chrome-port.js`, `owner.js`, `page-program.js`, `open.*`.

Changes from the 192-file set are exactly three files (`control.js`, `control.html`, the c017 test) plus four new files. Only those 27 manifest entries were compared, not all 189 unchanged files. I did not check `.mcp.json`, because it is not in the manifest.

**Required-ID exception (`checkout-c017-discovery.test.ts:133-135`).**
- All 27 earlier IDs are retained, plus `inspectTask` and `probeClosed`.
- The exact sorted-equality check, the disabled-`final` check and the permission assertions at lines 80-81 are all retained.
- I verified this by reading the content, not by a byte diff, because git was not an allowed command.

## Non-blocking observations

1. **Pre-existing, now more reachable: the old slot can be inferred as accepted after a rebind.**
   - **Where:** `chrome-port.js:11,27` together with `job.js:309`.
   - **Condition:** after a probe, a human explicitly rebinds the expired task to the probe tab (`control.js:171`). That tab has been manually advanced to PAYMENT or REVIEW, or to DETAILS with a verified purchase.
   - **Consequence:** the port seeds its last choice from the old pending `chooseSlot` and reports it back as the accepted slot. `job.js:309` then compares the pending slot with itself, writes `acceptedSlot` and clears `pending`, using evidence from a different checkout session.
   - **Expected:** require the page's own slot summary to match, or refuse or flag a rebind when a `closedCheckoutProbe` record exists.
   - The probe itself never does this. Both files have the same hashes as in the C053-accepted baseline.
2. **Checkout-tab detection misses a trailing slash.**
   - **Where:** `closed-checkout-probe.js:28`.
   - **Condition:** another disclosed tab is at `/shop/checkout/`.
   - **Consequence:** it is not counted, although `allowedMerchantUrl` accepts that path. This is a defence-in-depth gap only.
   - **Expected:** use `/^\/shop\/checkout\/?$/`.
3. **No wait after the Checkout click.**
   - **Where:** `closed-checkout-probe.js:47-49`.
   - **Consequence:** the immediate read usually sees the old document or an unknown result, so a second human click is needed to observe the next step. This matches the real recorded result (UNKNOWN first, then AUTH). It does not affect safety.
4. **Diagnostic does not look into nested history.**
   - **Where:** `task-diagnostic.js:38`.
   - **Consequence:** `priorSlotOrFinalPresent` checks only the top level of retired history, so a legacy nested prior final reads `false`. Current code does not create nesting, because `job.js:200` flattens it on retirement.
   - **Expected:** search nested history, or report unknown when nesting exists.
5. **Diagnostic display gaps.**
   - **Where:** `task-diagnostic.js:36`.
   - **Consequence:** a refusal count of 6 (the EXHAUSTED state, `job.js:306-307`) is shown as null. The diagnostic also never shows the probe's own state.
6. **Stale test comment.**
   - **Where:** `checkout-c017-discovery.test.ts:131`.
   - **Consequence:** the comment mentions only `inspectTask`, but the ID list also contains `probeClosed`.

## Historical failures retained

- The initial C054 delivery (191 files) was rejected over 5 failing independent cases.
- Root's first full run of 1282 had one old `dom-bridge` loopback fetch error. Isolated 10/10, then a same-source full 1282, passed with no test fix. The cause is unproven.
- The C055 full run failed because the required-ID list lacked the new control, until the list was extended.
- C056's first run of 17 had 5 fixture failures (fake retired rows lacked schema/state); only the fixture was fixed.
- Root's self-final run was 1307.
- The C054-final attempt hit the provider session quota after 3.12 s.
- From my own history: C054 had 2 harness-default failures in my own run, and the fix did not relax any assertion.

## C-054-FINAL disposition

**Not executed as a separate task.** I issued no exact192 verdict, for these reasons:
- C-056 supersedes it and limits me to six exact commands.
- The current tree no longer equals the 192-file set: `control.js`, `control.html` and the c017 test hashes differ.

Its full-suite command is the same as C-056 command 3 and ran once. Its manifest check and its 3-file targeted command were not run. I read the 192-file manifest only partially, via Grep, so its EOF-read requirement is unmet. The calendar consistency review it asked for is covered above.

## Disclosures

- **Reads:** all 26 required files were read to EOF from actual tool output after this session's context compaction.
- **Extra access:** the C-054-FINAL task sheet. Grep-only (partial content) on three sources:
  - the three native scripts;
  - `page-program.js`;
  - `C-054-R1-candidate-manifest.json`.
- **Not read:** no `.local`, transcript, home, private or compaction artifacts.
- **Errors and limits:** 0 permission denials and 0 tool errors. No quota or session-limit message was seen.
- **Process counts:**
  - about 40 tool calls in this session;
  - the harness budget showed about $4.09 of $10 used;
  - I cannot see the structured `num_turns` or elapsed wall time, so I report neither, and none of these counters is a provider quota.
- **No changes or other activity:**
  - No writes, edits, commits or agents.
  - No personal Chrome, Apple site, network or permission changes.
  - Edit and Write were not available.

## R01–R10 and the evidence boundary

| Requirements | How this delta relates |
|---|---|
| R01, R06 (A06) | Calendar guards; the probe's plan, price, quantity and no-extras checks |
| R07 (A07) | Write-ahead, single send, no replay of an unknown result |
| R08 | Pause epoch; already-sent actions reported truthfully |
| R09 | Explicit enablement; no slot, final or payment action |
| R10 | Diagnostic and status text show only whitelisted fields |

Not addressed by this delta: R02–R05.

All controller runtime, Chrome APIs, stores, grants and merchant effects in the tests are fake. The native runs use owned loopback fixtures only.

The real facts all come from Root's and the user's records; I did not verify any of them:
- the expired task with its unknown old slot;
- the original tab gone, and a matching one-item bag at ¥9,999;
- the probe reaching AUTH;
- the HTTP 541 response at the sign-in handoff.

No new unpaid order, slot hold, or no-order/no-hold certificate exists. The old slot's outcome is still unknown.
