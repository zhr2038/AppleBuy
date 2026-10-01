# C-001 delivery report: evidence-bounded feasibility and offline vertical MVP proposal

**Status:** C-001 is complete and waits for Codex review. I wrote no files, ran no code or shell commands, invoked no other agents, and had no permissions denied. Nothing in this report approves its own acceptance.

## 0. Execution record and limitations

| Item | Detail |
|---|---|
| Files read | `docs/tasks/C-001.md`, `CLAUDE.md`, `AGENTS.md`, `docs/requirements.md`, `docs/plan.md`, `docs/decisions.md`, `codex_claude_pickup_project_prompt.md` (all 181 lines), `docs/reviews/PROBE.md`, `.gitignore`. I did not read `tools/delegation/invoke_claude.py` because the task doesn't need it. |
| Web reads | 7 public GET fetches, all through WebFetch: 4 first reads of the listed URLs, then 3 re-reads to verify wording. No other hosts. No login, bag, form, private endpoint or repeated polling. |
| Turns / budget | 5 of 18 turns. The harness estimate before I wrote this report was about USD 0.37 of 3; take the final figure from the structured `total_cost_usd`. I can't measure wall time myself. |
| Denials / failures | No permission denials and no quota or budget failures. |
| **Evidence limitation 1** | WebFetch doesn't return raw HTML. A small model converts and summarizes each page, so every quote below was reported by that model. Two separate reads of the Duo page gave the same wording. Codex should still check it with a raw read or a human browser screenshot before recording it. |
| **Evidence limitation 2** | Two sources were effectively unavailable because their content loads in the browser. `/shop/help/shipping_delivery` returned no body text: "dynamically loaded", and none of 自提/取货/零售店/时间/保留/预约/通知 appeared. `/shop/buy-iphone` returned only a page shell with no product tiles. |

## 1. Official evidence and U01–U06 status

**Verified facts and their exact scope** (public, logged-out marketing text, as received on 2026-10-01):

- **https://www.apple.com.cn/shop/buy-iphone/iphone-duo** (read twice; both reads agree)
  - Title: "购买 iPhone Duo - Apple (中国大陆)". Heading: "新款 iPhone Duo".
  - **"10 月 16 日晚 8 点接受预购。10 月 23 日发售。"** Preorders open Oct 16 at 20:00 and the product releases **Oct 23**. The text doesn't state a timezone; Beijing time is likely but unverified.
  - **"机型将在获得批准后发售"**: the model goes on sale only after (regulatory) approval, so both dates are conditional.
  - Capacity and price strings: 256GB RMB 15,999 · 512GB RMB 17,999 · 1TB RMB 21,499 · 2TB RMB 26,499. Colours: 夜空色, 星光白色.
  - From the FAQ: "在中国大陆仅支持激活型号为 A3721 的 iPhone Duo". This is a regulatory model number for activation. **It is not an orderable part number or SKU.**
  - The received text had **no** 添加到购物袋 / 继续 / 通知我 / 选择零售店 / 自提 / 取货 / 查看供应情况 controls.
- **https://www.apple.com.cn/iphone/**
  - iPhone Duo is labelled "新款" and has a purchase link `/cn/shop/goto/buy_iphone/iphone_duo`.
  - It has a generic pickup sentence that doesn't mention Duo: "可在线购买并前往 Apple Store 零售店取货。请查看你附近的 Apple Store 零售店是否方便取货。"
  - No dates or prices for Duo.
- **https://www.apple.com.cn/shop/buy-iphone**: "Duo", "15,999", "10月16" and "预购" were all **absent** from the shell I received.
  - **Discrepancy with D004:** I couldn't reproduce D004's attribution from this URL. The same facts *are* supported by the `/iphone-duo` page.
  - D004 also leaves out the **Oct 23 release date** and the **approval condition**. I recommend Codex amend D004; I didn't edit it.

**What this means for planning:** the earliest launch-day pickup is probably **Oct 23 or later**, but the time-critical moment may be the **Oct 16 20:00 preorder opening**. Whether preorders can choose a pickup store or slot at all is unknown. The design below starts when a slot list is observed, not on a clock. That makes it independent of this question, but preflight must be ready before Oct 16.

