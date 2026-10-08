// One explicit new draft after a stopped expired checkout, before this task ever chose a slot or final.
// Whole old source is an immutable managed archive; old outcomes remain unknown. No fifth cart transfer.
import {createHash,randomUUID} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';import {OWNER_VALUE_BYTES} from './owner-write-frames.mjs';
import {TASK_KEY,validStored,canonicalJson,normalizeIntent,createPurchaseRecord,itemMatches} from '../../web/checkout-connector/job.js';
import {PRO_PLAN,proDigest} from './browser-session.mjs';import {stoppedCheckoutDraftSource} from './cart-transfer.mjs';import {ChromePort} from '../../web/checkout-connector/chrome-port.js';
export const SHOP_HOST_SCOPE='https://*.www.apple.com.cn/*';
const hash=r=>createHash('sha256').update(canonicalJson(r)).digest('hex');
const PACKED_LIMIT=2_000_000;
function pack(row){const bytes=Buffer.from(canonicalJson(row),'utf8');if(bytes.length>OWNER_VALUE_BYTES)throw Error('EndedDraftArchiveUnconfirmed');const data=gzipSync(bytes).toString('base64');if(data.length>PACKED_LIMIT)throw Error('EndedDraftArchiveUnconfirmed');return {codec:'gzip-canonical-json/v1',bytes:bytes.length,data};}
function unpack(p,digest){
 if(!p||Object.keys(p).sort().join(',')!=='bytes,codec,data'||p.codec!=='gzip-canonical-json/v1'||!Number.isSafeInteger(p.bytes)||p.bytes<=0||p.bytes>OWNER_VALUE_BYTES||typeof p.data!=='string'||p.data.length>PACKED_LIMIT)throw Error('EndedDraftArchiveUnconfirmed');
 const compressed=Buffer.from(p.data,'base64');if(compressed.toString('base64')!==p.data)throw Error('EndedDraftArchiveUnconfirmed');const bytes=gunzipSync(compressed,{maxOutputLength:OWNER_VALUE_BYTES});if(bytes.length!==p.bytes||createHash('sha256').update(bytes).digest('hex')!==digest)throw Error('EndedDraftArchiveUnconfirmed');const row=JSON.parse(bytes.toString('utf8'));if(canonicalJson(row)!==bytes.toString('utf8'))throw Error('EndedDraftArchiveUnconfirmed');return row;
}
function scheduleKept(row,old){return canonicalJson(row.initialDates)===canonicalJson(old.initialDates)&&row.dateCursor>=old.dateCursor&&row.refusals>=old.refusals&&Object.entries(old.floors).every(([d,t])=>typeof row.floors[d]==='string'&&row.floors[d]>=t)&&old.rejected.every(x=>row.rejected.some(y=>canonicalJson(x)===canonicalJson(y)));}
export {pack as packArchivedSource,unpack as unpackArchivedSource,scheduleKept as schedulingRestrictionsKept,hash as archivedSourceHash};
export async function validateEndedDraft(row,api,store,{readonly=false}={}){
 const t=row?.desktopEndedDraft;if(!validStored(row)||!t||row.desktopHandoff||row.desktopEmptyRestart||row.desktopTransfer||row.reconcileOnly===true&&!readonly||typeof api?.sessionId!=='string'||row.desktopContext!==api.sessionId||t.schema!=='applebuy-ended-draft/v1'||t.generation!==1||t.existingCartOnly!==true||t.taskId!==row.taskId||t.contextId!==row.desktopContext||t.planDigest!==proDigest||canonicalJson(normalizeIntent(row.plan))!==canonicalJson(PRO_PLAN)||t.merchantExpiryConfirmed!==true||t.oldExecutorStopped!==true||t.sameAccountOrdersClear!==true||!Number.isFinite(t.createdAt)||!(/^[a-f0-9]{64}$/.test(t.sourceArchive??''))||canonicalJson(row.retainedSourceArchives)!==canonicalJson([{schema:t.schema,sourceArchive:t.sourceArchive}])||typeof store?.readArchive!=='function')return null;
 let old;try{
  const backup=unpack(t.sourceBackup,t.sourceArchive);
  try{old=await store.readArchive(t.sourceArchive);}catch(e){if(e.code!=='ENOENT')return null;old=backup;}
  if(canonicalJson(old)!==canonicalJson(backup))return null;
 }catch{return null;}
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
 const at=Date.now(),id=randomUUID(),row={...createPurchaseRecord(PRO_PLAN,{taskId:id,planDigest:proDigest,tabId,now:at,id:randomUUID}),desktopContext:api.sessionId,desktopEndedDraft:{schema:'applebuy-ended-draft/v1',generation:1,taskId:id,contextId:api.sessionId,planDigest:proDigest,sourceArchive,sourceBackup:pack(old),existingCartOnly:true,merchantExpiryConfirmed:true,oldExecutorStopped:true,sameAccountOrdersClear:true,oldActionOutcome:'unknown',identityBasis:'operator current-account attestation; not programme authentication or server hold proof',createdAt:at}};
 for(const k of ['initialDates','floors','rejected','refusals','dateCursor'])row[k]=structuredClone(old[k]);
 row.retainedSourceArchives=[{schema:row.desktopEndedDraft.schema,sourceArchive}];
 if(!await validateEndedDraft(row,api,store)||!live())throw Error('EndedDraftProspectiveUnconfirmed');await store.put(TASK_KEY,row);
 return {created:true,existingCartOnly:true,oldActionOutcome:'unknown',realOrderVerified:false};
}
