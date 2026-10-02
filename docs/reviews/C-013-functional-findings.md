# C-013 independent functional reproductions

Codex independently exercised the actual historical C013 source after the successful original-session Opus 5.5/xhigh review. The protected new criteria are `review/c013-functional-findings.test.ts`; the corrected harness ran **8 tests: 2 passed, 6 failed**, 84.7536 ms. An initial missing test-harness URL binding was corrected before this result and is not a product finding. All browser APIs, customer fields and merchant documents in these reproductions are explicitly FAKE. No real or mock merchant order is submitted by the UI grant-capture tests.

The 119-file `6eba42936f8bf86e0a0f7d63e531e7799a5e8b002ea604a06566576065afb950` agreement remains a bounded historical source agreement. Adding the independent criteria creates a new 120-file repair input, whose manifest is `C-013-R1-input-candidate-manifest.json`. It has not received agreement. The unchanged prior 351-test suite passed independently after the actual Claude review; it does not cover these newly reproduced failures.

| Actual report finding | Concrete reproduction | Required result |
| --- | --- | --- |
| P3-1, two failing cases | Final confirmation first fails because advance approval is unchecked, or another control owns the lock. The user then resumes with approval/ownership. | Resume must receive no old final grant. A new explicit approved, owned confirmation may pass one grant, which cannot carry beyond the gate. Clear ephemeral grants on failures and exceptions without erasing sent-action truth. |
| P3-2 | Retirement is invoked with Web Locks unavailable. | Return a visible Chinese mutual-exclusion gate, no unhandled rejection, no retirement or deletion. |
| P3-3 | The same document already memoized a delivered command; the document is now the observed `/shop/signIn/orders` AUTH route. | Duplicate delivery evidence cannot become positively untouched. No authentication DOM/value read or new action. |
| P3-5 | Four harmless positively untouched evidence changes are separated by four verified successful public-configuration stages. | Reach VALIDATED after eight bounded attempts, without a purchase-task record or resource action. Four consecutive untouched failures must still stop. Only trustworthy progress can reset a consecutive bound; preserve an absolute run bound and unknown/touched no-repeat behavior. |
| P3-6 | FULFILLMENT has an exact verified allowed store and pickup selection while its slot controls are loading; three bounded waits produce a complete slot list. | Zero redundant selectStore actions, one compliant chooseSlot action. A missing/unverified/wrong store cannot qualify as already selected. Waiting must terminate safely if loading never ends or evidence changes. |

The two passing controls establish that a new explicit final confirmation still works exactly once and that four consecutive untouched failures still stop. Codex will independently rerun these fixed criteria and the complete suite after delivery; neither reviewer can weaken them.

The actual report's P2 date-placeholder, upsell/repeated-title and asynchronous slot-validation limitations, and P3-4 bare sign-in path, were characterized separately in fictional DOMs. These observations do **not** establish the current Apple contract. Their outputs were respectively incomplete SLOTS, BAG extras=true, touched selection stopped before Continue while a fake delayed button later enabled, and UNKNOWN/no-main. Do not loosen parsers, force controls or invent live signals on this basis.

No extension installation, host grant, authentication, existing account order query, bag addition, slot reservation, order creation or payment occurred in these reproductions. The historical Pro one-order authorization remains consumed. REAL_PURCHASING_READY remains false.
