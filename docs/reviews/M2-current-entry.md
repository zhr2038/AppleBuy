# M2 current public entry — evidence, not a checkout contract

On 2026-10-01 around 18:18 Asia/Shanghai, Codex opened the previously observed [official Duo variant page](https://www.apple.com.cn/shop/buy-iphone/iphone-duo/mk2q4ch/a) in the in-app browser. The product-summary screenshot was saved at 10:18:20 UTC. This was ordinary public navigation; no sign-in, location permission, bag, checkout, slot selection, reservation or payment action occurred. The example is not a user-approved purchase configuration.

After the page completed its dynamic rendering, the visible target was iPhone Duo 512GB night-sky, with RMB 17,999 displayed. The page said the product had not yet gone on sale and currently offered no Apple retail pickup service. Its Continue button was disabled. The catalog's preorder/release wording remained October 16 at 20:00 / October 23, subject to approval; the displayed sentence did not explicitly state a timezone.

Codex checked the actual disabled control and refreshed accessibility state after scrolling to the product summary. An early shell observation did not yet contain the eventual pickup-unavailable wording; the record above uses the completed page rather than treating that missing shell field as no stock. A screenshot of the visible product summary is retained privately in the reviewer evidence directory. It contains public product information only.

The [official mainland pickup help](https://www.apple.com.cn/shop/help/shipping_delivery) describes checking stores from a product page, choosing pickup during checkout, and pickup time options for some products. This is generic guidance. It does not establish Duo's actual slot stage, capacity, hold creation, rejection, refreshed list or order-confirmation contract.

## Consequence for development

- U01 has a current observed public product/variant entry and a prelaunch page gate. `mk2q4ch/a` is a catalog URL identifier; it is not independently validated as the checkout SKU field.
- The observed example entry currently cannot continue to checkout. This is not an inventory query, a per-store no-stock verdict, or proof about any other authorized variant or future launch state.
- U02–U06 remain unverified for Duo. Generic help does not close them. Hidden/guessed endpoints, another phone's checkout, simulated slots and forced enablement cannot supply missing evidence.
- A future read-only adapter must distinguish a recognized prelaunch entry from failed query, unknown structure, no selectable slots and real purchase readiness. It must keep all mutation methods blocked under the current development authorization.
- User capacity/color/alternates/stores/dates/windows/arrival/price/payment-label configuration remains absent. Public navigation cannot choose those conditions for the user.

M2 now has a runnable limited public-entry preflight implemented by Codex during the actual Claude quota exhaustion; see `C-004.md` for code, actual GET/browser-import evidence, tests and pending independent review. This is not a full real browser/checkout adapter. The runnable offline milestone remains available. This public evidence may become stale and must be revalidated before any future real operation.
