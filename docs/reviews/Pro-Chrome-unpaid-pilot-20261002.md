# Actual Chrome Pro unpaid-order pilot — October 2

Executor: Codex browser tools in the user's desktop Chrome. This is an actual authorized merchant flow, not an application-runtime benchmark or proof of unattended Duo purchasing. Claude did not execute or review this pilot; its current invocation exhausted quota.

The user explicitly authorized one iPhone 18 Pro 256GB black, mainland official-store pickup in Dalian, total including tax at most CNY 9,999, no extras/trade-in/installment, and stopping at one unpaid order. The user separately confirmed the merchant terms at the final action. No payment was authorized or performed.

## Observations and result

- The Chrome order history initially showed a recent cancelled pickup order. The user's separately reported two-unit cancelled order was not counted as agent execution.
- One add-to-bag action returned a tool timeout. Read-only reconciliation found exactly one matching item, quantity one and CNY 9,999. Codex did not add again.
- Normal secure checkout exposed the pickup radio and Apple 大连恒隆广场. The actual initial date labels were October 2, October 3 and October 4; no year was shown in those controls, so no ISO year was inferred.
- The first date's current native time selector displayed 19 valid ranges. The latest was 21:15–21:30. One selection and one continuation reached pickup details. This does not independently prove a slot hold. No real slot refusal occurred in this pilot.
- Pickup details asked for the government-issued identity number's last four digits, not the full number. The user supplied the suffix for this merchant step. It is omitted here and encrypted only under ignored local Windows DPAPI CurrentUser configuration. Application consumption/prefill of that configuration is not implemented by creating the configuration file.
- Alipay was selected. The official review showed one matching phone, CNY 9,999, and explicitly said the pickup date would be determined after payment.
- One final order action was recorded durably before clicking. Apple displayed that the order was awaiting payment. A separate normal account login then opened authenticated order details matching the newly created order, matching product and amount, and explicitly naming Apple 大连恒隆广场 as the in-store pickup location. No second order submission or payment action was sent.

The endpoint was confirmed at approximately 15:40: **one unpaid official Pro order**. The final-order authorization is consumed, including if its payment window later expires; do not recreate it without a new user request. The merchant showed a 30-minute payment window. Later development continued beyond that window, so this report does not assert that the order is still awaiting payment now. The original merchant tab later became unavailable to the browser-tool handle; retained private screenshots and receipts are the historical evidence. Account, identity suffix, order number, contact details, payment links and authenticated URLs are not in this report or Claude input.

## Timing boundaries

Native time-option selection returned in 32 ms. Agent list-read to local selection was 99,576 ms, including model/tool overhead. The final order button call returned in 634 ms; the first authoritative awaiting-payment observation was within 23,237 ms of that click, including the agent's check interval. These are single observations, not repeated latency statistics, server-processing measurements or application purchase speed. Login, user data/terms confirmation and review pauses occurred. No real pressure test was performed.

## Remaining implementation and evidence gaps

The application still has no verified unattended Chrome checkout adapter. The pilot supplies current normal-flow evidence for product, pickup controls, last-four identity field, payment selection, review, order creation and unpaid confirmation. It does not establish Duo compatibility, launch congestion, real refusal/reselection semantics, full date/year binding, reservation guarantees or success probability. A future one-start interface must preserve one executor, durable submission intent, merchant-condition checks and unknown-result reconciliation; an enabled button or local selected option must never be presented as a reserved slot or completed order.
