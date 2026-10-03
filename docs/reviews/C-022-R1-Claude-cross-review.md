All required files are read and both allowed commands have run.

**Verdict: AGREE** for this exact candidate only: 145 files, SHA `1881005394febf0f2ed1f3635d8b4a92e3559e28c4419b9572b5635c7df6ecf9`. This is a review verdict, not acceptance. Codex decides bounded acceptance, and the complete project objective remains unproven. I wrote the R1 `job.js` change and the 6 tests in `test/checkout-c022-status-truth.test.ts` myself, so my review of them is not independent. Codex's 12 cases are the independent check.

## Identity and tests (actual runs in this task)
- **Manifest check:** `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-022-R1-candidate-manifest.json` returned `{"ok": true, "files": 145, "sha256": "1881005394fe…6ecf9", "mismatches": []}`.
- **Full suite:** `node --test "test/*.test.ts" "review/*.test.ts"` gave tests 654, pass 654, fail 0, cancelled 0, skipped 0, todo 0, in 5968 ms.
  - I searched this run's saved output and found no `✖` lines.
  - The tool did not print a numeric exit code and reported no error.
- **Changes against the 144-file input manifest:** I read both manifests in full and compared them entry by entry by eye; no diff command was allowed.
  - Only `web/checkout-connector/job.js` changed (`55e00385…` → `7c49d57b…`).
  - Only `test/checkout-c022-status-truth.test.ts` was added (`00bf30e8…`).
  - The other 143 entries have identical hashes, including every `review/` file and every other `test/` file.
  - Since the verifier confirmed the files on disk match the manifest, the 78 protected test/review files are byte-identical to the input.
- **C017:** `test/checkout-c017-discovery.test.ts` still has hash `9706beb8…`. Its earlier exact-ID expansion stays disclosed. I do not claim it is byte-identical to its pre-C021 version.

## F1 verification (current `job.js` line numbers)
**Exactly two resets were added.** Not byte-diffed, but every other `observationCurrent` site in web/ is the same as before (search below), and the file is 254 lines against the 249 reviewed in C-022. The extra 5 lines are 3 comment lines and 2 statements.
- **Run-entry reset:** `job.js:102`, after the migration at `:99` and before the first possible save or stop.
- **Write-ahead reset:** `job.js:230`, before the write-ahead save at `:231`.
- **Unchanged sites:**
  - the status emit at `:56`;
  - the reset before each read at `:124`;
  - the only place it becomes true, after a valid read, at `:127`.

**The flag is false at every early stop and return before a read:**
- The throws at `:76`, `:81`, `:82`, `:88` and `:95` send no status at all.
- The binding stop (`:104`), final intent already used (`:110`), revoked grant (`:111`), the RUNNING save (`:112`), step limit (`:118`), expiry (`:121`), stop (`:122`) and pause (`:123`) all report false.
- The CONFIRMED_UNPAID return at `:109` writes nothing and returns false. The stored record keeps its old flag, but nothing displays it: `control.js:124` shows only the state and binding.
- A failed read (`:125`) and an invalid or stale read (`:126`) report false.

**It stays false after write-ahead until the next valid read:**
- the write-ahead save at `:231`;
- the "not dispatched" pause/stop at `:232–235`;
- transport lost at `:237`;
- the untouched record and its stops at `:241–245`;
- the post-action save at `:249`;
- the next stops at the top of the loop.

**Fresh-read positives still report true:**
- control changed during the read (`:128`) and start authorization (`:129`);
- the pending-reconciliation and STOP-phase stops;
- read-only completions at `:153`, `:158` and `:160`;
- stops before sending at `:219–221`.

Each of these follows a valid read in this run with no command since. Bounded waits (`:148/155/161/173/189`) keep true, which matches the agreed definition.

**Test evidence:** Codex's 12 cases (7 pre-read stops, 3 lost/pause/stop, 2 read-only positives) and my 6 cases all pass (output lines 175–186 and 453–458).

**No purchase decision changed.** Searching web/ shows `observationCurrent` is read only by the status emit (`job.js:56`) and the label at `control.js:33`. `validStored` does not check it, and `chrome-port.js` and `page-program.js` never touch it. The two statements add no save, read, action, wait or stop.

**Protections still in place (read fresh this task):**
- **Read-only reconcile:** cannot be combined with rebind (`:76`), never creates a task (`:82`, `control.js:75`) and discards grants (`:84`).
- **Expiry:** exempt only for this read, and `expiresAt` is never written (`:121`).
- **No polling and no order lookup** in read-only mode (`:136`, `:148`, `:155`).
- **The control page:** uses an observe-only port (`control.js:79`), takes the ownership lock, checks the cancellation ticket after every await, and reads no session data on reconcile.
- **Unchanged:** pending/sent/not-dispatched truth, history, expiry, binding, current-grant checks and unknown-final handling.

