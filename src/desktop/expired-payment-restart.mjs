// Explicit once-only recovery after this programme's post-contact checkout actually expired. No Add or inherited slot/final.
import {randomUUID} from 'node:crypto';
import {TASK_KEY,validStored,canonicalJson,normalizeIntent,createPurchaseRecord,itemMatches,CONTACT_SLOT_BASIS} from '../../web/checkout-connector/job.js';
import {PRO_PLAN,proDigest,legacyFinalProofClear} from './browser-session.mjs';
import {ChromePort} from '../../web/checkout-connector/chrome-port.js';
import {validateEndedDraft,SHOP_HOST_SCOPE,packArchivedSource,unpackArchivedSource,schedulingRestrictionsKept,archivedSourceHash} from './ended-draft.mjs';
import {CHECKOUT_EXECUTOR_VERSION} from '../../web/checkout-connector/page-program.js';
const SCHEMA='applebuy-expired-payment-restart/v1',SLOT=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
export function expiredPaymentSourceShape(row,at=Date.now()){
 const a=row?.acceptedSlot,p=row?.pending;
 return validStored(row)&&!!row.desktopEndedDraft&&!row.desktopPaymentRestart&&!row.desktopTransfer&&!row.desktopEmptyRestart&&!row.desktopHandoff&&
  canonicalJson(normalizeIntent(row.plan))===canonicalJson(PRO_PLAN)&&Number.isFinite(at)&&row.expiresAt<=at&&row.bagAddStarted===true&&row.resourceWritten===true&&
  ['NEEDS_USER','NEEDS_VERIFICATION','EXPIRED','PAUSED','STOPPED'].includes(row.state)&&row.finalIntent===null&&row.orderRefHash==null&&row.orderDetailLink==null&&legacyFinalProofClear(row)&&
  p?.action==='fillDetails'&&p.beforePhase==='DETAILS'&&p.contactOnly===true&&p.dispatched!==false&&p.deadline<=at&&
  a?.verified===true&&a.basis===CONTACT_SLOT_BASIS&&Array.isArray(row.history)&&row.history.some(h=>h?.event==='slot-continued-to-contact-only-details')&&SLOT.test(a.start)&&SLOT.test(a.end)&&a.start<a.end&&row.initialDates?.[row.dateCursor]===a.date&&row.floors?.[a.date]===a.start&&
  !row.rejected.some(r=>r.date===a.date&&r.start===a.start&&r.end===a.end)&&row.bagTotalCny===9999;
}
async function sourceProved(row,store,at){return expiredPaymentSourceShape(row,at)&&!!await validateEndedDraft(row,{sessionId:row.desktopContext},store,{readonly:true});}
export async function validateExpiredPaymentRestart(row,api,store,{readonly=false}={}){
 const t=row?.desktopPaymentRestart;
 if(!validStored(row)||!t||row.desktopEndedDraft||row.desktopHandoff||row.desktopTransfer||row.desktopEmptyRestart||row.reconcileOnly===true&&!readonly||typeof api?.sessionId!=='string'||row.desktopContext!==api.sessionId||
  t.schema!==SCHEMA||t.generation!==1||t.existingCartOnly!==true||t.taskId!==row.taskId||t.contextId!==row.desktopContext||t.planDigest!==proDigest||
  t.merchantExpiryVerified!==true||t.oldExecutorStopped!==true||t.sameAccountOrdersClear!==true||!Number.isFinite(t.createdAt)||!/^[a-f0-9]{64}$/.test(t.sourceArchive??'')||
  canonicalJson(row.retainedSourceArchives)!==canonicalJson([{schema:SCHEMA,sourceArchive:t.sourceArchive}])||typeof store?.readArchive!=='function'||canonicalJson(normalizeIntent(row.plan))!==canonicalJson(PRO_PLAN))return null;
 let old;try{const backup=unpackArchivedSource(t.sourceBackup,t.sourceArchive);try{old=await store.readArchive(t.sourceArchive);}catch(e){if(e.code!=='ENOENT')return null;old=backup;}if(canonicalJson(old)!==canonicalJson(backup))return null;}catch{return null;}
 if(archivedSourceHash(old)!==t.sourceArchive||!await sourceProved(old,store,t.createdAt)||row.taskId===old.taskId||row.desktopContext===old.desktopContext||!schedulingRestrictionsKept(row,old))return null;
 return {schema:SCHEMA,taskId:row.taskId,contextId:api.sessionId,sourceArchive:t.sourceArchive,existingCartOnly:true};
}
function expiryEntry(url){try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&(u.hostname==='www.apple.com.cn'||/^secure\d+\.www\.apple\.com\.cn$/.test(u.hostname))&&u.pathname==='/shop/checkout';}catch{return false;}}
export async function restartExpiredPayment({store,api,tabId,expiredCheckoutUrl,approved=false,newContextConfirmed=false,oldExecutorStopped=false,sameAccountOrdersClear=false,live=()=>true}){
 if([approved,newContextConfirmed,oldExecutorStopped,sameAccountOrdersClear].some(v=>v!==true)||!live()||typeof api?.sessionId!=='string'||!expiryEntry(expiredCheckoutUrl))throw Error('ExpiredPaymentCurrentApprovalRequired');
 const old=await store.get(TASK_KEY);if(!await sourceProved(old,store,Date.now())||api.sessionId===old.desktopContext||typeof store.archiveSnapshot!=='function')throw Error('ExpiredPaymentSourceUnconfirmed');
 if(typeof api.executorVersion!=='function'||await api.executorVersion()!==CHECKOUT_EXECUTOR_VERSION)throw Error('ExpiredPaymentExecutorUpdateRequired');
 if(!await api.permissions.contains({origins:[SHOP_HOST_SCOPE]}))throw Error('ExpiredPaymentHostScopeMissing');
 // Normal GET of the previously observed checkout entry; no Checkout/slot/order command. Explicit rendered expiry is required.
 let probe=null,expired=false;
 try{
  probe=await api.createExpiryProbe(expiredCheckoutUrl);const port=new ChromePort(api,probe.id,{mode:'observe'}),until=Date.now()+15000;
  for(let i=0;i<150&&live();i++){
   try{const meta=await api.tabs.get(probe.id);if(meta?.status==='complete'){const o=await port.observe(PRO_PLAN);expired=o.merchantError==='session-expired'&&o.path==='/shop/sorry/session_expired';break;}}catch(e){if(!['NativeCheckoutResultUnconfirmed','ScriptTransportRejected'].includes(e.message))throw e;}
   if(Date.now()>=until)break;await new Promise(r=>setTimeout(r,100));
  }
 }finally{if(probe)await api.tabs.remove(probe.id);}
 if(!expired||!live())throw Error('ExpiredPaymentMerchantExpiryUnconfirmed');
 const port=new ChromePort(api,tabId,{mode:'observe',initialSequence:old.lastRead??0});let previous;
 for(let i=0;i<2;i++){const o=await port.observe(PRO_PLAN);if(!live()||o.phase!=='BAG'||o.verifiedStep!==true||o.path!=='/shop/bag'||!itemMatches(PRO_PLAN,o.purchase)||o.extras!==false)throw Error('ExpiredPaymentBagUnconfirmed');if(previous&&(previous.documentId!==o.documentId||canonicalJson(previous.purchase)!==canonicalJson(o.purchase)))throw Error('ExpiredPaymentBagChanged');previous=o;}
 if(!live()||canonicalJson(await store.get(TASK_KEY))!==canonicalJson(old))throw Error('ExpiredPaymentSourceChanged');
 const sourceArchive=await store.archiveSnapshot(old);if(sourceArchive!==archivedSourceHash(old)||!live()||canonicalJson(await store.get(TASK_KEY))!==canonicalJson(old))throw Error('ExpiredPaymentArchiveUnconfirmed');
 const at=Date.now(),id=randomUUID(),row={...createPurchaseRecord(PRO_PLAN,{taskId:id,planDigest:proDigest,tabId,now:at,id:randomUUID}),acceptedSlot:null,inheritedIdentity:null,desktopContext:api.sessionId,
  desktopPaymentRestart:{schema:SCHEMA,generation:1,taskId:id,contextId:api.sessionId,planDigest:proDigest,sourceArchive,sourceBackup:packArchivedSource(old),existingCartOnly:true,merchantExpiryVerified:true,oldExecutorStopped:true,sameAccountOrdersClear:true,oldActionOutcome:'unknown',oldSlotHoldOutcome:'unknown; expiry is not a release guarantee',createdAt:at}};
 for(const k of ['initialDates','floors','rejected','refusals','dateCursor'])row[k]=structuredClone(old[k]);row.retainedSourceArchives=[{schema:SCHEMA,sourceArchive}];
 if(!await validateExpiredPaymentRestart(row,api,store)||!live())throw Error('ExpiredPaymentProspectiveUnconfirmed');await store.put(TASK_KEY,row);
 return {created:true,oldActionOutcome:'unknown',existingCartOnly:true,realOrderVerified:false};
}
