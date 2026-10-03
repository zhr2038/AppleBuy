# C-025 report: proving one unit at checkout

The current evidence cannot prove one unit on the live checkout page, and none of the routes I evaluated is proven. I recommend Route A: use a quantity that Apple itself shows for the single purchased line, found anywhere in the current checkout page (not only inside `main`), and checked again at click time. Whether Apple shows one is unknown, because only the product strip inside `main` was inspected. Carrying the bag's one-unit result forward and matching the amount (Route C) cannot prove one unit; it can only be added as an extra stop. The next step is a read-only page capture (section 7). It needs the browser driver working again and the human's pending bag result. Nothing here authorizes a purchase or claims the flow is ready.

## 1. Commands
I ran only the two approved commands, exactly as written:
1. `python tools/delegation/verify_candidate_manifest.py docs/reviews/C-024-candidate-manifest.json` → `{"ok": true, "files": 149, "sha256": "7d53716433beafb078cef2184f68470f2c60a323a0e57d28a063923920e6bfd4", "mismatches": []}`
2. `node --test review/c024-checkout-money.test.ts test/checkout-c024-evidence.test.ts` → 39 tests, 39 pass, 0 fail (0 cancelled, skipped or todo), 131.37 ms.

Nothing was written between the two commands, so these 39 results apply to the verified 149-file candidate. All tests use fake pages, not Apple pages:
- **"C024 observed checkout header gives a current total but never supplies an absent quantity":** a page built like the observed checkout page reads total 9999, with quantity unknown, so the item is not verified.
- **"C024 job at FULFILLMENT with the observed layout without quantity stops…":** the job stops with `pickup-conditions-not-verified` and sends no action.
- **"C024 interface positive: an explicit synthetic unit…":** pickup selection only goes through because the test inserts a fake `数量：1` line. This only shows the code path works. Apple has never been observed showing that line on checkout.

Passing tests are not evidence of the live quantity.

## 2. Original requirement vs gates we added
**Original requirement** (from the original prompt and `docs/requirements.md`):
- Exactly one unit of the planned model, capacity and colour.
- Within the total cap, pickup at Apple 大连恒隆广场, with no extras.
- No price, capacity, city, delivery or date changes.
- An unknown result is not a success.
- Never add to the bag twice or submit twice, and never claim server-side exactly-once from a local flag.
- An unauthorized quantity is blocked.

The prompt does **not** require the quantity to be shown on every page, or inside `main`.

**Gates we added in code** (implementation choices, not user conditions):
- **G1 – form:** quantity is accepted only as a `数量 N` text line or one dropdown labelled 数量 (`page-program.js:84-89`).
- **G2 – location:** only text inside `main` is read (`:31`, `:37-42`).
- **G3 – element types:** only `h1,h2,h3,p,span,div` elements of up to 180 characters are read (`:41-42`). A quantity sitting directly in `li`, `dd`, `td`, `label`, `strong` or `small` is never seen.
- **G4 – every page:** a fresh quantity is needed on every page where the item is checked (`job.js:155`, `:185-215`, and the order lookup at `:142`). Nothing is carried over from an earlier page.
- **G5 – summary button:** the total comes from the single summary button, inside `main` only (`:100-104`).
- **G6 – review price:** the review-page total must equal the price recorded at Add to Bag (`job.js:215`).

G4's "fresh, never carried over" is what implements "never infer one unit from an old flag", and it should stay. G1–G3 are rules about location and format, and can change if evidence supports a different form.

## 3. Why the adapter stops, and the evidence we have
**Where the stop happens on the observed checkout page:**
1. No quantity line or dropdown inside `main`, so the page quantity is unknown (`:89`), the item quantity is unknown (`:91`), and the item is not verified (`:124`).
2. A new task then stops BLOCKED with `pickup-conditions-not-verified` (`job.js:187`).
3. An already-sent checkout click is never confirmed as successful (`:155-156`), so it stops NEEDS_VERIFICATION with `mutation-result-unconfirmed; no automatic repeat` (`:159`).
4. Even if a command did reach the page, the page program would refuse it without touching anything: `ActionNotRecognizedForCurrentStage` (`page-program.js:293`, `:328`).

