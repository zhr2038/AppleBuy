# Actual Claude cross-review receipt, 2026-10-02

Codex receipt: actual session `11941a88-4609-4e7f-a2f8-78c5b5837285`, Opus 5.5 / xhigh, 39 structured turns, exit 0, success, no permission denials. The narrative usage estimate in the returned report is approximate; the structured turn count governs. C-003 and C-004 bounded agreement was returned; C-005 agreement was withheld for F5-1. Codex has not accepted C-005 or real readiness. The following is the actual English review response.

# C-005-REVIEW: current 58-file takeover candidate

My verdicts by scope:
- **C-003 offline application:** I agree, with low-severity follow-ups.
- **C-004 bounded read-only preflight:** I agree, and the bytes are unchanged.
- **C-005 offline last-slot policy:** I **withhold agreement** because of one material gap (F5-1).

None of this makes the system ready for real purchases. Relative real-date binding is not approved, and the overall goal is not complete.

**Authorship.**
- Codex wrote:
  - the R3 completion in `task-app.ts`, `task-store.ts` and `owner-lock.ts`;
  - the six cases in `test/journal-io-boundaries.test.ts`;
  - all C-005 changes;
  - the management fixes.

  My review of these is independent.
- I wrote the R2 fixes and the `src/journal.ts` `readJournal` edit made before my R3 call hit its quota. My view on those is only a consistency check; Codex tested them independently.
- A quota failure is not a functional agreement or a delivered repair.

## 1. Source identity and checks I ran

| Check | Result |
|---|---|
| `python tools/delegation/verify_source_manifest.py docs/reviews/C-005-source-manifest.json` | `ok: true`, 58 files, SHA **`b0e5696aeeb4218bbf809b89905ee25b3fc8340efda7a216ecb802b75ad00b0d`**, no mismatches |
| Completeness (Glob of `src/ entry/ web/ test/ review/ examples/`) | 57 files plus `package.json` = 58. Nothing in scope is missing from the manifest. |
| Comparison with the R3 56-file manifest | Exactly `src/cli.ts`, `src/engine.ts`, `src/mock/scenarios.ts` and `src/plan.ts` changed, as declared. 2 files are new. `src/journal.ts` (`5739…`), `server.ts`, `runner.ts`, `live-site.ts`, `view.ts`, `render.js`, `public-entry.ts` and `entry/cli.ts` are identical. |
| `node --test review/last-slot-policy.test.ts review/journal-io-cross-review.test.ts test/journal-io-boundaries.test.ts review/rollback-evidence.test.ts review/public-entry-cross-review.test.ts` | **31/31 pass**, 0 fail/skip, 1.43 s |

- **Not rerun:** the full suite and the CLI scenarios. Codex's 167/167 and 28/28 results are unchanged, and none of my concerns can be settled by existing tests.
- **Not done:** no benchmark, no live GET, no file writes, no permission denials.
- **Static-only findings:** I can't write test files or run `node -e` in this profile. So F5-1 and R3-a below come from tracing the code, not from running it.

## 2. C-005: last offered slot per store/date

**Verified in the code:**
- **Terminal chosen before filtering.** `preferredSlotOffers` (`src/plan.ts:178-192`) picks the terminal slot from the full newest list, per JSON `[store, date]` group, by the latest start and then the latest end. This happens before the selectable, plan, attempt-cap and suppression filters (`engine.ts:477-481`).
  - A disabled, out-of-arrival or suppressed terminal therefore excludes its earlier siblings.
  - Unauthorized groups stay separate and are filtered out later.
- **Safe time comparison.** String comparison of times is safe because `observe.ts:56` requires HH:MM. A malformed or duplicate slot makes the whole list unrecognized (`observe.ts:104-107`), so a terminal can't be silently dropped.
- **Send-time check.** `authorize` re-applies the terminal rule to the newest list even when the old ref still exists (`engine.ts:227`), then cancels and re-decides.
- **Validation.**
  - Unsupported selector values are rejected.
  - Dates must be strictly ascending, and the priority must be date-first (`plan.ts:126-131`).
  - The engine validates its frozen, hash-bound copy and refuses the `naive-remembered` benchmark policy (`engine.ts:131-135`).
