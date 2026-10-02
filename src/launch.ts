// C-007 launch transition monitor: maintenance/recovery epochs, relative-date binding and the observation-to-decision
// boundary for real-page observations. It never acts on a page and no real mutation port exists in this build.
// Decisions about which slot to choose stay in the core plan/engine rules (preferredSlotOffers, floors, bounds).
import type { Plan, SlotFields } from "./plan.ts";
import { compareRank, contextViolations, isDate, isTime, laterSlot, planHash, preferredSlotOffers, rankTuple, slotGroup, slotKey, slotPlanViolation, terminalOffers, validatePlan } from "./plan.ts";

export type PageStage =
  | "PRELAUNCH" | "MAINTENANCE" | "RENDERING_INCOMPLETE" | "ENTRY_AVAILABLE" | "ENTRY_BLOCKED" | "SLOT_SELECTION"
  | "SIGN_IN_REQUIRED" | "CONSENT_REQUIRED" | "RATE_LIMITED" | "ACCESS_RESTRICTED" | "SERVICE_UNAVAILABLE"
  | "TRANSPORT_FAILED" | "PLAN_MISMATCH" | "UNKNOWN_STRUCTURE" | "RESTORED_UNOBSERVED";

export type Fact = { status: 'verified'|'missing'|'ambiguous'; id?: string; text?: string; value?: number|string; provenance?: string };
export type PageObservation = {
  schema: 'applebuy-page-observation/v1'; stage: PageStage; detail: string; observedAt: string;
  conditions: null | { product: Fact; store: Fact; price: Fact; quantity: Fact; fulfillment: Fact };
  continue: null | {enabled: boolean; ref: string|null};
  dates: {label: string; date: string|null; yearShown: boolean; enabled: boolean; selected: boolean; ref: string|null}[];
  selectedDate: string|null;
  times: {start: string; end: string; enabled: boolean; selected: boolean; ref: string|null}[];
  timePlaceholderSelected: boolean|null; listCompleteness: 'unverified'|'synthetic-complete'; anchors: string[];
};
export type Pending = { opId: string; kind: "chooseSlot" | "advance" | "submitOrder"; status: "in-flight" | "unknown"; epoch: number };
export type Binding = { dates: string[]; boundAt: string; source: "synthetic-sample"; realBindingVerified: false };
/**
 * The first N visible, enabled dates of the first complete recognized list. Frozen once, even when not bindable.
 * origin "legacy-unknown" (no dates, never bindable): a v2 state had observed pages but saved no scope, so whether it
 * had already seen an unbindable first list cannot be shown. It is never replaced and never grants candidates.
 */
export type DateScope = { dates: string[]; frozenAt: string; bindable: boolean; origin?: "legacy-unknown" };
/** A rejected input (bad shape, stale, future, duplicate pending): nothing was changed; it is not evidence damage. */
export class LaunchInputRejected extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.code = code; }
}
export type ObservationSource = 'synthetic-sample'|'imported-observation';
type Options = {taskId: string; planHash: string; relativeDates: number; plan: Plan};
export type Next =
  | { kind: "wait"; reason: string }
  | { kind: "reconcile"; reason: string }
  | { kind: "handoff"; reason: string }
  | { kind: "candidates"; reason: string; epoch: number; obsSeq: number; offers: (SlotFields & { key: string; ref: string; selectable: boolean })[] };

const INTERRUPTED = new Set<PageStage>(["MAINTENANCE", "TRANSPORT_FAILED", "SERVICE_UNAVAILABLE", "RATE_LIMITED", "RENDERING_INCOMPLETE", "UNKNOWN_STRUCTURE", "RESTORED_UNOBSERVED"]);
const HANDOFF = new Set<PageStage>(["SIGN_IN_REQUIRED", "CONSENT_REQUIRED", "RATE_LIMITED", "ACCESS_RESTRICTED", "PLAN_MISMATCH", "UNKNOWN_STRUCTURE"]);
// futureSkewMs: an observation may not claim a time later than the receiving clock plus this skew.
export const LIMITS = { renderIncompleteObservations: 5, history: 50, futureSkewMs: 60_000 };

