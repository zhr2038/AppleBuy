# C-037-CROSS-REVIEW: delivery report (Claude, claude-opus-5-5)

## Verdict

**AGREE**, for the exact 171-file manifest `docs/reviews/C-037-candidate-manifest.json`, sha256 `1e0b45f78bb3ef77395c327c752b5d6f21c23fb67d50956d1900368e2b636eb8`, within the bounded scope only:
- **C035:** empty bag and current-cart read, one automatic Add, and continuing when the bag already holds the matching item.
- **C036:** the numbered native store radio, the LEGEND caption, the current one-piece count, and the pickup summary without a shipping row.
- **C037:** choosing the normal Dalian store when it isn't preselected, and the corrected operator text about the matching item.

What this verdict is and isn't:
- **Codex's deltas:** this is a cross-author review.
- **My own C036/C037 code:** this is only a same-author consistency check, not independent approval.
- **Identity:** I can't hash files without Bash. The verdict covers the bytes I read, and holds only if Codex's own hash check confirms they are this manifest. It does not rely on any future text promise.
- **Not claimed:** the whole goal, live readiness, or approval of my own code.

## What I read in this call

- **Before the context was compacted, read in full:** every file listed in the task sheet. The one exception is `page-program.js`, which is over the Read size limit, so I read it in two pages (lines 1–407, then 408–498). That is the only departure from "no offset/limit".
- **After compaction, re-read in full:** the task sheet, `control.html`, `docs/claude/C-037-report.md` and `review/browser-c037-store-repro.mjs`.
- **After compaction, re-read in part (the code the verdict depends on):**
  - `page-program.js` lines 408–498, including the full C037 `selectStore` branch;
  - `job.js` lines 270–314 (the Add boundary and the FULFILLMENT command);
  - `control.js` lines 25–39;
  - `README.md` lines 1–20.
- **Everything else** rests on my full reads earlier in this same call, recorded before compaction. I did not read the private transcript.

## Findings

**C037 store choice: no blockers.**
- **ID and full label both required:**
  - Native radios are matched only through `nativeStoreName`, which needs the exact numbered label and `value==='R609'`. This is the same proof that later decides whether the store is proven.
  - No ID-only, substring or bare-name match exists.
- **Twins and rivals refused before any click:**
  - The target must be a visible, enabled radio with `type="radio"`.
  - `sole()` checks every store-locator input in `main`, whatever its visibility or state. Any other input with the same ID, or whose label or aria-label contains the store name, means no click and an untouched `CurrentChoiceUnrecognized`.
- **Stage gates unchanged:** FULFILLMENT phase, a verified single item, total above 0 and within the cap, pickup shown, the store in the plan, and the expected-evidence comparison plus memo.
- **Current receiver:** the radio is clicked in the same synchronous decode and must still be connected.
- **No slot action follows.** The job sends `selectStore` (`job.js:308`) and the result is reconciled at SLOTS.
- **Root's four native cases map exactly to code paths:**

  | Root case | Code path that handles it |
  |---|---|
  | Positive | Selected, store proven, `fakeContinues===0` |
  | `wrong-id` (R557) | `nativeStoreName` returns null, so there is no candidate |
  | `disabled` | Excluded by `!disabled` |
  | `hidden-twin` | Same value, so `sole()` fails |

**C035 guards: confirmed in code.**
- **One Add only:** `bagAddStarted` is written ahead, and an empty bag after a started Add gives NEEDS_VERIFICATION, never a second Add.
- **Fresh read every time:** each Add needs a new side read. It must have the right schema, `verifiedStep`, `seq>lastRead` and a different `documentId`. Restart, delays, PRELAUNCH and an untouched retry all read again.
- **Pause or stop during the read** adds nothing.
- **What a matching bag does:** a matching single item with no extras leads to `openBag`. Anything else leads to BLOCKED.
- **Port behaviour:**
  - An unknown read, a stale read, or a side tab that fails to close is never treated as empty.
  - Read-only, rebind, validation and observe modes cannot navigate or add.
  - An empty bag never clears pending actions, final grants or slot intents.

