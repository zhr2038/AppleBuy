# C-034 Successor Cart — Claude delivery report

Status: **candidate only, not accepted.** Claude cannot self-approve. Codex owns independent acceptance.

Model/session: first-party `claude-opus-5-5`, original recorded session (continued after a context summary). Date: 2026-10-04.

## 1. Scope actually read

- Read in full as required: the task sheet; `docs/requirements.md`; `docs/reviews/C-031-actual-cross-review.md`; `C-031-cross-review-verification.json`; `C-034-reproduced.json`; `C-034-input-candidate-manifest.json`; `docs/reviews/C-030-codex-takeover-report.md`; `web/checkout-connector/job.js`, `control.js`, `control.html`; `README.md`; `test/checkout-c030-retirement.test.ts`; `review/c034-successor-cart.test.ts`; `review/browser-retirement-self-check.mjs`.
- Extra targeted lookups (disclosed, read-only):
  - `Grep` of `web/checkout-connector/page-program.js` for empty-bag/BAG phase recognition. This confirmed there is no empty-bag contract: a bag without a checkout button is not `BAG`.
  - `Grep` in tests for `onState` fields, status strings and `control.html` ids.
  - `Grep` of the requirement rows in `requirements.md` for this report.
- No whole-repository review is claimed.
- No permission denials occurred. No private home, `.local`, log, config, screenshot or input-value file was read. No network was used, and no agents were invoked.

## 2. Defect (C031 actual cross-review DISAGREE, C034 repro)

`retireReadOnlyBag` correctly retires a resolved, permanently read-only BAG rehearsal into `retiredHistory`. The trouble is in the `fresh()` successor it creates:

- The successor starts with `bagAddStarted:false`.
- On ENTRY, VARIANT or configurable PRELAUNCH, the reset markers plus a new authority led to `addBag`.
- That added a second Pro, or a Duo beside the Pro, while the retired item was still in the real bag.

Recorded repro: 7 cases, 6 failing, 1 positive passing.

## 3. Design and reasons

The core idea is a durable, sticky **retired-cart fact** that is kept separate from the successor's own action markers.

1. **`retiredCartFact(history)`** (`job.js:55-63`, exported)
   - It walks the retired chain newest-first.
   - It returns either a copy of a carried `retiredCart`, or a fact built from the newest `readOnlyRetirement.kind==='resolved-pre-slot-bag'` row: `kind`, `fromTaskId`, `product{model,capacity,color}`, `quantity:1`, `totalCny`, `readSequence`, `retiredAt`.
   - It uses only facts already recorded by that verified read. There is no new merchant query and no invented contract.
2. **Derivation and persistence in `run()`** (`job.js:148-149`)
   - This runs after the existing plan/tab binding check.
   - If the task has no `retiredCart`, it derives one from `retiredHistory`, and the next save persists it.
   - This covers: the first successor run, every restart, C030-era successors saved without the field (derived on restart), and later generations after an untouched `retire()` (the retired row carries `retiredCart` into the chain).
   - The successor's own `bagAddStarted`, `resourceWritten` and `reconcileOnly` remain its own and stay false. Marking them true was rejected: it would misstate what the successor did, block untouched retirement and conflate history.
3. **Add-to-Bag gate** (`job.js:242-244`)
   - On the ENTRY/VARIANT/(converted) PRELAUNCH path, the gate sits after the public `configureProduct`/`continueProduct` steps and the validation gate, immediately before `command={action:'addBag'}`.
   - When a cart fact exists, it calls `gate(s,'retired-cart-holds-earlier-item; no second addition; open the bag page for a fresh read','NEEDS_USER')`.
   - The existing `gate()` revokes the start grant, so new authority alone never adds.
   - Public preparation still runs, and pre-release `NOT_RELEASED` handling is unchanged.
4. **BAG branch** (`job.js:248`)
   - The condition is unchanged: `itemMatches(P,o.purchase)`, meaning exactly one verified line of this plan, quantity 1, total within the cap, and `extras!==true`. When it holds, the command is exactly `checkout`.
   - Checking out the item already in the bag is not a second addition. This keeps the protected positive case, and a valid matching-cart successor is not turned into a permanent stop.
   - On a mismatch, a task with a cart fact gets the truthful reason `retired-cart-bag-not-exactly-this-plan; nothing removed, bought or added` (BLOCKED). Other tasks keep `bag-conditions-not-verified`.
   - The one-unit and no-extras checks are not weakened.
5. **Validation** (`job.js:26`)
   - `validStored` accepts a missing field or a plain object.
   - `null`, an array or a string makes the record `StoredPurchaseTaskCorrupt`, so the fact is never silently dropped.
   - `save()` exposes only a boolean `retiredCart` to `onState`.
