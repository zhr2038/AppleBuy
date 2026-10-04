# C-037 delivery report (Claude, claude-opus-5-5) — native Dalian store choice and operator text

Candidate for Codex independent reproduction and acceptance. Not self-approved, not published, no Git operation.

## Input identity
`python tools/delegation/verify_candidate_manifest.py docs/reviews/C-037-input-candidate-manifest.json` passed before any change: `ok:true`, 170 files, sha256 `75d58c9ab5ff2cc87e6684a2b489ca2631ca98344d67c4e3e7ba7f4586525eb6`, no mismatches. The output bytes differ (see changed files); no new manifest was produced.

## Design decision
Root's repro is correct: `selectStore` matched store radios only by `name(e)===store`. The observed native radio's accessible name is the whole numbered label (`1 Apple 大连恒隆广场 今天 可取货 店内取货`), so an unselected native Dalian radio could never be chosen. Only an already-checked one was proven.

Fix (`page-program.js`, `selectStore` branch only): a store radio's comparable label is
- for a native `INPUT[name="store-locator-result"]`: the existing C036 proof `nativeStoreName(e)`. That needs the exact numbered label shape and the public value `R609` together, and yields only `Apple 大连恒隆广场`;
- for other radios: the unchanged `name(e)`.

The click additionally requires, for a native choice:
- `type="radio"`;
- that no other store-locator input in `main` carries the same ID or names the store in its `aria-label` or any label. This check covers every visibility and state, so hidden, disabled or rival twins count.

Exactly one enabled visible candidate must remain. Otherwise the branch returns a positively untouched `CurrentChoiceUnrecognized`.

Why this design:
- It reuses the one store proof that decides whether the store is proven afterwards, so the choice and the proof cannot diverge.
- No new store mapping, substring match, ID-only trust or Duo layout is introduced.
- The existing stage gates are unchanged: FULFILLMENT, an item-verified unit, `0 < total ≤ cap`, current pickup choice, store in plan, and fresh expected-evidence comparison with the delivery memo.
- The click happens in the same synchronous pass as the fresh decode. A control or ID changed after the job's read is re-verified and refused.
- `job.js` already sends `selectStore` at FULFILLMENT when pickup is chosen and the store is unproven, and reconciles it at SLOTS. No job or port semantics changed.

Text: the three findings from my C036 review are fixed.
- `control.html` now says a verified exact matching one-item, no-extras bag is not added to; the program automatically opens the bag page, re-checks and checks out. Other, multiple or unknown items, read failures and unconfirmed reads add, remove and check out nothing.
- `README.md`:
  - The stale "待Codex复审" label and the manual "恢复本任务" sentence are replaced with the same description.
  - A C037 store paragraph is added.
  - The status line reflects the DISAGREE and this candidate.
- `control.js`:
  - The unreachable `current-bag-already-holds-this-plan-item` help entry is removed.
  - The retired-cart preflight text gains the automatic matching-item sentence. The substrings asserted by protected C034/C035 tests are kept.

## Changed files
- `web/checkout-connector/page-program.js`: the `selectStore` branch plus one header comment line.
- `web/checkout-connector/control.js`: one help entry removed, one preflight sentence extended, one comment line.
- `web/checkout-connector/control.html`: one sentence in the task-management paragraph.
- `README.md`: status line 1; the matching-cart sentences and a C037 paragraph in the executor section.
- New `test/checkout-c037-store.test.ts` (23 tests).
- New `docs/claude/C-037-report.md` (this file).

No protected old test, reviewer tool, fixture, evidence, manifest, requirement, job or port file was edited.

