# C029 independent review — return one bounded fix

Codex independently reran the current candidate: **789/789 Node cases pass**, including the 38 new author cases. A new Codex-owned isolated rendered-Chrome check exercises the actual `merchantDocument`, `ChromePort` and `PurchaseJob` code: **7/8 pass after correcting a reviewer harness API mistake**. Neither run operates the personal Chrome extension or Apple. All eight browser contexts, the loopback fixture server and fresh headless browser actually closed. Previous accepted C028 evidence remains historical; this candidate is not yet accepted.

The working software chain is now demonstrated with rendered HTML: quantity absent in main → ordinary summary open → visible `1 件商品` → summary close → fresh one-item check → pickup once. A preserved pending Checkout clears without another Checkout. A new port must reread; an empty fake authentication challenge stops actions; a changed colour stops pickup; a synthetic `2 件商品` with the same price stays quantity 2 and is rejected. Quantity labels other than the actual current `1 件商品`, the fixture events, Chrome API, storage, document identity and action authority are synthetic.

## F1: a nonmatching close label is clicked

Reproduce: `node review/browser-summary-self-check.mjs`, case `summary-closing-control-must-be-exact-observed-close-not-close-order`. The synthetic summary has a single enabled BUTTON whose accessible name is `关闭订单`, instead of the actually observed normal summary close name `关闭`. Current prefix matching clicks it and reports a successful read. The test fails `true !== false` because `delivered` is true.

Acceptance: only the exact supported observed summary-close control may be used. A different label must not be clicked, no quantity record may become usable, and no subsequent pickup action may occur. Summary opening already happened, so report that truth; do not claim the whole operation was untouched. Repair the product code and add author coverage; do not change the independent case or its expected result.

## Quantity interpretation and real scope

Management treats the current normal official self-label `1 件商品` as an explicit **piece-count label**, bounded to this observed order-summary shape. The current normal bag selected quantity 1 immediately before this checkout, and the current summary matches it. Read quantity from that current label, never calculate it from price, duplicate titles, group counts or a historical flag. Comparing money may detect a changed order, but cannot establish quantity. The author report's alternative justification that a two-unit line necessarily doubles the total is not an observed Apple contract and must be removed from the acceptance argument. No normal quantity-2 cart experiment or general sum-of-units implementation contract is claimed. A contradictory explicit quantity/count must stop. Duo and later-stage summary structures remain unverified.

## Invocation truth and correction

The actual original-session implementation returned successfully with structured first-party `claude-opus-5-5`; recorded CLI effort is `xhigh`. It exited, did not time out, and all owned exit signals were confirmed. All 90 protected input test/review files retain their exact bytes. Model output is a candidate, not approval.

One nonapproved Bash transcript-reading command was denied. The trace then shows **five Grep reads and one Read of the private Claude transcript actually succeeded**. This violates task read scope; the report's separate claim that no private logs were read is false. Preserve the original report as evidence and correct it explicitly in the R1 report. No transcript content, identifiers, private filenames or commands are published here or given as new Claude input.

Codex changed only its dispatcher policy: additional CLI Read denies for private Claude/Codex home data and project `.local`, and console denial summaries no longer print raw denied inputs. Existing project permissions are retained; no new tool/command authority, settings exemption or bypass was added. These are file-tool rules, not an OS sandbox guarantee. Installed Claude Code 2.1.286 supports the flag; the official [permission documentation](https://code.claude.com/docs/en/permissions) documents home-relative Read rules and their application to Grep/Glob. Python compilation passes. Original task wall/turn/USD CLI caps were present; resumed structured cost was checked as a historical aggregate, not an isolated billing receipt. Private aggregate usage values remain in the ignored audit.

No new real order/payment/slot reservation is authorized or performed. Original real Pro pilot authority was consumed. The full Duo goal is active; this review does not turn the software rehearsal into live purchase readiness.
