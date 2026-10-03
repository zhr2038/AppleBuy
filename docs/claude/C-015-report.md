# C-015 delivery report (Claude, implementer; resumed under C-015-CONTINUE)

Session `[original Claude session retained privately]`, model `claude-opus-5-5`. This is an implementer report, not self-approval. Codex owns independent acceptance and a new exact manifest; a bilateral exact-source agreement is still required. REAL_PURCHASING_READY remains **false**.

## Starting point
- `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-015-quota-candidate-manifest.json` → `ok`, **126 files**, `667dc062d25e5bf653279ffdcd71375723685063c1088c1fbe877e50adfba691`, no mismatches. This was run before any edit in this resumed cycle.
- The only prior change was my quota-interrupted preamble edit:
  - a memo-aware structured `report` helper;
  - the `internal` parameter;
  - a header comment.

  The promised re-entry did not exist yet, and the four protected failures remained.

## Root cause
`merchantDocument` decoded the whole page synchronously and then awaited `crypto.subtle.digest` for the order reference. After that, the command branch compared `expected` with the **pre-await** decode and clicked. Anything the page changed during the digest was invisible to the decision.

The chooseSlot continuation had a related gap. It awaited a nested `merchantDocument(plan)` read and then gated on the fingerprint at a later microtask. The fingerprinted state and the semantically decoded state could therefore differ.

