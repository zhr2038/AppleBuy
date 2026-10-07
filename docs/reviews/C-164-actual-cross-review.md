## C-164 review report

**Verdict: AGREE, limited to the C-163 delta.** That delta is the lossless, bounded owner-pipe framing plus one added whitelist code. I found no path that writes a partial, corrupted or mismatched value. I found no path that reports success for an uncommitted write, and none that turns an unknown write into success or a retry. Four non-blocking findings are below. This verdict does not cover the whole 297-file candidate, a real ledger write, the cart, any order, or the goal.

### Commands (run separately, in order, in the foreground, exact text)
| # | Command | Result |
|---|---|---|
| 1 | `python -B tools/delegation/verify_candidate_manifest.py docs/reviews/C-163-candidate-manifest.json` | ok, 297 files, sha256 `fa561502…eb623`, no mismatches |
| 2 | `node --test test/desktop-c162-large-owner-write.test.ts test/desktop-c093-owner-recovery.test.ts test/desktop-c160-bag-diagnostic.test.ts` | 20 tests, 20 pass (6 C162, 9 C093/C103, 5 C160) |
| 3 | `python -B tools/delegation/run_review_checks.py docs/reviews/C-163-candidate-manifest.json` | All 5 ordered checks passed: manifest; 108/108 focused node tests; 61 Python tests (0 failures, errors or skips); 1579/1579 full node suite; manifest again. Owned-process cleanup was confirmed for every step |

### Scope (C-163 manifest compared with C-160)
- **Changed:**
  - `owner-lease.mjs` (`05793f62` → `2e7f4660`)
  - `owner_lease.py` (`b8f8b756` → `cfc6f4db`)
  - `checkout-diagnostic.mjs` (`1699efea` → `b95bc4c1`)
- **Added:** `owner-write-frames.mjs`, the C162 node test, the C163 Python test.
- **Unchanged:**
  - `task-store`, `cart-transfer`, `browser-session`, `job.js`
  - the C093 test and its child script, the C103 fixture
  - the review tools

  This confirms that the generic 3,000-node bound, the cart depth of 3 and the history checks did not change, and that the protected tests were not edited.

### Framing, buffering and aggregate limits
- **Legacy path:** a write whose whole `put` line is at most 2,000,000 bytes, including the newline, is still sent as one line (`owner-write-frames.mjs:6`). Python checks the same byte limit (`owner_lease.py:134,139`), so the two sides switch paths at exactly the same size.
- **Stream path:**
  - The value is serialised once and checked against 16,000,000 bytes before any frame is produced (`owner-write-frames.mjs:7`).
  - The size check runs on the first `next()` call, which happens before the request is registered or anything is written (`owner-lease.mjs:30`). An oversized value therefore sends nothing.
  - Each chunk is 48,000 raw bytes, which is exactly 64,000 base64 characters, matching Python's limit (`owner_lease.py:42`).
- **Python staging:**
  - Exact key sets; the id must be a real integer (booleans are rejected).
  - Chunks must arrive in strict sequence.
  - Every chunk except the last must be exactly full size, so neither overrun nor underrun is possible.
  - Base64 is decoded with `validate=True`.
  - The full byte length and SHA-256 are checked before `json.loads` and before the existing `put_task` atomic writer runs (`owner_lease.py:51-56`).
  - Staged memory is at most 16 MB.
- **Lossless round trip:** the stream carries the same JSON text that the legacy path would send, and Python parses it with the same `json.loads`, so both paths give identical meaning. No history is pruned anywhere in the delta. `put_task` still replaces only the task key, and its disk format is unchanged.

### Write queue and acknowledgement
- `put` chains onto `writeTail` (`owner-lease.mjs:38`), and all frames for one write are written synchronously within one tick. Frames from different writes therefore cannot interleave, and a later `release\n` always lands after a complete set of frames.
- Python replies only for a legacy `put` or a commit, and only after `put_task` returns. `put_task` does fsync then `os.replace`; there is still no directory fsync, which is unchanged pre-existing behaviour. Node resolves only on a reply with the same unique id and `ok:true`.
- **Holder exits before replying:** the write is rejected as `DesktopOwnerLeaseLost`, so its outcome is unknown and never reported as success.
- **Release during a write:** the frames already sent can still commit, and their success reply is read before the close event, so the outcome is reported accurately. A write still waiting in the queue is refused with `LeaseLost` and nothing is sent.

### Malformed or interrupted streams and a lost holder
- **EOF or `release` mid-stream:** the staged data is discarded and nothing reaches disk. The two real-holder tests show the journal bytes unchanged.
- **Truncated last line:** rejected because it lacks a newline.
- **Mixed or out-of-order frames, a wrong id, a second begin, an expired stage (30 seconds), a bad digest, a partial commit:** each clears the stage, gets a failure reply and writes nothing.
- **Holder dies:** pending writes are rejected as `LeaseLost` and the lost-owner listeners fire.

### Unicode and surrogates
- `JSON.stringify` escapes lone surrogates, so the serialised body is always valid UTF-8.
- Python joins the raw bytes before decoding at commit (`owner_lease.py:47,53`), so a multi-byte character split across a chunk boundary is reassembled correctly.
- `ensure_ascii` output still round-trips lone surrogates and astral characters, the same as the existing C103 behaviour.

