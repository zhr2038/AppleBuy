// Purchase plan: validation, hashing, eligibility and deterministic ranking (R01).
// Pure module: no I/O except loadPlanFile.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export type ProductAlt = { id: string; model: string; capacity: string; color: string };
export type StoreAlt = { label: string; role: "primary" | "backup" };
export type TimeWindow = { start: string; end: string };
export type PriorityField = "date" | "store" | "window";
export type Bounds = {
  maxRefusals: number;
  maxRefreshes: number;
  maxAttemptsPerSlot: number;
  minRefreshIntervalMs: number;
  maxQueryFailures: number;
  maxReconcileAttempts: number;
};
export type Plan = {
  schema: "pickup-plan/v1";
  fake: boolean;
  label: string;
  timezone: "Asia/Shanghai";
  fulfillment: "pickup";
  quantity: 1;
  maxTotalCny: number;
  products: ProductAlt[];
  stores: StoreAlt[];
  dates: string[];
  windows: TimeWindow[];
  arrival: { earliest: string; latest: string };
  priority: PriorityField[];
  // Omitted preserves the original earliest-slot ranking. This policy never widens dates/windows.
  slotSelection?: "last-offered-per-store-date";
  bounds: Bounds;
  paymentMethodLabel: string;
};

// Local policy proposals, not Apple facts. Users may tighten, never exceed.
export const HARD_CAPS: Bounds = {
  maxRefusals: 20,
  maxRefreshes: 10,
  maxAttemptsPerSlot: 2,
  minRefreshIntervalMs: 600000,
  maxQueryFailures: 5,
  maxReconcileAttempts: 2,
};
export const DEFAULT_BOUNDS: Bounds = {
  maxRefusals: 8,
  maxRefreshes: 5,
  maxAttemptsPerSlot: 2,
  minRefreshIntervalMs: 2000,
  maxQueryFailures: 3,
  maxReconcileAttempts: 2,
};

