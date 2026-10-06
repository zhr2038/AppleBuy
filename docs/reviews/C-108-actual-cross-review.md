# C-108 cross-review: delivery report

**Verdict: AGREE, bounded, with one condition.** This covers only the exact 242-file candidate (SHA `54a5676c4fecb6ceedfa3e93cc3c3fbda594e6e4d95fe24a85e4483ec5935168`): the browser choice, the normal default context, the explicit default-off retained session, failure metadata, the GUI and runner changes, and the prior protections they rely on.

I found no blocking defect. There are five low-severity findings below.

**Condition:** a click cannot prove human consent. The keep-session checkbox must be ticked only by the user, with specific approval. Root (including via Computer Use) must not tick it, and a tick made by automation is not consent. This review does not authorize keeping login sessions, any login, or any purchase. It also doesn't carry over C-106's agreement to these new bytes, and it makes no live, login, installed-purchase, unpaid-Pro, speed, POSIX, goal or whole-repo claim.

## What I ran and read

- **Reads:** all 26 required files were read fresh to the end.
- **One extra read-only check:** `.gitignore`, found via one Glob. Line 1 ignores `.local/`, so the retained-profile folder can't be committed.
- **One Bash call, as required:** `python -B tools/delegation/run_review_checks.py docs/reviews/C-107-candidate-manifest.json`. I ran it once, alone, in the foreground, after all reads.
- **No other tool use:** no edits, file writes, memory writes, git, agents, network, GUI, Chrome, Apple, `.local` or profile reads.
- **Not read:** `cart-transfer.mjs`, `auth-continuation.mjs`, `job.js`, `chrome-port.js`, `verify_candidate_manifest.py`, and any launcher shortcuts.

**Command output: six rows, all passing.**

| Order | Check | Result |
|---|---|---|
| 1 | Manifest | ok, 242 files, `54a5676c…5168`, no mismatches |
| 2 | Focused Node | 58/58, 0 fail / 0 cancelled / 0 skipped |
| 3 | Python | 29 tests, exit 0 |
| 4 | Full Node | 1461/1461, 0 fail / 0 cancelled / 0 skipped |
| 5 | Manifest | identical to order 1 |
| final | `complete` | true, `passed` true |

Every row reports exit 0, no timeout, and cleanup confirmed. I checked the manifest values and counts myself rather than relying only on exit codes. Root's earlier 1460/1461 failure is still unidentified, and I make no claim about its cause.

**Protected files unchanged:** compared with the C-106 candidate hashes I recorded, these are byte-identical:
- `checkout-runtime.mjs`, `browser-session.mjs`, `task-store.mjs`
- `owner-lease.mjs`, `owner_lease.py`, `process_tree.py`
- the c078-runtime, c084 and c093 tests

The edited `desktop_c078_test.py` only adds three fake controls to `fake_app` (line 23). Every assertion matches my C-106 read.

## What I checked, and what holds

- **Arguments, types and default-off:**
  - Each layer rejects anything except `chrome`/`msedge` plus an optional single `--keep-session`, before any process starts:
    - `start.pyw:7` only accepts `--browser`; there is no way to turn on retention from the command line.
    - `app.py:128,247`
    - `interactive_child.py:88-96`, which also rejects a non-boolean keep-session value.
    - `browser-choice.mjs:4-16,22`
  - Retention is off by default (`app.py:154`, `browser-choice.mjs:21`).
- **No hidden launch-argument changes:** `launchOptions` returns only `{channel, headless:false}` (`browser-choice.mjs:9-12`).
  - `newContext()` takes no options, so service workers use the normal default.
  - There is no `args`, `ignoreDefaultArgs`, user-agent, proxy, `storageState` or CSP bypass.
- **Profile location is fixed:** `ownProfile` (`browser-choice.mjs:17-20`) always resolves to `<repo>/.local/desktop/browser-profiles/<chrome|msedge>`. It never uses an arbitrary folder or the personal Chrome profile.
- **Owner and browser lifetime:**
  - The task lease is acquired before the browser launches (`checkout-runtime.mjs:17-18`).
  - If browser startup fails partway, the partially started browser is closed and there is no fallback to another browser (`browser-choice.mjs:24-29`; tested at `desktop-c107-browser.test.ts:39-43`).
  - On close, the failure watcher is detached first (`:28`), and the lease is released afterwards (`checkout-runtime.mjs:98`).