**The old task cannot continue whatever the quantity shows.** It became read-only when it was rebound to the new tab (`job.js:108`), and it stops at `:161` before any new command. Any real progress needs a new task and a new human authorization. This report does not request one.

| Fact | Source and how it was obtained | Limit |
|---|---|---|
| Bag: one purchased line, iPhone 18 Pro 256GB 黑色, a visible 数量 dropdown set to 1 (options 1 and 2) plus a hidden copy, total 9999 | C-022 record; sanitized driver page observation | Taken before the extension needed an update. The human's bag result after reload has not arrived. |
| New tab on secure6: went from `/shop/signIn` to `/shop/checkout` through the driver's normal authorized login; headings 你希望如何收到订单商品？, 为我送货, 我要取货 | C-021 record | Host permission, pending action, bundle hash and reconciliation all marked unverified; screenshot timed out |
| Checkout pickup page: same product title, no quantity in the inspected product strip in `main`, one summary button in `main` reading `显示订单摘要： RMB 9,999` | Task sheet (sanitized observation) | Only that strip was inspected. No record I read counts summary buttons across the whole page (finding F1 still open). |
| Order summary popup: shows subtotal, shipping and order total (`orderTotalValue`) | Task sheet | No verified per-item quantity, no verified link to the button, and no record of whether the popup was open or just hidden in the page |
| A 2-unit order is possible on this account (the user created one and cancelled it) | `docs/requirements.md`; human report | Shows quantity 2 is a real state, not how checkout displays it |

**Still unverified:**
- whether a quantity appears outside that strip, in text hidden visually but readable by screen readers, outside `main`, or in the summary popup;
- how Apple builds the checkout from the bag (a copy taken at entry, a live view, or recalculated after edits in another tab);
- the later checkout pages;
- any Apple documentation (none in the files I read, and network access was not allowed);
- the extension;
- real slot refusal, the iPhone Duo flow, and speed.

## 4. Routes

**A. Apple's own quantity for the single line, anywhere in the current checkout page (recommended)**
- **What would count as proof:** in one read of the checkout page, all of these must hold:
  - exactly one product line matching the plan, counted as separate lines (the way `lines()` does), not as distinct title text;
  - exactly one quantity that labels itself as such (`数量 N`, or one dropdown labelled 数量) inside that line's own block of the page, which may be outside `main`;
  - no other quantity anywhere on the page with a different value;
  - a summary total above 0 and within the cap.
- **Why that enforces one unit:** Apple states the line's quantity on the page we are acting on. The page program re-reads it at click time and compares it with what the job saw (`page-program.js:276-277`), and `ChromePort.act` only acts on the same page the job observed.
- **When it stops:**
  - quantity absent, as on the strip inspected so far → stop;
  - duplicates, conflicting values, or a quantity in another line's block → stop;
  - quantity 2 with discounts or credits that hide it in the amount → an explicit 2 still stops;
  - sign-in required or session expired → stop on the sign-in or unknown page state;
  - restart → nothing is carried over, so the page must show it again.
- **What it cannot catch:** edits from another tab or a person after the page was drawn, and slow page updates. No page reading can see these. Only the later review-page quantity and the order-detail lookup (`job.js:142`) check again, and neither is a server-side exactly-once guarantee.
- **Status:** unknown whether it exists.

**B. Quantity inside the order summary popup**
- **Proof:** same as A, but inside the popup. The popup must be open and visible, there must be only one, and it must be linked to the single summary button by a link actually observed in the page, not assumed. The popup total must equal the button total.
- **Extra problems:**
  - Opening the popup is a click the program has never been authorized to make, and nobody has checked that it only opens a panel.
  - The contents of a closed popup may be old or not yet drawn, so they are not current evidence.
  - Each run gains either a click plus a wait, or a human step.
- **Limit:** if the popup only holds subtotal, shipping and total (as observed so far), B falls back to Route C's amount reasoning.

**C. Carry the bag result forward and match the amount**
- **Proof chain:**
  - a fresh bag read shows one line, quantity 1, total T and no extras (`page-program.js:288`);
  - the checkout click is sent from that exact page;
  - the next read in the same tab is the checkout pickup page with the same single title and summary total T;
  - optionally: subtotal equals T, there is no discount row, and the cap is below twice the unit price.