| Unknown | Status | Evidence / reason |
|---|---|---|
| U01 product and purchase entry | **Partially resolved** | Public entry, preorder and release dates, approval condition, capacities, colours and price strings exist (URLs above). Not established: whether checkout works, whether preorders can use pickup, purchase limits, store stock, orderable SKUs. **A public entry is not checkout availability.** |
| U02 where slots first appear | **Unresolved** | No public evidence. The generic pickup sentence proves pickup exists as a service, not where its step sits in the Duo or preorder flow. |
| U03 what select and continue each do | **Unresolved** | Needs an authenticated, bag-bearing flow, which is not authorized. |
| U04 where acceptance happens; observable hold | **Unresolved** | No evidence. **No hold duration is assumed anywhere.** |
| U05 in-place recovery and refreshed list after refusal | **Unresolved** | Can't be observed safely without attempting a slot, which could occupy it. It may stay unverifiable until launch. |
| U06 order creation and payment confirmation | **Unresolved** | The help page body was unavailable (client-rendered). |

## 2. R01–R10 mapping

| Req | Design element | C-002 (offline) | Later / blocked |
|---|---|---|---|
| R01 | Frozen, hashed plan. Fields: ordered product alternatives (model/capacity/colour); `quantity: 1` as a literal; `maxTotalCny`; ordered stores (primary plus authorized backups); ordered dates and windows; earliest/latest arrival; `fulfillment: "pickup"` as a literal; timezone `Asia/Shanghai`. Every action passes `assertWithinPlan`. Strategy is earliest permitted date first, then user priorities. No competition model. | Yes, using values labelled FAKE | Matching real spec names to page text (M2) |
| R02 | Preflight checks plan completeness, mode, an evidence register with U02–U06 status, page recognition, and human login status. Every blocker is listed. | Plan, mode and evidence-register preflight | Real page and session recognition (M2, blocked) |
| R03 | The executor does only the minimal next action. It never touches the bag or product. A full refresh happens only under the bounded refresh policy. | Yes, in the mock | Real adapter (M2) |
| R04 | Pure `decide()`. `SlotKey` (preference identity) is kept separate from the transient `OfficialRef`. Selected ≠ accepted (§4). | Yes | — |
| R05 | Refusal memory keyed by slot and list generation, plus a bounded refresh (§4) | Yes | Real refusal signal (U05) |
| R06 | Closed set of observation states (§4) | Yes, in the mock | Real classifiers (blocked) |
| R07 | One mutation in flight; request IDs and sequence order; write-ahead journal; reconcile before any retry; purchase ledger | In-process, plus journal and restart | Cross-process single-owner lock, A08 (C-003) |
| R08 | Pause / stop / takeover / resume API. Already-sent actions keep their pending or unknown state. | API and tests | Chinese control UI (C-003) |
| R09 | Real mode is a capability wired in at startup. No real adapter exists. One-run formal enablement token (design only). | Guard and mock A12 | Formal mode (needs evidence and the user) |
| R10 | Chinese CLI status lines; sanitized, allowlisted decision journal that explains each choice, retry and stop | CLI | Richer UI (C-003) |

## 3. Proposed stack and architecture

**Recommendation: TypeScript on the installed Node 24, zero runtime dependencies, for C-002.**

- Run TypeScript directly through Node's type stripping, using erasable syntax only (no enums, namespaces or parameter properties). Use `node:test`, `node:assert` and `node:fs`.
- **Reasons:**
  1. Any real adapter will run against Chrome pages, where JavaScript is the native language. A pure TS core can later run in the page with no second implementation of the decision logic.
  2. Node 24 is already installed, so the offline slice needs no package install.
  3. One language keeps the mock, the core and the adapter from drifting apart.
- **Tradeoffs:**
  - Type checking needs `typescript` as a devDependency. I propose an exact pinned version with a committed lockfile, installed with `npm ci --ignore-scripts`, and **only if Codex approves**. Without it, C-002 runs unchecked TS.
  - I couldn't verify in C-001 whether Node 24.16 still prints an experimental warning for type stripping, or whether it needs the `--experimental-strip-types` flag. Checking that is the first step of C-002.
  - Python stays unused.

**Layers:**
1. **Core (pure, deterministic):** plan, observation states, `decide()`, executor state machine, refusal memory, retry bounds. No I/O and no clock reads; the clock is injected.
2. **Journal:** append-only JSONL under ignored `.local/runs/<runId>/`.
3. **Port interface:** `observe()`, `select(ref)`, `continue()`, `submitOrder()`, `reconcile()`. Each call returns one of the closed observation states.
4. **Adapters:**
   - `FakeAppleLikePort` is an in-process scripted mock labelled **"mock contract v0 — invented, not Apple"**.
   - `RealPort` in C-002 is a stub whose mutating methods throw `RealActionBlocked`. It isn't wired into any command.
5. **CLI:** Chinese output for `rehearse` and `bench`.

