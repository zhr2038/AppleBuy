# C-159 review: purchase-channel menu entry

**Verdict: bounded AGREE.** The new menu button opens the existing purchase-channel page and does nothing else. The readonly and control routes stay separate, and the popup is now 300px wide with full-width buttons. I found nothing unsafe. This covers only that scope: not the whole 292-file candidate, the installed menu, live behaviour, orders or the overall goal.

## Commands (the two listed ones, in order, run separately in the foreground)
1. **`verify_candidate_manifest.py` on `C-158-candidate-manifest.json`**: passed. 292 files, sha256 `5d2ee6d1…9265e`, no mismatches.
2. **`node --check web/checkout-connector/open.js`**: exited 0 with no output, so the syntax is valid.

## Only the two popup files changed
I compared the C-158 manifest with the C-151 manifest line by line, using the path and the first 4 hex characters of each hash. Only two hashes differ:
- `open.html`: `65893a5a…` → `f6a45a24…`
- `open.js`: `57bf57ae…` → `076f8834…`

These are unchanged:
- the extension manifest `2730cf46…`;
- `checkout-bridge.html` `4ba093c9…`, `checkout-bridge.js` `1f7c6073…` and `checkout-native-link.js` `cc283be0…`;
- `control.*` and `desktop-bridge.*`;
- `page-program.js`, `job.js` and `chrome-port.js`;
- all tests, `src/desktop/*` and the tools.

The C-151 hashes came from my read of that manifest in the previous round, in this same session; I didn't re-read it this round.

## What I checked
- **Routes (`open.js:1-3`).** There are three listeners, one per button, each wired to a different page:

  | Button id | Opens |
  |---|---|
  | `checkout` | `checkout-bridge.html` |
  | `desktop` | `desktop-bridge.html` |
  | `open` | `control.html` |

  - Each listener only calls `chrome.tabs.create` with `chrome.runtime.getURL(...)`.
  - None of them connects, requests permissions, reads storage or private state, starts a task or acts on a website.
  - `tabs.create` needs no extra permission, and the manifest is unchanged.
- **The new route opens the exact address the bridge requires.** `checkout-bridge.js:4` only accepts a Connect click when the page address equals `chrome.runtime.getURL('checkout-bridge.html')`. The new route opens exactly that address with nothing added, so Connect will work from it.
- **Existing guards are unchanged** (the files are byte-identical):
  - a trusted click is required, and repeat or concurrent clicks are blocked (`busy`/`link`);
  - the user is asked for the `nativeMessaging` permission at the moment they click Connect;
  - `purchaseAllowed` comes only from the explicit fixed-Pro checkbox, which locks after connecting;
  - the native link connects only to `com.applebuy.checkout`, and only if the permission was granted.

  Opening the page grants nothing. Its own status line starts as "未启用". The owned-tab, plan and final guards are in files that didn't change.
- **Readability (`open.html:5-9`).**
  - The page is 300px wide with 12px padding and `box-sizing: border-box`, which leaves 276px of content width.
  - Chrome sizes buttons border-box by default, so `width: 100%` makes each button 276px. That matches Root's measured 276×41.
  - The labels are short Chinese text with `white-space: normal`, so the vertical-glyph squeeze from too narrow a popup can't recur.
  - The only inline code is a `<style>` block. The extension's CSP restricts scripts but not styles, so it is allowed. The script is the external `open.js`, which satisfies `script-src 'self'`.

## Findings (none unsafe, none blocking)
- **F1 (Low): two purchase-channel pages can be open at once.**
  - Each click opens a new tab. Two such tabs each keep their own link, so each could start its own native connection to `com.applebuy.checkout`.
  - This was already possible by opening the page's address directly; the menu just makes it easier.
  - Each connection still needs a trusted click, the permission and the checkbox. Keeping to a single owner depends on the native or desktop side, which I didn't review this round.
  - I didn't reproduce this.
  - **Suggestion:** confirm that the single-owner rule already covers two bridge tabs, or switch to an existing bridge tab instead of opening a second one.
- **F2 (Info): the labels say "connect" but only open a page.** Both channel buttons start "连接桌面程序…", but clicking only opens the page where the user then connects. This matches the existing readonly entry, and the bridge page's status makes the real state clear. The only difference between the two channel labels is the bracketed suffix at the end (购买通道 or 只读购物袋).
- **F3 (Info): unused status line.** `open.html:15` has a `desktopStatus` status element that `open.js` never writes to. It is harmless.

## R01–R10
| Requirement | Status in this review |
|---|---|
| **R01, R04–R06, R09** | Not affected. No purchase conditions, slot logic or actions changed. |
| **R02, R03** | One fewer manual step to reach the existing purchase-channel page. Not live-verified. |
| **R07** | Not affected; see F1. |
| **R08** | Not affected. Starting a purchase still needs explicit human steps (Connect, permission, checkbox, final confirmation). |
| **R10** | Readable Chinese menu with three distinct entries. |

No requirement is accepted by this review.

## Real evidence versus simulation
- I ran no browser and no rendering. My layout findings come from reading the CSS.
- The 276×41 measurements, the matching links and the cleanup in `C-158-popup-verification.json` are Root's owned FAKE preview, and I didn't check them.
- That file itself records `actualInstalledMenuVerified: false` and `realOrderVerified: false`.
- The human's screenshot, the readonly connection and the claim that the host is registered are Codex's claims, and I didn't check them.

## Things you should know
- **Reads.** All 11 listed files were read to the end before the first command. I read nothing extra.
- **Clean run.** Nothing was denied, nothing errored, and there was no compaction during this round.
- **Model and limits.**
  - The environment reports `claude-opus-5-5`, but I can't confirm the xhigh effort or `modelUsage` from inside.
  - The displayed budget is about $1.61 of $3. Per the sheet, that is a total for the resumed session; the first read alone moved it to $1.24.
  - I used 6 turns of the 20 allowed. I can't measure elapsed time against the 360-second limit.

**Changed files:** none.

**Checkpoint:** C-159 is complete with a bounded AGREE. Possible follow-ups: Codex answers F1 (single owner across two bridge tabs), and a human checks the installed menu after reloading the extension. That live check isn't covered by this review.
