Finished reading the remaining required files. Here is the C-027 review.

# C-027 cross-review: AGREE for candidate 154 / `086fda31…`, with one high-priority finding

**Verdict: AGREE**, but only for this exact candidate: 154 files, SHA `086fda31b3ff2150c6ee89f196d5eb11c279d2ddf64fe4592645cf06b6ec0ff4`.

- This is a consistency review, not acceptance. Codex owns acceptance.
- It does not carry the old 149, 150 or 151 hashes over to the changed source.
- It is not evidence that a real order is ready.
- It is not independent of my own work: my interrupted C026 edit is part of what Codex completed (see Limitations).

The verdict rests on three things:
- The C026 completion and the C027 fix keep the one-unit rule.
- They keep the observed single-group accessibility positive working.
- Quantity still has to be stated explicitly on the page.

One problem matters more than the rest (F1). C027 says that "a further product outside the exact copy stays ambiguous". That claim is false when the extra title is a bare text node, or sits in an element type the parser doesn't read. Codex should reproduce F1 before any real quantity route lets the fulfillment step proceed.

## The three approved commands

| # | Command | Result |
|---|---|---|
| 1 | `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-027-candidate-manifest.json` | `{"ok": true, "files": 154, "sha256": "086fda31…6ec0ff4", "mismatches": []}` |
| 2 | `node --test "test/*.test.ts" "review/*.test.ts"` | exit 0; 729 tests, 729 pass, 0 fail / cancelled / skipped / todo; 6134.43 ms |
| 3 | `node review/browser-self-check.mjs` | exit 0; all 10 named checks PASS; `{"passed":true,"cases":10,"passedCases":10,"result":"…\\browser-selfcheck-2026-10-03T16-27-49-493Z\\result.json","realOrderCreated":false}` |

**What changed, from reading the three manifests side by side (by eye, not a scripted diff):**
- From C026 (151 files) to C027 (154):
  - three files were added: `review/browser-self-check.mjs`, `review/c027-renderer-aggregate.test.ts` and `review/fixtures/current-public-checkout.html`;
  - `page-program.js` changed from `27a0…` to `3c88…`;
  - `job.js` (`6b74…`) and `chrome-port.js` (`5ed8…`) are the same in all three manifests.
- Between the C027 input and the candidate, only the runner (`0da3…` → `5fb7…`) and `page-program.js` changed.
- The `candidateMainSourceSha256` (`3c8839f9…`) recorded in `C-027-browser-verification.json` matches the manifest.

## What I read

All 28 required files were read in full during this invocation, with two caveats:
- **Read before the context compaction:** `page-program.js` (in two parts, 1–140 and 140–354), the C-027 review records, `browser-self-check.mjs`, `test/checkout-c026-lines.test.ts`, `review/c027-renderer-aggregate.test.ts`, the fixture HTML, `src/app/dom-bridge.ts`, `web/desktop/fixture.js`, `motor.js`, `app.js`, `index.html` and `chrome-port.js`.
- **Read again or for the first time after the compaction:** `page-program.js:40–129`, `browser-self-check.mjs` (complete), `job.js`, `review/c026-purchased-groups.test.ts`, the three manifests, the original prompt, `requirements.md`, the C-026 task and the C-025 native observation.

For the files read before the compaction, my analysis relies on my own notes from that read.

**Denied:** reading the `result.json` written by command 3 failed with "File is in a directory that is denied by your permission settings". The task allowed that read, so I count it as a failure; I only had command 3's stdout.

**Not read:** `src/engine.ts`, the C026 bytes of `page-program.js`, and the accepted 149-file manifest.

## How the two Codex completions hold up (from the code)

**C026 completion:**
- There is now a single `const checkoutScope` (`page-program.js:84`), reused at `:121`. My duplicate declaration is gone.
- Every structural anchor is counted, including hidden ones: groups, strips, legends, headers and screen-reader copies (`:85–90`).
- The structure checks are strict:
  - exactly one visible group and one strip;
  - the legend must be a LEGEND inside the delivery-options FIELDSET, with one H2 holding one `.visuallyhidden` SPAN copy equal to the full variant (`:92–94`);
  - the strip must be inside the group and its text must equal the full variant (`:95`).
