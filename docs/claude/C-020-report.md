# C-020-CART-STAGE delivery report (Claude)

Implementer: Claude (claude-opus-5-5) in the original session, with no sub-agent. This is a delivery for independent review, not an acceptance. I do not approve my own work.

## Outcome

- The repair is one phase-chain rule in `web/checkout-connector/page-program.js`.
- The independent reviewer file `review/c020-cart-stage.test.ts` passes **22/22**.
- The new implementation file `test/checkout-c020-cart-stage.test.ts` passes **16/16**.
- The complete approved regression passes **553/553** (the prior 537 plus my 16), with 0 fail, cancelled, skipped or todo.
- The controller, ChromePort, the dispatcher, permissions and settings are unchanged, and so are all 72 protected test/review files.

## Design decision and reasons

**Defect.** The phase chain decided the step from labels in a fixed order: REVIEW, then DETAILS, SLOTS, PAYMENT, FULFILLMENT, and only then BAG. On `/shop/bag` the purchased-list anchor was used only for item, scope and checkout proof, not for stage authority. As a result:

- an anchored cart that was ambiguous or had an invalid scope, plus a foreign label, decoded as that foreign stage with `verifiedStep=true` (F1, F3);
- a recognized cart plus a fulfillment radio lost BAG precedence (F2).

**Method.** I added one rule after the AUTH, CONSENT and PROCESSING gates and the existing order-state line, and before every label-based stage:

```js
else if(bagScoped)phase=bag&&bag.checkout?'BAG':'UNKNOWN';
```

On the bag path, an `OL[data-autom="bag-items"]` anchor now makes the cart the only stage evidence:

- The recognized cart (exactly one visible list with its proved single or header/bottom checkout) is BAG.
- Every other anchored cart is UNKNOWN.

**Why this method:**

1. **It fixes the evidence, not only the clicks.** Decode results drive both the controller and ChromePort. For example, ChromePort binds `acceptedSlot` on DETAILS/PAYMENT/REVIEW with `verifiedStep`. Guarding individual action branches with `!bagScoped` would have left decode falsely reporting FULFILLMENT/DETAILS/PAYMENT/REVIEW with `verifiedStep=true`, and it would not restore BAG precedence for F2.
2. **It is not a blanket stop.** A recognized cart stays BAG beside every synthetic decoy, and the existing observed-bag branch still clicks only its proved bottom control (acceptance item 2).
3. **The gates keep their priority.**
   - AUTH, CONSENT and PROCESSING are evaluated first.
   - The rule sits after the order-state line, so a `待付款`-style label on the bag path stays UNKNOWN exactly as before; it does not become BAG. This is tested.
4. **No evidence is invented and no scope is expanded.**
   - The rule uses only the previously observed anchor and checkout proof that already existed.
   - Pages without an anchor, and paths other than `/shop/bag`, keep the existing order byte for byte.
   - No controller, ChromePort or purchase condition changed.
5. **Defence in depth is kept.** The older guards are now redundant for decode but stay unchanged to keep the diff minimal:
   - the `bag?…` arm of the BAG line;
   - the C-019-R2 `!bagScoped` guards on ACCESSORIES and VARIANT;
   - the `viewBag` click-site guard.

**Alternatives rejected:**

- per-action guards only (reason 1);
- a blanket UNKNOWN for any anchored cart that shows a foreign control (breaks F2 and acceptance item 2);
- moving BAG above REVIEW for every page (changes no-anchor ordering without evidence);
- controller changes (outside scope and not needed: UNKNOWN already gates as `NEEDS_USER/unknown` with zero commands).

## Actual modified files

| File | Change |
| --- | --- |
| `web/checkout-connector/page-program.js` | +1 header comment line; +3 comment lines and the 1-line rule in the phase chain. Nothing else changed. |
| `test/checkout-c020-cart-stage.test.ts` | New, 16 tests, FAKE offline only. |
| `docs/claude/C-020-report.md` | New (this report). |

