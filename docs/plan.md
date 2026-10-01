# Milestones and recovery point

| Milestone | Scope | State |
| --- | --- | --- |
| M0 | Environment, requirement IDs, bounded fact-finding and technical proposal | Complete: actual Opus 5.5 connection and C-001 independent design review passed |
| M1 | Runnable offline plan → slot → refusal → fresh reselection → accepted continuation → rehearsal endpoint | Accepted: PASS_OFFLINE_SLOT_RESELECTION_M1, 86/86 independent rerun, 27/27 CLI scenarios |
| M2 | Current official entry adaptation with read-only evidence; no order or slot reservation | Pending; checkout evidence may remain locally blocked |
| M3 | Consistency, authorization guards, recovery and takeover tests A03-A13 | Partial: single-process/shared-state engine tests passed; integrated task ownership/ledger and A08 pending C-003 |
| M4 | Controlled performance baseline, independent regression and user delivery | Decision-level benchmark and CLI regression passed; browser/DOM/rendering evidence pending C-003 |

Execution rule: one active implementer. Codex reviews artifacts and independently tests after each delivery. Two unsuccessful repair rounds trigger root-cause reconsideration. User explicitly authorized GitHub sync to zhr2038/AppleBuy; Codex pushes reviewed public-safe output, and Claude does not publish. Quota fallback is authorized; changes need later Claude review and agreement.

Current next action: publish the accepted M1, then fill in the prepared C-003 budget/tools and actually dispatch it after re-reading the current accepted artifacts. The same Claude session `cc5b30a2-ea93-4a97-9c0b-f4ac8e78d684` completed C-002-R1 and C-002-DOCS; no implementer remains active. The first dispatcher stopped at its 20-minute wall budget; no quota failure was observed. CLI 2.1.286 and actual `claude-opus-5-5` usage are verified in `docs/reviews/PROBE.md`. Real formal mode remains disabled. User purchase configuration and real checkout evidence remain unavailable. The remote repository was verified empty and public on 2026-10-01; no user remote work will be overwritten.
