# C-023 report — truthful final-result lookup labels (Claude)

This is an implementation candidate only. Codex reviews it and runs it independently. Bounded acceptance still needs a new exact-source consistency review. Nothing here is self-approval, and the full purchase goal remains unproven.

## Design

`job.js` now clears `observationCurrent` immediately before the nested `port.lookupOrder` call. This is one statement plus a comment, in the non-read-only pending-`submitOrder` branch only.

**Why the reset is needed.** `ChromePort.lookupOrder` may follow the receipt's own observed detail link and read pages. The job never validates those reads against its own sequence and document checks, and never records them. So once the lookup starts, the job's last validated read (normally the receipt) may no longer be the tab's page. From that point it is shown only as `最近已读页面`, never as `页面`. This covers:
- the CONFIRMED_UNPAID save;
- the `final-result-unconfirmed; no resubmission` stop;
- every lookup outcome: verified unpaid, detail reached with mismatched facts, AUTH, lost read, ungranted link host and thrown errors.

**What is unchanged.**
- The fresh receipt read and the first receipt-identity save before the lookup are still shown as current.
- Same-tab read-only `mode:'reconcile'` still returns before any lookup. There is no navigation or lookup there, and its fresh read stays current.
- `observationCurrent` drives no decision. The order checks are untouched:
  - exact hashed receipt identity;
  - independent detail route and unpaid state;
  - item, store, one unit, price cap and slot;
  - pending final and sent intent;
  - the expiry exception for final lookup;
  - no resubmission and no grant.
- One independently verified unpaid result still confirms. A failed lookup still means unknown: not order failure, not no stock and not permission to retry.

**Alternative not chosen.** I did not show the lookup's own verified page as current. That would need `chrome-port.js` to return observation metadata, and `job.js` to re-validate its schema, document and sequence before trusting it. That widens the trust surface beyond a minimal repair. The acceptance criteria explicitly allow labelling the old page as last-read, so `chrome-port.js` is unchanged.

**Known nuance.** After a lookup, `最近已读页面：ORDER_RECEIPT` names the job's last *recorded* validated read. The port may have read the detail page internally afterwards, and that read is not shown. The label is also conservative when the lookup did not navigate, for example when the link host is ungranted or the tab was already on the detail page.

## Changed files

| File | Change |
| --- | --- |
| `web/checkout-connector/job.js` | One statement plus a two-line comment, before `lookupOrder` (now lines 138–140). |
| `test/checkout-c023-final-lookup.test.ts` | New: 11 FAKE cases. |
| `docs/claude/C-023-report.md` | This report. |

I made no other edits: `chrome-port.js`, `control.js`, the quantity parser, permissions, the manifest, settings, the dispatcher, prior cases, reviews and task documents are unchanged.

## Requirement and acceptance mapping

| Requirement | Coverage |
| --- | --- |
| R06/R10: the old receipt is never called the current detail, AUTH or unread page | Codex 1–4. Mine: 1 (state sequence `[RUNNING/REVIEW false, receipt true, identity save true, CONFIRMED_UNPAID false]`), 2–8, and 9–10 (exact Chinese status through control Resume). |
| R07: unknown final preserved, no resubmission, verified unpaid still usable | Codex 1–4. Mine: 1, and 3 (a lost read, then a later Resume confirms once with no second navigation and zero commands). |
| R06: a failed lookup is not failure, no stock or permission to retry | Mine: 2 (ungranted host: no navigation, stays `NEEDS_VERIFICATION` with pending kept), 3, and 4–8. |
| R01/A06: independent item, cap, one-unit, store, slot and receipt-identity checks | Mine: 4–8 (another slot, total 10000, two units, another store, another receipt hash). |
| R08: read-only reconcile adds no navigation or lookup | Codex 5. Mine: 11 (control reconcile: one read, zero navigations, commands and session reads; status `页面：ORDER_RECEIPT`). |
| Expiry exception only for no-mutation reconciliation | All cases use an expired task with a dispatched final; `expiresAt` is unchanged. |

## Commands and results (actual)

1. `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-023-input-candidate-manifest.json`, run before any edit: `{"ok": true, "files": 146, "sha256": "2ca8210ad75346aed31336e79d88d3d3eed05feb028a40e6f60dc0dd06b6f26c", "mismatches": []}`.
2. `node --test review/c023-final-lookup-truth.test.ts`: 5 tests, 5 pass, 0 fail.
3. `node --test test/checkout-c023-final-lookup.test.ts`: 11 tests, 11 pass, 0 fail.
4. `node --test "test/*.test.ts" "review/*.test.ts"`: 670 tests, 670 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo, 6479 ms.
   - 670 = the original 654 + Codex's 5 + my 11.
   - Searching that run's saved output found no `✖` lines.
   - The tool did not print a numeric exit code and reported no error.
   - The suite includes the quantity cases (121, 1, 0, 2, hidden, nested, conflict) and the terminal → refusal → fresh-reselection mock chain.

## Reading scope

**Read fully in this task:**
- `docs/tasks/C-023-FINAL-LOOKUP.md` and `docs/requirements.md`;
- `docs/reviews/C-022-R1-Claude-cross-review.md`, `C-022-R1-bounded-agreement.md`, `C-023-before-verification.json` and `C-023-input-candidate-manifest.json`;
- `review/c023-final-lookup-truth.test.ts`;
- `web/checkout-connector/job.js` and `chrome-port.js`.

**Searched:** `test/` and `review/` for `observationCurrent|lookupOrder`. No existing case asserts currentness after a lookup.

**Reused without re-reading:** the control-page harness follows my C022-R1 test pattern. I relied on `control.js` and `owner.js` from earlier reads. `control.js` has the same hash `931d3120…` in this input; I did not read `owner.js` itself.

## Limits

- I did not produce an output manifest or hashes; no command for that was authorized. Codex must freeze the output identity.
- All tests are FAKE.
- Known external gaps remain:
  - the human's native BAG quantity-repair response is pending;
  - the Chrome controlling extension needs an update, and this cannot be bypassed;
  - the FULFILLMENT adapter's current quantity and split summary total are unverified;
  - real rejection/reselection, the Duo contract and speed are unverified.
- This is offline validation of the final result. It does not make a native one-click order ready. The old human-rebound task stays permanently read-only, the prior one-Pro-order authority is used, and there is no new bag, slot, order or payment authority.
- O1–O3 and the stale `permissionOrigin` help text are unchanged.
- I hit no permission denials or provider quota errors. Only the four authorized commands were run, unchained. I used about 9 turns and about USD 1.5 on the local counter (caps: 28 turns, 900 s, USD 5). I did not read wall-clock time, but the commands ran well under 900 s.

## Restore point

The input is 146 files, SHA `2ca8210a…f26c`. The output differs from it only in `web/checkout-connector/job.js` plus the added `test/checkout-c023-final-lookup.test.ts` and this report.

Next steps:
1. Codex independently reviews the change and runs the tests.
2. Codex freezes the output manifest.
3. A precise-source original-session consistency review, before bounded acceptance.
