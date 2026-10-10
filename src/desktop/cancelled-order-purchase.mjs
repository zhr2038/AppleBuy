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
 if(!validStored(row)||!t||t.schema!==SCHEMA||t.generation!==1||t.taskId!==row.taskId||t.contextId!==row.desktopContext||row.desktopContext!==api?.sessionId||row.reconcileOnly===true&&!readonly||t.planDigest!==proDigest||t.newPurchaseApproved!==true||t.originalOrderAssociated!==true||t.cancellationVerified!==true||t.accountPreflightClear!==true||!HASH.test(t.referenceHash??'')||!HASH.test(t.sourceArchive??'')||!Number.isFinite(t.createdAt)||canonicalJson(normalizeIntent(row.plan))!==canonicalJson(PRO_PLAN)||canonicalJson(row.retainedSourceArchives)!==canonicalJson([{schema:SCHEMA,sourceArchive:t.sourceArchive}])||row.desktopReviewRestart||row.desktopPaymentRestart||row.desktopEndedDraft||row.desktopTransfer||row.desktopEmptyRestart||row.desktopHandoff)return null;
 let old;try{const backup=unpackArchivedSource(t.sourceBackup,t.sourceArchive);old=await store.readArchive(t.sourceArchive);if(canonicalJson(old)!==canonicalJson(backup))return null;}catch{return null;}
 if(!await sourceValid(old,store,t.createdAt)||old.taskId===row.taskId||old.desktopContext===row.desktopContext||old.orderRefHash!=null&&old.orderRefHash!==t.referenceHash)return null;
 return {schema:SCHEMA,taskId:row.taskId,contextId:api.sessionId,sourceArchive:t.sourceArchive};
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
