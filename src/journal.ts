// Sanitized write-ahead journal (hash-chained JSONL) and purchase ledger (R07, R10, A13).
// Records are built from a typed field allowlist, never from page payloads or regex redaction.
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";
import { canonicalJson, shortHash } from "./plan.ts";

type FieldKind = "text" | "hex" | "int" | "opid";
const FIELDS: Record<string, FieldKind> = {
  type: "text", runId: "text", planHash: "hex", epoch: "int", t: "int",
  seq: "int", gen: "int", fingerprint: "hex", refTag: "hex", opId: "opid", kind: "text", slotKey: "text",
  state: "text", phase: "text", reason: "text", code: "text", count: "int", selectable: "int", eligible: "int",
  attempt: "int", listSeq: "int", notBefore: "int", action: "text", slotRefused: "int", groups: "int",
};
const TEXT_RE = /^[\p{L}\p{N} _:|.,\-+/()·]{0,160}$/u;
const LONG_DIGITS = /\d{7,}/; // phone, ID, card or order numbers never belong in the journal
const HEX_RE = /^[0-9a-f]{8,64}$/;
const OPID_RE = /^op-\d{1,4}-\d{1,5}$/;
export const REDACTED = "[已屏蔽]";

export type JournalRecord = Record<string, string | number> & { i: number; type: string; prev: string; h: string };
export type Fields = Record<string, string | number | undefined>;

export function sanitizeFields(fields: Fields): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    const kind = FIELDS[k];
    if (!kind) throw new Error(`journal field not allowlisted: ${k}`);
    if (kind === "int") {
      if (typeof v !== "number" || !Number.isInteger(v)) throw new Error(`journal field ${k} must be an integer`);
      out[k] = v;
    } else if (typeof v !== "string") {
      throw new Error(`journal field ${k} must be a string`);
    } else if (kind === "hex") {
      out[k] = HEX_RE.test(v) ? v : REDACTED;
    } else if (kind === "opid") {
      out[k] = OPID_RE.test(v) ? v : REDACTED;
    } else {
      out[k] = TEXT_RE.test(v) && !LONG_DIGITS.test(v) ? v : REDACTED;
    }
  }
  return out;
}

export interface JournalSink {
  append(type: string, fields: Fields): JournalRecord;
  records(): JournalRecord[];
}

function chain(prev: string, i: number, type: string, fields: Fields): JournalRecord {
  const body = { ...sanitizeFields({ ...fields, type }), i, prev };
  return { ...body, h: shortHash(canonicalJson(body)) } as JournalRecord;
}

