# C-040 delivery report (Claude author; not an acceptance)

Task: `docs/tasks/C-040-NATIVE-ORDER.md`. The task asked for a self-running, current-executor native journey. It runs the actual production `PurchaseJob` + `ChromePort` + `merchantDocument` from a matching one-item bag through:

- native pickup and the initial first offered terminal slot, with one FAKE slot Continue;
- FAKE pickup details, then Alipay and the final review;
- one simulated submit, producing one unpaid FAKE order;
- a separate receipt-link order-detail lookup.

That journey is delivered. While composing it, I also found one production defect candidate and wrote it up as a reproducible RED (Finding A). I changed no production code. I make no acceptance claim, no live claim, and no Apple-behaviour claim.

## 1. Reads

**Before this session's context compaction** (same original session and call), I read these complete public inputs:
- the task sheet, `docs/requirements.md`;
- `docs/reviews/C-040-input-candidate-manifest.json`, `docs/reviews/C-039-bounded-agreement.md`, `docs/reviews/C-039-cross-review-verification.json`;
- `test/c039-native-pipeline.mjs`;
- `web/checkout-connector/job.js`, `chrome-port.js`, `page-program.js`;
- `test/checkout-c016-details.test.ts`, `test/checkout-c023-final-lookup.test.ts`, `test/checkout-c029-summary.test.ts`;
- `docs/reviews/C-036-normal-pickup-evidence.json`.

**After compaction** I made only targeted re-reads and greps. No private transcript was read.
- the task sheet;
- the C039 agreement and verification files;
- `job.js` lines 128–163, plus greps of the `run` options, read-only reconcile and `mutation-transport-lost`;
- `test/c039-native-pipeline.mjs` line 27 and greps;
- `C-036-normal-pickup-evidence.json` lines 1–80 and 700–724, plus greps;
- a grep of the `test/checkout-c023-final-lookup.test.ts` reconcile;
- a grep of the R01–R10 rows of `docs/requirements.md`.

The manifest check below confirms that all 173 protected sources are byte-identical to the accepted candidate.

## 2. Changes

- **New: `test/c040-native-order.mjs`.** An ordinary, author-owned, self-running native test.
- **New: this report.**

Nothing else was written. In particular:
- no production, source, reviewer, README, dispatcher, config, `.claude/`, `.git/` or `docs/reviews/` file;
- no `test/checkout-c040-order.test.ts`;
- no dependency, download, hook, MCP, SDK or agent.

## 3. Commands and actual results (exact approved forms, no pipes)

1. **`python tools/delegation/verify_candidate_manifest.py docs/reviews/C-040-input-candidate-manifest.json`**
   - Output: `{"ok": true, "files": 173, "sha256": "832c840415d16f658b75b5898c93dd4b53661bef80e739e541e5e4cdcd5a00cf", "mismatches": []}`.
2. **`node test/c040-native-order.mjs`, run 1.** Initial design: every post-slot stage was a new document load.
   - Exit 1.
   - 4 PASS: lost-result, price, slot, missing-proof.
   - 3 FAIL: the positive scenario stopped after `chooseSlot`; quantity-two and other-spec stopped after `continuePayment`.
   - The guard had not run, so: allowed 41, blocked 0.
   - Cleanup: 7 contexts, browser and server closed; errors `[]`.
   - My attempt to read that run's `.local` result.json was **permission-denied** (see section 8).
3. **`node test/c040-native-order.mjs`, run 2.** The only change was printing stop reasons on FAIL lines.
   - Exit 1. 5 PASS, 2 FAIL (other-spec and missing-proof).
   - Both failures were `{"state":"NEEDS_VERIFICATION","reason":"observation-transport-failed","phase":"PAYMENT","pending":"continuePayment"}`.
   - Guard aborted. Allowed 45, blocked 1. Cleanup: 7 contexts, browser and server closed; errors `[]`.
   - These are the intermittent races analysed in Finding A.
