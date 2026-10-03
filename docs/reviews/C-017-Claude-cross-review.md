# C-017-CROSS-REVIEW report: bounded offline C017 repair, 131-file candidate `5386e64d…3575223`

**Verdict: AGREE, limited to the bounded offline C017 repair.** I found no new blocking issue. This is not native, installed or real-purchasing acceptance, and I cannot self-approve: I wrote this implementation earlier in this same session, so this review is not independent of the author. The independent check is Codex's. REAL_PURCHASING_READY=false.

## Commands actually run
I ran only the two authorized commands, exactly as written:

| Command | Result |
|---|---|
| `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-017-candidate-manifest.json` | `{"ok": true, "files": 131, "sha256": "5386e64d1c2e63050ebfb1a94cf7fe47e014e2a974864711cfbef549c3575223", "mismatches": []}` |
| `node --test "test/*.test.ts" "review/*.test.ts"` | 455 tests, 455 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo (6020.9953 ms). All 6 protected `C017` cases and all 9 `C017 impl` cases pass. |

## Reads
- **Fresh full reads, no offset or limit, all in this invocation:**
  - `docs/requirements.md`, the task sheet, `control.js`, `control.html`, `manifest.json`, `open.js`, `chrome-port.js`;
  - `review/c017-first-host-discovery.test.ts`, `test/checkout-c017-discovery.test.ts`, `docs/claude/C-017-report.md`;
  - the C-017 findings (md and json), the C-017 independent review, actual-verification and candidate-manifest files;
  - the C-014 control-page note and the C-016 bounded agreement.
- **Extra read-only read:** `C-017-input-candidate-manifest.json`, so I could check the change set myself.
- **Earlier reads not reused:** nothing from my earlier implementation reads stood in for these fresh reads.

## Change-set check
I compared the input manifest (130 files) with the candidate manifest (131 files) by reading them. Only these differ:
- `control.js`: `f30dc703…` → `08dbd7cf…`
- `control.html`: `0a5eaf54…` → `78b3907a…`
- new file `test/checkout-c017-discovery.test.ts` (`a3ab588a…`)

These hashes are identical in both manifests: `manifest.json`, `chrome-port.js`, `page-program.js`, `job.js`, `owner.js`, `open.js`, `open.html`, every `review/` file and every old test. This was a visual comparison, not a programmatic diff, because no diff command is authorized. The verifier confirms the current files match the 131-file manifest.

## What the review found
- **First use:** when no tab is selected, the click's first action is `chrome.permissions.request({origins:['https://www.apple.com.cn/*']})` (`control.js:17`).
  - Nothing is awaited before it, and it needs no tab metadata.
  - That origin is already declared in `optional_host_permissions`.
  - It cannot cover `secure*.www.apple.com.cn`, and it requests no `tabs`, wildcard or other permission.
- **Nothing requests permission on its own:** page load and Find never call `permissions.request`.
- **Allow, deny and errors:** all three are reported in Chinese and the handler returns. Synchronous throws and rejected promises are both caught. Nothing runs afterwards: no job, owner lock, storage write, script injection, navigation, checkbox change or retry.
- **Selected tab:** the existing path (`control.js:18`) is unchanged except for its error text. It still requests only that tab's exact host and refuses unsupported pages.
- **Find:** the filtering logic is unchanged. Only the empty-result text changed, and it doesn't imply no stock.
- **Page:** all `control.html` ids are intact and the `final` button is still `disabled`.
- **Unchanged guards:** `manifest.json` and every purchase, unknown-result, no-repeat, slot and date guard are byte-identical.
- **Requirements:** this matches R08 (permissions are a human step), R09 (no merchant mutation) and R10 (Chinese status). R01 and R03–R07 are not touched.

## Non-blocking observations
None of these needs a change within C-017.

1. **Human step order.** The C-014 note's sequence is: read tabs, choose the www tab, then permit. If Find lists a tab (for example, if `activeTab` reveals it), the user ends up on the old selected-tab path. That path awaits `tabs.get` before requesting, and whether Chrome still accepts the click after that wait is unknown. The tab also stays selected, so the first-use path can't be reached until a later Find comes back empty. The C-017 report's order (permission first, nothing selected, then Find) uses the new direct path.
   - Recommendation: Codex should use the C-017 order for the human reload.
   - The synthetic repro is the new test "a selected readable www tab keeps the existing exact-origin path", which records `['get','request']`.
2. **"Allowed" message wording.** The new message says other hosts are approved by selecting their tab. Natively, a selected tab that has moved to an ungranted `secure*` host stays hidden from the extension, so that path reports "不可用". This is the existing open problem of discovering secure checkout tabs, and the wording grants no authority.
3. **Double-click while Chrome's prompt is open.** A second click sends a second request. It is an explicit click, not an automatic repeat. How Chrome handles it (queue or reject) is unknown. A rejection is caught and shows "未完成", which may briefly sit out of order with the first result. Nothing executes.
4. **Find error handling.** If `tabs.query` itself fails, Find still doesn't catch it. This is pre-existing and unchanged.
5. **Test gesture flag.** The tests mark a click as "in gesture" only during the handler's synchronous part. They do not model how long Chrome actually keeps a click's activation. The prompt, gesture handling, stored grant and the URLs revealed afterwards are not proven natively.

## Still pending
- The extension's installed identity and actual permission state.
- Native discovery on first use and the human reload result.
- The real read-only result (native `executeScript`, document and isolated-world behaviour).
- Moving from www to the secure checkout host.
- Real refusal, date and order contracts.
- A program-created one-order endpoint, and speed.
- C-014 native validation and all other previously open scopes.

## Disclosures
- No edits or writes; this review is returned only in this message.
- No permission denials.
- No browser, network, agent, dependency or publishing use, and no private, history, credential, cookie or storage contents.


Codex qualification: this is the author's actual consistency review. Codex supplied the independent review. A harness budget estimate was omitted; cumulative structured counters do not establish an incremental charge.