- Pages without group anchors still need exactly one separate title line (`:97`), and every product line must equal the full variant (`:101`).

**C027 fix:**
- A product-text element now counts as one line if it is the strip or the copy, or an ancestor or descendant of either (`:86`, `:96`).
- This fixes the real-DOM false negative: the shipment DIV contains the option labels 为我送货 and 我要取货.

**Quantity** is still taken only from one explicit `数量` line or one select labelled 数量 (`:105–112`). It is never inferred from price, title count, group count or old flags.

## Findings

### F1 (high priority, found by reading the code, not executed): an extra title passes when it is not a separate text element

In the group path, any matching element that is an ancestor of the strip or copy is accepted, whatever else it contains (`:96`). The parser only treats `h1,h2,h3,p,span,div` as text elements (`:41`). So an extra product title that is a bare text node or a `<b>`, `<strong>`, `<label>` or `<li>` is not seen as a line of its own, and its ancestor is accepted.

**FAKE reproduction:** use the fixture with `?qty=1`, or `rendererShape` with an explicit 1.
- **F1-a:** inside `H2.rs-fullfillment-selector-header`, after the `.visuallyhidden` SPAN, add a bare text node `iPhone 18 Pro 256GB 黑色` (or the same text in a `<b>`).
  - The H2 text becomes the title twice. It matches the product pattern (`:51`).
  - The H2 is an ancestor of the copy, so it is accepted.
  - There is still exactly one strip, legend, header and copy, and the copy equals the full variant.
  - Quantity reads as 1, so I predict: item verified, `selectPickup` delivered, pickup selected.
- **F1-b:** append the same text after the FIELDSET inside `DIV.rs-fulfillment-shipment`. Its text ("…黑色为我送货我要取货iPhone…黑色") is an ancestor of the copy, so it passes the same way.

**Expected result:** unverified and untouched. That is what the claim above says, and what the third C027 test already shows when the extra title is a SPAN.

**How it compares:**
- The page-wide path would reject F1-a, because it would count the H2 and the strip as two lines (`:97`).
- Codex's notes and the first browser run's failure ("ancestor includes option labels") indicate the C026 version rejected these ancestors too. I did not read the C026 bytes to confirm.

**Why I don't treat it as blocking:**
- The page must still show an explicit quantity of 1, and the observed native page shows none.
- Real duplicate items would add strips or groups, which are counted.
- The same element-type blind spot (G3 in the C-025 review) already exists in the page-wide path and in the accepted C024 baseline, which had no line counting at all.

