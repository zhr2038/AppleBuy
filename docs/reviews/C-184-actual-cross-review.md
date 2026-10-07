# C-184 cross-author review of the ended-draft renewal: bounded AGREE

**Verdict: bounded AGREE.** The renewed-draft authority is a real, limited one-shot, not a disguised way around the existing guards. All three permitted commands passed. Nothing below blocks the candidate; six findings and five test gaps should be recorded before any live renewal. The agreement rests on offline evidence only: every merchant, API, account, approval and unpaid-order outcome in the tests is FAKE.

## Why the renewal authority is legitimate

- **It ends the chain.** The renewed row has no transfer, handoff or empty-restart marker, so nothing can use it as a source again:
  - ordinary transfer needs exactly one of those markers (`cart-transfer.mjs:20`);
  - empty restart needs a handoff or empty-restart marker (`empty-restart.mjs:9-11`);
  - renewal needs a depth-4 transfer with the expired-contact exception.
  
  The longest possible chain is therefore 4 transfers plus 1 renewal. There is no fifth transfer and no second renewal.
- **The markers can't be hidden.** The handoff scanner detects both `desktopEndedDraft` and `retainedSourceArchives` (`job.js:125`), so `retire()` refuses. Buying needs a matching current proof: task, context, session and archive digest (`job.js:212-214`, `browser-session.mjs:38,54`).
- **It is cart-only.** For an ended draft the controller refuses configure, continue, Add, open-product and view-bag (`job.js:475`).
- **The steps run in a safe order:** check the host permission scope, take two bag reads, confirm the source is unchanged, write the archive, confirm the source is still unchanged, validate the new row, and only then write it.
- **Nothing old is inherited.** The schedule restrictions (dates, floors, rejections, refusals, cursor) are copied and can only tighten. No old accepted slot, pending action or final intent carries over.
- **The archive is guarded.** It enforces:
  - a fixed digest format and requires the owner lease;
  - no symlink or junction on the directory, checked by lstat and real path;
  - bounded size and a new temp file that is flushed to disk;
  - publication by hard link, never overwriting;
  - a full re-check after publishing.
  
  A tampered file or name collision fails without overwriting.
- **The C-182 fixes hold.** The peer allows only the one fixed wildcard query. Navigating or commanding a tab now requires the tab's current address to be a checkout page, so an expired tab can't be redirected or commanded (closes C-182 F1/F2). The C-184 test checks zero scripts and zero navigations.
- **The setup page and GUI behave as specified.** The permission button only reacts to a real click on the exact page, requests only the fixed pattern, and never connects the native host or starts buying. In the GUI the tick box is cleared before sending, the final-terms box stays unticked, and pickup data goes only through stdin and is never echoed back.

## Findings (none blocking)

| # | Severity | Finding |
|---|---|---|
| F1 | Low–med (crash) | **The directory is never flushed after publishing.** The archive file itself is flushed (`task-store.mjs:28-29`), and the ledger write replaces the file without flushing the folder (`owner_lease.py:76-80`). After a power loss the new row could survive while the archive name does not. Buying would then be refused, but the only full copy of the old source would be gone, which is the "source erasure" the sheet forbids. NTFS logging probably prevents this ordering in practice, but neither the code nor a test establishes it. |
| F2 | Low (truthfulness) | **A lost write acknowledgement is reported as "old task kept".** If the lease process dies after replacing the ledger but before acknowledging, renewal rethrows (`checkout-runtime.mjs:108-109`). The worker then says "旧任务、未知动作和权限保持" (`native-purchase-worker.mjs:54`), which may be false. The owner-lost message mostly takes precedence in the GUI (`app.py:364-368`). |
| F3 | Low (GUI) | **The renewal label is never reset.** It is set when a ready event reports a renewable source (`app.py:405-406`). A later ordinary source in the same window keeps the renewal attestation text while sending an ordinary `transfer`. The safety impact is nil (it over-attests), and the Python test checks only the action, not the label. A stale renewal flag can resend `renew-draft`; the runtime refuses it. |
| F4 | Practical limit | **A renewed draft only works in its own session.** Validation requires the row's context to equal the current session. After any reconnect or worker restart the draft becomes read-only for good, and no programme path can continue it. That is what makes it non-repeatable, but one transient disconnect ends programme buying for this cart. |
| F5 | Main real-world risk | **An earlier slot hold is not proven released.** The depth-3 layer had an accepted slot. Its window was proved expired only locally, when the depth-4 link was created. Choosing a new slot could create a second concurrent hold, which the requirements forbid. The only cover is the operator's attestation that Apple timed out the old session; the sheet already accepts this. |
| F6 | Low | **The two bag reads are of the same loaded page** (the code requires the same document, `ended-draft.mjs:21`), not a fresh fetch from the server. Later steps re-check product, quantity, total and store. Also, the path check rejects `/shop/bag/` with a trailing slash; this fails closed. |
| F7 | Low | **The final review skips the price-quote comparison.** The renewed row starts with no quote, so that check at `job.js:468` is skipped. The bag total recorded at Checkout (`job.js:484`) is not compared at review either. Ordinary transfers already behave this way, so it is not a regression. I did not re-check after compaction that the purchase-match helper enforces the ¥9,999 cap. |

