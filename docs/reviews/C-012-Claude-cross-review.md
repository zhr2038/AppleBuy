Actual CLI report returned in the original session, exact Opus 5.5/xhigh, 38 returned turns, no permission denials, and owned process cleanup confirmed. The reviewed immutable scope is 115 files, SHA256 `6932a7a5fb3858c93ef566c4403690860aed13081d5f9239919dd5dfb17c1df0`, commit `eb7a5e4a443bb1243933ee87a716024833a03383`. Model identity is independently verified from structured `modelUsage`, init and assistant events. Budget estimates inside the report are self-reported; they are not independently verified billing measurements.

The following is the actual English returned verdict. Its bounded C-010/C-011 agreement is explicitly partial, with the unread scope disclosed. It rejects C-012 and real purchasing readiness. Codex is independently reproducing findings and will dispatch repairs; no mutual C-012 acceptance exists.

---

# C-012-REVIEW: independent read-only review verdict

I did not reproduce any finding with a new test, because writing tests isn't allowed in this read-only review. Each reproduction below is a concrete fake-port or fixture case for Codex to run. I cannot approve fixes I write myself.

## 1. Verdicts

| Scope | Verdict |
|---|---|
| **C-010 offline DOM candidate** (loopback, fake pages only) | **Bounded agreement, within what I read.** I found no P0/P1 in `src/app/dom-bridge.ts`, `web/desktop/motor.js` or `web/desktop/app.js`. This is not an Apple adapter. |
| **C-011 public collector** (uninstalled, `activeTab`+`scripting`) | **Bounded agreement as a read-only public-entry probe.** It has one functional gap (C11-1). It cannot reach the secure checkout host. |
| **C-012 source/controller/API candidate** | **Not agreed. Blocked by two P1 findings:** F-A (wrong store accepted at the slot stage) and F-B (the bag can be added twice). Source-only testing can safely continue. |
| **REAL_PURCHASING_READY** | **No.** Two P1s, several fail-safe functional blockers, and almost no real Apple contract evidence past the public product page. |

Neither 312 passing tests nor the matching manifest counts as approval. No C-010/C011 or C-012 agreement existed before this review.

## 2. C-012 findings

### P1: these block even bounded acceptance

**F-A: the wrong store can pass as the planned store** (`web/checkout-connector/page-program.js:28-29`, used at `:32` and in phase detection at `:34-46`)
- **Problem:**
  - `storeFields` accepts any visible text up to 180 characters that starts with 取货地点/取货门店/自提门店/店内取货地点.
  - A store then counts as verified if that text merely *contains* the plan store's name.
  - Nothing checks whether a different store radio is checked, or whether the text names more than one store.
  - A container `div` holding the whole store group fits this pattern.
- **Reproduction** (fixture style of `test/checkout-page-program.test.ts`):
  - Plan store: `Apple 大连恒隆广场`.
  - Radios: `['Apple 大连百年城',true]`, `['Apple 大连恒隆广场',false]`, plus the date radios.
  - Texts: product, `数量：1`, `总计：RMB 15,999`, the container text `取货门店 Apple 大连百年城 Apple 大连恒隆广场`, and `店内取货`.
  - Also: button `继续填写取货详情` and a time select.
  - **Result today:** `purchase.verified===true`, `store==='Apple 大连恒隆广场'`, phase `SLOTS`. `job.js:85` passes and `job.js:96` sends `chooseSlot` at the wrong store. That is a wrong-condition merchant mutation. A later page may block the order, but only after the merchant has been touched.
- **Acceptance:**
  - A store is verified only when one of these holds:
    - exactly one checked, enabled radio in the store group, whose label exactly equals a plan store; or
    - exactly one labelled field whose *value* (the text after the label) exactly equals a plan store.
  - Any of these must leave the store unverified (`null`): a second checked store, a non-plan store checked, or a field naming several stores.
  - The same rule applies at SLOTS, DETAILS, PAYMENT, REVIEW and ORDER_DETAIL.
  - Regression tests for both the container shape and the conflicting-radio shape.

**F-B: the bag can be added again** (`web/checkout-connector/job.js:78-80`; the only other `addBag` reference is the reconciliation map at `:66`)
- **Problem:**
  - Nothing durable records that a bag addition already happened. Once the pending entry is cleared, any later VARIANT page triggers another `addBag`.
  - That later VARIANT page can come from a merchant redirect, back navigation, or a human visiting the product page between the first run and the final-grant run.
  - This breaks R07 ("without duplicate additions") and Codex's own claim that the job "adds once".
  - It is currently masked only because the price cap equals one unit's price, so the BAG total fails. Even then, the second addition has already happened.