export type SlotFields = { store: string; date: string; start: string; end: string };
export type CheckoutContext = { productId: string; quantity: number; totalCny: number; fulfillment: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isDate(v: unknown): v is string {
  if (typeof v !== "string" || !DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
export function isTime(v: unknown): v is string {
  return typeof v === "string" && TIME_RE.test(v);
}
function nonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.length <= 80;
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
export function shortHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}
export function planHash(plan: Plan): string {
  return shortHash(canonicalJson(plan));
}

/** Validates an untrusted plan object. Problems are Chinese user-facing blocker messages (R02). */
export function validatePlan(raw: unknown): { plan: Plan | null; problems: string[] } {
  const p: string[] = [];
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return { plan: null, problems: ["计划文件不是 JSON 对象"] };
  const r = raw as Record<string, any>;
  if (r.schema !== "pickup-plan/v1") p.push("schema 必须为 pickup-plan/v1");
  if (typeof r.fake !== "boolean") p.push("fake 必须明确为 true 或 false");
  if (!nonEmpty(r.label)) p.push("缺少计划名称 label");
  if (r.timezone !== "Asia/Shanghai") p.push("timezone 必须为 Asia/Shanghai");
  if (r.fulfillment !== "pickup") p.push("取货方式必须为 pickup（直营店自提），不允许配送");
  if (r.quantity !== 1) p.push("数量必须恰好为 1");
  if (typeof r.maxTotalCny !== "number" || !Number.isFinite(r.maxTotalCny) || r.maxTotalCny <= 0) p.push("缺少有效的含税总价上限 maxTotalCny");
  if (!Array.isArray(r.products) || r.products.length === 0) p.push("缺少授权商品规格 products");
  else {
    const ids = new Set<string>();
    r.products.forEach((x: any, i: number) => {
      if (!x || !nonEmpty(x.id) || !nonEmpty(x.model) || !nonEmpty(x.capacity) || !nonEmpty(x.color)) p.push(`products[${i}] 缺少 id/model/capacity/color`);
      else if (ids.has(x.id)) p.push(`products[${i}] id 重复`);
      else ids.add(x.id);
    });
  }
  if (!Array.isArray(r.stores) || r.stores.length === 0) p.push("缺少授权门店 stores");
  else {
    const labels = new Set<string>();
    r.stores.forEach((x: any, i: number) => {
      if (!x || !nonEmpty(x.label) || (x.role !== "primary" && x.role !== "backup")) p.push(`stores[${i}] 缺少 label 或 role 无效`);
      else if (labels.has(x.label)) p.push(`stores[${i}] 门店重复`);
      else labels.add(x.label);
    });
    if (r.stores.filter((x: any) => x && x.role === "primary").length !== 1) p.push("必须恰好有一家 primary 门店");
  }
  if (!Array.isArray(r.dates) || r.dates.length === 0 || !r.dates.every(isDate)) p.push("dates 必须为非空的 YYYY-MM-DD 列表");
  else if (new Set(r.dates).size !== r.dates.length) p.push("dates 有重复");
  if (!Array.isArray(r.windows) || r.windows.length === 0 || !r.windows.every((w: any) => w && isTime(w.start) && isTime(w.end) && w.start < w.end)) p.push("windows 必须为非空且 start < end 的 HH:MM 时段");
  if (!r.arrival || !isTime(r.arrival.earliest) || !isTime(r.arrival.latest) || r.arrival.earliest >= r.arrival.latest) p.push("arrival.earliest/latest 必须为 HH:MM 且 earliest < latest");
  const pr = r.priority;
  if (!Array.isArray(pr) || pr.length !== 3 || new Set(pr).size !== 3 || !pr.every((f: any) => f === "date" || f === "store" || f === "window")) p.push("priority 必须是 date/store/window 的排列");
  if ("slotSelection" in r) {
    if (r.slotSelection !== "last-offered-per-store-date") p.push("slotSelection 无效，仅支持 last-offered-per-store-date（每天末档）");
    else {
      if (!Array.isArray(pr) || pr[0] !== "date") p.push("每天末档策略必须先按日期排序（priority 首项为 date）");
      if (Array.isArray(r.dates) && r.dates.every(isDate) && r.dates.some((date: string, i: number) => i > 0 && date <= r.dates[i - 1])) p.push("每天末档策略的 dates 必须按实际日期递增，不能滚动扩展日期范围");
    }
  }
  if (!r.bounds || typeof r.bounds !== "object") p.push("缺少 bounds 重试上限");
  else {
    for (const k of Object.keys(HARD_CAPS) as (keyof Bounds)[]) {
      const v = r.bounds[k];
      const min = k === "minRefreshIntervalMs" ? 0 : 1;
      if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > HARD_CAPS[k]) p.push(`bounds.${k} 必须为 ${min}..${HARD_CAPS[k]} 的整数`);
    }
  }
  if (!nonEmpty(r.paymentMethodLabel) || /\d{7,}/.test(r.paymentMethodLabel)) p.push("paymentMethodLabel 只能是付款方式名称标签，不得包含卡号等数字");
  return { plan: p.length === 0 ? (r as Plan) : null, problems: p };
}

export function loadPlanFile(path: string): { plan: Plan | null; problems: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { plan: null, problems: [`无法读取或解析计划文件：${path}`] };
  }
  return validatePlan(raw);
}

export function slotKey(s: SlotFields): string {
  return `${s.store}|${s.date}|${s.start}-${s.end}`;
}

function windowIndex(plan: Plan, s: SlotFields): number {
  return plan.windows.findIndex((w) => s.start >= w.start && s.end <= w.end);
}

