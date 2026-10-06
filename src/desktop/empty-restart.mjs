// Separate current-run authority, never a rewrite/revival of the revoked original. Caller must hold the physical ledger lease.
import {createHash,randomUUID} from 'node:crypto';
import {TASK_KEY,validStored,canonicalJson,createPurchaseRecord} from '../../web/checkout-connector/job.js';
import {PRO_PLAN,proDigest,legacyFinalProofClear} from './browser-session.mjs';import {ChromePort} from '../../web/checkout-connector/chrome-port.js';
const hash=row=>{try{const text=canonicalJson(row);return typeof text==='string'?createHash('sha256').update(text).digest('hex'):null;}catch{return null;}};
function oldWindowsPast(row,now){const todo=[row],seen=new Set();let n=0;while(todo.length){const v=todo.pop();if(!v||typeof v!=='object')continue;if(seen.has(v)||++n>3000)return false;seen.add(v);if(v.pending?.action==='chooseSlot'||v.acceptedSlot!=null){if(!Number.isFinite(v.expiresAt)||v.expiresAt>now||v.pending?.action==='chooseSlot'&&(!Number.isFinite(v.pending.deadline)||v.pending.deadline>now))return false;}if(Array.isArray(v)&&v.length>200)return false;todo.push(...Object.values(v));}return true;}
export function validateEmptyRestart(row,api){
 const t=row?.desktopEmptyRestart;
 if(!t||t.schema!=='applebuy-desktop-empty-restart/v1'||t.newFromEmpty!==true||t.accountAttested!==true||t.oldCheckoutStoppedByUser!==true||t.existingOrdersCheckedByUser!==true||row.reconcileOnly===true||typeof api?.sessionId!=='string'||row.desktopContext!==api.sessionId||t.contextId!==api.sessionId||t.taskId!==row.taskId||t.planDigest!==proDigest||!validStored(t.originalTask)||t.originalTask.reconcileOnly!==true||!t.originalTask.desktopHandoff?.id||t.sourceFingerprint!==hash(t.originalTask)||!legacyFinalProofClear(t.originalTask)||canonicalJson(row.plan)!==canonicalJson(PRO_PLAN)||row.retiredHistory?.length!==1||!legacyFinalProofClear(row.retiredHistory)||hash(row.retiredHistory[0]?.desktopEmptyArchive?.originalSnapshot)!==t.sourceFingerprint)return null;
 return {schema:t.schema,taskId:row.taskId,contextId:api.sessionId,sourceFingerprint:t.sourceFingerprint,newFromEmpty:true,accountAttested:true,oldCheckoutStoppedByUser:true,existingOrdersCheckedByUser:true};
}
export async function restartFromCurrentEmpty({store,api,tabId,approved=false,accountConfirmedByUser=false,oldCheckoutStoppedByUser=false,existingOrdersCheckedByUser=false,live=()=>true}){
 if(approved!==true||accountConfirmedByUser!==true||oldCheckoutStoppedByUser!==true||existingOrdersCheckedByUser!==true||typeof live!=='function'||!live()||typeof api?.sessionId!=='string')throw Error('EmptyRestartCurrentConfirmationRequired');
 const old=await store.get(TASK_KEY);
 if(!validStored(old)||old.state==='RETIRED'||old.reconcileOnly!==true||old.desktopHandoff?.schema!=='applebuy-desktop-handoff/v1'||!old.desktopHandoff.id||!validStored(old.desktopHandoff.originalSnapshot)||canonicalJson(old.plan)!==canonicalJson(PRO_PLAN)||!legacyFinalProofClear(old)||!oldWindowsPast(old,Date.now()))throw Error('EmptyRestartLegacyUnconfirmed');
 const port=new ChromePort(api,tabId,{mode:'observe',initialSequence:old.lastRead??0});let first;
 for(let i=0;i<2;i++){
  const o=await port.observe(PRO_PLAN);if(!live())throw Error('EmptyRestartCancelled');
  if(o.phase!=='EMPTY_BAG'||o.verifiedStep!==true||!/^\/shop\/bag\/?$/.test(o.path??'')||first&&first.documentId!==o.documentId)throw Error('EmptyRestartCurrentBagNotProved');first=o;
 }
 if(!live()||canonicalJson(await store.get(TASK_KEY))!==canonicalJson(old))throw Error('EmptyRestartRecordChanged');
 const id=randomUUID(),now=Date.now(),fingerprint=hash(old),archive={...structuredClone(old),state:'RETIRED',reconcileOnly:true,desktopEmptyArchive:{originalSnapshot:structuredClone(old),oldActionOutcome:'unknown',archivedAt:now}};
 const row={...createPurchaseRecord(PRO_PLAN,{taskId:id,planDigest:proDigest,tabId,now,id:randomUUID}),desktopContext:api.sessionId,retiredHistory:[archive],desktopEmptyRestart:{schema:'applebuy-desktop-empty-restart/v1',taskId:id,contextId:api.sessionId,planDigest:proDigest,sourceFingerprint:fingerprint,originalTask:structuredClone(old),newFromEmpty:true,accountAttested:true,accountIdentityBasis:'human current-run attestation; not programme authentication proof',oldCheckoutStoppedByUser:true,existingOrdersCheckedByUser:true,emptyDocumentId:first.documentId,createdAt:now}};
 if(!live())throw Error('EmptyRestartCancelled');await store.put(TASK_KEY,row);return {created:true,newFromEmpty:true,oldActionOutcome:'unknown',accountIdentityVerifiedByProgramme:false,realOrderVerified:false};
}
