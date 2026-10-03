// Codex C-012 quota takeover. Transport-independent official-checkout controller.
// This controller does not make a merchant request; ChromePort supplies normal UI operations.
// C-012-R1 (Claude): fixed no-extras intent, durable bag-add record, expiry-safe final lookup, truthful
// not-dispatched state, untouched-failure recovery, elapsed-time wait budget, validation modes, retire/rebind.
// C-013-R1 (Claude): durable consecutive untouched bound reset only by verified progress plus a per-run absolute
// bound; an already selected exact allowed pickup store waits within a bound instead of being clicked again.
// C-018 (Claude): a persisted plan is compared independent of object-member order only.
export const TASK_KEY='applebuy-single-personal-purchase/v1';
// Public-configuration validation never uses the purchase task key, so it cannot consume a purchase task.
export const VALIDATION_KEY='applebuy-public-configuration-validation/v1';
export const NO_EXTRAS=Object.freeze({tradeIn:'none',appleCare:'none'});
const STOP=new Set(['AUTH','CONSENT','CHALLENGE','THROTTLE','UNKNOWN','DETAILS_UNSUPPORTED']);
const ACTIONS=['configureProduct','continueProduct','addBag','viewBag','checkout','selectPickup','selectStore','selectDate','chooseSlot','fillDetails','selectPayment','continuePayment','submitOrder'];
// Public product-page choices create no merchant resource. Every other action is a merchant mutation.
const PUBLIC=new Set(['configureProduct','continueProduct']);
const SLOT=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const clone=x=>structuredClone(x);
// C021 quota takeover: diagnostics carry only this fixed official origin grammar, never raw errors or URL queries.
const safePermissionOrigin=x=>typeof x==='string'&&/^https:\/\/(?:www\.apple\.com\.cn|secure\d*\.www\.apple\.com\.cn)$/.test(x)?x:null;
const optBool=v=>v===undefined||typeof v==='boolean';
export function validStored(s){return s&&s.schema==='applebuy-purchase-job/v1'&&typeof s.taskId==='string'&&typeof s.planDigest==='string'&&Number.isSafeInteger(s.tabId)&&validIntent(s.plan)&&Number.isSafeInteger(s.lastRead)&&s.lastRead>=0&&Number.isFinite(s.expiresAt)&&Number.isSafeInteger(s.dateCursor)&&s.dateCursor>=0&&s.dateCursor<=3&&Number.isSafeInteger(s.refusals)&&s.refusals>=0&&Array.isArray(s.rejected)&&s.rejected.every(r=>typeof r.date==='string'&&SLOT.test(r.start)&&SLOT.test(r.end)&&Number.isSafeInteger(r.generation))&&s.floors&&typeof s.floors==='object'&&Object.values(s.floors).every(t=>SLOT.test(t))&&(s.initialDates===null||(Array.isArray(s.initialDates)&&s.initialDates.length<=3&&new Set(s.initialDates).size===s.initialDates.length&&s.initialDates.every(d=>typeof d==='string')))&&(s.pending===null||(typeof s.pending.id==='string'&&typeof s.pending.documentId==='string'&&Number.isFinite(s.pending.deadline)&&ACTIONS.includes(s.pending.action)&&(s.pending.dispatched===undefined||s.pending.dispatched===false)))&&(s.finalIntent===null||(typeof s.finalIntent.id==='string'&&typeof s.finalIntent.sent==='boolean'))&&(!s.finalIntent?.sent||s.pending?.action==='submitOrder'||s.state==='CONFIRMED_UNPAID')&&
  optBool(s.bagAddStarted)&&optBool(s.resourceWritten)&&optBool(s.reconcileOnly)&&(s.untouchedFailures===undefined||(Number.isSafeInteger(s.untouchedFailures)&&s.untouchedFailures>=0))&&
  // The consecutive count is part of the cumulative count; a streak above a recorded total is not a trustworthy record.
  (s.untouchedStreak===undefined||(Number.isSafeInteger(s.untouchedStreak)&&s.untouchedStreak>=0&&(s.untouchedFailures===undefined||s.untouchedStreak<=s.untouchedFailures)))&&(s.quotedCny===undefined||s.quotedCny===null||Number.isFinite(s.quotedCny))&&
  (s.revokedGrantIds===undefined||(Array.isArray(s.revokedGrantIds)&&s.revokedGrantIds.every(x=>typeof x==='string')))&&(s.retiredHistory===undefined||(Array.isArray(s.retiredHistory)&&s.retiredHistory.every(r=>r?.schema==='applebuy-purchase-job/v1'&&r.state==='RETIRED')))&&(s.history===undefined||Array.isArray(s.history));}
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
// Retirement is allowed only when no merchant mutation was ever written; legacy records without the fields are not provable.
export function retirable(s){return s.resourceWritten===false&&s.bagAddStarted===false&&s.finalIntent===null&&(s.pending===null||PUBLIC.has(s.pending.action));}
function terminal(times){
  if(!Array.isArray(times)||times.length===0||times.some(t=>!SLOT.test(t.start)||!SLOT.test(t.end)||t.start>=t.end||typeof t.ref!=='string'))return null;
  const keys=times.map(t=>t.start+'-'+t.end);if(new Set(keys).size!==keys.length)return null;
  return [...times].sort((a,b)=>a.start.localeCompare(b.start)||a.end.localeCompare(b.end)).at(-1);
}
export class PurchaseJob {
  constructor({store,port,now=()=>Date.now(),id=()=>crypto.randomUUID(),maxSteps=100,maxWaitMs=30000,hydrationMs=3000,maxPolls=2000,maxUntouched=3,maxUntouchedPerRun=12,onState=()=>{}}){Object.assign(this,{store,port,now,id,maxSteps,maxWaitMs,hydrationMs,maxPolls,maxUntouched,maxUntouchedPerRun,onState});this.paused=false;this.stopped=false;this.key=TASK_KEY;this.runGrant=null;}
  pause(){this.paused=true;} resume(){this.paused=false;} stop(){this.stopped=true;}
  async save(s){await this.store.put(this.key,clone(s));this.onState({state:s.state,phase:s.lastPhase,reason:s.reason??null,refusals:s.refusals,finalIntent:s.finalIntent!==null,pendingAction:ACTIONS.includes(s.pending?.action)?s.pending.action:null,permissionOrigin:safePermissionOrigin(s.permissionOrigin),observationCurrent:s.observationCurrent===true});}
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
    const fresh=()=>({schema:'applebuy-purchase-job/v1',taskId:(validating?null:taskId)??this.id(),plan:clone(P),planDigest,tabId,state:'RUNNING',lastPhase:null,lastDocumentId:null,entryDocumentId:null,reason:null,pending:null,finalIntent:null,orderRefHash:null,initialDates:null,dateCursor:0,floors:{},rejected:[],refusals:0,lastRead:0,expiresAt:this.now()+(validating?300000:1800000),bagAddStarted:false,resourceWritten:false,untouchedFailures:0,untouchedStreak:0,quotedCny:null,mode});
    let s;
    if(old?.state==='RETIRED'){if(rebind)throw new Error('NoPreservedTaskToRebind');const {retiredHistory=[],...prev}=old;s={...fresh(),retiredHistory:[...retiredHistory,prev]};}
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
    if(rebind&&s.tabId!==tabId){s.history=[...(s.history??[]),{event:'human-tab-rebind',fromTabId:s.tabId,toTabId:tabId,at:this.now()}];s.tabId=tabId;}
    // A human rebind permanently limits this task to read-only reconciliation; it never adds purchase authority.
    if(rebind)s.reconcileOnly=true;
    if(s.state==='CONFIRMED_UNPAID')return clone(s);
    if(s.finalIntent&&s.finalIntent.sent&&s.pending?.action!=='submitOrder')return this.gate(s,'final-intent-already-consumed','NEEDS_VERIFICATION');
    if(grant&&s.revokedGrantIds?.includes(grant.id))return this.gate(s,'advance-authorization-cleared-by-human-intervention','BLOCKED');
    s.state='RUNNING';s.reason=null;await this.save(s);
    // storeWait marks a wait episode for an already selected store; untouchedRun is this run's absolute untouched count.
    let step=0,polls=0,waitSince=null,polling=false,storeWait=false,untouchedRun=0;
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
      let o;try{o=await this.port.observe(P);}catch(error){const origin=error?.message==='CurrentHostPermissionMissing'?safePermissionOrigin(error.origin):null;if(origin){s.permissionOrigin=origin;return this.gate(s,'current-host-permission-missing; no automatic action','NEEDS_USER');}return this.gate(s,'observation-transport-failed','NEEDS_VERIFICATION');}
      if(!o||o.schema!=='applebuy-merchant-read/v1'||!o.documentId||!Number.isSafeInteger(o.seq)||o.seq<=s.lastRead)return this.gate(s,'invalid-or-stale-observation','NEEDS_VERIFICATION');
      s.lastRead=o.seq;s.lastPhase=o.phase;s.lastDocumentId=o.documentId;s.entryDocumentId??=o.documentId;s.observationCurrent=true;delete s.permissionOrigin;await this.save(s);
      if(this.paused||this.stopped)return this.gate(s,'control-changed-during-read; sent operations preserved',this.stopped?'STOPPED':'PAUSED');
      if(grant?.start===true&&!finalLookup&&(grant.entryDocumentId!==s.entryDocumentId||grant.taskId!==s.taskId||grant.planDigest!==s.planDigest||grant.existingOrdersChecked!==true||grant.noExtras!==true||grant.termsAccepted!==true||!Number.isFinite(grant.expiry)||grant.expiry<=this.now()||grant.expiry>this.now()+1800000))return this.gate(s,'start-authorization-no-longer-current','BLOCKED');
      // Reconcile a previously delivered command, including a crash/restart. Never send it again.
      if(s.pending){
        const pending=s.pending;
        // Positively known not dispatched (pause/stop after the write-ahead, before act): recover truthfully.
        if(pending.dispatched===false){s.pending=null;if(pending.action==='addBag')s.bagAddStarted=false;if(pending.action==='submitOrder'&&s.finalIntent)s.finalIntent.sent=false;await this.save(s);continue;}
        if(pending.action==='submitOrder'){
          if(readOnly)return this.gate(s,'final-result-unconfirmed; no resubmission','NEEDS_VERIFICATION');
          if(!s.orderRefHash&&o.phase==='ORDER_RECEIPT'&&o.receiptVerified===true&&purchaseMatches(P,o.purchase)&&o.orderRefHash){s.orderRefHash=o.orderRefHash;await this.save(s);}
          // C-023 (Claude): the lookup may follow the receipt's own detail link and read pages this job never validates or
          // records, so from here the last validated read is named only as the last read page, never the current one.
          s.observationCurrent=false;
          let order;try{order=await this.port.lookupOrder(P,s.orderRefHash);}catch{}
          if(order?.independent===true&&order.state==='unpaid'&&s.orderRefHash&&order.orderRefHash===s.orderRefHash&&purchaseMatches(P,order.purchase)&&order.acceptedSlot?.date===s.acceptedSlot?.date&&order.acceptedSlot?.start===s.acceptedSlot?.start&&order.acceptedSlot?.end===s.acceptedSlot?.end){s.pending=null;s.state='CONFIRMED_UNPAID';s.reason=null;await this.save(s);return clone(s);}
          return this.gate(s,'final-result-unconfirmed; no resubmission','NEEDS_VERIFICATION');
        }
        if(pending.action==='chooseSlot'){
          if(o.feedback?.kind==='slot-refused'&&o.feedback.verified===true&&o.feedback.ref===pending.ref&&o.feedback.generation>pending.generation){
            s.rejected.push({date:pending.date,start:pending.start,end:pending.end,generation:pending.generation});s.refusals++;s.pending=null;s.dateCursor++;await this.save(s);
            if(s.refusals>5)return this.gate(s,'refusal-bound-reached','EXHAUSTED');continue;
          }
          if(['DETAILS','PAYMENT','REVIEW'].includes(o.phase)&&o.acceptedSlot?.verified===true&&purchaseMatches(P,o.purchase)&&o.acceptedSlot.date===pending.date&&o.acceptedSlot.start===pending.start&&o.acceptedSlot.end===pending.end){s.acceptedSlot=clone(o.acceptedSlot);s.pending=null;s.untouchedStreak=0;await this.save(s);continue;}
          if(!readOnly&&(o.phase==='PROCESSING'||o.phase===pending.beforePhase)&&this.now()<pending.deadline&&await poll(this.maxWaitMs))continue;
          return this.gate(s,'slot-result-unconfirmed; no resubmission','NEEDS_VERIFICATION');
        }
        const reached={configureProduct:['ENTRY','VARIANT'],continueProduct:['VARIANT'],addBag:['ACCESSORIES','BAG'],viewBag:['BAG'],checkout:['FULFILLMENT','SLOTS'],selectPickup:['FULFILLMENT','SLOTS'],selectStore:['SLOTS'],selectDate:['SLOTS'],fillDetails:['PAYMENT'],selectPayment:['PAYMENT'],continuePayment:['REVIEW']}[pending.action]??[];
        const conditions=o.phase==='BAG'||o.phase==='FULFILLMENT'?itemMatches(P,o.purchase):!['SLOTS','PAYMENT','REVIEW'].includes(o.phase)||purchaseMatches(P,o.purchase);
        if(reached.includes(o.phase)&&o.verifiedStep===true&&conditions&&(!readOnly||o.extras!==true)&&(pending.action!=='selectPickup'||o.purchase?.fulfillment==='pickup')&&(pending.action!=='selectDate'||o.selectedDate===pending.date)&&(pending.action!=='configureProduct'||o.selectedProductChoices?.includes(pending.choice))&&(pending.action!=='selectPayment'||o.paymentMethod===P.paymentMethod)){s.pending=null;s.untouchedStreak=0;await this.save(s);if(readOnly)return this.gate(s,'same-tab-read-only-reconciliation-complete; no new purchase action','NEEDS_USER');continue;}
        if(STOP.has(o.phase))return this.gate(s,o.phase.toLowerCase());
        if(!readOnly&&(o.phase===pending.beforePhase||o.phase==='PROCESSING')&&this.now()<pending.deadline&&await poll(this.maxWaitMs))continue;
        return this.gate(s,'mutation-result-unconfirmed; no automatic repeat','NEEDS_VERIFICATION');
      }
      if(s.reconcileOnly)return this.gate(s,'read-only-reconciliation-complete; a rebound tab cannot add purchase authority','NEEDS_USER');
      if(STOP.has(o.phase))return this.gate(s,o.phase.toLowerCase());
      if(readOnly)return this.gate(s,'same-tab-read-only-reconciliation-complete; no new purchase action','NEEDS_USER');
      if(o.phase==='PROCESSING'){if(await poll(this.maxWaitMs))continue;return this.gate(s,'merchant-processing-time-bound-reached','NEEDS_VERIFICATION');}
      if(o.phase==='PRELAUNCH')return this.gate(s,'official-entry-not-released','NOT_RELEASED');
      if(validating&&!['ENTRY','VARIANT'].includes(o.phase))return this.gate(s,'validation-endpoint-is-public-configuration; no checkout action','VALIDATION_STOPPED');
      let command;
      if(o.phase==='ENTRY'||o.phase==='VARIANT'){
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
          if(!o.variantVerified||o.quotedCny>P.maxTotalCny||!Number.isFinite(o.quotedCny)||o.quotedCny<=0)return this.gate(s,'variant-or-price-not-verified','BLOCKED');
          if(validating)return this.gate(s,'public-configuration-validated; stopped before Add to Bag','VALIDATED');
          command={action:'addBag'};
        }
      }else if(o.phase==='ACCESSORIES')command={action:'viewBag'};
      else if(o.phase==='BAG'){if(!itemMatches(P,o.purchase)||o.extras===true)return this.gate(s,'bag-conditions-not-verified','BLOCKED');command={action:'checkout'};}
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
        if(!s.acceptedSlot||!purchaseMatches(P,o.purchase))return this.gate(s,'accepted-slot-or-details-conditions-missing','BLOCKED');command={action:'fillDetails'};
      }else if(o.phase==='PAYMENT'){
        if(!s.acceptedSlot||!purchaseMatches(P,o.purchase))return this.gate(s,'payment-conditions-not-verified','BLOCKED');command={action:o.paymentMethod===P.paymentMethod?'continuePayment':'selectPayment'};
      }else if(o.phase==='REVIEW'){
        // Merchant no-extras evidence only (never the human grant); the total must equal the quote recorded at Add to Bag.
        if(!s.acceptedSlot||!purchaseMatches(P,o.purchase)||o.paymentMethod!==P.paymentMethod||o.extras!==false||(s.quotedCny!==null&&o.purchase.totalCny!==s.quotedCny)||o.existingOrdersChecked!==true||o.slotSummary?.date!==s.acceptedSlot.date||o.slotSummary?.start!==s.acceptedSlot.start||o.slotSummary?.end!==s.acceptedSlot.end)return this.gate(s,'final-review-or-existing-order-check-missing','BLOCKED');
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
      if(command.action==='checkout')s.bagAddStarted=true;
      if(!PUBLIC.has(command.action))s.resourceWritten=true;
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