**No other file was written.** The pre-existing Codex worktree changes shown at session start were not touched:

- `docs/plan.md` and `docs/status.md` (modified);
- the untracked C-020 review and task files.

## Requirement and test mapping

| Requirement / scenario | Evidence |
| --- | --- |
| **R02, R06 / A04, A10.** Recognition: unknown structure is not a stage. | Reviewer F1/F3 cases. 9 implementation tests: 12 anchored shapes (unknown scope, or ambiguous checkout) × 9 synthetic foreign-stage decoys. All give UNKNOWN and `verifiedStep=false`; the matching direct command and direct `checkout` are untouched; the controller ends `NEEDS_USER/unknown` with `actions=[]`, `pending=null`, `resourceWritten=false`, `bagAddStarted=false`. Decoys: pickup unselected; pickup selected with store; slot Continue; details Continue; Alipay; Alipay selected with Continue; Place Order; View Bag; Add to Bag. |
| **R03 / A01.** The normal flow stays usable with no extra clicks. | Reviewer F2 cases. Recognized single-control and pair carts beside each of the 9 decoys stay BAG with `extras=false`. The decoy command is untouched, `checkout` clicks only the bottom control once and the decoys get 0 clicks. The controller sends exactly `['checkout']`. |
| **A06.** No unauthorized condition change. | Bag-path controls never yield a store, fulfillment or full `purchase.verified` (all asserted null/false). The plan is unchanged. |
| **R07 / A07.** No duplicate or unknown result. | After a delivered checkout, a next document that is an ambiguous cart plus pickup gives UNKNOWN: the run gates `unknown`, the pending checkout is kept and `selectPickup` is never sent. A recognized cart that remains after checkout gives `mutation-result-unconfirmed; no automatic repeat`. Memo: a delivered id stays `touched:true, OperationAlreadyDelivered` after the cart turns UNKNOWN, while a new id is untouched. |
| **R08 / A09, A10.** Gates and takeover. | AUTH (password, one-time code, guest text), CONSENT and PROCESSING win on both recognized and ambiguous carts with a pickup decoy; the direct commands are untouched and the controller sends zero commands. My new tests add no pause-specific case; pause, write-ahead and stop are covered only by the existing regression inside 553/553. |
| **Positives (acceptance item 3).** | An ordinary no-anchor `/shop/checkout` page still selects pickup and then proves the full plan store. An anchor-like OL on the checkout path is ignored, because the rule is limited to the bag path. No-anchor DETAILS, PAYMENT and REVIEW still decode with `purchase.verified=true`. The legacy no-anchor bag still makes its one generic checkout. The public-config, terminal, refusal, fresh-reselection and acceptance chains pass in the full regression. |

The test harness `click()` asserts that the control is not disabled, so none of these paths forces a disabled control.

## Commands actually executed

Only the four allowed commands were used, with no chaining:

| # | Command | Result |
| --- | --- | --- |
| 1 | `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-020-input-candidate-manifest.json` (before editing) | `ok:true`, 138 files, SHA `f8c406f9…ab7a1`, no mismatches |
| 2 | `node --test review/c020-cart-stage.test.ts` (after the fix) | 22 tests / 22 pass / 0 fail, 0 cancelled/skipped/todo |
| 3 | `node --test test/checkout-c020-cart-stage.test.ts` | 16 tests / 16 pass / 0 fail, 0 cancelled/skipped/todo |
| 4 | `node --test "test/*.test.ts" "review/*.test.ts"` | 553 tests / 553 pass / 0 fail, 0 cancelled/skipped/todo, duration_ms 6071.6867. I grepped only this run's own saved output. |
| 1 | Input verifier (after editing) | `ok:false`, 138 listed files, digest `e4d7aa5d…0bedd`. The only mismatch is `web/checkout-connector/page-program.js`. |

The post-edit verifier result is expected. That digest covers only the listed files and is not a candidate identity: it cannot see the two added files. Codex must build and hash the complete new inventory independently.