**Real adapter (M2 recommendation, not part of C-002):** a Chrome MV3 extension content script running in the user's own Chrome profile, limited to `host_permissions: https://www.apple.com.cn/shop/*`.
- It observes the page with MutationObserver and runs the same core inside the page.
- Login stays with the human. The tool never reads or exports cookies, and there's no remote-debugging port.
- Playwright would be used only as a **test driver** against a local DOM mock.
- Costs: the service worker's lifecycle makes persistence harder, and Developer Mode is needed to load it unpacked. This choice depends on U02–U05 evidence.

## 4. Deterministic slot decision and fresh-list reselection

**Identities**
- `SlotKey = (storeLabel, localDate, windowStart, windowEnd)`, normalized in Asia/Shanghai. `storeLabel` is the user's plan label, not an Apple ID.
- `OfficialRef` is the opaque handle from the *current* observation. It is valid only for that list generation. It is never stored for reuse, never made up, never hardcoded.

**Observation states (R06):**
- `SLOTS_AVAILABLE`
- `CONFIRMED_NONE`, only when a recognized explicit "none" signal is present; **an empty array alone becomes `UNRECOGNIZED`**
- `QUERY_FAILED(timeout|network|status)`
- `UNRECOGNIZED_STRUCTURE`, `AUTH_REQUIRED`, `CHALLENGE_OR_THROTTLE`, `PROCESSING`
- `SELECTION_REJECTED(freshList?)`, `SELECTION_ACCEPTED(evidence)`
- `ORDER_RESULT_UNKNOWN`, `PLAN_DEVIATION`

No failed, timed-out or malformed result maps to "none", "success" or "safe to resend".

**Generations:** each observation gets a monotonic `seq` and a fingerprint (a hash of normalized SlotKeys and their selectable flags).
- An observation older than the newest seq is logged and ignored.
- A redraw with an identical fingerprint only refreshes "last valid observation time".
- A new fingerprint starts a new generation.

**Eligibility (all must hold):**
- store, date, window and arrival time are within the plan, and fulfillment is pickup
- the slot is marked selectable in *this* observation
- the slot is not suppressed

**Ranking (a total, deterministic order):**
1. Date, in the user's plan order (default earliest first, i.e. launch day first)
2. Store, in plan order (primary first, then authorized backups)
3. Window, in the user's priority order
4. Start time
5. SlotKey as a string (final tiebreak)

The precedence of 1–3 is user-configurable. The page's display order and any guess about competition are never used.

**Selected vs accepted.** Each attempt moves through `CANDIDATE → SELECTED_LOCAL → SUBMITTED(opId) → ACCEPTED | REJECTED | UNKNOWN`.
- Selecting a slot is treated as a possible remote mutation until evidence shows it is purely local (U03).
- The UI shows "已选中（未确认）" (selected, unconfirmed) separately from "官网已接受" (accepted by the official site).
- `ACCEPTED` requires an adapter-specific acceptance predicate. In the mock this is an explicit accepted response. **For the real site it is BLOCKED (U04).**

**Refusal → fresh reselection (the core loop):**
1. Observe list L_g → `decide()` → S1 → dispatch op1. No new decision while op1 is in flight. Newer observations go into a buffer that keeps only the latest one.
2. Explicit refusal of S1 at seq r:
   - Record `refused(S1, r, fingerprint)`.
   - If the refusal carries an updated list, or the page updates in place, decide on **that** list right away, excluding S1.
   - Otherwise make **one** bounded re-observation of the slot list.
   - The bag, product and store are never redone.
3. Acceptance → dispatch the next checkout action immediately. In rehearsal, stop at the endpoint "到达模拟付款前步骤" (reached the simulated pre-payment step).

**Suppression:** S1 stays excluded in:
- every list with seq ≤ r,
- the list returned with the refusal itself (the refusal is the more specific signal), and
- any later list whose fingerprint is unchanged.

S1 becomes eligible again only when a list with seq greater than the refusal-returned list has a **different** fingerprint, still marks S1 selectable, **and** S1 has fewer than `maxAttemptsPerSlot` attempts (default and hard cap: 2).

**Stale-list guard:** after 2 consecutive refusals on an unchanged fingerprint, the list is no longer trusted. The executor makes one bounded refresh; if the fingerprint is still unchanged it enters `LIST_STALE_SUSPECTED` and hands over to the user. A stale list is never walked through one item at a time.

**Retry bounds:** these are local policy proposals, not Apple facts; the user may tighten them up to the hard caps.