/** Returns null when the slot is inside every user condition, otherwise a reason code. */
export function slotPlanViolation(plan: Plan, s: SlotFields): string | null {
  if (!plan.stores.some((x) => x.label === s.store)) return "store-not-authorized";
  if (!plan.dates.includes(s.date)) return "date-not-authorized";
  if (windowIndex(plan, s) < 0) return "window-not-authorized";
  // Conservative: the whole slot must lie inside the user's arrival range.
  if (s.start < plan.arrival.earliest || s.end > plan.arrival.latest) return "arrival-out-of-range";
  return null;
}

/**
 * Apply the optional terminal-offer rule to a complete recognized latest list, BEFORE eligibility.
 * A disabled/refused/out-of-arrival terminal offer excludes earlier siblings; it does not authorize them.
 * Store/date groups stay separate. The caller still enforces every static plan condition and retry bound.
 */
export function preferredSlotOffers<T extends SlotFields>(plan: Plan, offers: readonly T[], floor?: ReadonlyMap<string, SlotEdge>): readonly T[] {
  if (plan.slotSelection === undefined) return offers;
  if (plan.slotSelection !== "last-offered-per-store-date") throw new Error("InvalidSlotSelectionPlan");
  const terminal = terminalOffers(offers);
  return offers.filter((s) => {
    const last = terminal.get(slotGroup(s))!;
    // `floor` is the latest terminal any earlier trustworthy list of this run established for the group:
    // its later omission (or a shorter same-start offer) never authorizes an earlier sibling.
    const min = floor?.get(slotGroup(s));
    return s.start === last.start && s.end === last.end && !(min && laterSlot(min, s));
  });
}

export type SlotEdge = { start: string; end: string };
export function slotGroup(s: { store: string; date: string }): string {
  return JSON.stringify([s.store, s.date]);
}
/** Ordered by start, then end (validated zero-padded HH:MM compares lexically). */
export function laterSlot(a: SlotEdge, b: SlotEdge): boolean {
  return a.start > b.start || (a.start === b.start && a.end > b.end);
}
/** The terminal (latest) offer of each store/date group, whether or not it is selectable. */
export function terminalOffers<T extends SlotFields>(offers: readonly T[]): Map<string, T> {
  const terminal = new Map<string, T>();
  for (const s of offers) {
    const prior = terminal.get(slotGroup(s));
    if (!prior || laterSlot(s, prior)) terminal.set(slotGroup(s), s);
  }
  return terminal;
}
/** Inverse of slotKey(); null for anything that is not a valid key (journal evidence is untrusted on replay). */
export function parseSlotKey(key: unknown): SlotFields | null {
  const m = typeof key === "string" ? /^(.+)\|(\d{4}-\d{2}-\d{2})\|(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(key) : null;
  if (!m || !isDate(m[2]) || !isTime(m[3]) || !isTime(m[4]) || m[3] >= m[4]) return null;
  return { store: m[1], date: m[2], start: m[3], end: m[4] };
}

/** Context deviations; any entry blocks every action (A06). */
export function contextViolations(plan: Plan, c: CheckoutContext): string[] {
  const v: string[] = [];
  if (!plan.products.some((x) => x.id === c.productId)) v.push("product-not-authorized");
  if (c.quantity !== 1) v.push("quantity-not-one");
  if (!Number.isFinite(c.totalCny) || c.totalCny <= 0) v.push("price-unparsed");
  else if (c.totalCny > plan.maxTotalCny) v.push("price-over-limit");
  if (c.fulfillment !== "pickup") v.push("fulfillment-not-pickup");
  return v;
}

/** Total deterministic order: user priority fields, then start time, then key. Never page order. */
export function rankTuple(plan: Plan, s: SlotFields): (number | string)[] {
  const idx: Record<PriorityField, number> = {
    date: plan.dates.indexOf(s.date),
    store: plan.stores.findIndex((x) => x.label === s.store),
    window: windowIndex(plan, s),
  };
  return [...plan.priority.map((f) => idx[f]), s.start, slotKey(s)];
}
export function compareRank(a: (number | string)[], b: (number | string)[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}
