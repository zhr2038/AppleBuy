// Separate current-run authority, never a rewrite/revival of the revoked original. Caller must hold the physical ledger lease.
import {createHash,randomUUID} from 'node:crypto';
import {TASK_KEY,validStored,canonicalJson,createPurchaseRecord} from '../../web/checkout-connector/job.js';
import {PRO_PLAN,proDigest,legacyFinalProofClear} from './browser-session.mjs';import {ChromePort} from '../../web/checkout-connector/chrome-port.js';
const hash=row=>{try{const text=canonicalJson(row);return typeof text==='string'?createHash('sha256').update(text).digest('hex'):null;}catch{return null;}};
const MAX_GENERATIONS=3;
function sourceGeneration(row,remaining=MAX_GENERATIONS,seen=new Set()){
 if(!validStored(row)||seen.has(row)||canonicalJson(row.plan)!==canonicalJson(PRO_PLAN))return null;seen.add(row);
 if(row.desktopHandoff){return row.reconcileOnly===true&&row.desktopHandoff.schema==='applebuy-desktop-handoff/v1'&&row.desktopHandoff.id&&validStored(row.desktopHandoff.originalSnapshot)&&!row.desktopEmptyRestart?0:null;}
 const t=row.desktopEmptyRestart;
 if(remaining<=0||!t||t.schema!=='applebuy-desktop-empty-restart/v1'||t.newFromEmpty!==true||t.accountAttested!==true||t.oldCheckoutStoppedByUser!==true||t.existingOrdersCheckedByUser!==true||t.taskId!==row.taskId||t.contextId!==row.desktopContext||t.planDigest!==proDigest||!validStored(t.originalTask)||t.sourceFingerprint!==hash(t.originalTask)||row.retiredHistory?.length!==1||hash(row.retiredHistory[0]?.desktopEmptyArchive?.originalSnapshot)!==t.sourceFingerprint)return null;
 const previous=sourceGeneration(t.originalTask,remaining-1,seen);return previous!==null&&t.generation===previous+1?previous+1:null;
}
function oldWindowsPast(row,now){const todo=[row],seen=new Set();let n=0;while(todo.length){const v=todo.pop();if(!v||typeof v!=='object')continue;if(seen.has(v)||++n>3000)return false;seen.add(v);if(v.pending?.action==='chooseSlot'||v.acceptedSlot!=null){if(!Number.isFinite(v.expiresAt)||v.expiresAt>now||v.pending?.action==='chooseSlot'&&(!Number.isFinite(v.pending.deadline)||v.pending.deadline>now))return false;}if(Array.isArray(v)&&v.length>200)return false;todo.push(...Object.values(v));}return true;}
export function validateEmptyRestart(row,api){
 const t=row?.desktopEmptyRestart;
 if(!t||row.reconcileOnly===true||typeof api?.sessionId!=='string'||row.desktopContext!==api.sessionId||sourceGeneration(row)===null||!legacyFinalProofClear(t.originalTask)||!legacyFinalProofClear(row.retiredHistory))return null;
 return {schema:t.schema,taskId:row.taskId,contextId:api.sessionId,sourceFingerprint:t.sourceFingerprint,newFromEmpty:true,accountAttested:true,oldCheckoutStoppedByUser:true,existingOrdersCheckedByUser:true};
}
// Provenance for a NEW, explicitly approved cart-only task. This never grants the readonly source buyer authority.
export function validateReadonlyExpiredEmptySource(row){
 if(!row?.desktopEmptyRestart||row.reconcileOnly!==true||!Number.isFinite(row.expiresAt)||row.expiresAt>Date.now()||sourceGeneration(row)===null||!legacyFinalProofClear(row))return null;
 return {schema:'applebuy-readonly-expired-empty-source/v1',sourceFingerprint:hash(row)};
}
export async function restartFromCurrentEmpty({store,api,tabId,approved=false,accountConfirmedByUser=false,oldCheckoutStoppedByUser=false,existingOrdersCheckedByUser=false,live=()=>true}){
 if(approved!==true||accountConfirmedByUser!==true||oldCheckoutStoppedByUser!==true||existingOrdersCheckedByUser!==true||typeof live!=='function'||!live()||typeof api?.sessionId!=='string')throw Error('EmptyRestartCurrentConfirmationRequired');
 const old=await store.get(TASK_KEY);
 const generation=sourceGeneration(old),now=Date.now();
 if(!validStored(old)||old.state==='RETIRED'||!(old.reconcileOnly===true||old.expiresAt<=now&&old.desktopContext===api.sessionId)||generation===null||generation>=MAX_GENERATIONS||!legacyFinalProofClear(old)||!oldWindowsPast(old,now))throw Error('EmptyRestartLegacyUnconfirmed');
 const port=new ChromePort(api,tabId,{mode:'observe',initialSequence:old.lastRead??0});let first;
 for(let i=0;i<2;i++){
  const o=await port.observe(PRO_PLAN);if(!live())throw Error('EmptyRestartCancelled');
  if(o.phase!=='EMPTY_BAG'||o.verifiedStep!==true||!/^\/shop\/bag\/?$/.test(o.path??'')||first&&first.documentId!==o.documentId)throw Error('EmptyRestartCurrentBagNotProved');first=o;
 }
 if(!live()||canonicalJson(await store.get(TASK_KEY))!==canonicalJson(old))throw Error('EmptyRestartRecordChanged');
 const id=randomUUID(),at=Date.now(),fingerprint=hash(old),archive={...structuredClone(old),state:'RETIRED',reconcileOnly:true,desktopEmptyArchive:{originalSnapshot:structuredClone(old),oldActionOutcome:'unknown',archivedAt:at}};
 const row={...createPurchaseRecord(PRO_PLAN,{taskId:id,planDigest:proDigest,tabId,now:at,id:randomUUID}),desktopContext:api.sessionId,retiredHistory:[archive],desktopEmptyRestart:{schema:'applebuy-desktop-empty-restart/v1',generation:generation+1,taskId:id,contextId:api.sessionId,planDigest:proDigest,sourceFingerprint:fingerprint,originalTask:structuredClone(old),newFromEmpty:true,accountAttested:true,accountIdentityBasis:'human current-run attestation; not programme authentication proof',oldCheckoutStoppedByUser:true,existingOrdersCheckedByUser:true,emptyDocumentId:first.documentId,createdAt:at}};
 if(!live())throw Error('EmptyRestartCancelled');await store.put(TASK_KEY,row);return {created:true,newFromEmpty:true,oldActionOutcome:'unknown',accountIdentityVerifiedByProgramme:false,realOrderVerified:false};
}
