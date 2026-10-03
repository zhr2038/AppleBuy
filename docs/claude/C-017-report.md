# C-017 delivery report — first-use official-host discovery (Claude)

Status: **implemented on synthetic evidence only; not accepted.** Codex must verify independently and obtain an exact-scope agreement before the human reload. Native first-host discovery, the real read-only result and a program-created one-order endpoint remain separate, pending acceptance milestones. REAL_PURCHASING_READY=false.

## Input verification

`python tools/delegation/verify_candidate_manifest.py docs/reviews/C-017-input-candidate-manifest.json` was run before any edit and returned `{"ok": true, "files": 130, "sha256": "67a23b8cb5f0d7efa1719d92a4f75b7ef44072c758af6568a99ef9a946a40d88", "mismatches": []}`. It was not re-run after the edits; a mismatch on `control.js`/`control.html` is expected and is not a final manifest.

## Design decision and reasons

Problem: without host or `tabs` access, Chrome omits `Tab.url` (official Tabs API, as summarized in the C-017 findings). Find filters on `t.url`, and the old permission handler needed a selected allowed tab. First use therefore deadlocked.

Fix, in `control.js` (permission handler only):

- **No tab selected** (`$('tab').value` empty, which is always the case at first use): the handler's first statement is `chrome.permissions.request({origins:[PUBLIC_ORIGIN]})`, with `PUBLIC_ORIGIN='https://www.apple.com.cn/*'`.
  - The call runs synchronously. No `await`, `tabs.get` or `tabs.query` comes before it, so it runs inside the click's user activation.
  - It needs no tab metadata.
  - The origin is already declared in `manifest.json` `optional_host_permissions`.
- **Outcome is only reported, in Chinese:**
  - allowed: tells the user to click "读取当前官网标签页" again, and says other official hosts (such as checkout) need their own approval from a selected tab;
  - denied: "未允许；未执行任何操作";
  - sync or async error: "请求未完成；未执行任何操作".
  - Then it returns. There is no automatic retry, no automatic Find and no follow-up request.
- **Tab selected:** the existing exact-origin path is unchanged (`tabs.get` → `allowedMerchantUrl` → request `<exact origin>/*`). Only its catch text gained "；可重新读取官网标签页".
  - A secure host is never requested because the public host was consented. It is only requested when the user selects a readable tab on that secure host.
- **Find logic is unchanged**: it still lists only tabs whose disclosed URL passes `allowedMerchantUrl`. Only its empty-result message now points the user to the permission button and the Chrome prompt.
- **`control.html`:** the button text changed from "允许读取和操作所选官网主机" to "允许读取和操作官网主机", and the help paragraph now explains the first-use steps. It also says that granting access never starts a purchase. All ids are unchanged.

Rejected alternatives:
- Requesting on page open or on Find: forbidden by the task.
- Requesting `tabs` or a wildcard host: forbidden, and needs a manifest change.
- Relying on `activeTab`: it is temporary and does not apply to the control page's own click on another tab.

## Files changed

- `web/checkout-connector/control.js`: Find empty message; permission handler with the first-use branch, plus comments.
- `web/checkout-connector/control.html`: button label and help paragraph text only.
- `test/checkout-c017-discovery.test.ts` (new): 9 implementation tests.
- `docs/claude/C-017-report.md` (this file).

Not changed: page-program, chrome-port, job, owner, open, manifest, all old tests, every `review/` file, requirements, the candidate manifest, and delegation settings and tools.

## Tests actually run

| Command | Result |
|---|---|
| `node --test review/c017-first-host-discovery.test.ts` | 6/6 pass (before the fix: 3/6, per the Codex findings) |
| `node --test test/checkout-c017-discovery.test.ts` | First run 8/9: my own test checked the denial text after a later Find had overwritten the status. I fixed the test order without weakening any assertion. Re-run: 9/9 pass |
| `node --test "test/*.test.ts" "review/*.test.ts"` | 455 tests, 455 pass, 0 fail/cancelled/skipped/todo (446 previous including the 6 protected C-017 cases, plus 9 new) |

