# C-012 independent reproduction and repair requirements

Codex independently exercised production decoder, controller and ChromePort code under synthetic DOM/port evidence. The actual merchant was not contacted. The tested immutable implementation is 115 files, SHA256 `6932a7a5fb3858c93ef566c4403690860aed13081d5f9239919dd5dfb17c1df0`, commit `eb7a5e4a443bb1243933ee87a716024833a03383`.

The protected test file `review/c012-checkout-findings.test.ts` has ten independent assertions for correct behavior. The pre-fix command `node --test --test-reporter=tap review/c012-checkout-findings.test.ts` returned **10 tests, 0 pass, 10 fail**. This confirms defects; these failures cannot be dismissed by the earlier 312 passing tests. Full output is retained locally, outside Git.

| Finding | Independently reproduced behavior | Required result |
| --- | --- | --- |
| F-A, P1, two cases | A container naming allowed and disallowed stores, or a conflicting checked non-plan store plus matching prose, produces verified allowed-store proof. | Conflicting/ambiguous store evidence stays unverified before slot or later mutations. Only one unambiguous current enabled selected store or an exact labelled single value proves the store. |
| F-B, P1, two cases | Complete one bag/pickup progression up to the final-review human gate, with pending cleared. Return to VARIANT and resume, with or without controller restart. A second Add to Bag occurs in the same task. | A durable add-start record survives cleared pending entries, final-review handoff and restart. No later ENTRY/VARIANT can add again. |
| F-C, P2 | A delivered final with lost reply retains pending; expiry then prevents any read-only final lookup. | Expiry prevents new mutations while preserving bounded independent reconciliation. |
| F-D, P2 | One leading disabled date consumes the first-three freeze, excluding the third genuinely offered date. | Freeze initially enabled offered labels once, preserve the set across later refresh/restart, never roll to a fourth newly offered date. |
| F-E, P2 | A positive `{delivered:false,touched:false}` response retains pending and becomes permanent unknown. | Clear a positively proven untouched action durably, distinguish it from unknown/partially touched transport loss, and retain a bounded recovery rule. |
| F-H, P2 | Pausing during the final write-ahead saves `sent:true` although `act` never ran. | Preserve truthful known-not-dispatched state; a crash with uncertain dispatch remains unknown and cannot authorize a repeat. |
| F-I, P2 | ChromePort turns unknown merchant extras into false based solely on human grant. | Missing merchant proof stays unknown. Current page evidence must establish no extras independently of consent. Invalidate advance grants at human-intervention gates. |
| F-J, P2 | Two distinct equal quantity lines merge into quantity one and item verification succeeds. | Multiple line items/quantity fields cannot prove one item by deduplicating their text. |

F-B reproduction correction: Claude's specifically proposed redirect immediately after `checkout`, and AUTH while that checkout remains pending, did **not** produce a second addition in Codex's first reproduction. Existing pending reconciliation safely blocked those particular shapes. Codex then reproduced the actual defect after valid progression to REVIEW cleared pending, followed by a public-page return at the final-grant handoff. Both restart and same-controller cases fail. This correction is a narrower, verified defect, not agreement with an unrun example.

Public configuration is a separate actual observed defect: native no-trade-in then no-AppleCare unlocks Add to Bag, but the controller only schedules model/color/capacity. See `C-012-public-required-options.md`. Require production decoder/action/controller integration through that exact dependency, and a bounded public-configuration validation endpoint that stops before Add to Bag.

The repair must also provide observe-only execution in which `ChromePort.act` cannot send, allow expiry-safe read-only reconciliation with explicit human tab rebinding, and explicit retirement only of never-mutated tasks. Unknown or completed resource-mutation history cannot be erased. Keep all existing terminal/time, plan, owner, no-final-repeat and human authentication boundaries. Processing polling should have bounded elapsed-time limits without consuming the entire semantic action budget on waits.

Actual Apple refusal catalog remains empty and must stay empty until current authorized evidence exists. The observed Pro unpaid pilot says pickup timing is determined after payment. Missing independent merchant slot evidence must remain blocked rather than echoed into an unpaid confirmation. These real-contract gaps are not fixed by synthetic tests.

Verdict: **RETURN_C012_FOR_REPAIR**. The old C-010/C-011 bounded partial agreement is recorded separately. No C-012 final acceptance or real purchasing readiness is claimed.
