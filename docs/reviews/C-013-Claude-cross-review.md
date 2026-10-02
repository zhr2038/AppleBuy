# C-013-REVIEW verdict: exact current-source review (read-only)

**Identity reviewed:** 119 files, SHA-256 `6eba42936f8bf86e0a0f7d63e531e7799a5e8b002ea604a06566576065afb950`. I changed no files, used no network, browser or `.local` data, and invoked no other agent.

## 1. Commands and results

| Command (exact, approved) | Result |
|---|---|
| `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-013-candidate-manifest.json` | `{"ok": true, "files": 119, "sha256": "6eba4293…b950", "mismatches": []}` |
| `node --test "test/*.test.ts" "review/*.test.ts"` | 351 tests: 351 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo; 5884.2 ms |

- Nothing was denied in this task, and I ran no other commands.
- The suite may create fake state under `.local/test-runs`. I did not inspect it.

## 2. Scoped verdicts

| Scope | Verdict |
|---|---|
| **C-010 offline DOM** | **Bounded agreement (fake loopback only). No P0/P1.** The previously unread files are now read. All C-010 files are hash-identical to the C-010/C-011 manifest. One new P3 (C10-5) plus the prior C10-1 to C10-4. |
| **C-011 public collector** | **Bounded agreement as a read-only public-entry probe. No P0/P1.** It is unchanged. `popup.html` is read and its Chinese read-only text is consistent with `activeTab`+`scripting`. **The C11-1 Pro-SKU URL gap is NOT fixed**: `read-entry.js` hash `e5c17875…` is unchanged. C11-2 and C11-3 remain. |
| **Repaired C-012/C-013 source, controller and API** | **Bounded agreement on source only (offline, synthetic transport). No P0/P1 found.** The two earlier P1s (F-A wrong store, F-B second bag add) and Codex's F-C to F-M are resolved in source and covered by tests. The C-013 authentication gate is correct and narrowly scoped. Three P2s and six P3s below all fail closed and do not block bounded source acceptance. **Caveat: I wrote the R1 parts of `job.js`, `chrome-port.js`, `control.js`, `control.html` and most of `test/checkout-r1-public-configuration.test.ts`. My agreement is not independent approval of those parts. Codex's independent verification governs them, and Codex owns final acceptance.** |
| **REAL_PURCHASING_READY** | **NO.** See §6. |

The 351 passing tests and this scheduled review are not bilateral agreement by themselves. This verdict is my side only.

## 3. C-013 delta review (Codex: `page-program.js` and `chrome-port.js`)

I found the change correct:

- **Exact path only.** The allowlist adds only `signIn(?:\/orders)?`, on the same HTTPS host set (`chrome-port.js:2`, `page-program.js:9`). Optional host permissions in the manifest are unchanged.
- **AUTH reported before any DOM read.** `page-program.js:11-14` returns `AUTH`, `verifiedStep:false` before looking for `main`.
  - Commands get a structured untouched result, or a throw if the caller is not structured. `ChromePort` always sets `structured:true`.
  - Untouched results pass through `chrome-port.js:24`.
- **Login fields are never read.** The login fields live in a cross-origin `idmsa` iframe, and observation targets only `frameIds:[0]` (`chrome-port.js:9`).
- **Authentication is a human gate in the job, never "no stock" and never a purchase repeat:**
  - With nothing pending, AUTH stops the job (`job.js:9`, `:136`) as `NEEDS_USER`, reason `auth`.
  - With an action pending, the pending entry is preserved (`job.js:131`).
  - A start authorization is revoked at that gate (`job.js:50`).
  - If the order lookup lands on AUTH, the result is `unknown` (`chrome-port.js:35`), which leads to `NEEDS_VERIFICATION` with no resubmission (`job.js:117`).
  - The order-detail link pattern still excludes `signIn` (`page-program.js:131`).