## Design
**1. Hash, then decode again: re-entry.**
- When a single order reference is shown and its hash is not yet known, the program awaits the digest. It then returns `merchantDocument(plan, command, {hashes})`.
- That second pass re-reads the URL, the AUTH route, `main` and every field from the current document. It takes the hash from the cache synchronously.
- The second pass contains **no await before any decision**. Every action (submitOrder, continuePayment, checkout, fillDetails, selectDate, chooseSlot's first write, configure and the others) therefore decides in the same synchronous run as the decode it uses.
- Reads return only that final decode, so an observation is one coherent snapshot. Its hash belongs to the label shown in that snapshot.
- At most one digest is awaited per invocation; the second pass never awaits.

**2. A reference that changes while it is hashed is not current evidence.**
- A read returns `{phase:'UNKNOWN', reason:'order-reference-changed'}`.
- A command gets a structured, memo-aware report: untouched `OperationEvidenceChanged` for a new id, touched `OperationAlreadyDelivered` for a delivered id.

**3. Delivery truth survives early, AUTH and unsupported exits.**
- A structured command that reaches the unsupported-URL, missing-main or order-login route receives `{delivered:false, touched:prior, reason}`. `prior` is true only when the id is already in the delivered memo.
- Before this change, the unsupported-URL and missing-main exits returned a read object, which ChromePort treated as unknown.
- Non-structured commands and plain reads behave as before. The AUTH logic is unchanged; it is only factored into the shared helper.

**4. Slot continuation re-enters as well.**
- After the C-013-R3 change-task boundary, chooseSlot re-enters with the selected element, the captured Continue, `main`, the pre-change decode, the after-change fingerprint, the change time and the 2000 ms limit.
- The re-entered pass decodes the current document. It applies the same gate as R3 plus a same-`main` check, and clicks in the same synchronous run.
- The selection was already written, so any failure here is touched.
- The duplicate-id and staleness behaviour from R3 is unchanged.

**Why not remove the digest or reject reference-bearing pages?**
- `crypto.subtle.digest` is asynchronous only, and a hand-written SHA-256 would add unreviewed code.
- Rejecting reference-bearing pages would also break the ORDER_RECEIPT and ORDER_DETAIL reads that final reconciliation depends on (`lookupOrder` needs `orderRefHash`).
- Re-entry keeps those reads and closes the gap for every action.

**Which branch the protected test exercises.** With these bytes the digest still runs in the first pass, so the protected test's injected mutation runs. The assertions it exercises are the **drift branch** (`f.mutated === true`), not the "no-drift alternate" branch.
- This is inferred from the code path. The protected test does not print the flag.
- My own tests assert `mutated === true` for the same mechanism, and that one digest happens per invocation.

**Unchanged:**
- `chrome-port.js`, `job.js`, controller, permissions;
- all 29 reviewer files and every existing implementation test;
- plan and merchant checks, final-grant checks, the no-trade-in/no-AppleCare dependency, the first-three-date terminal floors, unknown-result persistence and the no-repeat/restart safeguards.

## Changed files
| File | Change |
|---|---|
| `web/checkout-connector/page-program.js` | Memo-aware structured `report` for structured commands on early, AUTH and unsupported exits. Hash-then-re-enter for the order reference; changed reference is UNKNOWN or untouched. Fingerprint helper shared. chooseSlot continuation re-enters and gates synchronously. Header lines. |
| `test/checkout-c015-evidence.test.ts` | New: 7 tests, FAKE only. |
| `docs/claude/C-015-report.md` | This report. |

## New implementation tests (FAKE)
1. **Drift branch on the final click.** 14 drifts injected inside the digest: price, quantity, store, fulfillment prose, extras marker, payment unchecked, slot time, terms link removed, submit disabled, busy, AUTH route, unsupported route, main removed and final-grant expiry.
   - Each asserts that the drift ran, that exactly one digest happened, untouched with the specific reason, and 0 clicks.
2. **Adjacent paths.** Payment continuation and bag checkout, each with drifts in price, quantity, store and AUTH route, all untouched with 0 clicks. Positive controls on review, payment and bag click once with one digest.
3. **Delivered id.** After one real FAKE delivery, a resend with AUTH, unsupported route, missing main, changed reference, price or busy drift is touched `OperationAlreadyDelivered`. The click count stays 1.
4. **Reference changed while hashed.** A new-id command is untouched; a read is UNKNOWN `order-reference-changed`.
5. **Observation coherence.**
   - A read with price drift during the digest returns the current total (99999) and the hash of the label it shows.
   - A plain read returns the expected hash.
   - A page with no label has no hash.
6. **Transport.**
   - Through real `ChromePort.observe`/`act` with a FAKE `executeScript`, drift during the digest gives `{delivered:false, touched:false, reason:'OperationEvidenceChanged'}`.
   - A delivered id resent under AUTH drift gives `MutationResultUnknown`, with no second click.
7. **Slot continuation decode-to-decision.** The scenario:
   1. the change handler sets a wrong price;
   2. an earlier zero-delay timer restores it;
   3. a microtask queued during the post-boundary scan sets it wrong again.

   Result: no Continue, touched `SlotEvidenceChangedAfterSelection`, and the queued microtask is shown to run after the decision. A positive control continues once.

   I reasoned that the pre-change bytes would have clicked here. That was **not executed** against them.

## Commands (exact approved strings, no prefix)
| Command | Result |
|---|---|
| `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-015-quota-candidate-manifest.json` | before edits: ok, 126, `667dc062…a691`, no mismatches |
| `node --test "review/c015-async-evidence.test.ts"` | after the parser repair: **6/6 pass**, 87.6037 ms |
| `node --test "test/checkout*.test.ts" "review/c012*.test.ts" "review/c013*.test.ts" "review/c015*.test.ts"` | final bytes: **149/149 pass**, 0 fail/cancelled/skipped/todo, 381.5606 ms |
| `node --test "test/*.test.ts" "review/*.test.ts"` | final bytes: **420/420 pass**, 0 fail/cancelled/skipped/todo, 5985.1658 ms (413 input + 7 new) |

In the previous, quota-ended invocation only the input-manifest command ran. The manifest was not re-run after edits; it is expected to mismatch now, and Codex creates the new one.

## R01–R10 mapping
| Requirement | Relation |
|---|---|
| **R04** | Local selection is still not a reservation. Continue is sent only from a current decode of the selected terminal. |
| **R05** | No stale repeat. A drift becomes untouched (before any write) or unknown (after one), never a refusal. |
| **R06** | A changed reference, route, main or evidence is unknown or untouched, never acceptance, refusal or no-stock. |
| **R07** | A delivered id is touched on every exit, including AUTH, unsupported and missing-main. Nothing is resubmitted. |
| **R08** | Pending and unknown truth is preserved by unchanged job semantics. |
| **R09** | FAKE only. No order, payment or slot occupancy. |
| **R01–R03, R10** | No condition relaxed. Plan, merchant and final-grant checks are unchanged. |

## Limitations and unknowns
- **No Chromium evidence.** All evidence is from a Node VM fake. There is none for real Chromium ISOLATED-world scheduling, `crypto.subtle` timing, or whether a real actionable Apple page shows an order-reference text.
- **Cost of a reference.** A page with a reference costs one extra full decode per call. Real-site latency is unmeasured.
- **A changing reference stops.** A reference that keeps changing gives UNKNOWN, which is conservative.
- **`internal` parameter.** It is meant only for re-entry. ChromePort passes two arguments, and JSON arguments cannot carry DOM references or Maps. A malformed external third argument would throw and be treated as unknown, never as untouched.
- **Still unverified:** positive-delay timers and network or server validation after the boundary, Apple refusal, date and order-detail contracts, and installation, host grant and speed.
- **Still open:** the decoder review's P3-C, P3-D and P3-E, and the P2 page-shape hypotheses.

## Usage, denials and caps
- **Permission denials:** none.
- **Quota or 429 errors in this resumed cycle:** none.
- **Cost:** the last in-session budget notice before this report showed about $1.71 of the $5 CLI cap. That is a harness notice, not the structured terminal result.