### Diagnostic whitelist
- `DesktopOwnerWriteUnconfirmed` is a static string thrown at `owner-lease.mjs:16` and `owner-write-frames.mjs:7`.
- Raw errors, such as a circular-structure `TypeError` message that names properties, still collapse to `CheckoutResultUnconfirmed` at the worker.

### Findings (none blocking)

**F1 (Low; reasoned from the code, not executed).** After a stream fails mid-way, its leftover frames produce stale failure replies. Those can mark the next queued write as unconfirmed and release the lease. The trace:
1. A large write gets id 5. All of its frames are buffered.
2. Python rejects chunk k. A realistic trigger is the 30-second staging age after the host sleeps. Python clears the stage and replies `{5,false}`.
3. Node rejects write 5. The next queued write B starts as id 6.
4. Python keeps reading the leftover frames for id 5 (chunks k+1 to N, then the commit). Each one fails the `not stage` check and replies `{5,false}` (`owner_lease.py:39,147`).
5. Node does not recognise id 5 while id 6 is pending (`owner-lease.mjs:16`). It sets `active=false`, rejects B as `DesktopOwnerWriteUnconfirmed`, and sends `release\n`.
6. Python then processes B's frames and **commits B to disk**, replies `{6,true}` (ignored by Node), and exits. The lost-owner handler fires.

The result fails closed: B is reported as unconfirmed, not as success, and nothing retries it. But one failed stream becomes a lost lease, and the ledger ends up holding B. Either of two fixes would avoid this:
- Python remembers the failed stream's id and drops its later frames without replying.
- Node ignores `ok:false` replies for ids that are already settled.

**F2 (Low, test gaps).** No test runs any of these through the real holder:
- a multi-byte character straddling a 48,000-byte boundary, or lone surrogates on the stream path (the C162 Unicode test checks the frames in JS only; the real-holder large write uses ASCII only);
- a body whose digest matches but which is not a JSON object or not valid UTF-8;
- a `lease.put` above 16 MB, checking that no frame is written and the lease stays usable;
- a stream failing mid-way followed by another write (F1).

**F3 (Info, performance not measured).** The 4,430,312-byte packet fits the archive design: each transfer stores three copies of the source row (the archive's spread fields, `originalSnapshot` and `originalTask`), and 3 × 1,476,251 is about 4.43 MB. Depth 3 blocks a fourth transfer. Even so, every later job write would carry about 4.4 MB of serialisation, hashing, base64, full-ledger parsing and fsync, including the write-ahead before `chooseSlot`. That would add latency to selecting the next slot after a refusal (R04/R05), and it has not been timed. I also cannot show that later job growth stays under 16 MB. If it exceeds it, the write is refused before anything is sent (fail-closed), but the task would stall.

**F4 (Info, outside the delta or not compared).**
- In both paths, a `RecursionError` from very deep nesting is outside Python's caught exception types. The holder exits and the write becomes `LeaseLost`, which fails closed.
- `putOnce` has no reply timeout, so a hung holder blocks the queue indefinitely. I could not tell whether this predates C-163, because no diff was available.

### Requirements mapping
| Req | Status |
|---|---|
| R01 | Plan untouched |
| R02 | Not affected |
| R03, R04, R05 | No logic change; see F3 for latency |
| R06 | An unknown write is reported as `WriteUnconfirmed` or `LeaseLost`, never as success |
| R07 | One write in flight; no retry; unknown records and full archives preserved; transfer guards unchanged |
| R08 | Release or EOF stops the holder without committing staged data |
| R09 | Tests use FAKE data only; no real write by me |
| R10 | One static code added; raw errors still hidden |

### Real evidence vs simulation
These figures come from the task sheet and Codex's verification JSON; I did not observe them:
- the real BAG observation;
- the 1,476,251-byte row and the 4,430,312-byte packet;
- the generic blocked result;
- Root's stub diagnosis;
- the failing physical reproduction before the repair.

All tests used FAKE values in temporary directories. `actualProductionLargeWritePerformed` is false.

### Disclosures
- **Compaction:** none in this round. I read all 16 listed files fresh after this instruction.
- **Extra read:** besides the 16 listed files, I searched the C-160 manifest (read-only, in the repo) to compare scope.
- **No diff or ad-hoc scripts:** only the three commands were allowed, so I could not view the previous versions of the changed files with `git diff`, and the F1 trace was not executed.
- **Test side effects of the allowed commands:**
  - The C162 tests create FAKE temporary directories in the OS temp folder (outside the repo); each test deletes its own, with a prefix guard.
  - The C093 tests leave FAKE fixtures under `.local/test-runs/`; this is existing behaviour.
  - The review runner confirmed cleanup of the process tree for every step.
- **Model and limits:**
  - The environment reports `claude-opus-5-5`; the effort level is checked externally, as the sheet says.
  - The budget display was about $1.11 of $7 at the last check. Per the sheet, that figure is not this round's spend.
  - About 8 of 45 turns used.
  - I did not measure wall-clock time, so I can't confirm the 900-second limit.
- **Access:** no permission denials, no tool errors. No network, browser, real ledger, home directory or profile access.

**Changed files:** none. No memory writes.

**Checkpoint:** C-164 is finished and nothing is pending. Codex decides on F1–F4. The new code has not yet run against the production ledger.
