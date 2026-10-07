# Requirements and independent acceptance

Version 1, approved scope, 2026-10-01 (Asia/Shanghai).

Source of truth: `codex_claude_pickup_project_prompt.md`, read in full from the user-provided file and preserved unchanged in this workspace. This English requirement register summarizes that baseline without changing it. Direct user steering governs any later changes.

## Goal

Buy one personal-use iPhone Duo from an official Apple mainland China retail store for pickup, as early as the user's conditions permit, preferably on launch day. Desktop official website is the primary entry. The key vertical flow is: prepare a plan, reach pickup selection, automatically select an allowed slot, observe official acceptance or explicit refusal, use fresh state to reselect promptly after refusal, then continue checkout. A reminder dashboard alone does not meet the goal.

All unspecified capacity, color, alternatives, store IDs, dates, time windows, maximum tax-inclusive total, and payment method are user configuration. Clearly labelled fake values may support rehearsal. Missing values block real operation. Smaller local competition is an unverified hypothesis and not a scheduling rule. Never promise a purchase or equate mock success to Apple success.

## Direct user steering after the baseline

October 2 evening: the user expressly prioritizes actual purchasing over web polish. The interface only needs to operate on their desktop computer. Do not expand mobile/responsive-design, appearance, dashboard or reminder scope. Functional acceptance, exact purchase conditions, refusal/reselection, checkout continuation and no-repeat protection remain mandatory; broad visual refinement does not block the next functional milestone.

October 2 explicit Pro pilot authorization supersedes the development-only restriction only for C-008: create one unpaid official order for iPhone 18 Pro 256GB black, total at most CNY 9,999, Dalian official-store pickup, the initial first at most three offered dates in order and each day's last slot. Stop before payment; no extras, trade-in or installment. User specifically requires their desktop Chrome, advance configuration and one explicit start, with actual official flow and measured timing. The user reported personally creating a two-unit pickup order and cancelling it; current official Chrome order-list observation confirms a recent cancelled pickup order, not agent completion. The account and all authentication/contact values remain private and must not enter these documents, Claude prompts or Git. Existing unknown-result and one-order requirements remain mandatory. Duo real mode is still not authorized.

The pickup preference now selects the last offered slot on the first actual offered pickup date, then the last on the second, then the third, subject to all existing conditions. This describes relative offered dates, not calendar today and not a guarantee that Apple offers three dates. Do not silently substitute an earlier same-day slot. Private customer configuration remains local and is not reproduced here. C-005 tests terminal-offer selection over an already bound concrete allowed-date set; automatic verified real relative-date binding is still outstanding. Bind the initial authorized set before running and preserve it across refresh/restart instead of rolling it forward to a fourth date.

October 2 independent review clarifies the no-earlier-fallback rule: once a trustworthy recognized list established a terminal offer for a store/date in a run, its omission cannot silently authorize an earlier offer in that group, even if disappearance precedes sending. Preserve the restriction across pause/restart. The same terminal or a later offer can be reconsidered under a later trustworthy changed state and the existing attempt/freshness bounds. This does not authorize other stores or dates.

The user requests design based on actual official checkout and expects the Pro and Duo slot shape to match with dates differing. The authorized historical Pro observation provides a native date/time-control and 15-minute-slot reference. Current Duo values, completeness, acceptance/refusal and resource effects still require evidence; duration, last time and number of offered dates must be observed data rather than fixed assumptions.


October 2 C-008 result: the authorized one-unit Pro unpaid order was actually created once in the user's desktop Chrome and independently verified on its authenticated order-detail page. No payment was attempted. This consumes that one-order authorization even if the payment window expires. This was Codex browser-tool operation, not the application's one-click adapter. Current Pro evidence establishes slot-control shape and progression after one selected terminal, but not rejection, occupancy, payment-completed pickup date or Duo checkout behavior. The official review explicitly states that the pickup date will be determined after payment. No broader real-order authorization follows from this pilot.

