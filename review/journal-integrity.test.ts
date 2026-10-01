// Codex-owned independent acceptance tests: R07, A07. Claude may not weaken these.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { FileLedger, MemoryJournal, readJournal } from "../src/journal.ts";

const HASH = "aabbccddeeff0011";
function cleanTemp(dir: string) {
  const absolute = resolve(dir);
  assert.equal(dirname(absolute), resolve(tmpdir()));
  assert.ok(basename(absolute).startsWith("applebuy-review-"));
  rmSync(absolute, { recursive: true, force: true });
}

test("A07: semantically corrupt persisted ledger cannot rearm a consumed purchase plan", () => {
  for (const corrupt of [[{}], [null], [{ planHash: HASH }], [{ planHash: "unrelated", status: "not-a-status" }]]) {
    const dir = mkdtempSync(join(tmpdir(), "applebuy-review-ledger-"));
    try {
      writeFileSync(join(dir, "purchase-ledger.json"), JSON.stringify(corrupt));
      const entry = new FileLedger(dir).find(HASH);
      assert.ok(entry, "Corrupt ledger must report a fail-closed unknown/consumed result, never an empty purchase history");
      assert.equal(entry.status, "unknown");
    } finally {
      cleanTemp(dir);
    }
  }
});

test("A07: valid hash chain without mandatory initial plan binding is not a recoverable journal", () => {
  const dir = mkdtempSync(join(tmpdir(), "applebuy-review-journal-"));
  try {
    const journal = new MemoryJournal();
    journal.append("run-start", { runId: "review-missing-plan" });
    const path = join(dir, "journal.jsonl");
    writeFileSync(path, journal.records().map(r => JSON.stringify(r)).join("\n") + "\n");
    const read = readJournal(path, HASH);
    assert.equal(read.ok, false, "A missing initial planHash must not bypass cross-plan recovery validation");
  } finally {
    cleanTemp(dir);
  }
});
