# C030 Codex quota takeover — resolved rehearsal to a new one-item task

**Candidate, not bilateral acceptance.** The actual C029 original-session exact review stopped on provider session quota, reset 05:20 Asia/Shanghai. It exited with all owned processes cleaned up. The user had explicitly authorized Codex to implement during real Claude quota exhaustion and later require genuine Claude review and agreement. No artificial quota consumption, second implementer, model substitution or shutdown.

## Result

The old resolved, permanently read-only cart rehearsal no longer has to block every future purchase plan. The existing retirement control now supports a narrowly bounded new operation:

1. Require the old original binding, permanent read-only flag, BAG stage and known cart-action flags; no pending action, final intent/reference, initial pickup dates, cursor, refusal, rejected/accepted slot or slot floor. Prior history with unresolved/final/slot facts also stops.
2. Read a **fresh exact one-item BAG**, with merchant no-extras proof, matching model/capacity/colour and price cap. No merchant `act` is called and no private session data is read.
3. Check the persisted record has not changed, then mark it retired while retaining its history, permanent read-only status and previous-state/verification metadata. Duplicate management clicks do not replay an observation or replace it.
4. Clear the control page's cached preparation and all purchase confirmations. A new run gets a distinct task and fresh authority. Old identity/revoked grants and newly found unknown-final/slot facts cannot be hidden by the retired marker. The new run on a matching one-item bag performs Checkout without another Add to Bag.

This does not renew the old task or issue any real purchase. Untouched retirement's old behaviour remains. No unknown or submitted order can be retired this way. This narrow path may still reject old histories that contain unresolvable earlier facts; it is not a universal reset.

## Authorship and files

Codex business edits, limited to:

- `web/checkout-connector/job.js`: `resolvedReadOnlyBag`, `retireReadOnlyBag`, and new-run checks for this retirement provenance.
- `web/checkout-connector/control.js`: dispatch the permanently read-only case through the existing owned retirement handler, use an observe-only port, cancellation ticket, and clear cached grants/confirmations.
- `web/checkout-connector/control.html`: relabel/explain the existing control; no new control IDs or permissions.

Codex tests: new `test/checkout-c030-retirement.test.ts` (41 cases) and `review/browser-retirement-self-check.mjs` (4 rendered cases). All **92 C029 input test/review files remain byte-identical**, including the author's C02949 cases, both existing independent harnesses and fixture. C029 summary parser and ChromePort are unchanged from the frozen158 candidate.

## Actually run

- New Node cases: **41/41**. The prior liveness stop is actually reproduced by unchanged untouched retirement and permanent-read-only run behaviour; the positive successor performs one Checkout and no Add to Bag. Unknown/final/slot history, wrong binding/current item/quantity/price/extras, stale read, pause, storage race and old authority stay blocked.
- Full regression after the final changes: **841/841**, no skipped/cancelled cases, source bytes unchanged during the run.
- Current C029 rendered summary check: **8/8** still pass; 8 contexts, browser and server actually closed with no errors.
- New C030 rendered control check: **4/4**. Actual native browser DOM and **real Web Locks** prove explicit retirement/no purchase, unresolved Checkout blocking, two control pages excluding one another, and Pause during observation preserving the record. Four contexts, browser and server actually closed with no errors.

These are **Codex takeover self-tests**, pending independent Claude review. The new browser tests use a fresh isolated headless Chrome and serve the current controller/modules on loopback. Chrome permission/tab/document APIs, storage, merchant facts and authority are explicitly FAKE. Page requests are restricted to that owned origin; this is not an OS-wide network measurement. No personal extension install, profile, storage, credential, Apple resource, actual slot or order was used.

## Intermediate failures preserved

- The first rendered run failed at all four setups because an exact `商品` label locator did not match the actual select. Fixed only the new harness to use its source-owned `#product` and shorter bounded waits. Initial cleanup succeeded. This was a harness error, not a product finding.
- The first full suite was **840 pass / 1 fail**: adding a prototype control ID violated the protected C017 exact original-control contract. Reworked the product to reuse the existing retirement control, with no old test edits. The corrected four rendered cases and final841 run pass. No failure receipt is relabelled as success.

Source identity: **160 files**, SHA256 `d099396b2b73c3dd83942323eb0ba555ccee5958aecdde85d518ca85b8d5e6d6`. [Self-verification](C-030-self-verification.json) records precise scope. The frozen C029158 map is retained separately; its approval attempt did not complete. Last accepted main remains C028. Later publication records must distinguish pending checkpoint from accepted main.

## Next

At actual quota recovery, resume the single original Opus5.5/xhigh session for `C-030-CROSS-REVIEW`: include C029's unfinished exact review and all Codex business/dispatch/reviewer changes against the new160 map. Require real scoped agreement, then Codex final acceptance. No old SHA approval may be used for these new bytes.

The normal official pickup/store/date preview question is still pending. No dependent site selection, new order/payment/slot submission is authorized or performed. Current normal official bag was last read at 19:47 UTC with selected quantity1 after the previous checkout session expired; historical C029 login/summary observations retain their actual timestamps. Real Duo, later-stage structures/refusal list, installed executor purchase and official speed remain unverified. Keep the complete Duo goal active; do not shut down.
