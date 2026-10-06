import test from 'node:test';import assert from 'node:assert/strict';
import {restartFromCurrentEmpty,validateEmptyRestart} from '../src/desktop/empty-restart.mjs';
import {transferExistingCart,validateDesktopCartTransfer} from '../src/desktop/cart-transfer.mjs';
import {PRO_PLAN,proDigest,runDesktopSession} from '../src/desktop/browser-session.mjs';
import {createPurchaseRecord,TASK_KEY} from '../web/checkout-connector/job.js';

async function fixture(){
 const original={...createPurchaseRecord(PRO_PLAN,{taskId:'FAKE-C142-source',planDigest:proDigest,tabId:99,now:0,id:()=> 'FAKE'}),state:'NEEDS_VERIFICATION',pending:{action:'addBag',id:'FAKE-old-add',documentId:'FAKE-old',deadline:0},bagAddStarted:true,resourceWritten:true};
 const w={row:{...structuredClone(original),reconcileOnly:true,desktopHandoff:{schema:'applebuy-desktop-handoff/v1',id:'FAKE-handoff',originalSnapshot:structuredClone(original)}},writes:0,phase:'EMPTY_BAG',quantity:1,price:9999,extras:false};
 const store={async get(){return structuredClone(w.row);},async put(k,v){assert.equal(k,TASK_KEY);w.row=structuredClone(v);w.writes++;},async acquireOwner(){return {owned:true,release:async()=>{}};}};
 const api={sessionId:'FAKE-C142-first',tabs:{async get(){return {id:7,url:'https://www.apple.com.cn/shop/bag',status:'complete'};}},permissions:{async contains(){return true;}},scripting:{async executeScript(q){assert.equal(q.args.length,1,'readonly only');return [{frameId:0,documentId:'FAKE-C142-bag',result:{schema:'applebuy-merchant-read/v1',phase:w.phase,path:'/shop/bag',verifiedStep:true,purchase:w.phase==='BAG'?{...PRO_PLAN.product,quantity:w.quantity,totalCny:w.price,itemVerified:true}:null,extras:w.extras}}];}}};
 await restartFromCurrentEmpty({store,api,tabId:7,approved:true,accountConfirmedByUser:true,oldCheckoutStoppedByUser:true,existingOrdersCheckedByUser:true});
 w.row.expiresAt=0;w.row.state='NEEDS_USER';w.row.pending={action:'checkout',id:'FAKE-unknown-checkout',documentId:'FAKE-old-checkout',beforePhase:'BAG',deadline:0};w.row.bagAddStarted=true;w.row.resourceWritten=true;
 w.phase='BAG';const nextApi={...api,sessionId:'FAKE-C142-second'};await runDesktopSession({store,api:nextApi,tabId:7,mode:'reconcile'});assert.equal(w.row.reconcileOnly,true);
 return {w,store,api:nextApi,before:structuredClone(w.row)};
}
const approval={tabId:7,approved:true,newContextConfirmed:true};

test('C142 expired readonly empty-start successor can adopt its current singleton cart, preserving all unknowns',async()=>{
 const f=await fixture();const result=await transferExistingCart({...f,...approval});assert.equal(result.created,true);assert.equal(result.existingCartOnly,true);assert.ok(validateDesktopCartTransfer(f.w.row,f.api));assert.deepEqual(f.w.row.desktopTransfer.originalTask,f.before);assert.deepEqual(f.w.row.retiredHistory[0].desktopTransferArchive.originalSnapshot,f.before);assert.equal(f.w.row.desktopTransfer.originalTask.pending.action,'checkout');assert.equal(f.w.row.desktopTransfer.originalTask.desktopEmptyRestart.originalTask.pending.action,'addBag');assert.equal(validateEmptyRestart(f.before,f.api),null,'readonly lineage is never empty-start buyer authority');
});

for(const [name,mutate,options] of [
 ['no-current-approval',()=>{},{approved:false}],
 ['two-items',f=>{f.w.quantity=2;},{}],
 ['price-over-cap',f=>{f.w.price=10000;},{}],
 ['extras',f=>{f.w.extras=true;},{}],
 ['no-current-cart',f=>{f.w.phase='EMPTY_BAG';},{}],
 ['tampered-lineage',f=>{f.w.row.desktopEmptyRestart.sourceFingerprint='0'.repeat(64);},{}],
 ['hidden-final',f=>{f.w.row.desktopEmptyRestart.originalTask.finalIntent={id:'FAKE-final',sent:true};},{}],
 ['not-expired',f=>{f.w.row.expiresAt=Date.now()+300000;},{}],
 ['not-readonly',f=>{f.w.row.reconcileOnly=false;},{}],
 ['live-slot-window',f=>{f.w.row.pending={action:'chooseSlot',id:'FAKE-live-slot',documentId:'FAKE-slot',deadline:Date.now()+300000};},{}],
])test('C142 '+name+' never writes a new successor',async()=>{
 const f=await fixture();mutate(f);const before=structuredClone(f.w.row),writes=f.w.writes;await assert.rejects(transferExistingCart({...f,...approval,...options}));assert.equal(f.w.writes,writes);assert.deepEqual(f.w.row,before);
});

test('C142 adopted descendant cannot add again when the current cart becomes empty',async()=>{
 const f=await fixture();await transferExistingCart({...f,...approval});f.w.phase='EMPTY_BAG';
 const result=await runDesktopSession({store:f.store,api:f.api,tabId:7,mode:'purchase',authority:{checkoutApproved:true,newContextConfirmed:true,legacyOwnershipRevoked:true,planDigest:proDigest}});
 assert.notEqual(result.state,'CONFIRMED_UNPAID');assert.equal(f.w.row.bagAddStarted,false);assert.equal(f.w.row.finalIntent,null);assert.deepEqual(f.w.row.desktopTransfer.originalTask,f.before);
});
