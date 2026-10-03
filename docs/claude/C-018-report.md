# C-018 delivery report: evidence and binding comparison independent of object-member order

Author: Claude (claude-opus-5-5), same workspace and recorded session. Not self-approved. Codex must independently inspect
the changes, run the tests and failure paths, and reach precise-scope agreement before any human reload.

## 1. What was fixed and what was not claimed

The offline permutation reviewer found 4 of 16 failures. They come from two order-sensitive `JSON.stringify` equalities:

- **Transport boundary, `page-program.js`.** `ChromePort.act` sends `expected: JSON.stringify(this.last.raw)`, where `this.last.raw`
  is the structured-clone result of the previous `executeScript`. The page compared that text with `JSON.stringify(out)`.
  If object members arrived in another order, every action was reported as positively untouched with
  `OperationEvidenceChanged`, and the job stopped with `repeated-untouched-failures`.
- **Persistence boundary, `job.js`.** `JSON.stringify(normalizeIntent(s.plan)) !== JSON.stringify(P)` reported a false
  `existing-task-binding-differs` (BLOCKED) for a stored plan whose members came back reordered.

Both match the shape of the human native reports in `C-014-human-readonly-feedback.json`. However, the **native cause is not
established**:

- the installed extension bytes were not verified;
- Chrome's actual member order across `executeScript` and `chrome.storage` was not observed;
- no native per-action reason was observed.

This is a fix for an offline-demonstrated compatibility defect only.

## 2. Changed files (all within the write scope)

| File | Change |
|---|---|
| `web/checkout-connector/page-program.js` | Header note at line 11. Lines 215-220: the expected-evidence comparison uses an in-function canonical form. |
| `web/checkout-connector/job.js` | Header note at line 7. New export `canonicalJson` at lines 36-38. The binding check at line 98 uses it for the plan only. |
| `web/checkout-connector/chrome-port.js` | Imports `canonicalJson` (line 2). The list-generation fingerprint at lines 12-13 uses it. |
| `test/checkout-c018-evidence-order.test.ts` | New implementation test: 10 cases, all synthetic and labelled FAKE. |
| `docs/claude/C-018-report.md` | This report. |

Files not changed:

- `control.js` (read in full; there was no justified change);
- every other source, HTML or manifest file;
- all old tests and every `review/` file;
- requirements, the input manifest, and dispatch tools and settings.

No new helper file was added.

## 3. Comparison semantics, one changed comparison at a time

All three comparisons use the same canonical form:

```js
JSON.stringify(v, (k, x) => x !== null && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map(n => [n, x[n]])) : x)
```

What this form changes and keeps:

- **Ignored:** only the order of object members, at every depth (the replacer is applied recursively by `JSON.stringify`).
- **Still exact:**
  - every value and every JSON type (`null` vs `0`, `false` vs `"false"`, a number vs a string);
  - array order and array length;
  - whether each member is present (missing or extra members still differ).
- **Same as the old comparison:** members whose value is `undefined` and non-JSON values (functions, `NaN`) are serialized
  exactly as plain `JSON.stringify` did before. The only behaviour removed is the sensitivity to member order.

1. **`page-program.js:215-220`: transported `expected` vs current `out`.**
   - `canon` is defined inside `merchantDocument`, so the serialized function still has no module references. It works on
     every re-entry path because the comparison is the same statement on each one.
   - `command.expected` must be a string that `JSON.parse` accepts. Anything else (non-JSON text, `undefined`, a number, an
     object) gives `same = false`, which is positively untouched `OperationEvidenceChanged`. This happens before any DOM
     write, and `memo.add` is not called.
   - The order of checks is unchanged. The authorization checks (line 211) and the delivery memo (line 214,
     `OperationAlreadyDelivered`, touched) still run **before** this comparison. `memo.add` still runs only after a match.
   - No `eval` is used, and no foreign state is introduced.
2. **`job.js:98`: the normalized stored plan vs the normalized current plan.**
   - Only the plan comparison changed.
   - These checks are still exact and run in the same order:
     - `s.schema`;
     - `s.planDigest !== planDigest`, exact string;
     - `s.tabId !== tabId && !rebind`.
   - `normalizeIntent` is unchanged, so a legacy plan without `extras` still normalizes to explicit no-extras before the comparison.
