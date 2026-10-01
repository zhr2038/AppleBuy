// Test helpers: drive the engine directly with classified events (no port), plus temp dirs inside the project.
import { mkdirSync, rmSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import type { Authorization, Command, EngineEvent, FormalCapability, Policy } from "../src/engine.ts";
import { Engine } from "../src/engine.ts";
import type { JournalRecord, JournalSink, LedgerLike } from "../src/journal.ts";
import { MemoryJournal, MemoryLedger } from "../src/journal.ts";
import type { Plan } from "../src/plan.ts";
import { planHash } from "../src/plan.ts";
import { classifyPage, classifyResult } from "../src/observe.ts";
import { FAKE_PLAN } from "../src/mock/scenarios.ts";
import { VirtualClock } from "../src/runner.ts";

export type Driver = { engine: Engine; journal: JournalSink; ledger: LedgerLike; clock: VirtualClock; plan: Plan; ph: string; runId: string; cmds: Command[]; feed: (ev: EngineEvent) => Command[] };

export function driver(o: { plan?: Plan; journal?: JournalSink; ledger?: LedgerLike; capability?: FormalCapability | null; restoreFrom?: JournalRecord[]; runId?: string; policy?: Policy; clock?: VirtualClock } = {}): Driver {
  const plan = o.plan ?? FAKE_PLAN;
  const ph = planHash(plan);
  const clock = o.clock ?? new VirtualClock();
  const journal = o.journal ?? new MemoryJournal();
  const ledger = o.ledger ?? new MemoryLedger();
  const runId = o.runId ?? "run-test";
  const engine = new Engine({ plan, planHash: ph, runId, journal, ledger, now: clock.now, portKind: "mock", capability: o.capability ?? null, restoreFrom: o.restoreFrom, policy: o.policy });
  const cmds: Command[] = [];
  const feed = (ev: EngineEvent) => {
    const out = engine.handle(ev);
    cmds.push(...out);
    return out;
  };
  return { engine, journal, ledger, clock, plan, ph, runId, cmds, feed };
}

export const pageEv = (raw: unknown): EngineEvent => ({ type: "observation", obs: classifyPage(raw) });
export const resultEv = (raw: unknown, fallbackOpId = "op-x"): EngineEvent => {
  const r = classifyResult(raw);
  return { type: "result", opId: r.opId ?? fallbackOpId, outcome: r.outcome };
};
export const dispatches = (cmds: Command[], kind?: string) => cmds.filter((c) => c.type === "dispatch" && (!kind || c.kind === kind)) as Extract<Command, { type: "dispatch" }>[];

/** Simulates the runner's send-time step for a prepared mutation (writes the durable "sent" record, or cancels). */
export function send(d: Driver, cmd: Command): Authorization {
  const auth = d.engine.authorize(cmd);
  d.cmds.push(...auth.followUp);
  return auth;
}

export const TEST_RUNS_ROOT = resolve(import.meta.dirname, "..", ".local", "test-runs");

/** True only for a strict descendant of .local/test-runs (never the root itself, never a sibling via "..", never another drive). */
export function isInsideTestRuns(dir: string): boolean {
  const rel = relative(TEST_RUNS_ROOT, resolve(dir));
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

export function tempDir(name: string): { dir: string; cleanup: () => void } {
  if (!/^[a-z0-9-]{1,40}$/.test(name)) throw new Error(`unsafe temp dir name: ${name}`);
  const dir = resolve(TEST_RUNS_ROOT, `${name}-${randomBytes(4).toString("hex")}`);
  if (!isInsideTestRuns(dir)) throw new Error(`temp dir escapes .local/test-runs: ${dir}`);
  mkdirSync(dir, { recursive: true });
  return {
    dir,
    cleanup: () => {
      // Re-verify at deletion time: recursive removal is only ever applied inside .local/test-runs.
      const target = resolve(dir);
      if (!isInsideTestRuns(target)) throw new Error(`refusing recursive delete outside .local/test-runs: ${target}`);
      rmSync(target, { recursive: true, force: true });
    },
  };
}
export { join };
