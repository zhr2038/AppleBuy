import test from 'node:test';import assert from 'node:assert/strict';
import {restartFromCurrentEmpty} from '../src/desktop/empty-restart.mjs';
import {transferExistingCart,validateDesktopCartTransfer} from '../src/desktop/cart-transfer.mjs';
import {PRO_PLAN,proDigest,runDesktopSession} from '../src/desktop/browser-session.mjs';
import {createPurchaseRecord,TASK_KEY} from '../web/checkout-connector/job.js';

async function fixture(){
 const original={...createPurchaseRecord(PRO_PLAN,{taskId:'FAKE-C146-root',planDigest:proDigest,tabId:99,now:0,id:()=> 'FAKE'}),state:'NEEDS_VERIFICATION',pending:{action:'addBag',id:'FAKE-unknown-add',documentId:'FAKE-old',deadline:0},bagAddStarted:true,resourceWritten:true,syntheticPadding:Array.from({length:90},()=>({branch:{leaf:{value:'FAKE'}}}))};
 const w={row:{...structuredClone(original),reconcileOnly:true,desktopHandoff:{schema:'applebuy-desktop-handoff/v1',id:'FAKE-handoff',originalSnapshot:structuredClone(original)}},phase:'EMPTY_BAG',writes:0};
 const store={async get(){return structuredClone(w.row);},async put(k,v){assert.equal(k,TASK_KEY);w.writes++;w.row=structuredClone(v);},async acquireOwner(){return {owned:true,release:async()=>{}};}};
 const api={sessionId:'FAKE-C146-empty',tabs:{async get(){return {id:7,url:'https://www.apple.com.cn/shop/bag',status:'complete'};}},permissions:{async contains(){return true;}},scripting:{async executeScript(q){assert.equal(q.args.length,1);return [{frameId:0,documentId:'FAKE-C146-bag',result:{schema:'applebuy-merchant-read/v1',phase:w.phase,path:'/shop/bag',verifiedStep:true,purchase:w.phase==='BAG'?{...PRO_PLAN.product,quantity:1,totalCny:9999,itemVerified:true}:null,extras:false}}];}}};
 await restartFromCurrentEmpty({store,api,tabId:7,approved:true,accountConfirmedByUser:true,oldCheckoutStoppedByUser:true,existingOrdersCheckedByUser:true});w.row.expiresAt=0;w.row.pending={action:'checkout',id:'FAKE-pending-checkout',documentId:'FAKE-checkout',beforePhase:'BAG',deadline:0};w.row.bagAddStarted=true;w.row.resourceWritten=true;w.phase='BAG';api.sessionId='FAKE-C146-cart-one';await runDesktopSession({store,api,tabId:7,mode:'reconcile'});await transferExistingCart({store,api,tabId:7,approved:true,newContextConfirmed:true});
 return {w,store,api};
}
async function readonlyNext(f,index){f.api.sessionId='FAKE-C146-cart-'+index;await runDesktopSession({store:f.store,api:f.api,tabId:7,mode:'reconcile'});assert.equal(f.w.row.reconcileOnly,true);}

test('C146 current cart-only source can re-enter through a new readonly context without losing its full source or adding',async()=>{
 const f=await fixture();await readonlyNext(f,2);const before=structuredClone(f.w.row);const result=await transferExistingCart({...f,tabId:7,approved:true,newContextConfirmed:true});assert.equal(result.created,true);assert.ok(validateDesktopCartTransfer(f.w.row,f.api));assert.deepEqual(f.w.row.desktopTransfer.originalTask,before);assert.deepEqual(f.w.row.retiredHistory[0].desktopTransferArchive.originalSnapshot,before);
});

test('C146 cart-transfer structural depth is bounded and never trusts a caller counter',async()=>{
 const f=await fixture();for(let n=2;n<=3;n++){await readonlyNext(f,n);await transferExistingCart({...f,tabId:7,approved:true,newContextConfirmed:true});assert.ok(validateDesktopCartTransfer(f.w.row,f.api));}
 await readonlyNext(f,4);const before=structuredClone(f.w.row),writes=f.w.writes;await assert.rejects(transferExistingCart({...f,tabId:7,approved:true,newContextConfirmed:true}));assert.equal(f.w.writes,writes);assert.deepEqual(f.w.row,before);
});

for(const [name,mutate] of [
 ['hidden-final',f=>{f.w.row.extraBranch={finalIntent:{id:'FAKE-hidden',sent:true}};}],
 ['archive-extra',f=>{f.w.row.retiredHistory[0].extraBranch={finalIntent:{id:'FAKE-archive-hidden',sent:true}};}],
 ['original-tamper',f=>{f.w.row.desktopTransfer.originalTask.pending=null;}],
 ['active-old-slot',f=>{f.w.row.pending={action:'chooseSlot',id:'FAKE-live',documentId:'FAKE-slot',deadline:Date.now()+300000};}],
 ['dual-marker',f=>{f.w.row.desktopHandoff={schema:'applebuy-desktop-handoff/v1',id:'FAKE-dual',originalSnapshot:structuredClone(f.w.row.desktopTransfer.originalTask)};}],
])test('C146 '+name+' cannot write a replacement',async()=>{
 const f=await fixture();await readonlyNext(f,2);mutate(f);const before=structuredClone(f.w.row),writes=f.w.writes;await assert.rejects(transferExistingCart({...f,tabId:7,approved:true,newContextConfirmed:true}));assert.equal(f.w.writes,writes);assert.deepEqual(f.w.row,before);
});
