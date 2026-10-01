# Decisions and evidence

D001 — Approved roles and scope: Claude designs/implements; Codex owns independent acceptance. English Claude communication. Default rehearsal; no real purchasing authorization. Later user steering permits Codex implementation only if Claude quota is exhausted, with subsequent Claude review and agreement required.

D002 — Exact environment: empty `E:\Apple Store`, no existing Git repository, parent/project AGENTS/CLAUDE/hooks/MCP not present. User-supplied infrastructure credentials are irrelevant and excluded. Global Claude settings expose no hooks or MCP servers, and global CLAUDE.md only contains the local memory-bridge rule. First-party Claude.ai login verified; no secrets inspected.

D003 — Model: pin `claude-opus-5-5`; requested extra effort maps to the documented extra-high `xhigh` CLI value. Verify effective model in structured output, not model self-description. Source: https://code.claude.com/docs/en/model-config (checked 2026-10-01). No automatic fallback.

D004 — Public target evidence: the official Duo purchase page https://www.apple.com.cn/shop/buy-iphone/iphone-duo states preorder October 16 at 20:00, release October 23, and sale after approval; starting price RMB 15,999. Independently corroborated by Codex on 2026-10-01. The timezone is not explicit in the received text. Catalog retrieval varies between tools, so the target page is the date reference. This is public-entry evidence only; exact configured SKU, store, pickup contract, reservation and checkout are unverified. No product configuration is authorized by these facts.

D005 — C-001 offline design approved: Node 24 with erasable TypeScript, zero runtime dependencies, deterministic core, scripted mock port, write-ahead sanitized journal and Chinese CLI. A pinned TypeScript dev dependency/lockfile is allowed after script review, installed without lifecycle scripts. All proposed interfaces and scenario states are mock contracts, not Apple interfaces.

D006 — Primary model verified from initialization and every assistant message. WebFetch internally uses a separately accounted small summarizer; this is auxiliary page processing and not assistant fallback. Implementation tasks omit WebFetch, and another assistant model fails verification. Actual desktop UI also displayed Opus 5.5 / Extra.

D007 — User authorized synchronization to https://github.com/zhr2038/AppleBuy . GitHub CLI verified authenticated owner zhr2038 and an empty public repository. Codex may commit/push reviewed source and sanitized documentation. Private settings, logs, runtime journals and real plans remain excluded. No deployment or live purchase authorization is implied.
