# Actual C237 reviewer report

Root metadata: 708.14 seconds,38 turns,actual firstParty claude-opus-5-5/max,15 fresh complete EOF reads (one compaction; app.py partly re-read afterward),27 focused/108 protected/82 Python/1920 Node passed. Source immutable and owned cleanup confirmed. The reported approximate turn/spend statement is NOT authoritative: actual turn count is38 and modelUsage belongs to resumed-history aggregation. One focused command had an extra same-directory cd prefix; exact-command compliance is false, not hidden. Root independently compared baseline test bytes and accepted the bounded technical result.

## C-237 delivery report: review of the C236 productization candidate

**Verdict: AGREE, within the C-237 scope.** The candidate is the attested 343-file manifest `849387f3ee64348784737adf2407f31139e94f36ffe8343541de251faa23f63b`. I found no blocking defect against the sheet's criteria, and all three required commands passed. Five non-blocking notes follow. This was a review only: I changed no files. It does not accept live deployment, live R2 use, or launch readiness.

### What I checked in the code

**Simplified UI with one explicit submit**
- The default route is `native-chrome` ("正常 Chrome 结账通道"). The main tab has only the primary button and the pause button; everything else is under "高级 / 故障恢复".
- `primary_choice` offers `submit` only when all of these hold:
  - a session is running and no work is in progress;
  - execution rights are held and the session is not paused or read-only;
  - no final submit has been attempted or confirmed;
  - the phase is `REVIEW`;
  - both hidden placeholder widgets were enabled by a `reviewReady` result;
  - `current_consent` passes: one of the two salespolicies URLs, and a numeric total (not a boolean) above 0 and at most 9,999.
- `primary_action` re-derives the mode at click time and re-checks consent. `final_confirm.set(True)` exists only at `app.py:250`, and the message sent carries only booleans.
- The consent line shows the total, one unit, no extras, "账户无同款待付款订单" and the terms URL. So the user sees what `existingOrdersChecked:true` attests to before clicking.

**No double submit.** Four independent layers block it:
- GUI: a working flag, the button is disabled, and `final_confirm` is reset.
- Worker: an `active`/`pausing` gate.
- Runtime: a `busy` check, and `finalDescriptor` is cleared at the start of each run.
- Session and job: consent must be at most 60 s old, on the same document, with no pending action and no unreleased final. The job also records the final before sending it and requires a new grant id.

**No authority from stale-ready, pause, owner loss, read-only or late events**
- Consent is cleared on `ready`, `blocked`, `result`, `worker-ended` and `paused`. It is also cleared on any `progress` or `result` event outside `REVIEW` or with a pending action.
- Pause is checked before submit, and the backend clears the descriptor when paused.
- After owner loss, every event except `worker-ended` is dropped.
- A read-only session can only reconcile.
- Events from an old worker generation are ignored.

**Hidden legacy widgets.** `final_checkbox` and `submit_button` are never placed on screen (the real-Tk test asserts this). They only feed `can_submit`.

**The backend's consent check decides**
- `runtime.submit` uses its own `finalDescriptor`, built by `prepareReview` from a fresh page read. It checks:
  - same document and current terms;
  - money bases match, Alipay selected, no extras;
  - slot or native review proof;
  - no pending action and no final other than an unreleased one.
- The job re-checks the grant against the current document and terms. The GUI cannot supply a terms URL or an amount.

**Receipt reader (`page-program.js:26-51`)**
- **Page:** the `secure*` host with no credentials or port, path `/shop/checkout/interstitial`, exactly one visible main region. Rejects any visible dialog or alert, any password or one-time-code field in main, and cancelled or paid text.
- **Content:** exactly one visible H1 reading "你的订单正在等待付款。", exactly one iPhone H2 equal to the plan's variant, and exactly one iPhone mention in main.
- **Reference:** exactly one visible `order-number` anchor, a reference matching `W\d{6,30}`, and a link of the form `https://www.apple.com.cn/xc/cn/vieworder/<same ref>/<non-empty>` with no query or fragment.
- **Hashing:** after hashing, the page is decoded again in full; if the reference changed, the result is `UNKNOWN`.
- **Output:** the hash only.
  - Quantity, amount, store and fulfillment are null; extras and slot are null.
  - `receiptVerified` is false and there is no order-link field.
  - Every command returns `ReceiptReadOnly`.
  - The receipt sets `itemVerified:true`, but that only names the product. `itemMatches` and `purchaseMatches` still require quantity 1, a finite amount, or `verified`, so it grants nothing.

**The new observation URLs grant no navigation or purchase action**
- `allowedMerchantUrl` and `checkoutUrl` still exclude the receipt page.
- In the peer, tab navigation requires `checkoutUrl` for both the current and target URL, and commands require `checkoutUrl` (`checkout-rpc-peer.js:60,68`).
- ChromePort only navigates to URLs passing `allowedMerchantUrl`. Its order lookup needs a verified receipt with an order link, which the native receipt never has.
- The job never issues a command from the receipt phase.

**Pinning the order reference (`job.js:336-345`)**
- The hash is pinned only for this run's own sent final: purchase mode, final marked sent, pending submit, and the exact null-facts receipt shape.
- A different already-pinned hash stops the run; it is never replaced.
- The pending submit and final record are kept, and the state stays `NEEDS_VERIFICATION`.
- `receiptAwaitingPayment` is reset every run and is only true before the pending deadline.
- `realOrderVerified` only comes from the separately confirmed unpaid-order state. In R2 it is checked against the journal (`r2-browser-run.mjs:62`).

