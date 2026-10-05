// C056 Codex quota takeover: a single checked bag -> Checkout navigation, then observation only.
// Original unknown slot, identity, authority, expiry and history are never resolved, reset or changed.
import {TASK_KEY,validStored,validIntent,normalizeIntent,canonicalJson,itemMatches} from './job.js';
const clone=x=>structuredClone(x);
const core=s=>{const {closedCheckoutProbe,...rest}=s;return rest;};
const PHASES=new Set(['ENTRY','VARIANT','BAG','EMPTY_BAG','AUTH','CONSENT','CHALLENGE','THROTTLE','FULFILLMENT','SLOTS','DETAILS','PAYMENT','REVIEW','ORDER_RECEIPT','ORDER_DETAIL','PROCESSING','UNKNOWN']);
const origin=x=>typeof x==='string'&&/^https:\/\/(?:www\.apple\.com\.cn|secure\d*\.www\.apple\.com\.cn)$/.test(x)?x:null;
function protectedHistory(s){
  if(!Array.isArray(s.retiredHistory??[])||!Array.isArray(s.history??[])||(s.history??[]).some(e=>e?.event==='final-not-dispatched'))return false;
  const stack=[...(s.retiredHistory??[])],seen=new Set();let count=0;
  while(stack.length){const r=stack.pop();if(!r||typeof r!=='object'||++count>200)return false;if(seen.has(r))continue;seen.add(r);
    if(r.finalIntent!==null||r.acceptedSlot!=null||['submitOrder','chooseSlot'].includes(r.pending?.action)||!Array.isArray(r.history??[])||(r.history??[]).some(e=>e?.event==='final-not-dispatched'))return false;
    if(r.retiredHistory!==undefined){if(!Array.isArray(r.retiredHistory)||r.retiredHistory.length>50)return false;stack.push(...r.retiredHistory);}
  }return true;
}
export async function probeClosedCheckout({store,api,port,plan,tabId,planDigest,enabled,live=()=>true,now=()=>Date.now(),id=()=>crypto.randomUUID()}){
  const stop=reason=>({state:'NEEDS_VERIFICATION',reason,originalSlotUnresolved:true,purchaseComplete:false});
  if(enabled!==true||!live()||!Number.isSafeInteger(tabId)||tabId<=0||!validIntent(plan))return stop('probe-not-explicitly-enabled');
  const p=normalizeIntent(plan);
  if(p.product.model!=='iPhone 18 Pro'||p.product.capacity!=='256GB'||p.product.color!=='黑色'||p.maxTotalCny!==9999||p.stores.length!==1||p.stores[0]!=='Apple 大连恒隆广场')return stop('probe-is-only-the-authorized-one-pro-test');
  const s=await store.get(TASK_KEY);if(!live())return stop('probe-paused');
  let valid=false;try{valid=validStored(s)===true;}catch{}
  if(!valid||s.planDigest!==planDigest||canonicalJson(normalizeIntent(s.plan))!==canonicalJson(p)||s.reconcileOnly===true||s.finalIntent!==null||s.acceptedSlot!=null||s.expiresAt>now()||s.pending?.action!=='chooseSlot'||s.pending.beforePhase!=='SLOTS'||s.pending.dispatched===false||s.pending.deadline>now())return stop('original-pre-final-unknown-slot-record-not-eligible');
  if(!protectedHistory(s))return stop('prior-history-needs-verification');
  let tabs;try{tabs=await api.tabs.query({});}catch{return stop('tab-inventory-unconfirmed');}
  if(!live())return stop('probe-paused');
  if(!Array.isArray(tabs)||tabs.some(t=>!Number.isSafeInteger(t.id)||t.id<=0)||!tabs.some(t=>t.id===tabId)||tabs.some(t=>t.id===s.tabId))return stop('original-target-not-proven-closed-or-new-target-missing');
  // C058 (Claude): every disclosed official checkout address form (with or without a trailing slash, or deeper) blocks. A tab whose
  // address Chrome does not disclose stays unknown; this check never proves that no other checkout exists.
  if(tabs.some(t=>{try{const u=new URL(t.url);return t.id!==tabId&&origin(u.origin)&&/^\/shop\/checkout(?:\/|$)/i.test(u.pathname);}catch{return false;}}))return stop('another-disclosed-checkout-context');
  const expected=canonicalJson(core(s));let q=s.closedCheckoutProbe?clone(s.closedCheckoutProbe):null;
  if(q&&(q.schema!=='applebuy-checkout-probe/v1'||q.tabId!==tabId||q.planDigest!==planDigest||q.pending&&q.pending.action!=='checkout'))return stop('existing-probe-binding-differs');
  const save=async()=>{const current=await store.get(TASK_KEY);if(canonicalJson(core(current))!==expected)throw Error('OriginalChanged');await store.put(TASK_KEY,{...current,closedCheckoutProbe:clone(q)});};
  const read=async()=>{
    try{return await port.observe(p);}catch(e){const host=e?.message==='CurrentHostPermissionMissing'?origin(e.origin):null;return {phase:'UNKNOWN',permissionOrigin:host};}
  };
  if(!q){
    const o=await read();if(!live())return stop('probe-paused');
    if(o?.schema!=='applebuy-merchant-read/v1'||o.phase!=='BAG'||o.verifiedStep!==true||o.path!=='/shop/bag'||!o.documentId||!Number.isSafeInteger(o.seq)||!itemMatches(p,o.purchase)||o.extras!==false||o.purchase.totalCny!==(s.bagTotalCny??s.quotedCny))return stop('fresh-one-item-matching-bag-not-verified');
    q={schema:'applebuy-checkout-probe/v1',tabId,planDigest,state:'PREPARED',startedAt:now(),pending:{id:id(),action:'checkout',documentId:o.documentId,dispatched:false},lastReadPhase:'BAG',originalSlotOutcome:'unknown',remoteHold:'unknown'};
    await save();if(!live()){q.state='PAUSED_BEFORE_SEND';await save();return stop('probe-paused-before-send');}
    // Write-ahead sent-or-unknown truth before the one DOM action. No other merchant action is reachable.
    delete q.pending.dispatched;q.state='SENT_OR_UNKNOWN';await save();
    if(!live()){q.pending.dispatched=false;q.state='PAUSED_BEFORE_SEND';await save();return stop('probe-paused-before-send');}
    try{const result=await port.act({...q.pending,taskId:s.taskId,plan:p});
      if(result?.delivered===false&&result?.touched===false){q.pending.dispatched=false;q.state='POSITIVELY_UNTOUCHED';await save();return stop('probe-checkout-positively-untouched; no automatic repeat');}
    }catch{/* Unknown is preserved. A later call can only observe the probe target. */}
  }
  if(!live())return stop('probe-paused; any sent checkout remains unknown');
  if(q.pending?.dispatched===false)return stop('probe-was-not-sent; preserved; no automatic repeat');
  const o=await read();if(!live())return stop('probe-paused-after-read');
  q.lastReadPhase=PHASES.has(o?.phase)?o.phase:'UNKNOWN';
  if(o?.permissionOrigin){q.state='NEEDS_HOST_PERMISSION';await save();return {...stop('probe-current-host-permission-missing'),permissionOrigin:o.permissionOrigin};}
  if(['AUTH','CONSENT','CHALLENGE'].includes(q.lastReadPhase)){q.state='NEEDS_USER';await save();return {state:'NEEDS_USER',reason:'probe-authentication-or-notice; no repeated checkout',phase:q.lastReadPhase,originalSlotUnresolved:true,purchaseComplete:false};}
  if(o?.schema==='applebuy-merchant-read/v1'&&o.verifiedStep===true&&['FULFILLMENT','SLOTS','DETAILS','PAYMENT','REVIEW'].includes(o.phase)&&itemMatches(p,o.purchase)&&o.purchase.totalCny===(s.bagTotalCny??s.quotedCny)){
    q.state='OBSERVED_CHECKOUT_STEP';q.pending=null;await save();return {state:'NEEDS_VERIFICATION',reason:'probe-current-step-observed; original-slot-still-unknown; no later action',phase:o.phase,originalSlotUnresolved:true,purchaseComplete:false};
  }
  q.state='NEEDS_VERIFICATION';await save();return {...stop('probe-result-unconfirmed; observe-only; no automatic repeat'),phase:q.lastReadPhase};
}
