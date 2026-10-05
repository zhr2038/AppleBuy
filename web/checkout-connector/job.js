// Codex C-012 quota takeover. Transport-independent official-checkout controller.
// This controller does not make a merchant request; ChromePort supplies normal UI operations.
// C-012-R1 (Claude): fixed no-extras intent, durable bag-add record, expiry-safe final lookup, truthful
// not-dispatched state, untouched-failure recovery, elapsed-time wait budget, validation modes, retire/rebind.
// C-013-R1 (Claude): durable consecutive untouched bound reset only by verified progress plus a per-run absolute
// bound; an already selected exact allowed pickup store waits within a bound instead of being clicked again.
// C-018 (Claude): a persisted plan is compared independent of object-member order only.
// C051 (Claude): a sent slot continues through the observed contact-only details step only with this task's own bound facts.
// C054 (Claude): REVIEW and the independent final lookup compare the pickup day by calendar identity within the reader's own grammar.
// C054-R1 (Claude): calendar-shaped labels need validity even when identical, an ambiguous frozen cohort blocks every representation,
// and missing selected/observed slot facts never compare equal.
// C058 (Claude): read-only and human-rebound runs detach the port's stored slot choice and never record a refusal for it.
export const TASK_KEY='applebuy-single-personal-purchase/v1';
// Public-configuration validation never uses the purchase task key, so it cannot consume a purchase task.
export const VALIDATION_KEY='applebuy-public-configuration-validation/v1';
export const NO_EXTRAS=Object.freeze({tradeIn:'none',appleCare:'none'});
const STOP=new Set(['AUTH','CONSENT','CHALLENGE','THROTTLE','UNKNOWN','DETAILS_UNSUPPORTED']);
const ACTIONS=['configureProduct','continueProduct','addBag','viewBag','checkout','selectPickup','selectStore','selectDate','chooseSlot','fillDetails','selectPayment','continuePayment','submitOrder','openProduct','openBag'];
// Public product-page choices create no merchant resource. Every other action is a merchant mutation.
const PUBLIC=new Set(['configureProduct','continueProduct']);
// C035 (Claude): openProduct is ordinary navigation of the bound tab from a verified empty bag to the plan's public product entry.
// It creates no merchant resource, yet it is not a public-configuration action: validation and observe ports can never send it.
const NAVIGATION=new Set(['openProduct','openBag']);
// C038-R1 (Claude): sent actions whose normal result is a new document. Between documents a read can briefly find none.
const NAVIGATING=new Set(['openProduct','openBag','addBag','viewBag','checkout']);
// C040-R1 (Claude): sent later steps that may also change the document. Only a proven script-transport rejection re-reads for them.
const CONTINUING=new Set(['chooseSlot','fillDetails','continuePayment','submitOrder']);
const productPathOf=P=>new RegExp('^/shop/buy-iphone/'+(P.product.model==='iPhone Duo'?'iphone-duo':'iphone-18-pro')+'(?:/[^/]+/a)?/?$');
const SLOT=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const clone=x=>structuredClone(x);
// C021 quota takeover: diagnostics carry only this fixed official origin grammar, never raw errors or URL queries.
const safePermissionOrigin=x=>typeof x==='string'&&/^https:\/\/(?:www\.apple\.com\.cn|secure\d*\.www\.apple\.com\.cn)$/.test(x)?x:null;
const optBool=v=>v===undefined||typeof v==='boolean';
export function validStored(s){return s&&s.schema==='applebuy-purchase-job/v1'&&typeof s.taskId==='string'&&typeof s.planDigest==='string'&&Number.isSafeInteger(s.tabId)&&validIntent(s.plan)&&Number.isSafeInteger(s.lastRead)&&s.lastRead>=0&&Number.isFinite(s.expiresAt)&&Number.isSafeInteger(s.dateCursor)&&s.dateCursor>=0&&s.dateCursor<=3&&Number.isSafeInteger(s.refusals)&&s.refusals>=0&&Array.isArray(s.rejected)&&s.rejected.every(r=>typeof r.date==='string'&&SLOT.test(r.start)&&SLOT.test(r.end)&&Number.isSafeInteger(r.generation))&&s.floors&&typeof s.floors==='object'&&Object.values(s.floors).every(t=>SLOT.test(t))&&(s.initialDates===null||(Array.isArray(s.initialDates)&&s.initialDates.length<=3&&new Set(s.initialDates).size===s.initialDates.length&&s.initialDates.every(d=>typeof d==='string')))&&(s.pending===null||(typeof s.pending.id==='string'&&typeof s.pending.documentId==='string'&&Number.isFinite(s.pending.deadline)&&ACTIONS.includes(s.pending.action)&&(s.pending.dispatched===undefined||s.pending.dispatched===false)))&&(s.finalIntent===null||(typeof s.finalIntent.id==='string'&&typeof s.finalIntent.sent==='boolean'))&&(!s.finalIntent?.sent||s.pending?.action==='submitOrder'||s.state==='CONFIRMED_UNPAID')&&
  optBool(s.bagAddStarted)&&optBool(s.resourceWritten)&&optBool(s.reconcileOnly)&&(s.untouchedFailures===undefined||(Number.isSafeInteger(s.untouchedFailures)&&s.untouchedFailures>=0))&&
  // The consecutive count is part of the cumulative count; a streak above a recorded total is not a trustworthy record.
  (s.untouchedStreak===undefined||(Number.isSafeInteger(s.untouchedStreak)&&s.untouchedStreak>=0&&(s.untouchedFailures===undefined||s.untouchedStreak<=s.untouchedFailures)))&&(s.quotedCny===undefined||s.quotedCny===null||Number.isFinite(s.quotedCny))&&(s.bagTotalCny===undefined||s.bagTotalCny===null||Number.isFinite(s.bagTotalCny))&&
  (s.revokedGrantIds===undefined||(Array.isArray(s.revokedGrantIds)&&s.revokedGrantIds.every(x=>typeof x==='string')))&&(s.retiredHistory===undefined||(Array.isArray(s.retiredHistory)&&s.retiredHistory.every(r=>r?.schema==='applebuy-purchase-job/v1'&&r.state==='RETIRED')))&&(s.history===undefined||Array.isArray(s.history))&&
  (s.retiredCart===undefined||(s.retiredCart!==null&&typeof s.retiredCart==='object'&&!Array.isArray(s.retiredCart)));}