**C036 guards: confirmed.**
- The caption must be a LEGEND in a fieldset with date radios and exactly one time select.
- A missing shipping row is accepted only when pickup is chosen.
- The piece count comes explicitly from `N 件商品`.
- Summaries expire after 15 s and are tied to the current context.

**The three corrected C036 texts: confirmed.**
- `control.html:16` now states the actual behaviour.
- `README.md:15` matches it.
- `control.js:28` has the automatic matching-item sentence.
- The unreachable help entry is gone, and every `cartHelp` reason key is emitted by `job.js`.

**Old FAKE helper in the public-configuration test:**
- Lines 55–61 of `test/checkout-r1-public-configuration.test.ts` add a FAKE side tab and a synthetic empty-bag read.
- I found no weakened or deleted assertion. The byte comparison with the originals is Root's evidence, not mine.

**Non-blocking issues, recommended for later:**
- **N1:**
  - `selectStore` lacks the `!storeConflict` guard that `selectPickup` has (`page-program.js:442` vs `446`), and it doesn't check whether the target is already checked.
  - **Reproduction (reasoned, not run):** take a FAKE page where Dalian is already checked alongside a second checked store, or where the pickup-location field contradicts it. It can click the planned radio, which counts as touched and may do nothing. After the 8 s deadline the job stops with NEEDS_VERIFICATION.
  - **Expected:** a clean untouched refusal instead.
  - This page shape hasn't been observed. It is still safe: only the plan's store is clicked, nothing is repeated, and no slot or order action happens.
- **F2:** the page can bounce between `openBag` and `openProduct`, bounded only by the 300-step limit. No Add can happen.
- **F3:**
  - A missing permission reports `ProductEntryPermissionMissing`, even for `openBag`.
  - The `quotedCny` check in the port is lax.
  - The page's `openBag` branch doesn't check `!nextChoice`.
- **F4:** there is no native test of the `openBag` branch, and no native test where the side read decodes a non-empty bag.
- **F5:** the C034 tests only exercise the FAKE path without `readBag`.
- **Stale README status (outside the matching-item scope):**
  - Line 5 still says the candidate awaits the original Claude review.
  - Line 7 still says "C034修复待Codex完整复测…main最后验收仍为C028", which contradicts the recorded C034 acceptance.
  - Please correct both. I couldn't check when they went stale.

## R01–R10

| Requirement | How this candidate affects it |
|---|---|
| R01 | One unit, the price cap, and the planned store only |
| R02 | Unrecognised store shapes stop with a reason |
| R03 | The normal store choice is now automated instead of stopping |
| R04 | A radio click is not a hold; slots are untouched |
| R05 | Not affected |
| R06 | Touched and untouched replies stay truthful |
| R07 | The memo and reconciliation prevent repeats |
| R08 | Gates and the human stop are unchanged |
| R09 | No real action |
| R10 | The Chinese text now matches behaviour, apart from the stale README lines 5 and 7 |

## Limits and disclosures

- **Tools and actions:** no commands, no Bash, no Git, and no source or report writes in this call. No permission denials, no network, no agents, no private files.
- **Test counts:** 936/936 Node tests and the 37 native cases are Codex/Root evidence. I didn't run any tests here, and I didn't run a reproduction for N1.
- **Caps:** about USD 3.2 of 10 used. I can't confirm the exact turn count or wall time across the compaction.
- **Historical C036 deviations:** the two extra shell chains and the one denied `git diff` stay as recorded history. I did not retry or work around them.
- **Simulation vs live:**
  - Every DOM, Chrome API, document ID, permission, storage, navigation and merchant response in the tests is FAKE or a sanitised copy.
  - Not observed on Apple: what happens when an unselected native store is clicked (re-render, availability request, move to slots), any other store mapping, the Duo checkout layout, or other availability wording. The label match fails closed if the wording changes.
  - Not established: extension installation, the full one-start flow, order creation, refusal handling, holds, Duo and speed.
- **Order authority:** the original one-Pro order authority is used up, and this review involved no merchant action.

## Changed files

None.