- **Reproduction** (style of `test/checkout-job.test.ts`):
  - Handler: `addBag` leads to ACCESSORIES, `viewBag` to BAG, and `checkout` to `read('VARIANT',{variantVerified:true,quotedCny:15999})`.
  - Run, then count `addBag` actions. **Today the count is 2.**
  - Variant: the first run stops at `AUTH` after BAG, the observation is set to VARIANT, then run again. Again a second `addBag`.
- **Acceptance:**
  - A durable "bag addition started" record, saved in the same write-ahead save as the first `addBag`.
  - Any later ENTRY or VARIANT page in the same task gives `NEEDS_USER` with **zero** further `addBag` actions, including after a restart.

### P2: fail-safe, but each one prevents real use

**F-C: the global task can permanently block itself** (`job.js:35`, `:36`, `:41`; `control.js:30` "No delete/reset")
- Starting a task stamps a 30-minute `expiresAt`, even if the start lands on a PRELAUNCH page. After 30 minutes the task is permanently `EXPIRED`.
- A browser restart changes the tab id, so `:36` blocks forever.
- Switching from Pro to Duo also blocks forever.
- `:41` runs **before** the reconciliation of a pending `submitOrder` (`:51-56`). After expiry, an unknown final result can never be checked read-only by the extension, so the user may never learn that an unpaid order exists.
- **Reproduction:** pending `submitOrder`, `advance(1800001)`, run. Result: `EXPIRED` and `lookupOrder` is never called.
- **Acceptance:**
  - Expiry stops only new mutations; read-only reconciliation still runs.
  - Reconciliation still runs after an explicit human tab rebind.
  - A task that never wrote any merchant mutation can be retired by explicit human action. A task with any mutation written can never be reset.

**F-D: disabled dates count toward the frozen "first three"** (`job.js:87`, `:89`)
- `o.dates.slice(0,3)` includes disabled labels. A leading disabled date leaves only two usable dates, which breaks the accepted rule of three genuinely offered dates.
- The prior project record of the Pro pilot appears to show this shape; I did not re-verify it this session.
- **Acceptance:** freeze the first three *enabled* labels, with a test that starts with a disabled date.

**F-E: failures before any click become a permanent unknown** (`job.js:110-112`; `page-program.js:84` and the action branches)
- `OperationEvidenceChanged` before any DOM write, a missing control, the redraw `Redrawn` case (exercised in `checkout-page-program.test.ts:43`) and `PickupDetailsRequireHuman` all throw.
- `act` turns every throw into "transport lost" with the pending entry kept. After the 8 s deadline, `chooseSlot` is stuck at `slot-result-unconfirmed` forever.
- So any native redraw between reading the page and acting on it permanently stops automation.
- **Acceptance:**
  - Failures before the first DOM write return a structured `{delivered:false, touched:false}`, and the job durably clears the pending entry as "not sent".
  - Failures after a write but before continuation need a stated rule backed by evidence.

**F-F: no real refusal handling** (disclosed by Codex)
- Any real slot refusal leaves the task stuck.
- If the human then finishes manually, the port's echo at `chrome-port.js:12` assigns the extension's last choice as the accepted slot. REVIEW's `slotSummary` check (`job.js:103`) blocks this, so it is safe but unusable.

**F-H: a pause or crash around the final send blocks a final that was never sent** (`job.js:106-111`)
- If a pause arrives between `:106` and `:108`, `finalIntent` stays saved, and `:104` then blocks forever.
- If a pause arrives at `:111`, the record says `sent:true` even though `act` was never called. That is a false record (R08 truth), though it fails safe.
- **Acceptance:** when the code knows it never dispatched (the pause case), durably mark the final "not dispatched". The crash case correctly stays unknown.

**F-I: "no extras" and "existing orders checked" are stale human statements** (`chrome-port.js:13-14`; `control.js:24` never clears `activeGrant`)
- REVIEW's `o.extras===false` comes from the human's grant, not from the page.
- The 20-minute start grant is reused across runs, including after an AUTH stop where the human acted manually.
- Today only the price cap mitigates this.
- **Acceptance:**
  - Derive "no extras" from the page: a single product line, no other line items, and a total equal to the quote.
  - Clear the start grant at any human-intervention stop.

