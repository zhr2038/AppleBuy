// Deterministic executor core (R03-R09). No I/O except through the injected journal/ledger; clock injected.
// Event in -> commands out. Mutations are two-phase: the core PREPARES a command (durable "intent"), and the
// runner must call authorize() immediately before the port call; authorize() re-validates control state, plan,
// page context and list freshness, writes a durable "sent" record (write-ahead), or cancels the prepared op.
import type { Bounds, CheckoutContext, Plan, SlotFields } from "./plan.ts";
import { compareRank, contextViolations, planHash, preferredSlotOffers, rankTuple, shortHash, slotPlanViolation, validatePlan } from "./plan.ts";
import type { ListObservation, MutationOutcome, Observation, ObservedSlot, StepObservation } from "./observe.ts";
import type { Fields, JournalRecord, JournalSink, LedgerLike } from "./journal.ts";

export type OpKind = "chooseSlot" | "advance" | "submitOrder";
export type Policy = "fresh-list" | "naive-remembered";

/** Fake formal capability: usable only against the offline mock. No real-mode capability exists in this codebase. */
export type FormalCapability = { readonly scope: "mock-only"; readonly planHash: string; readonly runId: string; readonly expiresAt: number; consumed: boolean };
export function createMockFormalCapability(planHash: string, runId: string, expiresAt: number): FormalCapability {
  return { scope: "mock-only", planHash, runId, expiresAt, consumed: false };
}

export type Command =
  | { type: "observe"; reason: string; notBefore: number }
  | { type: "dispatch"; opId: string; kind: OpKind; ref?: string; slotKey?: string; capability?: FormalCapability }
  | { type: "lookupOrder"; opId: string };
export type Authorization = { send: boolean; followUp: Command[] };

export type ControlAction = "pause" | "resume" | "takeover" | "stop";
export type EngineEvent =
  | { type: "start" }
  | { type: "observation"; obs: Observation }
  | { type: "result"; opId: string; outcome: MutationOutcome }
  | { type: "control"; action: ControlAction };

export type Phase =
  | "INIT" | "AWAIT_LIST" | "OP_INFLIGHT" | "RECONCILING" | "PAUSED" | "TAKEOVER"
  | "BLOCKED" | "EXHAUSTED" | "MANUAL_VERIFICATION" | "REHEARSAL_ENDPOINT" | "ORDER_CONFIRMED_MOCK" | "STOPPED";
export const TERMINAL_PHASES: ReadonlySet<Phase> = new Set<Phase>(["BLOCKED", "EXHAUSTED", "MANUAL_VERIFICATION", "REHEARSAL_ENDPOINT", "ORDER_CONFIRMED_MOCK", "STOPPED"]);

/** PREPARED = durable intent, not yet sent. SENT = durable "sent" record written right before the port call. */
export type OpStatus = "PREPARED" | "SENT" | "UNKNOWN";
type PendingOp = { opId: string; kind: OpKind; slotKey?: string; fields?: SlotFields; listSeq: number; gen: number; status: OpStatus; reconcileAttempts: number };
type Suppression = { gen: number; pendingNext: boolean };
type GenList = ListObservation & { gen: number };

export type EngineOptions = {
  plan: Plan;
  planHash: string;
  runId: string;
  journal: JournalSink;
  ledger: LedgerLike;
  now: () => number;
  portKind: "mock";
  policy?: Policy;
  capability?: FormalCapability | null;
  restoreFrom?: JournalRecord[];
};

export type Snapshot = {
  phase: Phase;
  reason: string;
  paused: boolean;
  pendingOp: { opId: string; kind: OpKind; slotKey?: string; status: OpStatus } | null;
  acceptedSlot: string | null;
  lastChosen: string | null;
  latestSeq: number;
  gen: number;
  candidates: string[];
  lastValidObservationAt: number | null;
  lastObservationState: string;
  refusals: number;
  refreshes: number;
  queryFailures: number;
  mutations: number;
  epoch: number;
  runId: string;
};

function deepFreeze<T>(v: T): T {
  if (v && typeof v === "object" && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const x of Object.values(v as object)) deepFreeze(x);
  }
  return v;
}

export class Engine {
  #o: EngineOptions;
  #plan: Plan;
  #b: Bounds;
  #policy: Policy;
  #runId: string;
  #phase: Phase = "INIT";
  #reason = "";
  #epoch = 0;
  #opCounter = 0;
  #seqSeen = -1;
  #gen = 0;
  #lastFp: string | null = null;
  #latest: GenList | null = null;
  #lastContext: CheckoutContext | null = null;
  #lastObserveAt = Number.NEGATIVE_INFINITY;
  #lastValidAt: number | null = null;
  #lastObsState = "";
  #pending: PendingOp | null = null;
  #attempts = new Map<string, number>();
  #suppress = new Map<string, Suppression>();
  #refusals = 0;
  #refreshes = 0;
  #queryFailures = 0;
  #mutations = 0;
  #lastRefusalGen = -1;
  #sameGenRefusals = 0;
  #staleCheckGen: number | null = null;
  #staleRefreshUsed = false;
  #accepted: string | null = null;
  #advanced = false;
  #lastChosen: string | null = null;
  #paused = false;
  #restored = false;
  #restoredTerminal: Phase | null = null;
  #restoredHold: Phase | null = null;
  #unsentOnRestore: PendingOp[] = [];
  #remembered: ObservedSlot[] | null = null;
  #tried = new Set<string>();

