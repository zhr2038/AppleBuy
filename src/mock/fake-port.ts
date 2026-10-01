// OFFLINE FAKE PORTS. "mock contract v0" is invented for rehearsal and tests; it is NOT an Apple interface,
// says nothing about Apple's real slot capacity, reservation, refusal or checkout behaviour.
import type { FormalCapability } from "../engine.ts";
import type { Plan } from "../plan.ts";
import { canonicalJson, shortHash } from "../plan.ts";
import type { CheckoutPort, Envelope, PortReply } from "../runner.ts";

export type SlotTuple = readonly [store: string, date: string, start: string, end: string];
export type Method = "observe" | "chooseSlot" | "advance" | "submitOrder" | "lookupOrder";
export type Call = { method: Method; opId?: string; ref?: string; refFresh: boolean };
export type Step = { expect: Method; reply: (c: Call) => PortReply };

export const FAKE_CONTEXT = { productId: "FAKE-P1", quantity: 1, totalCny: 8888, fulfillment: "pickup" };
const C = "mock-v0";

export function page(seq: number, slots: [SlotTuple, boolean][], o: { refPrefix?: string; context?: object; noneSignal?: boolean; lastSelection?: { slot: SlotTuple; status: string } } = {}): Record<string, unknown> {
  const prefix = o.refPrefix ?? `r${seq}`;
  return {
    contract: C, kind: "page", seq, step: "slot-selection", context: o.context ?? FAKE_CONTEXT,
    slots: slots.map(([t, sel], i) => ({ ref: `${prefix}-${i}`, store: t[0], date: t[1], start: t[2], end: t[3], selectable: sel })),
    ...(o.noneSignal !== undefined ? { noneSignal: o.noneSignal } : {}),
    ...(o.lastSelection ? { lastSelection: { slot: tupleObj(o.lastSelection.slot), status: o.lastSelection.status } } : {}),
  };
}
export function tupleObj(t: SlotTuple): Record<string, string> {
  return { store: t[0], date: t[1], start: t[2], end: t[3] };
}
export function stepPage(seq: number, step: "checkout-review" | "pre-payment" | "order-confirmed" | "processing", slot: SlotTuple, context: object = FAKE_CONTEXT): Record<string, unknown> {
  return { contract: C, kind: "page", seq, step, context, acceptedSlot: tupleObj(slot) };
}
export function res(opId: string | undefined, result: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { contract: C, kind: "result", opId, result, ...(result === "accepted" || result === "order-confirmed" ? { evidence: "FAKE-mock-evidence" } : {}), ...extra };
}
export function err(error: "timeout" | "network" | "status", opId?: string): Record<string, unknown> {
  return { contract: C, kind: "error", error, ...(opId ? { opId } : {}) };
}
export function signal(kind: "auth" | "challenge" | "throttle", opId?: string): Record<string, unknown> {
  return { contract: C, kind, ...(opId ? { opId } : {}) };
}
export function lookup(opId: string | undefined, order: "confirmed" | "not-found" | "unknown"): Record<string, unknown> {
  return { contract: C, kind: "lookup", opId, order, ...(order === "confirmed" ? { evidence: "FAKE-lookup" } : {}) };
}
export const r = (body: unknown, extra: { pre?: Envelope[]; post?: Envelope[]; ms?: number } = {}): PortReply => ({ body, pre: extra.pre, post: extra.post, simulatedMs: extra.ms ?? 120 });

function pagesIn(body: unknown): Record<string, any>[] {
  const out: Record<string, any>[] = [];
  const b = body as Record<string, any> | null;
  if (b && typeof b === "object") {
    if (b.kind === "page") out.push(b);
    if (b.freshList && typeof b.freshList === "object") out.push(b.freshList);
  }
  return out;
}

/** Scripted fake: replays a fixed sequence of replies, validates call order and checks every ref against the newest served list. */
export class ScriptedPort implements CheckoutPort {
  readonly kind = "mock" as const;
  readonly label = "FAKE 脚本化模拟端口（mock contract v0：虚构契约，不是 Apple 接口）";
  calls: Call[] = [];
  violations: string[] = [];
  staleRefActions = 0;
  maxConcurrent = 0;
  contexts = new Set<string>();
  #concurrent = 0;
  #steps: Step[];
  #i = 0;
  #newestSeq = -1;
  #freshRefs = new Set<string>();

  constructor(steps: Step[]) {
    this.#steps = steps;
  }
  get remainingSteps(): number {
    return this.#steps.length - this.#i;
  }
  #track(p: Record<string, any>): void {
    if (p.context) this.contexts.add(shortHash(canonicalJson(p.context)));
    if (Number.isInteger(p.seq) && p.seq > this.#newestSeq && Array.isArray(p.slots)) {
      this.#newestSeq = p.seq;
      this.#freshRefs = new Set(p.slots.map((s: any) => s && s.ref));
    }
  }
  async #call(method: Method, opId?: string, ref?: string): Promise<PortReply> {
    this.#concurrent++;
    this.maxConcurrent = Math.max(this.maxConcurrent, this.#concurrent);
    const call: Call = { method, opId, ref, refFresh: ref === undefined || this.#freshRefs.has(ref) };
    if (method === "chooseSlot" && !call.refFresh) this.staleRefActions++;
    this.calls.push(call);
    const step = this.#steps[this.#i++];
    let reply: PortReply;
    if (!step) {
      this.violations.push(`unscripted ${method}`);
      reply = r({ contract: C, kind: "unscripted" }, { ms: 0 });
    } else {
      if (step.expect !== method) this.violations.push(`expected ${step.expect} got ${method}`);
      reply = step.reply(call);
    }
    for (const env of [...(reply.pre ?? []), { ch: "page", body: reply.body } as Envelope, ...(reply.post ?? [])]) {
      if (env.ch !== "control") for (const p of pagesIn(env.body)) this.#track(p);
    }
    await Promise.resolve();
    this.#concurrent--;
    return reply;
  }
  observe(): Promise<PortReply> {
    return this.#call("observe");
  }
  chooseSlot(opId: string, ref: string): Promise<PortReply> {
    return this.#call("chooseSlot", opId, ref);
  }
  advance(opId: string): Promise<PortReply> {
    return this.#call("advance", opId);
  }
  submitOrder(opId: string, _capability: FormalCapability): Promise<PortReply> {
    return this.#call("submitOrder", opId);
  }
  lookupOrder(opId: string): Promise<PortReply> {
    return this.#call("lookupOrder", opId);
  }
  count(m: Method): number {
    return this.calls.filter((c) => c.method === m).length;
  }
}