**Quantity and refusal chains still pass.** `page-program.js` is unchanged (`a5cc1829…`, quantity logic at `:84–89`), and these cases pass:
- the quantity121 aggregate;
- a selected quantity of 1 across option order, hidden clones and large lists;
- quantities 0 and 2;
- a hidden control;
- a separate or literal 2, and a conflict behind a large option list;
- two controls;
- a hidden bag anchor;
- the nested, hidden-nested and unrelated-select cases;
- refusal → fresh reselection: output lines 254, 467, 473, 619–626 and 646–649.

## New finding O4 (non-blocking, my judgement): order lookup can leave an old page labelled current
- **Where:** `job.js:138` calls `port.lookupOrder`. In `chrome-port.js:33–35` that function can navigate the tab (`tabs.update`) to the order-detail link seen on the receipt and read that page. The job does not update `lastPhase` from that read.
- **Effect:** the next save or stop shows `observationCurrent:true` with the pre-lookup phase:
  - CONFIRMED_UNPAID (`:139`), or
  - NEEDS_VERIFICATION with "final-result-unconfirmed" (`:140`).
  - The status then reads "页面：ORDER_RECEIPT" while the tab is showing the order-detail page.
- **Repro (from reading the code; not run):** a stored task with a dispatched pending `submitOrder`, `finalIntent.sent:true` and a matching `orderRefHash`. A FAKE ChromePort first reads a verified ORDER_RECEIPT with `orderDetailLink`, and the fake `tabs.update` switches to ORDER_DETAIL. Run in purchase mode and check the last emitted state.
- **Why I don't block on it:**
  - It is a separate mechanism (a read-only navigation, not a merchant command or a persisted flag) and predates C021/C022.
  - It is outside the F1 fix I asked for, which R1 implements exactly.
  - It only occurs after a final order has been sent. That cannot happen now: there is no new order authority and no native one-click order.
  - The safety-relevant text is still true: "待确认动作：提交订单；请勿重复执行", and the CONFIRMED_UNPAID result itself comes from the independent detail-page read.
- **To accept, if Codex treats it as in scope:** reset the flag immediately before `lookupOrder` at `:138`, or record the lookup's own phase. Add a FAKE case for it.

## Known residuals O1–O3, actual scope (unchanged, not fixed or expanded)
- **O1:** `control.js:33` auto-fills `hostOrigin`, and the value stays. While it is non-empty, it takes priority at `:19` over the selected-tab and public permission requests. Only whitelisted origins are used, and Chrome still prompts.
- **O2:** the CONFIRMED_UNPAID return at `:109` emits no status, and `control.js:62/80` set none, so the previous status text stays on screen.
- **O3:** a direct job-level reconcile with a different tab or digest writes BLOCKED at `:104`, keeping pending, history and expiry. The UI blocks this case earlier (`control.js:77–78`).
- **Stale `permissionOrigin` help text:** a whitelisted origin saved by an earlier failed read is still shown, with the "当前主机尚未获访问权限" help and the auto-fill, at stops before the first read (`:104–123`, including the brief RUNNING save). It is cleared at `:124` and `:127`.

## Reading scope
- **Fresh full reads in this task:**
  - this task sheet (read earlier in this same task, before a context compaction) and `docs/requirements.md`;
  - `C-022-Claude-actual-review.md`, `C-022-actual-review-verification.json`, `C-022-R1-before-verification.json`, `C-022-R1-actual-verification.json` and `C-022-R1-candidate-manifest.json`;
  - `docs/claude/C-022-R1-report.md`;
  - `job.js`, `control.js` and `page-program.js`;
  - the four required test files.
- **Extra fresh reads:** `C-022-R1-input-candidate-manifest.json` and `chrome-port.js`, read in full.
- **Searches:** `observationCurrent` across web/, plus two searches of the saved test output.
- **Reused from the earlier 20-file review, not re-read:** `control.html`, `review/c021-auth-handoff.test.ts`, `test/checkout-c021-auth-handoff.test.ts` and `test/checkout-c017-discovery.test.ts`. Their hashes are identical to the C-022 manifest values in my earlier-session record. I did not re-read the 143-file manifest in this task.

## Limitations
- Only the two exact commands were run, unchained. I made no repro scripts (so O4 is from reading the code), no byte diff of `job.js` and no exit-code capture.
- All tests are FAKE. The following remain unverified or open:
  - real FULFILLMENT shows no explicit quantity and splits the money summary;
  - native corrected BAG reconciliation is still waiting for the human after reload;
  - the Chrome controlling extension needs updating;
  - native one-click order, the Duo contract, real refusal/reselection and speed.
- The old human-rebound task stays permanently read-only. The prior single Pro order permission is used up, and this review grants no bag, slot, order or payment authority.
- I hit no permission denials and no provider quota errors. I used about 7 turns and about USD 1.5 on the local counter (caps: 48 turns, 1800 s, USD 10). I did not measure wall-clock time, but the test run took about 6 s.
- I made no edits, wrote no memory, published nothing and did not shut down.
