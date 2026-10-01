// Classifies raw payloads of the INVENTED offline "mock contract v0" into a closed state set (R06).
// mock contract v0 is NOT an Apple interface. Real Apple classifiers are blocked on U02-U06 evidence.
import type { CheckoutContext, SlotFields } from "./plan.ts";
import { isDate, isTime, shortHash, slotKey } from "./plan.ts";

export const MOCK_CONTRACT = "mock-v0";

export type ObservedSlot = SlotFields & { ref: string; selectable: boolean; key: string };
export type LastSelection = { key: string; status: "rejected" | "processing" };

export type ListObservation = {
  state: "SLOTS_AVAILABLE" | "CONFIRMED_NONE";
  seq: number;
  context: CheckoutContext;
  slots: ObservedSlot[];
  fingerprint: string;
  noneBasis?: "none-signal" | "all-flagged-unavailable";
  lastSelection?: LastSelection;
};
export type StepObservation = {
  state: "CHECKOUT_REVIEW" | "PRE_PAYMENT" | "ORDER_PAGE_CONFIRMED";
  seq: number;
  context: CheckoutContext;
  acceptedSlot: SlotFields & { key: string };
};
export type Observation =
  | ListObservation
  | StepObservation
  | { state: "PROCESSING"; seq: number }
  | { state: "QUERY_FAILED"; reason: "timeout" | "network" | "status" }
  | { state: "UNRECOGNIZED_STRUCTURE"; detail: string }
  | { state: "AUTH_REQUIRED" }
  | { state: "CHALLENGE_OR_THROTTLE"; kind: "challenge" | "throttle" };

export type MutationOutcome =
  | { state: "ACCEPTED"; evidence: string }
  | { state: "REJECTED"; code: string; slotRefused: boolean; freshList?: ListObservation }
  | { state: "ORDER_CONFIRMED"; evidence: string }
  | { state: "UNKNOWN"; reason: string }
  | { state: "AUTH_REQUIRED" }
  | { state: "CHALLENGE_OR_THROTTLE"; kind: "challenge" | "throttle" };

const SAFE_CODE = /^[a-z0-9-]{1,40}$/;

function isObj(v: unknown): v is Record<string, any> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function parseContext(c: unknown): CheckoutContext | null {
  if (!isObj(c)) return null;
  if (typeof c.productId !== "string" || typeof c.quantity !== "number" || typeof c.totalCny !== "number" || typeof c.fulfillment !== "string") return null;
  return { productId: c.productId, quantity: c.quantity, totalCny: c.totalCny, fulfillment: c.fulfillment };
}
function parseSlotFields(s: unknown): (SlotFields & { key: string }) | null {
  if (!isObj(s)) return null;
  if (typeof s.store !== "string" || s.store.length === 0 || !isDate(s.date) || !isTime(s.start) || !isTime(s.end) || s.start >= s.end) return null;
  const f = { store: s.store, date: s.date, start: s.start, end: s.end };
  return { ...f, key: slotKey(f) };
}

/** Content fingerprint: normalized keys + selectable flags only. Opaque refs are deliberately excluded. */
export function listFingerprint(slots: ObservedSlot[], noneSignal: boolean): string {
  const parts = slots.map((s) => `${s.key}=${s.selectable ? 1 : 0}`).sort();
  return shortHash(`${noneSignal ? "NONE" : "LIST"}#${parts.join(";")}`);
}