| Bound | Default | Hard cap |
|---|---|---|
| Total refusals | 8 | 20 |
| Bounded refreshes per refusal | 1 | — |
| Bounded refreshes total | 5 | — |
| Minimum refresh interval | 2 s (configurable) | — |
| Run deadline | set by the user | — |

- Any challenge or throttle signal ends all automated refreshes and hands over to the user.
- Exhaustion ends in `EXHAUSTED(reason)`, displayed as "已达重试上限" (retry limit reached), **not** "无货" (out of stock).

**Plan deviation:** if the observed price, total, product, store, date or fulfillment differs from the plan, or can't be parsed, the executor goes to `TAKEOVER`. It never adjusts on its own.

## 5. Consistency and recovery

- **Single in-flight mutation:** an in-process mutex holds one `opId`. Responses whose `opId` isn't the current one are logged as `LATE` and can't change state. Step progress never moves backwards because of an older observation.
- **Write-ahead journal:**
  - `intent(opId, kind, slotKey, planHash)` is written and fsynced *before* dispatch, and `outcome(opId, result, evidenceCode)` is written after.
  - State is rebuilt from the journal.
  - On restart, an open intent becomes `UNKNOWN`. Lists from before the restart are invalid and a fresh observation is required. Refusal memory is kept.
- **Unknown outcomes:**
  - *Non-final steps* (select or continue): up to 2 bounded read-only reconcile observations decide among accepted, rejected and still-on-step. If still unknown → `MANUAL_VERIFICATION`. The same mutation is never resent automatically.
  - *Final submission:* never resent. Reconcile only by a read-only order lookup (mock: lookup; real: **BLOCKED, U06**), otherwise `MANUAL_VERIFICATION`.
  - A **purchase ledger** marks the plan as consumed once any submit intent exists, even if its outcome is unknown. A new run refuses to start until a human clears it after verifying.
  - Local flags do **not** guarantee exactly-once on Apple's servers, and the UI will say so.
- **Sleep, network loss, browser closure:**
  - Durations use the monotonic clock. A detected time gap turns the in-flight operation into `UNKNOWN` and requires a fresh observation.
  - Network loss → `QUERY_FAILED` → bounded retry → takeover.
  - Closing the browser (real adapter) → `PAUSED_DISCONNECTED`. There is no automatic relaunch-and-resubmit.
- **Pause and takeover:** a flag checked before every new mutation.
  - An in-flight operation finishes and its outcome is recorded; the UI shows "已发送 1 个操作，等待官网结果" (1 action sent, awaiting the official result).
  - Takeover also stops all page interaction.
  - Resume requires a fresh observation; anything the human did counts as unknown until reconciled.
- **Multiple instances or tabs (C-003):**
  - A per-task lease file is created exclusively and holds owner ID, PID and heartbeat.
  - The lease is taken over only if it is stale (no heartbeat and the PID is dead).
  - Other instances become read-only viewers showing "另一实例正在执行" (another instance is running).

## 6. Real versus rehearsal boundary

- Rehearsal is the default and is enforced in code structure, not by a flag. C-002 contains **no** real adapter capable of mutation, and the `RealPort` stub throws on every mutating method.
- In the tests, an outbound-network guard fails any connection to anything other than loopback. C-002 needs no network at all.
- **Formal mode (design only):** all three conditions are required:
  1. The evidence register marks U02–U06 verified and Codex-approved.
  2. A complete plan is shown in Chinese, with its hash, and the user types a confirmation.
  3. A single-use token tied to the plan hash, the run ID and an expiry, consumed on the first submit attempt.

  A12 is tested only with a mock token against the mock.
- **M2 read-only observation:** only the human's normal browsing with a human login. The adapter stops before any element that changes state, including add-to-bag, which C-001 did not authorize.
- U05 can't be provoked safely, so the real adapter must observe and hand control back on any state it doesn't recognize.

## 7. Local session-data proposal

- The tool never reads, stores or sends cookies, storage, request headers, passwords, verification codes or payment details.
- Login and payment stay human inside the user's own Chrome.
- If a dedicated profile is ever used, it lives in `browser-profile/`, which is already ignored, and is never used as fixture or model input.
- **What is stored:**
  - the plan (payment method is only a label)
  - the journal: SlotKeys, fingerprints, state transitions, reason codes and timings
  - benchmark samples
- **Sanitizing:** journal records are built from a typed field allowlist, not regex redaction. No page HTML, no URLs with query parameters, no names, phone numbers, emails or ID numbers.
- Details of the person collecting the order are not stored by the tool.
- Fixtures are synthetic and labelled `FAKE`.

