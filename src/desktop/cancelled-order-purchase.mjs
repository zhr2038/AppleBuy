// A distinct explicit purchase after a matched cancelled order, never a replay of its sent final.
import {randomUUID} from 'node:crypto';
import {TASK_KEY,validStored,canonicalJson,normalizeIntent,createPurchaseRecord,itemMatches} from '../../web/checkout-connector/job.js';
import {PRO_PLAN,proDigest} from './browser-session.mjs';
import {ChromePort} from '../../web/checkout-connector/chrome-port.js';
import {validateExpiredReviewRestart} from './expired-review-restart.mjs';
import {SHOP_HOST_SCOPE,packArchivedSource,unpackArchivedSource,archivedSourceHash} from './ended-draft.mjs';
import {CHECKOUT_EXECUTOR_VERSION} from '../../web/checkout-connector/page-program.js';
const SCHEMA='applebuy-cancelled-order-new-purchase/v1',HASH=/^[a-f0-9]{64}$/;
async function sourceValid(row,store,at){
 return validStored(row)&&!row.desktopCancelledOrderPurchase&&row.reconcileOnly!==true&&row.expiresAt<=at&&row.finalIntent?.sent===true&&row.pending?.action==='submitOrder'&&row.pending.dispatched!==false&&canonicalJson(normalizeIntent(row.plan))===canonicalJson(PRO_PLAN)&&!!await validateExpiredReviewRestart(row,{sessionId:row.desktopContext},store,{readonly:true});
}
export async function validateCancelledOrderPurchase(row,api,store,{readonly=false}={}){
 const t=row?.desktopCancelledOrderPurchase;
 if(!validStored(row)||!t||t.schema!==SCHEMA||![1,2,3].includes(t.generation)||t.taskId!==row.taskId||t.contextId!==row.desktopContext||row.desktopContext!==api?.sessionId||row.reconcileOnly===true&&!readonly||t.planDigest!==proDigest||t.newPurchaseApproved!==true||t.originalOrderAssociated!==true||t.cancellationVerified!==true||t.accountPreflightClear!==true||!HASH.test(t.referenceHash??'')||!HASH.test(t.sourceArchive??'')||!Number.isFinite(t.createdAt)||canonicalJson(normalizeIntent(row.plan))!==canonicalJson(PRO_PLAN)||canonicalJson(row.retainedSourceArchives)!==canonicalJson([{schema:SCHEMA,sourceArchive:t.sourceArchive}])||row.desktopReviewRestart||row.desktopPaymentRestart||row.desktopEndedDraft||row.desktopTransfer||row.desktopEmptyRestart||row.desktopHandoff)return null;
 let old;try{const backup=unpackArchivedSource(t.sourceBackup,t.sourceArchive);old=await store.readArchive(t.sourceArchive);if(canonicalJson(old)!==canonicalJson(backup))return null;}catch{return null;}
 if(old.taskId===row.taskId||old.desktopContext===row.desktopContext)return null;
 if(t.generation===1){if(!await sourceValid(old,store,t.createdAt)||old.orderRefHash!=null&&old.orderRefHash!==t.referenceHash||t.preSlotResume!==undefined)return null;}
 else if(t.generation===2){if(!preSlotReopenShape(old,t.createdAt)||!await validateCancelledOrderPurchase(old,{sessionId:old.desktopContext},store,{readonly:true})||t.referenceHash!==old.desktopCancelledOrderPurchase.referenceHash||t.rootPurchaseTaskId!==old.taskId||t.preSlotResume!==true||t.merchantExpiryVerified!==true||t.existingCartOnly!==true)return null;}
 else if(!observedRefusalTrialShape(old,t.createdAt)||!await validateCancelledOrderPurchase(old,{sessionId:old.desktopContext},store,{readonly:true})||
   t.operatorObservedRefusal!==true||t.sameAccountConfirmed!==true||t.explicitNewTest!==true||t.existingCartOnly!==true||t.preSlotResume!==true||
   t.referenceHash!==old.desktopCancelledOrderPurchase.referenceHash||t.rootPurchaseTaskId!==old.desktopCancelledOrderPurchase.rootPurchaseTaskId||
   canonicalJson(row.initialDates)!==canonicalJson(old.initialDates)||row.dateCursor<old.dateCursor+1||row.refusals<old.refusals+1||
   Object.entries(old.floors).some(([d,v])=>!row.floors[d]||row.floors[d]<v))return null;
 return {schema:SCHEMA,taskId:row.taskId,contextId:api.sessionId,sourceArchive:t.sourceArchive};
}

