# C-007-CROSS-REVIEW: Claude's independent review of the Codex quota-takeover candidate

**Verdict:**
- **C-006-R1:** bounded agreement.
- **C-007 offline DOM replay:** not yet. One reachable defect (F1) must be fixed first, and F2 must be fixed or explicitly scoped.
- **Management tooling:** bounded agreement, with one conditional issue (M1).

This was a read-only review: I wrote no files. I did not reproduce my findings by running them, because that needs commands the sheet doesn't approve, so F1–F7 come from reading the code. Codex should reproduce them.

## 1. Verified identity
- **Whole candidate:** the verifier returned `ok: true`, **83 files**, SHA `6e1d83f904a1c1479d310c4c927a3e189ee2561393e7dc9e2d6cf171f40e13a7`, no mismatches. I read the verifier before running it.
- **Runtime scope:** `verify_source_manifest.py` returned `ok: true`, **77 files**, SHA `01e61f991a41e08d6689a181c7db21b74978266434b5f099e033b0519806dc66`.
- **Unlisted files:** listing the files showed nothing in the source folders outside the manifest. The only extras are `tools/delegation/__pycache__/*.pyc`, which the verifier never considers.
- **Session and model:** `11941a88-4609-4e7f-a2f8-78c5b5837285`, Opus 5.5.

## 2. Checks actually run
- `node --test test/launch-boundary.test.ts test/launch-session.test.ts test/next-run-outcome.test.ts`: **24 passed, 0 failed.**
- `python tools/delegation/test_dispatch_lock.py`: **2 tests, OK.**
- **Permission denial:** my first attempt at the node command added `2>&1 | tail -40` and was denied. The exact approved command then ran.
- **My own compliance lapse:** in the first attempt at this same task I ran `git status --short`, `git log --oneline -8` and `ls` on project folders. They are read-only but not on the approved list, and they were not denied, probably by Claude Code's built-in auto-approval of read-only commands.
- **Not run by me:** the full 225-test suite, `rehearse --all`, the `launch-replay` CLI, any browser check, crash injection, or repros of F1–F7. Codex's results for those are evidence I did not reproduce.
- **Review coverage:**
  - I read in full the current versions of `src/launch.ts`, `src/app/launch-session.ts`, all `web/launch/*` files, `app.js`, the dispatch and verifier tools, and two of the three new test files.
  - I read the delta patch for `README`, `launch-session`, `server`, `cli`, `launch-replay`, `app.js`, `index.html`, `render.js` and `style.css`. I also read the runbook and the relevant parts of `server.ts`, `render.js` and `task-app.ts`.
  - I did not read the Pro pilot report or the private pre-takeover snapshot.

## 3. Findings

**F1 — Medium. Reachable in normal use. Fails safe, but a rejected input permanently blocks the replay with a false "evidence corrupted" message.**
- **Cause:**
  - `LaunchSession.#change` and `view()` catch every exception and set a sticky `#error`.
  - Every later `#load()` then throws, so the replay is blocked until the process restarts.
  - This happens for a rejected import (`InvalidObservation`), a stale observation (`StaleObservation`), clicking the pending fixture twice, any plan revision after replay evidence exists, or a passing `app.state()` failure.
- **What the user sees:** "页面回放记录无法验证…不要删除记录重新开始", even though the files on disk are fine.
- **F1b, survives restart:** `validateObservation` only checks the shape of the timestamp. An import with `observedAt` set to `2099-01-01T00:00:00.000Z` is accepted and saved as `lastObservedAt`. Every later observation is then stale, after a restart as well.
- **Repro:** as the controlling tab on `/launch`, import valid JSON that has one extra key. Then try "加载样本并观察". For F1b, import a valid observation with a 2099 timestamp, observe any sample, then restart the process.
- **Impact:** no unsafe action, but the replay for that task becomes unusable with a misleading integrity alarm. Loading the three-date example on the main page after using `/launch` hits the same block.
- **Acceptance:**
  - Rejections return a specific code, write nothing and do not set the sticky error.
  - `observedAt` must not be later than server time plus a small skew.
  - A plan change shows its own status ("bound to plan vN").
  - Add session-level tests: an invalid import followed by a valid observation succeeds, and a future timestamp is rejected.

**F2 — Medium for any real use; not reachable with the bundled samples. The page observer checks purchase conditions by substring or presence. I wrote the product rule in my unfinished observer and Codex kept it; I am not approving it.**
- **Product:** model, capacity and colour only need to appear as substrings of one element. So "iPhone 18 Pro Max 256GB 深空黑色" passes a plan for "iPhone 18 Pro / 256GB / 黑色".
- **Store:** passes if the plan's store label appears anywhere, not only when it is the selected store.
- **Price:** any single currency amount passes, including a monthly instalment such as "RMB 416/月", and it is then checked against the maximum total.
- **Visibility:** native options hidden by a CSS class still count as offered.
- **Acceptance:**
  - Exact matching on a normalised product line, and rejection when another variant is present.
  - The store must be the selected choice.
  - The price must be a labelled total.
  - Negative tests for each case above.

**F3 — Low, latent. The server takes the client's word on where an observation came from.** The client sets `source: 'synthetic-sample'` and `listCompleteness: 'synthetic-complete'` in the request body, and the server never ties them to a sample it actually issued. "An import cannot produce candidates" is therefore enforced only by the replay page's labelling. The impact is bounded because the plan must be FAKE and nothing executes the candidates. **Acceptance:** the server checks a sample ID or one-time value it issued.

