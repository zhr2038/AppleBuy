# C-013-R3 independent review (Codex)

The two reproduced decoder defects are repaired on the delivered candidate: 125 files, SHA256 `add8b1c98c7f3cff2fe1b0375c8a80b556c9dce3076af90243e8f6f1b2b496dd`. This is an independent offline result; exact-source bilateral agreement is still pending. REAL_PURCHASING_READY remains false.

Codex read the complete current page program, new implementation test file and report, and inspected the actual diff against the saved pre-dispatch bytes. Only `web/checkout-connector/page-program.js` changed among the 124 input files. Claude added `test/checkout-c013-decoder.test.ts` and its delivery report. All 28 protected review files and every existing implementation test stayed byte-identical to the input. The two prior Codex VM timer-global additions stayed unchanged; their original assertions were not altered. Codex made no product implementation changes in this recovered cycle.

Independent commands on those final bytes:

| Check | Result |
| --- | --- |
| `node --test review/c013-decoder-findings.test.ts` | 6/6 pass, zero failures/cancelled/skipped/todo, 98.7889 ms |
| `node --test "test/*.test.ts" "review/*.test.ts"` | 407/407 pass, zero failures/cancelled/skipped/todo, 5986.3305 ms |

Known delivery ids are now consulted before the changed-expected comparison, so the reproduced duplicate cannot become positively untouched or click twice. A genuinely new stale command still touches nothing. Native slot selection now waits a task boundary, then checks the same connected selected option, date, item/quote/store, complete lists and the same enabled Continue element immediately before clicking. Nested microtasks, the protected zero-delay timer changes, control replacement, busy state and stale-boundary cases stop as touched/unknown. Production job/transport tests preserve pending evidence across restart; the positive control proceeds exactly once.

The event-boundary tests use FAKE Node VM pages. Chromium ordering between MAIN and ISOLATED world timers has not been exercised by an installed extension. Longer timers, timer chains queued after the boundary, network/server validation and real Apple refusal/acceptance contracts remain unverified. The 2000 ms limit is a local staleness choice. No reservation, real-site speed or complete merchant adapter claim follows from these tests.

The actual invocation ended successfully, on `claude-opus-5-5`, with the CLI requesting `xhigh`, 27 reported turns, no denials and confirmed owned-process cleanup. Its structured usage appears cumulative for the resumed original session and is retained in the receipt. The implementer's approximate incremental dollar figure is not accepted as verified usage. Neither successful completion nor that usage field is evidence of a new provider quota error, so the conditional shutdown trigger has not fired.

Next: precise read-only agreement on this manifest, then the concrete Chrome installation/permission dependency and an authorized offline native-browser check. Existing real page-shape, SKU and asynchronous contracts stay explicitly unverified. No new bag, order, payment, real pickup hold or Duo purchase authority exists.
