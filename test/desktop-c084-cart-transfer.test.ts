// Production ownership transfer/controller with FAKE browser, plan, merchant replies and approvals. No personal state.
import test from 'node:test';import assert from 'node:assert/strict';
import {PRO_PLAN,proDigest,runDesktopSession} from '../src/desktop/browser-session.mjs';
import {transferExistingCart} from '../src/desktop/cart-transfer.mjs';
import {createPurchaseRecord,TASK_KEY,PurchaseJob} from '../web/checkout-connector/job.js';
const TERMS='https://www.apple.com.cn/shop/open/salespolicies';
function world({phase='BAG',quantity=1,total=9999,final=false}={}){
 const original={...createPurchaseRecord(PRO_PLAN,{taskId:'FAKE-legacy',planDigest:proDigest,tabId:99,now:0,id:()=> 'FAKE'}),state:'NEEDS_VERIFICATION',bagAddStarted:true,resourceWritten:true,pending:{action:'addBag',id:'FAKE-unknown',documentId:'FAKE-original',beforePhase:'VARIANT',deadline:0},retiredHistory:[]};
 if(final)original.retiredHistory.push({...original,state:'RETIRED',pending:{action:'submitOrder'},finalIntent:{sent:true}});
 const w={phase,quantity,total,row:{...structuredClone(original),reconcileOnly:true,desktopHandoff:{schema:'applebuy-desktop-handoff/v1',id:'FAKE-handoff',originalSnapshot:structuredClone(original)}},writes:0,commands:[],slot:null,payment:null,ref:null,detail:false};
 const store={async get(){return structuredClone(w.row);},async put(k,v){assert.equal(k,TASK_KEY);w.writes++;w.row=structuredClone(v);},async acquireOwner(){return {owned:true,release:async()=>{}};}};
 const purchase=()=>({...PRO_PLAN.product,quantity:w.quantity,totalCny:w.total,verified:true,itemVerified:true,fulfillment:'pickup',store:PRO_PLAN.stores[0],storeVerified:true});
 const api={sessionId:'FAKE-owned-desktop',tabs:{async get(){return {id:7,url:w.detail?'https://www.apple.com.cn/shop/order/detail/FAKE/FAKE':'https://www.apple.com.cn/shop/bag'};},async update(){w.detail=true;}},permissions:{async contains(){return true;}},scripting:{async executeScript(q){const c=q.args?.[1];if(c){w.commands.push(c.action);if(c.action==='checkout')w.phase=w.requireAuth?'AUTH':'FULFILLMENT';else if(c.action==='selectPickup')w.phase='SLOTS';else if(c.action==='chooseSlot'){w.slot={date:c.date,start:c.start,end:c.end,verified:true};w.phase='DETAILS';}else if(c.action==='fillDetails')w.phase='PAYMENT';else if(c.action==='selectPayment')w.payment='支付宝';else if(c.action==='continuePayment')w.phase='REVIEW';else if(c.action==='submitOrder'){w.ref='d'.repeat(64);w.phase='ORDER_RECEIPT';}else throw Error('No Add/configuration allowed');return [{frameId:0,documentId:q.target.documentIds[0],result:{delivered:true}}];}
 const phase=w.detail?'ORDER_DETAIL':w.phase,p=purchase(),r={schema:'applebuy-merchant-read/v1',phase,path:phase==='BAG'||phase==='EMPTY_BAG'?'/shop/bag':'/shop/checkout',verifiedStep:true,purchase:p,extras:false,slotSummary:w.slot,acceptedSlot:w.slot,paymentMethod:w.payment,termsLinks:[TERMS],receiptVerified:!!w.ref,orderRefHash:w.ref,orderDetailLink:w.ref?'https://www.apple.com.cn/shop/order/detail/FAKE/FAKE':null};
 if(phase==='FULFILLMENT'){p.fulfillment=null;r.fulfillmentChoice='unselected';}if(phase==='SLOTS'){r.listComplete=true;r.dates=[{label:'October 6',ref:'date:0',selected:true,enabled:true}];r.selectedDate='October 6';r.times=[{start:'21:15',end:'21:30',ref:'slot:46',enabled:true}];}return [{frameId:0,documentId:w.detail?'FAKE-detail':'FAKE-current',result:r}];}}};return {w,store,api};
}
test('C084 actual handoff-shaped task can explicitly adopt a current singleton then one FAKE unpaid order, zero Add',async()=>{
 const {w,store,api}=world(),before=structuredClone(w.row);
 await transferExistingCart({store,api,tabId:7,approved:true,newContextConfirmed:true});assert.deepEqual(w.row.desktopTransfer.originalTask,before);assert.deepEqual(w.row.retiredHistory[0].desktopTransferArchive.originalSnapshot,before);
 const a={checkoutApproved:true,newContextConfirmed:true,legacyOwnershipRevoked:true,planDigest:proDigest};const ready=await runDesktopSession({store,api,tabId:7,mode:'purchase',authority:a});assert.equal(ready.phase,'REVIEW');assert.equal(w.commands.includes('addBag'),false);assert.equal(w.commands.includes('submitOrder'),false);
 const r=await runDesktopSession({store,api,tabId:7,mode:'purchase',authority:{...a,finalConsent:{taskId:w.row.taskId,documentId:w.row.lastDocumentId,termsUrl:TERMS,termsAccepted:true,existingOrdersChecked:true,noExtras:true,acceptedAt:Date.now()}}});assert.equal(r.state,'CONFIRMED_UNPAID');assert.equal(w.commands.filter(x=>x==='submitOrder').length,1);assert.equal(w.commands.filter(x=>x==='checkout').length,1);assert.equal(w.commands.includes('addBag'),false);
});
for(const opts of [{phase:'EMPTY_BAG'},{quantity:2},{total:10000},{final:true}])test('C084 wrong/empty/final-bearing handoff cannot become buyer '+JSON.stringify(opts),async()=>{
 const {w,store,api}=world(opts),before=structuredClone(w.row);await assert.rejects(transferExistingCart({store,api,tabId:7,approved:true,newContextConfirmed:true}));assert.deepEqual(w.row,before);assert.equal(w.writes,0);assert.deepEqual(w.commands,[]);
});
test('C084 no explicit renewed approval means zero transfer; original source remains unable to buy after transfer',async()=>{
 const {w,store,api}=world();await assert.rejects(transferExistingCart({store,api,tabId:7,approved:false,newContextConfirmed:true}));assert.equal(w.writes,0);await transferExistingCart({store,api,tabId:7,approved:true,newContextConfirmed:true});
 await assert.rejects(new PurchaseJob({store,port:{async observe(){throw Error('Source must not read');}}}).run(PRO_PLAN,{tabId:7,planDigest:proDigest}),/RevokedSource/);assert.deepEqual(w.commands,[]);
});
test('C084 transferred cart becoming empty never opens product or adds another unit',async()=>{
 const {w,store,api}=world();await transferExistingCart({store,api,tabId:7,approved:true,newContextConfirmed:true});w.phase='EMPTY_BAG';
 const r=await runDesktopSession({store,api,tabId:7,mode:'purchase',authority:{checkoutApproved:true,newContextConfirmed:true,legacyOwnershipRevoked:true,planDigest:proDigest}});assert.equal(r.realOrderVerified,false);assert.deepEqual(w.commands,[]);
});
test('C084 altered retained archive or another context cannot reuse a transfer proof',async()=>{
 const {w,store,api}=world();await transferExistingCart({store,api,tabId:7,approved:true,newContextConfirmed:true});w.row.retiredHistory[0].desktopTransferArchive.originalSnapshot.finalIntent={sent:true};
 await assert.rejects(runDesktopSession({store,api,tabId:7,mode:'purchase',authority:{checkoutApproved:true,newContextConfirmed:true,legacyOwnershipRevoked:true,planDigest:proDigest}}),/RevokedSource/);assert.deepEqual(w.commands,[]);
});
test('C084 a transferred buyer resumes its one pending checkout after authentication, with zero extra Add/checkout',async()=>{
 const {w,store,api}=world();w.requireAuth=true;await transferExistingCart({store,api,tabId:7,approved:true,newContextConfirmed:true});const authority={checkoutApproved:true,newContextConfirmed:true,legacyOwnershipRevoked:true,planDigest:proDigest};
 const first=await runDesktopSession({store,api,tabId:7,mode:'purchase',authority});assert.equal(first.phase,'AUTH');w.phase='FULFILLMENT';const ready=await runDesktopSession({store,api,tabId:7,mode:'purchase',authority});assert.equal(ready.phase,'REVIEW');assert.equal(w.commands.filter(x=>x==='checkout').length,1);assert.equal(w.commands.includes('addBag'),false);
});