**F4 — Low, latent. The date binding is not frozen when the first complete list cannot be bound.**
- **How it happens:** if one of the first three enabled dates is outside `plan.dates`, `#bind` silently does nothing and tries again on the next list. A first list [D0, D1, D2, D3] with D0 not in the plan, followed later by [D1, D2, D3], binds D3, which was the fourth offered date.
- **Related:** terminal-slot floors are not recorded before a binding exists.
- **Open rule question:** disabled dates are skipped when counting "the first three". Whether a displayed but disabled date counts as "offered" needs a decision.
- **Acceptance:** save the first complete list, or the fact that it could not be bound, and never bind from a later list.

**F5 — Low. A normal crash can permanently block the replay.** `#save` appends the journal record, then writes the state file. A crash between the two leaves a hash mismatch, and every later restart reports `LaunchEvidenceMismatch`. **Acceptance:** a two-phase write or a documented recovery procedure, plus a test that crashes at that point.

**F6 — Low. The runbook leads to a read-only page.** It says to open `/launch` as a second tab, but the main tab already holds control, so the `/launch` tab cannot act. The runbook should say to open it in the same tab or close the main tab first.

**F7 — Low. The click-time stale-warning guard only runs in the browser.** `/api/start` does not send the outcome the user was shown. If the user arms the capability and clicks start before the update reaches the page (at least the 30 ms broadcast delay), the run can submit a mock order while the old "no submit" text is still displayed. This only affects the mock. **Acceptance:** send the expected outcome or arm ID with the start request and have the server reject a mismatch.

**F8 — Info: test gaps.**
- `next-run-outcome.test.ts` does not cover the "used" or "ledger has entries" states.
- It never renders the advanced copy, which shares the same function.
- The "ledger has entries" text does not say that starting still uses up an unused arm.
- The public records do not show the narrow-width browser check required by F6-1.

## 4. Priorities with no reachable defect found
- **Safety boundaries:**
  - Readiness requires `plan.fake`, a complete synthetic list, explicit years and verified conditions. A missing year or condition stops recommendations.
  - Floors only move later and survive redraw, terminal omission, pause and restart.
  - A fourth date that is selected only produces a "wait".
  - Restoring re-checks bindings and floors against the plan.
- **Page states:** maintenance, transport failure, 503, 429, 403, sign-in and consent each get their own state. The "maintenance" wording is labelled as unverified. Partial rendering is limited to 5 observations before a manual handoff.
- **Ownership and reload:** both raise the page epoch while keeping plan, binding, floors, pause and pending state.
- **Imported data:** imported free text is kept in memory only. Nothing raw is saved or broadcast.
- **Existing engine truth wins:** any in-flight engine operation, ledger entry or manual-handling state turns replay output into "reconcile". The replay page has no execution path, and `refValid`/`mayInitiateFrom` are only called from tests.
- **Scope of the synthetic pending fixture:** it only proves the replay's own pending flag persists and suppresses candidates. There is no path from page observation to engine reconciliation, and nothing clears the flag. The engine pending test is separate and genuine.

## 5. Management review
- **`dispatch_lock.py`:** a sound OS lock that is never deleted and is released when the owning process dies. If the unlock call raised, the handle would not be closed, but process exit releases it anyway.
- **`invoke_claude.py`:** the lock is held for the whole run, model verification is strict, and permission denials are recorded.
  - **M1 — Medium, conditional:** on timeout, `terminate()` kills only the direct child process. If `claude` resolves to a script wrapper, or the CLI has child processes, they can outlive the dispatcher. The run is then marked `failed` and the lock released, so a second Claude could run alongside the first. I did not check which executable is resolved. **Acceptance:** kill the whole process tree (a Windows Job Object, or `taskkill /T /F`), confirm nothing survived, and add a test using a grandchild process.
  - **M2 — Low:** the `running` record is written before the process starts. If starting the process throws, all later dispatches are refused until someone resolves it by hand.
  - **M3 — Info:** as noted in section 2, read-only commands outside `--allowedTools` were not denied, so "approved commands only" depended on my own compliance.
- **`test_dispatch_lock.py`:** does not cover the `running`-record guard, an unreadable record, or the timeout/orphan path.
- **`verify_candidate_manifest.py`:** read-only and limited to allowlisted paths, with no imports and no escape through symlinks. It cannot detect extra files that are not in the manifest; today there are none.

## 6. Bounded conclusions
1. **C-006-R1 (F6-1): I agree, within limits.**
   - The effective mock outcome is shown next to the main start button, and the button label changes when the run will submit.
   - The advanced start uses the same wording function, and the armed or used card stays visible with advanced details closed.
   - Idle expiry updates the text without a reload, the planner is collapsed while a run is active, and the bound-plan versus next-plan distinction is kept.
   - F7 and F8 are not blocking.
   - Codex reviewed my original presentation edits; I am not approving them myself.
2. **C-007 offline DOM replay: I disagree with final acceptance as delivered.** Its safety boundary holds, but F1 is a reachable normal-use defect, and F2 must be fixed or explicitly scoped as synthetic-only, with negative tests. F3–F6 can be fixed or accepted as documented limits.
3. **Management changes: I agree, within limits.** The dispatch lock and the candidate verifier are sound. M1 must be resolved or verified before relying on "no concurrent implementer after a timeout".

Nothing here approves an unattended Apple adapter, completeness of the real relative-date list, Apple's refusal or hold behaviour, Duo checkout, or the overall purchase goal. Codex's 225 tests, 29 scenarios, 20 CLI replay cases and browser checks remain Codex evidence, not my reproduction.

**Restore point:** candidate `6e1d83f9…`, runtime `01e61f99…`, session `11941a88-…`. No files were changed by this review.