  constructor(o: EngineOptions) {
    // Structural rehearsal guard (A11): only the offline mock port kind is accepted.
    if ((o.portKind as string) !== "mock") throw new Error("RealActionBlocked: C-002 only runs against the offline mock port");
    // Bind the run to the reviewed conditions (R01/A06): a deep-frozen private copy whose hash must match planHash.
    // Later mutation of the caller-owned plan object can neither widen nor change this run's authorization.
    const bound = deepFreeze(structuredClone(o.plan));
    if (planHash(bound) !== o.planHash) throw new Error("PlanBindingMismatch: plan content does not match the reviewed planHash");
    if ("slotSelection" in bound) {
      if (!validatePlan(bound).plan) throw new Error("InvalidSlotSelectionPlan");
      // The stale-reference benchmark intentionally violates fresh-list semantics; never use it for this plan.
      if (o.policy === "naive-remembered") throw new Error("LastSlotPolicyRequiresFreshList");
    }
    this.#plan = bound;
    this.#o = o;
    this.#b = bound.bounds;
    this.#policy = o.policy ?? "fresh-list";
    this.#runId = o.runId;
    if (o.restoreFrom) this.#replay(o.restoreFrom);
    else this.#j("run-start", { kind: this.#policy, state: o.plan.fake ? "fake-plan" : "user-plan" });
  }

