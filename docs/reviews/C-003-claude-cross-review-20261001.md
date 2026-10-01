# Actual Claude cross-review, 2026-10-01

Receipt verified by Codex: same `E:\\Apple Store` directory and session `11941a88-4609-4e7f-a2f8-78c5b5837285`; English, actual `claude-opus-5-5`, requested Extra (`xhigh`). Started 20:20:43 and ended 20:26:45 Asia/Shanghai, 362.58 seconds; child exit 0, subtype success, is_error false, model gate passed, 32 actual turns. The dispatcher saved these receipts and then hit a Windows GBK print error; that console-only failure does not invalidate the saved actual reviewer result. Its management-only stdout fix now emits ASCII-safe JSON, without changing UTF-8 logs or model/permission gates.

One actual denied `node -e` output-summary command was disclosed. Claude used allowed Grep to read the same test output and did not broaden permissions. No live website calls or source edits occurred. The reviewer's approximate cost/turn statement below is self-reported; the receipt's turn count is authoritative and resumed modelUsage may be cumulative.

Codex independently reproduced F1 in both restore/empty-ledger variants: the unpatched code actually produced two fake orders and two submitOrder calls. F2 also reproduces. Independent tests were added without modifying product source. This receipt is a real review but **not mutual acceptance of C-003**; repair and independent retesting remain required. C-004's bounded scope was accepted, with low-severity fixes retained.

The following is Claude's delivered English review (a designated project deliverable; raw private conversation/tool logs are excluded).

---

# C-003-REVIEW: independent review of the Codex takeover changes (C-003 offline app, C-004 read-only preflight)

**Verdict:**
- **C-003:** I agree it is an offline-only candidate, but I do not agree to final acceptance yet. One material issue remains (F1).
- **C-004:** acceptable as a bounded read-only public-entry preflight, with three low-severity findings.
- **Real readiness:** none is possible from these fake tests. Real SKU, checkout and slot mechanisms (U02–U06) and the user's real purchase plan remain unverified.

**Independence:** I wrote most of the original C-003 application code in the earlier session, before the quota stop. My review of that code is not independent and is not self-approval. What I reviewed independently is Codex's repairs, how they interact with my code, and all of C-004.

## 1. What I reviewed

I read these files in full in the current working tree:
- **C-003 code:** `src/app/task-app.ts`, `src/app/task-store.ts`, `src/app/owner-lock.ts`, `src/app/server.ts`, the changed parts of `src/runner.ts`, `src/mock/live-site.ts`, `src/engine.ts` (`#replay` and every ledger call site), and `web/app.js` / `web/render.js` (the client-ID and render paths only).
- **C-004 code:** `entry/public-entry.ts` and `entry/cli.ts`.
- **Tests:** `review/app-handoff.test.ts` and `review/app-ownership.test.ts` in full; the test list and boundary assertions of `review/public-entry.test.ts`.
- **Documents:** `docs/status.md`, `C-003-codex-takeover.md`, `C-003.md`, `C-004.md`, `C-004-source-manifest.json`, `iphone-18-pro-dalian-probe-20261001.md`.

I could not recompute the manifest SHA-256 values; no approved command does hashing. So I can't confirm the working tree matches the 48-file manifest byte for byte. The test counts do match it.

## 2. Checks I ran

| Command | Result |
|---|---|
| `node --test "test/*.test.ts" "review/*.test.ts"` | **124 passed**, 0 failed, 0 skipped, 0 cancelled (5373 ms). Matches Codex's count. |
| `node src/cli.ts bench --runs 200 --warmup 20 --seed 1` | Exit 0. Both policies: 200/200 accepted, 0 runner failures, at most 1 mutation in flight, 0 stale-reference actions. Simulated time to acceptance P50/P95 = 302/451 ms; fresh-list max 2439 ms vs baseline 633 ms. T2 has only n=14 and n=16 samples. Matches `C-003.md`. It overwrote its own output file `.local/bench/bench-seed1-runs200.json`. |

## 3. Codex's eight repairs