/** Seeded PRNG (mulberry32) for reproducible benchmark workloads. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type SimConfig = { pCompete: number; pFreshList: number; latencyMs: [number, number]; capMax: number };
export const DEFAULT_SIM: SimConfig = { pCompete: 0.12, pFreshList: 0.5, latencyMs: [60, 240], capMax: 2 };

/** Seeded simulated store for the decision-level benchmark. Competitors consume capacity between calls (simulated). */
export class SimStorePort implements CheckoutPort {
  readonly kind = "mock" as const;
  readonly label = "FAKE 种子模拟门店（mock contract v0：虚构，不代表 Apple 容量或网络）";
  staleRefActions = 0;
  mutations = 0;
  maxConcurrent = 0;
  #concurrent = 0;
  #rand: () => number;
  #cfg: SimConfig;
  #seq = 0;
  #slots: { t: SlotTuple; cap: number; ref: string }[] = [];
  #step: "slot-selection" | "checkout-review" | "pre-payment" = "slot-selection";
  #accepted: SlotTuple | null = null;

  constructor(seed: number, plan: Plan, cfg: SimConfig = DEFAULT_SIM) {
    this.#rand = rng(seed);
    this.#cfg = cfg;
    const halfHours = (from: string, to: string): [string, string][] => {
      const out: [string, string][] = [];
      let m = toMin(from);
      while (m + 30 <= toMin(to)) {
        out.push([fromMin(m), fromMin(m + 30)]);
        m += 30;
      }
      return out;
    };
    const stores = [...plan.stores.map((s) => s.label), "FAKE 未授权门店丙"];
    const dates = [...plan.dates, "2099-01-09"];
    let n = 0;
    for (const d of dates) {
      for (const s of stores) {
        for (const [a, b] of [...halfHours("10:00", "12:00"), ...halfHours("14:00", "16:00")]) {
          const cap = Math.floor(this.#rand() * (cfg.capMax + 2)) - 1; // about a third start full
          this.#slots.push({ t: [s, d, a, b], cap: Math.max(0, cap), ref: `sim-${(n++).toString(36)}` });
        }
      }
    }
  }
  #lat(): number {
    const [lo, hi] = this.#cfg.latencyMs;
    return Math.round(lo + this.#rand() * (hi - lo));
  }
  #compete(): void {
    for (const s of this.#slots) if (s.cap > 0 && this.#rand() < this.#cfg.pCompete) s.cap--;
  }
  #page(): Record<string, unknown> {
    this.#seq++;
    return {
      contract: C, kind: "page", seq: this.#seq, step: "slot-selection", context: FAKE_CONTEXT,
      slots: this.#slots.map((s) => ({ ref: s.ref, store: s.t[0], date: s.t[1], start: s.t[2], end: s.t[3], selectable: s.cap > 0 })),
      ...(this.#slots.every((s) => s.cap === 0) ? { noneSignal: true, slots: [] } : {}),
    };
  }
  async #enter<T>(f: () => T): Promise<T> {
    this.#concurrent++;
    this.maxConcurrent = Math.max(this.maxConcurrent, this.#concurrent);
    const v = f();
    await Promise.resolve();
    this.#concurrent--;
    return v;
  }
  observe(): Promise<PortReply> {
    return this.#enter(() => {
      this.#compete();
      if (this.#step === "slot-selection") return r(this.#page(), { ms: this.#lat() });
      this.#seq++;
      return r(stepPage(this.#seq, this.#step, this.#accepted as SlotTuple), { ms: this.#lat() });
    });
  }
  chooseSlot(opId: string, ref: string): Promise<PortReply> {
    return this.#enter(() => {
      this.mutations++;
      this.#compete();
      const s = this.#slots.find((x) => x.ref === ref);
      if (!s) {
        this.staleRefActions++;
        return r(res(opId, "rejected", { code: "stale-ref", slotRefused: true }), { ms: this.#lat() });
      }
      if (s.cap > 0) {
        s.cap--;
        this.#accepted = s.t;
        this.#step = "checkout-review";
        return r(res(opId, "accepted"), { ms: this.#lat() });
      }
      const fresh = this.#rand() < this.#cfg.pFreshList ? { freshList: this.#page() } : {};
      return r(res(opId, "rejected", { code: "slot-full", slotRefused: true, ...fresh }), { ms: this.#lat() });
    });
  }
  advance(opId: string): Promise<PortReply> {
    return this.#enter(() => {
      this.mutations++;
      this.#step = "pre-payment";
      return r(res(opId, "accepted"), { ms: this.#lat() });
    });
  }
  submitOrder(opId: string, _c: FormalCapability): Promise<PortReply> {
    return this.#enter(() => r(err("status", opId), { ms: 0 }));
  }
  lookupOrder(opId: string): Promise<PortReply> {
    return this.#enter(() => r(lookup(opId, "unknown"), { ms: 0 }));
  }
}

function toMin(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
}
function fromMin(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
