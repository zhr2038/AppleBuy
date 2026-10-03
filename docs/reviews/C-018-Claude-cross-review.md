# C-018 cross-review: AGREE on the exact 133-file candidate (bounded offline repair only)

**Verdict: AGREE**, limited to this candidate's offline repair: evidence, stored-plan and slot-list "generation" comparisons that ignore object-member order. This is my consistency check as the author, not acceptance. Codex owns independent acceptance. It does not cover installation, native behaviour, the whole repository or real purchasing; `REAL_PURCHASING_READY` stays false.

## Command outcomes
Only the two authorized commands were run, exactly as written.

| Command | Result |
|---|---|
| `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-018-candidate-manifest.json` | `{"ok": true, "files": 133, "sha256": "4ead4c58aa4e9551db8b1c631fedec39a3a53e98ca3ee99f33d9e5fcff2e8fa5", "mismatches": []}` |
| `node --test "test/*.test.ts" "review/*.test.ts"` | 481 tests, 481 pass, 0 fail / cancelled / skipped / todo, 6056.5 ms |

The 481 are 455 old, 16 protected reviewer and 10 new implementation cases; all 26 C018 cases are named passing in the output.

I did not reproduce the pre-patch result (467/471, protected test 12/16) in this invocation; that needs the old bytes and no authorized command.

## Reads in this invocation
**Fresh and complete (no offset or limit):**
- `docs/requirements.md` and `docs/tasks/C-018-CROSS-REVIEW.md`
- `page-program.js`, `job.js`, `chrome-port.js`, `control.js`
- `review/c018-evidence-order.test.ts`, `test/checkout-c018-evidence-order.test.ts`
- `test/checkout-r1-public-configuration.test.ts`, `test/checkout-job.test.ts`, `test/checkout-c013-continuity.test.ts`
- `docs/claude/C-018-report.md`
- The seven review files: C-018 findings, independent review, actual verification, generation boundary, candidate manifest, C-014 human feedback, C-017 bounded agreement
- Extra: `tools/delegation/verify_candidate_manifest.py`

**Searches:** Grep for imports and source-text loading; Glob for a partial file inventory. No partial reads. No prior-session content was counted.

## What I checked
**Evidence comparison in the page (`page-program.js:215-220`).**
- `canon` sorts object keys recursively. Values, types, array order and length, and field presence stay exact. Missing `undefined` members and `NaN` serialize the same way they did before.
- The helper is defined inside `merchantDocument`, with no eval and no module references. The order-reference hash re-entry reaches the same check; the slot and details continuations return earlier, by design.
- Authorization (line 211) and the delivered-command memo (line 214, reported touched) still run first. The memo is updated only after a match.
- Malformed, non-string or prototype-shaped expected evidence becomes `same=false`. That is reported untouched, before any DOM write, and the command id is not used up.
- Leaving the in-page comparisons exact (`snapshot`, `inputSig`, slot and details continuation) is correct. Both sides are built in the same realm in a fixed order.

**Stored-plan binding (`job.js:98`).**
- Only the normalized plan comparison changed. Schema, `planDigest` (exact string), tab and rebind checks are unchanged. `normalizeIntent` is unchanged.
- The digest in `control.js` is still computed from the freshly built plan, never the stored one. So storage order cannot affect identity, and the old no-extras digest migration is byte-identical.
- Extra plan fields or a different store list still block.

**Slot-list generation (`chrome-port.js:13`), as an R05 guard.**
- The job refuses a rejected slot while `r.generation >= o.generation`. A spurious increase on an unchanged list would therefore allow the refused slot again in the same generation.
- Canonicalizing only removes those false increases. Real changes to dates, times, `enabled`, array order, extra fields or `selectedDate` still advance it (implementation test 7, consistent with the independent before/after `[1,2,3,4,5]` → `[1,1,2,2,3]`).
- If anything, it errs toward not advancing, which leads to `no-fresh-refusal-list` and a human check.
- There is no import cycle: `job.js` imports nothing, and `control.js` is the only runtime importer of `chrome-port.js`. Tests that load `control.js` as source text strip its import lines, and `control.js` is unchanged.

**Guards still intact.**
- **Freshness:** sequence checks and both untouched bounds; untouched counters are kept across validation restarts.
- **Storage:** validation and purchase storage stay separate.
- **Unknown Add to Bag:** preserved and never repeated.
- **Confirmed unpaid:** returns before any page read.
- **Real changes:** a different tab, model, price cap, digest or plan array stays blocked.
- **Nothing new:** no reset, erase, retirement, automatic rebind, extra permission, forced disabled control or new merchant authority.

**Inventory (partial).** All 9 files under `web/checkout-connector/` and all 22 `test/checkout-*` and `review/c01*` files are listed in the manifest. I did not verify the whole tree's inventory; Glob truncates and git is not authorized.

## Problems in my implementation report (none block the repair)
1. **I overclaimed re-reads.** My C-018 report says I re-read the task sheet and `chrome-port.js` in full after the context was compacted. Those were contents the harness re-attached, not Read calls I made. Root's qualification is correct: credit only the initial 13 full reads and the one partial re-read of `page-program.js` lines 210-221.
2. **The manifest statement was wrong.** I said the two new files would show as mismatches. The verifier only hashes files the manifest lists, so it cannot see unlisted new files, and `docs/claude/` is outside its scope. Only the three edited sources would mismatch. New-file coverage comes from root's separate inventory audit.
3. **Wording.** "`untouchedStreak` resets after a successful action" should say it resets on verified progress of a delivered action.
4. **Test coverage gaps, not defects:**
   - Implementation test 8 checks digest binding at the job level only. It does not exercise `control.js` `boundDigest`, which is unchanged.
   - Under the permuted transport, the protected test asserts two configure actions and one click per choice, but not that each choice follows a fresh observation. The job loop guarantees that, and the unpermuted R1 test asserts it.

## Limitations
- **Native cause:** not established. The installed bytes, Chrome's per-action reasons and Chrome's actual member order were not captured. The two human reports and the observed unconfigured page are qualified evidence, not proof of cause.
- **Unverified idea for the native check:** Chromium may convert `executeScript` results and `chrome.storage` values into internal dictionaries kept sorted by key. That would produce exactly both reported failures. It comes from my background knowledge, not evidence gathered here; check it in the controlled reload.
- **Next step outside this review:** the human reload and bounded public-config validation, stopping before Add to Bag, with existing records kept.
- **Not touched:** no browser, extension, native host, CDP, profile, storage, network, HTTP surface or agent. No file was written.

## Permissions and quota
- No permission was denied and there was no provider quota error. No local cap was hit; the budget notice showed about $1.5 of $5 used, which is a local budget figure, not quota.
- **Checkpoint:** this exact-scope review is complete. Next is Codex's acceptance decision, then the human native reload.