3. **`chrome-port.js:13`: the list-generation fingerprint `[dates, times, selectedDate]`.**
   - This is not one of the reviewer's 4 failures; it is the same latent defect. If Chrome reorders members, a fingerprint
     that depends on member order can increase `generation` on an unchanged list. That can make a refused slot eligible
     again too early, which weakens R05 (no repeat).
   - Canonicalizing removes only those false "changed" signals. Any change to a date or time value, to array order, to
     `enabled` or `selected`, or to `selectedDate` still increases the generation (implementation test 7).
   - `chrome-port.js` now imports from `job.js`. Both are ES modules with no import cycle. I checked with grep that no test
     loads `chrome-port.js` as source text.

## 4. Comparisons deliberately left unchanged

- **`page-program.js`, all in-page comparisons:**
  - `snapshot()` and `inputSig`;
  - the slot continuation, which compares `JSON.stringify(purchase)`, `dates` and `times` with `c.out`;
  - the details continuation, `JSON.stringify(out) !== c.expected`.

  Both sides of each are built in the same page realm, in the same construction order, and never cross a transport.
  Changing them would only widen the change.
- **`control.js:21` `digestPlan` / `boundDigest`.** The task identity and the legacy-extras digest migration must stay
  byte-identical. Changing the digest would change identities or let a different digest through. It is not changed.
- **`chrome-port.js:24` production of `expected`.** It is still `JSON.stringify(this.last.raw)`. The page now canonicalizes
  both sides, so the sender does not need to change.

Nothing else changed:

- freshness and sequence checks;
- the memo;
- type, field, date and slot checks;
- the authorization gate;
- unknown-result handling;
- untouched counters, bounds, polling limits, storage keys and the rebind rules.

## 5. Test results (exact commands, exactly as authorized)

| Command | Result |
|---|---|
| `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-018-input-candidate-manifest.json` (before edits) | `{"ok": true, "files": 132, "sha256": "7c3ab1049bed5c08d2c77f2679e83c5044c549aa770885ca895f66ae065c13aa", "mismatches": []}` |
| `node --test review/c018-evidence-order.test.ts` (before edits) | 16 tests, **12 pass, 4 fail** (the demonstrated defect) |
| `node --test review/c018-evidence-order.test.ts` (after edits) | 16 tests, **16 pass, 0 fail** |
| `node --test test/checkout-c018-evidence-order.test.ts` | 10 tests, **10 pass, 0 fail** |
| `node --test "test/*.test.ts" "review/*.test.ts"` | **481 tests, 481 pass, 0 fail**, 0 cancelled or skipped (455 old + 16 protected + 10 new) |

I did not run the manifest verifier after the edits. A mismatch is expected for the three edited sources and the two new
files. No other commands were run.

### What the new implementation tests cover

The fake transport and store **reverse** object members, which is a different permutation from the reviewer's sorted order.

1. **`canonicalJson` itself.** Order is ignored. These still differ: a value change, a type change, `null` vs `0`,
   array order, a missing member, an extra member and a longer array. Each still differs after its members are reversed.
2. **The real serialized `merchantDocument` in a VM realm.** For 9 variants of the observed evidence, a click happens
   exactly when only member order differs. This covers whole and nested reversal, a nested total change, next-choice
   state, array order, a boolean becoming a string, a removed member, and a reversed variant with one nested change.
3. **Malformed or non-string `expected`.** Each is untouched `OperationEvidenceChanged`, and nothing is clicked. The command
   id is not consumed: the same id with current, reordered evidence still delivers exactly once.
4. **Memo precedence.** A delivered id re-sent with reordered current evidence gets touched `OperationAlreadyDelivered`.
   There is no second click.
5. **Order-reference hash re-entry.** The hash comes from the re-entered decode. Equal reordered evidence passes the
   comparison, and the stage then refuses the action without touching anything. A changed hash is `OperationEvidenceChanged`.
