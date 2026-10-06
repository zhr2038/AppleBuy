// Production Runtime/Job/ChromePort/named-RPC peer. Chrome/merchant/authority/data remain FAKE; no installation or website.
import test from 'node:test';import assert from 'node:assert/strict';
import {NativeCheckoutApi} from '../src/desktop/native-checkout-api.mjs';
import {CheckoutRpcPeer} from '../web/checkout-connector/checkout-rpc-peer.js';
import {CHECKOUT_RPC,BAG,CHECKOUT_PLAN} from '../web/checkout-connector/checkout-rpc-contract.js';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
import {DesktopCheckoutRuntime} from '../src/desktop/checkout-runtime.mjs';
import {PRO_PLAN,proDigest} from '../src/desktop/browser-session.mjs';
import {createPurchaseRecord,TASK_KEY} from '../web/checkout-connector/job.js';
const TERMS='https://www.apple.com.cn/shop/open/salespolicies',CONTEXT='FAKE-C121-native-session';
import {world} from './fixtures/c121-native-world.mjs';

test('C121 named native path runs empty bag to review, explicit refusal/latest末档 reselect and one FAKE unpaid detail',async()=>{
 const {w,runtime}=world({refuse:true});await runtime.open();const ready=await runtime.advance({checkoutApproved:true,newContextConfirmed:true});assert.equal(ready.phase,'REVIEW',JSON.stringify({ready,commands:w.commands,pending:w.row.pending,refusals:w.row.refusals}));assert.equal(w.commands.filter(x=>x==='addBag').length,1);assert.equal(w.commands.filter(x=>x==='chooseSlot').length,2);assert.equal(w.slot.start,'21:30');assert.equal(w.slot.date,'2099年1月2日');assert.equal(w.row.refusals,1);assert.equal(w.commands.includes('submitOrder'),false);
 const unpaid=await runtime.submit({termsAccepted:true,existingOrdersChecked:true,noExtras:true});assert.equal(unpaid.state,'CONFIRMED_UNPAID',JSON.stringify({unpaid,commands:w.commands,pending:w.row.pending,slot:w.slot}));assert.equal(w.commands.filter(x=>x==='submitOrder').length,1);await assert.rejects(runtime.submit({termsAccepted:true,existingOrdersChecked:true,noExtras:true}));await runtime.close();assert.equal(w.tabs.size,0);assert.equal(w.releases,1);
});
test('C121 AUTH waits for human completion then resumes one checkout; no authentication values or repeated Add',async()=>{
 const {w,runtime}=world({requireAuth:true});await runtime.open();const auth=await runtime.advance({checkoutApproved:true,newContextConfirmed:true});assert.equal(auth.phase,'AUTH');assert.equal(w.commands.filter(x=>x==='checkout').length,1);
 w.phase='FULFILLMENT';const tab=w.tabs.get(w.mainId);tab.url='https://secure8.www.apple.com.cn/shop/checkout';tab.version++;
 const ready=await runtime.advance({checkoutApproved:true,newContextConfirmed:true});assert.equal(ready.phase,'REVIEW');assert.equal(w.commands.filter(x=>x==='checkout').length,1);assert.equal(w.commands.filter(x=>x==='addBag').length,1);assert.equal(w.commands.includes('submitOrder'),false);await runtime.close();
});
test('C121 existing readonly source and unknown Add survive the new transport; zero buying',async()=>{
 const {w,runtime}=world();w.row={...w.row,state:'NEEDS_VERIFICATION',reconcileOnly:true,pending:{action:'addBag',id:'FAKE-old-add',documentId:'FAKE-old',deadline:0},bagAddStarted:true,resourceWritten:true};const before=structuredClone(w.row);
 await runtime.open();await assert.rejects(runtime.advance({checkoutApproved:true,newContextConfirmed:true}));assert.equal(w.writes,0);assert.deepEqual(w.row,before);assert.deepEqual(w.commands,[]);await runtime.close();
});
test('C121 observe-mode peer cannot gain purchase rights from an authorised command or a caller plan',async()=>{
 const {w,api,runtime}=world({purchaseAllowed:false});await runtime.open();const command={action:'checkout',id:'FAKE-operation',documentId:'FAKE-doc-1-1',authorized:true,structured:true,expected:JSON.stringify(w),plan:PRO_PLAN};await assert.rejects(api.scripting.executeScript({func:merchantDocument,world:'ISOLATED',target:{tabId:1,documentIds:['FAKE-doc-1-1']},args:[PRO_PLAN,command]}));assert.deepEqual(w.commands,[]);await runtime.close();
});
test('C121 no arbitrary JS, personal tab, nonofficial URL, wrong plan or request replay crosses the boundary',async()=>{
 const f=world();const tab=await f.api.create(BAG);await assert.rejects(f.api.scripting.executeScript({func:()=>document.cookie,world:'ISOLATED',target:{tabId:tab.id},args:[PRO_PLAN]}),/ProgramNotAllowed/);await assert.rejects(f.api.tabs.get(999));await assert.rejects(f.api.tabs.create({url:'https://FAKE.invalid/'}));
 for(const change of [{quantity:2},{maxTotalCny:10000},{extras:{tradeIn:'none',appleCare:'added'}}])await assert.rejects(f.api.scripting.executeScript({func:merchantDocument,world:'ISOLATED',target:{tabId:tab.id,frameIds:[0]},args:[{...PRO_PLAN,...change}]}));
 const q={schema:CHECKOUT_RPC,kind:'request',contextId:CONTEXT,id:'FAKE-duplicate-request',operation:'getTab',payload:{tabId:tab.id}};assert.equal((await f.peer.receive(q)).ok,true);assert.equal((await f.peer.receive(q)).ok,false);assert.deepEqual(f.w.commands,[]);await f.api.close();
});
test('C121 transport timeout is unknown and poisons the channel; neither another action nor false cleanup',async()=>{
 let frames=0;const api=new NativeCheckoutApi({contextId:CONTEXT,timeoutMs:5,exchange:()=>{frames++;return new Promise(()=>{});}});await assert.rejects(api.create(BAG),/DeliveryUnknown/);await assert.rejects(api.create(BAG),/AlreadyRunning/);await assert.rejects(api.close(),/AlreadyRunning/);assert.equal(frames,1);assert.equal(api.closed,false);
});
test('C121 a delivered final with lost reply is never submitted again and the same context reconciles its FAKE detail',async()=>{
 const {w,api,runtime}=world();await runtime.open();await runtime.advance({checkoutApproved:true,newContextConfirmed:true});const original=api.exchange;let lost=false;
 api.exchange=async q=>{const result=await original(q);if(!lost&&q.operation==='merchantDocument'&&q.payload.command?.action==='submitOrder'){lost=true;throw Error('FAKE delivered final reply lost');}return result;};
 await assert.rejects(runtime.submit({termsAccepted:true,existingOrdersChecked:true,noExtras:true}),/FinalConsent/);assert.equal(w.row.finalIntent.sent,true);assert.equal(w.row.pending.action,'submitOrder');assert.equal(w.commands.filter(x=>x==='submitOrder').length,1);
 const result=await runtime.advance({checkoutApproved:true,newContextConfirmed:true});assert.equal(result.state,'CONFIRMED_UNPAID');assert.equal(w.commands.filter(x=>x==='submitOrder').length,1);await runtime.close();
});
test('C121 pause drains a sent FAKE checkout and resume does not send it again',async()=>{
 const {w,chrome,runtime}=world(),execute=chrome.scripting.executeScript;let release,entered;const held=new Promise(r=>release=r),reached=new Promise(r=>entered=r);
 chrome.scripting.executeScript=async q=>{const result=await execute(q);if(q.args[1]?.action==='checkout'){entered();await held;}return result;};
 await runtime.open();const running=runtime.advance({checkoutApproved:true,newContextConfirmed:true});await reached;const pausing=runtime.pause();release();const stopped=await running;await pausing;assert.equal(stopped.state,'PAUSED');assert.equal(w.row.pending.action,'checkout');assert.equal(w.commands.includes('selectPickup'),false);
 const ready=await runtime.resume({checkoutApproved:true,newContextConfirmed:true});assert.equal(ready.phase,'REVIEW');assert.equal(w.commands.filter(x=>x==='checkout').length,1);await runtime.close();
});
test('C121 same action id cannot be delivered again under a fresh RPC id',async()=>{
 const {w,api}=world();const tab=await api.create(BAG);w.phase='BAG';const rows=await api.scripting.executeScript({func:merchantDocument,world:'ISOLATED',target:{tabId:tab.id,frameIds:[0]},args:[PRO_PLAN]});
 const command={action:'checkout',id:'FAKE-once-action',taskId:'FAKE-task-once',documentId:rows[0].documentId,authorized:true,structured:true,expected:JSON.stringify(rows[0].result),plan:PRO_PLAN};const request={func:merchantDocument,world:'ISOLATED',target:{tabId:tab.id,documentIds:[rows[0].documentId]},args:[PRO_PLAN,command]};await api.scripting.executeScript(request);await assert.rejects(api.scripting.executeScript(request));assert.equal(w.commands.filter(x=>x==='checkout').length,1);await api.close();
});
test('C121 one native context cannot switch to a second purchase task or a second action tab',async()=>{
 const f=world(),one=await f.api.create(BAG),two=await f.api.tabs.create({url:BAG});f.w.phase='BAG';
 const read=id=>f.api.scripting.executeScript({func:merchantDocument,world:'ISOLATED',target:{tabId:id,frameIds:[0]},args:[PRO_PLAN]});
 const rows=await read(one.id),base={action:'checkout',id:'FAKE-bind-action',taskId:'FAKE-bound-task',documentId:rows[0].documentId,authorized:true,structured:true,expected:JSON.stringify(rows[0].result),plan:PRO_PLAN};
 const act=(id,c)=>f.api.scripting.executeScript({func:merchantDocument,world:'ISOLATED',target:{tabId:id,documentIds:[c.documentId]},args:[PRO_PLAN,c]});await act(one.id,base);
 const again=await read(one.id);await assert.rejects(act(one.id,{...base,id:'FAKE-other-task-action',taskId:'FAKE-other-task',documentId:again[0].documentId,expected:JSON.stringify(again[0].result)}));
 const side=await read(two.id);await assert.rejects(act(two.id,{...base,id:'FAKE-other-tab-action',documentId:side[0].documentId,expected:JSON.stringify(side[0].result)}));assert.equal(f.w.commands.filter(x=>x==='checkout').length,1);await f.api.close();
});
test('C121 response identity mismatch and nested private result fields cannot become a current page',async()=>{
 const f=world(),tab=await f.api.create(BAG),execute=f.chrome.scripting.executeScript;
 f.chrome.scripting.executeScript=async q=>{const rows=await execute(q);rows[0].result.purchase.email='FAKE-private';return rows;};await assert.rejects(f.api.scripting.executeScript({func:merchantDocument,world:'ISOLATED',target:{tabId:tab.id,frameIds:[0]},args:[PRO_PLAN]}));await f.api.close();
 let calls=0;const api=new NativeCheckoutApi({contextId:CONTEXT,exchange:async q=>{calls++;return {schema:CHECKOUT_RPC,kind:'reply',contextId:CONTEXT,id:'FAKE-stale-id',ok:true,result:{}};}});await assert.rejects(api.create(BAG));await assert.rejects(api.create(BAG));assert.equal(calls,1);
});
