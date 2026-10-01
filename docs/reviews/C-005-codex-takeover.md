# C-005 tested candidate — last offered slot per authorized date

Codex implemented this increment under the user's explicit quota exception. The actual Opus 5.5 / xhigh C-003-R3 call exhausted quota at 2026-10-01 21:48:51 Asia/Shanghai, reporting reset on October 2 at 01:20. No new C-005 Claude invocation or agreement has occurred. All current Codex business changes still require actual Claude review; tests and task sheets do not substitute for it.

Source identity: **58 files**, `docs/reviews/C-005-source-manifest.json`, SHA **`b0e5696aeeb4218bbf809b89905ee25b3fc8340efda7a216ecb802b75ad00b0d`**, based on pushed parent `a94e29eb786750a9ec52f31398c4ba6094eaf842`. The previous R3 56-file identity remains historical. Exactly four existing product files changed: `src/plan.ts`, `src/engine.ts`, `src/mock/scenarios.ts`, `src/cli.ts`; two source files added: the clearly fake last-slot plan and protected reviewer cases. No entry/browser/site contracts or formal authorization capability were expanded.

An optional validated `slotSelection: "last-offered-per-store-date"` selects the chronologically last offered start/end in each store/date group of the complete latest recognized list. This happens before selectability, attempt limits, refusal suppression or arrival/window filtering. A terminal offer that cannot be chosen excludes earlier offers for that date; it does not silently authorize earlier attendance. Unauthorized groups are still filtered by the existing plan constraints. The rule requires ascending allowed dates and date-first priority. Missing option preserves the original plan hash and earlier-slot behavior. Unsupported options block. The intentionally stale-reference benchmark policy cannot execute this last-slot plan.

The engine's immutable plan hash binds the rule. Sending rechecks the newest list even if the earlier prepared option's ref remains present. Accepted or unknown already-sent operations retain their existing reconciliation semantics; a later list cannot silently cause a second operation. The explicit date set is never extended by the policy. Real relative-date binding is not implemented by this increment: a future verified adapter must bind the actual initial offered dates before starting and retain that authorization across refresh/restart. No assumption of three real dates is made.

Actual checks (China time):

- **22:44:12:** protected criteria written before business changes ran against the original source: 12 cases, **4 pass / 8 fail**. The failures reproduced earlier selection, incorrect disabled/refused/arrival fallback, stale prepared-choice authorization, silent malformed option acceptance, mutable caller policy and stale benchmark compatibility.
- **22:56:12:** the same byte-protected cases passed **12/12** after implementation. All 16 previous protected files plus this new criteria file stayed identical, total **17**.
- **22:56:50–22:56:56:** actual full Node suite **167/167**, zero failed/skipped/cancelled.
- **22:56:51–22:56:54:** actual CLI **28/28 declared scenarios** matched, external network attempts **0**. Existing 27 scenarios remain covered.
- **22:57:38:** actual CLI read `examples/plan.last-slot.fake.json` and ran `last-slot-three-dates`: day-one 17:30–18:00 refused, newest seq 2 day-two 17:00–17:30 refused, newest seq 3 day-three 16:30–17:00 accepted, then one advance to `REHEARSAL_ENDPOINT`. Current refs were `r1-4`, `r2-2`, `r3-0`, submits **0**. Scenario checking also enforces zero stale refs, at most one in-flight call, no runner abort and exact chosen sequence. All dates, stores, times and responses here are fictional, not Apple evidence.

Commands:

```powershell
node --test review/last-slot-policy.test.ts
node --test "test/*.test.ts" "review/*.test.ts"
node src/cli.ts rehearse --all --quiet
node src/cli.ts rehearse --scenario last-slot-three-dates --plan examples/plan.last-slot.fake.json --json
```

The public [verification receipt](C-005-verification.json) contains actual bounded results. Raw outputs and the private customer draft remain ignored locally. Existing browser process 38708 still serves the historical R3 candidate; no updated C-005 browser demonstration is claimed. No new performance claim or unchanged benchmark rerun was needed for this policy increment; historical R2 measurements remain historical. Node's native type erasure and runtime tests are not a TypeScript static type check.

Next: actual English `C-005-REVIEW` in the exact existing Claude session after availability returns, exact Opus 5.5 / Extra, same directory, read-only bounded profile. It must review this increment plus all unresolved R3/Codex takeovers. Codex will reproduce findings, return fixes to available Claude and inspect actual results before agreement. C-004 retains prior bounded read-only agreement; C-003 and C-005 have no final agreement. Real Duo checkout/date/slot/hold/refusal/acceptance/confirmation U02–U06, official private-plan bindings and real authorization remain absent. Overall automatic real purchase is still incomplete.
