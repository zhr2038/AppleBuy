# C-038-MAIN-CHAIN: delivery report (Claude, claude-opus-5-5)

## Outcome: not delivered

None of the required C-038 work could be done in this call:
- No artifact written.
- No command run.
- No RED or GREEN result.

The task needs file writes (`review/browser-c038-main-chain.mjs`, `docs/claude/C-038-report.md`) and four permitted commands. This session only had **Read, Glob, Grep and WebFetch**: no Write, no Edit, no Bash. I didn't try to work around that, and I didn't use WebFetch because no network access is authorised. There were no permission denials, because I made no attempts. Treat this as a failure to deliver, not as partial acceptance.

What I could do was the required reading and a static trace of how the unmodified production `PurchaseJob`, `ChromePort` and `merchantDocument` would compose on the planned journey. Everything below is a **prediction from reading the code, not a test result**.

## What I read

- **All required inputs, read fresh in this call:**
  - the task sheet, `docs/requirements.md`;
  - `C-038-input-candidate-manifest.json` (171 files, `05831e2f…`), `C-037-bounded-agreement.md`;
  - `C-035-official-cart-evidence.json`, `C-036-normal-pickup-evidence.json`;
  - `job.js`, `chrome-port.js`, `page-program.js`;
  - `browser-c035-boundary-self-check.mjs`, `browser-c036-pickup-self-check.mjs`, `browser-c037-store-repro.mjs`, `browser-self-check.mjs`.
- **Paged read:** `page-program.js` hit the Read size limit at lines 1–407, so I read 408–498 separately. All 498 lines were covered.
- **Extra public files, only for the trace:**
  - a Grep of `review/fixtures/current-public-checkout.html`;
  - a Grep of `test/checkout-c029-summary.test.ts`;
  - lines 1–149 of `docs/reviews/C-029-native-summary-evidence.json`.

## How I expect the journeys to run

**Journey 1 (start from an empty bag): no blocking defect found.**

1. **Empty bag:** decodes as `EMPTY_BAG`. The job sends `openProduct`, and ChromePort navigates the tab and waits until it has loaded.
2. **Product page:** the job configures the product one choice at a time: not-trade-in → no-AppleCare → Add to Bag enabled (`VARIANT`, quoted price 9999).
3. **Add-boundary bag read:** `readBag` opens a side tab, needs two identical `EMPTY_BAG` decodes, and closes the tab. The read is fresh: its sequence number is higher than the last one and its document ID is different.
4. **One Add, then View Bag:** `addBag` is sent, the accessories page leads to `viewBag`, then the bag page shows one item, then `checkout`.
5. **Checkout and summary:**
   - The first checkout page is the delivery-style layout seen in C029, with one product group and strip, and a summary showing `运费 免费`.
   - The summary read gives a quantity of 1, and the job's money check matches `bagTotalCny` (9999).
6. **Pickup, then a second summary read:**
   - `selectPickup` → the page switches to the pickup layout. The saved summary no longer matches the page, so it is read again. The no-shipping summary is accepted only now that pickup is chosen.
   - The pending `selectPickup` is then confirmed.
7. **Store, then a third summary read:**
   - `selectStore` clicks the unselected R609 radio with the full Dalian label.
   - The date section appears, and its caption adds one more "iPhone" mention. That changes the page fingerprint, so the summary is read a third time. Phase becomes `SLOTS` and the pending store selection is confirmed.
8. **Dates and slot:**
   - The first three dates are frozen as October 4, 5 and 6, with October 4 already selected.
   - The last slot is 21:15–21:30, so `chooseSlot` sends one select change, waits for the page to settle, re-checks, and clicks Continue **once**.
9. **Stop:**
   - The planned endpoint is a FAKE page that the page program classifies as `UNKNOWN`.
   - The job should then stop with `NEEDS_VERIFICATION` / `slot-result-unconfirmed; no resubmission`, keeping the pending `chooseSlot`.
   - This invents no acceptance and allows no second Continue.

**Journey 2 (start on the product page, bag already holds the matching item):**
- The side read decodes `BAG` with one matching item and no extras, so the job sends `openBag`.
- The page program accepts `openBag` without touching anything, and ChromePort navigates and waits for the bag page.
- The pending `openBag` is confirmed on the bag page (`BAG`), followed by `checkout`.
- There are **zero** Adds, and `bagAddStarted` stays false until checkout. The rest matches Journey 1.

## Risks the run must confirm (predicted, not reproduced)