**F-J: duplicate quantity lines collapse into one** (`page-program.js:23`)
- `new Set` merges two identical `数量：1` lines, so two units in the bag read as quantity 1. Only the price cap catches this.
- **Acceptance:** count line items, not distinct texts.

**F-G: polling uses up the step budget** (`job.js:63`, `:70`, `:74`; `maxSteps` 300 in `control.js`)
- 50 ms polls count as steps, so about 15 s of PROCESSING in total ends the run.

### P3
- **Terms check is link presence only.** It confirms the policy URL appears, not its content or version (`page-program.js:76`, `job.js:105`).
- **Weak order identity hash.** `orderRefHash` is an unsalted SHA-256 of a low-entropy order number (`page-program.js:77-78`).
- **Partial prefill is possible.** It can happen when required fields are invalid *after* writing; unknown labels do stop before writing (test `:67`).
- **Unpaid state comes from free text.** Any exact unpaid text on the page counts, not an order-status field.
- **VARIANT quote takes the first RMB amount** (`page-program.js:56-58`).
- **Misleading reason text.** `mutation-transport-lost` also covers local validation failures.
- **The one-order record is fragile.** It lives only in this profile's extension storage: removing the extension deletes it, and other profiles have their own. It is not linked to the Node FileLedger.

### Checked and found sound
- **No final resend:**
  - write-ahead before every send (`job.js:110`);
  - `finalIntent` blocks a second final (`:104`);
  - reconciliation without resubmission (`:51-56`);
  - the in-document command memo;
  - tests at `checkout-job.test.ts:89-102`.
- **Commands are bound to the observed page:** they target the exact `documentIds`, carry the `expected` evidence comparison, and stale reads are rejected.
- **Pro vs Pro Max:** Pro Max is excluded (`page-program.js:19`, `:21-22`).
- **Conditions at the right stage:** bag and fulfillment use the item-only check (`job.js:82-83`); slots and later pages need the full check including pickup and store (`:85`, `:99-103`).
- **No network or secret exposure:**
  - extension pages have `connect-src 'none'`;
  - private pickup data stays in `storage.session` and is passed only to fill details;
  - it never reaches `s.pending` (`job.js:99` stores no data).
- **The confirmation does not reuse the echoed slot.** Confirmation uses the order-detail page's `slotSummary` (`chrome-port.js:22-33`), not the `acceptedSlot` echo. The echo only sets the expectation that REVIEW and the detail page must independently match.
- **The order-detail link is followed only if allowed** by the URL allowlist and a granted permission.
- **Single owner:** the Web Lock enforces one owner, and a different tab id is blocked.

## 3. C-010 and C-011 findings (all P3)

**C-010:**
- **C10-1:** `prepare` (`motor.js:31-35`) adds to bag, checks out and selects pickup in one opaque command. That is fine for a fake, but not a template for real stages.
- **C10-2:** `app.js:26` reports every motor error as `network`. The engine treats it as unknown, which is safe.
- **C10-3:** `dom-bridge.ts:40` skips the `opId` check when the reply omits it. Command id, client and document binding still hold.
- **C10-4:** the token travels in the SSE query string. This is acceptable because it is ephemeral and loopback-only.
- **Verified sound:**
  - Host, Origin and token gates (`dom-bridge.ts:111`, `:120`, `:125`).
  - Controller and document binding (`:127`); a reloaded tab is read-only (`:122`).
  - Bounded input and replies (`:38`, `:42`, `:128`).
  - Single in-flight command with timeout/disconnect becoming unknown and no replay (`:28-45`).
  - One run per task (`:72`, `:82`) and fake plans only (`:66`).
  - Detached-ref and condition re-checks after `change` (`motor.js:41-43`).
  - The final send always returns `unknown` (`:58`).
  - The UI keeps an unknown slot action separate from an unknown submission (`app.js:22`).

**C-011:**
- **C11-1:** the allowlist (`read-entry.js:6`, `popup.js:8`) is missing `/shop/buy-iphone/iphone-18-pro/mjt74ch/a`. The Pro SKU page Codex observed returns `OutsidePublicEntry`.
- **C11-2:** `quotedCny` takes the first RMB amount (`read-entry.js:30`).
- **C11-3:** `sku` comes from the URL (`:38`), not from page evidence.
- **Access dependency:** `activeTab` is granted per user click, per tab, and lapses on cross-origin navigation. It cannot reach `secure*.www.apple.com.cn`. Checkout needs C-012's optional host grants, which **persist in Chrome until the user revokes them**.