6. **Slot change-task re-entry.** Reordered stale evidence (one time slot's `enabled` changed) is refused untouched, and the
   select is unchanged. Reordered current evidence selects the slot and continues exactly once. A replay is touched
   `OperationAlreadyDelivered`.
7. **`ChromePort` generation.** Reordered identical lists keep the generation. A change to `enabled`, reversed date order,
   an extra member and a change to `selectedDate` each increase it by exactly 1.
8. **A reordered legacy record without `extras`.** With a different digest it stays BLOCKED, with no observe or act and the
   same task id. With the exact digest it stays attached to the same task id and digest, and is migrated to explicit no-extras.
9. **Arrays still bind.** A stored plan with a duplicated store entry is `existing-task-binding-differs`. The unknown
   `addBag` pending entry, `bagAddStarted` and `resourceWritten` are preserved deep-equal, and there is no observe or act.
10. **Reordered public validation.**
    - Under injected stale-control drift, the first run is NOT_READY with untouched count 1 and nothing clicked.
    - A restart keeps the count at 1; it is not reset.
    - After the drift ends, one run validates: the trade-in choice is clicked once and the no-AppleCare choice is clicked
      once, and Add to Bag is never clicked.
    - Only `VALIDATION_KEY` is written. The pre-existing purchase task row, with its unknown pending entry, is deep-equal
      and was never rewritten.

## 6. Pending and history preservation

- **Validation and purchase state.**
  - Validation storage (`VALIDATION_KEY`) and purchase storage (`TASK_KEY`) stay separate.
  - Public-configuration validation never writes the task row.
  - No state is erased, reset, retired or automatically rebound.
- **Unknown Add to Bag.** It stays `NEEDS_VERIFICATION` with its pending entry, and reconciliation does not repeat the action
  (protected test and implementation test 9).
- **Confirmed unpaid.** `CONFIRMED_UNPAID` returns before any observation or action, so there is no second page read or
  action (protected test).
- **Real bindings stay blocked.** A different tab, model, price cap, digest or plan array stays BLOCKED (protected tests and
  implementation tests 8 and 9).
- **Untouched counters.** `untouchedFailures` keeps accumulating across runs; only `untouchedStreak` resets after a
  successful action, exactly as before.

## 7. Reads in this invocation

Read freshly and in full in this invocation:

- `docs/requirements.md`;
- `docs/tasks/C-018-EVIDENCE-ORDER.md`;
- `docs/reviews/C-018-evidence-order-findings.md`;
- `docs/reviews/C-014-human-readonly-feedback.json`;
- `web/checkout-connector/page-program.js`, `chrome-port.js`, `job.js` and `control.js`;
- `review/c018-evidence-order.test.ts`;
- `test/checkout-r1-public-configuration.test.ts`;
- `test/checkout-job.test.ts`;
- `test/checkout-c013-continuity.test.ts`;
- `docs/reviews/C-017-bounded-agreement.md`.

The conversation context was compacted once during the task. After that I re-read `chrome-port.js` and the task sheet in
full, and lines 210-221 of `page-program.js` (a partial re-read). Older reads were otherwise used from this same invocation.
I did not read the input manifest's JSON body directly; it was verified only with the authorized command.

## 8. Remaining limitations (native)

- These are unverified:
  - the native cause of the human `repeated-untouched-failures` and `existing-task-binding-differs` reports;
  - the installed extension bytes;
  - Chrome's actual member order across `executeScript` structured clone and `chrome.storage`.

  No native per-action reason was available.
- A native controlled reload of the extension and a later real bounded public-configuration result are still separate,
  pending verification steps. I did not access the browser, the native host, the extension manager, the network, CDP or
  profiles.
- If the native failure has another cause (for example real stale controls or page drift), this fix would not hide it. The
  same untouched path, counters and bounds still apply.
- `REAL_PURCHASING_READY` remains false. No purchase, bag, order, payment or slot action was performed or authorized.
- No SKU, interface, slot capacity, reservation duration or launch-readiness claim is made.
- All fixtures are synthetic. None are Apple behaviour.

## 9. Permissions, quota and budget

- No permission denials occurred, and there was no provider quota error.
- The local USD budget notice at report time was about $2.47 of $7 used. That is not quota.
- Resumable checkpoint: the implementation and tests are complete. Next comes Codex's independent inspection, tests and
  failure paths, and then precise-scope agreement before any human native reload.
