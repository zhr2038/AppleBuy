// Explicit ownership transfer to this own desktop session, ONLY for a current matching singleton. Never repeats Add.
import {createHash,randomUUID} from 'node:crypto';
import {TASK_KEY,validStored,canonicalJson,normalizeIntent,createPurchaseRecord,itemMatches} from '../../web/checkout-connector/job.js';
import {PRO_PLAN,proDigest,legacyFinalProofClear} from './browser-session.mjs';
import {ChromePort} from '../../web/checkout-connector/chrome-port.js';
const fingerprint=r=>createHash('sha256').update(canonicalJson(r)).digest('hex');
export function validateDesktopCartTransfer(row,api){
 const t=row?.desktopTransfer;
 if(!t||t.schema!=='applebuy-desktop-cart-transfer/v1'||t.existingCartOnly!==true||row.reconcileOnly===true||typeof api?.sessionId!=='string'||row.desktopContext!==api.sessionId||t.contextId!==api.sessionId||t.taskId!==row.taskId||t.planDigest!==proDigest||!validStored(t.originalTask)||t.originalTask.reconcileOnly!==true||!t.originalTask.desktopHandoff?.id||t.sourceFingerprint!==fingerprint(t.originalTask)||!legacyFinalProofClear(t.originalTask)||canonicalJson(normalizeIntent(row.plan))!==canonicalJson(PRO_PLAN))return null;
 if(row.retiredHistory?.length!==1||!legacyFinalProofClear(row.retiredHistory)||fingerprint(row.retiredHistory[0]?.desktopTransferArchive?.originalSnapshot)!==t.sourceFingerprint)return null;
 return {schema:t.schema,taskId:row.taskId,contextId:api.sessionId,sourceFingerprint:t.sourceFingerprint,existingCartOnly:true};
}
// Invoke under the runtime's physical ledger lease. Reads only until the atomic local successor write.
export async function transferExistingCart({store,api,tabId,approved=false,newContextConfirmed=false,live=()=>true}){
 if(approved!==true||newContextConfirmed!==true||!live()||typeof api?.sessionId!=='string')throw Error('DesktopTransferNeedsExplicitCurrentApproval');
 const old=await store.get(TASK_KEY);
 if(!validStored(old)||old.state==='RETIRED'||old.reconcileOnly!==true||old.desktopHandoff?.schema!=='applebuy-desktop-handoff/v1'||!old.desktopHandoff.id||!validStored(old.desktopHandoff.originalSnapshot)||canonicalJson(normalizeIntent(old.plan))!==canonicalJson(PRO_PLAN)||!legacyFinalProofClear(old))throw Error('DesktopTransferLegacyUnconfirmed');
 const port=new ChromePort(api,tabId,{mode:'observe',initialSequence:old.lastRead??0});let current=null;
 for(let n=0;n<2;n++){
  const o=await port.observe(PRO_PLAN);
  if(!live())throw Error('DesktopTransferCancelled');
  if(o.phase!=='BAG'||o.verifiedStep!==true||!/^\/shop\/bag\/?$/.test(o.path??'')||!itemMatches(PRO_PLAN,o.purchase)||o.extras!==false)throw Error('DesktopTransferNeedsCurrentMatchingSingleton');
  if(current&&(current.documentId!==o.documentId||canonicalJson(current.purchase)!==canonicalJson(o.purchase)))throw Error('DesktopTransferBagChanged');current=o;
 }
 if(!live()||canonicalJson(await store.get(TASK_KEY))!==canonicalJson(old))throw Error('DesktopTransferRecordChanged');
 const id=randomUUID(),at=Date.now(),archive={...structuredClone(old),state:'RETIRED',reconcileOnly:true,desktopTransferArchive:{originalSnapshot:structuredClone(old),oldActionOutcome:'unknown',retiredAt:at}};
 const row={...createPurchaseRecord(PRO_PLAN,{taskId:id,planDigest:proDigest,tabId,now:at,id:randomUUID}),desktopContext:api.sessionId,retiredHistory:[archive],desktopTransfer:{schema:'applebuy-desktop-cart-transfer/v1',taskId:id,contextId:api.sessionId,planDigest:proDigest,existingCartOnly:true,sourceFingerprint:fingerprint(old),originalTask:structuredClone(old),bagDocumentId:current.documentId,bagReadSequence:current.seq,createdAt:at}};
 if(!live())throw Error('DesktopTransferCancelled');await store.put(TASK_KEY,row);
 return {created:true,existingCartOnly:true,oldActionOutcome:'unknown',realOrderVerified:false};
}