## 4. Live-contract blockers (none fabricated)
1. **No real refusal evidence.** There is no real refusal text or refreshed list (F-F).
2. **Only public product pages are real.** Bag, store, slot, details, payment, review, receipt and order-detail DOM are all synthetic. The only real evidence is Codex's read-only prefix on the public pages (ENTRY and PRELAUNCH).
3. **Extension never run for real.** It is not installed, standalone `executeScript` with `documentIds` has never run, `find()` tab discovery is unverified, and coverage of the secure host by the host grant is unverified.
4. **Synthetic events may not work.** Scripted `selectedIndex`+`change` and `click()` produce untrusted events. Whether Apple's controls accept them is unknown.
5. **Unpaid order detail may lack the slot.** If the official pickup date is only set after payment, confirmation can never succeed.
6. **Busy markers are unverified.** If real pages keep `[aria-busy="true"]` set permanently, the job waits forever.
7. **Duo has no real pickup data.** Pickup dates, launch year and the approval-before-sale behaviour are unknown, and date labels carry no year.
8. **Remaining gaps:**
   - DPAPI configuration is not connected;
   - the existing-orders and no-extras checks are human statements;
   - real site speed is unknown.

## 5. Commands and results
I ran only the two approved commands, exactly as written; the suite ran as a background job. Nothing was denied.
- `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-012-candidate-manifest.json` returned `{"ok": true, "files": 115, "sha256": "6932a7a5…c1df0", "mismatches": []}`.
- `node --test "test/*.test.ts" "review/*.test.ts"` returned **312 tests, 312 pass, 0 fail**, about 6.05 s. The suite may create fake state under `.local/test-runs`; I did not inspect it.

## 6. Disclosures and limits
- **Nothing outside the review happened.** No files were written. There was no browser, network, `.local` access, installation, merchant action or agent invocation.
- **The context was compacted once during this review.**
- **Budget:** about $4.0 of $10 used at the last reading. No turn cap was reached.
- **Read in full:**
  - all C-012 extension files except `open.html`;
  - `checkout-job.test.ts` and `checkout-page-program.test.ts`;
  - `dom-bridge.ts`, `motor.js` and `app.js`;
  - C-011's manifest, `popup.js` and `read-entry.js`.
- **Only test names read:** the chrome-port, owner, dom-bridge and chrome-connector tests.
- **Not read:**
  - `web/desktop/fixture.js`, `web/desktop/index.html`, `src/dom-demo.ts`, `popup.html`, `open.html`;
  - the README delta;
  - the two delta patch bodies. I reviewed the files on disk, whose hashes the verifier matched, but did not compare the patches against them.
- **C-010 not fully re-checked.** The engine and runner rely on the earlier C-007 acceptance and were not re-reviewed. I did not re-run Codex's Chrome desktop run.
- **Errata from earlier tasks:**
  - C-007-R1 actually ended `error_max_turns` (46 turns against a 45 limit), so section 10 of my report is wrong.
  - Runbook line 20 "（例如断电）" overstates the evidence: no power-loss test exists.
  - C-009 ended in API429 with no design or agreement delivered.

## 7. Next small functional task I propose: real Chrome store/bag/slot contract capture
**Preconditions:**
- Codex reproduces and fixes F-A and F-B (ideally F-D and F-E too), and a separate reviewer checks the fixes.
- Codex adds an observe-only control mode in which `act` cannot run.
- The user gives separate confirmations at the time of action to:
  1. load the unpacked extension;
  2. grant both optional host permissions (these persist until revoked);
  3. add one Pro to the bag **by hand**, and remove it afterwards.

**Scope:**
- **Ordinary Chrome check:** confirm the extension's ordinary-Chrome reads reproduce Codex's prefix results (Pro ¥9,999 ENTRY; Duo ¥15,999 PRELAUNCH), and that a stale `documentId` is refused after a reload.
- **Real-DOM reads:** observe the real BAG, fulfillment/store and slot-list pages read-only. Switching dates is allowed only if separately authorised; **no time choice and no continuation.**
- **Questions to answer:**
  - Does the real store UI produce the F-A container text?
  - Do disabled dates appear among the first three?
  - What date and time controls and busy markers does the real page use?
  - Is the checkout on a secure host, and does the grant cover it?

**Deliverables:** sanitized structured reads plus dated, clearly marked observed-contract fixtures. Real refusal evidence remains a separately authorised launch-time blocker.