The new tests cover:
- Page load and Find make no permission call.
- The first-use request is the only and first Chrome call of the click, made with the gesture flag set. It asks exactly `{origins:['https://www.apple.com.cn/*']}`, that origin is declared, and manifest `permissions` is still `['scripting','storage','activeTab']`.
- After allowance, Find lists only the supported www product tab. Opaque, unrelated, unsupported-path (`/shop/account/home`) and not-yet-granted secure tabs stay hidden. Option text shows host and tab id only.
- The public grant causes no secure-host request. A selected readable secure tab requests only `https://secure11.www.apple.com.cn/*`.
- A selected readable www tab keeps `get` → `request` with its exact origin.
- Denial is visible and not repeated; only a second explicit click asks again.
- Synchronous throws and promise rejections are caught and shown.
- A vanished or unsupported selected tab requests nothing.
- `control.html` ids are intact and `final` is still disabled.
- On every branch there is no job, run, lock, port, storage write, script injection or navigation, and the `approve`/`finalReview` checkboxes stay unchecked.

Not run: no native Chrome, extension reload, browser or network test. None was authorized.

## Gesture and permission behavior, and evidence limits

- The tests show only that, in a fake VM harness, the request happens during the synchronous part of the click handler. They do not prove how native Chromium tracks user activation, what the prompt shows, or what is actually stored.
- **Pre-existing path, not verified natively:** with a tab selected, the handler awaits `tabs.get` before calling `permissions.request`. Whether Chrome still accepts the activation after that await is unverified. If Chrome rejects it, the user sees "当前标签页或权限不可用" and nothing executes. This path is unchanged in C-017 and not proven by it.
- The installed permission state, any existing `www.apple.com.cn` grant, and whether `activeTab` disclosed URLs in the user's session were not observed.
- Moving from www to `secure*.www.apple.com.cn` checkout still needs a separate, explicit exact-host grant while that tab is selected and readable. A secure tab with no grant stays opaque to Find. How this works on the real checkout handoff is a native and merchant unknown, already described in the pre-existing "页面跨主机后需本人另行确认" design.
- Permission and discovery grant no purchase authority. Starting still requires the existing preflight, approval checkbox, owner lock and all unchanged purchase, unknown, no-repeat, slot and date guards.

## No automatic merchant actions

The permission and Find handlers never construct a job, take the owner lock, write `storage.local` or `storage.session`, inject scripts, create or update tabs, tick checkboxes or retry. The tests above check this on every branch. No real page, grant, account, order, slot or payment was involved in development.

## Human reload and test steps (after Codex agreement only)

1. On `chrome://extensions`, reload the unpacked checkout connector extension (`web/checkout-connector`).
2. Open the extension popup and open the control page. Keep the public iPhone 18 Pro page open in another tab.
3. With no tab selected, click "允许读取和操作官网主机".
4. Chrome should show its own prompt for `www.apple.com.cn`. Choose allow or deny yourself.
5. Click "读取当前官网标签页". Expect "www.apple.com.cn · 标签页 N" for the Pro page.
6. Select that tab and click "只读观察当前页面".
7. Report only the status text. Do not send screenshots of account data, cookies or private fields.

Do not click "一键开始" as part of this check.

## R01–R10 mapping

| Requirement | C-017 effect |
|---|---|
| R02 | First-use host access is now reachable through a visible step. Denial and errors are reported as blockers. |
| R08 | The permission request is a human-handled step: an explicit click plus Chrome's own prompt. Nothing proceeds automatically. |
| R09 | Permission and discovery never enable real mode or any merchant mutation. |
| R10 | Concise Chinese status and help text for first use, denial and error. |
| R01, R03–R07 | Not changed. All guards are unchanged and covered by the 446 previous tests. |

## Reads and disclosures

- I read the task, the C-017 findings (md and JSON), the C-014 observed note, the C-016 bounded agreement, `control.js`, `control.html`, `manifest.json`, `open.js` and the protected test in this dispatch.
- Reused from earlier in the same session, not re-read in full for C-017:
  - `docs/requirements.md` (read in full during C-016-CROSS-REVIEW; only the R01–R10 rows were re-checked here);
  - `chrome-port.js` (the `allowedMerchantUrl` and `permission()` lines were re-checked here).
- No permission denials.
- Only the four authorized commands were run.
- No browser, network, agent or dependency use.

## Resumable checkpoint

The C-017 implementation is complete in the four write-scope files, and the full suite passes 455/455. Next is Codex's independent verification and exact-scope agreement, then the human reload steps above. C-014 native validation and the one-order endpoint milestone are still pending.
