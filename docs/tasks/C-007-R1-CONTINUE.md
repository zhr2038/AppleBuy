# C-007-R1 continuation — finish interrupted repair and deliver its evidence

Resume the exact session `11941a88-4609-4e7f-a2f8-78c5b5837285`, same workspace, Opus 5.5/xhigh, English. The preceding actual R1 stopped with `error_max_turns`, not quota exhaustion and not a wall timeout. Structured model usage verified Opus 5.5; the dispatcher confirmed all owned process exit signals. No other implementer is running. This continues the unfinished R1; do not restart the architecture or silently claim it delivered.

Read requirements, CLAUDE.md, C-007-R1 and this update. Verify the current continuation candidate manifest; the original before-manifest is historical and no longer matches repaired files. Retain all implemented repairs. Codex independently ran the original nine reproductions: 9/9 passed; the full suite at that point: 234/234 passed. Codex then added a protected recovery/upgrade suite: seven ordinary crash boundaries passed, two new safety criteria failed. These checks are Codex evidence, not yours.

Fix both concrete failures in `review/c007-recovery-upgrade.test.ts` without editing that protected file:

1. **Legacy unbound scope:** a v2 state can have observed the first complete, unbindable list but lacks a saved scope. Current migration treats it as not yet observed, and later authorizes the old fourth date. Unknown legacy permission must fail conservatively; a documentation limitation cannot authorize new dates. Preserve known bindings, terminal floors and pending/unknown truth. An empty never-observed legacy state can be distinguished if evidence actually supports it. Add implementation-owned tests for bound/unbound/empty/unknown migration.
2. **Recovery payload validation:** a self-consistent intent hash with an invalid monitor stage is redone, writes marker/journal/state and changes the intent to committed before monitor validation rejects it. Validate the complete recovery state, identity and allowed shape BEFORE every write. The malformed-intent test must retain original bytes and create no artifacts. Ordinary first-save intent/marker/journal/state crashes and subsequent restart-save intent/journal/state crashes must still recover, invalidate refs, preserve scope/pending and send no action. This is schema-validation order, not a claim of cryptographic protection against wholesale coherent replacement.

Finish the original R1's missing implementation tests and exact report: F3 issuance/projection/owner/plan/expiry/replay attacks; F1 transient view and plan mismatch; F2 conflicting conditions/total/visibility; F7 missing/stale start expectations before SSE; F8 used/ledger/advanced copy. Do not weaken existing assertions. The ledger branch currently prevents start and does not consume a new arm; document that exact behavior accurately, correcting any earlier assumption. Codex has captured an actual 390px historical pre-R1 screenshot with warning adjacent to start; final current bytes still need actual browser validation by Codex.

Separately finish the actual read-only review of Codex management repairs M1/M2 and the previous quota-takeover changes. Explicitly state bounded agreement or concrete findings, distinguishing your implementation from Codex's. Do not self-approve your own repairs. Preserve candidate test criteria and source attribution. Product/UI/tests/runbook edits remain authorized, management/reviewer/settings/private files remain off limits. Zero external requests, merchant mutations, new orders, payments, slot holds, installs, agents or publication. The Pro authorization remains consumed.

Approved exact Bash commands:

- `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-007-R1-continuation-candidate-manifest.json`
- `node --test review/c007-findings.test.ts review/c007-recovery-upgrade.test.ts`
- `node --test "test/*.test.ts" "review/*.test.ts"`
- `node src/cli.ts rehearse --all`
- `python tools/delegation/test_process_tree.py`
- `python tools/delegation/test_invocation_guard.py`
- `python tools/delegation/test_dispatch_lock.py`

Return `docs/claude/C-007-R1-report.md` and an actual final English delivery with changed files, root causes, tests run/unrun, migration limits, exact unresolved issues, permission/cap failures and separate review conclusions. The next dependency remains the C-009 Chrome one-start proposal after independent acceptance and actual scoped agreement. If stopped again, leave a precise checkpoint instead of claiming completion.
