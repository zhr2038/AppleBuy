// Codex reproduction of actual C075 findings. All API, receipts, state, browser and authority FAKE.
import test from 'node:test';import assert from 'node:assert/strict';
import {PurchaseJob,TASK_KEY,createPurchaseRecord} from '../web/checkout-connector/job.js';import {ChromePort} from '../web/checkout-connector/chrome-port.js';
import {restartExpiredPreFinal} from '../web/checkout-connector/pre-final-restart.js';
import {runDesktopSession,PRO_PLAN,proDigest} from '../src/desktop/browser-session.mjs';
const TERM='https://www.apple.com.cn/shop/open/salespolicies';
const slot={date:'October 6',start:'21:15',end:'21:30',verified:true};
const purchase={...PRO_PLAN.product,quantity:1,totalCny:9999,itemVerified:true,verified:true,fulfillment:'pickup',store:PRO_PLAN.stores[0],storeVerified:true};
const base=()=>createPurchaseRecord(PRO_PLAN,{taskId:'FAKE-task',planDigest:proDigest,tabId:7,now:Date.now(),id:()=> 'FAKE'});
function storeOf(row){const h={row:structuredClone(row),writes:0};return {h,store:{async get(){return structuredClone(h.row);},async put(k,v){assert.equal(k,TASK_KEY);h.row=structuredClone(v);h.writes++;},async acquireOwner(){return {owned:true,release:async()=>{}};}}};}
test('C076 F1 rebound unknown final cannot adopt or navigate another matching receipt',async()=>{
 const w=storeOf({...base(),reconcileOnly:true,lastRead:1,acceptedSlot:slot,initialDates:['October 6'],pending:{action:'submitOrder',id:'FAKE-final',documentId:'FAKE-original-review',beforePhase:'REVIEW',deadline:0},finalIntent:{id:'FAKE-final',sent:true},orderRefHash:null});let navigations=0,detail=false;
 const api={tabs:{async get(){return {url:detail?'https://www.apple.com.cn/shop/order/detail/FAKE/FAKE':'https://www.apple.com.cn/shop/checkout'};},async update(){navigations++;detail=true;}},permissions:{async contains(){return true;}},scripting:{async executeScript(){return [{frameId:0,documentId:detail?'FAKE-other-detail':'FAKE-other-receipt',result:{schema:'applebuy-merchant-read/v1',phase:detail?'ORDER_DETAIL':'ORDER_RECEIPT',verifiedStep:true,purchase,slotSummary:slot,receiptVerified:true,orderRefHash:'a'.repeat(64),orderDetailLink:'https://www.apple.com.cn/shop/order/detail/FAKE/FAKE'}}];}}};
 const port=new ChromePort(api,7,{authorized:false,acceptedSlot:slot,initialSequence:1}),r=await new PurchaseJob({store:w.store,port}).run(PRO_PLAN,{tabId:7,planDigest:proDigest});
 assert.equal(r.state,'NEEDS_VERIFICATION');assert.equal(r.orderRefHash,null);assert.equal(navigations,0);assert.equal(r.pending.action,'submitOrder');
});
test('C076 F1 unauthorized lookup never navigates a receipt detail',async()=>{
 let navigations=0;const api={tabs:{async get(){return {url:'https://www.apple.com.cn/shop/checkout'};},async update(){navigations++;}},permissions:{async contains(){return true;}},scripting:{async executeScript(){return [{frameId:0,documentId:'FAKE',result:{schema:'applebuy-merchant-read/v1',phase:'ORDER_RECEIPT',receiptVerified:true,orderRefHash:'a'.repeat(64),orderDetailLink:'https://www.apple.com.cn/shop/order/detail/FAKE/FAKE'}}];}}};
 const r=await new ChromePort(api,7,{authorized:false}).lookupOrder(PRO_PLAN,'a'.repeat(64));assert.equal(r.independent,false);assert.equal(navigations,0);
});
test('C076 F2 exported expired slot task cannot spawn another extension buyer',async()=>{
 const w=storeOf({...base(),state:'NEEDS_VERIFICATION',expiresAt:0,tabId:99,reconcileOnly:true,acceptedSlot:null,pending:{id:'FAKE-slot',action:'chooseSlot',documentId:'FAKE-old',beforePhase:'SLOTS',deadline:0,date:'October 6',start:'21:15',end:'21:30'},desktopHandoff:{schema:'applebuy-desktop-handoff/v1'},retiredHistory:[]});let reads=0;
 const before=structuredClone(w.h.row),r=await restartExpiredPreFinal({store:w.store,api:{tabs:{async query(){return [{id:7,url:'https://www.apple.com.cn/shop/bag'}];}}},port:{async observe(){reads++;return {schema:'applebuy-merchant-read/v1',phase:'EMPTY_BAG',path:'/shop/bag',documentId:'FAKE-empty',seq:1,verifiedStep:true};}},plan:PRO_PLAN,planDigest:proDigest,tabId:7,enabled:true,dateWindowConfirmed:true});
 assert.equal(r.created,false);assert.equal(reads,0);assert.equal(w.h.writes,0);assert.deepEqual(w.h.row,before);
});
test('C076 F3 changed reviewed document cannot consume the old desktop final consent',async()=>{
 const w=storeOf({...base(),desktopContext:'FAKE-owned',state:'NEEDS_USER',lastPhase:'REVIEW',lastRead:1,lastDocumentId:'FAKE-reviewed',entryDocumentId:'FAKE-entry',acceptedSlot:slot,initialDates:['October 6']});let submits=0;
 const api={sessionId:'FAKE-owned',tabs:{async get(){return {url:'https://www.apple.com.cn/shop/checkout'};}},permissions:{async contains(){return true;}},scripting:{async executeScript(q){if(q.args?.[1]){assert.equal(q.args[1].action,'submitOrder');submits++;return [{documentId:q.target.documentIds[0],result:{delivered:true}}];}return [{frameId:0,documentId:'FAKE-replacement-review',result:{schema:'applebuy-merchant-read/v1',phase:submits?'UNKNOWN':'REVIEW',verifiedStep:true,purchase,slotSummary:slot,termsLinks:[TERM],paymentMethod:'支付宝',extras:false}}];}}};
 const r=await runDesktopSession({api,tabId:7,store:w.store,mode:'purchase',authority:{checkoutApproved:true,legacyOwnershipRevoked:true,newContextConfirmed:true,planDigest:proDigest,finalConsent:{taskId:w.h.row.taskId,documentId:'FAKE-reviewed',acceptedAt:Date.now(),termsAccepted:true,noExtras:true,existingOrdersChecked:true,termsUrl:TERM}}});
 assert.equal(submits,0);assert.equal(r.realOrderVerified,false);assert.equal(w.h.row.finalIntent,null);
});
