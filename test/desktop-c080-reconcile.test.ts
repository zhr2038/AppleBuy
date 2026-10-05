// Imported legacy reconciliation with production Job/Port, entirely FAKE browser/data and zero merchant commands.
import test from 'node:test';import assert from 'node:assert/strict';
import {runDesktopSession,PRO_PLAN,proDigest} from '../src/desktop/browser-session.mjs';import {createPurchaseRecord,TASK_KEY} from '../web/checkout-connector/job.js';
function setup({phase='EMPTY_BAG',action='addBag',readOnly=true}={}){
 const base=createPurchaseRecord(PRO_PLAN,{taskId:'FAKE-old',planDigest:proDigest,tabId:99,now:0,id:()=> 'FAKE'});
 const prior={...structuredClone(base),state:'RETIRED',pending:{action:'chooseSlot',id:'FAKE-prior-slot',beforePhase:'SLOTS',documentId:'FAKE-prior',deadline:0},bagAddStarted:true,resourceWritten:true};
 const original={...base,state:'NEEDS_VERIFICATION',lastRead:1,pending:{action,id:'FAKE-current',beforePhase:action==='submitOrder'?'REVIEW':'VARIANT',documentId:'FAKE-old-doc',deadline:0},bagAddStarted:true,resourceWritten:true,retiredHistory:[prior]};
 let row={...structuredClone(original),reconcileOnly:readOnly,desktopHandoff:{schema:'applebuy-desktop-handoff/v1',originalSnapshot:structuredClone(original)}};
 if(action==='submitOrder')row.finalIntent={id:'FAKE-final',sent:true};let reads=0,writes=0,navigations=0;
 const store={async get(){return structuredClone(row);},async put(k,v){assert.equal(k,TASK_KEY);writes++;row=structuredClone(v);},async acquireOwner(){return {owned:true,release:async()=>{}};}};
 const api={sessionId:'FAKE-readonly-desktop',tabs:{async get(){return {id:7,url:'https://www.apple.com.cn/shop/bag'};},async update(){navigations++;}},permissions:{async contains(){return true;}},scripting:{async executeScript(q){assert.equal(q.args.length,1,'No merchant command or private field injection');reads++;return [{frameId:0,documentId:'FAKE-current-doc',result:{schema:'applebuy-merchant-read/v1',phase,path:'/shop/bag',verifiedStep:true,receiptVerified:phase==='ORDER_RECEIPT',orderRefHash:phase==='ORDER_RECEIPT'?'b'.repeat(64):null,orderDetailLink:phase==='ORDER_RECEIPT'?'https://www.apple.com.cn/shop/order/detail/FAKE/FAKE':null,purchase:{...PRO_PLAN.product,quantity:1,totalCny:9999,fulfillment:'pickup',store:PRO_PLAN.stores[0],storeVerified:true,itemVerified:true,verified:true},extras:false}}];}}};
 return {store,api,original,get row(){return row;},get counts(){return {reads,writes,navigations};}};
}
test('C080 explicit current empty bag does not resolve or resend imported unknown Add; original history survives',async()=>{
 const f=setup();const r=await runDesktopSession({api:f.api,tabId:7,store:f.store,mode:'reconcile',authority:{checkoutApproved:true,termsAccepted:true},privatePickupData:{phone:'FAKE-private'}});
 assert.equal(r.realOrderVerified,false);assert.equal(f.row.reconcileOnly,true);assert.equal(f.row.pending.action,'addBag');assert.equal(f.row.tabId,7);assert.deepEqual(f.row.desktopHandoff.originalSnapshot,f.original);assert.deepEqual(f.row.retiredHistory,f.original.retiredHistory);assert.equal(f.counts.navigations,0);assert.ok(f.counts.reads>0);
 await assert.rejects(runDesktopSession({api:f.api,tabId:7,store:f.store,mode:'purchase',authority:{checkoutApproved:true,legacyOwnershipRevoked:true,newContextConfirmed:true,planDigest:proDigest}}),/RevokedSource/);
});
test('C080 readonly imported final never adopts a replacement matching receipt or navigates',async()=>{
 const f=setup({phase:'ORDER_RECEIPT',action:'submitOrder'});await runDesktopSession({api:f.api,tabId:7,store:f.store,mode:'reconcile'});assert.equal(f.row.orderRefHash,null);assert.equal(f.row.pending.action,'submitOrder');assert.equal(f.row.finalIntent.sent,true);assert.equal(f.counts.navigations,0);assert.equal(f.row.reconcileOnly,true);
});
test('C080 readonly mode cannot downgrade an unconfirmed foreign buying owner without an existing readonly handoff',async()=>{
 const f=setup({readOnly:false});const before=structuredClone(f.row);await assert.rejects(runDesktopSession({api:f.api,tabId:7,store:f.store,mode:'reconcile'}),/ReadonlyHandoffRequired/);assert.deepEqual(f.row,before);assert.deepEqual(f.counts,{reads:0,writes:0,navigations:0});
});
test('C080 a saved old confirmation is never advertised as a freshly verified real order during readonly import',async()=>{
 const f=setup();f.row.state='CONFIRMED_UNPAID';f.row.pending=null;f.row.finalIntent={id:'FAKE-old-final',sent:true};f.row.orderRefHash='a'.repeat(64);
 const r=await runDesktopSession({api:f.api,tabId:7,store:f.store,mode:'reconcile'});assert.equal(r.realOrderVerified,false);assert.equal(f.counts.navigations,0);
});
