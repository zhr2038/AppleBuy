I couldn't find a safe automatic way to resume the paused C046 Pro test under the current code. The design below makes it possible, but the main path still depends on official pages nobody has captured yet. This was a proposal-only task: I wrote no files, ran no commands, used no browser or network, and had no permission denials.

## Where the saved C046 task stands now (from the current source)
- **Resume** stops at once with EXPIRED, before reading the page, because the 30-minute window check comes first (`job.js:199`).
- **Same-tab read-only check** isn't blocked by the expiry, but `/shop/sorry/session_expired` is not an allowed page (`chrome-port.js:3`). The read throws, the task stops with `observation-transport-failed`, and the sent slot stays pending. The control page's tab finder also hides that tab (`control.js:13`).
- **Rebind** makes the task read-only forever; **Retire** is refused because the task already wrote to the merchant.

So the saved task can only be preserved, never moved forward. Any way forward needs the new code paths below.

## 1. Expired task and closed merchant session

### Five separate situations, each handled differently

| Situation | How it is recognized | What is allowed |
|---|---|---|
| A. Only the local window has expired | `expiresAt` has passed | Nothing by itself. It only qualifies for renewal (B). |
| B. The checkout is still live | A fresh read in the same run that the existing checks accept (C051 contact step bound to the sent slot, or a page that repeats the full purchase) | Renewal, then the normal existing checks |
| C. Apple shows the session as expired | A new read-only phase, `SESSION_EXPIRED`, for the exact captured template on the bound tab | A closure record (no deletions); a successor only under item 4 below |
| D. The slot result is unknown | The saved chooseSlot is still pending | Kept pending as is. It is never treated as accepted or refused, and never resent. |
| E. A final order was intended or sent | A final intent exists, or a submitted order is pending | No renewal, no closure, no successor. Only the existing order lookup or a manual stop. |

The C046 task is in A + C + D. Situation B no longer applies because the merchant session has ended.

### Renewal (only for situation B)
- **Trigger:** a new `run` option, `renewWindow:true`, sent only from a new explicit click such as 「续期并继续本任务」, with the approve box ticked. It runs under the existing single-owner lock.
- **Where it acts:** when the expiry check finds the window passed and renewal was requested, it allows exactly one read. Nothing is sent.
- **When it extends the window:** only if all of these hold:
  - the task is valid and has the same tab, digest and plan;
  - it is not RETIRED, CONFIRMED_UNPAID or read-only, and has no final intent;
  - nothing is pending, or the pending chooseSlot passes the existing C051 binding check;
  - the fresh read is a recognized step (not a stop phase, not SESSION_EXPIRED), its sequence number is newer, and the saved task did not change during the read;
  - for a pending slot, that same read already passes the existing slot-acceptance check.
- **What it writes:** `expiresAt = now + 30 min` (never more), plus a `windowRenewals` entry with the time, previous expiry, read sequence, document, phase and basis "explicit-human-same-plan-enablement". At most 2 renewals per task, and the count can never be reset.
- **What it never touches:** grants, revoked grant ids, pending, history, dates, floors or refusals are not reset. The run then carries on through the existing checks, using that same read.
- **Why in the same run:** a separate renewal click would leave a gap between the read that proved the conditions and the next run.

### Closure record (situation C)
- **Trigger:** an explicit click such as 「记录官网会话已过期」, using a read-only port.
- **Proof needed:** a fresh read of `SESSION_EXPIRED` on the bound tab, the same task binding, no final intent, and no pending or past submitted order in the record or history.
- **What it writes:** `state:'MERCHANT_SESSION_CLOSED'`, the pending chooseSlot kept byte for byte, and a `sessionClosure` entry: official session expired, read sequence, document, time, slot result `unknown`, remote hold `unknown`, final intent `never-recorded`.
- **What it claims:** the expiry page proves only that this browser can no longer continue that checkout. It does not prove that no slot is held, there is no stock, or no order exists.

### Recognizing the expiry page
- A separate `closedSessionUrl` check used only by observe, for the exact captured host and path.
- `act` keeps using the existing `allowedMerchantUrl`, so no action can ever target that page.
- The page program returns `SESSION_EXPIRED` with `verifiedStep:false` and no action branch.

### Successor (the only way forward for C046)
1. **Enablement:** a new explicit same-plan click, `successor:true`, run only on a MERCHANT_SESSION_CLOSED record.
2. **Before any mutation, the successor needs:**
   - positive evidence that no same-plan order is pending, from a complete read of the official order list that the program recognizes. A failed or empty read is not proof, and neither is a human checkbox.
   - no other disclosed tab currently showing a secure checkout page. This is only a local check; another device or browser can't be seen.