- **No widening.** There is no fourth date and no unauthorized store, and an omitted selector keeps the hash and old behaviour (protected cases).
- **Unknown results.** An unknown result stays pending. On restart, the open choice is reconciled and never resent.
- **CLI scenario** `last-slot-three-dates` (`scenarios.ts:88-112`) matches the claim: day 1 last slot refused, then day 2 last slot from the seq-2 list refused, then day 3 last slot from the seq-3 list accepted, then advance to the endpoint. The checks require 0 submits, 0 stale refs, at most 1 in flight and no abort. In this script, every refused terminal stays in the fresh list, marked disabled.

### F5-1 (material): a refused terminal slot missing from the fresh list makes an earlier same-day slot eligible

Grouping looks only at the current list, and the engine keeps no per-store/date memory. So if the site drops a refused slot from the next list instead of marking it disabled, the earlier slot on that date becomes the new terminal. That breaks C-005 criterion 2 ("a disabled or refused terminal slot must not silently authorize an earlier slot on that date") and the user's intended order: day 1 last, then day 2 last.

Whether Apple drops or disables refused slots is unknown (U05). Both the protected cases and the CLI scenario only test the disabled form.

The traced path:
1. `#onSlotRefused` suppresses only the refused key (`engine.ts:697-712`).
2. The fresh list goes through `#onList` and then `#decide`.
3. `preferredSlotOffers` now sees E1 as day 1's terminal.
4. E1 is selectable, inside the plan and not suppressed, so it wins on date-first ranking.