export class MemoryJournal implements JournalSink {
  #recs: JournalRecord[] = [];
  append(type: string, fields: Fields): JournalRecord {
    const last = this.#recs[this.#recs.length - 1];
    const rec = chain(last ? last.h : "0000000000000000", this.#recs.length, type, fields);
    this.#recs.push(rec);
    return rec;
  }
  records(): JournalRecord[] {
    return this.#recs;
  }
}

/** Durable journal: each record is written and fsynced before append() returns (write-ahead). */
export class FileJournal implements JournalSink {
  #path: string;
  #recs: JournalRecord[];
  constructor(path: string, existing: JournalRecord[] = []) {
    this.#path = path;
    this.#recs = [...existing];
    mkdirSync(dirname(path), { recursive: true });
  }
  get path(): string {
    return this.#path;
  }
  append(type: string, fields: Fields): JournalRecord {
    const last = this.#recs[this.#recs.length - 1];
    const rec = chain(last ? last.h : "0000000000000000", this.#recs.length, type, fields);
    const fd = openSync(this.#path, "a");
    try {
      writeSync(fd, `${JSON.stringify(rec)}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    this.#recs.push(rec);
    return rec;
  }
  records(): JournalRecord[] {
    return this.#recs;
  }
}

export type JournalReadError = "missing" | "unreadable" | "empty" | "truncated" | "corrupt-json" | "hash-chain" | "not-allowlisted" | "missing-run-start" | "missing-plan-binding" | "plan-mismatch";
/** `code` is the filesystem error code of an "unreadable" journal; OS messages (which carry local paths) are never kept. */
export type JournalReadFailure = { ok: false; error: JournalReadError; line: number; code?: string };

/** Error code only, never the message: messages can carry local paths. */
export function errorCode(e: unknown): string {
  const code = (e as { code?: unknown } | null)?.code;
  if (typeof code === "string" && /^E[A-Z0-9_]{1,40}$/.test(code)) return code;
  const name = e instanceof Error ? e.name : "";
  return /^[A-Za-z]{1,40}$/.test(name) ? name : "unknown";
}

/** Verifies the whole chain. Truncated, corrupted, unreadable or foreign-plan journals are refused, never partially trusted. */
export function readJournal(path: string, expectedPlanHash: string): { ok: true; records: JournalRecord[] } | JournalReadFailure {
  // A single read with no prior existence check: a journal that disappears or becomes unreadable between a check
  // and the read cannot escape as an exception. A failed read is refused as a whole and is never retried here.
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    const code = errorCode(e);
    return code === "ENOENT" ? { ok: false, error: "missing", line: 0 } : { ok: false, error: "unreadable", line: 0, code };
  }
  if (text.length === 0) return { ok: false, error: "empty", line: 0 };
  if (!text.endsWith("\n")) return { ok: false, error: "truncated", line: text.split("\n").length };
  const lines = text.slice(0, -1).split("\n");
  const recs: JournalRecord[] = [];
  let prev = "0000000000000000";
  for (let n = 0; n < lines.length; n++) {
    let rec: any;
    try {
      rec = JSON.parse(lines[n]);
    } catch {
      return { ok: false, error: "corrupt-json", line: n + 1 };
    }
    if (!rec || typeof rec !== "object" || rec.i !== n || rec.prev !== prev || typeof rec.h !== "string") return { ok: false, error: "hash-chain", line: n + 1 };
    const { h, i, prev: p, ...fields } = rec;
    try {
      sanitizeFields(fields);
    } catch {
      return { ok: false, error: "not-allowlisted", line: n + 1 };
    }
    if (shortHash(canonicalJson({ ...fields, i, prev: p })) !== h) return { ok: false, error: "hash-chain", line: n + 1 };
    if (n === 0 && rec.type !== "run-start") return { ok: false, error: "missing-run-start", line: 1 };
    // Plan binding is mandatory on the initial record, and any later record carrying a planHash must agree.
    if (n === 0 && rec.planHash !== expectedPlanHash) return { ok: false, error: rec.planHash === undefined ? "missing-plan-binding" : "plan-mismatch", line: 1 };
    if (rec.planHash !== undefined && rec.planHash !== expectedPlanHash) return { ok: false, error: "plan-mismatch", line: n + 1 };
    recs.push(rec as JournalRecord);
    prev = h;
  }
  return { ok: true, records: recs };
}

export type LedgerEntry = { planHash: string; runId: string; opId: string; status: "submit-intent" | "unknown" | "confirmed" };

export interface LedgerLike {
  find(planHash: string): LedgerEntry | null;
  record(entry: LedgerEntry): void;
}

export class MemoryLedger implements LedgerLike {
  entries: LedgerEntry[] = [];
  find(planHash: string): LedgerEntry | null {
    return this.entries.filter((e) => e.planHash === planHash).at(-1) ?? null;
  }
  record(entry: LedgerEntry): void {
    this.entries.push(entry);
  }
}

/** Purchase ledger: once any submit intent exists for a plan, no run may start or submit for it until a human clears it. */
export class FileLedger implements LedgerLike {
  #path: string;
  constructor(stateDir: string) {
    this.#path = join(stateDir, "purchase-ledger.json");
    mkdirSync(stateDir, { recursive: true });
  }
  /** Returns null when the file exists but is unreadable or any entry is semantically invalid (fail closed). */
  #load(): LedgerEntry[] | null {
    if (!existsSync(this.#path)) return [];
    try {
      const v: unknown = JSON.parse(readFileSync(this.#path, "utf8"));
      if (Array.isArray(v) && v.every(isLedgerEntry)) return v;
    } catch {
      // fall through
    }
    return null;
  }
  find(planHash: string): LedgerEntry | null {
    const all = this.#load();
    // Corruption never looks like empty history: every plan is treated as consumed/unknown until a human verifies.
    if (all === null) return { planHash, runId: "ledger-unreadable", opId: "op-0-0", status: "unknown" };
    return all.filter((e) => e.planHash === planHash).at(-1) ?? null;
  }
  record(entry: LedgerEntry): void {
    const prior = this.#load();
    // Never overwrite a corrupt ledger (it is evidence); keep it and refuse to proceed.
    if (prior === null) throw new Error("LedgerCorrupt: 购买台账已损坏，需人工核验，不会覆盖");
    const all = [...prior, { ...sanitizeLedger(entry) }];
    const tmp = `${this.#path}.tmp`;
    writeFileSync(tmp, JSON.stringify(all, null, 2));
    const fd = openSync(tmp, "r+");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, this.#path);
  }
  /** Human-only clearing after independent verification; requires the exact Chinese confirmation phrase. */
  clear(planHash: string, confirmation: string): boolean {
    if (confirmation !== "我已人工核验该计划的订单状态") return false;
    const all = this.#load();
    if (all === null) return false; // a corrupt ledger must be inspected by hand, not silently rewritten
    const kept = all.filter((e) => e.planHash !== planHash);
    writeFileSync(this.#path, JSON.stringify(kept, null, 2));
    return true;
  }
}

const LEDGER_STATUS = new Set(["submit-intent", "unknown", "confirmed"]);
function isLedgerEntry(e: unknown): e is LedgerEntry {
  if (!e || typeof e !== "object" || Array.isArray(e)) return false;
  const o = e as Record<string, unknown>;
  return typeof o.planHash === "string" && HEX_RE.test(o.planHash) && typeof o.runId === "string" && typeof o.opId === "string" && typeof o.status === "string" && LEDGER_STATUS.has(o.status);
}

function sanitizeLedger(e: LedgerEntry): LedgerEntry {
  const s = sanitizeFields({ planHash: e.planHash, runId: e.runId, opId: e.opId, state: e.status });
  return { planHash: String(s.planHash), runId: String(s.runId), opId: String(s.opId), status: e.status };
}