6. **The fact is never cleared.**
   - No observed empty-bag contract exists. The page program reads an emptied bag as `UNKNOWN`.
   - The task forbids treating a human checkbox, a plan change or a reset marker as proof of an empty cart.
   - A changed desired model never authorizes removing or buying the old item.
7. **UI, in Chinese, with no visual redesign, new ids or new imports**
   - `control.js:33-37` `cartHelp(s)`, joined into `onState` help (`control.js:37`):
     - Gate reason: explains that the old item is still in the bag, that the program will not treat the bag as empty or add again, and that the next normal observation is to open the official bag page and press 「恢复本任务」. It continues only on a fresh read of exactly this plan's one item with no extras.
     - BAG mismatch reason: explains that nothing is removed, checked out or added, that changing the model does not authorize handling the old item, and that the program cannot confirm an empty bag, so the person must arrange it.
     - Otherwise, whenever a fact exists, it shows a standing notice.
   - `control.js:123` retire status: states that the one item stays in the official bag and is not treated as cleared. It keeps the protected substrings 「已结束核对完成」 and 「全部记录保留」.
   - `control.js:28` preflight: appends the cart note when the previous task or its retired chain holds a cart fact.
   - `control.html:16`: one added sentence in the existing retirement paragraph.
8. **README**
   - Stale guidance fixed: ending a checked read-only bag task does not empty the bag, and later tasks never add again (lines 13 and 25).
   - Line 5 now reflects the C031 actual DISAGREE and that the C034 repair is pending. main's last acceptance remains C028.
   - Public identifier case changed to lower-case `mk2m4ch/a`.
   - The old final C010/C011 paragraph is now labelled historical.

Alternatives rejected:
- A permanent stop for every successor: this violates the positive case and the task.
- Disabling `prepare` or public validation: unnecessary, and it removes a user capability.
- An empty-cart detector: there is no contract for one.
- Removing the old item or checking it out under a different plan: forbidden.

## 4. Behaviour (FAKE transport)

| Successor situation | Result |
|---|---|
| Same Pro or Duo plan on ENTRY / VARIANT | Public `continueProduct` only, then NEEDS_USER `retired-cart-holds-earlier-item…`, no `addBag`, grant revoked |
| Duo plan on configurable PRELAUNCH | Public choices (`configureProduct`×4), `NOT_RELEASED`, no resource action. After release the gate still applies |
| Restart (same task) | Same `taskId`, same persisted fact, still no `addBag` |
| BAG with exactly this plan's one item, no extras | Exactly `['checkout']`, reason `auth` |
| Duo plan while the bag holds the Pro | BLOCKED `retired-cart-bag-not-exactly-this-plan…`, no acts |
| Bag with two items | BLOCKED, no acts |
| Person leaves only the Duo in the bag | Duo successor gets `['checkout']` |
| Person empties the bag | `UNKNOWN` on the bag. The product page is still gated, so the program never adds |
| Untouched retirement of the successor, then a third task (any plan) | Fact carried, still gated |
| Retired chain with no read-only cart retirement | No restriction (`addBag`, `checkout`) |

## 5. Changed files

- `web/checkout-connector/job.js`
- `web/checkout-connector/control.js`
- `web/checkout-connector/control.html`
- `README.md`
- `test/checkout-c034-successor.test.ts` (new, 14 FAKE tests including a vm harness of the actual `control.js`)
- `docs/claude/C-034-report.md` (this file)

Not changed: the page parser, ChromePort, `owner.js`, requirements, manifests/permissions/settings/MCP, review files, old tests, the dispatcher, Git, and earlier reports. I did not run `git diff`/`status` because Git is not in the allowed command list. The post-edit manifest mismatch list (below) independently names exactly the four pre-existing edited files.

## 6. Requirements mapping (R01-R10)

- **R01:** Plan binding and the plan itself are unchanged. A changed model does not alter or authorize anything about the old item.
- **R02:** Preflight reports the old-cart blocker in Chinese.
- **R03:** The program never clears the bag and does not redo selection. Public selection remains available to reduce clicks.
- **R04, R05:** Slot logic is untouched. Not affected.
- **R06:** An emptied or unrecognized bag (`UNKNOWN`) is never read as empty. Ambiguity stops.
- **R07 / A05 (core):**
  - No duplicate addition across successor, restart, new authority, or untouched retirement chains.
  - Exactly one checkout of a verified matching single item.
  - No claim that local flags guarantee server exactly-once.
- **R08:** NEEDS_USER/BLOCKED takeover, with a stated next normal observation (the bag page, then 「恢复本任务」). Pause, stop and resume are unchanged.
- **R09:** No real action anywhere. A new Pro/Duo order, payment or slot remains unauthorized.
- **R10:** Truthful Chinese status. Full history is preserved.

## 7. Repro mapping

