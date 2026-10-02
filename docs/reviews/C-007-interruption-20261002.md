# C-007 dispatch collision and retained checkpoint, 2026-10-02

This is a management interruption record, not an implementation delivery, model verification or acceptance.

C-005-REVIEW-R2 returned at 14:04 Asia/Shanghai with bounded agreement on the 63-file candidate. This Codex controller verified those source bytes and observed the previous review process had ended. A separate controller then dispatched C-006 at 14:07:58. This controller dispatched C-007 at 14:08:06, eight seconds later, without discovering that new invocation in the intervening window. Both used the exact recorded session. The incomplete pre-dispatch check was insufficient to prevent the race.

On discovering both active receipts/processes, Codex verified the identity of its own C-007 child and stopped that child only. The earlier C-006 invocation was retained. C-007's invocation returned failure after 299.09 seconds, with no structured final result, no final modelUsage verification and no delivery report. It is not quota exhaustion and does not authorize a Codex product-code takeover.

The saved C-007 stream records writes to three new files: `src/launch.ts`, `web/launch/observer.js`, and `web/launch/samples.js`. Retain these partial files for inspection and eventual exact-session recovery. They have not been independently tested, connected to a completed runnable replay, reviewed or accepted. Do not attribute the concurrent C-006 changes in application/view/mock files to C-007. The previous 198-test/29-scenario result applies to the historical 63-file candidate, not this subsequent worktree.

No real purchase readiness results from this attempt. The task sheet and Chinese preparation register preserve the user's compatibility concern and the concrete remaining acceptance conditions. Resume only after C-006 and the separate controller finish, with a fresh check of all running project invocation metadata and project Claude processes. The full invocation stream stays ignored in `.local/`; no private conversation content is reproduced here.