// Explicit operator-assisted legacy migration, never invoked by automatic advance. The operator
// must have observed the original merchant refusal and confirmed the SAME account. Preserve the
// unknown old final verbatim; do not manufacture C253's absent automatic command witness.
export function observedRefusalTrialShape(row,at=Date.now()){
 const p=row?.pending,a=row?.acceptedSlot;
 return validStored(row)&&row.desktopCancelledOrderPurchase?.generation===2&&row.reconcileOnly!==true&&row.expiresAt<=at&&
  row.finalIntent?.sent===true&&p?.action==='submitOrder'&&p.dispatched!==false&&p.beforePhase==='REVIEW'&&p.intentId===row.finalIntent.id&&
  !row.orderRefHash&&!row.orderDetailLink&&!row.finalRejections?.length&&['SLOTS','FULFILLMENT','UNKNOWN'].includes(row.lastPhase)&&
  a?.verified===true&&row.initialDates?.[row.dateCursor]===a.date&&row.dateCursor+1<row.initialDates.length&&row.bagAddStarted===true&&row.resourceWritten===true;
}
export async function restartAfterObservedRefusal({store,api,tabId,approved=false,operatorObservedRefusal=false,sameAccountConfirmed=false,live=()=>true}){
 if(approved!==true||operatorObservedRefusal!==true||sameAccountConfirmed!==true||!live())throw Error('ObservedRefusalExplicitApprovalRequired');
 const old=await store.get(TASK_KEY);
 if(!observedRefusalTrialShape(old)||old.desktopContext===api.sessionId||!await validateCancelledOrderPurchase(old,{sessionId:old.desktopContext},store,{readonly:true}))throw Error('ObservedRefusalSourceUnconfirmed');
 if(await api.executorVersion()!==CHECKOUT_EXECUTOR_VERSION||!await api.permissions.contains({origins:[SHOP_HOST_SCOPE]}))throw Error('ObservedRefusalExecutorUnavailable');
 const account=await api.auditOrders(PRO_PLAN,null,{automatic:false});
 if(!live()||account?.state!=='clear'||account.authenticated!==true||!HASH.test(account.accountHash??'')||!Number.isSafeInteger(account.matchingCount)||account.matchingCount<0)throw Error('ObservedRefusalAccountUnconfirmed');
 const port=new ChromePort(api,tabId,{mode:'observe'});let first;
 for(let i=0;i<2;i++){const o=await port.observe(PRO_PLAN);if(!live()||o.phase!=='BAG'||o.verifiedStep!==true||o.path!=='/shop/bag'||!itemMatches(PRO_PLAN,o.purchase)||o.extras!==false)throw Error('ObservedRefusalBagUnconfirmed');if(first&&(first.documentId!==o.documentId||canonicalJson(first.purchase)!==canonicalJson(o.purchase)))throw Error('ObservedRefusalBagChanged');first=o;}
 if(!live()||canonicalJson(await store.get(TASK_KEY))!==canonicalJson(old))throw Error('ObservedRefusalSourceChanged');
 const sourceArchive=await store.archiveSnapshot(old);
 if(sourceArchive!==archivedSourceHash(old)||!live()||canonicalJson(await store.get(TASK_KEY))!==canonicalJson(old))throw Error('ObservedRefusalArchiveUnconfirmed');
 const at=Date.now(),taskId=randomUUID(),row={...createPurchaseRecord(PRO_PLAN,{taskId,planDigest:proDigest,tabId,now:at,id:randomUUID}),desktopContext:api.sessionId,bagAddStarted:true,resourceWritten:true,bagTotalCny:first.purchase.totalCny,acceptedSlot:null,inheritedIdentity:null,
  initialDates:structuredClone(old.initialDates),dateCursor:old.dateCursor+1,floors:structuredClone(old.floors),rejected:structuredClone(old.rejected),refusals:old.refusals+1,
  desktopCancelledOrderPurchase:{schema:SCHEMA,generation:3,taskId,contextId:api.sessionId,planDigest:proDigest,sourceArchive,sourceBackup:packArchivedSource(old),referenceHash:old.desktopCancelledOrderPurchase.referenceHash,newPurchaseApproved:true,originalOrderAssociated:true,cancellationVerified:true,accountPreflightClear:true,preSlotResume:true,existingCartOnly:true,rootPurchaseTaskId:old.desktopCancelledOrderPurchase.rootPurchaseTaskId,operatorObservedRefusal:true,sameAccountConfirmed:true,explicitNewTest:true,identityBasis:'explicit operator-observed merchant pickup refusal; original unknown final unchanged in complete archive; fresh account and same-cart checks',createdAt:at},retainedSourceArchives:[{schema:SCHEMA,sourceArchive}]};
 if(!await validateCancelledOrderPurchase(row,api,store)||!live()||canonicalJson(await store.get(TASK_KEY))!==canonicalJson(old))throw Error('ObservedRefusalProspectiveUnconfirmed');
 await store.put(TASK_KEY,row);return {created:true,existingCartOnly:true,operatorAssisted:true,realOrderVerified:false};
}