All eight are correct and their reviewer reproductions pass:
1. **Clean close:** shutdown now pauses, makes the runner quiesce, detaches pending replies and only then releases the lock.
2. **Missing ledger:** a missing ledger file is treated as unsafe.
3. **Empty ledger:** every final-submit `sent` record in each run journal is cross-checked against the ledger.
4. **Missing run journal:** the task fails closed.
5. **Directory aliases:** the physical (resolved) directory decides the lock name, case-folded on Windows.
6. **Historical display after restart:** it comes from a pure journal replay that never writes to the ledger, is labelled as history, and shows no actionable candidates.
7. **Bound target:** the status card shows the run's bound plan, not the edited plan.
8. **Mid-run corruption:** evidence is re-checked before every mutation.

Other areas I traced:
- **Late replies:** the mock site applies its durable effect before replying, so a reply settled late after close cannot write anything.
- **Tab identity:** client IDs are now fresh for each page load.
- **Loopback service:** the Host, Origin and token checks are sound.
- **Formal capability:** it is bound to the arm's plan hash, and expiry is checked at send time.
- **Recovery after an unknown submit:** it only performs lookups.

## 4. Findings

### F1 (Medium, material for C-003): rolling back `task.json` and the ledger together allows a second mock final submit

**Where:** `src/app/task-store.ts:97-103`. `TaskLedger.entries()` checks only the runs listed in `task.json`. Nothing in `src/` lists `runs/` on disk, so a run journal containing a sent `submitOrder` is ignored once `task.json` stops listing it.

The general rule is that unknown state fails closed. Each file alone is already protected: a rolled-back `task.json` alone fails closed because of foreign ledger entries, and a missing or emptied ledger alone fails closed. But restoring both files from a backup taken before a submit run, either at the same moment or with the ledger set to `[]`, is a valid but stale state that passes every check. The leftover `runs/<id>/journal.jsonl` and the mock site's `orders` are never consulted.

**Reproduction.** I couldn't run it, because this profile can't create files; it uses the existing helpers:
```ts
const app = await openApp(dir);
assert.ok(app.armFormal(app.state().plan.planHash, FORMAL_PHRASE).ok);
const task = readFileSync(join(app.store.dir, "task.json"));
const ledger = readFileSync(join(app.store.dir, "purchase-ledger.json"));
assert.ok(app.start("submit-confirm").ok); await app.idle();   // submitOrder = 1
await app.close();
writeFileSync(join(dir, "task.json"), task); writeFileSync(join(dir, "purchase-ledger.json"), ledger);
const again = await openApp(dir);
assert.equal(again.start("submit-confirm").ok, false);        // expected; my code reading predicts true
assert.equal(again.site.counts.submitOrder, 1);                // my code reading predicts 2
```

**Fix is accepted when:**
- `entries()` also lists `runs/*` on disk and treats any run directory missing from `task.json` as unsafe;
- optionally, more mock orders than ledger entries is also treated as unsafe;
- a reviewer test reproduces the case above and passes;
- no existing test changes.

### F2 (Low, Chinese UI wording): every evidence failure is reported as ledger damage

**Where:** `task-store.ts:82-106` turns every failure into one `ledger-unreadable` marker: missing ledger, invalid `task.json`, foreign entry, unverifiable run journal, or a sent submit with no ledger entry.

**Effect:**
- `startBlocker()` (`task-app.ts:200-201`) checks that marker first, so the more precise journal message at line 203 is never shown.
- `render.js:57` then says 购买台账：损坏（按结果不明处理）——此任务禁止再次提交 ("ledger damaged, treated as unknown, this task may never submit again").

**Reproduction:** follow the reviewer test "a missing journal for a recorded run fails closed". `app.state().ledger.corrupt === true` and the start blocker starts with "购买台账损坏", even though no submit ever happened and the ledger file is intact.

Blocking is still correct, but the message sends the user to inspect the wrong file. **Accepted when** the marker carries the actual cause, the Chinese text names it, and a test checks the text.

### F3 (Low, performance not measured): checks on the mutation path grow with history and are not in the benchmark

On every call, `TaskLedger.entries()` re-reads `task.json`, re-validates every plan revision and re-verifies the hash chain of every run journal. It runs:
- in `beforeSend`, between preparing and sending every mutation (`task-app.ts:315-323`);
- in the engine's ledger lookups;
- two or three times per `state()` call, once for every connected tab on each broadcast.

The benchmark uses `MemoryLedger` and doesn't call `beforeSend`, so its "local decision" times don't cover this app-path cost.