**Reproduction** (uses the protected file's helpers; traced, not run):
```ts
const d = driver({ plan: lastPlan() }); d.feed({ type: "start" });
const first = dispatches(d.feed(pageEv(page(1, [[E1, true], [L1, true], [E2, true], [L2, true]]))), "chooseSlot")[0]; // L1
assert.equal(send(d, first).send, true);
const next = d.feed(resultEv(res(first.opId, "rejected", { code: "slot-full", slotRefused: true,
  freshList: page(2, [[E1, true], [E2, true], [L2, true]]) })));   // L1 omitted, not disabled
assert.equal(dispatches(next, "chooseSlot")[0]?.slotKey, key(L2)); // traced current result: key(E1)
```

**Accepted when:**
1. After a store/date terminal has been explicitly refused in this run, a later list that omits it does not make an earlier slot in that group eligible. The run moves on to the next authorized terminal, or stays within its refresh/exhaustion bounds, and never reports "none".
2. This memory is rebuilt from the durable refusal records on restart.
3. A later trustworthy list that offers that terminal again, or a later slot, may make it eligible (R05).
4. Codex and the user decide, document and test whether a terminal that disappears before we click (no refusal) uses the same rule.
5. The protected cases stay unchanged. New tests and a CLI scenario cover the "refused and omitted" case.

### C-005 nits and limitations

- **N5-1:** When the policy excludes every offer on a date (for example, the terminal is outside the plan's windows or arrival time), the diagnostics only say `no-eligible` / `有限刷新次数已用完（no-eligible-slot）`. They don't say that the last-slot rule excluded earlier slots, which R10 requires. `check-plan` also doesn't warn that windows ending before a store's real last slot make that date impossible.
- **Completeness:** "Terminal" assumes the recognized list is complete for each date. The mock contract has no completeness signal, so a real adapter must establish this (U02–U05).
- **Real dates:** relative real-date binding is unimplemented and **not approved**. The fixed fake dates don't show it.
- **Coverage gap:** I could not line-diff `engine.ts` against R3 without git. I reviewed the constructor, `authorize`, list/decide, resolve/refusal and replay entry paths, not every line.

## 3. C-003 R3: journal I/O and lock cleanup

**My own code (consistency check only):**
- The quota-interrupted `readJournal` edit in `journal.ts` was kept byte for byte. It does one read with no `existsSync` race:
  - `ENOENT` maps to `missing`;
  - any other error maps to `unreadable` with a bounded `errorCode`;
  - nothing is retried and no partial records are returned;
  - chain, allowlist and plan-binding validation are unchanged.
- The R2 orphan check and task-wide evidence order are intact.

**Codex's takeover (independent review):**
- `evidence()` catches anything unexpected as `evidence-unverifiable` with only an error code. It is never trusted or treated as empty. Unreadable journals are named `runs/<id>/journal.jsonl 无法读取（CODE）`, with `corrupt:false`.
- `open()` releases the site and the lock on task-load, mock-site and run-load failures, and reports only the stage and code.
- `acquireOwnership` closes its own server if an owner-record read or write fails.
- `release()` closes the pipe even when writing `owner.json` fails. The record then stays unclean, which is correct.
- `editPlan` describes evidence problems accurately, and keeps the existing warning only for a real submit record.
- Start, recover, arm and send-time checks still use fresh evidence. `beforeSend` throws before `authorize` or any port call.
- No fresh identity is created after a partial rollback (`store.load` leftovers refusal). Quiesce, late replies and unknown-submit reconciliation (runner and engine) are unchanged.
- All 4 protected cases and the 6 implementation cases pass.

### R3-a (Low, not blocking): end-of-run refresh can reject the loop promise

`#launch`'s `.finally` calls `#refreshLastRun()` without a guard (`task-app.ts:364-368`). If `task.json` becomes unreadable during a run:
1. `beforeSend`'s `doc()` throws. This is safe: nothing is sent.
2. Then `doc()` inside `.finally` throws again, so `#loop` rejects.
3. In the CLI app nothing awaits `#loop`. Under Node's default behaviour, an unhandled rejection ends the process abnormally; the OS frees the lock and `owner.json` stays unclean.
4. If `close()` is already waiting on `idle()`, it rejects before `site.close()` and `lock.release()`, so this process keeps the lock until it exits.

**Reproduction** (traced): `openApp` with a `beforeSend` that, on the first dispatch, renames `task.json` to `task.json.kept` and then creates a `task.json` directory; `start()`; `await app.idle()` rejects with `TaskStateUnavailable`.

**Accepted when:**
- the loop promise never rejects;
- a bounded Chinese `loopError` names `task.json`;
- 0 mutations are sent and the original bytes are kept;
- `close()` resolves and `readOwnerStatus` returns `gone`.

### Nits

- **N3-1:** Blockers based on `RunInfo` (`task-app.ts:229, 240` and the `recover()` re-read) show the raw `unreadable`. They name neither the file nor the guidance. This only happens if the journal fails on one read and succeeds on the next.
- **N3-2:** The engine card shows raw `UNREADABLE` (`view.ts:9`). The Chinese ledger banner still gives an actionable cause.
- **N3-3:** For `evidence-unverifiable`, `render.js` says "文件可读" ("the file is readable"), which isn't established. For ledger I/O errors, the probe says "无法解析" ("cannot be parsed").
- **N3-4:** `loopError` and HTTP 500 errors still pass raw exception messages through to the local UI. These can contain local paths.

### Management

- M-1 is fixed: paths must be canonical relative, traversal is rejected, the physically resolved path must be in scope, and the SHA must equal the fingerprint.
- Reporting of unlisted files is optional and I checked that separately.
- T-1's provenance wording now matches the evidence: a 20:19 check, the blob `2727…` and immutable manifests.

## 4. Conclusions

- **C-003 offline application:** I agree to the current bytes for this bounded milestone. That covers:
  - Codex's earlier eight takeover repairs;
  - the R3 completion and its six implementation cases;
  - the management fixes;
  - my independently tested R2 fixes and journal edit.

  R3-a and the nits are tracked follow-ups, because no mutation becomes possible and evidence is preserved. Plans without the selector behave as before.
- **C-004 bounded read-only preflight:** my agreement stands. The bytes are unchanged.
- **C-005 offline last-slot policy:** **withheld** until F5-1 is reproduced and repaired.
- **Real readiness: none.**
  - Duo U02–U06, the real configuration and the date binding are unverified.
  - Holds, acceptance, refusal, orders and payment are unverified.
  - The Duo catalog and Pro guest evidence don't establish slot mechanics.
  - No real mutation is authorized.

**What I didn't re-read this turn:**
- the baseline prompt (read earlier in this session);
- the full `docs/status.md`;
- `C-005-verification.json`, `C-003-R3-verification.json` and `C-003-R3-management-scope.json`;
- the superseded `C-003-REVIEW-R3.md` task sheet.

**Usage:** about 22 turns and about $2.7 of the $6 budget. No quota, time or permission failure.

**Checkpoint:** Codex reproduces F5-1 (and optionally R3-a) using the snippets above, returns a repair task, then issues a new manifest for a C-005 re-review.
