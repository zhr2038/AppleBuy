// Helpers for C-003 application tests: in-process TaskApp, loopback HTTP clients and child-process fixtures.
// Child processes are always this project's own CLI, run with hidden windows, against task directories that are
// verified to be strict descendants of .local/test-runs. Only children spawned here are ever killed.
import { spawn, type ChildProcess } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Plan } from "../src/plan.ts";
import { FAKE_PLAN } from "../src/mock/scenarios.ts";
import { TaskApp } from "../src/app/task-app.ts";
import type { AppOptions } from "../src/app/task-app.ts";
import { isInsideTestRuns, tempDir } from "./helpers.ts";

export const ROOT = resolve(import.meta.dirname, "..");
export const CLI = join(ROOT, "src", "cli.ts");

/** FAKE plan with a short refresh interval so the bounded refresh does not slow tests. */
export const FAST_PLAN: Plan = { ...FAKE_PLAN, bounds: { ...FAKE_PLAN.bounds, minRefreshIntervalMs: 50 } };

export async function openApp(dir: string, o: Partial<AppOptions> = {}): Promise<TaskApp> {
  const r = await TaskApp.open({ taskDir: dir, initialPlan: FAST_PLAN, latencyMs: 2, ...o });
  if (!r.ok) throw new Error(`open failed: ${r.reason} ${r.detail}`);
  return r.app;
}

export async function waitFor(pred: () => boolean | Promise<boolean>, what: string, ms = 8000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await pred()) return;
    await new Promise((r) => setTimeout(r, 15));
  }
  throw new Error(`timed out waiting for: ${what}`);
}

export function phaseOf(app: TaskApp): string | null {
  return app.state().engine.phase;
}

// ---------- loopback HTTP client (a "browser tab") ----------
export class Tab {
  readonly port: number;
  readonly id: string;
  token = "";
  #abort: AbortController | null = null;
  constructor(port: number, id: string) {
    this.port = port;
    this.id = id;
  }
  get base(): string {
    return `http://127.0.0.1:${this.port}`;
  }
  async load(): Promise<this> {
    const html = await (await fetch(`${this.base}/`)).text();
    const m = /name="session-token" content="([0-9a-f]+)"/.exec(html);
    if (!m) throw new Error("no session token in page");
    this.token = m[1];
    return this;
  }
  /** Opens the event stream (what keeps a tab "live" for the control lease). */
  async connect(): Promise<this> {
    this.#abort = new AbortController();
    const r = await fetch(`${this.base}/api/events?token=${this.token}&client=${this.id}`, { signal: this.#abort.signal });
    const reader = r.body?.getReader();
    void (async () => {
      try {
        while (reader && !(await reader.read()).done);
      } catch {
        // aborted
      }
    })();
    return this;
  }
  disconnect(): void {
    this.#abort?.abort();
  }
  async state(): Promise<any> {
    return (await fetch(`${this.base}/api/state`, { headers: { "x-session-token": this.token, "x-client-id": this.id } })).json();
  }
  async post(path: string, body: unknown = {}, headers: Record<string, string> = {}): Promise<{ status: number; body: any }> {
    const r = await fetch(`${this.base}${path}`, {
      method: "POST",
      headers: { origin: this.base, "content-type": "application/json", "x-session-token": this.token, "x-client-id": this.id, ...headers },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  }
}

// ---------- child-process fixtures ----------
export type AppProc = { child: ChildProcess; out: () => string; ready: Promise<{ port: number; previous: string } | { refused: string; status: string | null }>; exit: Promise<number | null> };

export function spawnApp(dir: string, args: string[] = [], env: Record<string, string> = {}): AppProc {
  if (!isInsideTestRuns(dir)) throw new Error(`refusing to spawn outside .local/test-runs: ${dir}`);
  const planFile = join(dir, "..", `${dir.split(/[\\/]/).at(-1)}-plan.json`);
  writeFileSync(planFile, JSON.stringify(FAST_PLAN));
  const child = spawn(process.execPath, [CLI, "app", "--task-dir", dir, "--port", "0", "--latency-ms", "5", "--plan", planFile, ...args], {
    cwd: ROOT, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, APPLEBUY_TEST_HOLD: "", APPLEBUY_TEST_CRASH_AFTER: "", APPLEBUY_TEST_STATUS_DELAY_MS: "", ...env },
  });
  let out = "";
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (d: string) => (out += d));
  const ready = new Promise<any>((done, fail) => {
    child.stdout?.on("data", (d: string) => {
      out += d;
      const m = /APP-READY (\{.*\})/.exec(out);
      if (m) done(JSON.parse(m[1]));
      const n = /APP-REFUSED (\{.*\})/.exec(out);
      if (n) done({ refused: JSON.parse(n[1]).reason, status: JSON.parse(n[1]).status });
    });
    child.once("exit", (code) => fail(new Error(`app exited (${code}) before ready: ${out}`)));
  });
  ready.catch(() => {});
  const exit = new Promise<number | null>((done) => child.once("exit", (code) => done(code)));
  return { child, out: () => out, ready, exit };
}

/** Status read via the CLI in a separate process (not the in-test pipe client). */
export function appStatus(dir: string): Promise<string> {
  return new Promise((done) => {
    const c = spawn(process.execPath, [CLI, "app-status", "--task-dir", dir, "--timeout-ms", "600"], { cwd: ROOT, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    let o = "";
    c.stdout.setEncoding("utf8");
    c.stdout.on("data", (d: string) => (o += d));
    c.once("exit", () => done(/APP-STATUS \{"kind":"(\w+)"\}/.exec(o)?.[1] ?? "none"));
  });
}

/** Temp task dir whose cleanup first terminates this test's own children, then re-verifies containment. */
export function procDir(name: string): { dir: string; track: (p: AppProc) => AppProc; cleanup: () => Promise<void> } {
  const t = tempDir(name);
  const procs: AppProc[] = [];
  const dir = join(t.dir, "task");
  return {
    dir,
    track: (p) => {
      procs.push(p);
      return p;
    },
    cleanup: async () => {
      for (const p of procs) if (p.child.exitCode === null && p.child.signalCode === null) p.child.kill();
      await Promise.all(procs.map((p) => p.exit));
      t.cleanup();
    },
  };
}
