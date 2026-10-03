**`verdict`: `AGREE`**

I agree with the C-020 anchored-cart repair, for exactly the 139-file candidate below and only as a bounded offline repair. I am its author, so this is a consistency check, not an independent final approval; Codex accepts or rejects. Real purchasing is still not ready: `REAL_PURCHASING_READY=false`.

## Exact identity
- **Candidate:** 139 files, SHA256 `6e2acb69c981c4676c267ff311ae564012e3c4f28c2a0d09250a7d14a2ffe331`.
- **Verifier, run in this task:** `{"ok": true, "files": 139, "sha256": "6e2acb69…e331", "mismatches": []}`.
- **Protected files:**
  - Compared with the 138-file input manifest, the only differences are `web/checkout-connector/page-program.js` (`537076f0…` → `8353aa04…`) and the added `test/checkout-c020-cart-stage.test.ts` (`4eb7e48b…`).
  - Every one of the 72 protected test/review hashes is the same, including `review/c020-cart-stage.test.ts` (`e6f8a710…`). `job.js` (`5a49b65f…`) and `chrome-port.js` (`247010e9…`) are also unchanged.
  - I did not re-read the 138-file input manifest in this task. This comparison relies on my full read of it earlier in this session, during C-020-CART-STAGE.

## Commands run (only the two allowed)
| Command | Result |
|---|---|
| `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-020-candidate-manifest.json` | ok, 139 files, exact SHA above, no mismatches |
| `node --test "test/*.test.ts" "review/*.test.ts"` | 553 tests, 553 pass, 0 fail, 0 cancelled, skipped or todo; `duration_ms` 6027.3918 |

The full suite's output was saved to a file whose path the Bash response supplied. I searched only that file: once for the summary lines (no `✖` failure lines), and once to count C020 test lines (38, matching 22 reviewer plus 16 implementation tests).

## Fresh reading (this task, all read in full)
- the task sheet;
- `docs/requirements.md`;
- `docs/reviews/C-020-cart-stage-findings.md`;
- `docs/reviews/C-020-before-verification.json`;
- `docs/claude/C-020-report.md`;
- `docs/reviews/C-020-independent-review.md`;
- `docs/reviews/C-020-actual-verification.json`;
- `docs/reviews/C-020-candidate-manifest.json`;
- `review/c020-cart-stage.test.ts`;
- `test/checkout-c020-cart-stage.test.ts`;
- `web/checkout-connector/page-program.js`, `job.js` and `chrome-port.js`.

## Consistency findings

**1. The rule and where it sits** (`page-program.js:117`):
- `else if(bagScoped)phase=bag&&bag.checkout?'BAG':'UNKNOWN';`
- It comes after AUTH (line 110), CONSENT (111), PROCESSING (112) and the order-state line (113), and before REVIEW, DETAILS, SLOTS, PAYMENT, FULFILLMENT and the navigation stages.
- `bagScoped` can only be true on `/shop/bag` (line 57).
- The header comment (line 15) and the inline comment (lines 114–116) describe this accurately.

**2. It only narrows what an anchored cart can do. I checked this by reading the code, not by counting passing tests.**
- Before the fix, an anchored cart could decode as AUTH, CONSENT, PROCESSING, order-state UNKNOWN, REVIEW, DETAILS, PAYMENT, FULFILLMENT, BAG or UNKNOWN.
  - SLOTS was already impossible there because `purchase.fulfillment` is null on anchored carts.
  - ACCESSORIES and VARIANT were already blocked by the C-019-R2 `!bagScoped` guards, and ENTRY needs a product path.
- Now only the four gates, BAG or UNKNOWN remain.
- BAG still needs exactly the condition it needed before (`bag&&bag.checkout`).
- So on an anchored cart the only page action that can still run is the existing observed-bag `checkout` branch (lines 272–273). That branch still requires `itemVerified`, `extras===false` and the price cap, and it never forces a disabled or hidden control.
- Pages without an anchor, and paths other than `/shop/bag`, skip the new line and follow the unchanged order.

**3. Effect on the controller and ChromePort (both unchanged):**
- UNKNOWN is in the controller's stop set (`job.js:12`), so the run stops as `NEEDS_USER/unknown` before any write-ahead (`job.js:150`): no command, `pending=null`, `resourceWritten=false`.
- ChromePort can only record an accepted slot on DETAILS, PAYMENT or REVIEW with full purchase proof (`chrome-port.js:15`). Neither can occur on an anchored cart any more.

