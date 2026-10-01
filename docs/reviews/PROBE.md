# Claude connection verification

2026-10-01, Codex independent observation. Workspace `E:\Apple Store`.

Installed Claude Code upgraded through the existing WinGet installation from 2.1.268 to 2.1.286; model requirement >=2.1.280 confirmed from current official docs. Existing first-party Claude.ai authentication reused; no credentials requested or read.

First probe did not send a model request: CLI argument parsing reported missing prompt. Dispatcher corrected to provide stdin directly through a subprocess argument array. This was invocation syntax, not an authentication or quota failure.

Successful no-tools probe session `8b0e9e18-c008-45bf-91d1-69df96ac8941`: exit 0, structured subtype `success`, `is_error=false`, zero permission denials, effective `modelUsage` key `claude-opus-5-5`, result `CLAUDE_CONNECTION_OK`, duration 4.14 seconds. Explicit `--effort xhigh` used. No business code, purchasing actions, or tools executed.

Both agents use this directory. Project-local model/effort settings saved without secrets. Invocation logs are ignored under `.local/claude/`; reports here contain sanitized evidence only. Next task: C-001 feasibility proposal.
