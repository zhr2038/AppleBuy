# Actual C241 result

Root verified371.56seconds/19turns/firstParty claude-opus-5-5/max/10EOF/exact3commands/53focused108protected90Python1954Node/zero denial-private-edit-error-timeout/cleanup and unchanged C240348. Actual DISAGREE; do not treat closed earlier findings or green tests as approval. Self-reported spend is not authoritative; structured modelUsage is resumed-history aggregate.

**C241 verdict: DISAGREE** for the full 348-file C240 candidate (C238 features plus C240 fixes). One material problem remains: if the user closes the login tab, order checks break for the rest of the session. B1, B2 and the late-reference regression are fixed.

**Material finding M1: a closed login tab breaks every later order check** (`order-audit.js:84,73`; `:77` and `:89` behave the same)
- **Cause:** when a login tab has been kept open and the user then closes it, `runOnce` calls `tabs.get` on a tab that no longer exists, and that call fails.
- **Cleanup also fails:** the `finally` in `run` awaits `tabs.remove(id)`, which fails too. So `peer.tabs.delete(id)` and `this.tabId=null` never run. Nothing in `web/` listens for `tabs.onRemoved`.
- **Effect:** every later check fails for the rest of that connection. That covers the order check before each R1/R2 advance, the check before submit, the lookup after submit, and the automatic retry after login.
- **Session close fails as well:** `closeSession` (`checkout-rpc-peer.js:53`) also removes the stale tab and fails. `NativeCheckoutApi.close()` (`:28`) then throws, and the runtime reports `DesktopBrowserCleanupUnconfirmed`.
- **Severity:** nothing is bought or resubmitted, so it fails safe. But it blocks all purchasing. Closing the tab is a normal thing to do, since the program brings it to the front and the UI says "登录后自动继续". The accepted C237 baseline had no mandatory order check, so this is a regression from it.
- **Reproduction:**
  1. Create `new OrderAudit(peer,{wait:async()=>{}})` with `read` stubbed to return `{state:'auth'}`.
  2. Make the fake `tabs.create` return `{id:7}`.
  3. Run once; it returns `auth` and keeps tab 7.
  4. Make `tabs.get` and `tabs.remove` throw "No tab with id: 7."
  5. Every later `run` rejects. `audit.tabId` stays 7, `peer.tabs` still has 7, and no new tab is ever created.
- **Suggested fix:** treat a failed get/update/remove on the kept tab as "tab gone". Always clear `tabId`, `authUntil`, `authFocused` and the `peer.tabs` entry, then return `unknown` or open one fresh tab. Add a test for it.

**Closed:**
- **B1:**
  - The order reader now waits instead of failing when a tab has no URL yet or is still `about:blank` (`:55,:62`, `orderDocument :11`). Working out whether the tab is on the detail page no longer throws (`:84`).
  - It also waits when the tab still shows the old list after moving to the detail page (`:58`, `:14`). Test 42 covers this.
- **B2:**
  - `App` now defaults to `profile=None` and loads only when asked (`app.py:140,222`). Only the `__main__` entry points it at the real profile path (`:624`).
  - The c236 test builds `App(root)` with no profile. A new patch test proves the production profile is never read.
- **Late reference (Root's regression):** the same originating session now captures the late receipt first and then looks up that same order (`checkout-runtime.mjs:91,99`). A foreign context, or a read-only record without a reference, still returns `reference-missing`. Tests 43–44 cover this.
- **Other repairs, all confirmed:**
  - After a submit or reconcile hits login, it now continues automatically once logged in (worker `:78`), and a failed retry reports an explicit stop (`:28`).
  - The login tab is brought to the front once and keeps a single 5-minute deadline (`:71,:87–90`).
  - A failed account check no longer triggers the checkout retry loop (`:30`).
  - Model-name drift with extra specs is handled (`:93`), and cancellation now matches an exact list of labels (`:9`).
  - Calling stop during the native-messaging permission check now prevents the connection (`checkout-native-link.js:14`).
  - Generic commands can no longer reach the private order tab (peer `:61`).

**Not blocking:**
- The lookup for an already-submitted order still requires an exact model name (`:95`). If the tile shows extra specs, the right order comes back `not-found`. That fails safe.
- After a login or loading wait, a final `unknown` result leaves the tab open until the next conclusive check or session close. This is deliberate.

**Checks run (exactly the three commands, once each, in order):**

| Command | Result |
|---|---|
| 1. Verify manifest | ok, 348 files, sha `7b668a4d…cdb6` |
| 2. Focused Node tests | 53/53 passed |
| 3. Full review checks | manifest ok; protected 108/108; Python 90 tests, no failures, errors or skips; Node 1954/1954; manifest re-check ok; `complete:true` |

**Coverage:**
- I read all 10 listed files fully in this run, plus the C240 sheet.
- Extra reads: two searches. One found no `onRemoved`/`onReplaced` anywhere in `web/`; the other covered the close path in `native-checkout-api.mjs`.
- No files changed.

**Requirements:** R06 and R07 (fail closed, no duplicate submission) and R08 (pause, owner loss, login handoff) hold in the fake tests. M1 is a separate problem: purchasing stops working for the session. R09: no real order. R10: UI text is Chinese.

**Limits:**
- Everything was fake or offline: loopback pages and a fake worker. I did no real Chrome run, did not test the installed 348 build, and placed no real order.
- The Chrome evidence was recorded by Codex; I did not observe it.
- I can't confirm the model, effort setting or elapsed time from inside the run; Root checks those. Spend was about $1.4.
- My previous C239 reply ended without delivering a report.
- I did not read the private transcript or any private or profile file.
- No permission was denied, I used no agents, and there was no second real order.
- This review does not cover the fifteen original order-history/purchase safeguards.