- **Why it does not establish one unit:** it infers the checkout's quantity from an earlier page and from an amount, which the task forbids unless evidence backs the inference. How Apple builds the checkout from the bag is not documented in anything I read, and cannot be seen by reading the page. The extension also cannot see other tabs or devices.
- **Allowed use:** only as an extra stop. Record the bag total when the checkout click is about to be sent, and require the checkout page's summary total to equal it. This can only add stops.

**D. Re-read the bag:** a bag open in another tab is not tied to the checkout page we would act on, and going back from checkout to the bag changes that page. Rejected.

**E. Move the quantity check to the review page:** it is unknown whether the review page shows a quantity. Getting there needs the store, slot and pickup-details steps, which are not allowed during development. Pickup, store and slot choices would then run on an unverified cart, possibly holding a slot for the wrong cart. This needs evidence and explicit approval; not recommended now.

**F. A human confirms the quantity on the checkout pickup page:** reliable as far as the human reads correctly, but it is a manual step in every run and costs speed. Choosing it is a business decision for Codex and the human, not me. Fallback only.

## 5. Counterexamples and the minimum new fact
These are hypothetical scenarios, not claims about Apple's behaviour:
- **H1 – race:** the bag reads 1 × iPhone 18 Pro 256GB 黑色 at RMB 9,999.
  - Before Apple processes the checkout click, another tab or device on the same account changes the quantity to 2.
  - The checkout shows one strip with the same title, because a 2-unit line still has one title.
  - With no discount, the total is 19,998, and the existing cap check stops it if the cap is below that.
  - With a 9,999 account credit, promotion or gift card, or a cap of 19,998 or more, every Route C check passes with two units.
- **H2 – no click to chain from:** the real current tab reached `/shop/checkout` through the sign-in redirect (C-021), not through a checkout click the job sent. Route C has nothing to chain from here.
- **H3 – stale bag:** the bag page still shows 1 while Apple's server already holds 2.
- **H4 – edit after entry:** the bag changes in another tab after checkout opened. Whether checkout recalculates is unknown, so its title and total could stay the same.
- **H5 – duplicate lines (current code; I only read this, I did not run it):** at `page-program.js:80`, product matching away from the bag page only checks that every title is identical. It does not check that there is one line. Two separate identical lines with a single `数量 1` would pass. A quantity rule tied to a line must also count lines.

**Minimum new first-party fact:** the checkout pickup page, opened from a bag that has just been confirmed to hold one unit, either does or does not show Apple's own quantity for that line. If it does, we need:
- its exact wording;
- which element it is in;
- whether it sits inside `main`, outside it, or in the popup;
- whether it is visible;
- whether it sits inside that line's own block.

If the wording labels itself (`数量 1`, or a dropdown labelled 数量), one observation is enough to propose code for Codex to judge. A bare `1` or `×1` would also need an observation at a quantity other than 1, which needs a cart change nobody has authorized.

Route C would instead need Apple's rules for building checkout from the bag, plus proof that no discounts or credits apply, as a dependable contract. Reading pages without changing anything cannot obtain that.

## 6. Recommendation and trade-offs
- **Route A:**
  - For: no inference, the same failure behaviour as the existing bag check, and no extra clicks.
  - Against: the quantity may not exist on the page, and Apple can change the page layout. That would cause safe stops (a risk of not progressing, not a risk of buying wrongly).
- **Route B:** probably lists the line items, but needs a click and a wait for the popup to appear.
- **Route C:** available now, but infers from an old result and an amount, and cannot see other tabs. Use it only as an extra stop.

