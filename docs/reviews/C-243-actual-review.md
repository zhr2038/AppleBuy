# Actual C243 review

Root verified249.95seconds18turns/firstParty claude-opus-5-5/max/6EOF/exact3commands/60focused108protected90Python1961Node/unchanged source/owned cleanup. Actual DISAGREE for M2; closed M1 and green tests are not acceptance.

**C243 verdict: DISAGREE** for the full 348-file candidate (C238 + C240 + C242). The C241 M1 failure path and the poisoned-transport worker problem are fixed. One closure criterion is still not met in the way real Chrome behaves, so there is one material finding.

**Material finding M2: closing the login tab between polls makes the program reopen and refocus it.**
- **What happens:** when the user closes the kept login tab, Chrome's tab-removed event runs `OrderAudit.removed()` (`checkout-rpc-peer.js:17`). That resets `tabId`, `authUntil` and `authFocused`. The next order-watch poll, at most 1 s later, finds `tabId===null`. It then creates a new order tab, gets `auth`, and brings that tab to the front again (`order-audit.js:85–96`).
- **Why the stop doesn't trigger:** the worker sees `AUTH` and keeps polling for up to 300 s. The "stop on unknown" path at `order-audit.js:77` only fires when the tab disappears *during* a read. On a stable sign-in page, polls are idle almost all of each second, so a user's close nearly always lands between polls.
- **Effect:** this is the exact behaviour the criterion forbids ("stop their watcher instead of fighting a user's tab close"). It is read-only and bounded: no order, no resubmission, and the user can still pause.
- **Why tests pass anyway:** worker test 22 uses a fake runtime that returns `unknown` directly. Tests 48 and 50 never run a poll after the removal event.
- **Reproduction:**
  1. Build a real `CheckoutRpcPeer` on a fake API where `tabs.onRemoved` stores its listeners, `create` returns ids 7, 8, … and `update` counts focus calls.
  2. Set `peer.orderAudit=new OrderAudit(peer,{wait:async()=>{}})` and stub `read` to return `{state:'auth'}`.
  3. Run once: the result is `auth`, tab 7 is kept and focused once.
  4. Fire the stored listener with 7, then run again.
  5. Actual: `auth`, `tabId` is 8, and focus has been called twice. Expected: `unknown`, no tab created.
- **Fix idea:** after the audit's own tab is removed, make the next *automatic* poll return `unknown` without creating a tab, so the watcher stops. Explicit user queries can still open one fresh tab. Add a test that combines the peer, the audit and the worker.

**Closed:**
- **Removed-tab detection:** only a removal event for a tab the program opened, or the exact `No tab with id: N.` error, counts as "tab gone". Only local audit state is cleared, never the purchase record or the final submission. Permission or transport errors still throw and are not reported as cleaned (test 49).
- **Session close:** `closeSession` now succeeds when a tab the program opened was already closed, still fails on generic errors, and disposes the listener. A disconnect also disposes the old peer.
- **Poisoned transport (Root's additional finding):**
  - All failure paths now close the worker's input: direct commands, the order watch, the late-page watch and failed continuations (`native-purchase-worker.mjs:19–21`).
  - `runtime.api.poisoned` reaches the real `NativeCheckoutApi`: the lease guard (`owner-lease.mjs:48`) passes the property through, and `native-checkout-channel.mjs:22` creates the real API.
  - The worker's own close fails on the poisoned API, but `interactive_child.py:56` confirms cleanup by ending the process tree. So the GUI's existing limit of 3 reopens still applies.

**Checks (exactly the three commands, once each, in order):**

| Command | Result |
|---|---|
| 1. Verify manifest | ok, 348 files, sha `7580ccd0…78fc2` |
| 2. Focused Node tests | 60/60 passed |
| 3. Full review checks | manifest ok; protected 108/108; Python 90 tests, no failures, errors or skips; Node 1961/1961; manifest re-check ok; `complete:true` |

**Coverage:**
- I read all 6 listed files fully in this run, plus the C242 sheet.
- Extra reads to settle the findings: `owner-lease.mjs`, `auth-continuation.mjs`, `interactive_child.py:14–69`, and searches of the native API and channel files.
- No files changed.

**Limits:**
- I worked out the M2 reproduction by tracing the code; I did not run it, because extra scripts aren't allowed.
- Everything was fake or offline. There was no real Chrome run, no test of the installed candidate, and no real order.
- I can't confirm the model, effort setting or elapsed time from inside the run.
- I read no private, profile or transcript files. No permission was denied, and I used no agents.
- The C241 non-blocking note still stands: the lookup at `order-audit.js:101` still requires an exact model name, which fails safe.
- The known limits listed in the sheet are unchanged.
- This review does not cover the fifteen original order-history/purchase safeguards.