**Test gaps:**
- No single test runs the renewal against the real task store, kernel lease and archive files. The physical archive tests and the renewal logic tests are separate.
- No test covers losing the owner between writing the archive and writing the new row.
- No test confirms the peer rejects other wildcard patterns.
- No test covers the worker's renewable-source flag or the `renew-draft` routing.
- No test covers an ended draft landing on a product page or empty bag (the `job.js:475` refusal).
- Leftover `.tmp` files after a crash are never cleaned up.

## Command results (exact text, in order, foreground, no denials)

1. Manifest check: `ok:true`, 305 files, sha `e139ab5b…`, no mismatches.
2. Focused tests: **70/70 passed**, 0 failed, cancelled or skipped.
3. Five ordered review checks, all passed with process cleanup confirmed:
   - manifest ok;
   - 108/108;
   - Python 64, 0 failures or errors;
   - full Node 1651/1651;
   - manifest ok again.

## Disclosures

- **Compaction:** one context compaction happened in this session, after reads 1–12 and the first 280 lines of `job.js`, and before any command. Afterwards I re-read:
  - `ended-draft.mjs`, the C-184 sheet and the C-183 verification file in full;
  - `task-store.mjs` in full;
  - `cart-transfer.mjs` lines 1–60, `checkout-runtime.mjs` lines 100–119 and `job.js` lines 205–219.
  
  For the rest of files 1–12 my analysis relies on the pre-compaction reading. I did not use any private compaction logs.
- **Read gaps:**
  - `page-program.js` hit the read cap and was read in two parts, complete to the end.
  - Beyond the 32 listed files I made read-only Grep searches in `src/desktop`, `job.js` and `empty-restart.mjs`, and read lines 5–36 of `empty-restart.mjs`, to confirm the "terminal" claim.
  - I did not read the extension's own `manifest.json`. The claim that it already declares the wildcard permission is backed only by its unchanged hash.
- **Test environment:** command 2's expiry test loads Playwright from the home-directory cache and runs the system Chrome headless, in an isolated context routed only to localhost. That is the test's own behaviour, not something I read, and no personal profile was used. The archive tests create and delete their own folders under `.local/test-runs`; I didn't check that folder afterwards, since no extra command was allowed.
- **Edits and denials:** no files changed, no source edits, no reports written. No permission denials, nothing pushed, no other agents. The production ledger, browser, GUI and registry were not touched.
- **Caps:** about $3.44 of $12 used at the last command. Turns used are well under 70, and I didn't measure wall-clock time. Model, effort and trace need the external check the sheet specifies.
- **Approval basis:** this agreement rests only on the fresh `e139ab5b` manifest. The earlier C-182 and C-175 reviews were not used to approve these bytes.

## Real versus FAKE, and what is not claimed

- **FAKE / local:** the tests' merchant pages, API, approvals, account and unpaid order are FAKE. The archive files and kernel lease are real but local. Page reads used localhost Chrome fixtures, and the host-setup page ran in VM stubs.
- **Real:** I did not check the actual expired source or Apple's page shapes myself; they come only from the sheets.
- **Not claimed:** no real order, no hold release, no speed or end goal, nothing deployed. No live archive, transition or purchase happened.

**Checkpoint:** C-184 is complete. Before any live renewal, the open decisions are F1–F3 and the test gaps. A live run would also need the operator's trusted permission grant on the setup page and the current attestations.