1. **A read-only page check can stop the run after a page-triggered navigation. This is the most likely real defect.**
   - **Where:** after `addBag`, `viewBag` and `checkout`, the page navigates itself and ChromePort returns at once. The next page check (`observe`) can land while the old page is being torn down.
   - **What happens:** a real Chrome script injection, or a faithful shim, then fails. That surfaces as `observation-transport-failed` / `NEEDS_VERIFICATION` (`job.js:177`), with no retry. Nothing unsafe happens, but the one-start journey can stop at random.
   - **Expected behaviour:** while a navigation-producing pending action is still within its deadline, a failed read-only page check should be retried inside the existing bounded wait. The action must never be resent and the failure never read as empty or as no stock. Once the deadline passes, the job should stop as it does now.
   - **Why it's untested so far:** `openProduct` and `openBag` don't have this problem because ChromePort waits for the load (`chrome-port.js:49`).
2. **An unobserved contract gap at the first checkout page.**
   - The job needs a verified quantity before it will select pickup (`job.js:302`, `page-program.js:442`). Under the C036 shape, the summary only counts without a shipping row once pickup is already chosen (`page-program.js:362`).
   - So if the real first checkout page has pickup not chosen *and* a summary without `运费 免费`, the run stops with `order-summary-not-verified`, after touching the page.
   - C029 evidence (delivery layout, `运费 免费`) suggests the normal case works. The pre-pickup state in C036 was never captured, so this needs observation, not a code change.
3. **Three summary disclosures per journey.** Each opens and closes the order-summary dialog. They are bounded at 30 and allowed by design, but they add page writes and time.
4. **The fault cases need care:**
   - `job.stop()` adds the start grant to the revoked list (`job.js:81`). The restart in the late-result case must therefore run with no grant or a new FAKE grant; reusing the old one is BLOCKED before any read.
   - On restart the summary read is correctly skipped while `chooseSlot` is pending (`job.js:187`).

## Design for the next authorised call

**Shim (Chrome plumbing only):**
- Maps tab IDs to Playwright pages, and each page's loopback path to a FAKE Apple URL (`www…/shop/bag`, `www…/shop/buy-iphone/iphone-18-pro`, `secure8…/shop/checkout`).
- Assigns a new FAKE document ID on each full page load, and keeps it across in-page changes.
- Runs `func.toString()` with a FAKE `location`, the same technique as the existing scripts. If a call targets a document ID that is no longer current, or the page context is destroyed mid-call, it returns an error.
- Implements `tabs.create`, `tabs.remove` and `tabs.update` for real on owned pages, and FAKE-grants `permissions.contains`.
- Uses an in-memory store and keeps ChromePort's real `wait`.

**Fixture:**
- **Observed shapes:**
  - the empty bag uses the sanitised block from the C035 cart evidence;
  - the one-item bag uses the C-019 / C029 structure;
  - the checkout pages use the C036 store radio, date inputs, caption and options. The 46 October 4 slots are derived from the recorded count and first/last values.
- **Invented and labelled:**
  - the product-page structure and the URL for the accessories page;
  - every page transition and when it happens;
  - the switch from delivery layout to pickup layout;
  - R609 starting unselected;
  - the endpoint page.
- **Run setup:** start with an observe-mode ChromePort "prepare" step to get the FAKE `entryDocumentId`, then build a FAKE start grant from it.

**Counters to assert:**
- Adds, side tabs opened and closed, `openBag`, checkout clicks, pickup / store / date clicks, select changes and Continue clicks.
- The job's final state, reason, pending action and history events.

**Fault cases:**
- the side read finds another product, or two items;
- the cart changes between the two side reads (expect UNKNOWN after the 150-poll limit);
- stop after the `chooseSlot` save, then restart while the page shows processing and later the endpoint (no second change or Continue).

**Then:** run the four permitted commands in order, starting with the manifest verification.

## Boundaries and status

- **Changed files:** none. I couldn't hash anything, so whether the 171 files are unchanged is for Root to check.
- **Commands:** none run, not even the manifest verification. No Node or native results, no `.local` report, no timing.
- **Old simulator:** untouched.
- **Simulation scope:** everything above is static analysis of FAKE-shaped DOM. Not established: real Apple behaviour, installed-extension APIs, secure8 permission, acceptance, refusal, holds, Duo, or speed.
- **Order authority:** the Pro order authority is used up, and there was no merchant action.
- **Budget:** about USD 2.4 of 10 and 15 tool calls, within 48 turns. I didn't measure wall time.
- **Restart point:** rerun C-038 with Write and Bash available. Implement the design above, and reproduce risk 1 first.
