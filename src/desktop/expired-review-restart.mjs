// One successor for the known stopped post-payment source; never clear/replay an unknown final.
import {randomUUID} from 'node:crypto';
import {TASK_KEY,validStored,canonicalJson,normalizeIntent,createPurchaseRecord,itemMatches,CONTACT_SLOT_BASIS} from '../../web/checkout-connector/job.js';
import {PRO_PLAN,proDigest,legacyFinalProofClear} from './browser-session.mjs';
import {ChromePort} from '../../web/checkout-connector/chrome-port.js';
import {validateExpiredPaymentRestart} from './expired-payment-restart.mjs';
import {SHOP_HOST_SCOPE,packArchivedSource,unpackArchivedSource,schedulingRestrictionsKept,archivedSourceHash} from './ended-draft.mjs';
import {CHECKOUT_EXECUTOR_VERSION} from '../../web/checkout-connector/page-program.js';
const SCHEMA='applebuy-expired-review-restart/v1',TIME=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const POLICY='confirmed-expired-prefinal/v1',MAX_GENERATIONS=16;
export function expiredReviewSourceShape(row,at=Date.now()){
 const p=row?.pending,a=row?.acceptedSlot;
 return validStored(row)&&!!row.desktopPaymentRestart&&!row.desktopReviewRestart&&!row.desktopEndedDraft&&!row.desktopTransfer&&!row.desktopEmptyRestart&&!row.desktopHandoff&&
  canonicalJson(normalizeIntent(row.plan))===canonicalJson(PRO_PLAN)&&Number.isFinite(at)&&row.expiresAt<=at&&row.bagAddStarted===true&&row.resourceWritten===true&&
  ['NEEDS_USER','NEEDS_VERIFICATION','EXPIRED','PAUSED','STOPPED'].includes(row.state)&&row.finalIntent===null&&row.orderRefHash==null&&row.orderDetailLink==null&&legacyFinalProofClear(row)&&
  p?.action==='continuePayment'&&p.beforePhase==='PAYMENT'&&p.paymentOnly===true&&p.dispatched!==false&&p.deadline<=at&&
  a?.verified===true&&a.basis===CONTACT_SLOT_BASIS&&TIME.test(a.start)&&TIME.test(a.end)&&a.start<a.end&&row.initialDates?.[row.dateCursor]===a.date&&row.floors?.[a.date]===a.start&&
  !row.rejected.some(r=>r.date===a.date&&r.start===a.start&&r.end===a.end)&&row.bagTotalCny===9999&&row.history?.some(h=>h.event==='slot-continued-to-contact-only-details');
}
// October 9 explicit human amendment: one additional attempt, never an open-ended renewal.
export function additionalExpiredReviewSourceShape(row,at=Date.now()){
 if(row?.desktopReviewRestart?.generation!==1||row.desktopPaymentRestart)return false;
 const shape={...row,desktopPaymentRestart:{},desktopReviewRestart:undefined};
 return expiredReviewSourceShape(shape,at);
}
export function policyExpiredReviewSourceShape(row,at=Date.now()){
 const n=row?.desktopReviewRestart?.generation;
 if(!Number.isSafeInteger(n)||n<2||n>=MAX_GENERATIONS||row.desktopPaymentRestart)return false;
 return expiredReviewSourceShape({...row,desktopPaymentRestart:{},desktopReviewRestart:undefined},at);
}
async function sourceProved(row,store,at){return expiredReviewSourceShape(row,at)&&!!await validateExpiredPaymentRestart(row,{sessionId:row.desktopContext},store,{readonly:true});}
async function additionalSourceProved(row,store,at){return additionalExpiredReviewSourceShape(row,at)&&!!await validateExpiredReviewRestart(row,{sessionId:row.desktopContext},store,{readonly:true});}
async function policySourceProved(row,store,at){return policyExpiredReviewSourceShape(row,at)&&!!await validateExpiredReviewRestart(row,{sessionId:row.desktopContext},store,{readonly:true});}
export async function validateExpiredReviewRestart(row,api,store,{readonly=false}={}){
 const t=row?.desktopReviewRestart;
 if(!validStored(row)||!t||row.desktopPaymentRestart||row.desktopEndedDraft||row.desktopHandoff||row.desktopTransfer||row.desktopEmptyRestart||row.reconcileOnly===true&&!readonly||
  typeof api?.sessionId!=='string'||row.desktopContext!==api.sessionId||t.schema!==SCHEMA||!Number.isSafeInteger(t.generation)||t.generation<1||t.generation>MAX_GENERATIONS||t.generation===2&&t.additionalRecoveryApproved!==true||t.generation!==2&&t.additionalRecoveryApproved!==undefined||t.generation>=3&&t.recoveryPolicy!==POLICY||t.generation<3&&t.recoveryPolicy!==undefined||t.existingCartOnly!==true||t.taskId!==row.taskId||t.contextId!==row.desktopContext||t.planDigest!==proDigest||
  t.merchantExpiryVerified!==true||t.oldExecutorStopped!==true||t.sameAccountOrdersClear!==true||!Number.isFinite(t.createdAt)||!/^[a-f0-9]{64}$/.test(t.sourceArchive??'')||
  canonicalJson(row.retainedSourceArchives)!==canonicalJson([{schema:SCHEMA,sourceArchive:t.sourceArchive}])||canonicalJson(normalizeIntent(row.plan))!==canonicalJson(PRO_PLAN))return null;
 let old;try{const backup=unpackArchivedSource(t.sourceBackup,t.sourceArchive);try{old=await store.readArchive(t.sourceArchive);}catch(e){if(e.code!=='ENOENT')return null;old=backup;}if(canonicalJson(old)!==canonicalJson(backup))return null;}catch{return null;}
 const sourceOk=t.generation===1?await sourceProved(old,store,t.createdAt):t.generation===2?await additionalSourceProved(old,store,t.createdAt):old.desktopReviewRestart?.generation===t.generation-1&&(t.generation===3||old.desktopReviewRestart.recoveryPolicy===POLICY)&&await policySourceProved(old,store,t.createdAt);
 if(archivedSourceHash(old)!==t.sourceArchive||!sourceOk||row.taskId===old.taskId||row.desktopContext===old.desktopContext||!schedulingRestrictionsKept(row,old))return null;
 return {schema:SCHEMA,taskId:row.taskId,contextId:api.sessionId,sourceArchive:t.sourceArchive,existingCartOnly:true};
}
function entry(raw){try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&(u.hostname==='www.apple.com.cn'||/^secure\d+\.www\.apple\.com\.cn$/.test(u.hostname))&&u.pathname==='/shop/checkout';}catch{return false;}}
export async function restartExpiredReview({store,api,tabId,expiredCheckoutUrl,approved=false,newContextConfirmed=false,oldExecutorStopped=false,sameAccountOrdersClear=false,additionalRecoveryApproved=false,automaticRecoveryApproved=false,live=()=>true}){
 if([approved,newContextConfirmed,oldExecutorStopped,sameAccountOrdersClear].some(v=>v!==true)||!live()||typeof api?.sessionId!=='string'||!entry(expiredCheckoutUrl))throw Error('ExpiredReviewCurrentApprovalRequired');
 const old=await store.get(TASK_KEY),additional=additionalRecoveryApproved===true&&additionalExpiredReviewSourceShape(old),policy=policyExpiredReviewSourceShape(old)&&(automaticRecoveryApproved===true||old.desktopReviewRestart.recoveryPolicy===POLICY);
 if(!(policy?await policySourceProved(old,store,Date.now()):additional?await additionalSourceProved(old,store,Date.now()):await sourceProved(old,store,Date.now()))||api.sessionId===old.desktopContext||typeof store.archiveSnapshot!=='function')throw Error('ExpiredReviewSourceUnconfirmed');
 if(typeof api.executorVersion!=='function'||await api.executorVersion()!==CHECKOUT_EXECUTOR_VERSION)throw Error('ExpiredReviewExecutorUpdateRequired');
 if(!await api.permissions.contains({origins:[SHOP_HOST_SCOPE]}))throw Error('ExpiredReviewHostScopeMissing');
 let probe,expired=false;
 try{probe=await api.createExpiryProbe(expiredCheckoutUrl);const port=new ChromePort(api,probe.id,{mode:'observe'}),until=Date.now()+15000;
  for(let i=0;i<150&&live();i++){try{const meta=await api.tabs.get(probe.id);if(meta?.status==='complete'){const o=await port.observe(PRO_PLAN);expired=o.merchantError==='session-expired'&&o.path==='/shop/sorry/session_expired';break;}}catch(e){if(!['NativeCheckoutResultUnconfirmed','ScriptTransportRejected'].includes(e.message))throw e;}if(Date.now()>=until)break;await new Promise(r=>setTimeout(r,100));}
 }finally{if(probe)await api.tabs.remove(probe.id);}
 if(!expired||!live())throw Error('ExpiredReviewMerchantExpiryUnconfirmed');
 const port=new ChromePort(api,tabId,{mode:'observe',initialSequence:old.lastRead??0});let previous;
 for(let i=0;i<2;i++){const o=await port.observe(PRO_PLAN);if(!live()||o.phase!=='BAG'||o.verifiedStep!==true||o.path!=='/shop/bag'||!itemMatches(PRO_PLAN,o.purchase)||o.extras!==false)throw Error('ExpiredReviewBagUnconfirmed');if(previous&&(previous.documentId!==o.documentId||canonicalJson(previous.purchase)!==canonicalJson(o.purchase)))throw Error('ExpiredReviewBagChanged');previous=o;}
 if(!live()||canonicalJson(await store.get(TASK_KEY))!==canonicalJson(old))throw Error('ExpiredReviewSourceChanged');
 const sourceArchive=await store.archiveSnapshot(old);if(sourceArchive!==archivedSourceHash(old)||!live()||canonicalJson(await store.get(TASK_KEY))!==canonicalJson(old))throw Error('ExpiredReviewArchiveUnconfirmed');
 const at=Date.now(),taskId=randomUUID(),row={...createPurchaseRecord(PRO_PLAN,{taskId,planDigest:proDigest,tabId,now:at,id:randomUUID}),acceptedSlot:null,inheritedIdentity:null,desktopContext:api.sessionId,
  desktopReviewRestart:{schema:SCHEMA,generation:policy?old.desktopReviewRestart.generation+1:additional?2:1,...(policy?{recoveryPolicy:POLICY}:additional?{additionalRecoveryApproved:true}:{}),taskId,contextId:api.sessionId,planDigest:proDigest,sourceArchive,sourceBackup:packArchivedSource(old),existingCartOnly:true,merchantExpiryVerified:true,oldExecutorStopped:true,sameAccountOrdersClear:true,oldActionOutcome:'unknown',oldSlotHoldOutcome:'unknown; expiry is not a release guarantee',createdAt:at}};
 for(const k of ['initialDates','floors','rejected','refusals','dateCursor'])row[k]=structuredClone(old[k]);row.retainedSourceArchives=[{schema:SCHEMA,sourceArchive}];
 if(!await validateExpiredReviewRestart(row,api,store)||!live())throw Error('ExpiredReviewProspectiveUnconfirmed');await store.put(TASK_KEY,row);
 return {created:true,oldActionOutcome:'unknown',existingCartOnly:true,realOrderVerified:false};
}