4. **`node test/c040-native-order.mjs`, run 3 (final).** Changes since run 2:
   - post-slot stages now use invented same-document renders;
   - the FAKE `tabs.get` no longer evaluates in-page;
   - a deterministic RED scenario was added.

   Result: exit 1, **by design, because of the RED only**.
   - Completion scenarios:
     - `PASS native-order-confirmed-unpaid 956ms`
     - `PASS submit-result-lost-readonly-revoked-resume 877ms`
     - `PASS detail-quantity-two-unconfirmed 834ms`
     - `PASS detail-price-over-cap-unconfirmed 850ms`
     - `PASS detail-other-spec-unconfirmed 849ms`
     - `PASS detail-other-slot-unconfirmed 850ms`
     - `PASS detail-slot-proof-missing-unconfirmed 897ms`
   - `RED RED-post-slot-document-change-read-loss 331ms`, with runs `[{"kind":"start","state":"NEEDS_VERIFICATION","reason":"observation-transport-failed","phase":"SLOTS","pending":"chooseSlot"}]` and actions `checkout,selectPickup,chooseSlot`.
   - Summary: `completionPassed:true`, `redReproduced:["RED-post-slot-document-change-read-loss"]`, `checks:8`.
   - Guard: `{"url":"http://127.0.0.2:11610/FAKE-c040-guard","outcome":"aborted","blockedDelta":1,"serverHits":0}`.
   - Network: allowed 52, blocked 1 (only the guard URL).
   - Cleanup: `{"contextsClosed":8,"browserClosed":true,"serverClosed":true,"errors":[]}`.
   - Result file: `.local/c040-native-order/2026-10-04T08-12-46-580Z/result.json`.
5. **`node --test "test/*.test.ts" "review/*.test.ts"`**: run once, after the final test change.
   - **Exit code 0** (the tool reported no error exit). node's test runner exits non-zero on any failure, so no test failed.
   - The tool saved the output (about 100.9 KB) to a session file. My read of that file for the `ℹ tests/pass/fail` totals was **permission-denied**, so I cannot state the numeric totals.
   - I did not rerun it just to obtain totals.

**Unrun:** `node --test test/checkout-c040-order.test.ts`, because that file was not created.

## 4. Design and why

- **Executor.** The test uses the actual production `PurchaseJob`, `ChromePort` and `merchantDocument` sources.
  - The FAKE `chrome.scripting.executeScript` runs the real `x.func.toString()` program inside the rendered owned document.
  - The document token, the FAKE href and the production decode are all taken in **one** evaluation, so the document identity is atomic.
  - There is no DomMotor, no canned observation or lookup result, and no classifier change.
- **Start point.** The journey starts at the matching one-item bag, so C039's Add coverage is not repeated. The FAKE start grant binds the observed bag document id.
  - Grant fields: `start:true`, `existingOrdersChecked`, `noExtras`, `termsAccepted`, `termsUrl` = sales-policy link, expiry +10 min.
  - Port options: `authorized`, `orderSummary:true`, FAKE `privatePickupData`, `reviewGrant` = the same grant.
  - Job: `maxSteps` 80.
- **Native causation.** Every transition and backend event comes from a native control handler on the page: checkout click, pickup radio, time `<select>` change, slot Continue, details Continue, Alipay radio change, payment Continue, and the 立即下单 click. The handler sends the event to the FAKE backend, which acknowledges it, and only then does the page move on.
  - The backend order is created from the backend's own `cart` and `sel` state, which only native events set. It is never created from UI text.
- **Post-slot transitions.** Stages render inside the same `/shop/checkout` document: fetch, `pushState`, body swap and handler rebind all happen in one task.
  - This is **invented**. I chose it because it matches the observed C036 in-page pickup render and the single observed `/shop/checkout` URL, and because production expects the receipt at exactly `/shop/checkout`.
  - The document-load variant is kept only for the RED scenario.
- **Lookup.** The order detail is a separate document. Production `lookupOrder` reaches it through the FAKE `tabs.update` to the receipt's `查看订单详情` link.
- **Grants after a stop.** A Resume after any stop uses a new port **without** a grant (the `pending` and `initialSequence` come from the stored row). This is the only way a stopped task continues.
- **Secrets.** The FAKE details are `FAKE名`/`FAKE姓`, phone `00000000000`, email `fake-c040@example.invalid` and identity suffix `0000`.
  - They exist only in test memory.
  - The test asserts that none of them appears in the durable task row.
  - They are not written to the result file. The result records only booleans saying the details were written once and are absent from the durable row.

## 5. Evidence (FAKE fields, counters, lookup)

### Common to all 7 completion scenarios (asserted)

