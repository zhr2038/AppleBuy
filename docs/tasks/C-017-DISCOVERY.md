# C-017 — fix first-time official-host discovery in the installed candidate

Read the full `docs/requirements.md`, this task, `docs/reviews/C-017-discovery-findings.md` and JSON, `docs/reviews/C-014-control-page-observed.md`, full `web/checkout-connector/control.js`, `control.html`, `manifest.json`, `open.js`, `chrome-port.js`, the protected `review/c017-first-host-discovery.test.ts`, and C016 bounded agreement. Input130-file SHA `67a23b8cb5f0d7efa1719d92a4f75b7ef44072c758af6568a99ef9a946a40d88` in `docs/reviews/C-017-input-candidate-manifest.json`; all prior129 files remain unchanged. Same directory, English, exact Opus5.5/xhigh, unique original session.

## Problem and actual evidence

User-loaded control page exists in actual Chrome inventory. The user reports no accessible official tab; actual separate inventory confirms public Pro pages open. Current source requires URL discovery before requesting the host access that exposes the URL. Codex independently models documented URL-redacted Tab objects and reproduces3 startup failures; full443/446, all440 previous cases pass. Do not infer actual installed permissions or native Chromium scheduling from this fake fixture. Official API facts and links are summarized in the findings. No network or browser tools are authorized for this dispatch.

## Outcome and independent acceptance

You choose the bounded implementation and interaction details. On a first use with no readable merchant URL or selected merchant tab, an explicit ordinary permission-button click must let the human request only the declared public official origin `https://www.apple.com.cn/*`. The request must preserve Chrome's real user gesture, not require the metadata it enables. The user separately consented to this persistent/revocable current host for read-only verification, but the app still uses Chrome's ordinary user prompt. Opening/Find cannot automatically request permission.

After allowance, supported official tabs can be discovered; opaque/unrelated/unsupported tabs are not displayed. Denial/error is visible, bounded, caught, requests no other permission and cannot cause a purchase job, authorization checkbox, private/durable task write, page injection, site navigation or automatic repeat. Existing already-readable selected official secure-host requests remain exact-origin requests; do not request any secure host just because the startup public host was consented. Permission and discovery never grant purchase authority.

Keep existing declarations and all purchase/unknown/no-repeat/slot/date guards unchanged. No `tabs`, wildcard host, Cookie, debugger, background, proxy, remote control endpoint or other new permission. Browser tooling cannot read/click this internal protocol and expressly prohibits alternate-surface/native/CDP/profile/HTTP-control-page workarounds. This is an ordinary user-operated extension repair, not an alternate agent route into a blocked control page. Native API correctness and real read-only result must remain pending after the fix.

Write scope: `web/checkout-connector/control.js`, `control.html`, `test/checkout-c017-discovery.test.ts` (new implementation tests), `docs/claude/C-017-report.md`. If a justified alternative needs a different scope/permission, report it precisely before any such edit. Do not change page-program/chrome-port/job/owner/open/manifest/other source, any old implementation test, any `review/` file, requirement, candidate manifest or delegation setting/tool. No private files/history/credentials/cookies/storage contents, web/native browser access, agents, dependency changes or publishing.

Only these exact shell commands are authorized, without chaining, flags, wrappers or redirection:

- `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-017-input-candidate-manifest.json` (verify input before edits; original input mismatch after a permitted source edit is expected, not a final manifest)
- `node --test review/c017-first-host-discovery.test.ts`
- `node --test test/checkout-c017-discovery.test.ts`
- `node --test "test/*.test.ts" "review/*.test.ts"`

Return an English report with exact files changed, actual test results, Chrome gesture/permission behavior and its evidence limits, no automatic merchant actions, human reload/test steps, and all remaining native/merchant unknowns. You cannot self-approve or weaken a reviewer. Codex independently verifies then obtains actual exact-scope agreement before the human reload. No empty work to consume quota. Native first-host discovery and a program-created one-order endpoint remain separate acceptance milestones.