**Reproduction:** finish N runs in one task, then time `app.store.ledger.entries()` and `app.state()`; the time grows linearly with N. **Accepted when** the cost is either measured and reported separately, or capped (for example, verify finished runs once and cache by size, modification time and last hash).

### F4 (Low / limitation): a run is recorded before its journal exists, so a failure in between blocks the task permanently

`start()` saves the run to `task.json` (`task-app.ts:264-266`) before the first journal record is written. A crash, or an I/O error such as Windows antivirus briefly locking the new file, in that synchronous window leaves:
- start and recover both blocked;
- the F2 wording, which wrongly says the ledger is damaged;
- no documented manual path forward.

That is safe, but it should be documented as a limitation, or the ordering redesigned together with F1.

### C-004 findings (all Low)

- **C4-1, hidden text counted as visible:** `public-entry.ts:76,87,91-92` removes only comments, `<script>` and `<style>`. Text inside `<template>`, `<noscript>`, `hidden` / `aria-hidden` elements, or an `<h1>` inside `<template>`, still counts. Reproduction: put `<template>9 月 9 日晚 8 点接受预购。9 月 19 日发售。</template><div hidden>机型将在获得批准后发售</div>` in otherwise valid catalog HTML. `inspectPublicHtml` then reports both as published notices, while `C-004.md` says only "explicitly visible" notices are recognized. These fields never affect readiness, so the fix is to correct the wording or strip those elements.
- **C4-2, loose heading type:** `public-entry.ts:108` uses `String(x.productHeading)`, so the array `["iPhone Duo"]` is accepted. It should require `typeof === "string"`.
- **C4-3, narrow separation test:** `review/public-entry.test.ts:204-205` only checks that `src/cli.ts` doesn't reference `entry/`. I grepped all of `src/`: nothing references it today. But a future `src/**` import of `entry/` would bring in `fetch` without tripping the A11 static scan, which only covers `src/**`. The test should scan all of `src/**`.

### Nit

`TaskApp.open` decides whether to enable test fixtures using the raw path (`task-app.ts:101`) instead of the resolved physical path. A junction inside `.local/test-runs` that points at a real task would enable the environment-variable fixtures for it. This is test-only and very low severity.

## 5. Missing coverage
- No tests for F1, F2 or the F3 cost.
- No automated real-browser test; Codex's browser checks were manual and can't be rerun from the suite.
- No static type checking (`tsc`).
- The Linux lock path is untested; macOS deliberately refuses to run, also untested.
- T2 has only 14–16 samples per 200 runs.
- C-004: nothing covers hidden text in `<template>` / `<noscript>` / `hidden` elements.

## 6. Conclusions
- **C-003:** Codex's takeover repairs are correct and I agree with the **offline-only candidate** classification. **I do not agree to final acceptance until F1 is fixed** (or Codex explicitly scopes it out as a documented limitation). F2–F4 can be tracked separately.
- **C-004:** the takeover is **acceptable for this bounded read-only milestone**:
  - fixed GET targets only, with no credentials, no redirects followed, no retries and no mutations;
  - the body is size-bounded, and the timeout also covers reading it;
  - the title is taken from the document head only, and "unknown" stays distinct from "absent";
  - imported snapshots are checked for provenance, age and complete rendering;
  - every readiness flag is always false, and it is structurally separate from the purchase engine.

  An HTML parse or an imported browser observation does not verify Duo checkout or slot behaviour.
- **Dalian Pro probe:** the scope is stated honestly. It distinguishes offered options from acceptance, retention from slot holding, and Pro from Duo. It also says the user handling the consent step was not authorization. One point for adapter design: in the normal flow, a time is chosen in a native `SELECT` and the server likely responds at 继续填写取货详情 ("continue"). So a real refusal may arrive at the advance step, like the `advance-refused-slot` scenario, rather than at the mock's `chooseSlot`. This is unverified. I made no live calls.

## 7. Permission denials and limits
- One denial: a `node -e` command to summarize the test output (not an approved command pattern). I read the output file with Grep instead and did not try any other workaround. No files were modified.
- I did not read private `.local` data. The test suite created and cleaned its own `.local/test-runs` directories.
- Budget used: about $2.6 of $6; about 23 of 45 turns.

**Checkpoint:** Codex resolves F1 (plus F2–F4 and C4-1–3 as chosen), reruns the full suite, `rehearse --all --quiet` and the benchmark, then requests another real review of the updated manifest.