export const STAGE_ZH: Record<PageStage, string> = {
  PRELAUNCH: "未开售：页面显示暂未发售/暂不提供取货，继续不可用",
  MAINTENANCE: "页面像维护提示（维护文案未经官网证实）：等待，不做任何操作",
  RENDERING_INCOMPLETE: "页面尚未加载完成：等待完整页面，不据此判断有无货",
  ENTRY_AVAILABLE: "购买入口已恢复且继续可用：这不代表有货、时段已占用或可以购买",
  ENTRY_BLOCKED: "购买入口可见但继续不可用，原因未知",
  SLOT_SELECTION: "已识别取货日期/时段页面",
  SIGN_IN_REQUIRED: "需要本人登录或选择身份：请人工处理，程序不填写任何账户信息",
  CONSENT_REQUIRED: "需要本人阅读并同意隐私告知：请人工处理，程序不替你勾选",
  RATE_LIMITED: "官网限制访问频率：停止观察并等待，不重试轰炸",
  ACCESS_RESTRICTED: "官网拒绝访问或出现验证：请人工处理",
  SERVICE_UNAVAILABLE: "官网暂时不可用（无维护说明，不能当作维护或无货）",
  TRANSPORT_FAILED: "网络或请求失败：不能当作无货或成功",
  PLAN_MISMATCH: "页面商品/门店与计划不符：停止自动操作，请人工核对",
  UNKNOWN_STRUCTURE: "无法识别的页面：停止自动操作，请人工接管",
  RESTORED_UNOBSERVED: "已从记录恢复：旧页面控件全部作废，需重新观察当前页面",
};

export type MonitorState = {
  schema: "applebuy-launch-monitor/v3"; taskId: string; planHash: string; relativeDates: number;
  epoch: number; obsSeq: number; stage: PageStage; detail: string; lastValid: { at: string; stage: PageStage } | null;
  scope: DateScope | null; binding: Binding | null; pending: Pending | null; paused: boolean; incomplete: number; floors: SlotFields[]; lastObservedAt: string|null;
  history: { at: string; stage: PageStage; detail: string; epoch: number }[];
};

