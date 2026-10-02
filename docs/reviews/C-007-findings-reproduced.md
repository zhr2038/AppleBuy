# C-007 cross-review: independent reproductions and repair criteria

October 2, 2026. Claude actually returned the read-only report in `docs/claude/C-007-cross-review-report.md`; its structured usage verified Opus 5.5. C-007 was rejected. The historical 83-file candidate remains preserved, not accepted by both reviewers.

Codex ran `node --test review/c007-findings.test.ts` against that product source: **9 tests, 0 passed, 9 failed**, each at the intended assertion. No real-site requests or mutations were made. The independent reviewer file is protected from implementation edits.

| Finding | Independent reproduction | Required result |
| --- | --- | --- |
| F1 invalid import | Save a valid observation, reject an extra field, then observe a valid sample | Rejection changes no durable files; later valid observation works; no false integrity warning |
| F1 stale observation | Observe a sample twice, then observe a new sample | Duplicate rejected; later valid observation works |
| F1 duplicate pending | Set unknown fixture twice, then observe | Second fixture rejected; unknown truth remains; observation works without recommendations |
| F1b future timestamp | Import a schema-valid 2099 timestamp after a current observation | Reject before persistence; current observation still works |
| F2 model | Synthetic Pro Max for a synthetic Pro plan | Product cannot be verified |
| F2 colour | Extended colour label containing the plan colour | Product cannot be verified |
| F2 store | Allowed prose label plus a different selected native store | Store cannot be verified |
| F2 price | Monthly currency amount with no labelled total | Tax-inclusive price cannot be verified |
| F4 dates | First eligible list cannot bind; a later list contains the old fourth date | Later list and restart cannot newly authorize that fourth date |

Other actual Claude findings F3/F5/F6/F7/F8 require implementation-owned tests and independent verification after delivery. F2 also needs an actual DOM visibility check, because an HTML-only parser cannot prove computed CSS visibility. A conservative unverified result is acceptable; asserting hidden controls are offered is not.

Business clarification: "offered dates" in this offline contract means visible, enabled, selectable native date choices. Disabled labels do not authorize pickup. Freeze the first complete eligible scope, including an unbindable outcome; a later refresh cannot enlarge it. This is a local business rule, not evidence of official list completeness.

Codex management changes for M1/M2 are separate from product implementation. The child starts suspended, its PID receipt is saved, it joins a Windows kill-on-close Job Object, and only then resumes. Timeout/return verifies the owned tree's exit signals before a terminal receipt. Uncertain cleanup remains `running` and blocks dispatch. Known spawn failure records failure without a fake Claude result. Actual isolated checks: 5 process-tree tests (including real grandchild and dispatcher death), 2 invocation-record tests, and the existing 2 lease tests passed. No unrelated process was terminated. Claude must review these exact management changes before acceptance.

The process design follows Microsoft's [Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects), [AssignProcessToJobObject](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-assignprocesstojobobject), [ResumeThread](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-resumethread), and [thread enumeration](https://learn.microsoft.com/en-us/windows/win32/toolhelp/thread-walking) APIs. Its supported and tested target is this Windows host.

The CLI's previous returned 41 turns exceeded the requested 35; requested CLI cost/turn caps are not established enforcement. The wall-time guard and owned-tree cleanup are independent. List-price usage is not an invoice or proof of subscription charges. Read-only auto-approval may allow commands outside `--allowedTools`; the task restriction and actual command disclosure remain necessary.