`review/c034-successor-cart.test.ts`: recorded before the fix at 6 failing / 1 passing. My run now gives 7 pass / 0 fail. That covers the same Pro and Duo-after-Pro cases × ENTRY/VARIANT/PRELAUNCH (no `addBag`, `units===1`, not `CONFIRMED_UNPAID`, retired history keeps `bagAddStarted:true`), plus the BAG-start positive (`['checkout']`, `auth`, history `[retired]`).

## 8. Commands actually run (exact, unchained) and results

1. `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-034-input-candidate-manifest.json`
   - Before edits: `{"ok": true, "files": 162, "sha256": "2a3562ca6f73393c65c253893db6093392dc15b3cedb8113451873f35b674887", "mismatches": []}`
   - After edits: exit 1, `{"ok": false, "files": 162, "sha256": "f29a2c083fc0615bc010ea050e9550d689011fc33b781cdd1f734e8a09427345", "mismatches": ["README.md", "web/checkout-connector/control.html", "web/checkout-connector/control.js", "web/checkout-connector/job.js"]}`
   - The post-edit mismatch is expected and is **not approval**.
2. `node --test review/c034-successor-cart.test.ts`: tests 7, pass 7, fail 0.
3. `node --test test/checkout-c034-successor.test.ts`: tests 14, pass 14, fail 0 (duration_ms 104.8487).
4. `node --test --test-reporter=dot "test/*.test.ts" "review/*.test.ts"`
   - The output was only `.` marks with no `X` failure mark.
   - The tool reported no non-zero exit, whereas it did report exit 1 for the post-edit manifest check.
   - The reporter prints no totals. My own hand count of the visible marks is 882 (44 lines of 20, plus 2). That is consistent with 861 + 7 + 14, but it is a count of output characters, not a reporter total. Codex's rerun is authoritative.
5. `node review/browser-retirement-self-check.mjs`
   - 4 PASS: `rendered-explicit-retirement-preserves-old-record-and-clears-authority-no-purchase`, `rendered-unresolved-checkout-is-not-retired`, `actual-browser-web-lock-excludes-second-control-page`, `rendered-pause-during-observe-keeps-entire-old-record`.
   - Output: `{"passed":true,"checks":4,…,"cleanup":{"contextsClosed":4,"browserClosed":true,"serverClosed":true,"errors":[]}}`
   - The script wrote its own result under `.local\reviewer\c030-browser-2026-10-03T21-47-30-210Z\result.json`. I did not read it.

## 9. Not run / limitations / residuals

- **Real-world contracts:**
  - Everything is FAKE. There was no Apple page, real bag, extension installation, account or live verification.
  - **No empty-bag contract.** In a chain that retired a resolved Pro cart, the program will never itself add any item (Pro or Duo), even if the person empties the bag. It continues only when the bag page shows exactly the current plan's one item with no extras, and then it only checks out.
  - The fact is never cleared within that chain. Handling an emptied bag would need a separate task with authorized normal observation of the official empty bag and a parser change. That is outside this task's allowed files.
  - The successor's checkout of a matching item does not clear the fact either. This is deliberately conservative.
- **Untested rendering:**
  - The new Chinese text is covered by the vm harness of the actual `control.js`, not by a rendered browser case.
  - The four existing rendered cases do not assert the new text.
  - Browser checks other than command 5 (for example, other `review/*.mjs` scripts) were not in the command list and were not run.
- **Facts not re-verified:** the Duo public path (white/256GB/¥15,999/`mk2m4ch/a`) and the October 16 20:00 preorder / October 23 release dates are recorded public facts, not re-checked here (no network). They are not live stock or online-pickup contracts.
- **Budget:**
  - Local session counter at report time: about USD 3.1 of the USD 8 profile. This is not billing data.
  - Turn and wall-clock usage across the context summary was not precisely tracked, so I make no claim about the 48-turn/1200-second profile.
  - No quota exhaustion was observed.

## 10. Real evidence vs simulation

- **Real or recorded:**
  - The C031 actual cross-review finding and the recorded C034 repro.
  - The actual repository code paths.
  - The recorded public Duo facts above.
- **Simulation:**
  - Every merchant read, cart line, Chrome API, storage record and authority in the tests.
  - Treating an emptied bag as `UNKNOWN`. This reflects the program's lack of an empty-bag contract, not observed Apple behaviour.

## 11. Resumable checkpoint

- The working tree on `codex/c030-quota-checkpoint-20261004` holds the uncommitted C034 edits listed in §5. Claude did not commit, push or publish.
- Next steps, all for Codex:
  - Regenerate the candidate manifest from fresh source.
  - Rerun the full suite with a reporter that prints totals, plus `review/c034-successor-cart.test.ts`, `test/checkout-c034-successor.test.ts` and `review/browser-retirement-self-check.mjs`.
  - Then obtain a real fresh-source agreement (a fresh Claude cross-review) before any acceptance or main merge.
- The C031 161-file candidate remains historical and rejected. main's last acceptance remains C028.
