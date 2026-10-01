# Apple Store Pickup Assistant

Workspace: `E:\Apple Store`. Preserve this directory for both Codex and Claude Code.

Codex owns requirements, priorities, task dispatch, independent review, and final acceptance. Claude Code owns architecture and implementation. All communication with Claude, task sheets, and review exchanges must be in English. Product UI and end-user instructions must be concise Chinese.

Use Anthropic Claude Opus 5.5 (`claude-opus-5-5`) at extra-high effort (`xhigh`, the CLI spelling of the requested extra level). Verify the actual model from structured `modelUsage`; do not silently substitute models.

Read `docs/requirements.md` and the assigned task before working. Claude may propose technical choices; Codex must not dictate language, framework, storage, or undocumented Apple interfaces in advance. Claude cannot approve its own work or weaken acceptance criteria.

The user subsequently authorized Codex to implement if Claude's quota is exhausted. Record the quota evidence and every Codex implementation change. When Claude is available again, Claude must review those changes and both reviewers must agree before final acceptance. Never imply review happened when it did not.

Default to offline rehearsal. This project-start request is not authorization to purchase, pay, create a real order, or reserve a real pickup slot. Real-site development observation is read-only and stops before resource mutations. Human-only authentication remains human-only. Do not bypass validation, rate limits, queues, security settings, or purchase limits.

No credentials, cookies, payment information, raw authenticated requests, or private conversation logs in Git or model input. Do not access unrelated projects or accounts. The user authorized Codex to sync reviewed project output to `https://github.com/zhr2038/AppleBuy`; Claude must not push or publish. Check new hooks/MCP/package scripts before executing them. Keep invocation records under ignored `.local/` and sanitized review reports under `docs/reviews/`.

Never run a second implementer while the first task is running or its status is unknown. Resume fixes using the exact recorded session ID. Codex independently runs tests, exercises failure paths, and blocks delivery for incorrect purchase conditions, duplicate orders, credential leakage, unknown-result resubmission, or broken slot reselection.

For historical context use the local `mem` bridge narrowly; do not include unrelated credential-bearing history in Claude prompts. The project is registered with `mem`.