**4. Recovery after a sent command:**
- A delivered `checkout` only counts as progress if the next page is FULFILLMENT or SLOTS. An anchored cart now decodes BAG or UNKNOWN, so a delivered checkout can no longer be falsely confirmed by a cart showing a pickup decoy.
- If the next page is UNKNOWN, the run stops as unknown and keeps the pending checkout.
- If the recognized cart is still showing, the run ends as `mutation-result-unconfirmed; no automatic repeat`, and nothing is sent again.
- The duplicate-delivery memo is checked before the stage check (line 255), so an already delivered command ID still reports as touched.
- After `addBag` or `viewBag`, a recognized anchored cart still counts as progress; an anchored cart that is not recognized now stops as unknown.

**5. Tests:**
- **Reviewer file (22 cases):**
  - each of the three checkout-ambiguity variants is checked separately through page decoding, a direct command and the controller;
  - the recognized-cart positives;
  - invalid list scope;
  - details, payment and review labels;
  - the three gates;
  - the no-anchor pickup positive.
- **Implementation file (16 cases):**
  - 12 anchored shapes × 9 decoys, covering decoding, the decoy command, a direct checkout and the controller;
  - recognized single and paired checkout buttons beside every decoy;
  - five gate variants on recognized and ambiguous carts;
  - an order-state label on the bag path;
  - recovery after a sent checkout;
  - duplicate-delivery memo truth;
  - checkout-path and no-anchor positives.
- The assertions match the controller's actual reasons and states.
- The rest of the suite (pause, write-ahead, the terminal/refusal/reselection chain and the public-configuration endpoint) passes within 553/553. The new tests are not claimed to cover those.

**6. Defence-in-depth code is now partly unreachable:**
- the `bag?` arm on line 123 and the `!bagScoped` guards on lines 125–126 and 269 can no longer be reached;
- the `!bagScoped` guard on the legacy checkout branch (line 270) is still needed, because BAG can now occur on an anchored cart.

The delivery report describes this accurately.

**Non-blocking notes (not defects):**
- **N1 (report wording):** the A06 row of `docs/claude/C-020-report.md` says "Bag-path controls never yield a store, fulfillment or full `purchase.verified`." That is guaranteed only for *anchored* bag pages (line 108). A `/shop/bag` page without an anchor still decodes the generic way, as the report's own residual table discloses. It should read "anchored bag-path".
- **N2:** the implementation tests were written after the fix and never ran against the old source. The 17 recorded reviewer failures are the only before-fix evidence. This is already disclosed.

## Source-scope limits
- **Still in place, disclosed and untested on anchored carts:**
  - The PRELAUNCH override (line 156) can still replace BAG or UNKNOWN on an anchored cart. The controller then stops as not released with no command, and no page action accepts PRELAUNCH.
  - On a `/shop/bag` page without an anchor, a pickup radio still outranks `结账`. On a checkout path, list-like controls on other paths are ignored.
  - Both need real merchant evidence before live use.
- **What this review is not:** not a whole-repository, native, installed-extension or live audit.
- **Diff checking:** I could not run a diff tool (not an allowed command). My view of the `page-program.js` change comes from reading the whole current file against my earlier full read of the input; Codex's byte-level diff is the authority.
- **Synthetic tests:** every decoy, malformed cart, page and click in the tests is synthetic. Only the one-item list and the header/bottom checkout shape come from the earlier public observation.
- **Unverified:**
  - the real checkout destination;
  - fulfillment, refusal and order behaviour;
  - Duo adaptation;
  - merchant timings.

## Permissions, caps and quota
- There were no permission denials and no provider-quota event.
- No local cap was reached: about 7 turns of 28 and roughly $0.8 of the $5 cap by the local counter. I did not measure wall time.
- I did not attempt Write or Edit.
- I did not read `.local`, private history, credentials or unrelated tool results, and I did not access the network, a browser or the extension.

Agreement covers only this bounded offline repair. No new cart, slot, order or payment authority follows. Native reload and Observe stay on hold until Codex accepts and publishes.