  get phase(): Phase {
    return this.#phase;
  }
  isTerminal(): boolean {
    return TERMINAL_PHASES.has(this.#phase);
  }

  snapshot(): Snapshot {
    const L = this.#latest;
    const candidates = L ? this.#eligibleSorted(L).map((s) => s.key).slice(0, 5) : [];
    const p = this.#pending;
    return {
      phase: this.#phase, reason: this.#reason, paused: this.#paused,
      pendingOp: p ? { opId: p.opId, kind: p.kind, slotKey: p.slotKey, status: p.status } : null,
      acceptedSlot: this.#accepted, lastChosen: this.#lastChosen, latestSeq: this.#seqSeen, gen: this.#gen,
      candidates, lastValidObservationAt: this.#lastValidAt, lastObservationState: this.#lastObsState,
      refusals: this.#refusals, refreshes: this.#refreshes, queryFailures: this.#queryFailures, mutations: this.#mutations,
      epoch: this.#epoch, runId: this.#runId,
    };
  }

  handle(ev: EngineEvent): Command[] {
    if (this.isTerminal()) {
      // Late truth for an unresolved sent op is still recorded, but never triggers an action.
      if (ev.type === "result" && this.#phase === "MANUAL_VERIFICATION" && this.#pending?.opId === ev.opId) return this.#lateTruth(ev.opId, ev.outcome);
      if (ev.type !== "start") this.#j("ignored", { reason: `terminal-${ev.type}`, phase: this.#phase });
      return [];
    }
    switch (ev.type) {
      case "start":
        return this.#onStart();
      case "control":
        return this.#onControl(ev.action);
      case "observation":
        return this.#onObservation(ev.obs);
      case "result":
        return this.#onResult(ev.opId, ev.outcome);
    }
  }

  /**
   * Must be called by the runner immediately before executing a command against the port.
   * A prepared mutation is only sent if pause/takeover/terminal state, plan/context, newest-list freshness and
   * (for submit) capability + ledger still allow it at this instant. Otherwise it is cancelled (never sent).
   */
  authorize(cmd: Command): Authorization {
    const no = (followUp: Command[] = []): Authorization => ({ send: false, followUp });
    if (cmd.type === "observe") {
      const ok = !this.isTerminal() && this.#phase !== "PAUSED" && this.#phase !== "TAKEOVER";
      if (!ok) this.#j("cancelled", { kind: "observe", reason: `blocked-${this.#phase}` });
      return { send: ok, followUp: [] };
    }
    if (cmd.type === "lookupOrder") {
      const p = this.#pending;
      const ok = this.#phase === "RECONCILING" && !!p && p.opId === cmd.opId && p.kind === "submitOrder";
      if (!ok) this.#j("cancelled", { kind: "lookupOrder", opId: cmd.opId, reason: `blocked-${this.#phase}` });
      return { send: ok, followUp: [] };
    }
    const p = this.#pending;
    if (!p || p.opId !== cmd.opId || p.status !== "PREPARED") {
      this.#j("cancelled", { opId: cmd.opId, kind: cmd.kind, reason: "not-current-prepared-op" });
      return no();
    }
    if (this.#blockedForNewActions()) {
      this.#cancel(p, `blocked-${this.#phase}`);
      return no();
    }
    const ctx = this.#lastContext;
    const dev = ctx ? contextViolations(this.#plan, ctx) : ["context-unknown"];
    if (dev.length) {
      this.#cancel(p, "plan-deviation");
      return no(this.#takeover(`plan-deviation-${dev.join("+")}`));
    }
    if (p.kind === "chooseSlot") {
      if (!p.fields || slotPlanViolation(this.#plan, p.fields) || this.#accepted !== null) {
        this.#cancel(p, "slot-not-authorized");
        return no(this.#takeover("plan-deviation-slot"));
      }
      if (this.#policy === "fresh-list") {
        // The click must target the newest applicable list: a redraw or newer list since preparation supersedes it.
        const L = this.#latest;
        const s = L?.slots.find((x) => x.ref === cmd.ref && x.key === p.slotKey);
        if (!L || !s || !s.selectable || this.#suppressed(s.key, L.gen) || !preferredSlotOffers(this.#plan, L.slots).some((offer) => offer.key === s.key)) {
          this.#cancel(p, "superseded-by-newer-list");
          this.#setPhase("AWAIT_LIST", "re-decide-newest-list");
          return no(this.#afterListReady());
        }
      }
    }
    if (p.kind === "advance" && (this.#accepted === null || this.#accepted !== p.slotKey)) {
      this.#cancel(p, "accepted-slot-changed");
      return no(this.#takeover("plan-deviation-accepted-slot-mismatch"));
    }
    if (p.kind === "submitOrder") {
      const cap = cmd.type === "dispatch" ? cmd.capability : undefined;
      const problem = cap ? this.#capabilityProblem(cap) : "missing";
      if (problem) {
        this.#cancel(p, `capability-${problem}`);
        return no(this.#terminal("BLOCKED", `formal-capability-${problem}`));
      }
      if (this.#o.ledger.find(this.#o.planHash)) {
        this.#cancel(p, "ledger-plan-consumed");
        return no(this.#terminal("BLOCKED", "ledger-plan-consumed"));
      }
      (cap as FormalCapability).consumed = true;
      // Ledger first: even a crash right after this line leaves the plan consumed.
      this.#o.ledger.record({ planHash: this.#o.planHash, runId: this.#runId, opId: p.opId, status: "submit-intent" });
    }
    p.status = "SENT";
    this.#mutations++;
    this.#j("sent", { opId: p.opId, kind: p.kind, slotKey: p.slotKey });
    return { send: true, followUp: [] };
  }

  // ---------- journal / phase helpers ----------
  #j(type: string, fields: Fields): void {
    this.#o.journal.append(type, { runId: this.#runId, planHash: this.#o.planHash, epoch: this.#epoch, t: Math.round(this.#o.now()), ...fields });
  }
  #setPhase(p: Phase, reason: string): void {
    if (this.#phase === p && this.#reason === reason) return;
    this.#phase = p;
    this.#reason = reason;
    this.#j("phase", { phase: p, reason });
  }
  #cancelPrepared(reason: string): void {
    const p = this.#pending;
    if (p && p.status === "PREPARED") this.#cancel(p, reason);
  }
  #cancel(p: PendingOp, reason: string): void {
    // A prepared op that never reached the port: journal truth says it was not sent.
    if (this.#pending === p) this.#pending = null;
    if (p.kind === "chooseSlot" && p.slotKey) this.#attempts.set(p.slotKey, Math.max(0, (this.#attempts.get(p.slotKey) ?? 1) - 1));
    this.#j("cancelled", { opId: p.opId, kind: p.kind, slotKey: p.slotKey, reason });
  }
  #terminal(p: Phase, reason: string): Command[] {
    this.#cancelPrepared(`terminal-${p}`);
    this.#setPhase(p, reason);
    return [];
  }
  #takeover(reason: string): Command[] {
    // Human takeover; an already-sent op keeps its pending/unknown truth, a merely prepared one is cancelled.
    this.#cancelPrepared("takeover");
    this.#setPhase("TAKEOVER", reason);
    return [];
  }
  #blockedForNewActions(): boolean {
    return this.#paused || this.#phase === "PAUSED" || this.#phase === "TAKEOVER" || this.isTerminal();
  }

  // ---------- lifecycle ----------
  #onStart(): Command[] {
    if (this.#phase !== "INIT") return [];
    const p = this.#pending;
    if (this.#restored) {
      this.#j("restart", { reason: p ? `open-op-${p.kind}` : "no-open-op" });
      for (const u of this.#unsentOnRestore) this.#j("cancelled", { opId: u.opId, kind: u.kind, slotKey: u.slotKey, reason: "prepared-not-sent-before-restart" });
    }
    if (p && p.kind === "submitOrder") {
      // Final submit outcome unknown: read-only lookup only, never resubmit.
      this.#setPhase("RECONCILING", "restart-unknown-submit");
      return [this.#reconcileCmd(p)];
    }
    if (this.#restoredTerminal) return this.#terminal(this.#restoredTerminal, `restored-${this.#restoredTerminal}`);
    if (this.#o.ledger.find(this.#o.planHash)) return this.#terminal("BLOCKED", "ledger-plan-consumed");
    if (this.#restoredHold) {
      // A pause/takeover in force before the crash stays in force: a restart is not a resume.
      this.#paused = true;
      this.#setPhase(this.#restoredHold, `restored-${this.#restoredHold}`);
      return [];
    }
    if (p) {
      this.#setPhase("RECONCILING", "restart-unknown-op");
      return [this.#reconcileCmd(p)];
    }
    this.#setPhase("AWAIT_LIST", "start");
    return [this.#observeCmd("initial", false)];
  }

  #onControl(action: ControlAction): Command[] {
    this.#j("control", { action });
    if (action === "stop") return this.#terminal("STOPPED", "user-stop");
    if (action === "pause") {
      this.#paused = true;
      this.#cancelPrepared("pause");
      if (this.#phase !== "TAKEOVER") this.#setPhase("PAUSED", "user-pause");
      return [];
    }
    if (action === "takeover") {
      this.#paused = true;
      return this.#takeover("user-takeover");
    }
    if (this.#phase !== "PAUSED" && this.#phase !== "TAKEOVER") {
      this.#j("ignored", { reason: "resume-not-paused", phase: this.#phase });
      return [];
    }
    // Resume: anything the human did is unknown until a fresh observation; old lists are invalid.
    this.#paused = false;
    this.#latest = null;
    this.#staleCheckGen = null;
    this.#staleRefreshUsed = false;
    this.#remembered = null;
    this.#cancelPrepared("superseded-by-resume");
    const p = this.#pending;
    if (p && p.status === "SENT") {
      this.#setPhase("OP_INFLIGHT", "resume-await-sent-op");
      return [];
    }
    if (p) {
      this.#setPhase("RECONCILING", "resume-reconcile");
      return [this.#reconcileCmd(p)];
    }
    this.#setPhase("AWAIT_LIST", "resume");
    return [this.#observeCmd("resume", false)];
  }

  #observeCmd(reason: string, bounded: boolean): Command {
    const now = this.#o.now();
    const notBefore = bounded ? Math.max(now, this.#lastObserveAt + this.#b.minRefreshIntervalMs) : now;
    this.#lastObserveAt = notBefore;
    this.#j("observe-request", { reason, notBefore: Math.round(notBefore) });
    return { type: "observe", reason, notBefore };
  }

  #requestRefresh(reason: string): Command[] {
    if (this.#refreshes >= this.#b.maxRefreshes) return this.#terminal("EXHAUSTED", reason === "confirmed-none" ? "refresh-limit-confirmed-none" : `refresh-limit-${reason}`);
    this.#refreshes++;
    this.#j("refresh", { reason, count: this.#refreshes });
    this.#setPhase("AWAIT_LIST", reason);
    return [this.#observeCmd(reason, true)];
  }

  // ---------- observations ----------
  #onObservation(obs: Observation): Command[] {
    if ("seq" in obs) {
      if (obs.seq <= this.#seqSeen) {
        this.#j("ignored", { reason: "stale-or-duplicate-observation", seq: obs.seq });
        return [];
      }
      this.#seqSeen = obs.seq;
    }
    this.#lastObsState = obs.state;
    switch (obs.state) {
      case "QUERY_FAILED": {
        this.#j("observation", { state: obs.state, reason: obs.reason });
        if (this.#phase === "RECONCILING") return this.#reconcileInconclusive("query-failed");
        if (this.#phase !== "AWAIT_LIST") return [];
        this.#queryFailures++;
        if (this.#queryFailures >= this.#b.maxQueryFailures) return this.#takeover("query-failed-repeatedly");
        return this.#requestRefresh("query-failed");
      }
      case "UNRECOGNIZED_STRUCTURE":
        this.#j("observation", { state: obs.state, reason: obs.detail });
        return this.#takeover(`unrecognized-${obs.detail}`);
      case "AUTH_REQUIRED":
        this.#j("observation", { state: obs.state });
        return this.#takeover("auth-required");
      case "CHALLENGE_OR_THROTTLE":
        // Respect challenge/throttle: all automated refreshing ends here.
        this.#j("observation", { state: obs.state, reason: obs.kind });
        return this.#takeover(`${obs.kind}-detected`);
      case "PROCESSING":
        this.#j("observation", { state: obs.state, seq: obs.seq });
        if (this.#phase === "RECONCILING") return this.#reconcileInconclusive("page-processing");
        if (this.#phase === "AWAIT_LIST") return this.#requestRefresh("page-processing");
        return [];
      case "SLOTS_AVAILABLE":
      case "CONFIRMED_NONE":
        return this.#onList(obs);
      default:
        return this.#onStep(obs);
    }
  }

  #onList(obs: ListObservation): Command[] {
    this.#queryFailures = 0;
    if (obs.fingerprint !== this.#lastFp) {
      this.#gen++;
      this.#lastFp = obs.fingerprint;
    }
    const L: GenList = { ...obs, gen: this.#gen };
    this.#latest = L;
    this.#lastContext = obs.context;
    this.#lastValidAt = this.#o.now();
    for (const s of this.#suppress.values()) {
      if (s.pendingNext) {
        s.gen = Math.max(s.gen, L.gen);
        s.pendingNext = false;
      }
    }
    this.#j("list", {
      seq: obs.seq, gen: L.gen, fingerprint: obs.fingerprint, state: obs.state, count: obs.slots.length,
      selectable: obs.slots.filter((s) => s.selectable).length, refTag: shortHash(obs.slots.map((s) => s.ref).join(",")),
    });
    const dev = contextViolations(this.#plan, obs.context);
    if (dev.length) return this.#takeover(`plan-deviation-${dev.join("+")}`);
    if (this.#phase === "RECONCILING" && this.#pending) {
      const p = this.#pending;
      if (p.kind === "chooseSlot" && obs.lastSelection && obs.lastSelection.key === p.slotKey && obs.lastSelection.status === "rejected") {
        this.#j("reconciled", { opId: p.opId, kind: p.kind, state: "REJECTED", reason: "page-last-selection", slotRefused: 1 });
        this.#pending = null;
        return this.#onSlotRefused(p, null, true);
      }
      return this.#reconcileInconclusive("list-without-evidence");
    }
    return this.#afterListReady();
  }

  #afterListReady(): Command[] {
    if (this.#phase !== "AWAIT_LIST") return []; // buffered while an op is in flight, paused or under takeover
    const L = this.#latest;
    if (!L) return [];
    if (this.#accepted !== null) return this.#takeover("slot-list-after-acceptance");
    if (this.#staleCheckGen !== null) {
      if (L.gen === this.#staleCheckGen) {
        if (this.#staleRefreshUsed) return this.#takeover("LIST_STALE_SUSPECTED");
        this.#staleRefreshUsed = true;
        return this.#requestRefresh("stale-list-check");
      }
      this.#staleCheckGen = null;
      this.#staleRefreshUsed = false;
      this.#sameGenRefusals = 0;
    }
    return this.#decide();
  }

  #suppressed(key: string, gen: number): boolean {
    const s = this.#suppress.get(key);
    return !!s && (s.pendingNext || gen <= s.gen);
  }
  #withinPlanAndCaps(s: ObservedSlot): boolean {
    return s.selectable && slotPlanViolation(this.#plan, s) === null && (this.#attempts.get(s.key) ?? 0) < this.#b.maxAttemptsPerSlot;
  }
  #eligibleSorted(L: GenList): ObservedSlot[] {
    const plan = this.#plan;
    return preferredSlotOffers(plan, L.slots)
      .filter((s) => this.#withinPlanAndCaps(s) && !this.#suppressed(s.key, L.gen))
      .sort((a, b) => compareRank(rankTuple(plan, a), rankTuple(plan, b)));
  }

  #decide(): Command[] {
    const L = this.#latest;
    if (!L) return [this.#observeCmd("need-list", false)];
    let pick: ObservedSlot | null;
    let eligible: number;
    if (this.#policy === "naive-remembered") {
      // Matched baseline B1: remember the first list and walk it with its old refs; reload only when exhausted.
      if (!this.#remembered) {
        this.#remembered = L.slots.filter((s) => this.#withinPlanAndCaps(s)).sort((a, b) => compareRank(rankTuple(this.#plan, a), rankTuple(this.#plan, b)));
        this.#tried.clear();
      }
      const rem = this.#remembered.filter((s) => !this.#tried.has(s.key) && (this.#attempts.get(s.key) ?? 0) < this.#b.maxAttemptsPerSlot);
      eligible = rem.length;
      pick = rem[0] ?? null;
      if (pick) this.#tried.add(pick.key);
      else this.#remembered = null;
    } else {
      const elig = this.#eligibleSorted(L);
      eligible = elig.length;
      pick = elig[0] ?? null;
    }
    this.#j("decision", { seq: L.seq, gen: L.gen, eligible, slotKey: pick?.key, reason: pick ? "best-ranked-eligible" : "no-eligible" });
    if (!pick) return this.#requestRefresh(L.state === "CONFIRMED_NONE" ? "confirmed-none" : "no-eligible-slot");
    return this.#prepare("chooseSlot", { slotKey: pick.key, ref: pick.ref, fields: { store: pick.store, date: pick.date, start: pick.start, end: pick.end }, listSeq: L.seq, gen: L.gen });
  }

  #onStep(obs: StepObservation): Command[] {
    this.#lastContext = obs.context;
    this.#lastValidAt = this.#o.now();
    this.#j("observation", { state: obs.state, seq: obs.seq, slotKey: obs.acceptedSlot.key });
    const dev = contextViolations(this.#plan, obs.context);
    if (dev.length) return this.#takeover(`plan-deviation-${dev.join("+")}`);
    const sv = slotPlanViolation(this.#plan, obs.acceptedSlot);
    if (sv) return this.#takeover(`plan-deviation-accepted-slot-${sv}`);
    const p = this.#pending;
    if (this.#phase === "RECONCILING" && p) {
      const key = obs.acceptedSlot.key;
      if (p.kind === "chooseSlot" && obs.state === "CHECKOUT_REVIEW" && key === p.slotKey) return this.#reconciled(p, { state: "ACCEPTED", evidence: "reconciled-page" });
      if (p.kind === "advance" && obs.state === "PRE_PAYMENT" && key === this.#accepted) return this.#reconciled(p, { state: "ACCEPTED", evidence: "reconciled-page" });
      if (p.kind === "submitOrder" && obs.state === "ORDER_PAGE_CONFIRMED" && key === this.#accepted) return this.#reconciled(p, { state: "ORDER_CONFIRMED", evidence: "reconciled-page" });
      return this.#reconcileInconclusive("step-without-evidence");
    }
    if (this.#phase !== "AWAIT_LIST") return [];
    if (this.#accepted === null || obs.acceptedSlot.key !== this.#accepted) return this.#takeover("plan-deviation-accepted-slot-mismatch");
    if (obs.state === "CHECKOUT_REVIEW") {
      if (this.#advanced) return this.#takeover("page-did-not-advance");
      return this.#continueAfterAccept();
    }
    if (obs.state === "PRE_PAYMENT") return this.#atPrePayment();
    return this.#takeover("unexpected-order-page");
  }

  #continueAfterAccept(): Command[] {
    if (this.#blockedForNewActions()) return [];
    const ctx = this.#lastContext;
    if (!ctx) return this.#takeover("context-unknown");
    const dev = contextViolations(this.#plan, ctx);
    if (dev.length) return this.#takeover(`plan-deviation-${dev.join("+")}`);
    this.#setPhase("AWAIT_LIST", "slot-accepted");
    return this.#prepare("advance", { slotKey: this.#accepted ?? undefined, listSeq: this.#seqSeen, gen: this.#gen });
  }

  #capabilityProblem(c: FormalCapability): string | null {
    if (c.scope !== "mock-only") return "scope";
    if (c.planHash !== this.#o.planHash) return "plan-mismatch";
    if (c.runId !== this.#runId) return "run-mismatch";
    if (this.#o.now() >= c.expiresAt) return "expired";
    if (c.consumed) return "consumed";
    return null;
  }

  #atPrePayment(): Command[] {
    const cap = this.#o.capability ?? null;
    if (!cap) {
      this.#j("endpoint", { reason: "no-formal-capability", slotKey: this.#accepted ?? undefined });
      return this.#terminal("REHEARSAL_ENDPOINT", "reached-mock-pre-payment");
    }
    const problem = this.#capabilityProblem(cap);
    if (problem) return this.#terminal("BLOCKED", `formal-capability-${problem}`);
    return this.#prepare("submitOrder", { slotKey: this.#accepted ?? undefined, listSeq: this.#seqSeen, gen: this.#gen, capability: cap });
  }

  // ---------- mutations ----------
  #prepare(kind: OpKind, d: { slotKey?: string; ref?: string; fields?: SlotFields; listSeq: number; gen: number; capability?: FormalCapability }): Command[] {
    if (this.#blockedForNewActions()) {
      this.#j("blocked-action", { kind, reason: this.#phase });
      return [];
    }
    if (this.#pending) {
      this.#j("blocked-action", { kind, reason: "mutation-in-flight" });
      return [];
    }
    const ctx = this.#lastContext;
    if (!ctx || contextViolations(this.#plan, ctx).length) return this.#takeover("plan-deviation-before-action");
    if (kind === "chooseSlot" && (!d.fields || slotPlanViolation(this.#plan, d.fields))) return this.#takeover("plan-deviation-slot");
    if (kind === "submitOrder") {
      const problem = d.capability ? this.#capabilityProblem(d.capability) : "missing";
      if (problem) return this.#terminal("BLOCKED", `formal-capability-${problem}`);
      if (this.#o.ledger.find(this.#o.planHash)) return this.#terminal("BLOCKED", "ledger-plan-consumed");
    }
    const opId = `op-${this.#epoch}-${++this.#opCounter}`;
    // Durable intent (prepared, not yet sent). The "sent" record is written by authorize() right before the port call.
    this.#j("intent", { opId, kind, slotKey: d.slotKey, listSeq: d.listSeq, gen: d.gen, refTag: d.ref ? shortHash(d.ref) : undefined });
    this.#pending = { opId, kind, slotKey: d.slotKey, fields: d.fields, listSeq: d.listSeq, gen: d.gen, status: "PREPARED", reconcileAttempts: 0 };
    if (kind === "chooseSlot" && d.slotKey) {
      this.#attempts.set(d.slotKey, (this.#attempts.get(d.slotKey) ?? 0) + 1);
      this.#lastChosen = d.slotKey;
    }
    this.#setPhase("OP_INFLIGHT", kind);
    const cmd: { type: "dispatch"; opId: string; kind: OpKind; ref?: string; slotKey?: string; capability?: FormalCapability } = { type: "dispatch", opId, kind };
    if (d.ref) cmd.ref = d.ref;
    if (d.slotKey) cmd.slotKey = d.slotKey;
    if (d.capability) cmd.capability = d.capability;
    return [cmd];
  }

  #onResult(opId: string, outcome: MutationOutcome): Command[] {
    const p = this.#pending;
    if (!p || p.opId !== opId) {
      this.#j("ignored", { reason: "late-or-duplicate-result", opId, state: outcome.state });
      return [];
    }
    if (p.status === "PREPARED") {
      // A result attributable to this op is evidence that it reached the (mock) site.
      p.status = "SENT";
      this.#mutations++;
      this.#j("sent", { opId, kind: p.kind, slotKey: p.slotKey, reason: "inferred-from-result" });
    }
    this.#j("outcome", {
      opId, kind: p.kind, slotKey: p.slotKey, state: outcome.state,
      code: outcome.state === "REJECTED" ? outcome.code : outcome.state === "UNKNOWN" ? outcome.reason : undefined,
      slotRefused: outcome.state === "REJECTED" ? (outcome.slotRefused ? 1 : 0) : undefined,
    });
    return this.#resolve(p, outcome);
  }

  #reconciled(p: PendingOp, outcome: MutationOutcome): Command[] {
    this.#j("reconciled", { opId: p.opId, kind: p.kind, slotKey: p.slotKey, state: outcome.state });
    this.#setPhase("OP_INFLIGHT", "reconciled");
    return this.#resolve(p, outcome);
  }

  #resolve(p: PendingOp, outcome: MutationOutcome): Command[] {
    if (outcome.state === "ACCEPTED" && p.kind !== "submitOrder") {
      this.#pending = null;
      if (this.#phase === "OP_INFLIGHT" || this.#phase === "RECONCILING") this.#setPhase("AWAIT_LIST", `${p.kind}-accepted`);
      if (p.kind === "chooseSlot") {
        this.#accepted = p.slotKey ?? null;
        this.#advanced = false;
        this.#sameGenRefusals = 0;
        this.#staleCheckGen = null;
        this.#j("accepted", { opId: p.opId, slotKey: p.slotKey });
        return this.#continueAfterAccept();
      }
      this.#advanced = true;
      if (this.#blockedForNewActions()) return [];
      return [this.#observeCmd("after-advance", false)];
    }
    if (outcome.state === "REJECTED") {
      this.#pending = null;
      if (p.kind === "chooseSlot" || (p.kind === "advance" && outcome.slotRefused)) return this.#onSlotRefused(p, outcome.freshList ?? null, false);
      if (p.kind === "submitOrder") {
        this.#o.ledger.record({ planHash: this.#o.planHash, runId: this.#runId, opId: p.opId, status: "unknown" });
        return this.#terminal("MANUAL_VERIFICATION", `submit-rejected-${outcome.code}`);
      }
      return this.#takeover(`advance-rejected-${outcome.code}`);
    }
    if (outcome.state === "ORDER_CONFIRMED" && p.kind === "submitOrder") {
      this.#pending = null;
      this.#o.ledger.record({ planHash: this.#o.planHash, runId: this.#runId, opId: p.opId, status: "confirmed" });
      return this.#terminal("ORDER_CONFIRMED_MOCK", "mock-order-confirmed");
    }
    // UNKNOWN, auth, challenge, or an outcome that does not fit the op kind: unknown, never success, never resend.
    if (p.status === "UNKNOWN") return this.#reconcileInconclusive(outcome.state === "UNKNOWN" ? outcome.reason : outcome.state.toLowerCase());
    p.status = "UNKNOWN";
    p.reconcileAttempts = 0;
    if (p.kind === "submitOrder") this.#o.ledger.record({ planHash: this.#o.planHash, runId: this.#runId, opId: p.opId, status: "unknown" });
    this.#j("unknown", { opId: p.opId, kind: p.kind, reason: outcome.state === "UNKNOWN" ? outcome.reason : outcome.state.toLowerCase() });
    if (outcome.state === "AUTH_REQUIRED") return this.#takeover("auth-required-op-unknown");
    if (outcome.state === "CHALLENGE_OR_THROTTLE") return this.#takeover(`${outcome.kind}-op-unknown`);
    if (this.#blockedForNewActions()) return [];
    this.#setPhase("RECONCILING", `unknown-${p.kind}`);
    return [this.#reconcileCmd(p)];
  }

  #reconcileCmd(p: PendingOp): Command {
    if (p.kind === "submitOrder") {
      this.#j("observe-request", { reason: "lookup-order", opId: p.opId });
      return { type: "lookupOrder", opId: p.opId };
    }
    return this.#observeCmd("reconcile", false);
  }

  #reconcileInconclusive(reason: string): Command[] {
    const p = this.#pending;
    if (!p) return [];
    p.reconcileAttempts++;
    this.#j("reconcile", { opId: p.opId, attempt: p.reconcileAttempts, reason });
    if (p.reconcileAttempts >= this.#b.maxReconcileAttempts) return this.#terminal("MANUAL_VERIFICATION", `unknown-${p.kind}`);
    return [this.#reconcileCmd(p)];
  }

  #lateTruth(opId: string, outcome: MutationOutcome): Command[] {
    const p = this.#pending;
    this.#j("outcome", { opId, kind: p?.kind, state: outcome.state, reason: "late-truth-after-manual" });
    if (p && outcome.state === "ORDER_CONFIRMED" && p.kind === "submitOrder") {
      this.#pending = null;
      this.#o.ledger.record({ planHash: this.#o.planHash, runId: this.#runId, opId, status: "confirmed" });
      return this.#terminal("ORDER_CONFIRMED_MOCK", "late-confirmation");
    }
    return [];
  }

  #onSlotRefused(p: PendingOp, freshList: ListObservation | null, fromReconcile: boolean): Command[] {
    const key = p.slotKey ?? "";
    this.#recordRefusal(key, p.gen, !fromReconcile);
    this.#j("refusal", { opId: p.opId, slotKey: key, gen: p.gen, count: this.#refusals });
    if (this.#refusals >= this.#b.maxRefusals) return this.#terminal("EXHAUSTED", "refusal-limit");
    if (this.#sameGenRefusals >= 2 && this.#staleCheckGen === null) this.#staleCheckGen = p.gen;
    if (this.#blockedForNewActions()) return [];
    this.#setPhase("AWAIT_LIST", "after-refusal");
    if (fromReconcile) return this.#afterListReady(); // the reconciling page itself is the fresh list
    if (this.#policy === "naive-remembered") {
      const s = this.#suppress.get(key);
      if (s) s.pendingNext = false;
      if (freshList && freshList.seq > this.#seqSeen) return this.#onObservation(freshList);
      return this.#decide();
    }
    if (freshList && freshList.seq > this.#seqSeen) return this.#onObservation(freshList);
    const L = this.#latest;
    if (L && L.seq > p.listSeq) {
      // A newer list arrived while the op was in flight: it is the newest applicable list.
      const s = this.#suppress.get(key);
      if (s) {
        s.gen = Math.max(s.gen, L.gen);
        s.pendingNext = false;
      }
      return this.#afterListReady();
    }
    if (this.#staleCheckGen !== null) this.#staleRefreshUsed = true;
    return this.#requestRefresh("after-refusal");
  }

  /** Shared by live handling and replay, so a durable outcome alone reproduces refusal memory. */
  #recordRefusal(key: string, gen: number, pendingNext: boolean): void {
    this.#refusals++;
    if (this.#accepted === key) this.#accepted = null;
    this.#advanced = false;
    this.#suppress.set(key, { gen: this.#gen, pendingNext });
    if (gen === this.#lastRefusalGen) this.#sameGenRefusals++;
    else {
      this.#sameGenRefusals = 1;
      this.#lastRefusalGen = gen;
    }
  }

  // ---------- restart ----------
  // Replay derives state only from durable primary facts: intent, sent, cancelled, outcome/reconciled, list, refresh, phase.
  // Derived records ("accepted", "refusal", "decision") are informational; a crash right after an outcome loses nothing.
  #replay(recs: JournalRecord[]): void {
    this.#restored = true;
    type OpTrack = { op: PendingOp; sent: boolean; done: boolean };
    const ops = new Map<string, OpTrack>();
    let lastPhase: Phase | null = null;
    if (recs[0] && typeof recs[0].runId === "string") this.#runId = recs[0].runId;
    for (const r of recs) {
      if (typeof r.epoch === "number") this.#epoch = Math.max(this.#epoch, r.epoch);
      const opId = typeof r.opId === "string" ? r.opId : "";
      const t = ops.get(opId);
      switch (r.type) {
        case "intent": {
          const kind = r.kind as OpKind;
          ops.set(opId, { op: { opId, kind, slotKey: r.slotKey as string | undefined, listSeq: -1, gen: Number(r.gen ?? 0), status: "PREPARED", reconcileAttempts: 0 }, sent: false, done: false });
          this.#opCounter = Math.max(this.#opCounter, Number(opId.split("-")[2] ?? 0));
          if (kind === "chooseSlot" && typeof r.slotKey === "string") this.#attempts.set(r.slotKey, (this.#attempts.get(r.slotKey) ?? 0) + 1);
          break;
        }
        case "sent":
          if (t && !t.sent) {
            t.sent = true;
            this.#mutations++;
          }
          break;
        case "cancelled":
          if (t && !t.sent && !t.done) {
            t.done = true;
            if (t.op.kind === "chooseSlot" && t.op.slotKey) this.#attempts.set(t.op.slotKey, Math.max(0, (this.#attempts.get(t.op.slotKey) ?? 1) - 1));
          }
          break;
        case "outcome":
        case "reconciled": {
          if (!t || t.done) break;
          t.sent = true;
          const key = t.op.slotKey ?? "";
          if (r.state === "ACCEPTED") {
            t.done = true;
            if (t.op.kind === "chooseSlot") {
              this.#accepted = key;
              this.#advanced = false;
            } else if (t.op.kind === "advance") this.#advanced = true;
          } else if (r.state === "REJECTED") {
            t.done = true;
            if (t.op.kind === "chooseSlot" || (t.op.kind === "advance" && r.slotRefused === 1)) this.#recordRefusal(key, t.op.gen, true);
          } else if (r.state === "ORDER_CONFIRMED" && t.op.kind === "submitOrder") t.done = true;
          break;
        }
        case "list":
          this.#gen = Number(r.gen);
          this.#lastFp = String(r.fingerprint);
          break;
        case "refresh":
          this.#refreshes++;
          break;
        case "phase":
          lastPhase = r.phase as Phase;
          break;
      }
    }
    // Lists from before the restart are invalid; refusal memory is kept and suppressed through the first new list.
    for (const s of this.#suppress.values()) {
      s.gen = Math.max(s.gen, this.#gen);
      s.pendingNext = true;
    }
    const open = [...ops.values()].filter((x) => !x.done);
    // Sent but unresolved => UNKNOWN (the crash window after "sent" is never assumed harmless).
    const sentOpen = open.filter((x) => x.sent);
    const last = sentOpen.at(-1);
    this.#pending = last ? { ...last.op, status: "UNKNOWN" } : null;
    // Prepared but never marked sent: the port was never called for it (the "sent" record precedes the port call).
    this.#unsentOnRestore = open.filter((x) => !x.sent).map((x) => x.op);
    for (const u of this.#unsentOnRestore) if (u.kind === "chooseSlot" && u.slotKey) this.#attempts.set(u.slotKey, Math.max(0, (this.#attempts.get(u.slotKey) ?? 1) - 1));
    this.#epoch += 1;
    if (lastPhase && TERMINAL_PHASES.has(lastPhase)) this.#restoredTerminal = lastPhase;
    else if (lastPhase === "PAUSED" || lastPhase === "TAKEOVER") this.#restoredHold = lastPhase;
  }
}