// Only the current early checkout is superseded. Earlier cancelled final and all unknowns remain in its full archive.
export function preSlotReopenShape(row,at=Date.now()){
 const p=row?.pending;
 return validStored(row)&&row.desktopCancelledOrderPurchase?.generation===1&&row.finalIntent===null&&row.orderRefHash==null&&row.orderDetailLink==null&&row.acceptedSlot==null&&row.inheritedIdentity==null&&row.initialDates===null&&row.dateCursor===0&&row.refusals===0&&Object.keys(row.floors??{}).length===0&&row.rejected?.length===0&&row.bagAddStarted===true&&row.resourceWritten===true&&
  ['UNKNOWN','AUTH','BAG','FULFILLMENT'].includes(row.lastPhase)&&p?.dispatched!==false&&Number.isFinite(p?.deadline)&&p.deadline<=at&&((p.action==='checkout'&&p.beforePhase==='BAG')||(p.action==='selectPickup'&&p.beforePhase==='FULFILLMENT'))&&
  !row.history?.some(h=>/slot|final/i.test(h.event??'')||['chooseSlot','submitOrder'].includes(h.action));
}
export async function reopenBeforeSlots({store,api,tabId,approved=false,expiredCheckoutUrl,live=()=>true}){
 if(approved!==true||typeof live!=='function'||!live())throw Error('InitialCheckoutApprovalRequired');
 const old=await store.get(TASK_KEY);
 if(!preSlotReopenShape(old)||old.desktopContext===api?.sessionId||!await validateCancelledOrderPurchase(old,{sessionId:old.desktopContext},store,{readonly:true}))throw Error('InitialCheckoutSourceUnconfirmed');
 if(await api.executorVersion()!==CHECKOUT_EXECUTOR_VERSION||!await api.permissions.contains({origins:[SHOP_HOST_SCOPE]}))throw Error('InitialCheckoutExecutorUnavailable');
 const account=await api.auditOrders(PRO_PLAN,null,{automatic:false});
 if(!live()||account?.state!=='clear'||account.authenticated!==true||!HASH.test(account.accountHash??'')||!Number.isSafeInteger(account.matchingCount)||account.matchingCount<0)throw Error('InitialCheckoutAccountUnconfirmed');
 let probe,expired=false;
 try{probe=await api.createExpiryProbe(expiredCheckoutUrl);const port=new ChromePort(api,probe.id,{mode:'observe'}),until=Date.now()+15000;
  for(let i=0;i<150&&live();i++){try{const meta=await api.tabs.get(probe.id);if(meta?.status==='complete'){const o=await port.observe(PRO_PLAN);expired=o.merchantError==='session-expired'&&o.path==='/shop/sorry/session_expired';break;}}catch(e){if(!['NativeCheckoutResultUnconfirmed','ScriptTransportRejected'].includes(e.message))throw e;}if(Date.now()>=until)break;await new Promise(r=>setTimeout(r,100));}
 }finally{if(probe)await api.tabs.remove(probe.id);}
 if(!expired||!live())throw Error('InitialCheckoutExpiryUnconfirmed');
 const port=new ChromePort(api,tabId,{mode:'observe'});let first;
 for(let i=0;i<2;i++){const o=await port.observe(PRO_PLAN);if(!live()||o.phase!=='BAG'||o.verifiedStep!==true||o.path!=='/shop/bag'||!itemMatches(PRO_PLAN,o.purchase)||o.extras!==false)throw Error('InitialCheckoutBagUnconfirmed');if(first&&(first.documentId!==o.documentId||canonicalJson(first.purchase)!==canonicalJson(o.purchase)))throw Error('InitialCheckoutBagChanged');first=o;}
 if(!live()||canonicalJson(await store.get(TASK_KEY))!==canonicalJson(old))throw Error('InitialCheckoutSourceChanged');
 const sourceArchive=await store.archiveSnapshot(old);if(sourceArchive!==archivedSourceHash(old)||!live()||canonicalJson(await store.get(TASK_KEY))!==canonicalJson(old))throw Error('InitialCheckoutArchiveUnconfirmed');
 const at=Date.now(),taskId=randomUUID(),row={...createPurchaseRecord(PRO_PLAN,{taskId,planDigest:proDigest,tabId,now:at,id:randomUUID}),desktopContext:api.sessionId,bagAddStarted:true,resourceWritten:true,acceptedSlot:null,inheritedIdentity:null,
  desktopCancelledOrderPurchase:{schema:SCHEMA,generation:2,taskId,contextId:api.sessionId,planDigest:proDigest,sourceArchive,sourceBackup:packArchivedSource(old),referenceHash:old.desktopCancelledOrderPurchase.referenceHash,newPurchaseApproved:true,originalOrderAssociated:true,cancellationVerified:true,accountPreflightClear:true,preSlotResume:true,merchantExpiryVerified:true,existingCartOnly:true,rootPurchaseTaskId:old.taskId,identityBasis:'same authorized purchase; cancellation inherited from its verified immutable source; prior pickup outcome remains unknown',createdAt:at},retainedSourceArchives:[{schema:SCHEMA,sourceArchive}]};
 if(!await validateCancelledOrderPurchase(row,api,store)||!live()||canonicalJson(await store.get(TASK_KEY))!==canonicalJson(old))throw Error('InitialCheckoutProspectiveUnconfirmed');
 await store.put(TASK_KEY,row);return {created:true,existingCartOnly:true,realOrderVerified:false};
}
export async function startAfterCancelledOrder({store,api,tabId,approved=false,originalOrderAssociated=false,expectedRefHash,live=()=>true}){
 if(approved!==true||originalOrderAssociated!==true||!HASH.test(expectedRefHash??'')||typeof api?.sessionId!=='string'||typeof live!=='function'||!live())throw Error('NewPurchaseExplicitApprovalRequired');
 const old=await store.get(TASK_KEY),fingerprint=old?archivedSourceHash(old):null;
 if(!await sourceValid(old,store,Date.now())||old.desktopContext===api.sessionId||old.orderRefHash!=null&&old.orderRefHash!==expectedRefHash)throw Error('NewPurchasePriorTaskUnconfirmed');
 if(typeof api.auditCancelledOrder!=='function'||await api.executorVersion()!==CHECKOUT_EXECUTOR_VERSION||!await api.permissions.contains({origins:[SHOP_HOST_SCOPE]}))throw Error('NewPurchaseExecutorUnavailable');
 const cancelled=await api.auditCancelledOrder(PRO_PLAN,expectedRefHash);
 if(!live()||cancelled?.state!=='cancelled'||cancelled.sameReference!==true||cancelled.productMatches!==true||cancelled.totalCny!==9999)throw Error('NewPurchaseCancellationUnconfirmed');
 const account=await api.auditOrders(PRO_PLAN,null,{automatic:false});
 if(!live()||account?.state!=='clear'||account.authenticated!==true||!HASH.test(account.accountHash??'')||!Number.isSafeInteger(account.matchingCount)||account.matchingCount<0)throw Error('NewPurchaseAccountUnconfirmed');
 const port=new ChromePort(api,tabId,{mode:'observe'});let first;
 for(let i=0;i<2;i++){
  const o=await port.observe(PRO_PLAN),empty=o.phase==='EMPTY_BAG';
  if(!live()||o.verifiedStep!==true||o.path!=='/shop/bag'||(!empty&&(o.phase!=='BAG'||!itemMatches(PRO_PLAN,o.purchase)||o.extras!==false)))throw Error('NewPurchaseBagUnconfirmed');
  if(first&&(first.documentId!==o.documentId||first.phase!==o.phase||canonicalJson(first.purchase??null)!==canonicalJson(o.purchase??null)))throw Error('NewPurchaseBagChanged');first=o;
 }
 if(!live()||canonicalJson(await store.get(TASK_KEY))!==canonicalJson(old))throw Error('NewPurchaseSourceChanged');
 const sourceArchive=await store.archiveSnapshot(old);if(sourceArchive!==fingerprint||!live()||canonicalJson(await store.get(TASK_KEY))!==canonicalJson(old))throw Error('NewPurchaseArchiveUnconfirmed');
 const at=Date.now(),taskId=randomUUID(),row={...createPurchaseRecord(PRO_PLAN,{taskId,planDigest:proDigest,tabId,now:at,id:randomUUID}),desktopContext:api.sessionId,
  desktopCancelledOrderPurchase:{schema:SCHEMA,generation:1,taskId,contextId:api.sessionId,planDigest:proDigest,sourceArchive,sourceBackup:packArchivedSource(old),referenceHash:expectedRefHash,newPurchaseApproved:true,originalOrderAssociated:true,cancellationVerified:true,accountPreflightClear:true,identityBasis:old.orderRefHash?'stored reference plus fresh native cancelled detail':'explicit operator association of legacy task plus fresh native cancelled detail',createdAt:at},retainedSourceArchives:[{schema:SCHEMA,sourceArchive}]};
 if(!await validateCancelledOrderPurchase(row,api,store)||!live()||canonicalJson(await store.get(TASK_KEY))!==canonicalJson(old))throw Error('NewPurchaseProspectiveUnconfirmed');
 await store.put(TASK_KEY,row);return {created:true,startPhase:first.phase,priorCancelled:true,newPurchase:true,realOrderVerified:false};
}
