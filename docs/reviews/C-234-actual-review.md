# C-234 review report: C233 pre-final recovery policy

**Verdict: AGREE.** This covers only the C233 candidate: the six listed files plus the unchanged code they call. I found no material problems. AGREE is a reviewer verdict, not acceptance. I made no edits.

## Commands (each run once, in order)

1. `python -B tools/delegation/verify_candidate_manifest.py docs/reviews/C-233-candidate-manifest.json`
   - `ok:true`, 340 files, SHA256 `87689ada…4c2891f`, no mismatches.
2. `node --test test/desktop-c233-recovery-policy.test.ts test/desktop-c229-additional-review.test.ts test/desktop-c212-review-recovery.test.ts test/desktop-c192-host-scope.test.ts`
   - 52 tests, 52 passed, 0 failed.
3. `python -B tools/delegation/run_review_checks.py docs/reviews/C-233-candidate-manifest.json`
   - All 5 ordered checks passed with exit code 0, no timeouts, and cleanup confirmed each time.
   - The manifest matched before and after.
   - Test counts: 108/108 protected, 72/72 Python and 1903/1903 Node passed.

## What I read

- **Read in full:**
  - the C234 sheet and `docs/tasks/C-233-PREFINAL-RECOVERY-POLICY.md`;
  - `expired-review-restart.mjs` (66 lines), `checkout-runtime.mjs` (187), `native-purchase-worker.mjs` (78) and `app.py` (494);
  - `desktop-c233-recovery-policy.test.ts` (36) and `desktop_c233_test.py` (23).
- **Targeted searches of unchanged code:**
  - archive packing and size limits in `ended-draft.mjs:9-13`;
  - the store's archive read/write in `task-store.mjs:11-28`;
  - the 16,000,000-byte value limit in `owner-write-frames.mjs:3`;
  - `schedulingRestrictionsKept` in `cart-transfer.mjs:28-30`;
  - `legacyFinalProofClear` in `browser-session.mjs:17-19`;
  - `send` in `interactive_child.py:68-71,101-103`;
  - the test fixture store in `test/fixtures/c185-ended-world.mjs:11`.

## What I checked

**Old flags cannot create generation 3**
- With a generation-2 source and only `additionalRecoveryApproved` (or no flag):
  - the "additional" path needs generation 1;
  - the policy path needs `automaticRecoveryApproved===true` or a policy already carried on the source;
  - the default path rejects any row that already has `desktopReviewRestart`.
  - Result: `SourceUnconfirmed` (`expired-review-restart.mjs:48-49`). Both the C233 and C229 tests cover this.
- The policy path only accepts sources of generation 2 or higher, so the new flag cannot skip generation 2 (`:26-30`).

**Carried policy, exact increments, bound of 16**
- Validation rules (`:37`):
  - generation 2 must carry `additionalRecoveryApproved` and must not carry the policy;
  - generation 3 and later must carry exactly `confirmed-expired-prefinal/v1`;
  - generation must be between 1 and 16.
- Each parent must be exactly one generation lower, and the whole chain back to generation 0 is re-validated (`:41`). That covers the archive/backup equality check (`:40`), the hash, the new task and context identities, and the scheduling restrictions (`:42`).
- A generation-16 source fails the source check (`n<16`). The test checks this directly.
- No unbounded loop was added. The only loop is the existing expiry probe, capped at 150 tries or 15 seconds (`:54`).

**Storage limits**
- Packed archives are capped at 2,000,000 characters, and uncompressed rows and archive files at 16,000,000 bytes.
- The final-history scan stops at 3,000 objects. Packed backups are strings, so a longer chain doesn't use up that budget.
- My own reasoning, not tested: gzip removes most of the base64 overhead, so nested backups grow roughly linearly. Sixteen generations should stay well under the caps. If a cap were hit, packing would fail before `store.put`, and the task row would stay unchanged.

**Every recovery still re-checks the current state before committing** (`:47-64`)
- All four confirmations must be strictly `true`: approved, new context, old executor stopped, same-account orders clear. A carried policy does not carry these over; the C233 test confirms they are still required.
- The checkout URL must be exact, with no query.
- The new context must differ from the old one.
- The executor version and host permission must match.
- The merchant's expiry page must be confirmed by a fresh probe.
- Two bag reads must show the same item from the same page.
- The source must be unchanged both before and after the archive is written.
- The ownership lease must still be held, then the new row is validated before the write.
- The original dates, floors, date cursor, refusals and rejected slots are copied over. The validation only lets them stay the same or get stricter.
- The old outcome stays `'unknown'`, the old slot hold stays `'unknown; expiry is not a release guarantee'`, and `acceptedSlot` is null.

**A final or order reference blocks recovery**
- The source must have `finalIntent===null`, no order reference or detail link, and no final in its history. Each archived ancestor is re-checked against the same rule. Even a known-unreleased final blocks recovery.
- The full runtime test reaches REVIEW with exactly one checkout click, no Add, and no `submitOrder`.

**GUI and worker flags are readiness only**
- The worker's `canPolicyReviewRecovery` is a shape check only (`native-purchase-worker.mjs:20`).
- The GUI shows the policy label and sends the flag only after the operator ticks the checkbox and clicks (`app.py:306,316,413-414`).
- `send` passes the JSON through unfiltered, and the worker forwards only the strict `===true` value (`:51`).
- The runtime then re-checks everything itself (`checkout-runtime.mjs:128`).
- A wrong or stale readiness flag cannot escalate: a non-eligible source is still refused. Recovery only happens on an explicit `restart-payment` command, with no automatic trigger.

## Non-blocking notes

- **N1 – no real on-disk store test for generation 3+.** The C233 Node tests use an in-memory fixture store. Its `readArchive` never returns `ENOENT`, so the backup-fallback path and the on-disk size limits are not exercised for policy generations. Those paths are shared code that C212/C229 test on the real store up to generation 2. The test file imports `DesktopTaskStore` and temp-directory helpers but never uses them, which suggests a planned real-store case is missing.
- **N2 – the policy lasts for the whole chain.** Once generation 3 exists, generations 4–16 are allowed through the normal entry. Each attempt still needs the operator's checkbox and click, and fresh merchant checks. The only way to withdraw the policy is to not start a recovery. This matches C233.

## Limits

- **FAKE tests only.** Everything ran with fake APIs and in-memory or temporary stores. Command 3's full suite also includes loopback headless-Chrome fixtures. There was no Apple traffic, order, payment or slot hold.
- **Not unattended recovery.** This review does not claim a live order or unattended recovery. The new policy source is not installed.
- **Root's live check is unverified by me.** The read-only check of the real generation-2 source is Root's report. I did not see that private source.
- **Hold release still unknown.** Up to 14 more generations may now repeat the "expiry is not a release guarantee" assumption, each after a fresh merchant expiry check.
- **No `git diff`.** It isn't one of the allowed commands, so I identified the C233 changes by reading the code.
- **No R01–R10 mapping.** I didn't re-read `requirements.md` in this session.
- **Caps self-reported.** I can't confirm the model and max effort setting myself. I used about 10 tool calls and about USD 2.2 of 8; I didn't measure elapsed time.
- **No problems to report:** no permission denials, no tool errors, and no file changes.