const iso = (v:unknown):v is string => typeof v==='string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(v) && Number.isFinite(Date.parse(v));
const DETAIL_CODES = new Set(['not-yet-observed','restart','no-recognized-stage','busy-region','maintenance-anchor-unverified','human-only-consent','human-only-identity','ambiguous-continue','ambiguous-time-control','time-control-not-rendered','unrecognized-time-option','invalid-or-duplicate-time','ambiguous-date-control','date-control-unrecognized','duplicate-date','date-selection-unrecognized','multiple-times-selected','product-missing','product-ambiguous','store-missing','store-ambiguous','pickup-date-time-recognized','product-heading-mismatch','prelaunch-text-with-enabled-continue','prelaunch','continue-not-found','continue-enabled','continue-disabled-without-prelaunch-text','timeout','network','http-429','http-401','http-403','http-503-without-page-evidence','http-status','render-did-not-complete']);
DETAIL_CODES.add('page-owner-changed');
const code = (v:unknown):v is string => typeof v==='string' && DETAIL_CODES.has(v);
const obj = (v:unknown):v is Record<string,any> => !!v && typeof v==='object' && !Array.isArray(v);
const keys = (v:Record<string,any>, allowed:string[]) => Object.keys(v).every(k=>allowed.includes(k));
const stage = (v:unknown):v is PageStage => typeof v==='string' && Object.hasOwn(STAGE_ZH,v);
const validRef = (v:unknown) => v===null || typeof v==='string' && /^(?:n\d+|0(?:\.\d+)*)$/.test(v);
function validPending(p:unknown,epoch:number):boolean {
  return p===null || obj(p) && keys(p,['opId','kind','status','epoch']) && typeof p.opId==='string' && /^[a-z0-9-]{1,60}$/.test(p.opId) && ['chooseSlot','advance','submitOrder'].includes(p.kind) && ['in-flight','unknown'].includes(p.status) && Number.isSafeInteger(p.epoch) && p.epoch>=1 && p.epoch<=epoch;
}
/** Accept only the small sanitized observer schema. Never persist raw HTML, URLs or arbitrary private fields. */
export function validateObservation(v:unknown):v is PageObservation {
  if(!obj(v)||!keys(v,['schema','stage','detail','observedAt','conditions','continue','dates','selectedDate','times','timePlaceholderSelected','listCompleteness','anchors'])||v.schema!=='applebuy-page-observation/v1'||!stage(v.stage)||!code(v.detail)||!iso(v.observedAt)||!['unverified','synthetic-complete'].includes(v.listCompleteness)) return false;
  if(!Array.isArray(v.anchors)||v.anchors.length>12||v.anchors.some((a:any)=>typeof a!=='string'||a.length>180||/[<>@\r\n]/.test(a))) return false;
  if(v.conditions!==null) {
    if(!obj(v.conditions)||!keys(v.conditions,['product','store','price','quantity','fulfillment'])||Object.keys(v.conditions).length!==5) return false;
    for(const f of Object.values(v.conditions)) {
      if(!obj(f)||!keys(f,['status','id','text','value','provenance'])||!['verified','missing','ambiguous'].includes(f.status)) return false;
      for(const x of [f.id,f.text,f.provenance,typeof f.value==='string'?f.value:undefined]) if(x!==undefined&&(typeof x!=='string'||x.length>180||/[<>@\r\n]/.test(x))) return false;
      if(typeof f.value==='number'&&!Number.isFinite(f.value)) return false;
      if(f.value!==undefined&&!['string','number'].includes(typeof f.value)) return false;
    }
  }
  if(v.continue!==null&&(!obj(v.continue)||!keys(v.continue,['enabled','ref'])||typeof v.continue.enabled!=='boolean'||!validRef(v.continue.ref))) return false;
  if(!Array.isArray(v.dates)||v.dates.length>64||!Array.isArray(v.times)||v.times.length>512||!(v.selectedDate===null||isDate(v.selectedDate))||!(v.timePlaceholderSelected===null||typeof v.timePlaceholderSelected==='boolean')) return false;
  for(const d of v.dates) if(!obj(d)||!keys(d,['label','date','yearShown','enabled','selected','ref'])||typeof d.label!=='string'||d.label.length>80||/[<>@\r\n]/.test(d.label)||!(d.date===null||isDate(d.date))||typeof d.yearShown!=='boolean'||(d.date!==null&&!d.yearShown)||typeof d.enabled!=='boolean'||typeof d.selected!=='boolean'||!validRef(d.ref)) return false;
  for(const t of v.times) if(!obj(t)||!keys(t,['start','end','enabled','selected','ref'])||!isTime(t.start)||!isTime(t.end)||t.start>=t.end||typeof t.enabled!=='boolean'||typeof t.selected!=='boolean'||!validRef(t.ref)) return false;
  return new Set(v.dates.map((d:any)=>d.date??d.label)).size===v.dates.length && new Set(v.times.map((t:any)=>`${t.start}-${t.end}`)).size===v.times.length && v.times.filter((t:any)=>t.selected).length<=1;
}
const dateList = (v:unknown,max:number) => Array.isArray(v)&&v.length>=1&&v.length<=max&&new Set(v).size===v.length&&v.every(isDate)&&v.join()===[...v].sort().join();
function validState(s:MonitorState,o:Options):boolean {
  if(!keys(s,['schema','taskId','planHash','relativeDates','epoch','obsSeq','stage','detail','lastValid','scope','binding','pending','paused','incomplete','floors','lastObservedAt','history'])||!stage(s.stage)||!code(s.detail)||typeof s.paused!=='boolean'||!(s.lastObservedAt===null||iso(s.lastObservedAt))) return false;
  if(![s.epoch,s.obsSeq,s.incomplete].every(Number.isSafeInteger)||s.epoch<1||s.obsSeq<0||s.incomplete<0||!validPending(s.pending,s.epoch)) return false;
  if(s.lastValid!==null&&(!obj(s.lastValid)||!keys(s.lastValid,['at','stage'])||!iso(s.lastValid.at)||!stage(s.lastValid.stage))) return false;
  // A binding exists exactly when the frozen first scope was bindable, and it is that scope. An unbindable scope
  // must actually contain an unauthorized date; it has no binding and no floors.
  const sc=s.scope;
  if(sc!==null&&(!obj(sc)||!keys(sc,['dates','frozenAt','bindable','origin'])||typeof sc.bindable!=='boolean'||!iso(sc.frozenAt))) return false;
  if(sc!==null&&('origin' in sc
    ? sc.origin!=='legacy-unknown'||!Array.isArray(sc.dates)||sc.dates.length!==0||sc.bindable!==false
    : !dateList(sc.dates,o.relativeDates)||sc.bindable!==sc.dates.every(d=>o.plan.dates.includes(d)))) return false;
  if((s.binding!==null)!==(sc?.bindable===true)||(s.binding&&s.binding.dates.join()!==sc!.dates.join())) return false;
  if(s.binding!==null) {
    const b=s.binding;
    if(!obj(b)||!keys(b,['dates','boundAt','source','realBindingVerified'])||b.source!=='synthetic-sample'||b.realBindingVerified!==false||!o.plan.fake||!iso(b.boundAt)||!Array.isArray(b.dates)||b.dates.length<1||b.dates.length>o.relativeDates||new Set(b.dates).size!==b.dates.length||b.dates.some(d=>!isDate(d)||!o.plan.dates.includes(d))||b.dates.join()!==[...b.dates].sort().join()) return false;
  }
  if(!Array.isArray(s.floors)||s.floors.length>64) return false;
  for(const f of s.floors) if(!obj(f)||!keys(f,['store','date','start','end'])||!o.plan.stores.some(x=>x.label===f.store)||!s.binding?.dates.includes(f.date)||!isTime(f.start)||!isTime(f.end)||f.start>=f.end) return false;
  if(new Set(s.floors.map(slotGroup)).size!==s.floors.length) return false;
  return Array.isArray(s.history)&&s.history.length<=LIMITS.history&&!s.history.some(h=>!obj(h)||!keys(h,['at','stage','detail','epoch'])||!iso(h.at)||!stage(h.stage)||!code(h.detail)||!Number.isSafeInteger(h.epoch)||h.epoch<1||h.epoch>s.epoch);
}

