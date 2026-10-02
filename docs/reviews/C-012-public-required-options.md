# Actual Pro public configuration evidence — October 2

Codex observed the user's ordinary desktop Chrome on the current official public page:

`https://www.apple.com.cn/shop/buy-iphone/iphone-18-pro/mjt74ch/a`

The direct user instruction is to choose `不折抵换购` and `不加 AppleCare+ 服务计划`. This confirms the existing no-trade-in/no-extra condition. These are mandatory public configuration choices, not permissions to create another order.

Fresh visible DOM showed iPhone 18 Pro (excluding Pro Max), black, 256GB selected at CNY 9,999. `不折抵换购` was enabled and unchecked. The no-AppleCare radio and Add to Bag were disabled. Codex used the normal native radio control to select `不折抵换购`. The next fresh snapshot showed it checked and the no-AppleCare radio enabled. Codex then selected `不加 AppleCare+ 服务计划`. The next snapshot showed both no-extra radios checked and Add to Bag enabled. No disabled attribute or merchant validation was altered.

The exact C-012 read-only decoder prefix then reported `VARIANT`, `variantVerified: true`, `quotedCny: 9999`, and no missing model/color/capacity choices. This was supported browser-tool DOM observation, not installed-extension `chrome.scripting` execution. Private local receipts and screenshot preserve the public evidence. No bag addition, checkout, slot hold, order or payment was performed in this observation.

The immutable C-012 source under actual Claude review does not include these two required radios in `needsSelection`. It can stop at `ENTRY` with disabled Continue even though normal public configuration can unlock Add to Bag. The post-selection successful decoder observation does not prove that the current controller can perform the missing choices itself.

Required repair: bind no-trade-in and no-AppleCare to the configured plan, select each currently enabled normal control in the actual prerequisite order, observe after each selection, recognize the valid Add to Bag stage, and fail safely on missing/ambiguous/disabled/drifting controls. Do not infer no stock from an incomplete configuration. Verify selected no-extra choices before any subsequent resource mutation. Keep prelaunch, unknown-result and single-order boundaries intact.

This evidence supplements the earlier public-page observation in C-012 without changing the 115 frozen source files. Actual Claude review and the fix's independent acceptance remain pending.