## Unrun checks and other limits

**Before-fix evidence.**
- I did not run the reviewer tests before my edit; Codex's recorded 17 failures are the before-fix evidence.
- My own 16 tests were written after the fix and never ran against the old source. I believe from reading the code that the decoy, reconciliation and recognized-cart cases would have failed there, but I did not execute that.

**Not run:**
- no browser, Chrome, extension or native execution;
- no Python delegation tests, bench or CLI scenarios, lint or typecheck (none of these is an allowed command);
- I did not compute a hash for the new `page-program.js`.

**Residual behaviour I did not change:**

| Behaviour | Why it stays, and its effect |
| --- | --- |
| A `/shop/bag` page with no anchor keeps the legacy order, so for example a `我要取货` radio still outranks a generic `结账`. | The observed real bag carries the anchor. Changing the legacy order would alter paths that have no evidence. Codex may decide whether that legacy route should also stop. |
| A purchased-list-like anchor on any path other than `/shop/bag` gives no cart scope. | Intended and tested; it also means a cart rendered on another path follows the generic order. |
| The PRELAUNCH override still runs after the chain and can turn an anchored-cart BAG or UNKNOWN into PRELAUNCH. | Unchanged. The controller gates `NOT_RELEASED` with zero commands, and no page action branch accepts PRELAUNCH. I did not test this on anchored carts. |

**Synthetic only.** Every decoy and malformed cart in these tests is synthetic, and none is an observed Apple contract.

## Offline versus live boundary

- **Offline:** every DOM, URL, API, storage value, command and click here is a local fake.
- **Real-derived shapes:** only the shape of the one-item OL/LI/H2 line and the header/bottom checkout pair comes from the earlier supported public observation.
- **Untouched:** no merchant API, refusal signal, slot capacity or readiness claim was invented. No browser, account, cart, slot, order or payment state was read or changed, and no network access occurred.
- **Still unverified:** the native install and API identity, the real checkout destination, fulfillment/refusal/order semantics, Duo adaptation and real timings.
- `REAL_PURCHASING_READY=false`.

## Permissions, caps and quota

- No permission denial occurred.
- No provider quota event occurred.
- No local turn, wall-time or USD cap was reached. Local spend was about $2.3 of the $5 CLI cap at report time; I did not measure wall time.

## Reading scope (actual Read calls in this task)

**Read in full:**
- `docs/tasks/C-020-CART-STAGE.md`;
- `docs/reviews/C-020-cart-stage-findings.md`, `C-020-before-verification.json` and `C-020-input-candidate-manifest.json`;
- `docs/requirements.md`;
- `docs/plan.md`: the whole file, including the current C020 section;
- `docs/reviews/C-019-R2-independent-review.md`;
- `review/c020-cart-stage.test.ts`;
- `web/checkout-connector/page-program.js`, `job.js` and `chrome-port.js`;
- `test/checkout-c019-navigation-scope.test.ts`, used as the harness template.

**Other access:**
- One Grep over this task's own saved full-suite output.
- I did not read `.local`, private history, unrelated tool results or unrelated directories.

## Exact repair checkpoint

1. **Source:** the C-020 input (138 files, `f8c406f9…ab7a1`). The only listed file that changed is `web/checkout-connector/page-program.js`: a phase-chain rule placed directly after the order-state line and before `exact('立即下单')`, plus one header comment.
2. **Added files:** `test/checkout-c020-cart-stage.test.ts` and `docs/claude/C-020-report.md`. The input manifest lists no `docs/` paths, so if Codex keeps the same inventory rule the new candidate should be 139 files with 73 test/review paths. Codex decides the real inventory.
3. **Receipts from this task:** 22/22 reviewer, 16/16 implementation, 553/553 full.
4. **Next step (Codex):** build and hash the complete candidate independently, rerun the regression, and run an exact-source consistency review. Native reload and Observe stay on hold until then. No new merchant authority follows from this delivery.
