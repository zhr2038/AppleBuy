# C214 corrected R2 parallel implementation — unreviewed

The human explicitly directed immediate R2 development alongside R1 and strict adherence to C211's corrected Markdown. The Python window remains the only user control surface. The withdrawn pure-extension/new-empty-namespace design was not implemented. R1's exact 322-file source was retained in an ignored local snapshot before these changes.

## Implemented

The new browser-local executor runs the existing production PurchaseJob, ChromePort and reviewed page recognizers within the extension bridge. Ordinary per-step page reads/actions no longer travel through Node/Python/native messaging. The Python window selects R1 or R2 and retains start/pause/stop/current consent/status. A readonly capability check rejects an old installed peer before creating a tab or consuming a successor. No new extension permission, host registration or browser profile is added.

The desktop still performs full existing source/archive/backup/authority validation under the same kernel lease, then supplies the same task snapshot to R2 in bounded hashed chunks. Every job save produces a bounded delta that cannot change source archives, old history roots, plan, task/tab/context identity or original deadline. The original atomic writer commits it and verifies the exact hash before acknowledgement. Only that acknowledgement lets the browser job continue to a native action. No new persistent namespace or removal of old records exists. The browser also holds the existing origin Web Lock and refuses simultaneous R1 RPC page operations while a browser run owns the peer.

R2 keeps existing document-targeted injection and fresh recognition, not a cached page result across navigation. Browser-local authentication and ordinary late-stage waiting observe only expected successors inside the existing window. Current UI permission/merchant challenge rules remain. Pause, native disconnect, missed heartbeat, a browser call that never returns, denied kernel ownership and unconfirmed disk writes stop future advancement. A sent action may still finish remotely; pending intent remains unknown and is not repeated. There is no automatic fallback to the desktop buyer after an uncertain R2 run.

Bridge status uses a bounded event-driven long-poll: it wakes immediately for a journal checkpoint or completed run, and otherwise returns within 300ms. There is no fixed desktop sleep on each successful step. This is transport scheduling, not evidence of a measured real-site speed improvement.

R1's current-review provenance disclosure and one final under current consent remain shared. Real merchant missing store/time fields are not invented. The actual payment-dependent pickup-date notice remains visible. A retained sent final may only reconcile its same order after expiry; it cannot become another submission.

## Actual evidence and limits

The new production full-chain FAKE fixture runs empty bag through configuration/one Add/one Checkout, terminal-slot refusal/reselection, contact, payment, review and exactly one independently matched FAKE unpaid order. The singleton-bag route does zero Add. Tests check durable intent at each native call, preserved large history, write failure, pause, external FAKE login completion inside one browser actor, competing origin/kernel owners, malformed upload, native disconnect during an awaited permission call, heartbeat expiry, an unresolved browser call and expired-final reconciliation. A physical temporary task file exercises the real kernel holder and atomic writer.

A separate contained Chrome test imports the real production modules into the renderer and traverses actual rendered FAKE slot/contact/payment/review DOM. It uses real navigator.locks and the real native page program, with FAKE Chrome APIs/addresses/merchant/authority. It reaches source-disclosed consent and clicks one FAKE final; the deliberately absent receipt stays unknown and cannot be submitted twice. No personal profile, official site, customer input or live order is involved.

Current verification is 1829/1829 Node and 66/66 Python. New R2 scope is 16 Node and two Python cases. Initial fixture/GUI/startup failures and their fixes are retained in C214 verification; old assertions were not weakened. C192's existing helper exception was already part of R1. The R2 startup slice fix moved the actual executor declaration into the worker startup body, preserving all protected tests.

This is an unreviewed implementation candidate, not a deployed or accepted purchase system. Registered content-script/MutationObserver changes have not been claimed; existing document IDs and fresh injection remain the reused recognition mechanism. The actual final receipt/detail and actual refusal contract still require lawful real evidence. Real native-pipe latency, installed-extension API integration, programme unpaid-order verification and speed are unproved. A rewrite cannot resolve merchant restrictions, missing deployment access or an unknown final by itself.

C215 consolidates this scope and the pending R1 changes for the original Opus 5.5/max reviewer after the reported 23:10 recovery; scheduled follow-up is 23:15. C213 was never invoked and is superseded. No final acceptance, publish-to-main, shutdown or reboot occurred.