If the capture finds no quantity anywhere, the honest result is that the program cannot prove one unit on its own on the checkout pickup page. The remaining options (B with an approved popup click, F, or accepting C's risks as a business decision) belong to Codex and the human. I am not relaxing any condition.

**Cart-start risk for any new run:** the account's bag already holds the Pro. A new task started on the product page would press Add to Bag again (`job.js:182`), which would make two units or two lines (Apple's exact behaviour here hasn't been observed). The bag check (`:185`) would then stop the run, but only after the cart had already been changed. A new run therefore has to start from a bag confirmed to hold one unit, or from an empty bag. That is the human's decision.

## 7. Next step: read-only page capture (proposal, not executed)
**What is needed first, and why:**
1. **The human updates the controlling extension through its normal update.** Right now no tool can read the page, and workarounds are not allowed. The existing read access to www and secure6 is reused; I am not asking for anything new.
2. **The human sends the pending bag result after reload:** number of purchased lines, the title, the selected quantity, and the total. This is what ties the capture to a one-unit cart. If it is not one line of iPhone 18 Pro 256GB 黑色 at quantity 1 and RMB 9,999, stop and do not capture.
3. **A checkout pickup page is already open** on the same account, in the secure checkout. If the tab shows sign-in or any other step, stop. Re-entering checkout from the bag is the human's own choice; the capture never clicks 结账.
4. **Two passes:**
   - Pass 1 runs with the summary popup closed.
   - Pass 2 runs only if pass 1 finds no quantity tied to the line: the human opens 显示订单摘要 themselves, the capture runs again, and the human closes it. The human does this because the program has never been authorized to press that button.

**Capture rules:** one script that only reads, in a single step. No click, typing, focus, scrolling, submit, navigation, network, storage or screenshot. Only the fields below come back; anything else is reduced to a count or a length.

**Fields captured (the whitelist):**
- **W1 – location:** the site's origin and path only.
- **W2 – page structure:**
  - how many visible 我要取货 / 为我送货 options there are, and which are selected;
  - how many `main,[role=main]` elements there are.
- **W3 – product titles across the whole page:** every element whose own text matches the existing product-title pattern. For each: the text, element type, whether it is inside `main`, whether it is inside a popup, and whether it is visible. Also the number of separate title lines.
- **W4 – line block:** for each title, the closest enclosing element that contains only that one title. For it: the element type, up to 8 CSS class names (letters, digits, `_` and `-` only), its `data-autom` value if that matches `[A-Za-z0-9_-]{1,40}`, and a reference key.
- **W5 – possible quantities across the whole page**, any element type, hidden ones included, with dropdown option text removed first:
  - text of up to 24 characters containing 数量, 件 or 台, or exactly `×N` / `xN`;
  - dropdowns whose label contains 数量: the selected option and the number of options;
  - `aria-label` text containing 数量, up to 24 characters.

  For each, record:
  - the text, only if it matches `^[\u4e00-\u9fff:：×xX ]{0,12}\d{1,3}[\u4e00-\u9fff ]{0,4}$`; otherwise just "nonconforming" and its length;
  - the element type;
  - whether it is inside `main`, and whether it is inside a popup;
  - whether it is visible by the program's existing visibility rule (`visible()`), and whether it is hidden visually but readable by screen readers;
  - which line block from W4 it belongs to, if any.
- **W6 – money:**
  - the number of `[data-autom="companionbar-button"]` elements across the whole page;
  - for each: element type, whether it is visible, and whether it is inside `main`;
  - the button text if it matches the summary pattern, otherwise "nonconforming" and its length;
  - its `aria-expanded` value;
  - a yes/no for whether its `aria-controls` points to a popup (never the id itself).
- **W7 – summary rows:** label and RMB amount for rows whose label contains 小计, 运费, 送货, 总计, 合计, 应付, 折扣, 优惠, 礼品卡, 抵扣 or 减免. For any other row with an amount, only a count.
- **W8 – popups:** how many `dialog,[role=dialog]` elements there are, and for each: whether it is open or visible, whether it is inside `main`, and how many title lines it contains.
- **W9:** the capture time and the pass number.

**Never captured:**
- typed or filled-in values, and contact, name, phone, email or address text;
- account greetings;
- links, element ids and URL query strings;
- cookies, storage and network traffic;
- screenshots.

**How the capture is tied together:**
- **Same page and moment:** every field comes from one read of one page.
- **Product:** exactly one title line, with the quantity in that same line block.
- **Money:** the summary button total equals the popup total (pass 2) and the human-confirmed bag total. This is context only, not proof.
- **Quantity:** only an explicit quantity in that line block counts. Never the title, the line count, the amount or a missing badge.

**What each result means:**
- **ACCEPT-A (found in pass 1).** All of these hold:
  - exactly one title line, reading iPhone 18 Pro 256GB 黑色;
  - exactly one self-labelling quantity of 1 in its block, either visible or official screen-reader text (record which);
  - no other quantity anywhere with a different value or in a different block;
  - exactly one summary button on the whole page, with the summary wording and an amount within the cap.

  This becomes input for an implementation task once Codex approves it, not purchase permission.
- **ACCEPT-B:** the same, but found only in the opened popup in pass 2, with the popup total equal to the button total. Usable only with a human click or a separately approved popup-opening action.
- **FAIL-1 – no quantity anywhere:** Routes A and B can't work on this page. Report it; Routes C, E and F need a business decision.
- **FAIL-2 – only a bare `1` or `×1`:** what it means is unproven, and proving it needs a cart change nobody has authorized. Stop and report.
- **FAIL-3 – ambiguous:** several candidates, conflicting values, a quantity outside the line's block, more than one title line, or more than one summary button. Result unknown; no code is written.
- **FAIL-4 – wrong page:** wrong host or path, sign-in, not the checkout pickup page, no `main`, or a bag result that doesn't match. Stop with no workaround. Any normal login is the human's own action.
- **FAIL-5 – capture leaked:** output contains anything outside the whitelist. Discard it without saving and report the fault.

## 8. If accepted: proposed code changes and tests (nothing here was executed)
- **Page program:** on the secure checkout page, read the quantity from the line block the capture identified, across the whole page rather than only `main`. Require exactly one title line using `lines()`, which also closes the H5 gap. Keep every existing stop, the fresh read and the click-time comparison.
- **Job, as an extra stop only:** record the bag total when the checkout click is about to be sent (`job.js:226-230`), and require the checkout pickup page's summary total to equal it.
- **Read-only live check:** `observeOnly` (`job.js:70-74`) does not currently return the quantity or whether the item is verified. Adding those two would allow a later live check that never acts.
- **Fake-page test cases:**
  - a quantity of 1 in the line's block → continues;
  - quantity 2 → stops;
  - quantity in another line's block, or in no block → stops;
  - an equal duplicate quantity outside `main` → stops;
  - a quantity marked hidden from screen readers (`aria-hidden`) → stops;
  - two identical title lines with a single `数量 1` → stops;
  - popup total different from the button total → stops;
  - quantity changes between the job's read and the click → `OperationEvidenceChanged`, nothing touched;
  - restart → nothing carried over;
  - no quantity → stops (already covered).
- **Validation:** Codex's own independent cases, the full test suite, then one read-only live read. The review-page quantity and the order lookup remain the later checks, and none of this is a server-side exactly-once guarantee.

## 9. Read scope, limits and requirement mapping
**Read in full during this task (13 files):**
- the task sheet;
- `codex_claude_pickup_project_prompt.md` and `docs/requirements.md`;
- `C-024-bounded-agreement.md`, `C-024-Claude-cross-review.md` and `C-024-candidate-manifest.json`;
- the C-022 and C-021 observation records;
- `page-program.js`, `job.js` and `chrome-port.js`;
- `review/c024-checkout-money.test.ts` and `test/checkout-c024-evidence.test.ts`.

There were no partial reads and no Grep searches; one Glob was used to locate files. The conversation was compacted once:
- `page-program.js` and `job.js` were read in full after the compaction.
- The earlier files are used through retained notes, which include their key text quoted. I did not re-read them.

I did not read private raw traces, account values, `docs/claude/C-024-report.md` (not required) or any other file.

**Limits:**
- No writes, no other agents, no network, browser, extension or account access, no publishing and no shutdown.
- There were no permission denials.
- The cap is 32 turns, 1,200 s and USD 7. The local counter reads about USD 0.63, which is not task billing. I have no wall-clock reading and hit no cap I could observe.
- The model is first-party `claude-opus-5-5`. I can't verify the effort setting from inside the session.
- Not run: the full 709-test suite (not authorized for this task), the page capture, and every proposal in sections 7 and 8.

**Requirement mapping:**
- **R01 and A06 (one unit, blocked quantity):** no condition is relaxed. Route A keeps an explicit quantity from Apple; Route C is only an extra stop.
- **R06 (unknown is not success):** every unknown stops.
- **R07 (no duplicate actions):** a read taken at click time is not a server-side exactly-once guarantee.
- **R02–R05 and R08–R10:** unaffected; no code was changed.