## Repro and acceptance mapping
| Acceptance item | Evidence |
|---|---|
| Unselected native Dalian radio is selected under a verified one-unit plan and cap; no dependence on the merchant default | Root `browser-c037-store-repro.mjs` changed from red (`false !== true`) to PASS. C037 tests 1–3: Pro positive, Duo FAKE-mirror positive, and a FAKE other default store replaced by Dalian. |
| Both ID and exact name/shape; no substring or ID-only trust | Wrong ID, R609 with another or unrelated name, longer containing name, bare name, unobserved availability wording: all untouched, no click, store unproven. |
| Conflicting, disabled, duplicate, wrong or unrecognized controls stay safe | Disabled target, non-radio `role=radio`, visible duplicate, hidden twin, disabled twin, rival Dalian label under another ID, legacy exact-name radio beside native: all untouched. Over cap, no unit, delivery chosen, store outside plan: `ActionNotRecognizedForCurrentStage`. |
| Current control after re-verification | Changed evidence gives `OperationEvidenceChanged`. An ID swapped after the read (identical read-model) gives `CurrentChoiceUnrecognized`. A repeated command id gives `OperationAlreadyDelivered`, touched, still 1 click. |
| Delivered once, fresh store proof, zero slot Continue or order action | Root repro asserts `fakeContinues===0`. C037 test 1 shows store proven, phase SLOTS, Continue 0 clicks, time select untouched. The actual ChromePort+PurchaseJob test shows acts `['selectStore']`, reconciled at SLOTS, `pending:null`, no slot action. |
| Text fixes | C037 text test: old control.html claim absent; new statement in control.html and README; stale README label and manual sentence absent; every `cartHelp` reason key is emitted by `job.js`. |
| Existing paths unchanged | Full suite and native checks below. Missing shipping is still accepted only under the current pickup choice (unchanged code; C036 native check passes). |

The native negative cases are regression guards: the old code also refused them, through the name mismatch. One case is a real behaviour change: a legacy exact-name radio beside a native one used to be clicked and is now refused as ambiguous.

## R01–R10 mapping
- **R01:** one unit, cap, planned store only; no broader store mapping.
- **R02:** unrecognized store shapes stop with reasons.
- **R03:** the normal store choice is automated instead of stopping.
- **R04:** a local radio check is not a hold; slots are untouched.
- **R06:** untouched versus touched replies are kept truthful.
- **R07:** memo prevents a repeated click; job reconciliation unchanged.
- **R08:** gates and human stop after repeated untouched failures (existing behaviour) are unchanged.
- **R09:** no real action.
- **R10:** the Chinese operator text now matches behaviour.
- **R05:** unaffected (no refusal contract involved).

## Commands actually run (exact, unchained)
1. `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-037-input-candidate-manifest.json`: ok, 170 files, `75d58c9a…`, no mismatches. Run before any change.
2. `node review/browser-c037-store-repro.mjs`: PASS 1/1. Cleanup: 1 context, browser and server closed, no errors.
3. `node --test test/checkout-c037-store.test.ts`: tests 23, pass 23, fail 0. Run again after the final README status-line edit, with the same 23/23.
4. `node --test --test-reporter=dot "test/*.test.ts" "review/*.test.ts"`: 936 dots counted (46×20+16), no failure marker or error output. The dot reporter prints no totals. 936 equals the prior 913 plus my 23, but that is my count, not a reported total. This ran before the README status-line edit; no other test reads README.
5. `node review/browser-c036-pickup-self-check.mjs`: 7/7 PASS. Cleanup: 7 contexts, browser and server closed, no errors.
6. `node review/browser-c035-boundary-self-check.mjs`: 5/5 PASS. Cleanup: 4 contexts, no errors.
7. `node review/browser-summary-self-check.mjs`: 8/8 PASS. Cleanup: 8 contexts, no errors.
8. `node review/browser-retirement-self-check.mjs`: 4/4 PASS. Cleanup: 4 contexts, no errors.

The native scripts wrote their own result files under `.local/reviewer/`. No other Bash command was run, and there were no permission denials.

