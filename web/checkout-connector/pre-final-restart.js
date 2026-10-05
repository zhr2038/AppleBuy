// C060 Codex quota takeover. Invoke only under the existing exclusive purchase owner.
// Explicitly abandon local authority of ONE expired pre-final unknown-slot attempt. Its entire record remains retained.
// Current empty bag and missing old tabs never prove no remote hold/order. Final submission still needs fresh human checks.
import {TASK_KEY,validStored,validIntent,normalizeIntent,canonicalJson,createPurchaseRecord} from './job.js';
const clone=x=>structuredClone(x);
const origin=u=>u.protocol==='https:'&&(u.hostname==='www.apple.com.cn'||/^secure\d*\.www\.apple\.com\.cn$/.test(u.hostname));
function cleanHistory(s){
  if(!Array.isArray(s.retiredHistory??[])||!Array.isArray(s.history??[])||(s.history??[]).some(e=>e?.action==='submitOrder'||typeof e?.event==='string'&&/final/.test(e.event)))return false;
  const stack=[...(s.retiredHistory??[])],seen=new Set();let count=0;
  if(stack.length>=50)return false;
  while(stack.length){const r=stack.pop();if(!r||typeof r!=='object'||Array.isArray(r)||seen.has(r)||++count>200)return false;seen.add(r);
    if(r.schema!=='applebuy-purchase-job/v1'||r.state!=='RETIRED'||r.finalIntent!==null||r.orderRefHash!=null||r.orderDetailLink!=null||r.acceptedSlot!=null||r.pending!==null||!Array.isArray(r.history??[])||(r.history??[]).some(e=>e?.action==='submitOrder'||typeof e?.event==='string'&&/final/.test(e.event)))return false;
    if(r.retiredHistory!==undefined){if(!Array.isArray(r.retiredHistory)||r.retiredHistory.length>50)return false;stack.push(...r.retiredHistory);}
  }return true;
}
export async function restartExpiredPreFinal({store,api,port,plan,planDigest,tabId,enabled,dateWindowConfirmed,live=()=>true,now=()=>Date.now(),id=()=>crypto.randomUUID()}){
  const stop=reason=>({created:false,state:'NEEDS_VERIFICATION',reason,oldSlotOutcome:'unknown',purchaseComplete:false});
  if(enabled!==true||dateWindowConfirmed!==true||!live()||!Number.isSafeInteger(tabId)||tabId<=0||!validIntent(plan))return stop('restart-needs-explicit-current-pro-and-date-window-confirmation');
  const p=normalizeIntent(plan);
  if(p.product.model!=='iPhone 18 Pro'||p.product.capacity!=='256GB'||p.product.color!=='黑色'||p.maxTotalCny!==9999||p.stores.length!==1||p.stores[0]!=='Apple 大连恒隆广场')return stop('restart-only-this-one-authorized-pro');
  const old=await store.get(TASK_KEY);if(!live())return stop('restart-paused');let valid=false;try{valid=validStored(old)===true;}catch{}
  if(old&&Object.hasOwn(old,'desktopHandoff'))return stop('desktop-handoff-permanently-revoked-source');
  // C062: the production record omits acceptedSlot until verified acceptance. Only null/absence is compatible; any other value blocks.
  if(!valid||old.state==='RETIRED'||old.state==='CONFIRMED_UNPAID'||old.planDigest!==planDigest||canonicalJson(normalizeIntent(old.plan))!==canonicalJson(p)||old.finalIntent!==null||old.orderRefHash!=null||old.orderDetailLink!=null||old.acceptedSlot!=null||old.pending?.action!=='chooseSlot'||old.pending.beforePhase!=='SLOTS'||old.pending.dispatched===false||old.expiresAt>now()||old.pending.deadline>now())return stop('old-expired-prefinal-unknown-slot-not-proved');
  if(!cleanHistory(old))return stop('history-has-prior-final-slot-or-unproved-content');
  const probe=old.closedCheckoutProbe;
  if(probe!==undefined&&(!probe||typeof probe!=='object'||probe.schema!=='applebuy-checkout-probe/v1'||probe.planDigest!==old.planDigest||probe.pending!==null&&probe.pending?.action!=='checkout'))return stop('old-probe-record-unconfirmed');
  let tabs;try{tabs=await api.tabs.query({});}catch{return stop('restart-tab-inventory-unconfirmed');}
  if(!live())return stop('restart-paused');
  const oldTargets=[old.tabId,old.closedCheckoutProbe?.tabId].filter(x=>x!==undefined);
  if(oldTargets.some(x=>!Number.isSafeInteger(x)||x<=0)||!Array.isArray(tabs)||tabs.some(t=>!Number.isSafeInteger(t.id)||t.id<=0)||!tabs.some(t=>t.id===tabId)||tabs.some(t=>oldTargets.includes(t.id)))return stop('old-targets-not-proved-closed');
  if(tabs.some(t=>{try{const u=new URL(t.url);return t.id!==tabId&&origin(u)&&/^\/shop\/(?:checkout|signIn)(?:\/|$)/i.test(u.pathname);}catch{return false;}}))return stop('another-disclosed-checkout-or-auth-context');
  let o;try{o=await port.observe(p);}catch{return stop('restart-bag-read-unconfirmed');}
  if(!live())return stop('restart-paused');
  if(o?.schema!=='applebuy-merchant-read/v1'||o.phase!=='EMPTY_BAG'||o.verifiedStep!==true||!/^\/shop\/bag\/?$/.test(o.path??'')||!o.documentId||!Number.isSafeInteger(o.seq))return stop('restart-requires-current-explicit-empty-bag');
  const current=await store.get(TASK_KEY);if(!live())return stop('restart-paused');if(canonicalJson(current)!==canonicalJson(old))return stop('old-record-changed-during-restart');
  const newId=id();if(typeof newId!=='string'||!newId||newId===old.taskId||(old.retiredHistory??[]).some(r=>r.taskId===newId))return stop('successor-identity-not-new');
  const at=now(),archived={...clone(old),state:'RETIRED',reconcileOnly:true,abandonedPreFinal:{kind:'explicit-expired-unknown-slot',at,originalState:old.state,originalReconcileOnly:old.reconcileOnly??null,originalSnapshot:clone(old)}};
  const next={...createPurchaseRecord(p,{taskId:newId,planDigest,tabId,now:at,id}),retiredHistory:[...clone(old.retiredHistory??[]),archived],restartFromPreFinal:{kind:'explicit-empty-bag-successor',fromTaskId:old.taskId,at,emptyBagDocumentId:o.documentId,emptyBagReadSequence:o.seq,oldSlotOutcome:'unknown',remoteHold:'unknown'}};
  if(!live())return stop('restart-paused');
  await store.put(TASK_KEY,clone(next));
  return {created:true,state:live()?'READY_TO_ADVANCE':'PAUSED_AFTER_LOCAL_CREATION',taskId:newId,oldSlotOutcome:'unknown',purchaseComplete:false};
}