- **Robust to the missing `purchase` field.** The AUTH object has no `purchase`. `job.js:129` and `chrome-port.js:13` handle that safely.
- **Boundary tests** (`review/c013…:14-17`) cover a lookalike host, HTTP, an extra suffix and an unrelated account path.
- **Codex's actual read-only check** (login page reads AUTH; Pro page reads VARIANT at ¥9,999) is used here only as Codex's stated evidence. It is not proof that the extension works standalone.

## 4. C-012/C-013 findings

### P2: fail-closed, but each is a real-use functional blocker that depends on the live contract

**P2-1: A slot page with no date preselected is a dead end.**
- **Where:**
  - `page-program.js:122`, `:125`: the list counts as complete only with exactly one selected date.
  - `page-program.js:118`: every option of a date `<select>` must parse as a date.
  - `job.js:161`: the job requires a complete list before freezing dates or selecting anything.
- **Effect:** `selectDate` (`job.js:166`) can only switch away from an already selected date. Radio dates with nothing checked, or a date dropdown with a placeholder option, end `BLOCKED`. The three dates are never frozen.
- **Fake reproduction:** in the `review/c012-native-selection-findings.test.ts` fixture, set `f.radios[1].checked=false`.
  - Decoder result: `listComplete:false`, `selectedDate:null`.
  - Feed `slots({selectedDate:null,listComplete:false})` into the `test/checkout-job.test.ts` setup: the run ends `BLOCKED` (`slot-list-or-conditions-not-verified`) with 0 actions and `initialDates:null`.
- **Expected acceptance (only after a real read-only slot-page observation shows this shape):**
  - A complete, enabled date list freezes the first three enabled labels and selects the first one.
  - The time list must be complete only before `chooseSlot`.
  - No date shape is invented.

**P2-2: The bag/review "no extras" check is likely to false-block real pages.**
- **Where:** `page-program.js:107-110`. Any visible text of 180 characters or fewer that mentions "AppleCare" (other than the exact no-AppleCare label) or 折抵/换购 (other than 不折抵换购) sets `extras=true`. So does any second, non-nested element matching the product pattern.
- **Effect:** upsell copy, or a product title repeated in an order summary, blocks at `job.js:158` (bag) and `job.js:180` (review). This is plausible but unverified on real pages.
- **Fake reproduction:** `test/checkout-page-program.test.ts` fixture with `url:'https://www.apple.com.cn/shop/bag'`, texts `[...matching.slice(0,3),'了解 AppleCare+ 服务计划（合成）']`, button `['安全结账']`.
  - Result: `o.extras===true`, so the job stops `BLOCKED` at the bag.
  - Repeating `'iPhone Duo 256GB 星光白色'` as a sibling element gives the same result.
- **Expected acceptance:**
  - Bind the check to the per-line-item structure seen in a real read-only bag/review observation.
  - Keep total = recorded quote (`job.js:180`) as the backstop.
  - Never accept the human's statement as merchant proof.

**P2-3: Slot continuation does not wait for asynchronous merchant validation.**
- **Where:** `page-program.js:159-179`. Re-validation after the `change` catches synchronous handler effects and changes during one awaited read (microtask level; the queued-microtask test passes). It then clicks Continue in the same script call.
- **Effect:**
  - If the merchant disables Continue or sets `aria-busy` while it checks the slot, the action ends touched-but-failed → `MutationResultUnknown` → `NEEDS_VERIFICATION` (`job.js:201`). After 8 s it becomes `slot-result-unconfirmed`.
  - If Continue stays enabled during the check, the click races the merchant.
  - Safety still holds: the same slot is never re-sent, and review requires `slotSummary` to equal the accepted slot (`job.js:180`).
- **Fake reproduction:** native-selection fixture with `f.time.onEvent=()=>{f.button.disabled=true;setTimeout(()=>{f.button.disabled=false;},50);}`.
  - Result: `{delivered:false,touched:true}` and `f.button.clicks===0`, although the fake merchant would have accepted 50 ms later.
