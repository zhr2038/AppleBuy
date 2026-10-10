# C259: diagnose current Apple Store login handoff failure

## Explicit human request and role

The human asks Codex to put this problem to Claude Fable 5.1 at max effort, in English, and ask for possible solutions. Use exact `claude-fable-5-1` / `max`; this overrides the default Opus reviewer role for this analysis only. You are a read-only diagnostician, not an implementer or an acceptance authority.

Read the complete files below. Return your analysis in English in the final response. Do not modify any file, run commands, use a browser/network, invoke agents, access private directories or conversation logs, or initiate login, checkout, order or payment. Do not read `.local`, `.claude`, `.codex`, `.git`, private handoff/journal/profile files, the unrelated V2 project, or external C211/C249 materials. Compaction hints do not authorize private transcript access. No credentials or raw auth payloads are provided or needed.

## Read scope

1. `docs/reviews/C-258-live-login-result.json`
2. `docs/tasks/C-258-LIVE-LOGIN-LABEL.md`
3. `web/checkout-connector/apple-login.js`
4. `web/checkout-connector/checkout-rpc-peer.js`
5. `web/checkout-connector/order-audit.js`
6. `web/checkout-connector/manifest.json`
7. `src/desktop/native-purchase-worker.mjs`
8. `test/checkout-c258-login-label.test.ts`

Current software source: 368 files, SHA256 `346363ae75ec9af972b93bca2abf45bb3894ef0b5d3b60f3f11653233be8da7c`, source commit `4eb28ce0ce8d09f660137229e56b46dcff23a5d4`. The repository is unchanged during this analysis. Existing tests pass, but they do not establish live authentication or a real unpaid order.

## Exact question and observations

We use an existing installed Chrome extension + authenticated local native-messaging pipe, operating normal Chrome with the user's existing browser profile. There is no headless personal browser, CDP attachment by the programme, copied cookie/profile, HTTP authentication replay, account rotation or proxy change. The application uses its own official shop tabs. Credentials, if supplied for a run, are memory-only and reach one identified `idmsa.apple.com.cn` document through an isolated content script. The user explicitly enabled the optional auth host.

The first live C257 probe stayed at the password form because the account field used `aria-labelledby` rather than the label sources we recognized. Read-only inspection established that field structure. A real isolated renderer test failed before C258's fix and passed afterward. Do not confuse this fixed parser defect with the current response below.

The current C258 programme actually reported `submitted` / `submit-password`, with no Root/manual login click. The visible form became a spinner, and the merchant never reached an authenticated order list within a bounded observation window. A supported, tab-scoped browser network diagnostic captured ONLY status/hostname/path:

- `idmsa.apple.com.cn` `/appleauth/auth/signin/complete`: HTTP 200.
- `secure11.www.apple.com.cn` `/shop/signIn/idms/authx`: HTTP 541.

No headers, request bodies, response bodies or query tokens were retained. Do not infer their contents. An older Oct5 incident at the same merchant endpoint returned 541 and the human reported a generic page-not-found response, but that is historical, not the current body's evidence. Ordinary human Chrome login has intermittently worked and intermittently hung in this project. Immediately after this latest diagnostic the human also said the official website was failing again. That supports investigating a merchant/session/service issue, but does not prove an Apple-only root cause.

The final probe closed all its owned resources and preserved the task journal byte-for-byte. It sent zero purchasing commands. A separate previous final submission has no verified order reference and remains unknown; diagnosing this login failure must not erase/replay it. The current human goal is eventually one programme-created Pro pickup order, stopping unpaid with no payment.

## Requested output

1. State exactly what the observed 200 then 541 establishes and what it does not. Is 541 a standard HTTP status with an authoritative meaning here? Do not invent an Apple mapping or assert a WAF/risk block without evidence.
2. Rank plausible causes: merchant handoff/session/service failure; stale/invalid transaction state; browser extension effects or synthetic form/event timing; account authentication/challenge; network/CDN differences. Tie each to actual evidence and explicitly identify speculation.
3. Review the current ordinary-form login code for concrete defects that could cause this symptom. Distinguish defects worth fixing from hypotheses requiring more observation. In particular consider linked-label resolution, browser autofill, normal input events, a same-task click, iframe/document changes, asynchronous framework state and the lack of current error display.
4. Propose the shortest bounded experiment sequence to distinguish the top hypotheses. Prefer existing normal browser/UI observations, status-only diagnostics, no password/request/cookie capture, no repeated failed passwords, no disabling protections, no forced controls, and no purchases. Specify stop conditions and exact success signals. Any host/permission expansion or auth challenge remains a separate human action.
5. Recommend practical programme recovery/UX changes that avoid indefinite spinning without silently retrying credentials or checkout. Explain whether preserving the original tab/session helps, and under what evidence an explicit normal refresh or fresh official entry is reasonable.
6. Give a direct recommendation for what Codex should do next now. If the external login handoff is unavailable, say so honestly and distinguish automatic form submission from completed login and unpaid-order creation.

Be concise but technically specific. Do not approve the whole application, remove purchase checks, or propose anti-bot/queue/security bypass as a solution. Report read coverage and any unavailable evidence at the end.