3. **New record, nothing reset:**
   - a new task id; the old record is nested in `predecessors[]` unchanged.
   - it carries over the first-three dates set, the date cursor, the floors, the refusals and the revoked grant ids, labelled `inheritedSchedule{fromTaskId,fresh:false}`.
   - `bagAddStarted:true` is carried over, so it can never add to the bag again. It only checks out from a freshly verified one-item bag, which also sets a fresh money basis.
4. **Limits:** at most one successor per closure. Any further one needs new human or Root authorization. The C046 limit of one order is unchanged.
5. **Root's decision:** whether the successor may choose the same date and time as the unknown old slot. I recommend allowing it only from a fresh list in the new session, recorded as a new decision. It never confirms or resolves the old slot. The alternative is to forbid it, which may skip the user's preferred last slot.

## 2. Date formats
- **One comparison function, `dateKey(label)`.** It turns a label into `{month, day, year?}` and is used only for comparisons. The raw labels in `initialDates`, `acceptedSlot` and pending stay exactly as they are.
- **Accepted forms:**
  - the native compact form `(january…december)\s*(1-31)` (any case, day checked against the month);
  - `October 5`;
  - `10月5日` or `YYYY年10月5日`. A weekday suffix is ignored and is never used as evidence.
- **Match rule:** month and day must be equal. If both sides show a year, the years must be equal. If only one side shows a year, the two still match on month and day, because both labels come from one window of hours, and a December/January change cannot make two dates collide.
- **Anything else is unknown, which blocks:** words like "明天", an unparsable label, or two frozen labels that map to the same date.
- **Where it is used:** the REVIEW slot check (`job.js:376`) and the order-lookup slot check (`job.js:244`). Selecting a date still uses the raw label.
- **Summary formats:** `datePattern` is extended only after a real review or order detail format is captured.
- **Bigger risk:** `requirements.md:26` says the official review states "the pickup date will be determined after payment". If the real review and unpaid order detail show no pickup date, the existing check `o.slotSummary` can never pass. The final order would always be blocked, and after a final the lookup could never confirm the order. Date matching would not matter then. Codex/Root must decide what counts as slot evidence at review; I do not propose loosening that check.

## 3. Unrelated choices on the contact page
- **Recommended:** a list of exactly the observed choice groups, `CONTACT_CHOICES`, initially empty. Each entry records the group's `name`, its fieldset legend, the exact option names, and the default option that must already be checked.
- **The contact page still counts only if** every visible radio or checkbox belongs to a listed group in its observed default state, and nothing matches delivery, store, product, quantity, date/time, payment or extras wording.
- **The program never clicks these choices** and never changes the invoice type. Hidden invoice fields stay ignored. A visible required field under a non-default option stops at the existing "needs human" check.
- **Interim measure:** add sanitized evidence to the stop result, with no values. For each visible radio, checkbox or select: group name, legend, option names, checked/disabled/required, and the count of hidden inputs under it.
- **Why it matters:** an unexpected choice on the real page will stop the next live run as `slot-result-unconfirmed` again, so the stop itself should capture the page shape.
- **Rejected alternative:** a guessed pattern list of invoice words (发票/个人/公司). It would pass an unverified, made-up fixture off as the real page.

## Evidence still missing
| # | What | Who and how |
|---|---|---|
| E1 | The expiry page: host, path, H1/message, links, ready state, iPhone mentions | Root, normal read-only; it is shown now |
| E2 | Current bag: exactly one matching Pro and no extras? | Root, read-only, or the program's bag read |
| E3 | The order list: completeness/paging signs, item status labels, and whether a pending same-plan order exists (no references or values) | Root, read-only. This is what the successor waits on. |
| E4 | Contact-page choices (invoice group and any 取货人 choice) | Only reachable through a program checkout; the E4 capture design above |
| E5 | The payment page: does it repeat the product, quantity, store and total? | Not observed. If not, `fillDetails` stops unconfirmed, the same pattern as C051. |
| E6 | The review page: date/time shown? format, terms link, total, payment | Not observed. The requirements note suggests the date is absent. |
| E7 | The real receipt and unpaid order detail: reference, link, status, slot shown? | Not observed live for this task. I did not read the C-044 or C-008 evidence. |
| E8 | The saved C046 task's actual expiry, pending details, date labels and money basis | Private; needs a sanitized summary of the record without contact values |

## Invariants
1. There is one task record and one owner. Successors are nested, never side by side.
2. Pending, final intent, history, the first-three dates set, the date cursor, floors, refusals, revoked grants and the retired cart are never deleted or reset. Renewal changes only `expiresAt` and appends a renewal entry.
3. A final intent, or any submitted order pending, blocks renewal, closure and successor.
4. The read-only and rebound states never gain purchase authority.
5. The expiry page, a failed query, a timeout, an empty list or a human checkbox never prove no order, no hold, refusal, acceptance or no stock.
6. Carried-over facts are labelled `fresh:false` and are never final evidence.
7. REVIEW still needs current product, quantity 1, total within the cap and equal to the quote, store, pickup, no extras, Alipay, a slot summary matching the accepted slot by date, sales terms confirmed at that moment, one final intent, and the independent lookup.
8. There is no second Add, no resent slot, no hidden state, cookies, CDP or traffic access, and no permission bypass.
9. The expiry page is read-only; `act` can never target it.