## 8. Performance targets and baseline method

**Measurement points:** list observed, decision finished, mutation dispatched, authoritative response observed, and render (DOM mock only).
- **T1** list → effective selection
- **T2** refusal → next effective selection
- **T3** acceptance → next action

Each is reported as local decision time / rendering time / remote response time. Remote time in the mock is **simulated and labelled as such**. Rendering is reported as N/A in the in-process mock, not as 0.

**Initial targets** (proposals for Codex to review, for this machine):

| Measure | Target |
|---|---|
| `decide()` over ≤500 slots | P50 ≤ 1 ms, P95 ≤ 2 ms |
| T1, T2 (with returned list), T3, local only | P95 ≤ 10 ms |
| T2 with a bounded refresh | ≤ 10 ms local + exactly one simulated remote round trip, reported separately |
| DOM mock, observation → click (C-003) | provisional P95 ≤ 100 ms; revise after first measurement |
| Correctness, across all seeded runs | 0 duplicate mutations, 0 stale-reference actions, 0 resubmissions after unknown |

**Baselines:**
- **B1** (C-002): a naive "go back and pick the next slot I remember" policy, run in the same harness and the same seeded scenarios. Compared on attempts-to-acceptance and time.
- **B2** (C-003/M4): a human operating the DOM mock, at least 20 runs per scenario.

**Reporting:** at least 200 seeded runs per scenario, warm-up excluded; N, P50, P95, max and failures; environment (OS build, CPU, Node version, power mode); seeds and commit. **The real Apple site is never timed or load-tested.**

## 9. Proposed C-002 scope (offline vertical slice)

**In scope:**
- the core from §4–5, in-process
- the journal, with restart and reconcile
- `FakeAppleLikePort`, with a scenario format covering list generations, refusal with and without a returned list, acceptance, timeout, late or duplicate responses, malformed or empty responses, challenge, auth expiry and price deviation
- Chinese CLI: `rehearse`, `bench`
- `examples/plan.fake.json`
- a decision-level benchmark against B1
- a short Chinese run section

**Tests C-002 must deliver:**
- A01, A02, A03, A04, A05
- A06 (plan guard)
- A07 (in-process timeout and journal restart; never resubmits after unknown)
- A09
- A10 (state mapping only)
- A11 (structural plus network guard)
- A12 (no token means no submit; in the mock, exactly one compliant order, then stop)
- A13 (journal schema allowlist)
- A14 (decision level only, labelled)

**Out of scope:** browser adapter, DOM mock page, A08 cross-process lock, Chinese GUI, formal enablement flow, Playwright, and any real-site access.

**Next tasks:** C-003 adds the lock, restart drills, the DOM mock with render timing, and the UI. C-004 is the M2 read-only adapter and is blocked on authorization.

## 10. Commands

**Run in C-001: none.** Code execution was out of scope. The commands below are proposals that C-002 must verify; Codex should review the package scripts first.
- `node --version`
- `node --test "test/**/*.test.ts"`. The glob form and whether a strip-types flag is needed are unverified.
- `node src/cli.ts rehearse --plan examples/plan.fake.json --scenario refuse-then-accept`
- `node src/cli.ts bench --scenario all --runs 200 --seed 1`
- `npx tsc --noEmit`, only if the devDependency is approved.

## 11. Remaining real-contract blockers

1. **U02:** the location of the pickup step, and whether preorders (Oct 16) can choose an Oct 23+ pickup.
2. **U03:** what select and continue each do.
3. **U04:** the acceptance evidence and any hold. No duration is assumed.
4. **U05:** refusal signal and refreshed-list behaviour.
5. **U06:** order and payment confirmation, and a read-only lookup for reconciling.
6. Orderable SKU and store identifiers. The design avoids needing them by matching page text against the plan, but that matching itself is unverified.
7. The user's real plan values: capacity, colour, stores, dates, windows, price cap, payment method.
8. User authorization for any observation that changes state (bag creation) to study U02–U04.
9. The approval-conditional release date and the unstated timezone.
10. Real challenge and rate-limit behaviour.

Even after all of these are resolved, nothing here amounts to production or launch readiness.

**Checkpoint:** C-001 report delivered and awaiting Codex review. Suggested next steps:
1. Codex verifies the Duo page wording independently and amends D004 (scope, Oct 23 release date, approval condition).
2. Codex records the approved stack and design decisions (D005+).
3. Codex decides on the `typescript` devDependency.
4. Codex dispatches C-002 as scoped in §9. The timeline matters: today is Oct 1 and preorders open Oct 16 at 20:00.