- **Native commands.** The non-summary command list is exactly `checkout, selectPickup, chooseSlot, fillDetails, selectPayment, continuePayment, submitOrder`. Order-summary reads are separate (`readOrderSummary`), and every opened summary was closed (`summaryOpen === summaryClose`, ≥5).
- **Backend counters.**
  - Exactly 1 each: checkout, pickup, time, slotContinue, detailsContinue, payment, paymentContinue, and **submit (the native final click)**.
  - 0 each: store and date changes. R609 was already checked and day 4 was the initial checked date, so the first offered terminal on the initial first date was taken.
- **Backend orders: exactly 1.** It deep-equals `{id:'FAKE-C040-0001', title:'iPhone 18 Pro 256GB 黑色', quantity:1, totalCny:9999, store:'Apple 大连恒隆广场', storeId:'R609', date:'October 4', time:'21:15 – 21:30', payment:'支付宝', state:'unpaid', paid:false}`. This record is independent of any UI success text.
- **Details.** The values received by the page's Continue handler equal the FAKE fixture. Each of the 5 fields saw exactly 1 `input` and 1 `change` event, from production's native setter path.
- **Final state.** `finalIntent.sent === true`. `acceptedSlot` is October 4, 21:15–21:30.
- **Lookup.** Navigations are exactly `['https://www.apple.com.cn/shop/order/FAKE-C040-0001']`, and both the receipt stage and the order stage were read by production.

### Scenario-specific evidence

- **Positive** (`native-order-confirmed-unpaid`):
  - The start run stops with `NEEDS_VERIFICATION` / `final-result-unconfirmed; no resubmission`, pending `submitOrder` (see Finding B).
  - Resume → `CONFIRMED_UNPAID`, pending null, `orderRefHash` = SHA-256(`FAKE-C040-0001`).
  - Re-running with the consumed start grant returns `CONFIRMED_UNPAID` with no new command and still 1 order.
  - The guard runs here.
- **Lost submit result** (the order exists; the FAKE `executeScript` throws after delivering the real click):
  1. The start run stops with `mutation-transport-lost; reconcile before proceeding`, pending `submitOrder`.
  2. A same-tab read-only reconcile returns `final-result-unconfirmed; no resubmission`, with no navigation and no command.
  3. Presenting the same (now revoked) grant returns `BLOCKED` / `advance-authorization-cleared-by-human-intervention`.
  4. Resume → `CONFIRMED_UNPAID`; a consumed-grant re-run stays `CONFIRMED_UNPAID`.
  5. Totals: submit 1, orders 1.
- **Wrong or missing detail proof.** The detail page alone is altered: quantity 2, total 10,999, colour 银色, time 21:00–21:15, or the time line removed.
  - Resume → `NEEDS_VERIFICATION` / `final-result-unconfirmed; no resubmission`, pending `submitOrder`, final intent kept.
  - Submit stays 1, orders stay 1, the backend order is unchanged and exact, and exactly one lookup navigation occurs.

## 6. Findings (production unchanged)

### Finding A — reproducible RED (defect candidate)

**Behaviour.** A transient read loss across a normal post-slot document change abandons an already-successful slot Continue.

**Exact conditions:**
- the actual job and port;
- pending `chooseSlot`, dispatched and natively effective (backend `slotContinue` = 1);
- the merchant loads the next stage as a new document;
- the first observe's `executeScript` rejects once (`Frame with ID 0 was removed.`, modelled on a Chrome injection into a frame that navigates away — the message is not repository evidence);
- later reads would succeed.

**Actual.** The job gates `NEEDS_VERIFICATION` / `observation-transport-failed` with pending `chooseSlot`. The read-failure catch (`web/checkout-connector/job.js:182`) retries only for `NAVIGATING` actions (`openProduct`, `openBag`, `addBag`, `viewBag`, `checkout`).

**Also seen.** The same stop occurred intermittently under natural races for pending `chooseSlot` and `continuePayment` (runs 1–2).

**Expected.** Re-read within the pending deadline **without replay**, as C038-R1 does for bag-side navigations, then reconcile the accepted slot normally and continue.

**Reproduce.** `node test/c040-native-order.mjs`, scenario `RED-post-slot-document-change-read-loss`. It is deterministic and keeps the exit code at 1.

**Caveat.** Whether Apple's real post-slot stages are document loads is **unverified**.

### Finding B — note, not a RED

**Behaviour.** After the final click, `submitOrder` reconciliation does not wait while the page still shows REVIEW or PROCESSING.