- **Expected acceptance (designed against real evidence):** either
  - two write-ahead commands, "change" then "continue", with a fresh bounded observation in between; or
  - a bounded in-page wait for a stable, non-busy state before Continue.

  Unknown results stay unknown, and a selection is never repeated.

### P3

| Finding | Where | Effect | Expected fix |
|---|---|---|---|
| **P3-1** Final authorization left armed | `control.js:57` arms it before `run()`. The early returns at `:20` (approve unchecked) and `:34` (another page holds the lock) leave it set. | Repro: at review, approve unchecked, final-review checked, click 「复核页确认后自动提交并查单」 → returns early. Check approve and click 「恢复本任务」 within 120 s → `:25` uses the leftover authorization → the order is submitted from a "resume" click. No second order is possible (`job.js:182`). | Clear both authorizations on every early return, or check approve and lock before arming. |
| **P3-2** Retire lacks the locks guard | `control.js:48` has no `!navigator.locks` check (unlike `:21` and `:39`). | `owner.js:3` throws → unhandled rejection with no status message. Fails closed. | Same guard as the other handlers, plus a Chinese status message. |
| **P3-3** AUTH command branch runs before the duplicate-command memo | `page-program.js:11-12` vs `:141` | A duplicate delivery of an already executed command, after a same-document navigation to the login path, would report `touched:false`. No current code path delivers twice, so this is theoretical. | Report touched (or throw) if the memo already holds that command id. |
| **P3-4** Checkout sign-in page may be mislabelled | `/shop/signIn` | If it has the same no-`main` iframe shape, it decodes as `UNKNOWN` (`page-program.js:15`), not AUTH. Still a non-mutating `NEEDS_USER` gate, never "no stock". | Extend the AUTH branch only after a real observation. |
| **P3-5** Untouched-failure count is per task, not per step | `job.js:204-206` | The cap of 3 never resets after progress. Four harmless "evidence changed" retries across a ~12-step checkout end in `NEEDS_VERIFICATION`. | Count consecutive or per-stage failures, and keep an absolute cap. |
| **P3-6** Store radio clicked again when already selected | `job.js:159` with `page-program.js:152-154` | With pickup and the exact store already selected but the slot UI still loading, the job re-clicks the store. If loading takes over 8 s (`job.js:191`), it ends `NEEDS_VERIFICATION`. | Wait within a bounded time instead of sending an action. |

**Still open from earlier reviews:**
- The terms check only confirms the link is present (`page-program.js:128`, `:191`; `job.js:183`).
- The order-reference hash is unsalted (`page-program.js:129-130`).
- Partial prefill is possible (`page-program.js:186-187`).
- Unpaid status comes from free text (`page-program.js:67`).
- The price quote takes the first RMB amount (`page-program.js:103`).
- The reason `mutation-transport-lost` also covers local touched failures (`job.js:201`).
- The one-order record lives only in this Chrome profile's extension storage.

### Checked and found sound

- **Store:** exact name match (`page-program.js:46-53`); store selection by exact-name radio (`:152-154`).
- **Quantity:** contradictions give no value (`:37-41`).
- **Fulfillment:** a checked choice on the page outranks prose (`:56-61`).
- **No trade-in / no AppleCare+:** selected one choice at a time, never forcing disabled controls (`:84-104`). Extras evidence comes only from the merchant page (`chrome-port.js:16`).
- **Price:** at most the cap at Add to Bag (`page-program.js:148`; `job.js:153`); review total must equal the recorded quote (`job.js:180`).
- **Single bag add:** recorded durably before sending (`job.js:143`, `:193`); old records default to "started" (`:84`).
- **Dates and last slot:** first three enabled dates frozen once (`job.js:163-165`); last-slot floor (`:168-171`).
- **Untouched vs touched truth:** `page-program.js:138-197`; `chrome-port.js:24-25`; `job.js:202-209`.
- **Write-ahead, pause and "not dispatched":** `job.js:112`, `:188-200`.
- **Unknown final:** reconciled without resubmission, and still checked after expiry (`job.js:91`, `:99-101`, `:113-117`).
- **Authorizations:** start and final bindings, plus revocation at human gates (`job.js:50`, `:92`, `:107`, `:182-183`).
- **Retire and rebind:** limited as designed (`job.js:37`, `:54-58`, `:77-89`, `:135`).
- **Validation and observe modes isolated:** `job.js:60-81`, `:139`, `:154`, `:187`; `chrome-port.js:5`, `:19-20`.
- **Single controller:** one Web Lock owns the whole task (`owner.js`; `control.js:21-22`, `:39-40`).
- **Exact page targeting:** host permission for the current URL, frame 0, exact `documentIds`, and the expected-evidence check (`chrome-port.js:6-10`, `:22`).
- **Private pickup data:** kept only in session storage (`control.js:17`), passed only to the details step (`chrome-port.js:22`), never returned (`page-program.js:180-187`).