- **Purchase authority is unchanged when the browser or profile changes:** each browser API instance gets a random ID (`browser-api.mjs:10`), and a task only counts as this session's own when that ID matches (`browser-session.mjs:36-41`). Retained cookies or a different browser therefore cannot restore buying rights.
- **Diagnostics privacy:** the failure watcher reports only the host and an integer status from 400–599 (`browser-choice.mjs:31-38`).
  - It rejects plain-HTTP, credential-bearing, malformed and non-allowlisted URLs.
  - It never reads request data, headers or bodies; the test proves zero such reads (`desktop-c107-browser.test.ts:9-12`).
  - Reports are deduplicated per host and status, capped at 16, and ignored after shutdown (`:39-44`).
  - The GUI re-checks the values before display (`app.py:318-322`).
  - The worker's stderr is discarded (`interactive_child.py:24-26`).
- **Display has no authority:** the GUI's diagnostic branch stops processing before touching any control (`app.py:322`); tested while paused (`desktop_c107_test.py:31-34`).

## Findings (low severity, none blocking)

1. **F1 – no way to revoke retention.**
   - The retained profile, including cookies and anything the user saves in it, stays under `.local/desktop/browser-profiles/` after the box is unticked.
   - Neither the UI nor the checkbox text (`app.py:155`) says where the data lives or how to delete it.
   - *Acceptance:* before asking the human to consent, Chinese text or a clear action stating the location and how to delete it.
2. **F2 – the consent tick persists within one GUI session.**
   - After a session ends, the checkbox is re-enabled with its previous value (`app.py:353-354`).
   - A later start (for example via Ctrl+Alt+P) would keep the session again without a fresh tick.
   - *Acceptance:* reset `keep_session` to False when the worker ends.
3. **F3 – the failure diagnostic carries over.**
   - `browser_diagnostic` is not cleared when a new checkout starts (`app.py:239-256`).
   - A previous session's "HTTP 541" message can therefore appear under a new session or browser.
   - *Acceptance:* reset the message when a checkout opens.
4. **F4 – an invalid worker argument fails silently.**
   - `purchase-worker.mjs:7` throws before the protocol starts, so the GUI never sees a reason.
   - It is safe: no lease, no launch. It is also unreachable through the validated GUI path.
5. **F5 – test gaps:** nothing tests that:
   - the browser picker and checkbox lock and unlock in the GUI (`app.py:249-250, 353-354`);
   - the worker suppresses diagnostics once `closing` is set;
   - the GUI checkbox value actually reaches the runner (only the runner level is tested).

**Runner changes:**
- The C107 test is added to the focused list.
- The Python pattern is broadened to `desktop_c*_test.py` (needed for the new C107 file).
- `failureTail` now starts at the first `not ok` line, which fixes the missing failure identity behind Root's unexplained failure.

The three runner gaps C-106 accepted as non-blocking remain, so I checked those values by hand:
- the cleanup field is hard-coded;
- the manifest `ok` value is not checked automatically;
- skip and todo counts are not enforced.

## R01–R10 mapping (this scope only)

- **R02/R08/A10:** browser choice and human-only login; nothing in authentication is automated.
- **R07/A08:** owner lease before launch; a single owned browser per lease.
- **R10/A13:** Chinese diagnostics that never carry secret values.
- **R09/A11:** no real actions; every test is fake.
- **R01/R06/R07, A07/A12:** plan, final-consent, unknown-result and read-only rules unchanged.

## Real evidence vs simulation

Every test used a fake browser, context and response objects. No browser was launched, and the persistent profile was never created. The real Edge/HTTP 541 observation and the ordinary Chrome observation are Root's evidence, not mine. Nothing here shows that the new defaults fix login.

## Denials, provenance and usage

- 0 permission denials, 0 tool errors, no caps.
- Tool calls: 27 Read (26 required plus `.gitignore`), 1 Glob, 1 Bash.
- I run as `claude-opus-5-5`. I can't observe the effort setting, so Root's `modelUsage` is authoritative.
- Cost reported by the harness: about $2.32 of $10, which is the resumed-history aggregate, not this round's spend.

## Checkpoint

C-108 is complete: 26 of 26 reads, one Bash call with six passing rows, and this report. Nothing was written. For Root, none blocking: the consent condition above, and findings F1–F5.
