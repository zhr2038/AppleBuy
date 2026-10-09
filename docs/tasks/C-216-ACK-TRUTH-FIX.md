# C216 repair of actual C215 findings F-A and F-B

C215 actually completed with first-party Opus5.5/max, 29/29 scoped EOF reads, exact commands and 1829/66 passes, but returned DISAGREE. Root independently reproduced four red cases: pause during the durable checkout/final write, and a 3-second write exceeding the old heartbeat. A fifth red case exposed the earlier unsent final-draft pause boundary. This task repairs those concrete triggers without converting any uncertain delivery into a safe retry.

The browser may return an unreleased-checkpoint receipt only when it stops with an unresolved write waiter. Finish must be terminal and match this run, sequence and row hash. The desktop corrects only a newly introduced pending intent or newly introduced unsent final draft from that same checkpoint; it verifies the current disk row again under the held lease before correcting. Old pending actions and accepted/lost acknowledgements must remain unknown. No timeout/silence or generic negative RPC reply by itself proves not-sent.

For final retry, the record carries this exact positive receipt bound to the same task/context/document/intent. Only that narrow marker lets runtime/session/source-review prepare another fresh current terms grant. The previous grant is not reused, and unknown sent final records still cannot submit or acquire a successor. Final history stays retained.

F-B: the original 2.5-second heartbeat still applies before a checkpoint is offered and after ack. A delivered write checkpoint has a separate fixed 15-second ack deadline to cover hash/read/fsync/read-back. Polling cannot repeatedly extend it. The task and action deadlines are unchanged.

Validate both final-draft and pending-final pause, explicit ack rejection, slow disk, accepted ack with lost reply, inherited unknowns and mismatched terminal receipts. Include native rendered source-bound review, fresh consent, one final and unknown receipt/no duplicate. Preserve all existing assertions. No real browser/customer journal/deployment/purchase. Return the integrated candidate to the original reviewer at max before acceptance.