## 5. C-010 / C-011 closure

**Read this session:**
- `web/desktop/fixture.js`, `web/desktop/index.html`, `src/dom-demo.ts`, `web/chrome-connector/popup.html`.
- `test/dom-bridge.test.ts` and `test/chrome-connector.test.ts` (full bodies).
- The README part of the C-010/C-011 patch and its file list.

**C-010 notes:**
- The fixture says it is invented (L1). Refusal text exists only in the fixture.
- A refused last slot is removed from the list and is not replaced by an earlier one (L24-25).
- The network guard sets a non-zero exit code on any attempt (`dom-demo.ts:9`, `:15`).
- The page is Chinese and carries a FAKE notice.

**C10-5 (new, P3):** `fixture.js:49` caps fake orders at one. No automated test asserts the `submits` counter; it is only displayed (`app.js:20`). The fake page's order count would therefore hide a duplicate final click.
- **Expected:** a DOM-level regression asserting `submits===1`.

**C-011:** `popup.html` matches the read-only scope. C11-1 to C11-3 are unchanged.

## 6. REAL_PURCHASING_READY: NO

1. **Extension never run.** It has never been installed. Standalone `executeScript` with `documentIds`, the permission prompts and Web Locks on extension pages are unverified. C-013 used a CUA evaluation, not the extension.
2. **Checkout pages are synthetic.** Bag, store, slot, details, payment, review, receipt and order-detail structures exist only in fakes. P2-1 to P2-3 depend on them.
3. **No real refusal handling.** The refusal catalog is empty, so any real refusal stops at `NEEDS_VERIFICATION`. R05 reselection does not work on the real site.
4. **Pickup date is set after payment.** Review, final send and confirmation all require a slot summary (`job.js:180`, `page-program.js:191`, `chrome-port.js:35`). If the unpaid review/detail pages show no slot, `CONFIRMED_UNPAID` cannot be reached. **The user must decide what counts as success here; implementers must not relax it.**
5. **Synthetic clicks and events** may not be accepted by Apple's controls.
6. **Protected local data** is not connected.
7. **One-start real latency** is not measured.
8. **Authorization:[REDACTED] the Pro single-order authorization is consumed. Duo purchase is not enabled, and Duo is pre-launch.
9. **Optional host grants persist** until the user revokes them.
10. **No reset after a mutation.** A task that has written any merchant action can never be retired or reset (my own earlier acceptance rule). After a timeout with the item already in the bag, there is no path to a new task in that profile. This needs a user decision on an explicitly confirmed "continue from existing bag, never add again" path.

## 7. R01–R10 mapping (checkout connector)

