// Explicit ownership transfer to this own desktop session, ONLY for a current matching singleton. Never repeats Add.
import {createHash,randomUUID} from 'node:crypto';
import {TASK_KEY,validStored,canonicalJson,normalizeIntent,createPurchaseRecord,itemMatches} from '../../web/checkout-connector/job.js';
import {PRO_PLAN,proDigest,legacyFinalProofClear} from './browser-session.mjs';
import {ChromePort} from '../../web/checkout-connector/chrome-port.js';
import {validateReadonlyExpiredEmptySource} from './empty-restart.mjs';
const fingerprint=r=>createHash('sha256').update(canonicalJson(r)).digest('hex');
const MAX_CART_TRANSFERS=3;
function sourceAllowed(row,remaining=MAX_CART_TRANSFERS-1){
 if(!validStored(row)||row.reconcileOnly!==true||canonicalJson(normalizeIntent(row.plan))!==canonicalJson(PRO_PLAN))return false;
 if([row.desktopHandoff,row.desktopEmptyRestart,row.desktopTransfer].filter(Boolean).length!==1)return false;
 if(row.desktopHandoff)return row.desktopHandoff.schema==='applebuy-desktop-handoff/v1'&&!!row.desktopHandoff.id&&validStored(row.desktopHandoff.originalSnapshot)&&legacyFinalProofClear(row);
 if(row.desktopEmptyRestart)return validateReadonlyExpiredEmptySource(row)!==null;
 return transferRecordValid(row,remaining)&&legacyFinalProofClear(compactTransferLayer(row));
}
function compactTransferLayer(row){
 return {...row,retiredHistory:null,desktopTransfer:{...row.desktopTransfer,originalTask:null}};
}
function transferRecordValid(row,remaining=MAX_CART_TRANSFERS){
 const t=row?.desktopTransfer;
 if(remaining<=0||!validStored(row)||!t||row.desktopHandoff||row.desktopEmptyRestart||t.schema!=='applebuy-desktop-cart-transfer/v1'||t.existingCartOnly!==true||t.contextId!==row.desktopContext||t.taskId!==row.taskId||t.planDigest!==proDigest||canonicalJson(normalizeIntent(row.plan))!==canonicalJson(PRO_PLAN)||!sourceAllowed(t.originalTask,remaining-1)||t.sourceFingerprint!==fingerprint(t.originalTask)||row.retiredHistory?.length!==1)return false;
 const archive=row.retiredHistory[0],m=archive?.desktopTransferArchive;
 if(!m||Object.keys(m).sort().join(',')!=='oldActionOutcome,originalSnapshot,retiredAt'||m.oldActionOutcome!=='unknown'||!Number.isFinite(m.retiredAt)||fingerprint(m.originalSnapshot)!==t.sourceFingerprint)return false;
 const expected={...structuredClone(t.originalTask),state:'RETIRED',reconcileOnly:true,desktopTransferArchive:{originalSnapshot:structuredClone(t.originalTask),oldActionOutcome:'unknown',retiredAt:m.retiredAt}};
 if(canonicalJson(archive)!==canonicalJson(expected))return false;
 // Current finals remain valid provenance for readonly lookup. Source adoption separately scans this layer.
 return true;
}
function previousSlotWindowsExpired(record,now){
 const stack=[record],seen=new Set();let count=0;
 while(stack.length){const v=stack.pop();if(!v||typeof v!=='object'||seen.has(v))continue;seen.add(v);if(++count>3000)return false;
  if(v.pending?.action==='chooseSlot'||v.acceptedSlot!=null){if(!Number.isFinite(v.expiresAt)||v.expiresAt>now||v.pending?.action==='chooseSlot'&&(!Number.isFinite(v.pending.deadline)||v.pending.deadline>now))return false;}
  stack.push(...Object.values(v));
 }return true;
}
function sourceSlotWindowsExpired(row,now){
 if(!row.desktopTransfer)return previousSlotWindowsExpired(row,now);
 return transferRecordValid(row)&&previousSlotWindowsExpired(compactTransferLayer(row),now)&&sourceSlotWindowsExpired(row.desktopTransfer.originalTask,now);
}
export function validateDesktopCartTransfer(row,api){
 const t=row?.desktopTransfer;
 if(!t||row.reconcileOnly===true||typeof api?.sessionId!=='string'||row.desktopContext!==api.sessionId||!transferRecordValid(row))return null;
 return {schema:t.schema,taskId:row.taskId,contextId:api.sessionId,sourceFingerprint:t.sourceFingerprint,existingCartOnly:true};
}
// Invoke under the runtime's physical ledger lease. Reads only until the atomic local successor write.
export async function transferExistingCart({store,api,tabId,approved=false,newContextConfirmed=false,live=()=>true}){
 if(approved!==true||newContextConfirmed!==true||!live()||typeof api?.sessionId!=='string')throw Error('DesktopTransferNeedsExplicitCurrentApproval');
 const old=await store.get(TASK_KEY);
 if(!sourceAllowed(old)||old.state==='RETIRED')throw Error('DesktopTransferLegacyUnconfirmed');
 if(!sourceSlotWindowsExpired(old,Date.now()))throw Error('DesktopTransferOldSlotWindowUnconfirmed');
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
 if(!validateDesktopCartTransfer(row,api))throw Error('DesktopTransferProspectiveUnconfirmed');
 if(!live())throw Error('DesktopTransferCancelled');await store.put(TASK_KEY,row);
 return {created:true,existingCartOnly:true,oldActionOutcome:'unknown',realOrderVerified:false};
}
