# C-028-CROSS-REVIEW: delivery report

## Verdict
**AGREE** for the exact 156-file candidate `9a82d72ba377812d3f4e2bf55c28ad8ddd26f1ebee48389ad7d116cef3c57ff6`. This agreement only covers fake, isolated software validation. It is not acceptance, not live readiness, and not self-approval. I found no blocking counterexample.

## Command evidence (only the three approved commands, each run once, nothing chained)
1. **Manifest check** (`python tools/delegation/verify_candidate_manifest.py docs/reviews/C-028-candidate-manifest.json`): `{"ok": true, "files": 156, "sha256": "9a82d72b…6ff6", "mismatches": []}`. The current bytes match.
2. **Node tests** (`node --test "test/*.test.ts" "review/*.test.ts"`): 751 tests, 751 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo, in about 6345 ms.
3. **Browser self-check** (`node review/browser-self-check.mjs`): 16 PASS lines, exit code 0. Output: `{"passed":true,"cases":16,"passedCases":16,…,"realOrderCreated":false}`.
   - I read the output with Read, not with extra `tail` commands.
   - I did not read the `.local\…\result.json` file it wrote, as the task instructs.

## Assessment of the production guard (`page-program.js:98–109`)
- **Mention count vs exact anchors** (`:103–105`): every case-insensitive "iphone" in the whole `main` text must belong to the accepted anchors.
  - That covers hidden text, bare text nodes, any tag, and text over 180 characters.
  - On the group path, the anchors are the strip and the copy. `groupLine` (`:95`) and `knownLegend` (`:92–94`) also require each of them to equal the full variant exactly, so at most two mentions are allowed and both must be those anchors.
  - On the generic path there is one outermost line and every product line must equal the variant, so exactly one mention is allowed.
- **Nested anchors are counted once** (`:105`): an anchor inside another anchor is filtered out before summing.
- **`<=` instead of `===`**: anchors are queried from inside `main`, so on a real DOM their count can never exceed `main`'s. The `<=` only tolerates old flat fakes. It does not assume a server contract.
- **Extra product text stops the flow**:
  - It is checked in the browser by the 4 variants at `browser-self-check.mjs:111` (bare header, strong header, li in main, long main), all with `delivered:false, touched:false` and pickup left unchecked.
  - `C-028-rendered-repro-after.json` matches this.
  - My 18 tests and the 4 protected review tests cover the same cases.
- **Valid pages still pass**: the rendered page with the accessible title pair and a synthetic quantity of 1 still selects pickup (`:101`), and the generic and nested-anchor unit tests are positive.
- **Missing quantity is still unknown**: quantity comes only from an explicit 数量 line or a select labelled 数量 (`:113–120`). The `itemVerified` check at `:152` requires quantity 1. The browser case at `:100` confirms quantity null, unverified and untouched.
- **Downstream gates are consistent**:
  - `job.js:187` returns BLOCKED `pickup-conditions-not-verified`.
  - `chrome-port.js:26–27` treats a result as untouched only when it is a structured untouched report.

## Harness vs engine journal (`src/engine.ts`, read in full)
The record types the harness checks match what the engine writes:

| Record | engine.ts |
|---|---|
| `sent` | `:261`, or `:640` when inferred from a result |
| `accepted` | `:665` |
| `refusal` | `:730` |
| `observe-request` with reason `lookup-order` | `:701` |
| `unknown` | `:691` |
| `outcome` | `:642–646` |

A final submit is never sent twice:
- On restart with a sent submit, the engine only reconciles by looking up the order (`:308–311`).
- An unknown result also leads only to a lookup (`:695–702`), and repeated failures end in MANUAL_VERIFICATION (`:712`).
- The ledger records the submit before it is sent (`:255–257`).

These back the harness's assertions for the lost-reply, unknown and restart cases.

## Non-blocking findings and residuals
1. **Disguised spellings evade the count** (`page-program.js:103`): an extra mention spelled with an inserted zero-width character (`norm` turns it into a space) or with look-alike letters is not counted. This only matters for an adversarial page, not for the Apple page shape.
2. **Only iPhone is counted** (`:103`): extra non-iPhone lines (accessories, add-ons) are not counted. The price cap gives only partial protection.
3. **Liveness (F4)**: `main.textContent` includes hidden summary dialogs, `<select>` options, script/style text and recommendations. A real later page may therefore stop safely when it shouldn't need to. The positive result is proven only on the synthetic fixture.
4. **Bag path**: the bag branch (`:108`) is not covered by the count. It still relies on its own structural check, by design.
5. **Harness nits** in `browser-self-check.mjs`:
   - `:85` (redraw): does not tie the unknown chooseSlot to the redraw itself, so any throw during chooseSlot would also pass.
   - `:84` (over-cap): only the total is checked, not the other condition fields.
   - `:113`: if `passed` were false without an exception, the exit code would not be set. That path is unreachable now because `check()` rethrows at `:43`.
   - `:74`: lookups is asserted as `>=1`, bounded by the equality with the journal at `:78`.
   - `:43`: rethrowing means the first failure skips the later cases. It fails closed but loses diagnostics.
6. **F3**: Playwright is loaded from outside the manifest (`:23`). The network counters cover only page requests inside the browser context, as `:122` discloses.

## Read scope
- All 20 required files were read with Read during this invocation.
- **The conversation was compacted partway through.**
  - For 16 of the files I read before compaction, I now have only my own summary, not the verbatim content.
  - After compaction I read `src/engine.ts` in full, re-read `browser-self-check.mjs` in full, and re-read `page-program.js` lines 85–159.
  - The task sheet, `C-028-independent-completion.md`, `C-028-rendered-repro-after.json` and the browser output were still available in full after compaction.
- Earlier in this invocation I recorded no partial reads, but I cannot re-check those reads word for word now.

## Limits and disclosures
- **Permissions**: no denials in this invocation. No Edit/Write was attempted or available; this report exists only as text.
- **Not run**: no live Apple pages, extension, Chrome APIs, personal profile, or real-speed test. I did not run or read Codex's private fault-injection shim.
- **Model and budget**: model `claude-opus-5-5`; the `xhigh` effort setting cannot be verified from inside. I cannot measure turns or wall time against the 48-turn / 1200-second profile. The local USD counter is about $2.07 of $8; that is a local counter, not billing.
- **Not independent**: the F1 guard and the 18 tests under review are my own C-028-R1 work.
- **Prior run preserved**: my earlier C-028-R1 run's partial reads and two extra `tail` reads remain recorded as deviations; this report does not rewrite them.

## Real vs simulated
Everything here is FAKE: synthetic loopback pages with an explicit fake location, and the fake-only DomMotor and engine. These are still not established:
- Apple's current official quantity contract
- refusal and Duo behaviour
- one-click unpaid-order readiness

No official resource, slot, order or payment was touched.
