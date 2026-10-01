// Imperative shell: executes engine commands against a port, classifies replies, and measures timing boundaries.
// Every command is re-authorized by the engine immediately before its port call (send-time check), so a command
// emitted earlier but superseded by later events (pause, takeover, deviation, challenge, newer list) is never sent.
// Local decision time is measured with performance.now(); remote time is the port's SIMULATED latency on a virtual clock.
import { performance } from "node:perf_hooks";
import type { Command, ControlAction, Engine, EngineEvent, FormalCapability } from "./engine.ts";
import { TERMINAL_PHASES } from "./engine.ts";
import { classifyPage, classifyResult } from "./observe.ts";

export type Envelope = { ch: "page"; body: unknown } | { ch: "result"; body: unknown } | { ch: "control"; action: ControlAction };
export type PortReply = { body: unknown; pre?: Envelope[]; post?: Envelope[]; simulatedMs: number };

/** Port contract for C-002. Only offline mock implementations exist; `kind` is the literal "mock". */
export interface CheckoutPort {
  readonly kind: "mock";
  readonly label: string;
  observe(): Promise<PortReply>;
  chooseSlot(opId: string, ref: string): Promise<PortReply>;
  advance(opId: string): Promise<PortReply>;
  submitOrder(opId: string, capability: FormalCapability): Promise<PortReply>;
  lookupOrder(opId: string): Promise<PortReply>;
}

