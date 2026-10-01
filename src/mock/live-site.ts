// OFFLINE FAKE "remote" checkout site for the local browser rehearsal (C-003). It speaks the INVENTED mock contract
// v0 and is NOT an Apple interface: slot content, capacity, refusal and acceptance are rehearsal fixtures only.
// Its state is persisted in the task directory so it outlives an executor crash, like a remote server would:
// a selection it received before the executor died is still visible to the next owner's read-only reconciliation.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { FormalCapability } from "../engine.ts";
import type { CheckoutPort, PortReply } from "../runner.ts";
import { shortHash, slotKey } from "../plan.ts";
import { atomicWriteJson } from "../app/task-store.ts";
import type { SlotTuple } from "./fake-port.ts";
import { FAKE_CONTEXT, err, lookup, page, res, stepPage } from "./fake-port.ts";

export const SITE_SCENARIOS = {
  "refuse-then-accept": "首选时段显示可选但已满 → 明确拒绝 → 新列表重选 → 接受 → 继续到付款前",
  "submit-confirm": "同上；若已启用一次模拟正式授权，模拟提交被确认",
  "submit-unknown": "同上；若已启用一次模拟正式授权，模拟提交超时且只读查询仍不明",
} as const;
export type SiteScenario = keyof typeof SITE_SCENARIOS;
export type SiteMethod = "observe" | "chooseSlot" | "advance" | "submitOrder" | "lookupOrder";

type SiteSlot = { t: SlotTuple; cap: number; shown: boolean };
type SiteState = {
  schema: "mock-site/v1";
  scenario: SiteScenario;
  seq: number;
  listVersion: number;
  step: "slot-selection" | "checkout-review" | "pre-payment";
  slots: SiteSlot[];
  accepted: SlotTuple | null;
  counts: Record<SiteMethod, number>;
  orders: { opId: string; status: "created" }[];
};

const FAKE_SLOTS: SiteSlot[] = [
  { t: ["FAKE 未授权门店丙", "2099-01-01", "10:00", "10:30"], cap: 3, shown: true },
  { t: ["FAKE 门店甲", "2099-01-09", "10:00", "10:30"], cap: 3, shown: true },
  { t: ["FAKE 门店甲", "2099-01-01", "09:00", "09:30"], cap: 3, shown: true },
  // Displayed as selectable but already full: the first automatic choice is explicitly refused.
  { t: ["FAKE 门店甲", "2099-01-01", "10:00", "10:30"], cap: 0, shown: true },
  { t: ["FAKE 门店甲", "2099-01-01", "10:30", "11:00"], cap: 1, shown: true },
  { t: ["FAKE 门店乙", "2099-01-01", "10:00", "10:30"], cap: 1, shown: true },
];

const zeroCounts = (): Record<SiteMethod, number> => ({ observe: 0, chooseSlot: 0, advance: 0, submitOrder: 0, lookupOrder: 0 });

export type LiveSiteOptions = { latencyMs?: number; hold?: string[] };

export class LiveMockSite implements CheckoutPort {
  readonly kind = "mock" as const;
  readonly label = "FAKE 本机模拟官网（mock contract v0：虚构契约，不是 Apple 页面或接口）";
  #path: string;
  #s: SiteState;
  #latency: number;
  #hold: Set<string>;
  #held: (() => void)[] = [];
  #delays = new Map<ReturnType<typeof setTimeout>, () => void>();
  #closed = false;