export function validIntent(p){
  return p?.schema==='applebuy-intent/v1'&&p.quantity===1&&p.fulfillment==='pickup'&&p.city==='大连'&&
    ['iPhone Duo','iPhone 18 Pro'].includes(p.product?.model)&&p.product?.capacity==='256GB'&&
    (p.product.model==='iPhone Duo'?p.product.color==='星光白色':p.product.color==='黑色')&&
    Number.isSafeInteger(p.maxTotalCny)&&p.maxTotalCny>0&&p.maxTotalCny<100000&&
    Array.isArray(p.stores)&&p.stores.length>0&&p.stores.every(s=>s==='Apple 大连恒隆广场')&&
    p.dateRule==='initial-first-three-terminal'&&p.paymentMethod==='支付宝'&&
    // The user condition is fixed: no trade-in and no AppleCare+. A legacy intent without the field means the same.
    (p.extras===undefined||(p.extras!==null&&typeof p.extras==='object'&&Object.keys(p.extras).length===2&&p.extras.tradeIn==='none'&&p.extras.appleCare==='none'));
}
// Canonical bound intent. Different extras are invalid, so normalization can only make the fixed condition explicit.
export function normalizeIntent(p){const {extras,...rest}=clone(p);return {...rest,extras:{...NO_EXTRAS}};}
// C-018: JSON text with object members sorted, recursively. Storage/transport may reorder members; only that order is
// ignored. Values, types, array order and member presence stay exact. (page-program.js keeps its own serialized copy.)
export function canonicalJson(v){return JSON.stringify(v,(k,x)=>x!==null&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(n=>[n,x[n]])):x);}
export function purchaseMatches(p,c){
  return !!c&&c.verified===true&&c.model===p.product.model&&c.capacity===p.product.capacity&&c.color===p.product.color&&
    c.quantity===1&&c.fulfillment==='pickup'&&p.stores.includes(c.store)&&Number.isFinite(c.totalCny)&&c.totalCny>0&&c.totalCny<=p.maxTotalCny;
}
export function itemMatches(p,c){return !!c&&c.itemVerified===true&&c.model===p.product.model&&c.capacity===p.product.capacity&&c.color===p.product.color&&c.quantity===1&&Number.isFinite(c.totalCny)&&c.totalCny>0&&c.totalCny<=p.maxTotalCny;}
// C054 (Claude): only the reader's supported date grammar parses (page-program.js): an English month name and day (case and spacing free,
// as native `october5` or summary `October 5`) or [YYYY年]M月D日 with an optional 周X/星期X weekday. It must be a real calendar day (Feb 29
// needs no year or a leap year; a weekday beside a year must be that day's). Pure: no clock, launch date, relative word or adjacency.
const MONTH_NAMES=['january','february','march','april','may','june','july','august','september','october','november','december'];
export function calendarDay(x){
  if(typeof x!=='string')return null;
  let r,year=null,month,day,weekday=null;
  if((r=/^(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日(?:\s*(?:周|星期)([一二三四五六日天]))?$/.exec(x))){year=r[1]===undefined?null:+r[1];month=+r[2];day=+r[3];weekday=r[4]===undefined?null:'日一二三四五六天'.indexOf(r[4])%7;}
  else if((r=/^(january|february|march|april|may|june|july|august|september|october|november|december)\s*(\d{1,2})$/i.exec(x))){month=MONTH_NAMES.indexOf(r[1].toLowerCase())+1;day=+r[2];}
  else return null;
  const leap=year===null||year%4===0&&(year%100!==0||year%400===0);
  if(month<1||month>12||day<1||day>[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month-1])return null;
  if(year!==null&&weekday!==null){const t=new Date(0);t.setUTCFullYear(year,month-1,day);if(t.getUTCDay()!==weekday)return null;}
  return {year,month,day,weekday};
}
// Explicit years must agree; a year on one side only stays unknown (no date-context contract). Weekdays may be absent on either side.
export function sameCalendarDay(a,b){
  const x=calendarDay(a),y=calendarDay(b);
  return !!x&&!!y&&x.year===y.year&&x.month===y.month&&x.day===y.day&&(x.weekday===null||y.weekday===null||x.weekday===y.weekday);
}
// C054-R1: calendar-shaped text (an English month word or abbreviation with a number, N月N日, a numeric N-N or N/N date, or a relative day
// word, even outside the supported grammar) has only calendar meaning, so it must parse as a real day even when both raw strings are
// identical; unsupported forms therefore never match. Only this classification widens: it can block, never add a match. Other (opaque
// FAKE/legacy) labels keep exact equality.
const CALENDAR_SHAPED=/^\s*(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*[0-9０-９]|(?:[0-9０-９]+\s*年\s*)?[0-9０-９]+\s*月\s*[0-9０-９]+\s*日|[0-9０-９]+\s*[-/.／]\s*[0-9０-９]+|今天|明天|后天|today|tomorrow)/i;
// Two frozen initial labels that could be one calendar day make the cohort itself ambiguous: no representation of any member matches.
function cohortAmbiguous(dates){
  const days=(dates??[]).map(calendarDay).filter(Boolean);
  return days.some((x,i)=>days.some((y,j)=>j>i&&x.month===y.month&&x.day===y.day&&(x.year===null||y.year===null||x.year===y.year)));
}
// The accepted slot and an observed slot name the same pickup only when both carry a date and valid times (missing facts never compare
// equal), the frozen cohort is unambiguous, and the dates are the same real calendar day or, for opaque labels, the identical raw string.
// Nothing is rewritten, merged, dropped or rebound.
function sameAcceptedSlot(s,o){
  const a=s.acceptedSlot,facts=x=>!!x&&typeof x.date==='string'&&x.date!==''&&SLOT.test(x.start)&&SLOT.test(x.end);
  if(!facts(a)||!facts(o)||o.start!==a.start||o.end!==a.end||cohortAmbiguous(s.initialDates))return false;
  return CALENDAR_SHAPED.test(a.date)||CALENDAR_SHAPED.test(o.date)?sameCalendarDay(a.date,o.date):o.date===a.date;
}
// C051 (Claude): the current normal contact-only details step (C-051 evidence) shows no product, store, quantity or slot. It may carry
// THIS task's earlier verified identity only to continue this task: the page's own recognized step, no current identity/quantity/store/
// slot/order fact at all (pickup prose only), and its current total equal to the task's explicit one-unit money basis (bag total at
// checkout, else the Add to Bag quote) within the cap. Never in read-only/rebound runs, with a final intent or without a started
// checkout. Inherited identity is labelled separately and never authorizes REVIEW, a final order or an order confirmation.
export const CONTACT_SLOT_BASIS='contact-only-details-after-sent-slot; inherited task identity; not a hold guarantee';
function contactStepCurrent(P,s,o){
  const c=o?.contactStep,p=o?.purchase,basis=s.bagTotalCny??s.quotedCny??null;
  return o?.phase==='DETAILS'&&o.verifiedStep===true&&c?.kind==='contact-only-details'&&c.verified===true&&!!p&&p.verified===false&&p.itemVerified===false&&
    p.model===null&&p.capacity===null&&p.color===null&&p.quantity===null&&p.store===null&&(p.fulfillment===null||p.fulfillment==='pickup')&&
    Number.isFinite(basis)&&basis>0&&basis<=P.maxTotalCny&&p.totalCny===basis&&c.totalCny===basis&&o.slotSummary==null&&o.extras==null&&o.orderRefHash==null&&
    s.reconcileOnly!==true&&s.finalIntent===null&&s.bagAddStarted===true;
}
// The sent chooseSlot must be this task's own current SLOTS decision: written from SLOTS (where purchaseMatches held), the frozen
// date at the cursor, its own terminal floor, never refused, and no slot accepted before. A legacy/absent/contradictory record stops.
function sentSlotBound(s,q){
  return q?.action==='chooseSlot'&&q.beforePhase==='SLOTS'&&q.dispatched===undefined&&typeof q.date==='string'&&SLOT.test(q.start)&&SLOT.test(q.end)&&q.start<q.end&&
    Array.isArray(s.initialDates)&&s.initialDates[s.dateCursor]===q.date&&s.floors?.[q.date]===q.start&&!s.acceptedSlot&&
    !s.rejected.some(r=>r.date===q.date&&r.start===q.start&&r.end===q.end);
}
const inheritedIdentity=(P,s,o,source)=>({kind:'inherited-task-identity',step:'contact-only-details',fresh:false,source,product:{...P.product},quantity:P.quantity,stores:[...P.stores],fulfillment:P.fulfillment,basisCny:s.bagTotalCny??s.quotedCny,readSequence:o.seq});
// Retirement is allowed only when no merchant mutation was ever written; legacy records without the fields are not provable.
export function retirable(s){return s.resourceWritten===false&&s.bagAddStarted===false&&s.finalIntent===null&&(s.pending===null||PUBLIC.has(s.pending.action));}
// C030: only this narrow cart-only history can be finished; a marker never overrides a final/slot/unknown fact.
function resolvedReadOnlyBag(s){
  const unsafe=r=>r.pending!==null||r.finalIntent!==null||r.orderRefHash!==null||r.initialDates!==null||r.dateCursor!==0||r.refusals!==0||r.rejected.length!==0||Array.isArray(r.floors)||Object.keys(r.floors).length!==0||r.acceptedSlot!=null;
  return validStored(s)&&s.reconcileOnly===true&&s.lastPhase==='BAG'&&s.resourceWritten===true&&s.bagAddStarted===true&&!unsafe(s)&&
    (s.retiredHistory??[]).every(r=>validStored(r)&&!unsafe(r));
}
// C034 (Claude): retirement never empties the real cart. The newest resolved read-only BAG retirement in a retired chain (or the
// fact a later task carried forward) is the last verified cart content. It is never cleared or rewritten. C035-R1: only a current
// verified empty bag read taken at the Add boundary itself (never stored as clearance) lets that one Add pass it; see run().
export function retiredCartFact(history){
  for(const r of [...(history??[])].reverse()){
    if(r?.readOnlyRetirement?.kind==='resolved-pre-slot-bag'){const p=r.plan?.product;return {kind:'resolved-pre-slot-bag',fromTaskId:r.taskId,product:{model:p?.model,capacity:p?.capacity,color:p?.color},quantity:1,totalCny:r.bagTotalCny??r.quotedCny??null,readSequence:r.readOnlyRetirement.readSequence??null,retiredAt:r.retiredAt??null};}
    if(r?.retiredCart)return clone(r.retiredCart);
  }
  return null;
}
function terminal(times){
  if(!Array.isArray(times)||times.length===0||times.some(t=>!SLOT.test(t.start)||!SLOT.test(t.end)||t.start>=t.end||typeof t.ref!=='string'))return null;
  const keys=times.map(t=>t.start+'-'+t.end);if(new Set(keys).size!==keys.length)return null;
  return [...times].sort((a,b)=>a.start.localeCompare(b.start)||a.end.localeCompare(b.end)).at(-1);
}
// C060 Codex genuine-quota takeover: one shared factory for ordinary starts and an explicitly confirmed successor.
// This allocates local state only; it grants no final authority and sends no merchant action.
export function createPurchaseRecord(P,{taskId,planDigest,tabId,mode='purchase',validating=false,now,id}){
  return {schema:'applebuy-purchase-job/v1',taskId:(validating?null:taskId)??id(),plan:clone(P),planDigest,tabId,state:'RUNNING',lastPhase:null,lastDocumentId:null,entryDocumentId:null,reason:null,pending:null,finalIntent:null,orderRefHash:null,initialDates:null,dateCursor:0,floors:{},rejected:[],refusals:0,lastRead:0,expiresAt:now+(validating?300000:1800000),bagAddStarted:false,resourceWritten:false,untouchedFailures:0,untouchedStreak:0,quotedCny:null,mode};
}
export class PurchaseJob {
  constructor({store,port,now=()=>Date.now(),id=()=>crypto.randomUUID(),maxSteps=100,maxWaitMs=30000,hydrationMs=3000,maxPolls=2000,maxUntouched=3,maxUntouchedPerRun=12,maxSummaryReads=30,onState=()=>{}}){Object.assign(this,{store,port,now,id,maxSteps,maxWaitMs,hydrationMs,maxPolls,maxUntouched,maxUntouchedPerRun,maxSummaryReads,onState});this.paused=false;this.stopped=false;this.key=TASK_KEY;this.runGrant=null;}
  pause(){this.paused=true;} resume(){this.paused=false;} stop(){this.stopped=true;}
  async save(s){await this.store.put(this.key,clone(s));this.onState({state:s.state,phase:s.lastPhase,reason:s.reason??null,refusals:s.refusals,finalIntent:s.finalIntent!==null,pendingAction:ACTIONS.includes(s.pending?.action)?s.pending.action:null,permissionOrigin:safePermissionOrigin(s.permissionOrigin),observationCurrent:s.observationCurrent===true,retiredCart:!!s.retiredCart});}
  async gate(s,reason,state='NEEDS_USER'){
    s.state=state;s.reason=reason;
    // Human intervention invalidates an advance start authorization; it cannot carry across a gate.
    if(this.runGrant?.start===true&&typeof this.runGrant.id==='string'&&state!=='CONFIRMED_UNPAID'){s.revokedGrantIds=[...new Set([...(s.revokedGrantIds??[]),this.runGrant.id])].slice(-20);}
    await this.save(s);return clone(s);
  }
  // Explicit retirement of a task that never wrote a merchant mutation. The record is preserved, never removed.
  async retire(){
    this.key=TASK_KEY;const old=await this.store.get(TASK_KEY);if(!old)return null;if(!validStored(old))throw new Error('StoredPurchaseTaskCorrupt');
    if(old.state==='RETIRED')return clone(old);if(!retirable(old))throw new Error('TaskHasMerchantMutationHistory');
    const s={...old,state:'RETIRED',reason:'retired-by-user; history preserved',retiredAt:this.now()};await this.save(s);return clone(s);
  }
  // C030 Codex quota takeover: explicitly finish a resolved, permanently read-only BAG rehearsal.
  // This reads only; no prior mutation or authority is replayed. Slot/final/unknown histories remain blocked.
  async retireReadOnlyBag(plan,{tabId,planDigest,live=()=>true}={}){
    if(!validIntent(plan)||!Number.isSafeInteger(tabId)||!planDigest||typeof live!=='function')throw new Error('InvalidPurchaseConfiguration');
    const cancelled=()=>!live()||this.paused||this.stopped;
    if(cancelled())throw new Error('ReadOnlyRetirementCancelled');
    this.key=TASK_KEY;const old=await this.store.get(TASK_KEY);
    if(cancelled())throw new Error('ReadOnlyRetirementCancelled');
    if(!old)throw new Error('NoPreservedTaskToRetire');if(!validStored(old))throw new Error('StoredPurchaseTaskCorrupt');
    if(old.tabId!==tabId||old.planDigest!==planDigest||canonicalJson(normalizeIntent(old.plan))!==canonicalJson(normalizeIntent(plan)))throw new Error('ExistingTaskBindingDiffers');
    if(!resolvedReadOnlyBag(old))throw new Error('ReadOnlyBagTaskNotResolved');
    if(old.state==='RETIRED'&&old.readOnlyRetirement?.kind==='resolved-pre-slot-bag')return clone(old);
    if(old.state==='RETIRED')throw new Error('ReadOnlyBagTaskNotResolved');
    if(cancelled())throw new Error('ReadOnlyRetirementCancelled');
    const o=await this.port.observe(normalizeIntent(plan));
    if(cancelled())throw new Error('ReadOnlyRetirementCancelled');
    if(o?.schema!=='applebuy-merchant-read/v1'||o.phase!=='BAG'||o.verifiedStep!==true||typeof o.documentId!=='string'||!o.documentId||!Number.isSafeInteger(o.seq)||o.seq<=old.lastRead||!itemMatches(plan,o.purchase)||o.extras!==false)throw new Error('CurrentOneItemBagNotVerified');
    const current=await this.store.get(TASK_KEY);
    if(cancelled())throw new Error('ReadOnlyRetirementCancelled');
    if(canonicalJson(current)!==canonicalJson(old))throw new Error('StoredTaskChangedDuringRetirement');
    const s={...old,state:'RETIRED',reason:'resolved-read-only-bag-retired-by-user; history preserved',retiredAt:this.now(),observationCurrent:false,
      readOnlyRetirement:{kind:'resolved-pre-slot-bag',previousState:old.state,previousReason:old.reason,previousObservationCurrent:old.observationCurrent??null,documentId:o.documentId,readSequence:o.seq}};
    await this.save(s);return clone(s);
  }
  // Observation only: no task is read, created or written, and act is never called.
  async observeOnly(plan){
    if(!validIntent(plan))throw new Error('InvalidPurchaseConfiguration');
    const o=await this.port.observe(normalizeIntent(plan));
    return {mode:'observe',state:'OBSERVED',phase:o?.phase??'UNKNOWN',nextChoice:o?.nextChoice??null,needsSelection:o?.needsSelection??null,configuration:o?.configuration??null,extrasConflict:o?.extrasConflict??null,variantVerified:o?.variantVerified===true,quotedCny:o?.quotedCny??null};
  }
  async run(plan,{tabId,planDigest,grant=null,taskId=null,mode='purchase',rebind=false}={}){
    if(!validIntent(plan)||!Number.isSafeInteger(tabId)||!planDigest||!['purchase','observe','public-config','reconcile'].includes(mode)||(mode==='reconcile'&&rebind))throw new Error('InvalidPurchaseConfiguration');
    if(mode==='observe')return this.observeOnly(plan);
    const P=normalizeIntent(plan),validating=mode==='public-config',readOnly=mode==='reconcile';
    this.key=validating?VALIDATION_KEY:TASK_KEY;
    const old=validating?null:await this.store.get(TASK_KEY);
    if(old&&!validStored(old))throw new Error('StoredPurchaseTaskCorrupt');
    if(readOnly&&(!old||old.state==='RETIRED'))throw new Error('NoPreservedTaskToReconcile');
    // Validation is bounded, never authorized and stored separately; it cannot use a purchase grant.
    if(validating||rebind||readOnly)grant=null;
    this.runGrant=grant;
    const fresh=()=>createPurchaseRecord(P,{taskId,planDigest,tabId,mode,validating,now:this.now(),id:this.id});
    let s;
    if(old?.state==='RETIRED'){if(rebind)throw new Error('NoPreservedTaskToRebind');const {retiredHistory=[],...prev}=old;s={...fresh(),retiredHistory:[...retiredHistory,prev]};
      // A resolved read-only task cannot become a fresh task with its former identity or revoked authority.
      if(old.readOnlyRetirement&&(!resolvedReadOnlyBag(old)||s.taskId===old.taskId||grant&&(grant.taskId===old.taskId||old.revokedGrantIds?.includes(grant.id))))throw new Error('RetiredReadOnlyAuthorityCannotBeReused');}
    else s=old??fresh();
    // An unresolved earlier validation choice on the same tab/intent is reconciled first, never blindly clicked again.
    const prior=validating?await this.store.get(VALIDATION_KEY):null;
    if(prior&&validStored(prior)&&prior.pending&&prior.pending.dispatched!==false&&prior.tabId===tabId&&prior.planDigest===planDigest){s.pending=clone(prior.pending);s.lastRead=prior.lastRead;}
    // A new validation run on the same tab/intent keeps the untouched counts: restarting cannot reset the consecutive bound.
    if(prior&&validStored(prior)&&prior.tabId===tabId&&prior.planDigest===planDigest){s.untouchedFailures=prior.untouchedFailures??0;s.untouchedStreak=prior.untouchedStreak??s.untouchedFailures;}
    if(rebind&&!old)throw new Error('NoPreservedTaskToRebind');
    // Constrained migration: legacy records cannot prove they never added to the bag or wrote a mutation.
    // A legacy record cannot prove its untouched failures were separated by progress: all of them count as consecutive.
    // A missing total is at least the recorded streak.
    s.bagAddStarted??=true;s.resourceWritten??=true;s.untouchedFailures??=s.untouchedStreak??0;s.untouchedStreak??=s.untouchedFailures;s.quotedCny??=null;
    // C-022-R1 (Claude): page currentness is run-local. A persisted flag is never a fresh read, so every early gate/save of
    // this run names only the last read page; only a valid read below sets it again.
    s.observationCurrent=false;
    // The exact digest and tab still bind; the normalized stored plan must equal the current one apart from member order.
    if(s.schema!=='applebuy-purchase-job/v1'||s.planDigest!==planDigest||canonicalJson(normalizeIntent(s.plan))!==canonicalJson(P)||(s.tabId!==tabId&&!rebind))return this.gate(s,'existing-task-binding-differs','BLOCKED');
    s.plan=clone(P);
    // C034 (Claude): a successor (and its restarts) keeps the retired chain's verified cart item; its own markers stay its own.
    if(!s.retiredCart){const cart=retiredCartFact(s.retiredHistory);if(cart)s.retiredCart=cart;}
    if(rebind&&s.tabId!==tabId){s.history=[...(s.history??[]),{event:'human-tab-rebind',fromTabId:s.tabId,toTabId:tabId,at:this.now()}];s.tabId=tabId;}
    // A human rebind permanently limits this task to read-only reconciliation; it never adds purchase authority.
    if(rebind)s.reconcileOnly=true;
    // C058 (Claude): a read-only or rebound run is not the originating purchase context. Its port then reports no stored choice or stored
    // acceptance as current evidence, so a replacement document cannot acknowledge the old sent slot. Nothing is sent or authorized.
    if((readOnly||s.reconcileOnly===true)&&typeof this.port.detachStoredChoice==='function')this.port.detachStoredChoice();
    if(s.state==='CONFIRMED_UNPAID')return clone(s);
    if(s.finalIntent&&s.finalIntent.sent&&s.pending?.action!=='submitOrder')return this.gate(s,'final-intent-already-consumed','NEEDS_VERIFICATION');
    if(grant&&s.revokedGrantIds?.includes(grant.id))return this.gate(s,'advance-authorization-cleared-by-human-intervention','BLOCKED');
    s.state='RUNNING';s.reason=null;await this.save(s);
    // storeWait marks a wait episode for an already selected store; untouchedRun is this run's absolute untouched count.
    let step=0,polls=0,waitSince=null,polling=false,storeWait=false,untouchedRun=0,summaryReads=0;
    // C035-R1 (Claude): no earlier empty observation is carried to Add. emptyStarted only records that this run itself started from a
    // verified empty bag, so its Add (like every successor's) first needs a current bag read at the Add boundary (below).
    const productPath=productPathOf(P);let emptyStarted=false;
    // Waits are bounded by elapsed time per episode and an absolute poll cap; they never consume semantic steps.
    const poll=async(limit)=>{if(!this.port.wait||polls>=this.maxPolls)return false;waitSince??=this.now();if(this.now()-waitSince>=limit)return false;polls++;await this.port.wait(50);return polling=true;};
    for(;;){
      if(polling)polling=false;else{waitSince=null;storeWait=false;if(++step>this.maxSteps)return this.gate(s,'step-bound-reached','NEEDS_VERIFICATION');}
      const finalLookup=s.pending?.action==='submitOrder'&&s.pending.dispatched!==false;
      // Expiry gates new mutations. Independent final lookup and human-rebound read-only reconciliation remain available.
      if(s.expiresAt<=this.now()&&!finalLookup&&!s.reconcileOnly&&!readOnly)return this.gate(s,'task-window-expired; existing intent preserved','EXPIRED');
      if(this.stopped)return this.gate(s,'stopped; sent operations may still complete','STOPPED');
      if(this.paused)return this.gate(s,'paused; sent operations may still complete','PAUSED');
      s.observationCurrent=false;delete s.permissionOrigin;
      let o;try{o=await this.port.observe(P);}catch(error){const origin=error?.message==='CurrentHostPermissionMissing'?safePermissionOrigin(error.origin):null;if(origin){s.permissionOrigin=origin;return this.gate(s,'current-host-permission-missing; no automatic action','NEEDS_USER');}
        // C038-R1 (Claude): only the read is repeated, only for a delivered navigating action inside its own deadline and the existing
        // wait bounds; the action is never sent again. Slot/final/unknown results and read-only runs keep the immediate stop.
        // C040-R1 (Claude): a delivered slot/details/payment/final step may also re-read, but only after a script-transport rejection
        // (never a returned unrecognized/failed document), under the same original deadline and bounds; the result is then reconciled.
        if(!readOnly&&s.pending&&s.pending.dispatched!==false&&(NAVIGATING.has(s.pending.action)||error?.scriptTransport===true&&CONTINUING.has(s.pending.action))&&this.now()<s.pending.deadline&&await poll(this.maxWaitMs))continue;
        return this.gate(s,'observation-transport-failed','NEEDS_VERIFICATION');}
      if(!o||o.schema!=='applebuy-merchant-read/v1'||!o.documentId||!Number.isSafeInteger(o.seq)||o.seq<=s.lastRead)return this.gate(s,'invalid-or-stale-observation','NEEDS_VERIFICATION');
      s.lastRead=o.seq;s.lastPhase=o.phase;s.lastDocumentId=o.documentId;s.entryDocumentId??=o.documentId;s.observationCurrent=true;delete s.permissionOrigin;await this.save(s);
      if(this.paused||this.stopped)return this.gate(s,'control-changed-during-read; sent operations preserved',this.stopped?'STOPPED':'PAUSED');
      if(grant?.start===true&&!finalLookup&&(grant.entryDocumentId!==s.entryDocumentId||grant.taskId!==s.taskId||grant.planDigest!==s.planDigest||grant.existingOrdersChecked!==true||grant.noExtras!==true||grant.termsAccepted!==true||!Number.isFinite(grant.expiry)||grant.expiry<=this.now()||grant.expiry>this.now()+1800000))return this.gate(s,'start-authorization-no-longer-current','BLOCKED');
      // C029 (Claude): when quantity is the only missing checkout fact, the purchase port may read the ordinary order-summary
      // disclosure (open, read, close; no merchant resource, no human confirmation). Never in read-only, validation or rebound runs,
      // never for an unknown final order, never while a slot result is awaited. Quantity then comes only from the next fresh read
      // of the unchanged document. An untouched refusal re-reads within the bound; any other failure stops.
      if(o.summaryReadable===true&&o.quantitySource!=='order-summary'&&this.port.orderSummary===true&&typeof this.port.readSummary==='function'&&!readOnly&&!validating&&!s.reconcileOnly&&
        !finalLookup&&!(s.pending?.action==='chooseSlot'&&o.phase===s.pending.beforePhase)){
        if(++summaryReads>this.maxSummaryReads)return this.gate(s,'order-summary-read-bound-reached; quantity unverified','NEEDS_VERIFICATION');
        let r=null;try{r=await this.port.readSummary(P,s.taskId);}catch{}
        s.history=[...(s.history??[]),{event:'order-summary-read',read:r?.read===true,goodsCount:r?.read===true?r.goodsCount:null,totalCny:r?.read===true?r.totalCny:null,reason:r?.read===true?null:typeof r?.reason==='string'?r.reason.slice(0,60):'result-unknown'}].slice(-50);await this.save(s);
        if(r?.read===true||r?.touched===false)continue;
        return this.gate(s,'order-summary-not-verified; no purchase action','NEEDS_VERIFICATION');
      }
      // A summary-sourced one unit also needs this order's money to equal the one-unit money this task recorded from explicit
      // quantity (bag total at checkout, else the Add to Bag quote). This detects a changed order; it is never a quantity source.
      if(o.quantitySource==='order-summary'&&o.purchase?.itemVerified===true&&!finalLookup){const basis=s.bagTotalCny??s.quotedCny??null;if(basis===null||o.purchase.totalCny!==basis)return this.gate(s,'order-summary-money-differs-from-explicit-one-unit-basis','BLOCKED');}
      // C064: only this own pending Add on the observed error document may use a positive current settled bag read.
      // Empty/failed/changed cart remains unknown. Matching one item permits normal bag navigation and a fresh checkout read, never Add.
      let afterAddCommand=null;
      if(s.pending?.action==='addBag'&&s.pending.dispatched!==false&&s.bagAddStarted===true&&s.resourceWritten===true&&s.finalIntent===null&&s.acceptedSlot==null&&s.orderRefHash==null&&s.orderDetailLink==null&&o.phase==='UNKNOWN'&&o.merchantError==='page-not-found'&&!readOnly&&!validating&&s.reconcileOnly!==true){
        let b=null;try{if(typeof this.port.readBagAfterAdd==='function')b=await this.port.readBagAfterAdd(P);}catch{}
        if(this.paused||this.stopped)return this.gate(s,'control-changed-during-add-reconciliation; sent Add preserved',this.stopped?'STOPPED':'PAUSED');
        const matching=b?.schema==='applebuy-merchant-read/v1'&&b.phase==='BAG'&&b.verifiedStep===true&&/^\/shop\/bag\/?$/.test(b.path??'')&&
          Number.isSafeInteger(b.seq)&&b.seq>s.lastRead&&typeof b.documentId==='string'&&!!b.documentId&&b.documentId!==o.documentId&&itemMatches(P,b.purchase)&&b.extras===false;
        if(!matching)return this.gate(s,'merchant-page-not-found; add-result-unconfirmed; no automatic repeat','NEEDS_VERIFICATION');
        s.history=[...(s.history??[]),{event:'add-reconciled-from-current-bag',originalPending:clone(s.pending),readSequence:b.seq}].slice(-50);
        s.lastRead=b.seq;s.pending=null;afterAddCommand={action:'openBag',afterAddReconciliation:true,bagReadSeq:b.seq};await this.save(s);
      }
      // Reconcile a previously delivered command, including a crash/restart. Never send it again.
      if(s.pending){
        const pending=s.pending;
        // Positively known not dispatched (pause/stop after the write-ahead, before act): recover truthfully.
        if(pending.dispatched===false){s.pending=null;if(pending.action==='addBag')s.bagAddStarted=false;if(pending.action==='submitOrder'&&s.finalIntent)s.finalIntent.sent=false;await this.save(s);continue;}
        if(pending.action==='submitOrder'){
          if(readOnly)return this.gate(s,'final-result-unconfirmed; no resubmission','NEEDS_VERIFICATION');
          // C040-R1 (Claude): while merchant processing, or the final click's own unchanged review document, is still shown, wait read-only
          // within the ORIGINAL pending deadline and existing bounds. Never resubmit or extend authority; an expired one goes to lookup.
          if((o.phase==='PROCESSING'||o.phase===pending.beforePhase&&o.documentId===pending.documentId&&o.verifiedStep===true&&purchaseMatches(P,o.purchase))&&this.now()<pending.deadline&&await poll(this.maxWaitMs))continue;
          if(!s.orderRefHash&&o.phase==='ORDER_RECEIPT'&&o.receiptVerified===true&&purchaseMatches(P,o.purchase)&&o.orderRefHash){s.orderRefHash=o.orderRefHash;await this.save(s);}
          // C-023 (Claude): the lookup may follow the receipt's own detail link and read pages this job never validates or
          // records, so from here the last validated read is named only as the last read page, never the current one.
          s.observationCurrent=false;
          let order;try{order=await this.port.lookupOrder(P,s.orderRefHash);}catch{}
          if(order?.independent===true&&order.state==='unpaid'&&s.orderRefHash&&order.orderRefHash===s.orderRefHash&&purchaseMatches(P,order.purchase)&&sameAcceptedSlot(s,order.acceptedSlot)){s.pending=null;s.state='CONFIRMED_UNPAID';s.reason=null;await this.save(s);return clone(s);}
          return this.gate(s,'final-result-unconfirmed; no resubmission','NEEDS_VERIFICATION');
        }
        // C035 (Claude): navigation only. Arrival on this plan's product page clears it; while the empty bag or processing is still
        // shown it waits within its deadline; otherwise it is dropped with a history note (no merchant resource can depend on it).
        if(pending.action==='openProduct'){
          if(['ENTRY','VARIANT','PRELAUNCH'].includes(o.phase)&&o.verifiedStep===true&&typeof o.path==='string'&&productPath.test(o.path)){s.pending=null;await this.save(s);continue;}
          if(!readOnly&&(o.phase==='EMPTY_BAG'||o.phase==='PROCESSING')&&this.now()<pending.deadline&&await poll(this.maxWaitMs))continue;
          s.pending=null;s.history=[...(s.history??[]),{event:'product-page-not-reached',readSequence:o.seq}].slice(-50);
          return this.gate(s,'product-page-not-reached; navigation only, nothing added','NEEDS_VERIFICATION');
        }
        // C035-R1 Codex quota completion: a current matching bag found before Add needs ordinary navigation, not another addition or
        // a permanent manual handoff. Reconcile navigation only; subsequent fresh BAG checks still enforce the plan and extras.
        if(pending.action==='openBag'){
          if(['BAG','EMPTY_BAG'].includes(o.phase)&&o.verifiedStep===true&&/^\/shop\/bag\/?$/.test(o.path??'')){s.pending=null;await this.save(s);continue;}
          if(!readOnly&&['ENTRY','VARIANT','PROCESSING'].includes(o.phase)&&this.now()<pending.deadline&&await poll(this.maxWaitMs))continue;
          s.pending=null;s.history=[...(s.history??[]),{event:'bag-page-not-reached',readSequence:o.seq}].slice(-50);
          return this.gate(s,'bag-page-not-reached; navigation only, nothing added','NEEDS_VERIFICATION');
        }
        if(pending.action==='chooseSlot'){
          // C058 (Claude): a read-only or human-rebound run may be reading another checkout session, so a refusal shown there is not this
          // choice's refusal; only the originating purchase run records one. The choice otherwise stays pending/unknown.
          if(!readOnly&&s.reconcileOnly!==true&&o.feedback?.kind==='slot-refused'&&o.feedback.verified===true&&o.feedback.ref===pending.ref&&o.feedback.generation>pending.generation){
            s.rejected.push({date:pending.date,start:pending.start,end:pending.end,generation:pending.generation});s.refusals++;s.pending=null;s.dateCursor++;await this.save(s);
            if(s.refusals>5)return this.gate(s,'refusal-bound-reached','EXHAUSTED');continue;
          }
          if(['DETAILS','PAYMENT','REVIEW'].includes(o.phase)&&o.acceptedSlot?.verified===true&&purchaseMatches(P,o.purchase)&&o.acceptedSlot.date===pending.date&&o.acceptedSlot.start===pending.start&&o.acceptedSlot.end===pending.end){s.acceptedSlot=clone(o.acceptedSlot);s.pending=null;s.untouchedStreak=0;await this.save(s);continue;}
          // C051 (Claude): normal progression from this task's own bound slot send to the contact-only step. Not a hold guarantee.
          if(!readOnly&&sentSlotBound(s,pending)&&contactStepCurrent(P,s,o)){
            s.acceptedSlot={date:pending.date,start:pending.start,end:pending.end,verified:true,basis:CONTACT_SLOT_BASIS};s.inheritedIdentity=inheritedIdentity(P,s,o,'purchase-verified-at-slot-send');
            s.pending=null;s.untouchedStreak=0;s.history=[...(s.history??[]),{event:'slot-continued-to-contact-only-details',readSequence:o.seq,inherited:true}].slice(-50);await this.save(s);continue;
          }
          if(!readOnly&&(o.phase==='PROCESSING'||o.phase===pending.beforePhase)&&this.now()<pending.deadline&&await poll(this.maxWaitMs))continue;
          return this.gate(s,'slot-result-unconfirmed; no resubmission','NEEDS_VERIFICATION');
        }
        const reached={configureProduct:['ENTRY','VARIANT','PRELAUNCH'],continueProduct:['VARIANT'],addBag:['ACCESSORIES','BAG'],viewBag:['BAG'],checkout:['FULFILLMENT','SLOTS'],selectPickup:['FULFILLMENT','SLOTS'],selectStore:['SLOTS'],selectDate:['SLOTS'],fillDetails:['PAYMENT'],selectPayment:['PAYMENT'],continuePayment:['REVIEW']}[pending.action]??[];
        const conditions=o.phase==='BAG'||o.phase==='FULFILLMENT'?itemMatches(P,o.purchase):!['SLOTS','PAYMENT','REVIEW'].includes(o.phase)||purchaseMatches(P,o.purchase);
        if(reached.includes(o.phase)&&o.verifiedStep===true&&conditions&&(!readOnly||o.extras!==true)&&(pending.action!=='selectPickup'||o.purchase?.fulfillment==='pickup')&&(pending.action!=='selectDate'||o.selectedDate===pending.date)&&(pending.action!=='configureProduct'||o.selectedProductChoices?.includes(pending.choice)&&(o.phase!=='PRELAUNCH'||o.prelaunchConfigurable===true))&&(pending.action!=='selectPayment'||o.paymentMethod===P.paymentMethod)){s.pending=null;s.untouchedStreak=0;await this.save(s);if(readOnly)return this.gate(s,'same-tab-read-only-reconciliation-complete; no new purchase action','NEEDS_USER');continue;}
        if(STOP.has(o.phase))return this.gate(s,o.phase.toLowerCase());
        if(!readOnly&&(o.phase===pending.beforePhase||o.phase==='PROCESSING')&&this.now()<pending.deadline&&await poll(this.maxWaitMs))continue;
        return this.gate(s,'mutation-result-unconfirmed; no automatic repeat','NEEDS_VERIFICATION');
      }
      if(s.reconcileOnly)return this.gate(s,'read-only-reconciliation-complete; a rebound tab cannot add purchase authority','NEEDS_USER');
      if(STOP.has(o.phase)&&!afterAddCommand)return this.gate(s,o.phase.toLowerCase());
      if(readOnly)return this.gate(s,'same-tab-read-only-reconciliation-complete; no new purchase action','NEEDS_USER');
      if(o.phase==='PROCESSING'){if(await poll(this.maxWaitMs))continue;return this.gate(s,'merchant-processing-time-bound-reached','NEEDS_VERIFICATION');}
      const preparePrelaunch=o.phase==='PRELAUNCH'&&o.prelaunchConfigurable===true&&o.nextChoice!=null;
      if(o.phase==='PRELAUNCH'&&!preparePrelaunch)return this.gate(s,'official-entry-not-released','NOT_RELEASED');
      if(validating&&!['ENTRY','VARIANT'].includes(o.phase)&&!preparePrelaunch)return this.gate(s,'validation-endpoint-is-public-configuration; no checkout action','VALIDATION_STOPPED');
      let command=afterAddCommand;
      if(command){} // Already selected write-free bag navigation after current positive evidence; common write-ahead/pause guards still apply.
      else if(o.phase==='ENTRY'||o.phase==='VARIANT'||preparePrelaunch){
        // A started bag addition is durable: any return to product configuration cannot add again.
        if(s.bagAddStarted)return this.gate(s,'bag-addition-already-started; no second addition','NEEDS_VERIFICATION');
        if(o.extrasConflict===true)return this.gate(s,'trade-in-or-applecare-selected-on-page; not changed automatically','BLOCKED');
        const next=o.nextChoice!==undefined?o.nextChoice:o.needsSelection?.length?{choice:o.needsSelection[0],state:'enabled'}:null;
        if(next){
          if(typeof next.choice!=='string'||next.state==='ambiguous')return this.gate(s,'required-option-ambiguous','BLOCKED');
          // Not yet hydrated or disabled: wait briefly, never force it, and never call it no stock.
          if(next.state!=='enabled'){if(await poll(this.hydrationMs))continue;return this.gate(s,`required-option-${next.state}; configuration incomplete, availability not established`,'NOT_READY');}
          command={action:'configureProduct',choice:next.choice};
        }else if(o.phase==='ENTRY'){if(o.continueAvailable!==true)return this.gate(s,'official-continue-disabled; availability not established','NOT_READY');command={action:'continueProduct'};}
        else{
          // C069: public selections may be complete before the native Pro form reaches its current canonical SKU.
          // Wait only by re-reading before any Add; this never repeats an already-started addition.
          if(o.productFormLoading===true){if(await poll(this.hydrationMs))continue;return this.gate(s,'product-form-not-ready; no Add sent, availability not established','NOT_READY');}
          if(!o.variantVerified||o.quotedCny>P.maxTotalCny||!Number.isFinite(o.quotedCny)||o.quotedCny<=0)return this.gate(s,'variant-or-price-not-verified','BLOCKED');
          if(validating)return this.gate(s,'public-configuration-validated; stopped before Add to Bag','VALIDATED');
          // C034 (Claude): the cart still holds the earlier task's item, so public choices above remain but Add to Bag does not.
          // Only a fresh bag read of exactly this plan's one item continues, by Checkout.
          // C035-R1 (Claude): a successor, or a run that started from a verified empty bag, adds only after a current read of the
          // normal official bag page at this Add boundary (port.readBag: separate inactive tab, read-only, closed after; the configured
          // product page stays as read). Only a settled verified EMPTY_BAG lets this one Add go out now. An item already there, an
          // unknown/failed/stale read or a pause during the read adds nothing; a port without that read keeps the C034 stop.
          // Codex quota completion: every production ChromePort Add has this capability, even on a brand-new task with no history.
          // Older explicitly synthetic ports retain their test contract; no live ChromePort is exempt from the current cart read.
          if(typeof this.port.readBag==='function'||s.retiredCart||emptyStarted||s.history?.some(h=>h?.event==='verified-empty-bag')){
            if(typeof this.port.readBag!=='function')return this.gate(s,s.retiredCart?'retired-cart-holds-earlier-item; no second addition; open the bag page for a fresh read':'current-bag-not-verified-before-add; nothing added','NEEDS_USER');
            let b=null;try{b=await this.port.readBag(P);}catch{}
            if(this.paused||this.stopped)return this.gate(s,'control-changed-during-bag-read; nothing added',this.stopped?'STOPPED':'PAUSED');
            const fresh=b?.schema==='applebuy-merchant-read/v1'&&b.verifiedStep===true&&['EMPTY_BAG','BAG'].includes(b.phase)&&Number.isSafeInteger(b.seq)&&b.seq>s.lastRead&&
              typeof b.documentId==='string'&&!!b.documentId&&b.documentId!==o.documentId;
            if(fresh)s.lastRead=b.seq;
            s.history=[...(s.history??[]),{event:'add-boundary-bag-read',phase:fresh?b.phase:'UNKNOWN',readSequence:fresh?b.seq:null}].slice(-50);
            if(!fresh)return this.gate(s,'current-bag-not-verified-before-add; nothing added','NEEDS_VERIFICATION');
            if(b.phase==='BAG'){
              if(!itemMatches(P,b.purchase)||b.extras!==false)return this.gate(s,'current-bag-holds-other-items; nothing added, removed or bought','BLOCKED');
              command={action:'openBag'};
            }
          }
          command??={action:'addBag'};
        }
      }else if(o.phase==='EMPTY_BAG'){
        // C035 (Claude): a fresh verified empty bag in a purchase run that never started its own addition: ordinary navigation to the
        // plan's product page, then the normal public preparation and, after the Add-boundary bag read, one Add to Bag. A task whose
        // addition already started never adds again, whatever the bag shows now.
        if(s.bagAddStarted)return this.gate(s,'bag-addition-already-started; an empty bag does not authorize a second addition','NEEDS_VERIFICATION');
        if(o.verifiedStep!==true)return this.gate(s,'unknown');
        emptyStarted=true;
        s.history=[...(s.history??[]),{event:'verified-empty-bag',readSequence:o.seq,at:this.now()}].slice(-50);
        command={action:'openProduct'};
      }else if(o.phase==='ACCESSORIES')command={action:'viewBag'};
      else if(o.phase==='BAG'){if(!itemMatches(P,o.purchase)||o.extras===true)return this.gate(s,s.retiredCart?'retired-cart-bag-not-exactly-this-plan; nothing removed, bought or added':'bag-conditions-not-verified','BLOCKED');command={action:'checkout'};}
      else if(o.phase==='FULFILLMENT'){
        if(!itemMatches(P,o.purchase)||['conflict','ambiguous','disabled'].includes(o.fulfillmentChoice))return this.gate(s,'pickup-conditions-not-verified','BLOCKED');
        // An exact verified allowed store with a selected pickup control is not clicked again: its dependent controls
        // get a bounded wait. Changed evidence during that wait stops. Local selection never implies a held slot.
        const selected=o.fulfillmentChoice==='pickup'&&purchaseMatches(P,o.purchase);
        if(storeWait&&!selected)return this.gate(s,'selected-store-evidence-changed-while-loading; not clicked again','NEEDS_VERIFICATION');
        if(selected){storeWait=true;if(await poll(this.maxWaitMs))continue;return this.gate(s,'selected-store-controls-not-loaded; no slot held, availability not established','NOT_READY');}
        command=o.purchase.fulfillment!=='pickup'?{action:'selectPickup'}:{action:'selectStore',store:P.stores[0]};
      }
      else if(o.phase==='SLOTS'){
        // C051: a slot continued on inherited identity is never followed by a second slot choice.
        if(s.acceptedSlot?.basis===CONTACT_SLOT_BASIS)return this.gate(s,'slot-already-continued; no second slot','NEEDS_VERIFICATION');
        if(!purchaseMatches(P,o.purchase)||o.listComplete!==true||!Number.isSafeInteger(o.generation)||!Array.isArray(o.dates)||o.dates.length===0||o.dates.some(d=>typeof d.label!=='string'||!d.label||typeof d.ref!=='string')||new Set(o.dates.map(d=>d.label)).size!==o.dates.length)return this.gate(s,'slot-list-or-conditions-not-verified','BLOCKED');
        // Freeze the first three ENABLED offered labels once, in merchant order. Never invent a year or roll to a fourth date.
        if(!s.initialDates){const offered=o.dates.filter(d=>d.enabled===true).slice(0,3).map(d=>d.label);if(!offered.length)return this.gate(s,'no-offered-pickup-date-yet; availability not established','NOT_READY');s.initialDates=offered;await this.save(s);}
        const date=s.initialDates[s.dateCursor];if(!date)return this.gate(s,'initial-three-terminal-slots-exhausted','EXHAUSTED');
        const d=o.dates.find(d=>d.label===date);if(!d||!d.enabled){s.dateCursor++;await this.save(s);continue;}
        if(o.selectedDate!==date)command={action:'selectDate',date,ref:d.ref};
        else{
          const t=terminal(o.times);if(!t)return this.gate(s,'native-time-list-unrecognized','BLOCKED');
          const oldFloor=s.floors[date];if(!oldFloor||t.start>oldFloor)s.floors[date]=t.start;await this.save(s);
          if(t.start<s.floors[date]||!t.enabled){s.dateCursor++;await this.save(s);continue;}
          if(s.rejected.some(r=>r.date===date&&r.start===t.start&&r.end===t.end&&r.generation>=o.generation))return this.gate(s,'no-fresh-refusal-list','NEEDS_VERIFICATION');
          command={action:'chooseSlot',date,start:t.start,end:t.end,ref:t.ref,generation:o.generation};
        }
      }else if(o.phase==='DETAILS'){
        // C051: a contact-only step needs this task's verified accepted slot and the same current bounds; fresh full evidence keeps priority.
        const contact=!purchaseMatches(P,o.purchase)&&s.acceptedSlot?.verified===true&&contactStepCurrent(P,s,o);
        if(!s.acceptedSlot||!purchaseMatches(P,o.purchase)&&!contact)return this.gate(s,'accepted-slot-or-details-conditions-missing','BLOCKED');
        if(contact&&!s.inheritedIdentity)s.inheritedIdentity=inheritedIdentity(P,s,o,'purchase-verified-at-slot-acceptance');
        command=contact?{action:'fillDetails',contactOnly:true}:{action:'fillDetails'};
      }else if(o.phase==='PAYMENT'){
        if(!s.acceptedSlot||!purchaseMatches(P,o.purchase))return this.gate(s,'payment-conditions-not-verified','BLOCKED');command={action:o.paymentMethod===P.paymentMethod?'continuePayment':'selectPayment'};
      }else if(o.phase==='REVIEW'){
        // Merchant no-extras evidence only (never the human grant); the total must equal the quote recorded at Add to Bag.
        if(!s.acceptedSlot||!purchaseMatches(P,o.purchase)||o.paymentMethod!==P.paymentMethod||o.extras!==false||(s.quotedCny!==null&&o.purchase.totalCny!==s.quotedCny)||o.existingOrdersChecked!==true||!sameAcceptedSlot(s,o.slotSummary))return this.gate(s,'final-review-or-existing-order-check-missing','BLOCKED');
        // A positively not-dispatched final may be prepared again only under a different, current human grant.
        if(s.finalIntent&&(s.finalIntent.sent!==false||!grant||grant.id===s.finalIntent.grantId))return this.gate(s,'final-intent-already-recorded','NEEDS_VERIFICATION');
        if(!grant||typeof grant.id!=='string'||grant.taskId!==s.taskId||grant.planDigest!==s.planDigest||(grant.start!==true&&grant.documentId!==o.documentId)||grant.termsAccepted!==true||!o.termsLinks?.includes(grant.termsUrl)||!Number.isFinite(grant.expiry)||grant.expiry<=this.now()||grant.expiry>this.now()+(grant.start===true?1800000:180000))return this.gate(s,'confirm-current-terms-and-this-one-order');
        if(s.finalIntent)s.history=[...(s.history??[]),{event:'final-not-dispatched',intentId:s.finalIntent.id,grantId:s.finalIntent.grantId}];
        s.finalIntent={id:this.id(),grantId:grant.id,sent:false};await this.save(s);command={action:'submitOrder',intentId:s.finalIntent.id,finalGrant:{...clone(grant),documentId:o.documentId}};
      }else return this.gate(s,'unsupported-merchant-stage','NEEDS_VERIFICATION');
      if(validating&&!PUBLIC.has(command.action))return this.gate(s,'validation-mode-cannot-mutate-merchant-resources','VALIDATION_STOPPED');
      if(s.expiresAt<=this.now())return this.gate(s,'task-window-expired; existing intent preserved','EXPIRED');
      if(this.paused||this.stopped)return this.gate(s,'control-changed-before-send',this.stopped?'STOPPED':'PAUSED');
      // Write-ahead before EVERY mutation. Storage failure means zero send. Bag-add start is durable in the same write.
      s.pending={...command,id:this.id(),documentId:o.documentId,beforePhase:o.phase,deadline:this.now()+8000};
      if(command.action==='submitOrder')s.finalIntent.sent=true;
      if(command.action==='addBag'){s.bagAddStarted=true;s.quotedCny=o.quotedCny;}
      // C-019 (Claude): checkout leaves a bag that already holds the item; this task never adds afterwards (kept if untouched).
      if(command.action==='checkout'){s.bagAddStarted=true;s.bagTotalCny=o.purchase.totalCny;}
      if(!PUBLIC.has(command.action)&&!NAVIGATION.has(command.action))s.resourceWritten=true;
      // C-022-R1 (Claude): a committed command may change the page; until the next valid read it is no longer current.
      s.observationCurrent=false;
      await this.save(s);
      if(this.paused||this.stopped){
        // Known pre-send control change: act was never called, so record not dispatched truthfully.
        s.pending.dispatched=false;if(command.action==='submitOrder')s.finalIntent.sent=false;await this.save(s);
        return this.gate(s,'control-changed-after-write; not dispatched',this.stopped?'STOPPED':'PAUSED');
      }
      let reply;try{reply=await this.port.act({...s.pending,plan:clone(P),taskId:s.taskId,planDigest:s.planDigest});}catch{return this.gate(s,'mutation-transport-lost; reconcile before proceeding','NEEDS_VERIFICATION');}
      if(reply?.delivered===false&&reply.touched===false){
        // Positively untouched: no control was written. Clear durably, then re-observe within bounded counts. The durable
        // consecutive count resets only on verified progress of a delivered action; this run's absolute count never resets.
        const p=s.pending;s.pending=null;s.untouchedFailures++;s.untouchedStreak++;untouchedRun++;if(p.action==='addBag')s.bagAddStarted=false;if(p.action==='submitOrder')s.finalIntent.sent=false;
        s.history=[...(s.history??[]),{event:'untouched-not-sent',action:p.action,reason:typeof reply.reason==='string'?reply.reason.slice(0,60):null}].slice(-50);await this.save(s);
        if(s.untouchedStreak>this.maxUntouched)return this.gate(s,'repeated-untouched-failures; human check required','NEEDS_VERIFICATION');
        if(untouchedRun>this.maxUntouchedPerRun)return this.gate(s,'untouched-failure-run-limit; human check required','NEEDS_VERIFICATION');
        if(p.action==='submitOrder')return this.gate(s,'final-not-dispatched; fresh confirmation required');
        continue;
      }
      if(reply?.orderRefHash&&command.action==='submitOrder')s.orderRefHash=reply.orderRefHash;
      await this.save(s);
      // Even an apparently successful click is not acceptance. The next iteration must inspect current evidence.
    }
  }
}
