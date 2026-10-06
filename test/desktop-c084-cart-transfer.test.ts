// Production ownership transfer/controller with FAKE browser, plan, merchant replies and approvals. No personal state.
import test from 'node:test';import assert from 'node:assert/strict';
import {PRO_PLAN,proDigest,runDesktopSession} from '../src/desktop/browser-session.mjs';
import {transferExistingCart} from '../src/desktop/cart-transfer.mjs';
import {createPurchaseRecord,TASK_KEY,PurchaseJob} from '../web/checkout-connector/job.js';
import {DesktopCheckoutRuntime} from '../src/desktop/checkout-runtime.mjs';
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
for(const stage of ['AUTH','REVIEW','UNKNOWN_FINAL'])test('C086 a restarted transferred task remains readonly reconcilable at '+stage,async()=>{
 const {w,store,api}=world();await transferExistingCart({store,api,tabId:7,approved:true,newContextConfirmed:true});
 w.row.lastPhase=stage==='UNKNOWN_FINAL'?'UNKNOWN':stage;
 w.row.pending=stage==='AUTH'?{action:'checkout',id:'FAKE-checkout',documentId:'FAKE-old',deadline:0}:stage==='UNKNOWN_FINAL'?{action:'submitOrder',id:'FAKE-final',documentId:'FAKE-old',deadline:0}:null;
 if(stage==='UNKNOWN_FINAL')w.row.finalIntent={sent:true,id:'FAKE-final'};
 const restarted={...api,sessionId:'FAKE-restarted'};const before=structuredClone(w.row);await assert.rejects(runDesktopSession({store,api:restarted,tabId:7,mode:'purchase',authority:{checkoutApproved:true,newContextConfirmed:true,legacyOwnershipRevoked:true,planDigest:proDigest}}));
 const r=await runDesktopSession({store,api:restarted,tabId:7,mode:'reconcile'});assert.equal(r.realOrderVerified,false);assert.equal(w.row.reconcileOnly,true);assert.deepEqual(w.commands,[]);assert.deepEqual(w.row.desktopTransfer.originalTask,before.desktopTransfer.originalTask);if(stage==='UNKNOWN_FINAL')assert.equal(w.row.finalIntent.sent,true);
});
test('C086 an unexpired old slot window cannot be transferred, zero writes',async()=>{
 const {w,store,api}=world();w.row.pending={action:'chooseSlot',id:'FAKE-live-slot',beforePhase:'SLOTS',documentId:'FAKE-slots',deadline:Date.now()+30000};w.row.expiresAt=Date.now()+60000;w.row.desktopHandoff.originalSnapshot=structuredClone({...w.row,desktopHandoff:undefined});const before=structuredClone(w.row);
 await assert.rejects(transferExistingCart({store,api,tabId:7,approved:true,newContextConfirmed:true}),/OldSlotWindow/);assert.equal(w.writes,0);assert.deepEqual(w.row,before);assert.deepEqual(w.commands,[]);
});
test('C086 close drains a transfer write before releasing ownership; no checkout after pause',async()=>{
 const {w,store,api}=world();let release,entered;const held=new Promise(r=>release=r),writing=new Promise(r=>entered=r),events=[];const put=store.put;
 store.put=async(k,v)=>{events.push('write-start');entered();await held;await put(k,v);events.push('write-end');};
 store.acquireOwner=async()=>({owned:true,release:async()=>events.push('lease-release')});api.create=async()=>({id:7});
 const runtime=new DesktopCheckoutRuntime({store,launch:async()=>({api,close:async()=>events.push('browser-close')})});await runtime.open();
 const transferring=runtime.transfer({approved:true,newContextConfirmed:true});const failure=assert.rejects(transferring,/AlreadyRunning/);await writing;
 await assert.rejects(runtime.transfer({approved:true,newContextConfirmed:true}),/AlreadyRunning/);
 const closing=runtime.close();await Promise.resolve();assert.deepEqual(events,['write-start']);release();await failure;await closing;
 assert.deepEqual(events,['write-start','write-end','browser-close','lease-release']);assert.equal(w.writes,1);assert.deepEqual(w.commands,[]);assert.equal(runtime.cleanupConfirmed,true);
});
test('C086 close cancels a transfer before the local write and keeps the full unknown record',async()=>{
 const {w,store,api}=world(),before=structuredClone(w.row),execute=api.scripting.executeScript;let release,entered;const held=new Promise(r=>release=r),reading=new Promise(r=>entered=r);let reads=0,releases=0;
 api.scripting.executeScript=async q=>{if(++reads===3){entered();await held;}return execute(q);};api.create=async()=>({id:7});store.acquireOwner=async()=>({owned:true,release:async()=>releases++});
 const runtime=new DesktopCheckoutRuntime({store,launch:async()=>({api,close:async()=>{}})});await runtime.open();const transferring=runtime.transfer({approved:true,newContextConfirmed:true});const failure=assert.rejects(transferring,/Cancelled/);await reading;const closing=runtime.close();release();await failure;await closing;
 assert.equal(w.writes,0);assert.deepEqual(w.row,before);assert.deepEqual(w.commands,[]);assert.equal(releases,1);
});
for(const scenario of ['changed-bag','changed-record','wrong-product','unknown-extras'])test('C086 transfer refuses '+scenario+' without a write or merchant action',async()=>{
 const {w,store,api}=world(),execute=api.scripting.executeScript;let reads=0;
 api.scripting.executeScript=async q=>{reads++;if(scenario==='changed-bag'&&reads===2)w.total=9998;const result=await execute(q);if(scenario==='changed-record'&&reads===2)w.row.lastPhase='AUTH';if(scenario==='wrong-product')result[0].result.purchase.color='星光白色';if(scenario==='unknown-extras')result[0].result.extras=null;return result;};
 await assert.rejects(transferExistingCart({store,api,tabId:7,approved:true,newContextConfirmed:true}));assert.equal(w.writes,0);assert.deepEqual(w.commands,[]);
});
test('C086 runtime transfer reaches review and resumes the same authenticated checkout, zero Add',async()=>{
 const {w,store,api}=world();w.requireAuth=true;api.create=async()=>({id:7});const runtime=new DesktopCheckoutRuntime({store,launch:async()=>({api,close:async()=>{}})});await runtime.open();
 const first=await runtime.transfer({approved:true,newContextConfirmed:true});assert.equal(first.phase,'AUTH');w.phase='FULFILLMENT';const ready=await runtime.advance({checkoutApproved:true,newContextConfirmed:true});assert.equal(ready.phase,'REVIEW');assert.equal(w.commands.filter(x=>x==='checkout').length,1);assert.equal(w.commands.includes('addBag'),false);assert.equal(w.commands.includes('submitOrder'),false);await runtime.close();
});
test('C088 same-context reconcile cannot downgrade the live transferred buyer',async()=>{
 const {w,store,api}=world();await transferExistingCart({store,api,tabId:7,approved:true,newContextConfirmed:true});const before=structuredClone(w.row),writes=w.writes;
 await assert.rejects(runDesktopSession({store,api,tabId:7,mode:'reconcile'}),/ReadonlyHandoffRequired/);
 assert.deepEqual(w.row,before);assert.equal(w.writes,writes);assert.deepEqual(w.commands,[]);
});
test('C096 confirmed local transfer reports nonreadonly ownership before a first-step failure',async()=>{
 const {w,store,api}=world(),events=[];api.create=async()=>({id:7});const runtime=new DesktopCheckoutRuntime({store,onState:s=>events.push(s),launch:async()=>({api,close:async()=>{}})});await runtime.open();runtime.advance=async()=>{throw Error('FAKE first step failure');};
 await assert.rejects(runtime.transfer({approved:true,newContextConfirmed:true}),/first step failure/);assert.equal(w.writes,1);assert.equal(w.row.desktopContext,api.sessionId);assert.deepEqual(w.commands,[]);assert.equal(events.some(s=>s.readOnly===false),true);await runtime.close();
});