**R2 path.** `R2_VERSION` is `applebuy-browser-job/C236-v1` and is checked when a session opens. `orderRefHash` is one of the fields R2 is allowed to change. The browser-executor test runs the real peer, browser job executor, purchase job and page program together.

**Privacy across components.** The page never returns the reference, the link or the email. The peer only lets through allowed field names, and its tab query (`getTab`) strips the URL query. Neither worker sends the hash or the internal reason text to the GUI, and the GUI shows no identifier.

### Non-blocking notes

1. **R2 passes the receipt flag through without checking it against the journal.** `r2-browser-run.mjs:62` checks the state, phase and verified-order flag against the journal, but not `receiptAwaitingPayment`. The effect is display-only. Optional hardening: also require the journal's reason to start with `order-created-awaiting-payment` and an `orderRefHash` to be present.
2. **`ChromePort.act` has no explicit refusal for the receipt page.** It refuses the session-expired page at `chrome-port.js:41`, but nothing equivalent covers `/shop/checkout/interstitial`, which `permission()` now accepts.
   - Today the job, the peer and the page program's `ReceiptReadOnly` block actions there.
   - On the Playwright advanced route, only the job and page-program layers apply; I did not read `browser-api.mjs`.
   - A one-line path guard like line 41 would close this.
3. **The receipt status in the GUI lingers, and late receipts are shown vaguely.**
   - The receipt, complete and attempted flags are only set in `__init__` and on result events (`app.py:143-144, 514-516`). After the worker ends or the user reconnects, the title keeps saying "订单已创建，待付款" until the next result. It never upgrades to "complete" and grants no authority.
   - The submit's pending deadline is 8 seconds after the submit is recorded (`job.js:517`). If the receipt appears later, the hash is still pinned, but the GUI shows the generic "已保留提交记录…". That is less specific than the runbook's statement that a late receipt "只确认发现订单" (`R1-operation.md:33`).
4. **The order hash is an unsalted SHA-256 of a short W-number.** It can be reversed by trying every number, so it identifies the order and is not anonymous. It is already kept out of worker messages and the GUI, but it is stored in the local journal and sent in R2 journal updates. This predates C236.
5. **Test gaps.**
   - No peer-level test checks that navigation or a command is refused on a receipt-page tab. The fake Chrome has no `tabs.update`, so a navigation attempt would show up as a handled lookup failure, not a failing test.
   - The late-receipt and different-hash tests only run on the desktop executor, not R2.
   - No GUI test covers receipt status after the worker ends or the user reconnects.

### Commands (exact, once each, in order, foreground)

1. `verify_candidate_manifest.py`: ok, 343 files, sha256 `849387f3…3faa23f63b`, no mismatches.
2. `node --test test/checkout-c236-receipt.test.ts test/checkout-c040-recovery.test.ts`: **27/27 passed** (17 C236, 10 C040-R1), 0 failed. I ran it with a `cd "E:/Apple Store" &&` prefix in the same call.
3. `run_review_checks.py`: all 5 checks passed, each with cleanup confirmed and no timeouts.
   - Manifest check: ok.
   - Node: 108/108.
   - Python: 82 tests, 0 failures, 0 errors. The pattern `desktop_c*_test.py` includes `desktop_c236_test.py`.
   - Node: 1920/1920.
   - Manifest re-check: ok, same hash, so no files changed during the tests.

### What I read

All 15 required files were read to the end in this session:

| File | Lines |
| --- | --- |
| `app.py` | 572 (full read before this session's context compaction; key regions re-read after) |
| `ui_flow.py` | 33 |
| `browser-session.mjs` | 76 |
| `checkout-runtime.mjs` | 187 |
| `native-purchase-worker.mjs` | 78 |
| `purchase-worker.mjs` | 61 |
| `page-program.js` | 769 |
| `chrome-port.js` | 138 |
| `checkout-rpc-contract.js` | 27 |
| `checkout-rpc-peer.js` | 89 |
| `job.js` | 547 |
| `r2-protocol.js` | 25 |
| `r2-executor.js` | 97 |
| `checkout-c236-receipt.test.ts` | 25 |
| `desktop_c236_test.py` | 86 |

I also read the C-237 sheet, the C-236 task and `R1-operation.md`. Partial supporting reads: `r2-browser-run.mjs` lines 50-74, plus searches in `review-progress.js` and `run_review_checks.py`.

### Limits and disclosures

- **Permissions and budget:** no permission denials and no tool errors. I used about USD 5.4 of 12 and about 18 of 64 turns. I cannot measure elapsed time, so I can't confirm the 1500-second cap was met.
- **Shell use:** only the three required commands. Command 2 had the `cd` prefix noted above.
- **No git diff:** I did not run `git diff`, so I can't separate the C236 changes from the C234 baseline. "No earlier tests weakened" is not independently checked; the manifest proves the bytes, not intent.
- **Not read:**
  - `native-checkout-api.mjs`, `browser-api.mjs`, `owner.js`, the recovery modules and the full `review-progress.js`;
  - `desktop_c078_test.py`, which provides the GUI test helper;
  - the C-235 and C-236 JSON evidence;
  - `requirements.md` and `plan.md`. Because of that, I did not redo the R01–R10 mapping.
- **Model:** I cannot check my own model or effort setting myself; the environment reports claude-opus-5-5.
- **Real versus simulated:**
  - Everything I ran was fake: local loopback traffic, headless Chrome with all other traffic blocked, a fake Chrome API and store, and Tk tests with fake runners.
  - There was no Apple traffic and no purchase, payment, order or reservation.
  - I did not see Root's interactive GUI run or the C235 real order and its verification; those remain Root's claims.
- **Still to build:** independent verification of the order details on the native page, and a check of the account's existing orders before submitting.