## Test cases for the next implementation (all FAKE, real headless Chrome, owned loopback)
1. Expired task + live contact page bound to the sent slot + renewal: renews once, accepts through C051, and fills the identity suffix once.
2. Expired task without renewal: EXPIRED with zero reads, as today.
3. Renewal refused (each keeps the record unchanged apart from its read and sends nothing):
   - a final intent recorded or a submitted order pending;
   - a read-only task;
   - a changed digest or tab;
   - stale sequence;
   - the record changed during the read;
   - SESSION_EXPIRED, AUTH or UNKNOWN shown;
   - the third renewal.
4. Renewal never changes grants, pending, dates or history, and the new expiry is at most 30 minutes ahead.
5. An expiry-page lookalike is not recognized: wrong host or path, a hidden message, an extra form or button, or a dialog.
6. Closure keeps the pending chooseSlot byte for byte. It is refused when a final intent exists, a submitted order is pending, or the read is not fresh.
7. Successor:
   - refused without order-list proof, and on a failed, empty or paged list;
   - refused when another checkout tab is disclosed;
   - refused for a second successor;
   - never adds to the bag on an empty bag, a product page or the bag-read path;
   - carries over the dates, floors and cursor, and never freezes a fourth date.
8. Pausing or restarting between closure, successor and checkout repeats nothing.
9. Date comparison:
   - matches: `october5` with `October 5`, `10月5日` and `2026年10月5日`;
   - no match: `october6` with `10月5日`, mismatched years, `明天`, a `13月` label, or two frozen labels with the same date.
10. A review with no date blocks the final, and the order lookup stays unconfirmed with no resubmission.
11. Contact-page choices: with an empty list, any visible radio means not the contact step. With a listed (FAKE, marked unverified) group, these all fail: a non-default checked option, an extra option, a delivery-like name, or an unknown visible required field. The invoice type is never clicked.
12. Old tests and the reproduction: every protected suite still passes with unchanged assertions.

## Proposed next task (C-053)
- **First, Root captures E1–E3 and E8 read-only.** No code can honestly unblock C046 before that.
- **Then, in `job.js` / `page-program.js` / `chrome-port.js` only, plus a minimal Chinese button and status in `control.js`:**
  - (a) `dateKey` comparison at REVIEW and lookup;
  - (b) renewal inside a run;
  - (c) the `SESSION_EXPIRED` read and the closure record;
  - (d) sanitized evidence of choice controls on an unrecognized contact page;
  - (e) the successor, built only if E3 confirms a recognizable complete order list; otherwise it ships disabled with a stop reason.
- **Out of scope until evidence exists:** the contact-choice list entries (E4), payment/review/receipt adaptation (E5–E7), and any change to what counts as slot evidence at review.
- **Expected live outcome even after C-053:** the successor will likely stop safely at the first unobserved page (contact choices or payment). Root then captures that page read-only while it is shown. Each stop risks another session expiry, and each further successor needs new authorization.

## Requirement mapping
R01 and R04 (inherited vs fresh facts, no hold claims), R05 (no refusal inferred), R06 (expired, unknown and failed kept separate), R07 (one owner, no resend, final unchanged), R08 (explicit renewal, closure and successor clicks; pause preserved), R09 (C046 limit of one order unchanged).

## Process notes
- **Read in full:** the C-052 sheet; `requirements.md`; the C-046 and C-051 sheets; the C-051 contact evidence, implementation verification, independent verification and candidate manifest; `job.js`, `chrome-port.js`, `control.js` and `page-program.js` (all 600 lines, in two reads); `test/c051-native-contact-repro.mjs`; and `test/checkout-c051-contact-transition.test.ts`.
- **Not read:**
  - **Private or local files:** stored state, `.local` outputs, any session, customer or transcript file.
  - **Evidence outside the required list:** the C-044 and C-008 evidence.
- **Hashes:** I did not check the 189-file hash `f630e2b6…`; no command was allowed.
- **Writes, commands, browser, network, agents:** none. Permission denials: 0.
- **Usage:** about 8 turns of 20 and about $2.3 of $5 by the last reading. I did not measure elapsed time against the 900 s limit and couldn't observe provider or effort. Model: claude-opus-5-5.
- **Status:** this is a proposal, not self-approval. Root owns business acceptance and the final review. No real unpaid order exists, and nothing here completes the C046 test.