**Conditions.** With the FAKE 150 ms merchant processing, the start run always stops `final-result-unconfirmed; no resubmission`, and only a separate Resume confirms the order. This is safe: there is never a resubmission. But completing in one run needs a Resume.

**Proposal for Root.** Add a bounded wait while REVIEW or PROCESSING persists, never resubmitting. I did not make this a RED because the conservative behaviour may be intended.

**Test tolerance.** The test accepts either a direct `CONFIRMED_UNPAID` or exactly this stop followed by a Resume.

### Finding C — real-contract risk

Production accepts a summary dialog without a shipping row only while a current pickup radio is checked. On later pages, the test supplies an **invented** `运费 免费` row. Apple's real later-stage summary shape is unknown.

## 7. Observed vs invented

**Observed** (sanitized C029/C035/C036):
- the bag line and quantity select;
- delivery/pickup segmented radios, the companion bar and the summary dialog shape;
- R609 with the full label `1\nApple 大连恒隆广场\n今天 可取货\n店内取货`;
- date radios with day 4's serialized initial `checked`, and labels `October\n4/5/6`.

**Derived from observation:**
- October 4's 46 time options were derived from the recorded October 5 texts.
- They were checked against the recorded Oct 4 enabled count 46, first key `4-10:00-10:15`, last key `4-21:15-21:30` and last text `21:15 – 21:30`.

**Invented / test-only:**
- **Pages:** all details/payment/review/receipt/order-detail markup, titles and buttons. This includes the 5 detail labels and their required inputs, the three payment radios, and the disabled checked payment radio on review.
- **Later-page prose:**
  - the proof lines `取货地点：…`, `店内取货`, `取货日期：October 4`, `取货时间：…`;
  - the `运费 免费` row;
  - the terms link text;
  - `订单号：FAKE-C040-0001`, `待付款`;
  - the receipt at `/shop/checkout`;
  - the single-segment `/shop/order/<id>` detail URL.
- **Dynamics and timing:**
  - same-document stage renders (document loads in the RED variant);
  - the 35 ms and 150 ms timings;
  - the date-change option relabelling.
- **Backend and Chrome plumbing:**
  - the backend order store;
  - all Chrome APIs, permissions, URLs, document ids, storage and authority.

## 8. Limitations, denials and caps

**Permission denials** (failures, not retried):
1. Read of `.local/c040-native-order/2026-10-04T08-09-25-270Z/result.json`.
2. Read of the session tool-results file holding the full-suite output. Because of this, the full-suite numeric totals are unknown to me; only the exit code (0) is known.

**Other limitations:**
- The real Apple refusal catalog is still EMPTY. No refusal marker or transport-decoding change was added, and real refusals, latest lists and holds are unverified.
- Not tested: Duo, the personal installed extension, a real one-start, official speed, and the real later-stage, receipt and order-detail contracts. The full goal remains incomplete.
- Timings are local measurements of the simulation, not speed claims.
- Headless Chrome was fresh and isolated: no personal profile, extension, authentication or permissions; external origins and websockets were blocked. No Apple request, cart, slot, order or payment occurred, and the earlier Pro authority was not renewed.

**Caps:** I did not measure turn or wall usage precisely, and I make no billing or aggregate-usage claim.

## 9. R01–R10 mapping (simulation only)

- **R01:** the exact plan (Pro 256GB black / 9999 / qty 1 / Dalian R609 / pickup / initial first ≤3 terminal / Alipay / no extras) is held on every page.
- **R03:** no store or date re-selection; one pass.
- **R04:** the first offered terminal slot is taken, and the result is verified from the next stage.
- **R05:** not exercised (refusal catalog empty).
- **R06:** unknown final result and wrong or missing detail proof stay unconfirmed.
- **R07:** one final click and one order across loss, read-only, revoked-grant and resume.
- **R08:** read-only reconcile, revoked grant and Resume.
- **R09:** FAKE-only, no real effects.
- **R02 / R10:** not in scope.

## 10. Recovery point

- `test/c040-native-order.mjs` is complete. The expected current output is 7 PASS + 1 RED, exit 1.
- Root should independently reproduce Finding A (job.js:182 retry set) and decide on a narrow original-session fix.
- After such a fix, the RED scenario should progress to `CONFIRMED_UNPAID` and the command should exit 0.
- Finding B and Finding C are for Root's decision.
- No other pending work in this call.
