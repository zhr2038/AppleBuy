// Browser-local PurchaseJob. Desktop commands and fsynced journal acknowledgements are the only native hops.
import {PurchaseJob,TASK_KEY,canonicalJson,validStored} from './job.js';
import {ChromePort} from './chrome-port.js';
import {withPurchaseOwner} from './owner.js';
import {merchantDocument} from './page-program.js';
import {CHECKOUT_PLAN,planAllowed} from './checkout-rpc-contract.js';
import {R2_VERSION,R2_MAX_BYTES,R2_CHUNK_BYTES,digest,rowPatch} from './r2-protocol.js';
const PROOFS=['desktopTransferProof','desktopEmptyRestartProof','desktopEndedDraftProof','desktopPaymentRestartProof','desktopReviewRestartProof'];
export class BrowserJobExecutor{
 constructor({peer,locks=globalThis.navigator?.locks,now=()=>Date.now(),operationMs=15000}){if(!Number.isFinite(operationMs)||operationMs<=0||operationMs>15000)throw Error('R2OperationBoundInvalid');this.operationMs=operationMs;this.peer=peer;this.locks=locks;this.now=now;this.seen=new Set();this.current=null;}
 get active(){return this.current!==null;}
 assertRun(p){const r=this.current;if(!r||p.runId!==r.id)throw Error('R2RunNotOwned');return r;}
 live(r){if(this.current!==r||r.stopped||(r.waiter&&r.ackDeadline!=null?r.ackDeadline:r.deadline)<=this.now()||this.peer.closed)throw Error('R2OwnerStopped');}
 wake(r){r.notify?.();r.notify=null;}
 stop(){const r=this.current;if(r){r.stopped=true;r.job?.pause();if(r.waiter){r.unreleased??={runId:r.id,sequence:r.checkpoint.sequence,sha256:r.checkpoint.sha256};r.waiter.reject(Error('R2WriteUnconfirmed'));r.waiter=null;}this.wake(r);}}
 async operation(op,p){
  const only=names=>{if(!p||Object.keys(p).some(k=>!names.includes(k)))throw Error('R2PayloadInvalid');};
  if(op==='r2Version'){only([]);return R2_VERSION;}
  if(op==='r2Begin'){
   only(['runId','bytes','sha256']);
   if(this.active||!this.peer.purchaseAllowed||this.seen.has(p.runId)||this.seen.size>=100||typeof p.runId!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(p.runId)||!Number.isSafeInteger(p.bytes)||p.bytes<2||p.bytes>R2_MAX_BYTES||!/^([a-f0-9]{64})$/.test(p.sha256))throw Error('R2StartRefused');
   this.seen.add(p.runId);this.current={id:p.runId,bytes:p.bytes,sha256:p.sha256,chunks:[],received:0,next:0,deadline:this.now()+10000,sequence:0,stopped:false,checkpoint:null,result:null};return {version:R2_VERSION};
  }
  const r=this.assertRun(p);
  if(op==='r2Chunk'){
   only(['runId','sequence','data']);this.live(r);if(!r.chunks||p.sequence!==r.next||typeof p.data!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(p.data)||p.data.length>40000)throw Error('R2ChunkInvalid');
   const bytes=Uint8Array.from(atob(p.data),c=>c.charCodeAt(0));if(!bytes.length||bytes.length>R2_CHUNK_BYTES||r.received+bytes.length>r.bytes)throw Error('R2ChunkInvalid');r.chunks.push(bytes);r.received+=bytes.length;r.next++;r.deadline=this.now()+10000;return {sequence:p.sequence};
  }
  if(op==='r2Pause'){only(['runId']);this.stop();return {paused:true};}
  if(op==='r2Finish'){
   only(['runId']);if(r.running||r.waiter)throw Error('R2StillRunning');this.stop();this.current=null;return {finished:true,unreleased:r.unreleased??null};
  }
  if(op==='r2Run'){
   only(['runId']);this.live(r);if(!r.chunks||r.received!==r.bytes)throw Error('R2SnapshotIncomplete');
   const bytes=new Uint8Array(r.bytes);let offset=0;for(const c of r.chunks){bytes.set(c,offset);offset+=c.length;}r.chunks=null;
   if(await digest(bytes)!==r.sha256)throw Error('R2SnapshotMismatch');
   const e=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
   if(!e||Object.keys(e).sort().join(',')!=='port,proofs,record,run,version'||e.version!==R2_VERSION||!validStored(e.record)||!planAllowed(e.record.plan)||e.record.desktopContext!==this.peer.contextId||e.record.reconcileOnly===true||e.record.state==='RETIRED'||e.record.expiresAt<=this.now()&&e.record.finalIntent?.sent!==true||e.run?.mode!=='purchase'||e.run?.rebind||e.run?.tabId!==e.record.tabId||e.run?.taskId!==e.record.taskId||e.run?.planDigest!==e.record.planDigest||!this.peer.tabs.has(e.record.tabId)||!e.port||e.port.authorized!==true||e.port.mode!=='purchase'||!e.proofs||Object.keys(e.proofs).some(k=>!PROOFS.includes(k)))throw Error('R2SnapshotNotAuthorized');
   r.row=structuredClone(e.record);r.rowHash=await digest(canonicalJson(r.row));r.deadline=this.now()+2500;r.running=true;
   r.watchdog=setInterval(()=>{if((r.waiter&&r.ackDeadline!=null?r.ackDeadline:r.deadline)<=this.now())this.stop();},250);
   r.promise=this.execute(r,e).catch(()=>{r.result={state:'NEEDS_VERIFICATION',phase:r.row?.lastPhase??'UNKNOWN',failed:true,realOrderVerified:false};}).finally(()=>{clearInterval(r.watchdog);r.running=false;this.wake(r);});return {started:true};
  }
  if(op==='r2Poll'){
   only(['runId']);if(!r.stopped){this.live(r);r.deadline=this.now()+2500;}
   if(r.running&&!r.checkpoint&&!r.stopped){let timer;try{await new Promise(resolve=>{r.notify=resolve;timer=setTimeout(resolve,300);});}finally{clearTimeout(timer);r.notify=null;}}
   if(r.waiter&&!r.stopped&&r.ackDeadline==null)r.ackDeadline=this.now()+15000;
   return {running:r.running===true,paused:r.stopped===true,...(r.checkpoint?{checkpoint:r.checkpoint}:{}),...(!r.running&&r.result?{result:r.result}:{})};
  }
  if(op==='r2Ack'){
   only(['runId','sequence','sha256']);this.live(r);
   if(!r.waiter||p.sequence!==r.checkpoint?.sequence||p.sha256!==r.checkpoint.sha256)throw Error('R2CommitNotConfirmed');
   const w=r.waiter;r.waiter=null;r.checkpoint=null;r.ackDeadline=null;r.deadline=this.now()+2500;w.resolve();return {committed:true};
  }
  throw Error('R2OperationInvalid');
 }
 async execute(r,e){
  const outcome=await withPurchaseOwner(this.locks,async()=>{
   this.live(r);
   const local=async(op,p)=>{
    this.live(r);let timer;
    try{return await Promise.race([this.peer.operation(op,p,()=>this.live(r)),new Promise((_,reject)=>{timer=setTimeout(()=>{this.stop();reject(Error('R2BrowserOperationUnknown'));},this.operationMs);})]);}
    finally{clearTimeout(timer);}
   };
   const api={sessionId:this.peer.contextId,controlledReview:true,tabs:{create:p=>local('createTab',p),get:tabId=>local('getTab',{tabId}),update:(tabId,p)=>local('updateTab',{tabId,...p}),remove:tabId=>local('removeTab',{tabId})},permissions:{contains:p=>local('containsHost',p)},scripting:{executeScript:q=>{
    if(q.func!==merchantDocument||q.world!=='ISOLATED')throw Error('R2ProgramNotAllowed');
    return local('merchantDocument',{tabId:q.target.tabId,...(q.target.documentIds?{documentId:q.target.documentIds[0]}:{}),plan:q.args[0],...(q.args[1]?{command:q.args[1]}:{})});
   }}};
   const port=new ChromePort(api,e.record.tabId,e.port);Object.assign(port,e.proofs);
   const store={get:async key=>{if(key!==TASK_KEY)throw Error('R2JournalKeyInvalid');return structuredClone(r.row);},put:async(key,value)=>{
    this.live(r);if(key!==TASK_KEY||r.waiter)throw Error('R2JournalWriteInvalid');
    const after={...value,desktopContext:this.peer.contextId},patch=rowPatch(r.row,after),sha256=await digest(canonicalJson(after));
    r.checkpoint={sequence:++r.sequence,previous:r.rowHash,sha256,patch};r.ackDeadline=null;
    await new Promise((resolve,reject)=>{r.waiter={resolve,reject};this.wake(r);});this.live(r);
    r.row=structuredClone(after);r.rowHash=sha256;
   }};
   r.job=new PurchaseJob({store,port,maxSteps:100,maxWaitMs:60000,transitionMs:60000,pollIntervalMs:500});
   let result=await r.job.run(CHECKOUT_PLAN,e.run);
   // Authentication and ordinary late rendering are observed in this same browser-local actor.
   // No login action, extra checkout, renewed task deadline or final retry is introduced.
   const until=Math.min(this.now()+300000,e.record.expiresAt);
   for(let continuations=0;continuations<10;continuations++){
    const pending=r.row.pending,expected={checkout:['FULFILLMENT','SLOTS'],selectPickup:['SLOTS'],chooseSlot:['DETAILS','PAYMENT','REVIEW'],fillDetails:['PAYMENT','REVIEW'],continuePayment:['REVIEW']}[pending?.action];
    if(r.stopped||r.row.finalIntent||result.lastPhase==='REVIEW'||!expected||result.lastPhase!=='AUTH'&&!['UNKNOWN','PROCESSING',pending.beforePhase].includes(result.lastPhase))break;
    let settled=false,misses=0;
    while(this.now()<until){
     await new Promise(resolve=>setTimeout(resolve,500));this.live(r);
     let observed;try{observed=await port.observe(CHECKOUT_PLAN);misses=0;}catch(error){if(error.scriptTransport===true&&++misses<=10)continue;break;}
     if(observed.merchantError||observed.feedback||['CONSENT','CHALLENGE','THROTTLE'].includes(observed.phase))break;
     if(expected.includes(observed.phase)){settled=true;break;}
    }
    if(!settled)break;this.live(r);result=await r.job.run(CHECKOUT_PLAN,e.run);
   }
   return {state:result.state,phase:result.lastPhase,reason:result.reason,pendingAction:result.pending?.action??null,realOrderVerified:result.state==='CONFIRMED_UNPAID',receiptAwaitingPayment:r.job.receiptAwaitingPayment===true,boundOrderIndependentlyObserved:false,quoteCny:port.last?.raw.quotedCny??null,skuPath:port.last?.raw.productForm?.ready===true?port.last.raw.path:null};
  });
  if(!outcome.owned)throw Error('R2OriginOwnerUnavailable');r.result=outcome.result;
 }
}
