# Milestones and recovery point

| Milestone | Scope | State |
| --- | --- | --- |
| M0 | Environment, requirement IDs, bounded fact-finding and technical proposal | Complete: actual Opus 5.5 connection and C-001 independent design review passed |
| M1 | Runnable offline plan → slot → refusal → fresh reselection → accepted continuation → rehearsal endpoint | In progress: C-002 session cc5b30a2-ea93-4a97-9c0b-f4ac8e78d684 |
| M2 | Current official entry adaptation with read-only evidence; no order or slot reservation | Pending; checkout evidence may remain locally blocked |
| M3 | Consistency, authorization guards, recovery and takeover tests A03-A13 | Pending |
| M4 | Controlled performance baseline, independent regression and user delivery | Pending |

Execution rule: one active implementer. Codex reviews artifacts and independently tests after each delivery. Two unsuccessful repair rounds trigger root-cause reconsideration. User explicitly authorized GitHub sync to zhr2038/AppleBuy; Codex pushes reviewed public-safe output, and Claude does not publish. Quota fallback is authorized; changes need later Claude review and agreement.

Current next action: independently review/run C-002 actual source and tests, then repair findings with the same session if needed. CLI 2.1.286 and actual `claude-opus-5-5` usage are verified in `docs/reviews/PROBE.md`. Real formal mode remains disabled. The remote repository was verified empty and public on 2026-10-01; no user remote work will be overwritten.
