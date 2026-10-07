// One explicit new draft after a stopped expired checkout, before this task ever chose a slot or final.
// Whole old source is an immutable managed archive; old outcomes remain unknown. No fifth cart transfer.
import {createHash,randomUUID} from 'node:crypto';
import {TASK_KEY,validStored,canonicalJson,normalizeIntent,createPurchaseRecord,itemMatches} from '../../web/checkout-connector/job.js';
import {PRO_PLAN,proDigest} from './browser-session.mjs';import {stoppedCheckoutDraftSource} from './cart-transfer.mjs';import {ChromePort} from '../../web/checkout-connector/chrome-port.js';
export const SHOP_HOST_SCOPE='https://*.www.apple.com.cn/*';
const hash=r=>createHash('sha256').update(canonicalJson(r)).digest('hex');
function scheduleKept(row,old){return canonicalJson(row.initialDates)===canonicalJson(old.initialDates)&&row.dateCursor>=old.dateCursor&&row.refusals>=old.refusals&&Object.entries(old.floors).every(([d,t])=>typeof row.floors[d]==='string'&&row.floors[d]>=t)&&old.rejected.every(x=>row.rejected.some(y=>canonicalJson(x)===canonicalJson(y)));}
export async function validateEndedDraft(row,api,store,{readonly=false}={}){
 const t=row?.desktopEndedDraft;if(!validStored(row)||!t||row.desktopHandoff||row.desktopEmptyRestart||row.desktopTransfer||row.reconcileOnly===true&&!readonly||typeof api?.sessionId!=='string'||row.desktopContext!==api.sessionId||t.schema!=='applebuy-ended-draft/v1'||t.generation!==1||t.existingCartOnly!==true||t.taskId!==row.taskId||t.contextId!==row.desktopContext||t.planDigest!==proDigest||canonicalJson(normalizeIntent(row.plan))!==canonicalJson(PRO_PLAN)||t.merchantExpiryConfirmed!==true||t.oldExecutorStopped!==true||t.sameAccountOrdersClear!==true||!Number.isFinite(t.createdAt)||!(/^[a-f0-9]{64}$/.test(t.sourceArchive??''))||canonicalJson(row.retainedSourceArchives)!==canonicalJson([{schema:t.schema,sourceArchive:t.sourceArchive}])||typeof store?.readArchive!=='function')return null;
 let old;try{old=await store.readArchive(t.sourceArchive);}catch{return null;}
 if(hash(old)!==t.sourceArchive||!stoppedCheckoutDraftSource(old,t.createdAt)||row.taskId===old.taskId||row.desktopContext===old.desktopContext||!scheduleKept(row,old))return null;
 return {schema:t.schema,taskId:row.taskId,contextId:api.sessionId,sourceArchive:t.sourceArchive,existingCartOnly:true};
}
export async function renewEndedDraft({store,api,tabId,approved=false,newContextConfirmed=false,merchantExpiryConfirmed=false,oldExecutorStopped=false,sameAccountOrdersClear=false,live=()=>true}){
 if([approved,newContextConfirmed,merchantExpiryConfirmed,oldExecutorStopped,sameAccountOrdersClear].some(v=>v!==true)||typeof live!=='function'||!live()||typeof api?.sessionId!=='string')throw Error('EndedDraftCurrentApprovalRequired');
 const old=await store.get(TASK_KEY),proof=stoppedCheckoutDraftSource(old);if(!proof||api.sessionId===old.desktopContext||typeof store.archiveSnapshot!=='function'||typeof store.readArchive!=='function')throw Error('EndedDraftSourceUnconfirmed');
 // Check scope before a local retry record, archive or merchant mutation is created. Query never grants it.
 if(!await api.permissions.contains({origins:[SHOP_HOST_SCOPE]}))throw Error('EndedDraftShopHostScopeMissing');
 const port=new ChromePort(api,tabId,{mode:'observe',initialSequence:old.lastRead??0});let previous;
 for(let n=0;n<2;n++){const o=await port.observe(PRO_PLAN);if(!live())throw Error('EndedDraftCancelled');if(o.phase!=='BAG'||o.verifiedStep!==true||o.path!=='/shop/bag'||!itemMatches(PRO_PLAN,o.purchase)||o.extras!==false)throw Error('EndedDraftBagUnconfirmed');if(previous&&(previous.documentId!==o.documentId||canonicalJson(previous.purchase)!==canonicalJson(o.purchase)))throw Error('EndedDraftBagChanged');previous=o;}
 if(!live()||canonicalJson(await store.get(TASK_KEY))!==canonicalJson(old))throw Error('EndedDraftSourceChanged');
 const sourceArchive=await store.archiveSnapshot(old);if(sourceArchive!==proof.sourceFingerprint||!live()||canonicalJson(await store.get(TASK_KEY))!==canonicalJson(old))throw Error('EndedDraftArchiveUnconfirmed');
 const at=Date.now(),id=randomUUID(),row={...createPurchaseRecord(PRO_PLAN,{taskId:id,planDigest:proDigest,tabId,now:at,id:randomUUID}),desktopContext:api.sessionId,desktopEndedDraft:{schema:'applebuy-ended-draft/v1',generation:1,taskId:id,contextId:api.sessionId,planDigest:proDigest,sourceArchive,existingCartOnly:true,merchantExpiryConfirmed:true,oldExecutorStopped:true,sameAccountOrdersClear:true,oldActionOutcome:'unknown',identityBasis:'operator current-account attestation; not programme authentication or server hold proof',createdAt:at}};
 for(const k of ['initialDates','floors','rejected','refusals','dateCursor'])row[k]=structuredClone(old[k]);
 row.retainedSourceArchives=[{schema:row.desktopEndedDraft.schema,sourceArchive}];
 if(!await validateEndedDraft(row,api,store)||!live())throw Error('EndedDraftProspectiveUnconfirmed');await store.put(TASK_KEY,row);
 return {created:true,existingCartOnly:true,oldActionOutcome:'unknown',realOrderVerified:false};
}