/**
 * v2 saved no scope. Its binding, if any, is its frozen scope (floors and pending carry over unchanged). Without a
 * binding, v2 evidence can only prove "never observed": every accepted v2 observation set lastObservedAt and added
 * a history entry. Any other v2 state may already have seen an unbindable first list, so its scope is unknown and
 * migrates conservatively to a permanent handoff; it can never freeze a later list.
 */
function migrateV2(s: Record<string, any>): MonitorState {
  const b = s.binding, history = Array.isArray(s.history) ? s.history : null;
  const never = s.lastObservedAt === null && s.lastValid === null && history !== null && history.length === 0;
  const lastAt = [s.lastObservedAt, obj(s.lastValid) ? s.lastValid.at : null, history?.at(-1)?.at].find(iso) ?? "";
  const scope: DateScope | null = obj(b) && Array.isArray(b.dates) ? { dates: [...b.dates], frozenAt: b.boundAt, bindable: true }
    : never ? null : { dates: [], frozenAt: lastAt, bindable: false, origin: "legacy-unknown" };
  return { ...s, schema: "applebuy-launch-monitor/v3", scope } as MonitorState;
}

export class LaunchMonitor {
  #s: MonitorState;
  #last: PageObservation | null = null;
  #plan: Plan;
  #source: ObservationSource|null = null;
  constructor(o: Options) {
    if (!/^[a-z0-9-]{1,80}$/.test(o.taskId) || !validatePlan(o.plan).plan || planHash(o.plan)!==o.planHash || !Number.isInteger(o.relativeDates) || o.relativeDates < 1 || o.relativeDates > 3) throw new Error("InvalidLaunchOptions");
    this.#plan = structuredClone(o.plan);
    this.#s = { schema: "applebuy-launch-monitor/v3", taskId:o.taskId, planHash:o.planHash, relativeDates:o.relativeDates, epoch: 1, obsSeq: 0, stage: "RESTORED_UNOBSERVED", detail: "not-yet-observed",
      lastValid: null, scope: null, binding: null, pending: null, paused: false, incomplete: 0, floors: [], lastObservedAt:null, history: [] };
  }

  /** Restart: identity, date scope, binding, pending truth and history survive; every page reference from before is invalid. */
  static restore(json: string, o: Options): LaunchMonitor {
    let s = JSON.parse(json) as MonitorState;
    if (obj(s) && (s as any).schema === "applebuy-launch-monitor/v2" && !Object.hasOwn(s, "scope")) s = migrateV2(s);
    if (s?.schema !== "applebuy-launch-monitor/v3" || s.taskId !== o.taskId || s.planHash !== o.planHash || s.relativeDates !== o.relativeDates || !validState(s,o)) {
      throw new Error("LaunchStateMismatch");
    }
    const monitor = new LaunchMonitor(o);
    monitor.#s = { ...structuredClone(s), epoch: s.epoch + 1, obsSeq: 0, stage: "RESTORED_UNOBSERVED", detail: "restart", incomplete: 0 };
    return monitor;
  }
  toJSON(): string {
    return JSON.stringify(this.#s);
  }
  get state(): Readonly<MonitorState> {
    return structuredClone(this.#s);
  }

  /** Ingest one observation of the CURRENT page (observer output or transport classification). */
  ingest(raw: unknown, at: string, source: ObservationSource): Next {
    // Every rejection happens before any state change.
    if (!validateObservation(raw) || !iso(at) || !['synthetic-sample','imported-observation'].includes(source)) throw new LaunchInputRejected('InvalidObservation');
    if (Date.parse(raw.observedAt) > Date.parse(at) + LIMITS.futureSkewMs) throw new LaunchInputRejected('FutureObservation');
    if (this.#s.lastObservedAt && Date.parse(raw.observedAt)<=Date.parse(this.#s.lastObservedAt)) throw new LaunchInputRejected('StaleObservation');
    const obs = structuredClone(raw);
    const s = this.#s;
    let stage = obs.stage;
    let detail = obs.detail;
    if (stage === "RENDERING_INCOMPLETE") {
      s.incomplete++;
      if (s.incomplete > LIMITS.renderIncompleteObservations) [stage, detail] = ["UNKNOWN_STRUCTURE", "render-did-not-complete"];
    } else s.incomplete = 0;
    // Leaving a recognized page (maintenance, failure, partial/unknown render) starts a new page epoch:
    // every control reference and late result from the old page can no longer initiate an action.
    s.epoch++; // every new page observation/redraw invalidates all previous control references
    s.obsSeq++;
    s.stage = stage;
    s.detail = detail;
    this.#last = { ...obs, stage, detail };
    this.#source = source;
    s.lastObservedAt = obs.observedAt;
    if (!INTERRUPTED.has(stage) && !HANDOFF.has(stage)) s.lastValid = { at, stage };
    if (stage === "SLOT_SELECTION" && this.#ready()) {
      if (s.scope===null) this.#freeze(obs, at);
      // Floors are recorded from the freezing observation onward, before any later omission could matter.
      if(s.binding?.dates.includes(obs.selectedDate!)) for(const f of terminalOffers(this.#offers()).values()) {
        const old=s.floors.find(x=>slotGroup(x)===slotGroup(f));
        if(!old) s.floors.push({store:f.store,date:f.date,start:f.start,end:f.end});
        else if(laterSlot(f,old)) { old.start=f.start; old.end=f.end; }
      }
    }
    s.history.push({ at, stage, detail, epoch: s.epoch });
    if (s.history.length > LIMITS.history) s.history.splice(0, s.history.length - LIMITS.history);
    return this.next();
  }

  /**
   * Freeze the first N visible, enabled offered dates of the first complete recognized list; never calendar today.
   * Disabled labels are not offered. If any frozen date is outside the plan, the scope is frozen as unbindable:
   * a later list can never roll the scope forward to an originally later (e.g. fourth) date.
   */
  #freeze(obs: PageObservation, at: string): void {
    const dates = obs.dates.filter(d=>d.enabled).map(d=>d.date!).sort().slice(0,this.#s.relativeDates);
    const bindable = dates.every(d=>this.#plan.dates.includes(d));
    this.#s.scope = { dates, frozenAt: at, bindable };
    if (bindable) this.#s.binding = { dates, boundAt: at, source:'synthetic-sample', realBindingVerified: false };
  }

  #ready(): boolean {
    const o=this.#last,c=o?.conditions;
    return !!o && o.stage==='SLOT_SELECTION' && this.#source==='synthetic-sample' && this.#plan.fake===true && o.listCompleteness==='synthetic-complete' && !!c && Object.values(c).every(f=>f.status==='verified') && typeof c.product.id==='string' && this.#plan.stores.some(s=>s.label===c.store.value) && contextViolations(this.#plan,{productId:c.product.id,quantity:Number(c.quantity.value),totalCny:Number(c.price.value),fulfillment:String(c.fulfillment.value)}).length===0 && o.dates.length>0 && o.dates.every(d=>d.yearShown&&isDate(d.date)) && o.dates.filter(d=>d.selected&&d.enabled).length===1 && o.dates.find(d=>d.selected)?.date===o.selectedDate;
  }
  #offers() {
    const o=this.#last!;
    return o.times.map(t=>{const f={store:String(o.conditions!.store.value),date:o.selectedDate!,start:t.start,end:t.end};return {...f,key:slotKey(f),ref:`${this.#s.epoch}:${this.#s.obsSeq}:${t.ref??''}`,selectable:t.enabled&&t.ref!==null};});
  }

  invalidatePage(): void {
    this.#s.epoch++; this.#s.stage='RESTORED_UNOBSERVED'; this.#s.detail='page-owner-changed';
    this.#last=null; this.#source=null;
  }

  setPending(p: Pending): void {
    if(this.#s.pending) throw new LaunchInputRejected('PendingRequiresReconciliation');
    if(p===null || !validPending(p,this.#s.epoch)) throw new Error('InvalidPending');
    this.#s.pending = structuredClone(p);
  }
  setPaused(paused: boolean): void {
    if(typeof paused!=='boolean') throw new LaunchInputRejected('InvalidPause');
    this.#s.paused = paused; this.#s.epoch++; this.#last=null;
  }

  /** A result that belongs to an older page epoch is recorded as truth by the engine but may never start an action. */
  mayInitiateFrom(epoch: number): boolean {
    const n=this.next();return epoch === this.#s.epoch && n.kind==='candidates' && n.offers.length>0;
  }
  /** A control reference is usable only within the exact current observation of the current epoch. */
  refValid(ref: { epoch: number; obsSeq: number; ref:string }): boolean {
    const n=this.next();return ref.epoch === this.#s.epoch && ref.obsSeq === this.#s.obsSeq && n.kind==='candidates' && n.offers.some(o=>o.ref===ref.ref);
  }

  next(): Next {
    const s = this.#s;
    if (s.pending) return { kind: "reconcile", reason: "pending-or-unknown-result-observe-first" };
    if (HANDOFF.has(s.stage)) return { kind: "handoff", reason: s.detail };
    // Permanent for this task: the frozen first scope contains an unauthorized date; no later list may replace it.
    if (s.scope && !s.scope.bindable) return { kind: "handoff", reason: s.scope.origin === "legacy-unknown" ? "legacy-date-scope-unknown" : "initial-date-scope-not-authorized" };
    if (s.paused) return { kind: "wait", reason: "paused" };
    if (s.stage !== "SLOT_SELECTION" || !this.#last) return { kind: "wait", reason: s.stage };
    const obs = this.#last;
    if (!this.#ready()) return { kind:'handoff',reason:this.#source==='imported-observation'?'imported-evidence-unverified':'conditions-year-or-list-unverified' };
    if (!s.binding) return { kind: "handoff", reason: "offered-dates-not-bindable" };
    if (!obs.selectedDate || !s.binding.dates.includes(obs.selectedDate)) return { kind: "wait", reason: "selected-date-outside-bound-set" };
    const floor=new Map(s.floors.map(f=>[slotGroup(f),f]));
    const offers=preferredSlotOffers(this.#plan,this.#offers(),floor).filter(f=>f.selectable&&slotPlanViolation(this.#plan,f)===null).sort((a,b)=>compareRank(rankTuple(this.#plan,a),rankTuple(this.#plan,b)));
    return { kind: "candidates", reason: "core-engine-decides", epoch: s.epoch, obsSeq: s.obsSeq, offers };
  }

  /** Concise Chinese status for the basic flow; technical details stay in the report/journal. */
  statusZh(): { step: string; next: string; lastValid: string; binding: string } {
    const s = this.#s;
    const n = this.next();
    const next = n.kind === "reconcile" ? "先只读核实已发送操作的结果，不重发、不刷新结账"
      : n.kind === "handoff" ? "请人工接管：保留当前页面和已选内容，不清空购物袋、不重新开始结账"
      : n.kind === "candidates" ? n.offers.length ? "已计算离线候选（本页不选择时段或下单）" : "没有符合末档限制的候选，不退到更早时段"
      : s.paused ? "已暂停：不发起新操作" : "等待下一次有效观察";
    return {
      step: s.stage==='RESTORED_UNOBSERVED' && s.detail==='not-yet-observed' ? '尚未读取页面：请选择合成样本并观察' : s.detail==='page-owner-changed' ? '控制页面已更换：旧页面控件作废，请重新观察' : STAGE_ZH[s.stage],
      next,
      lastValid: s.lastValid ? `${s.lastValid.at}（${STAGE_ZH[s.lastValid.stage].split("：")[0]}）` : "尚无有效观察",
      binding: s.binding ? `已固定首次提供的 ${s.binding.dates.length} 个日期：${s.binding.dates.join("、")}${s.binding.source === "synthetic-sample" ? "（合成样本，不是真实绑定）" : "（真实绑定尚未验证）"}`
        : s.scope?.origin === "legacy-unknown" ? "旧版回放记录没有保存最初日期范围，无法证明是否已看到过不能绑定的首个列表：不会固定新的日期，也不会产生候选，请人工处理"
        : s.scope ? `首次完整列表的前 ${s.scope.dates.length} 个可选日期为 ${s.scope.dates.join("、")}，含计划外日期：已冻结且不能绑定，不会改用之后出现的日期，请人工处理` : "尚未固定日期",
    };
  }
}
