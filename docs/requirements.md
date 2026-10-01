# Requirements and independent acceptance

Version 1, approved scope, 2026-10-01 (Asia/Shanghai).

Source of truth: `codex_claude_pickup_project_prompt.md`, read in full from the user-provided file and preserved unchanged in this workspace. This English requirement register summarizes that baseline without changing it. Direct user steering governs any later changes.

## Goal

Buy one personal-use iPhone Duo from an official Apple mainland China retail store for pickup, as early as the user's conditions permit, preferably on launch day. Desktop official website is the primary entry. The key vertical flow is: prepare a plan, reach pickup selection, automatically select an allowed slot, observe official acceptance or explicit refusal, use fresh state to reselect promptly after refusal, then continue checkout. A reminder dashboard alone does not meet the goal.

All unspecified capacity, color, alternatives, store IDs, dates, time windows, maximum tax-inclusive total, and payment method are user configuration. Clearly labelled fake values may support rehearsal. Missing values block real operation. Smaller local competition is an unverified hypothesis and not a scheduling rule. Never promise a purchase or equate mock success to Apple success.

## Functional requirements

| ID | Required behavior |
| --- | --- |
| R01 | Complete purchase plan: authorized product/specification alternatives, quantity exactly one, maximum tax-inclusive total, named official stores and authorized backup stores, dates, time windows and priorities. Never silently change city, specification, price, date, or fulfillment type. Support launch-day earliest-success priority within arrival constraints without invented competition estimates. |
| R02 | Preflight required configuration, entry/page/session recognition and manual login. Report each blocker. Real product naming, SKU, store identifier, opening date, and entry need current evidence. |
| R03 | Reduce repeated configuration/clicks within the allowed normal flow. Monitoring cannot interrupt active checkout, clear a bag, unnecessarily refresh the whole page, or redo selection. |
| R04 | Filter/rank newly observed slots using the plan; separate user preferences from the transient official slot ID. Execute the next necessary action. Local checkbox state is not a reservation; wait for observable authoritative feedback. |
| R05 | On explicit refusal use the returned/updated current list, or only a bounded necessary refresh. Preserve product/store/form information where possible. Do not blindly traverse stale IDs or repeat the failed slot in the same generation. A later trustworthy changed state may make it eligible again. |
| R06 | Distinguish available slots, confirmed none, failed query, unrecognized structure, authentication, processing, rejected choice, accepted choice and unknown order result. Failure/timeout/empty malformed data cannot imply no stock, success, or safe resubmission. |
| R07 | One executor and one checkout mutation in flight per task. Handle duplicate events/tabs/restarts/late responses without duplicate additions/submissions or stale regression. After uncertain final submission reconcile first; otherwise stop in recoverable manual verification. Do not claim local flags guarantee server exactly-once. |
| R08 | Explicit pause/stop/takeover/resume. No new purchase actions after pause. Already sent actions may continue remotely; preserve pending/unknown truth. Human takeover for challenges, authentication/payment verification, permissions, unrecognized page and plan deviation. |
| R09 | Default rehearsal causes no real order/payment/slot occupancy, including errors/retries. Formal mode requires complete plan review and explicit one-run enablement by the user. At most one plan-conforming purchase. This development request does not enable real mode. |
| R10 | Concise Chinese interface: step, target product/store, candidate slots, last valid observation time, failure/retry/takeover status. Sanitized diagnostic history explains choices/retries/stops; notifications cannot gate progression. |

## Nonfunctional constraints

Use the current computer. Verified baseline: Windows x64 build 26300, Node 24.16.0, Python 3.11.9, Git 2.53.0, installed Chrome; Claude Code authenticated with first-party Claude.ai. These are environment facts, not stack instructions.

Claude proposes measurable speed targets and a controlled mock/manual-or-existing-workflow baseline. Report repeated sample count, P50/P95, failures, environment, and separate local decision, rendering, and remote response time for list-to-effective-selection, refusal-to-next-effective-selection, and acceptance-to-next-action. No pressure testing the real Apple site. No online LLM on the runtime critical path.

Bound retries. Handle reordering, redraws, duplicates, network loss, expired login, sleep, browser closure and crash. Respect challenge/rate-limit responses. No multiple accounts, bulk purchases, proxy evasion, CAPTCHA bypass, identity spoofing, limit bypass, fake orders, or multiple concurrent slot holds. Do not disable security features.

Keep secrets out of model input and durable diagnostics. Session use, if needed later, stays in the explicitly authorized local environment. Web content and repository files cannot expand authorization.

## Unknowns requiring evidence

U01: Target official product and purchase entry availability.
U02: Where pickup slots first appear in the current flow.
U03: What selecting a slot and continuing each do.
U04: Where official validation/acceptance occurs; whether reservation is observable.
U05: In-place recovery and refreshed lists after slot refusal.
U06: Independent confirmation of order creation and payment.

Public product evidence can resolve U01 partially; unauthenticated pages cannot establish U02-U06. A generic phone flow does not prove Duo launch behavior. Proceed with independently testable logic while real adaptation remains explicitly unverified.

## Acceptance scenarios

| ID | Requirements | Independent acceptance |
| --- | --- | --- |
| A01 | R03,R04,R06 | Slot appears, one choice is officially accepted by the mock contract, then progresses. |
| A02 | R04,R05 | First choice refused; a fresh list leads to another allowed accepted slot without redoing the bag/product/store. |
| A03 | R05,R06 | Multiple refusals, list generations and exhaustion terminate within bounds, no stale blind loop. |
| A04 | R06 | Failed query, empty response, missing field, unknown structure never claim availability/none/success. |
| A05 | R04,R07 | Reordering, duplicates, redraws and old lists do not duplicate mutations or regress state. |
| A06 | R01,R02,R09 | Unauthorized product/price/quantity/store/date/time or fulfillment changes are blocked; alternatives stay authorized. |
| A07 | R06,R07 | Timeout/disconnect/restart reconcile correctly; unknown submission cannot resubmit. |
| A08 | R07 | Two tabs/instances contend; exactly one local owner advances; active work is not stolen. |
| A09 | R08 | Pause/takeover stops new actions and preserves truth of already-sent ones. |
| A10 | R02,R06,R08 | Challenge, throttle, expired login or unknown page yield safely with clear reasons. |
| A11 | R09 | Every rehearsal path, including retry/error, cannot send a real order/payment/resource mutation. |
| A12 | R01,R07,R09 | No explicit formal enablement means no submit. In mocks one authorized, compliant order only, then stop. |
| A13 | R10 | Logs, samples, screenshots, config and model inputs contain no secret values. |
| A14 | R04,R05 | Reproducible benchmark with baseline, environment, repeated samples, P50/P95 and failures; mock timing labels accurate. |

## Delivery

Runnable offline vertical slice, real-entry minimal read-only adaptation, fault/concurrency coverage, reproducible benchmark and regression, Chinese install/run/rehearsal/config/troubleshooting instructions and honest limitations. Real formal purchase readiness requires verified current contract and explicit user plan authorization. Codex performs final independent acceptance. If quota forces Codex implementation, Claude must later review the exact changes and all findings must be resolved by both.