  constructor(taskDir: string, o: LiveSiteOptions = {}) {
    const dir = join(taskDir, "mock-site");
    mkdirSync(dir, { recursive: true });
    this.#path = join(dir, "state.json");
    this.#latency = o.latencyMs ?? 500;
    this.#hold = new Set(o.hold ?? []);
    if (existsSync(this.#path)) {
      const v = JSON.parse(readFileSync(this.#path, "utf8")) as SiteState;
      if (!v || v.schema !== "mock-site/v1" || !Array.isArray(v.slots) || !Array.isArray(v.orders)) throw new Error("MockSiteCorrupt: 模拟官网状态无法识别");
      this.#s = v;
    } else {
      this.#s = { schema: "mock-site/v1", scenario: "refuse-then-accept", seq: 0, listVersion: 1, step: "slot-selection", slots: structuredClone(FAKE_SLOTS), accepted: null, counts: zeroCounts(), orders: [] };
      this.#save();
    }
  }

  /** New selection flow for a new run. Remote order records and call counters are kept (they are remote truth). */
  reset(scenario: SiteScenario): void {
    this.#s = { ...this.#s, scenario, listVersion: this.#s.listVersion + 1, step: "slot-selection", slots: structuredClone(FAKE_SLOTS), accepted: null };
    this.#save();
  }
  setHold(methods: string[]): void {
    this.#hold = new Set(methods);
  }
  /** Releases replies held by setHold (tests: "mutation awaiting its reply"). */
  releaseHeld(): void {
    const h = this.#held.splice(0);
    for (const f of h) f();
  }
  get heldCount(): number {
    return this.#held.length;
  }
  /** Called only after the executor has quiesced; settle detached replies without keeping a process alive. */
  close(): void {
    this.#closed = true;
    this.releaseHeld();
    for (const [timer, settle] of this.#delays) {
      clearTimeout(timer);
      settle();
    }
    this.#delays.clear();
  }
  get counts(): Record<SiteMethod, number> {
    return { ...this.#s.counts };
  }
  view() {
    const s = this.#s;
    return {
      fake: true,
      contract: "mock-v0（虚构）",
      scenario: s.scenario,
      scenarioText: SITE_SCENARIOS[s.scenario],
      seq: s.seq,
      step: s.step,
      refTag: shortHash(`v${s.listVersion}`).slice(0, 8),
      slots: s.slots.map((x) => ({ key: slotKey({ store: x.t[0], date: x.t[1], start: x.t[2], end: x.t[3] }), selectable: x.shown && s.step === "slot-selection" })),
      accepted: s.accepted ? slotKey({ store: s.accepted[0], date: s.accepted[1], start: s.accepted[2], end: s.accepted[3] }) : null,
      counts: { ...s.counts },
      orders: s.orders.length,
    };
  }

  #save(): void {
    atomicWriteJson(this.#path, this.#s);
  }
  #ref(i: number): string {
    return `v${this.#s.listVersion}-${i}`;
  }
  #page(): Record<string, unknown> {
    this.#s.seq++;
    if (this.#s.step !== "slot-selection") return stepPage(this.#s.seq, this.#s.step, this.#s.accepted as SlotTuple);
    return page(this.#s.seq, this.#s.slots.map((x) => [x.t, x.shown] as [SlotTuple, boolean]), { refPrefix: `v${this.#s.listVersion}`, context: FAKE_CONTEXT });
  }
  /** Applies the remote side effect immediately (and durably), then delivers the reply after the latency, or holds it. */
  async #reply(method: SiteMethod, effect: () => unknown): Promise<PortReply> {
    if (this.#closed) throw new Error("MockSiteClosed");
    const n = ++this.#s.counts[method];
    const body = effect();
    this.#save();
    // "method" holds every reply of that method; "method@n" holds only its n-th call (test fixtures).
    if (this.#hold.has(method) || this.#hold.has(`${method}@${n}`)) await new Promise<void>((r) => this.#held.push(r));
    else if (this.#latency > 0) await new Promise<void>((r) => {
      const timer = setTimeout(() => {
        this.#delays.delete(timer);
        r();
      }, this.#latency);
      this.#delays.set(timer, r);
    });
    return { body, simulatedMs: this.#latency };
  }

  observe(): Promise<PortReply> {
    return this.#reply("observe", () => this.#page());
  }
  chooseSlot(opId: string, ref: string): Promise<PortReply> {
    return this.#reply("chooseSlot", () => {
      const s = this.#s;
      const i = s.step === "slot-selection" ? s.slots.findIndex((_, k) => this.#ref(k) === ref) : -1;
      if (i < 0) return res(opId, "rejected", { code: "stale-ref", slotRefused: true });
      const slot = s.slots[i];
      if (slot.cap > 0) {
        slot.cap--;
        s.accepted = slot.t;
        s.step = "checkout-review";
        return res(opId, "accepted");
      }
      // Explicit refusal; the page is redrawn (new refs) and now shows the slot as unavailable.
      slot.shown = false;
      s.listVersion++;
      return res(opId, "rejected", { code: "slot-full", slotRefused: true });
    });
  }
  advance(opId: string): Promise<PortReply> {
    return this.#reply("advance", () => {
      if (this.#s.step !== "checkout-review") return res(opId, "rejected", { code: "not-at-review", slotRefused: false });
      this.#s.step = "pre-payment";
      return res(opId, "accepted");
    });
  }
  submitOrder(opId: string, _capability: FormalCapability): Promise<PortReply> {
    return this.#reply("submitOrder", () => {
      this.#s.orders.push({ opId, status: "created" });
      return this.#s.scenario === "submit-unknown" ? err("timeout", opId) : res(opId, "order-confirmed");
    });
  }
  lookupOrder(opId: string): Promise<PortReply> {
    return this.#reply("lookupOrder", () => {
      if (this.#s.scenario === "submit-unknown") return lookup(opId, "unknown");
      return lookup(opId, this.#s.orders.some((o) => o.opId === opId) ? "confirmed" : "not-found");
    });
  }
}
