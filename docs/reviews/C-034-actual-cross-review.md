**Verdict: AGREE** for the exact 163-file C034 candidate (sha256 `5a91251632361f60e5986b1da71936b732c50b6747a53de0342093a01336df04`), within its bounded scope only. It fixes the cart-duplication defect from C031 and does not make the full automatic Duo purchase ready. I found no blocking counterexample by code trace. Codex keeps final acceptance, and this is not self-approval.

One thing weakens this AGREE: I wrote the C034 code in this same session. As the task requires, this is the original session reviewing its own implementation, so it is not an independent review.

## Commands (exact, unchained, in order)

| # | Command | Result |
|---|---|---|
| 1 | `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-034-candidate-manifest.json` (before tests) | `ok:true`, 163 files, `5a912516…df04`, no mismatches |
| 2 | `node --test --test-reporter=dot "test/*.test.ts" "review/*.test.ts"` | Only `.` marks, no `X`, no non-zero exit reported. The reporter prints no totals. My hand count of the marks is 44×20+2 = 882, which matches Codex's recorded 882/882, but it is not a printed total. |
| 3 | `node review/browser-summary-self-check.mjs` | 8/8 PASS, `passed:true`, 8 contexts closed, browser and server closed, `errors:[]` |
| 4 | `node review/browser-retirement-self-check.mjs` | 4/4 PASS, `passed:true`, 4 contexts closed, browser and server closed, `errors:[]` |
| 1 | Same manifest check (after tests) | Identical: `ok:true`, 163 files, `5a912516…df04`, no mismatches |

The two browser scripts wrote their own ignored output under `.local\reviewer\…` (stamps `2026-10-03T21-57-33Z` and `21-59-45Z`); I did not read it.

## Code trace against the criteria

**1. A successor on ENTRY / VARIANT / configurable PRELAUNCH, same Pro or Duo: no duplicate addition.**
- **How the old cart is remembered.** A successor of a retired task keeps the full retired history (`job.js:128`). Right after the binding check, `job.js:149` derives a record of the old cart item from that history and the first save stores it (`:156`).
- **Only one place can add.** The only `addBag` command is at `job.js:245`. With that cart record present, `:244` stops first with NEEDS_USER. `gate()` revokes the start grant (`:76`), so a new authority alone cannot add.
- **Public preparation still runs.** Public choices still run (`:237-238`), and PRELAUNCH still ends `NOT_RELEASED` (`:225`) without any resource action.
- **Persistence.** Restarts reuse the stored record. Successors saved before this fix re-derive it, because the history is never dropped. Untouched `retire()` keeps the record (`:83`). Later successors flatten the history chain (`:128`). `retiredCartFact` keeps walking past history entries that have no cart record (`:58-61`), so a chain whose middle entry was retired before deriving the record still finds it.
- **No other way out.** `addBag` is the only addition path. Pending reconciliation never resends. Validation uses its own key and stops before Add to Bag (`:241`, `:285`). Every retirement of a task that wrote to the merchant goes through the read-only path (`retirable` at `:48` requires `resourceWritten===false`), so the record covers every retired item that was added.

**2. Bag page.**
- **Unchanged checks.** `itemMatches` (`:46`, exactly one verified line, quantity 1, within the price cap) plus `extras!==true` gives exactly `checkout` (`:248`).
- **Extras proof.** The page program requires `extras===false` and the price cap again at click time (`page-program.js:386`). Its extras result can't be null when the item is verified (`:242`).
- **Wrong cart blocked.** A Duo plan with the Pro still in the bag fails `exactProduct` (`page-program.js:108`). Two items leave `line=null` (`:61`). Either way the result is BLOCKED with no removal, checkout or addition.
- **History and old identity kept.** History and the old read-only record are preserved. Reusing the old task identity or a revoked grant is still refused (`job.js:130`).

**3. Nothing else weakened.** The C034 edits are limited to additions at `job.js:26, 55-63, 72, 148-149, 242-244` and a reason-string choice at `:248`. `validStored` only became stricter, and the new field never existed in older records. Unknown-final, slot history, extras, price/quantity, private-data and currentness paths are byte-for-byte unchanged in the trace. The approval and not-released gates (`page-program.js:228-235`, `job.js:225`) cannot be forced. The 7 protected cases pass inside the full run, and Codex records 96 protected input files unchanged.

**4. The limitation is stated.** The cart record never clears, and with no empty-bag contract an emptied bag reads as UNKNOWN (`page-program.js:183`). So in this chain the program can never add a Duo. That is clearly not the full automatic Duo goal and needs its own adaptation task. An exact fresh bag item can still proceed to checkout.

**5. Operator text.**
- `control.js:34-36, 123, 28`, `control.html:16` and README lines 13 and 25 truthfully say the item stays in the bag and nothing will be added.
- No new control IDs or permissions.
- README line 7 now reads `mk2m4ch/a`, matching the C-031 evidence path.
- Lines 5, 9 and 206 frame older states as history.

**6. Earlier pending work (C029/C030/C031), re-read with no new counterexample.**
- The summary close button must be exactly `关闭` (`page-program.js:318-319`).
- Quantity comes only from the piece label (`:311`), and money is only used to detect change (`:322`, `job.js:188`).
- Retirement guards, the C031 pre-release gate and the dispatcher's private-read denies (`invoke_claude.py:23`) are as declared.

## Non-blocking nits (recommendations, not blockers)
1. The cart help text (`control.js:34`) says to "open the official bag page" without saying "in the original tab". Opening it in another tab leads to a safe but confusing `existing-task-binding-differs` stop.
2. README line 13 could say plainly that "the program cannot add after you empty the bag" is a current gap pending a separate empty-cart adaptation, not the intended flow.
3. `control.js:123` and `control.html:16` leave out "无附加项" (no extras), which the other texts include. The behaviour still requires it.
4. Carried over from C031: the reason text at `job.js:188` ("explicit-one-unit-basis") overstates what the money basis is.

## Read scope, limits, denials
- **Read:** all 25 listed files in full during this invocation (no offset/limit), and nothing else. I used no Grep or Glob. This is not a whole-repository review; my earlier reading in this session is historical.
- **No denials or private reads:** no permission denials, no private, home or `.local` reads, no edits, no agents, no network.
- **Model, effort, budget:** the model is `claude-opus-5-5`; the `xhigh` effort setting can't be seen from inside the session. About 13 of 40 turns used. The local counter shows about USD 1.8 of 8, which is not billing. I didn't measure wall time precisely, and no cap was hit.
- **Independence:** same session and same author as the implementation, as noted above.

## Live residuals not verified
- **No real-browser test of this code:** no C034 run in the installed personal extension, on a real bag page, on the real Duo pages, or in the user's stored extension data.
- **Empty bag and the full goal:** no trusted empty-bag contract; full automatic Duo addition is blocked in a chain that retired the Pro.
- **Not shown:** one-click ordering, stock, holds or refusals, real speed.
- **What the rendered checks prove:** Web Locks and page rendering are real, but only on an isolated loopback page. Chrome, storage and merchant responses are synthetic. Both browser scripts are Codex-authored and load Playwright from a Codex home cache.
- **Authorization:[REDACTED] the official Duo price/SKU and the October 16/23 dates don't establish online pickup. No new order, payment or slot submission is authorized.

**Checkpoint:** review complete, AGREE for the bounded candidate. Codex's final acceptance remains. Any change to these source bytes needs a new manifest and a fresh review.