| Req | Where it is met | Status |
|---|---|---|
| R01 | `job.js:19-30` fixed purchase conditions; plan hash binding at `job.js:85` and `control.js:12-15` | Met in source |
| R02 | Read-only preflight (`control.js:16`); AUTH, consent and pre-launch gates (`page-program.js:11-14`, `:64-65`, `:105`) | Met in source |
| R03 | One-start authorization (`control.js:24`; `job.js:107`); automatic no-extras configuration | Met in source |
| R04 | First-three-dates / last-slot rule (`job.js:160-173`) | P2-1 gap |
| R05 | Only fresh-generation, verified refusals (`job.js:120-123`) | Inert on the real site |
| R06 | `NOT_READY` is never "no stock" (`job.js:149`, `:151`, `:163`); unknown results stay unknown | Met in source |
| R07 | Web Locks, write-ahead, durable bag-add and final records, per-document memo, exact `documentIds` | Met in source |
| R08 | Pause, stop, revocation, rebind | Met in source |
| R09 | Observe and public-configuration modes; no new authority | Met in source |
| R10 | Chinese UI; sanitized history (reason cut to 60 characters, no values) | Met in source |

## 8. Disclosures

- **Files changed:** none.
- **Self-authorship:** see the caveat in §2. My independent review covers Codex's original C-012 code, Codex's R1 completion of `page-program.js` plus the test transport, and the C-013 delta.
- **Read in full this session:**
  - all nine checkout-connector files, the five checkout tests, the two `review/c012*` tests and the C-013 review test;
  - the C-013 manifest, report, verification file and patch; the C-012-R1 takeover report and completion patch;
  - the C-012-R1-REVIEW and C-013-REVIEW task sheets; the C-012 Codex findings; `requirements.md`;
  - the C-010/C-011 files listed in §5.
- **Read in part:**
  - my historical `C-012-Claude-cross-review.md` (verdicts, P2/P3, sections 3-7);
  - `C-012-R1-verification.json` (key fields only);
  - README (matching lines only);
  - the C-010/C-011 patch (README part and file list; its new-file post-states match current files by hash).
- **Not read this session:**
  - the original C-012 Codex patch body (all its resulting files were read in current form instead);
  - `C-012-R1-candidate-manifest.json`, `C-012-verification.json`, `C-012-Codex-verification.md`, `C-012-public-required-options.md`, `C-012-R1-independent-check.md`, and the C-010/C-011 verification files;
  - `docs/status.md`, the runbooks and the full README;
  - `motor.js`, `app.js`, `dom-bridge.ts`, `read-entry.js`, `popup.js` (read in C-012-REVIEW and hash-unchanged since);
  - the rest of the accepted core, deliberately not re-reviewed;
  - `.local`.
- **Caps and quota:**
  - Spend was about $4.7 of the $10 cap at the last reading.
  - The context was compacted once, so I cannot see the exact turn count; no turn, time or cost cap was hit.
  - Provider quota was not exhausted, so this does not trigger the save/shutdown policy.
- **Denials:** none in this task. Historically, one Bash `git diff` was denied in R1.
- **Historical errata still owed:**
  - C-007-R1 report section 10 is wrong.
  - The runbook's "（例如断电）" (power loss) claim overstates the evidence.
  - C-009 ended in API429.
  - My C-012-R1 continuation ended on quota with no report written.

## 9. Proposed next small functional step (within existing authority)

1. **First, Codex should reproduce P2-1 to P2-3 and P3-1 to P3-6, and fix P3-1 and P3-2 offline.**
2. **Then, only with the user's separate confirmation at the time of action:**
   - Load the unpacked checkout-connector in the user's original desktop Chrome.
   - Grant only `https://www.apple.com.cn/*`.
   - Run 「只读观察当前页面」 and 「公开配置校验（止于加入购物袋前）」 on the public Pro page.
   - Expected: `VALIDATED`, zero bag, slot or order actions, and the validation key written while the purchase key stays empty.
   - This proves the standalone transport, Web Locks and the real validation stopping point.
3. **Separately confirmed: grant `*.www.apple.com.cn` and do a read-only observation of the order sign-in route.** It should read AUTH.
4. **Secure bag, slot and review contracts (P2-1 to P2-3, item 4 in §6)** need a separately authorized read-only observation, for example after the user adds to the bag by hand. Nothing should be inferred or installed without that authorization.