October 2 late evening: the user expressly requires the normal official public options `不折抵换购` and `不加 AppleCare+ 服务计划`. Codex's actual Chrome observation confirms the dependency on the Pro page: no-trade-in enables no-AppleCare, and selecting no-AppleCare enables Add to Bag. The configured executor must perform and verify those prerequisites; missing selections are not no stock. The user asks to inspect subsequent flow rather than create another order. No new bag/slot/order/payment authorization follows. Normal configuration validation must stop at its declared endpoint and cannot force disabled controls or bypass merchant validation. The user also asks to resume actual Claude collaboration; the exact-model original-session review did return and rejected current C-012 source for independently reproduced wrong-store and repeated-addition defects.


October 4 user steering: routine already authorized development, normal configuration, observation and self-testing should proceed autonomously without repeated confirmation. The explicit one-Pro removal and restoration was completed through normal Chrome; normal pickup/date preview was also observed, stopping before selecting/submitting a time. Do not turn development heartbeats into a fresh order/payment/slot authorization or override action-time tool security/terms/challenge rules. The latest instruction cancels shutdown. Main-function progress has priority over cosmetic UI work; preserve exact one-unit conditions and the used C008 order authority.

## Functional requirements

Latest October6 active direct goal changes the collaboration contract: Codex writes implementation and tests regardless of Claude quota. Claude Opus5.5/xhigh is used for actual cross-author review only when available, with English exchanges/same directory. Do not wait for a Claude design or quota recovery to implement. Actual review and mutual agreement remain required before final acceptance; self-tests and programme public preflight do not prove the requested unpaid order.

October6 direct human priority: complete and independently verify programme-driven one-click Pro purchase ending in one unpaid order before considering migration to Duo. Keep every fixed Pro condition and current unknown-result record; do not treat a simulation or native-window proof as that acceptance. New Duo implementation is deferred until the actual Pro programme order passes.

October5 late-evening desktop steering: the user asks for a Python application window instead of mandatory browser-extension controls, with autonomous Computer Use testing to reduce repetitive human clicks. This is a requested direction, not approval of a specific GUI/browser/session architecture. C066 actually proves one owned native-window click and completion of the existing offline terminal-slot/refusal engine. The browser cua surface disables native input, while a separate documented Windows Computer Use plugin is available; do not claim global native unavailability from the browser surface alone. Native app testing must not be used to circumvent the rejected extension page, automate authentication or copy personal browser state. Desktop real-browser adapter and privacy-preserving legacy-ledger handoff remain unimplemented. Current unknown Add/slot records and all purchasing constraints remain mandatory.

October4 renewed human authorization (C046): the user specifically requests one new Pro256GB black, <=CNY9999, existing Dalian Henglong official pickup/initial first-three terminal slots/Alipay/no extras, ending unpaid with no payment. AppleBuy itself must perform Checkout and all later purchase actions; coordinator browser clicks cannot substitute. C008's old used authority remains historical. Preserve all old unknown/pending records, reuse a matching one-unit bag, and confirm current merchant terms only at the actual review action under browser-tool rules. Current C046 program result is still pending, with no new unpaid order observed; normal preparation/login/observation is allowed, no Duo real order follows. No shutdown.

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

October7 direct user authentication steering: the user explicitly authorizes Codex to use the supplied existing Apple credentials for routine login in normal Chrome without asking again. This supersedes the earlier user-level human-only routine-login preference where the supported browser tool permits ordinary form interaction. Credentials stay out of repository files, Claude input and diagnostics; this does not authorize saving a new password, security-access expansion, native authentication UI, challenges or bypassing a tool restriction. The supported normal-Chrome login actually succeeded after one ordinary refresh in C148; later purchase actions still come from AppleBuy.

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

October5 direct human sleep steering: continue useful development/review and, after genuine Claude provider quota, Codex may take over under the prior rule. If the next necessary step requires the human, save source/evidence/recovery, pause follow-up and perform normal shutdown until tomorrow. This supersedes previous no-shutdown steering conditionally; do not manufacture quota exhaustion or erase a pending merchant result.

October5 current direct pickup steering: the user expressly rejects treating the historical after-payment date statement as an in-store-pickup limitation. Only mainland official Dalian store pickup is in scope. Use current observed pickup/store/date/time facts; do not design delivery behavior or block the main chain because of that old generic/historical prose. This does not fabricate missing current facts or certify a held slot.