export class VirtualClock {
  #t = 0;
  now = (): number => this.#t;
  advance(ms: number): void {
    this.#t += Math.max(0, ms);
  }
  advanceTo(t: number): void {
    if (t > this.#t) this.#t = t;
  }
}

export type Timing = { metric: "T1" | "T2" | "T3"; localMs: number; simulatedRemoteMs: number; viaRefresh: boolean };
export type RunResult = {
  phase: string;
  reason: string;
  steps: number;
  aborted: string | null;
  timings: Timing[];
  simulatedElapsedMs: number;
  /** Virtual time at which the accepting chooseSlot reply (or reconciling evidence) was received; null if never accepted. */
  simulatedMsToAccept: number | null;
  /** Mutations actually sent to the port (after send-time authorization). */
  dispatched: { opId: string; kind: string; ref?: string; slotKey?: string }[];
  /** Prepared mutations the engine cancelled at send time; never reached the port. */
  cancelled: { opId: string; kind: string }[];
};

type OpenMetric = { metric: "T1" | "T2" | "T3"; localMs: number; remoteMs: number; viaRefresh: boolean };

export async function runEngine(engine: Engine, port: CheckoutPort, clock: VirtualClock, opts: { maxSteps?: number } = {}): Promise<RunResult> {
  if ((port.kind as string) !== "mock") throw new Error("RealActionBlocked: rehearsal runner only accepts the offline mock port");
  const maxSteps = opts.maxSteps ?? 500;
  const timings: Timing[] = [];
  const dispatched: RunResult["dispatched"] = [];
  const cancelled: RunResult["cancelled"] = [];
  let open: OpenMetric | null = null;
  let acceptedAt: number | null = null;
  let steps = 0;
  let aborted: string | null = null;

  const closeIfStopped = () => {
    const ph = engine.phase;
    if (TERMINAL_PHASES.has(ph) || ph === "TAKEOVER" || ph === "PAUSED") open = null;
  };
  const feed = (ev: EngineEvent): Command[] => {
    const before = engine.snapshot();
    const t0 = performance.now();
    const cmds = engine.handle(ev);
    const dt = performance.now() - t0;
    const after = engine.snapshot();
    if (open) open.localMs += dt;
    if (!open && before.mutations === 0 && ev.type === "observation" && ev.obs.state === "SLOTS_AVAILABLE") open = { metric: "T1", localMs: dt, remoteMs: 0, viaRefresh: false };
    if (after.refusals > before.refusals) open = { metric: "T2", localMs: dt, remoteMs: 0, viaRefresh: false };
    if (after.acceptedSlot !== null && before.acceptedSlot === null) {
      open = { metric: "T3", localMs: dt, remoteMs: 0, viaRefresh: false };
      acceptedAt = clock.now(); // the last acceptance is the one the run continued with
    }
    closeIfStopped();
    return cmds;
  };

  const queue: Command[] = feed({ type: "start" });
  while (queue.length > 0) {
    if (++steps > maxSteps) {
      aborted = "runner-step-limit";
      break;
    }
    const cmd = queue.shift() as Command;
    // Send-time authorization: the engine re-validates against everything that happened since the command was emitted.
    const t0 = performance.now();
    const auth = engine.authorize(cmd);
    const dt = performance.now() - t0;
    if (open) open.localMs += dt;
    if (!auth.send) {
      if (cmd.type === "dispatch") cancelled.push({ opId: cmd.opId, kind: cmd.kind });
      closeIfStopped();
      queue.push(...auth.followUp);
      continue;
    }
    if (cmd.type === "dispatch") {
      dispatched.push({ opId: cmd.opId, kind: cmd.kind, ref: cmd.ref, slotKey: cmd.slotKey });
      const closes = open && ((open.metric !== "T3" && cmd.kind === "chooseSlot") || (open.metric === "T3" && cmd.kind === "advance"));
      if (open && closes) {
        timings.push({ metric: open.metric, localMs: open.localMs, simulatedRemoteMs: open.remoteMs, viaRefresh: open.viaRefresh });
        open = null;
      }
    }
    let reply: PortReply;
    let channel: "page" | "result";
    let callOpId: string | null = null;
    try {
      if (cmd.type === "observe") {
        clock.advanceTo(cmd.notBefore);
        channel = "page";
        if (open) open.viaRefresh = open.viaRefresh || cmd.reason !== "initial";
        reply = await port.observe();
      } else if (cmd.type === "lookupOrder") {
        channel = "result";
        callOpId = cmd.opId;
        reply = await port.lookupOrder(cmd.opId);
      } else {
        channel = "result";
        callOpId = cmd.opId;
        if (cmd.kind === "chooseSlot") reply = await port.chooseSlot(cmd.opId, cmd.ref ?? "");
        else if (cmd.kind === "advance") reply = await port.advance(cmd.opId);
        else reply = await port.submitOrder(cmd.opId, cmd.capability as FormalCapability);
      }
    } catch {
      // A thrown transport error is a failed query (observe) or an UNKNOWN mutation outcome; never success.
      channel = cmd.type === "observe" ? "page" : "result";
      reply = { body: { contract: "mock-v0", kind: "error", error: "network", ...(callOpId ? { opId: callOpId } : {}) }, simulatedMs: 0 };
    }
    clock.advance(reply.simulatedMs);
    if (open) open.remoteMs += reply.simulatedMs;
    const envs: Envelope[] = [...(reply.pre ?? []), { ch: channel, body: reply.body } as Envelope, ...(reply.post ?? [])];
    for (const env of envs) {
      let ev: EngineEvent;
      if (env.ch === "control") ev = { type: "control", action: env.action };
      else if (env.ch === "page") ev = { type: "observation", obs: classifyPage(env.body) };
      else {
        const r = classifyResult(env.body);
        const direct = env === envs[(reply.pre ?? []).length];
        // A direct reply without a usable opId is attributed to the call it answers, as UNKNOWN.
        const opId = r.opId ?? (direct ? callOpId : null);
        if (opId === null) continue;
        ev = { type: "result", opId, outcome: r.opId === null ? { state: "UNKNOWN", reason: "malformed" } : r.outcome };
      }
      queue.push(...feed(ev));
    }
  }
  const s = engine.snapshot();
  return { phase: s.phase, reason: s.reason, steps, aborted, timings, simulatedElapsedMs: clock.now(), simulatedMsToAccept: acceptedAt, dispatched, cancelled };
}