**Possible fix (Codex's choice):** for an ancestor of the strip or copy, remove their text and the native option-label text, then require that nothing product-like is left. Or scan text nodes in main for product names outside the strip and copy. Either way, the real-DOM explicit-1 positive must keep passing.

### F2: the browser harness's results are partly stated rather than measured

- The report's "all browsers, contexts and servers closed" and "allowed network" entries are hard-coded (`:103–104`).
- Close errors for contexts and demos are swallowed (`:97–98`), and the fixture server's close error is ignored (`:99`).
- If `browser.close()` throws (`:100`), no `result.json` is written. The run then fails with a non-zero exit, so nothing is falsely reported as passing, but there is no report.
- A failed check rethrows (`:39`), so later checks don't run. Fewer than 10 cases are reported; none is falsely marked as passed.
- The over-cap and redraw cases assert only zero final clicks and orders, plus zero bag additions for over-cap (`:69`). They don't assert why the run stopped, so any early stop would pass.
  - The recorded results (INIT with 0 bag additions; MANUAL_VERIFICATION with 1) are consistent with the intended causes.
- In the normal journey, the runner asserts 2 refusals, 1 final click and 1 order (`:67`). It does not itself assert:
  - the bag-addition count;
  - that refusals were of the terminal slot;
  - that the order is unpaid;
  - the independent order lookup.

  Those rest on what the FAKE engine's `ORDER_CONFIRMED_MOCK` phase means, and I did not read `engine.ts`.
- `blockedExternalOriginCount` covers only requests from pages (`:35`). Traffic from the browser process itself is not routed or measured. `--disable-background-networking` (`:80`) reduces it but isn't verified.
- The wait at `:60` can resolve early because `Boolean(s.history)` is true for an empty array. The 2-second running poll and the `running===false` assertion (`:62–63`) catch that.

### F3: which browser and code the harness runs

- `channel:'chrome'` launches the installed Google Chrome (version 154.0.8037.93), headless, with a fresh temporary profile (`:80`). That is not the personal profile, and the runner loads no extension.
- Playwright 1.62.1 is loaded from `~/.cache/codex-runtimes/…`, which is outside the project and the manifest (`:23–26`). Only its package name is checked.
- `--playwright-dir` lets whoever runs the script choose which code it executes. I suggest pinning the version or checking a hash.
- The runner leaves six FAKE screenshots and the fake task records in its own new `.local` directory (`:53`, `:72`). That is within the permitted artifacts. I deleted nothing.

### F4: possible false stops on later pages (safe direction)

Every non-bag page without group anchors now needs exactly one title line (`:97`). A real later checkout or review page that repeats the title would stop rather than proceed. This is unobserved.

### F5: what the tests do and don't cover

- The four rendered checks (`:84–87`) run the parser only, on a loopback page with a FAKE location (`:44–47`).
- The six journeys (`:88–93`) run the C010 fake DomMotor, FakeMerchant and engine.
- The ChromePort/PurchaseJob checks for C026 are Node fakes only (`review/c026-purchased-groups.test.ts:101–119`).
- None of this exercises the installed extension, Chrome APIs, site permissions or Apple.

### Protections still in place

These are confirmed by code reading and the green tests:
- wrong quantity, store, price cap or extras still stop;
- page-wide ambiguity and hidden duplicate anchors still stop;
- missing quantity still stops;
- a decode that changed between read and action still stops (`OperationEvidenceChanged`);
- `job.js` and `chrome-port.js` are unchanged from C026 through C027 (I did not check back to 149):
  - a rebound task stays permanently read-only;
  - an unknown final result is never resubmitted;
  - pause and restart behaviour is unchanged.

## Requirements mapping (R01–R10)

- **R01/A06 (one unit, exact product):** strengthened compared with C024; F1 is the remaining gap.
- **R06:** unknown quantity stays unknown.
- **R07, R08:** no change to job or port code.
- **R09:** the harness touched only loopback FAKE pages.
- **R02–R05, R10:** not affected.

## Real evidence vs simulation

- **Real:** only the earlier C-025 read-only observation. It shows one group and one strip, two copies of the title, and no explicit quantity.
- **Not established:** the native fulfillment-page quantity contract, real slot refusal, Duo, a real one-click order, and speed.
- **No new authorization:[REDACTED] nothing in this review authorizes a real order, slot or payment.

## Limitations and paths not run

- **Not independent:** my C026 partial edit (the duplicate `checkoutScope` that caused a SyntaxError), followed by quota exhaustion, is part of what Codex completed.
- **F1 not executed:** no extra commands were allowed beyond the three approved ones.
- **Permission denial:** reading `result.json` was denied, as noted above.
- **Context compaction:** the context was compacted during this invocation.
- **Model and effort:** model `claude-opus-5-5`; the requested xhigh effort can't be verified from inside.
- **Budget:** the local counter showed about USD 3.6 of 10 at last reading, which is not billing. Turn and wall-clock use can't be measured from inside, and I received no cap or quota signal.
- **Nothing else touched:** no source edits, agents, public network, personal browser, desktop or extension actions, publishing, or shutdown.
