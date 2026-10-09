// Desktop journal authority / UI command pump. No DOM read or merchant action crosses this loop.
import {canonicalJson,TASK_KEY} from '../../web/checkout-connector/job.js';
import {R2_VERSION,R2_MAX_BYTES,R2_CHUNK_BYTES,digest,applyRowPatch} from '../../web/checkout-connector/r2-protocol.js';
import {UNRELEASED_FINAL_KIND} from '../../web/checkout-connector/review-progress.js';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
export async function runInBrowser({api,store,record,run,port,proofs,signal,onState=()=>{}}){
 if(typeof api.r2Exchange!=='function'||record?.desktopContext!==api.sessionId||record?.state==='RETIRED'||record?.reconcileOnly===true)throw Error('R2OwnedRecordRequired');
 const runId=crypto.randomUUID(),payload=Buffer.from(JSON.stringify({version:R2_VERSION,record,run,port,proofs}));
 if(payload.length>R2_MAX_BYTES)throw Error('R2SnapshotTooLarge');
 let started=false,finished=false,paused=false,unreleasedWrite=null,expected=structuredClone(record),expectedHash=await digest(canonicalJson(record)),sequence=0;
 const call=(op,p={})=>api.r2Exchange(op,{runId,...p});
 const assertCurrent=async()=>{if(canonicalJson(await store.get(TASK_KEY))!==canonicalJson(expected))throw Error('R2JournalChanged');};
 const finishRun=async()=>{
  const terminal=await call('r2Finish');if(terminal.finished!==true)throw Error('R2StopUnconfirmed');finished=true;
  const proof=terminal.unreleased,candidate=unreleasedWrite;
  // Correct only a NEW write-ahead intent of THIS run after the receiver positively confirms
  // it stopped without releasing that exact checkpoint. No inference from silence or timeout.
  if(!candidate||proof?.runId!==runId||proof.sequence!==candidate.sequence||proof.sha256!==candidate.sha256)return;
  await assertCurrent();const corrected=structuredClone(expected);
  if(candidate.kind==='pending'){
   if(corrected.pending?.id!==candidate.pendingId||corrected.pending.dispatched===false)return;
   corrected.pending.dispatched=false;
  }else if(corrected.pending||corrected.finalIntent?.id!==candidate.intentId||corrected.finalIntent.sent!==false)return;
  if(candidate.kind==='final-draft'||corrected.pending?.action==='submitOrder'){
   if(candidate.kind==='pending'&&corrected.pending.intentId!==corrected.finalIntent?.id)throw Error('R2FinalIntentChanged');
   corrected.finalIntent.sent=false;
   corrected.finalIntent.notDispatched={kind:UNRELEASED_FINAL_KIND,runId,sequence:candidate.sequence,sha256:candidate.sha256,taskId:corrected.taskId,contextId:corrected.desktopContext,documentId:corrected.pending?.documentId??corrected.lastDocumentId,intentId:corrected.finalIntent.id};
  }
  corrected.state=paused||signal?.aborted?'PAUSED':'NEEDS_USER';corrected.reason='control-changed-after-write; not dispatched';
  await store.put(TASK_KEY,corrected);if(canonicalJson(await store.get(TASK_KEY))!==canonicalJson(corrected))throw Error('R2DurableWriteUnconfirmed');
  expected=corrected;expectedHash=await digest(canonicalJson(corrected));unreleasedWrite=null;
 };
 try{
  if(signal?.aborted)throw Error('DesktopSessionCancelled');await assertCurrent();
  const ack=await call('r2Begin',{bytes:payload.length,sha256:await digest(payload)});started=true;if(ack.version!==R2_VERSION)throw Error('R2VersionMismatch');
  for(let offset=0,index=0;offset<payload.length;offset+=R2_CHUNK_BYTES,index++){
   if(signal?.aborted)throw Error('DesktopSessionCancelled');
   const r=await call('r2Chunk',{sequence:index,data:payload.subarray(offset,offset+R2_CHUNK_BYTES).toString('base64')});if(r.sequence!==index)throw Error('R2SnapshotUnconfirmed');
  }
  await assertCurrent();if(signal?.aborted)throw Error('DesktopSessionCancelled');if((await call('r2Run')).started!==true)throw Error('R2RunUnconfirmed');
  for(let reads=0;reads<25000;reads++){
   if(signal?.aborted&&!paused){await call('r2Pause');paused=true;}
   const status=await call('r2Poll');
   if(status.checkpoint&&!paused&&status.paused!==true){
    const c=status.checkpoint;if(c.sequence!==sequence+1||c.previous!==expectedHash)throw Error('R2CommitSequenceMismatch');
    const after=applyRowPatch(expected,c.patch),hash=await digest(canonicalJson(after));if(hash!==c.sha256)throw Error('R2CommitDigestMismatch');
    const freshPending=after.pending?.id&&after.pending.id!==expected.pending?.id&&after.pending.dispatched!==false;
    const freshDraft=!after.pending&&after.finalIntent?.sent===false&&after.finalIntent.id!==expected.finalIntent?.id;
    await assertCurrent();await store.put(TASK_KEY,after);
    if(canonicalJson(await store.get(TASK_KEY))!==canonicalJson(after))throw Error('R2DurableWriteUnconfirmed');
    expected=after;expectedHash=hash;sequence=c.sequence;
    unreleasedWrite=freshPending?{kind:'pending',sequence,sha256:hash,pendingId:after.pending.id}:freshDraft?{kind:'final-draft',sequence,sha256:hash,intentId:after.finalIntent.id}:null;
    if(signal?.aborted){await call('r2Pause');paused=true;continue;}
    if((await call('r2Ack',{sequence,sha256:hash})).committed!==true)throw Error('R2CommitNotAcknowledged');
    unreleasedWrite=null;
    onState({state:after.state,phase:after.lastPhase,pendingAction:after.pending?.action??null});continue;
   }
   if(status.running===false){
    await finishRun();
    if(paused||signal?.aborted)return {state:'PAUSED',phase:expected.lastPhase,pendingAction:expected.pending?.action??null,realOrderVerified:false};
    if(status.result?.failed||!status.result)throw Error('R2ExecutionUnconfirmed');
    if(status.result.state!==expected.state||status.result.phase!==expected.lastPhase||status.result.realOrderVerified!== (expected.state==='CONFIRMED_UNPAID'))throw Error('R2ResultJournalMismatch');
    return status.result;
   }
   // The bridge long-poll wakes at a checkpoint or completion; no fixed per-step sleep.
   if(status.paused)await delay(100);
  }
  throw Error('R2ObservationLimit');
 }finally{
  if(started&&!finished){
   // No fallback to the desktop loop after an uncertain browser-local run.
   try{await call('r2Pause');for(let n=0;n<30;n++){const s=await call('r2Poll');if(s.running===false){await finishRun();break;}await delay(100);}}catch{}
   if(!finished)throw Error('R2StopUnconfirmed');
  }
 }
}
