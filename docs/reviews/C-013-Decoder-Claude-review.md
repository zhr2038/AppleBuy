# C-013-DECODER-REVIEW delivery report

I've now read the whole parser and transport, and found no P0, P1 or P2 code defect. Neither approved command ran, though: Bash was denied. The verdicts below rest on source reading, not on test runs from this task.

## Candidate identity
- **Manifest:** `docs/reviews/C-013-R2-candidate-manifest.json`
- **Expected identity:** 123 files, SHA `dbf68f221619e94d002aadd4c7adb3701dde0f22077ad470fed9703dfcca9732`.
- **Not re-verified in this task:** the manifest check could not run (see below).
- **No bytes changed:** I made no writes or edits.

## Commands
| Command | Result |
|---|---|
| `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-013-R2-candidate-manifest.json` | **Not run.** The tool said: "Permission to use Bash has been denied because Claude Code is running in don't ask mode." |
| `node --test "test/checkout*.test.ts" "review/c012*.test.ts" "review/c013*.test.ts"` | **Not attempted.** Bash was denied at the tool level, and I did not retry. |

The earlier 393/393 runs on these same bytes (mine and Codex's) are prior evidence only, not results from this task. My conclusions below come from reading the source and are unexecuted.

## What I read
Every file came back complete in one response, so no line ranges went unreviewed.
- `web/checkout-connector/page-program.js` lines 1–203, the whole file.
- `web/checkout-connector/chrome-port.js` lines 1–40.
- `web/checkout-connector/manifest.json` lines 1–10.
- Test files, all complete:
  - `test/checkout-page-program.test.ts` (1–72)
  - `test/checkout-chrome-port.test.ts` (1–46)
  - `test/checkout-r1-public-configuration.test.ts` (1–291)
  - `review/c012-native-selection-findings.test.ts` (1–57)
  - `review/c013-observed-auth-route.test.ts` (1–28)
- Review documents: `C-013-R2-bounded-agreement.md`, `C-013-R2-Claude-cross-review.md` and `C-013-R2-cross-review-verification.json`.
- `job.js` lines 170–234, plus targeted searches of `web/checkout-connector/` to check how the parser's output is used.

**Reused from earlier in this session, not re-read:** `docs/requirements.md`, `control.js`, the rest of `job.js`, `owner.js`, and the C-013 functional and cancellation tests.

**Not read:**
- `open.html`
- the other `test/checkout*.test.ts` files the approved test pattern would pick up (for example, I've only seen lines 1–45 of `checkout-job.test.ts`)
- `web/chrome-connector/*` (the older Pro-SKU collector)
- historical patch bodies

## What I checked in the source
| Area | Finding |
|---|---|
| Official HTTPS host and path guard | The guard runs both in the page (`page-program.js:8-10`) and in the transport (`chrome-port.js:2`, `:6`). Only https on `www.apple.com.cn` or `secure\d*.www.apple.com.cn` is accepted, on the listed `/shop/` paths. Lookalike hosts and http are rejected. |
| Top frame, current document, host grant | Observation targets the top frame only (`frameIds:[0]`) and requires the reply to come from frame 0 with a document id (`:9-10`). Actions target the exact observed document; any other reply is treated as unknown (`:19-25`). Every observe and act first checks the tab URL and the origin grant. The extension manifest requests no persistent host access and blocks all network connections from its pages (`connect-src 'none'`). |
| Private values kept out of diagnostics | Pickup details are only ever written into fields (`:184-191`); error reasons are limited to letter-only words (`:200`) and cut to 60 characters by the transport. No cookie, storage or fetch use (tested at `test/checkout-page-program.test.ts:29`). |
| Item, quantity, extras, price, fulfilment, store proof | The product line must match exactly. Quantity must have one consistent source. There must be exactly one total. Store proof needs an exact checked choice or labelled value, with any conflict leaving it unproven. A pickup control on the page outranks descriptive text (`:37-66`). At the final step the job also requires merchant evidence of no extras, a total equal to the recorded quote, and a slot summary equal to the accepted slot (`job.js:197`). |
| No trade-in / no AppleCare+ dependency | Exactly one matching choice is required. Only the next enabled choice is clicked, and only after a fresh observation. Any other selected extra blocks (`:86-108`, `:150`). |
| Date/time completeness and the selected value | The page must show exactly one date source and one time selector. The list counts as complete only if every option is the placeholder or a time range. A date must be selected. Disabled times are captured but never chosen (`:116-130`, `:164`). |
| Controls replaced or disconnected | Every click helper checks the control is still connected. Slot selection checks that the selector is still connected and is the only live one after the change (`:146-147`, `:166`, `:176-182`). |
| Safety after a slot change | A one-step follow-up change is caught by a page snapshot taken before and after the wait (`:170-182`). It has a narrow window (P3-B below). |
| Disabled controls | No path clicks a disabled control (`:22`, `:34`, `:147`, `:157`, `:161`, `:164`, `:179`). |
| Duplicate commands and touched/untouched truth | A repeated command id is reported as touched and therefore unknown. `touched` is set immediately before the first page change. The transport only accepts a positive "untouched" reply (`chrome-port.js:24`). There is an ordering gap (P3-A below). |
| Receipt vs independent detail lookup | A receipt requires the `/shop/checkout` path, unpaid text, a hashed order number and verified purchase. Lookup opens only the link shown on the receipt. The detail page must show the same hash, verified purchase and a slot summary. The order list page is excluded. |
| Unrecognised, error and sign-in pages vs stock or refusal | `feedback` is always null; there is no refusal-text catalogue and no stock claim. Sign-in, consent, processing and unknown pages are never treated as a verified step. |
| No raw HTTP | The parser and transport make no fetch or XHR calls. |

## Defects
**No P0, P1 or P2 code defects found.** Each P3 item below is a hardening point that no production caller currently reaches, or that downstream checks already cover. All reproductions are synthetic and **not executed**.

**P3-A. The duplicate-command memo is checked after the evidence comparison.**
- **Where:** `page-program.js:144-145`.
- **Reproduction**, using the `fixture` from `test/checkout-page-program.test.ts`:
  1. Bag page, with `btn[0].onClick=()=>{nodes[0].textContent='iPhone Duo 512GB 星光白色'}`.
  2. Build one command: `cmd={id:'dup',taskId:'task',authorized:true,structured:true,expected:JSON.stringify(await read()),action:'checkout'}`.
  3. Call `fn(plan,cmd)` twice.
  4. By reading, the second call returns `{delivered:false,touched:false,reason:'OperationEvidenceChanged'}`. The transport would pass that through as "positively untouched".
- **Expected:** check the memo first, as the sign-in branch already does. The result should be `touched:true`, `OperationAlreadyDelivered`, which the transport reports as unknown.
- **Reachability:** none through `PurchaseJob`. It uses a new id for every write-ahead (`job.js:208`) and never re-sends after a lost reply (`job.js:218`).

**P3-B. The check after a slot change only sees one microtask step.**
- **Where:** `page-program.js:175`.
- **Reproduction**, using the c012 fixture:
  1. Set `f.time.onEvent=()=>{Promise.resolve().then(()=>Promise.resolve().then(()=>{f.texts[2]='总计：RMB 99,999'}))}`.
  2. Run `f.choose()`.
  3. By reading, the result is `delivered:true` and `button.clicks===1`. The second step runs after the comparison.
- **Expected:** no Continue click, and `touched:true`. A `setTimeout(0)` change also escapes, which is the already-known gap about slot validation that completes later (P2-3).
- **Impact:** limited. The final check compares the page's slot summary and total against the accepted values (`job.js:197`), so no wrong order results. An attempt may be wasted.

**P3-C. The raw order number appears in plain form.**
- **Where:** `orderDetailLink` and `path` contain the raw order number (`:81`, `:135-136`; see `test/checkout-page-program.test.ts:71`). The hash elsewhere is an unsalted SHA-256 of a short identifier, which can be reversed by trying every value.
- **Usage:** `job.js` and `control.js` never mention either field (search confirmed); only the transport uses the link, in memory.
- **Expected:** keep the link private to the transport, and use a keyed per-task hash.

**P3-D. The page doesn't require verified purchase before a date click.**
- **Where:** `selectDate` lacks the `purchase.verified` check (`:160`) that `chooseSlot` has.
- **Coverage:** the job enforces it first (`job.js:178`).

**P3-E. A wait opens between evidence and action when an order number is shown.**
- **Where:** `await crypto.subtle.digest` (`:134`) runs before any action whenever exactly one order-number label is visible, so page scripts can run in between.
- **Reachability:** no page that accepts an action is expected to show an order number.

## Real Apple page shapes not yet verified
Each of these fails safe in the current code. None should prompt a relaxed check without authorised real observation.

1. **Continue disabled until a time is picked.** If `继续填写取货详情` starts disabled, the page is never recognised as the slot step (`:74`, which counts enabled buttons only). With a pickup choice present, the flow waits and ends at NOT_READY. Without one, the page reads as UNKNOWN.
   - Reproduction: c012 fixture with `f.button.disabled=true`.
2. **Placeholder text.** The exact `可选时段` placeholder (`:129`) is unverified, as is a placeholder inside the date selector (P2-1).
3. **Store labels.** A store radio label that includes an address or availability text leaves the store unproven (`:52`).
4. **Final review step.** A terms checkbox, or `立即下单` disabled until it is ticked, would prevent the review step from being recognised.
5. **Receipt and detail URLs.** The receipt must be exactly `/shop/checkout`, and the detail link must be a single path segment.
6. **Extra product text.** Repeated product titles or AppleCare+ marketing text mark extras as present (P2-2).
7. **Screen-reader text.** Text hidden visually by clipping or off-screen positioning still counts as visible.
8. **Sign-in shapes.** A sign-in form inside an iframe, and the bare `/shop/signIn` page (P3-4), are unresolved.
9. **Merchant behaviour not observed.** Real refusal text, slot validation that completes later (P2-3), full signed-in summaries and payment-dependent dates.

**Earlier usability issues, unchanged and not re-reviewed:**
- the public-validation lock rejection;
- Pause/Stop reaching only their own control page;
- the older Pro-SKU collector gap (not read, not fixed).

## Denials, caps and quota
- **Permission denial:** Bash, on the first approved command. The second was not attempted.
- **No quota, session-limit or 429 error.**
- **Usage:** about $1.3 of the $3 cap and about 14 of 24 turns.
- **Time:** elapsed time was not measured against the 720-second limit.
- **Nothing else done:** no writes, other agents, network or browser use, installation, grants or merchant actions.

## Verdicts
- **PARSER_SOURCE_REVIEW: COMPLETE.** No P0, P1 or P2 code defect found; P3-A to P3-E and the page-shape assumptions are listed above.
  - **Conditions:** this rests only on source reading. Neither approved command ran because Bash was denied, so it is not proof from tests.
  - **Acceptance:** Codex owns acceptance and should reproduce P3-A and P3-B.
  - **Scope:** this review does not approve the Apple page contracts.
- **REAL_PURCHASING_READY: NO.**
  - The extension is not installed or granted access.
  - Apple's current secure pages, real refusal behaviour, async slot behaviour and timing have not been observed.
  - The one-Pro authorisation is used up, and there is no new authority for a bag, slot, order, payment or Duo.
  - A clean review allows preparing a concrete extension-access confirmation only. It does not authorise installation or an order.

**Checkpoint to resume from:** the read-only review is done. The open step is running the two approved commands with Bash permission, then Codex reproducing P3-A and P3-B.