export function classifyPage(raw: unknown): Observation {
  if (!isObj(raw) || raw.contract !== MOCK_CONTRACT) return { state: "UNRECOGNIZED_STRUCTURE", detail: "contract-unknown" };
  switch (raw.kind) {
    case "error":
      return raw.error === "timeout" || raw.error === "network" || raw.error === "status"
        ? { state: "QUERY_FAILED", reason: raw.error }
        : { state: "UNRECOGNIZED_STRUCTURE", detail: "error-kind-unknown" };
    case "auth":
      return { state: "AUTH_REQUIRED" };
    case "challenge":
    case "throttle":
      return { state: "CHALLENGE_OR_THROTTLE", kind: raw.kind };
    case "page":
      break;
    default:
      return { state: "UNRECOGNIZED_STRUCTURE", detail: "kind-unknown" };
  }
  if (!Number.isInteger(raw.seq) || raw.seq < 0) return { state: "UNRECOGNIZED_STRUCTURE", detail: "seq-invalid" };
  const seq: number = raw.seq;
  if (raw.step === "processing") return { state: "PROCESSING", seq };
  const context = parseContext(raw.context);
  if (!context) return { state: "UNRECOGNIZED_STRUCTURE", detail: "context-invalid" };
  if (raw.step === "checkout-review" || raw.step === "pre-payment" || raw.step === "order-confirmed") {
    const acceptedSlot = parseSlotFields(raw.acceptedSlot);
    if (!acceptedSlot) return { state: "UNRECOGNIZED_STRUCTURE", detail: "accepted-slot-invalid" };
    const state = raw.step === "checkout-review" ? "CHECKOUT_REVIEW" : raw.step === "pre-payment" ? "PRE_PAYMENT" : "ORDER_PAGE_CONFIRMED";
    return { state, seq, context, acceptedSlot };
  }
  if (raw.step !== "slot-selection") return { state: "UNRECOGNIZED_STRUCTURE", detail: "step-unknown" };
  if (!Array.isArray(raw.slots)) return { state: "UNRECOGNIZED_STRUCTURE", detail: "slots-missing" };
  const noneSignal = raw.noneSignal === true;
  if (raw.noneSignal !== undefined && typeof raw.noneSignal !== "boolean") return { state: "UNRECOGNIZED_STRUCTURE", detail: "none-signal-invalid" };
  const slots: ObservedSlot[] = [];
  const refs = new Set<string>();
  const keys = new Set<string>();
  for (const s of raw.slots) {
    const f = parseSlotFields(s);
    if (!f || typeof s.ref !== "string" || s.ref.length === 0 || s.ref.length > 64 || typeof s.selectable !== "boolean") {
      return { state: "UNRECOGNIZED_STRUCTURE", detail: "slot-field-invalid" };
    }
    if (refs.has(s.ref) || keys.has(f.key)) return { state: "UNRECOGNIZED_STRUCTURE", detail: "slot-duplicate" };
    refs.add(s.ref);
    keys.add(f.key);
    slots.push({ ...f, ref: s.ref, selectable: s.selectable });
  }
  // An empty list is only "none" with an explicit recognized signal; bare emptiness is unrecognized.
  if (slots.length === 0 && !noneSignal) return { state: "UNRECOGNIZED_STRUCTURE", detail: "empty-without-none-signal" };
  if (slots.some((s) => s.selectable) && noneSignal) return { state: "UNRECOGNIZED_STRUCTURE", detail: "contradictory-none-signal" };
  let lastSelection: LastSelection | undefined;
  if (raw.lastSelection !== undefined) {
    const ls = raw.lastSelection;
    const f = isObj(ls) ? parseSlotFields(ls.slot) : null;
    if (!f || (ls.status !== "rejected" && ls.status !== "processing")) return { state: "UNRECOGNIZED_STRUCTURE", detail: "last-selection-invalid" };
    lastSelection = { key: f.key, status: ls.status };
  }
  const fingerprint = listFingerprint(slots, noneSignal);
  const anySelectable = slots.some((s) => s.selectable);
  return {
    state: anySelectable ? "SLOTS_AVAILABLE" : "CONFIRMED_NONE",
    seq,
    context,
    slots,
    fingerprint,
    ...(anySelectable ? {} : { noneBasis: noneSignal ? "none-signal" : "all-flagged-unavailable" }),
    ...(lastSelection ? { lastSelection } : {}),
  } as ListObservation;
}

/** A transport failure or malformed reply to a mutation is UNKNOWN: never success, never refusal, never safe to resend. */
export function classifyResult(raw: unknown): { opId: string | null; outcome: MutationOutcome } {
  if (!isObj(raw) || raw.contract !== MOCK_CONTRACT) return { opId: null, outcome: { state: "UNKNOWN", reason: "malformed" } };
  const opId = typeof raw.opId === "string" ? raw.opId : null;
  switch (raw.kind) {
    case "error":
      return { opId, outcome: { state: "UNKNOWN", reason: raw.error === "timeout" ? "timeout" : raw.error === "network" ? "network" : "transport-failed" } };
    case "auth":
      return { opId, outcome: { state: "AUTH_REQUIRED" } };
    case "challenge":
    case "throttle":
      return { opId, outcome: { state: "CHALLENGE_OR_THROTTLE", kind: raw.kind } };
    case "lookup":
      if (raw.order === "confirmed" && typeof raw.evidence === "string") return { opId, outcome: { state: "ORDER_CONFIRMED", evidence: "lookup-confirmed" } };
      return { opId, outcome: { state: "UNKNOWN", reason: raw.order === "not-found" ? "lookup-not-found" : "lookup-unknown" } };
    case "result":
      break;
    default:
      return { opId, outcome: { state: "UNKNOWN", reason: "malformed" } };
  }
  if (opId === null) return { opId, outcome: { state: "UNKNOWN", reason: "malformed" } };
  if (raw.result === "accepted" && typeof raw.evidence === "string" && raw.evidence.length > 0) return { opId, outcome: { state: "ACCEPTED", evidence: "mock-accepted" } };
  if (raw.result === "order-confirmed" && typeof raw.evidence === "string" && raw.evidence.length > 0) return { opId, outcome: { state: "ORDER_CONFIRMED", evidence: "mock-order-confirmed" } };
  if (raw.result === "rejected" && typeof raw.code === "string" && SAFE_CODE.test(raw.code)) {
    let freshList: ListObservation | undefined;
    if (raw.freshList !== undefined) {
      const f = classifyPage(raw.freshList);
      if (f.state === "SLOTS_AVAILABLE" || f.state === "CONFIRMED_NONE") freshList = f;
    }
    return { opId, outcome: { state: "REJECTED", code: raw.code, slotRefused: raw.slotRefused === true, ...(freshList ? { freshList } : {}) } };
  }
  if (raw.result === "processing") return { opId, outcome: { state: "UNKNOWN", reason: "processing" } };
  return { opId, outcome: { state: "UNKNOWN", reason: "malformed" } };
}