## Not run or not covered
- `node review/browser-c035-empty-repro.mjs` (9 scenarios) was not in this task's command list and was not run. My README line says 25 native scenarios from 5 scripts accordingly.
- No native negative cases of my own. The negatives use a FAKE DOM in Node, because allowed writes did not include a new reviewer tool and I avoided loading the home-cache Playwright runtime from a test file. The only native evidence for the new branch is Root's single positive repro.
- No native test of the job-level flow; that is FAKE Chrome API only.

## Read scope (no whole-repository claim)
- **Read fully in this task:**
  - the task sheet, `docs/requirements.md`, `C-036-actual-cross-review.md`, `C-036-cross-review-verification.json`, `C-037-store-reproduced.json`;
  - `page-program.js` (all 490 lines, in two pages), `control.js`, `control.html`;
  - Root `browser-c037-store-repro.mjs`, `browser-c036-pickup-self-check.mjs`;
  - `test/checkout-r1-public-configuration.test.ts` in full (297 lines; this replaces my earlier 80-line partial read);
  - `test/checkout-c024-evidence.test.ts`, used as the harness pattern.
- **Read earlier in this same session (C036 review), not re-read for C037:** `C-036-codex-quota-report.md`, `C-036-codex-verification.json`, `C-036-normal-pickup-evidence.json`, Root race `review/c035-current-cart-race.test.ts`, `test/checkout-c034-successor.test.ts`, `README.md` (all).
- **Not freshly re-read in this task:**
  - `job.js` beyond lines 295–314 plus targeted searches;
  - `chrome-port.js`;
  - `C-037-input-candidate-manifest.json`, which was verified only by the script;
  - `review/c034-successor-cart.test.ts`.

## Old helper (substantive, full read)
Lines 55–61 of `test/checkout-r1-public-configuration.test.ts` add:
- FAKE `tabs.create`, `tabs.remove` and `get(8)`;
- a synthetic EMPTY_BAG side read, labelled as Codex C035-R1 quota completion.

The test bodies I read contain no weakened or deleted assertion that I could identify. I cannot byte-compare them with the originals; Root verifies that independently.

One observation: the side read is logged as `{observe:true,syntheticSideBag:true}`. A log-based "act follows a fresh observation" check could therefore be satisfied by a side read. The only such check (`R1 synthetic observed dependency`) runs in public-config mode, where no side read happens, so no current assertion is affected.

## Live versus simulation boundary and known limitations
- **Real evidence:** the C-036 normal observation of an already-checked R609 radio with the numbered label.
- **Not observed:**
  - selecting an unselected native store on Apple, and its merchant effect (any availability refresh request or re-render);
  - the post-selection transition to the slot controls.

  If the real page stays FULFILLMENT after the click, the job's pending reconciliation waits and then stops for verification without repeating.
- **Label anchoring:** the label is anchored to the observed availability text `今天 可取货 店内取货`. Other wording, such as at launch, fails closed: untouched replies, then the existing human stop. Widening it requires new observed evidence.
- **No other store or Duo:** no other store ID/name mapping and no Duo checkout layout exists. The Duo test is a FAKE mirror of the Pro shape.
- **FAKE inputs:** every DOM, Chrome API, document ID, permission, storage, clock and authority in the tests is FAKE. The `数量：1` line is synthetic and stands in for the current order-summary piece count.
- **What a radio check is not:** a local radio check is not a reservation or hold. Real refusal, latest list, hold, Duo, installation and speed remain unverified.
- **No real action:** no real purchase, payment, order, slot, bag change, network, personal browser or extension, agent, publication or shutdown.

## Caps and checkpoint
- **Usage:** about USD 2.7 of 10 at the time of writing; about 30 turns of 48. Wall time was not measured precisely; I believe it was within 1500 s, but I can't confirm that.
- **Resume point:** the source above is final for this delivery. Codex next:
  - freezes a new manifest;
  - independently re-runs commands 2–8, plus `browser-c035-empty-repro.mjs` if wanted;
  - verifies the old test bodies;
  - performs the read-only consistency review of exactly these bytes.
