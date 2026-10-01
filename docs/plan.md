# Milestones and recovery point

| Milestone | Scope | State |
| --- | --- | --- |
| M0 | Environment, requirement IDs, bounded fact-finding and technical proposal | Complete: actual Opus 5.5 connection and C-001 independent design review passed |
| M1 | Runnable offline plan → slot → refusal → fresh reselection → accepted continuation → rehearsal endpoint | Accepted: PASS_OFFLINE_SLOT_RESELECTION_M1, 86/86 independent rerun, 27/27 CLI scenarios |
| M2 | Current official entry adaptation with read-only evidence; no order or slot reservation | Pending; checkout evidence may remain locally blocked |
| M3 | Consistency, authorization guards, recovery and takeover tests A03-A13 | C-003 offline candidate: integrated task ledger/ownership/crash recovery tested; final acceptance pending Claude cross-review after actual quota stop |
| M4 | Controlled performance baseline, independent regression and user delivery | 111 tests, 27 CLI scenarios, 200 measured runs/policy and actual browser evidence; pending mutual agreement, no speed advantage claim |

Execution rule: one active implementer. Codex reviews artifacts and independently tests after each delivery. Two unsuccessful repair rounds trigger root-cause reconsideration. User explicitly authorized GitHub sync to zhr2038/AppleBuy; Codex pushes reviewed public-safe output, and Claude does not publish. Quota fallback is authorized; changes need later Claude review and agreement.

Current next action: after the reported 20:20 Asia/Shanghai reset, actually dispatch read-only C-003-REVIEW in session `11941a88-4609-4e7f-a2f8-78c5b5837285`. C-003 ran until genuine session-limit exhaustion; Codex took over under the user's explicit exception, reproduced/repaired defects and tested a candidate. A 20:25 thread heartbeat is configured; it has not yet performed the review. Source manifest and exact evidence are in `docs/reviews/C-003*.json` and reports. Do not mark mutual agreement or final C-003 acceptance without an actual successful Claude review. M1's verified parent is `9a7d525a0fd226e43ff5b5ebf3eacb1192d78fdc`. Real formal mode remains unavailable. Public catalog evidence is partial; user purchase configuration and actual checkout/slot contracts remain missing. Preserve any new user/remote changes before every sync.
