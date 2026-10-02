// Codex C-012 quota takeover. Transport-independent official-checkout controller.
// This controller does not make a merchant request; ChromePort supplies normal UI operations.
export const TASK_KEY='applebuy-single-personal-purchase/v1';
const STOP=new Set(['AUTH','CONSENT','CHALLENGE','THROTTLE','UNKNOWN','DETAILS_UNSUPPORTED']);
const SLOT=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const clone=x=>structuredClone(x);
export function validStored(s){return s&&s.schema==='applebuy-purchase-job/v1'&&typeof s.taskId==='string'&&typeof s.planDigest==='string'&&Number.isSafeInteger(s.tabId)&&validIntent(s.plan)&&Number.isSafeInteger(s.lastRead)&&s.lastRead>=0&&Number.isFinite(s.expiresAt)&&Number.isSafeInteger(s.dateCursor)&&s.dateCursor>=0&&s.dateCursor<=3&&Number.isSafeInteger(s.refusals)&&s.refusals>=0&&Array.isArray(s.rejected)&&s.rejected.every(r=>typeof r.date==='string'&&SLOT.test(r.start)&&SLOT.test(r.end)&&Number.isSafeInteger(r.generation))&&s.floors&&typeof s.floors==='object'&&Object.values(s.floors).every(t=>SLOT.test(t))&&(s.initialDates===null||(Array.isArray(s.initialDates)&&s.initialDates.length<=3&&new Set(s.initialDates).size===s.initialDates.length&&s.initialDates.every(d=>typeof d==='string')))&&(s.pending===null||(typeof s.pending.id==='string'&&typeof s.pending.documentId==='string'&&Number.isFinite(s.pending.deadline)&&['configureProduct','continueProduct','addBag','viewBag','checkout','selectPickup','selectStore','selectDate','chooseSlot','fillDetails','selectPayment','continuePayment','submitOrder'].includes(s.pending.action)))&&(s.finalIntent===null||(typeof s.finalIntent.id==='string'&&typeof s.finalIntent.sent==='boolean'))&&(!s.finalIntent?.sent||s.pending?.action==='submitOrder'||s.state==='CONFIRMED_UNPAID');}
export function validIntent(p){
  return p?.schema==='applebuy-intent/v1'&&p.quantity===1&&p.fulfillment==='pickup'&&p.city==='大连'&&
    ['iPhone Duo','iPhone 18 Pro'].includes(p.product?.model)&&p.product?.capacity==='256GB'&&
    (p.product.model==='iPhone Duo'?p.product.color==='星光白色':p.product.color==='黑色')&&
    Number.isSafeInteger(p.maxTotalCny)&&p.maxTotalCny>0&&p.maxTotalCny<100000&&
    Array.isArray(p.stores)&&p.stores.length>0&&p.stores.every(s=>s==='Apple 大连恒隆广场')&&
    p.dateRule==='initial-first-three-terminal'&&p.paymentMethod==='支付宝';
}
export function purchaseMatches(p,c){
  return !!c&&c.verified===true&&c.model===p.product.model&&c.capacity===p.product.capacity&&c.color===p.product.color&&
    c.quantity===1&&c.fulfillment==='pickup'&&p.stores.includes(c.store)&&Number.isFinite(c.totalCny)&&c.totalCny>0&&c.totalCny<=p.maxTotalCny;
}
export function itemMatches(p,c){return !!c&&c.itemVerified===true&&c.model===p.product.model&&c.capacity===p.product.capacity&&c.color===p.product.color&&c.quantity===1&&Number.isFinite(c.totalCny)&&c.totalCny>0&&c.totalCny<=p.maxTotalCny;}
function terminal(times){
  if(!Array.isArray(times)||times.length===0||times.some(t=>!SLOT.test(t.start)||!SLOT.test(t.end)||t.start>=t.end||typeof t.ref!=='string'))return null;
  const keys=times.map(t=>t.start+'-'+t.end);if(new Set(keys).size!==keys.length)return null;
  return [...times].sort((a,b)=>a.start.localeCompare(b.start)||a.end.localeCompare(b.end)).at(-1);
}
export class PurchaseJob {
  constructor({store,port,now=()=>Date.now(),id=()=>crypto.randomUUID(),maxSteps=100,onState=()=>{}}){Object.assign(this,{store,port,now,id,maxSteps,onState});this.paused=false;this.stopped=false;}
  pause(){this.paused=true;} resume(){this.paused=false;} stop(){this.stopped=true;}
  async save(s){await this.store.put(TASK_KEY,clone(s));this.onState({state:s.state,phase:s.lastPhase,reason:s.reason??null,refusals:s.refusals,finalIntent:s.finalIntent!==null});}
  async gate(s,reason,state='NEEDS_USER'){s.state=state;s.reason=reason;await this.save(s);return clone(s);}
  async run(plan,{tabId,planDigest,grant=null,taskId=null}={}){
    if(!validIntent(plan)||!Number.isSafeInteger(tabId)||!planDigest)throw new Error('InvalidPurchaseConfiguration');
    const old=await this.store.get(TASK_KEY);
    if(old&&!validStored(old))throw new Error('StoredPurchaseTaskCorrupt');
    let s=old??{schema:'applebuy-purchase-job/v1',taskId:taskId??this.id(),plan:clone(plan),planDigest,tabId,state:'RUNNING',lastPhase:null,lastDocumentId:null,entryDocumentId:null,reason:null,pending:null,finalIntent:null,orderRefHash:null,initialDates:null,dateCursor:0,floors:{},rejected:[],refusals:0,lastRead:0,expiresAt:this.now()+1800000};
    if(s.schema!=='applebuy-purchase-job/v1'||s.planDigest!==planDigest||JSON.stringify(s.plan)!==JSON.stringify(plan)||s.tabId!==tabId)return this.gate(s,'existing-task-binding-differs','BLOCKED');
    if(s.state==='CONFIRMED_UNPAID')return clone(s);
    if(s.finalIntent&&s.finalIntent.sent&&s.pending?.action!=='submitOrder')return this.gate(s,'final-intent-already-consumed','NEEDS_VERIFICATION');
    s.state='RUNNING';s.reason=null;await this.save(s);
    for(let step=0;step<this.maxSteps;step++){
      if(s.expiresAt<=this.now())return this.gate(s,'task-window-expired; existing intent preserved','EXPIRED');
      if(this.stopped)return this.gate(s,'stopped; sent operations may still complete','STOPPED');
      if(this.paused)return this.gate(s,'paused; sent operations may still complete','PAUSED');
      let o;try{o=await this.port.observe(plan);}catch{return this.gate(s,'observation-transport-failed','NEEDS_VERIFICATION');}
      if(!o||o.schema!=='applebuy-merchant-read/v1'||!o.documentId||!Number.isSafeInteger(o.seq)||o.seq<=s.lastRead)return this.gate(s,'invalid-or-stale-observation','NEEDS_VERIFICATION');
      s.lastRead=o.seq;s.lastPhase=o.phase;s.lastDocumentId=o.documentId;s.entryDocumentId??=o.documentId;await this.save(s);
      if(grant?.start===true&&(grant.entryDocumentId!==s.entryDocumentId||grant.taskId!==s.taskId||grant.planDigest!==s.planDigest||grant.existingOrdersChecked!==true||grant.noExtras!==true||grant.termsAccepted!==true||!Number.isFinite(grant.expiry)||grant.expiry<=this.now()||grant.expiry>this.now()+1800000))return this.gate(s,'start-authorization-no-longer-current','BLOCKED');
      // Reconcile a previously delivered command, including a crash/restart. Never send it again.
      if(s.pending){
        const pending=s.pending;
        if(pending.action==='submitOrder'){
          if(!s.orderRefHash&&o.phase==='ORDER_RECEIPT'&&o.receiptVerified===true&&purchaseMatches(plan,o.purchase)&&o.orderRefHash){s.orderRefHash=o.orderRefHash;await this.save(s);}
          let order;try{order=await this.port.lookupOrder(plan,s.orderRefHash);}catch{}
          if(order?.independent===true&&order.state==='unpaid'&&s.orderRefHash&&order.orderRefHash===s.orderRefHash&&purchaseMatches(plan,order.purchase)&&order.acceptedSlot?.date===s.acceptedSlot?.date&&order.acceptedSlot?.start===s.acceptedSlot?.start&&order.acceptedSlot?.end===s.acceptedSlot?.end){s.pending=null;s.state='CONFIRMED_UNPAID';s.reason=null;await this.save(s);return clone(s);}
          return this.gate(s,'final-result-unconfirmed; no resubmission','NEEDS_VERIFICATION');
        }
        if(pending.action==='chooseSlot'){
          if(o.feedback?.kind==='slot-refused'&&o.feedback.verified===true&&o.feedback.ref===pending.ref&&o.feedback.generation>pending.generation){
            s.rejected.push({date:pending.date,start:pending.start,end:pending.end,generation:pending.generation});s.refusals++;s.pending=null;s.dateCursor++;await this.save(s);
            if(s.refusals>5)return this.gate(s,'refusal-bound-reached','EXHAUSTED');continue;
          }
          if(['DETAILS','PAYMENT','REVIEW'].includes(o.phase)&&o.acceptedSlot?.verified===true&&purchaseMatches(plan,o.purchase)&&o.acceptedSlot.date===pending.date&&o.acceptedSlot.start===pending.start&&o.acceptedSlot.end===pending.end){s.acceptedSlot=clone(o.acceptedSlot);s.pending=null;await this.save(s);continue;}
          if((o.phase==='PROCESSING'||o.phase===pending.beforePhase)&&this.now()<pending.deadline&&this.port.wait){await this.port.wait(50);continue;}
          return this.gate(s,'slot-result-unconfirmed; no resubmission','NEEDS_VERIFICATION');
        }
        const reached={configureProduct:['ENTRY','VARIANT'],continueProduct:['VARIANT'],addBag:['ACCESSORIES','BAG'],viewBag:['BAG'],checkout:['FULFILLMENT','SLOTS'],selectPickup:['FULFILLMENT','SLOTS'],selectStore:['SLOTS'],selectDate:['SLOTS'],fillDetails:['PAYMENT'],selectPayment:['PAYMENT'],continuePayment:['REVIEW']}[pending.action]??[];
        const conditions=o.phase==='BAG'||o.phase==='FULFILLMENT'?itemMatches(plan,o.purchase):!['SLOTS','PAYMENT','REVIEW'].includes(o.phase)||purchaseMatches(plan,o.purchase);
        if(reached.includes(o.phase)&&o.verifiedStep===true&&conditions&&(pending.action!=='selectPickup'||o.purchase?.fulfillment==='pickup')&&(pending.action!=='selectDate'||o.selectedDate===pending.date)&&(pending.action!=='configureProduct'||o.selectedProductChoices?.includes(pending.choice))&&(pending.action!=='selectPayment'||o.paymentMethod===plan.paymentMethod)){s.pending=null;await this.save(s);continue;}
        if(STOP.has(o.phase))return this.gate(s,o.phase.toLowerCase());
        if((o.phase===pending.beforePhase||o.phase==='PROCESSING')&&this.now()<pending.deadline&&this.port.wait){await this.port.wait(50);continue;}
        return this.gate(s,'mutation-result-unconfirmed; no automatic repeat','NEEDS_VERIFICATION');
      }
      if(STOP.has(o.phase))return this.gate(s,o.phase.toLowerCase());
      if(o.phase==='PROCESSING'){if(this.port.wait){await this.port.wait(50);continue;}return this.gate(s,'merchant-processing','NEEDS_VERIFICATION');}
      if(o.phase==='PRELAUNCH')return this.gate(s,'official-entry-not-released','NOT_RELEASED');
      let command;
      if(o.phase==='ENTRY'){if(!o.needsSelection?.length&&o.continueAvailable!==true)return this.gate(s,'official-continue-disabled; availability not established','NOT_READY');command=o.needsSelection?.length?{action:'configureProduct',choice:o.needsSelection[0]}:{action:'continueProduct'};}
      else if(o.phase==='VARIANT'){
        if(!o.variantVerified||o.quotedCny>plan.maxTotalCny||!Number.isFinite(o.quotedCny)||o.quotedCny<=0)return this.gate(s,'variant-or-price-not-verified','BLOCKED');
        command={action:'addBag'};
      }else if(o.phase==='ACCESSORIES')command={action:'viewBag'};
      else if(o.phase==='BAG'){if(!itemMatches(plan,o.purchase))return this.gate(s,'bag-conditions-not-verified','BLOCKED');command={action:'checkout'};}
      else if(o.phase==='FULFILLMENT'){if(!itemMatches(plan,o.purchase))return this.gate(s,'pickup-conditions-not-verified','BLOCKED');command=o.purchase.fulfillment!=='pickup'?{action:'selectPickup'}:{action:'selectStore',store:plan.stores[0]};}
      else if(o.phase==='SLOTS'){
        if(!purchaseMatches(plan,o.purchase)||o.listComplete!==true||!Number.isSafeInteger(o.generation)||!Array.isArray(o.dates)||o.dates.length===0||o.dates.some(d=>typeof d.label!=='string'||!d.label||typeof d.ref!=='string')||new Set(o.dates.map(d=>d.label)).size!==o.dates.length)return this.gate(s,'slot-list-or-conditions-not-verified','BLOCKED');
        // Freeze actual offered labels in merchant order. Never invent a calendar year or roll to a fourth date.
        if(!s.initialDates){s.initialDates=o.dates.slice(0,3).map(d=>d.label);await this.save(s);}
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
        if(!s.acceptedSlot||!purchaseMatches(plan,o.purchase))return this.gate(s,'accepted-slot-or-details-conditions-missing','BLOCKED');command={action:'fillDetails'};
      }else if(o.phase==='PAYMENT'){
        if(!s.acceptedSlot||!purchaseMatches(plan,o.purchase))return this.gate(s,'payment-conditions-not-verified','BLOCKED');command={action:o.paymentMethod===plan.paymentMethod?'continuePayment':'selectPayment'};
      }else if(o.phase==='REVIEW'){
        if(!s.acceptedSlot||!purchaseMatches(plan,o.purchase)||o.paymentMethod!==plan.paymentMethod||o.extras!==false||o.existingOrdersChecked!==true||o.slotSummary?.date!==s.acceptedSlot.date||o.slotSummary?.start!==s.acceptedSlot.start||o.slotSummary?.end!==s.acceptedSlot.end)return this.gate(s,'final-review-or-existing-order-check-missing','BLOCKED');
        if(s.finalIntent)return this.gate(s,'final-intent-already-recorded','NEEDS_VERIFICATION');
        if(!grant||typeof grant.id!=='string'||grant.taskId!==s.taskId||grant.planDigest!==s.planDigest||(grant.start!==true&&grant.documentId!==o.documentId)||grant.termsAccepted!==true||!o.termsLinks?.includes(grant.termsUrl)||!Number.isFinite(grant.expiry)||grant.expiry<=this.now()||grant.expiry>this.now()+(grant.start===true?1800000:180000))return this.gate(s,'confirm-current-terms-and-this-one-order');
        s.finalIntent={id:this.id(),grantId:grant.id,sent:false};await this.save(s);command={action:'submitOrder',intentId:s.finalIntent.id,finalGrant:{...clone(grant),documentId:o.documentId}};
      }else return this.gate(s,'unsupported-merchant-stage','NEEDS_VERIFICATION');
      if(this.paused||this.stopped)return this.gate(s,'control-changed-before-send',this.stopped?'STOPPED':'PAUSED');
      // Write-ahead before EVERY mutation. Storage failure means zero send.
      s.pending={...command,id:this.id(),documentId:o.documentId,beforePhase:o.phase,deadline:this.now()+8000};if(command.action==='submitOrder')s.finalIntent.sent=true;await this.save(s);
      if(this.paused||this.stopped)return this.gate(s,'control-changed-after-write; intent preserved',this.stopped?'STOPPED':'PAUSED');
      let reply;try{reply=await this.port.act({...s.pending,plan:clone(plan),taskId:s.taskId,planDigest:s.planDigest});}catch{return this.gate(s,'mutation-transport-lost; reconcile before proceeding','NEEDS_VERIFICATION');}
      if(reply?.orderRefHash&&command.action==='submitOrder')s.orderRefHash=reply.orderRefHash;
      await this.save(s);
      // Even an apparently successful click is not acceptance. The next iteration must inspect current evidence.
    }
    return this.gate(s,'step-bound-reached','NEEDS_VERIFICATION');
  }
}
