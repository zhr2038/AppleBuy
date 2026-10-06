// Full desktop entry/controller/transport. Browser, DOM responses, merchant effects and authority are all FAKE.
import test from 'node:test';import assert from 'node:assert/strict';
import {DesktopCheckoutRuntime} from '../src/desktop/checkout-runtime.mjs';import {DesktopBrowserApi} from '../src/desktop/browser-api.mjs';
import {PRO_PLAN,proDigest} from '../src/desktop/browser-session.mjs';import {TASK_KEY,createPurchaseRecord} from '../web/checkout-connector/job.js';
import {AuthContinuation} from '../src/desktop/auth-continuation.mjs';
import {acquireDesktopOwner} from '../src/desktop/owner-lease.mjs';
import {spawn} from 'node:child_process';import {mkdir} from 'node:fs/promises';import {resolve,join} from 'node:path';import {randomUUID} from 'node:crypto';
const TERM='https://www.apple.com.cn/shop/open/salespolicies';
function world(){
 const w={phase:'EMPTY_BAG',pages:[],commands:[],ref:null,slot:null,payment:null,launches:0,closes:0,releases:0,writes:0,row:{...createPurchaseRecord(PRO_PLAN,{taskId:'FAKE-retired',planDigest:proDigest,tabId:999,now:Date.now(),id:()=> 'FAKE'}),state:'RETIRED'}};
 class Page{closed=false;uri='';events=[];on(n,f){if(n==='domcontentloaded')this.events.push(f);}url(){return this.uri;}isClosed(){return this.closed;}async waitForSelector(){}async close(){this.closed=true;}
  async goto(url){this.uri=url;if(this===w.pages[0]&&url.includes('/buy-iphone/'))w.phase='VARIANT';for(const f of this.events)f();}
  async evaluate(fn,p){const c=p.args?.[1];if(c){w.commands.push(c.action);if(w.blockAction===c.action){w.entered();await w.blocked;}if(c.action==='addBag')w.phase='BAG';else if(c.action==='checkout')w.phase=w.requireAuth?'AUTH':'FULFILLMENT';else if(c.action==='selectPickup')w.phase='SLOTS';else if(c.action==='chooseSlot'){w.slot={date:c.date,start:c.start,end:c.end,verified:true};w.phase='DETAILS';}else if(c.action==='fillDetails')w.phase='PAYMENT';else if(c.action==='selectPayment')w.payment='支付宝';else if(c.action==='continuePayment')w.phase='REVIEW';else if(c.action==='submitOrder'){w.ref='c'.repeat(64);w.phase='ORDER_RECEIPT';}return {delivered:true};}
   const side=this!==w.pages[0],detail=this.uri.includes('/order/detail/'),phase=side?'EMPTY_BAG':detail?'ORDER_DETAIL':w.phase;
   const purchase={...PRO_PLAN.product,quantity:1,totalCny:9999,verified:true,itemVerified:true,fulfillment:'pickup',store:PRO_PLAN.stores[0],storeVerified:true};
   const r={schema:'applebuy-merchant-read/v1',phase,path:side||phase==='EMPTY_BAG'||phase==='BAG'?'/shop/bag':phase==='VARIANT'?'/shop/buy-iphone/iphone-18-pro/mjt74ch/a':detail?'/shop/order/detail/FAKE/FAKE':'/shop/checkout',verifiedStep:true,purchase,extras:false,variantVerified:true,quotedCny:9999,nextChoice:null,acceptedSlot:w.slot,slotSummary:w.slot,paymentMethod:w.payment,termsLinks:[TERM],receiptVerified:!!w.ref,orderRefHash:w.ref,orderDetailLink:w.ref?'https://www.apple.com.cn/shop/order/detail/FAKE/FAKE':null};
   if(phase==='FULFILLMENT'){r.purchase.fulfillment=null;r.fulfillmentChoice='unselected';}
   if(phase==='SLOTS'){r.listComplete=true;r.selectedDate='October 6';r.dates=[{label:'October 6',ref:'date:0',enabled:true,selected:true}];r.times=[{start:'09:00',end:'09:15',ref:'time:1',enabled:true},{start:'21:15',end:'21:30',ref:'time:46',enabled:true}];}
   return r;
  }
 }
 const context={async newPage(){const p=new Page();w.pages.push(p);return p;}};
 const store={async get(k){assert.equal(k,TASK_KEY);return w.row?structuredClone(w.row):null;},async put(k,row){assert.equal(k,TASK_KEY);w.row=structuredClone(row);w.writes++;},async acquireOwner(){return {owned:true,release:async()=>{w.releases++;}};}};
 const runtime=new DesktopCheckoutRuntime({store,launch:async()=>{w.launches++;const api=new DesktopBrowserApi(context,{publicOnly:false});return {api,close:async()=>{w.closes++;for(const p of w.pages)await p.close();}};}});
 return {w,runtime};
}
test('C078 desktop entry connects empty bag to REVIEW then exactly one independently verified FAKE unpaid order',async()=>{
 const {w,runtime}=world();await runtime.open();const a=await runtime.advance({checkoutApproved:true,newContextConfirmed:true});assert.equal(a.phase,'REVIEW');assert.equal(a.realOrderVerified,false);assert.equal(w.commands.filter(x=>x==='addBag').length,1);assert.equal(w.commands.includes('submitOrder'),false);
 await assert.rejects(runtime.submit({termsAccepted:false,existingOrdersChecked:true,noExtras:true}));
 const done=await runtime.submit({termsAccepted:true,existingOrdersChecked:true,noExtras:true});assert.equal(done.state,'CONFIRMED_UNPAID');assert.equal(w.commands.filter(x=>x==='submitOrder').length,1);assert.equal(w.slot.start,'21:15');
 await assert.rejects(runtime.submit({termsAccepted:true,existingOrdersChecked:true,noExtras:true}));assert.equal(w.commands.filter(x=>x==='submitOrder').length,1);await Promise.all([runtime.close(),runtime.close()]);assert.equal(w.launches,1);assert.equal(w.closes,1);assert.equal(w.releases,1);
});
test('C078 missing handoff stops before browser launch; duplicate open never launches a second context',async()=>{
 const a=world();a.w.row=null;await assert.rejects(a.runtime.open(),/HandoffRequired/);assert.equal(a.w.launches,0);
 const b=world();await b.runtime.open();await assert.rejects(b.runtime.open(),/AlreadyRunning/);assert.equal(b.w.launches,1);await b.runtime.close();
});
test('C078 carried unknown Add remains exact and readonly; no new buyer from a new context',async()=>{
 const {w,runtime}=world();w.row={...w.row,state:'NEEDS_VERIFICATION',reconcileOnly:true,pending:{action:'addBag',id:'FAKE-add',documentId:'FAKE-old',deadline:0},resourceWritten:true,bagAddStarted:true};const before=structuredClone(w.row);
 await runtime.open();await assert.rejects(runtime.advance({checkoutApproved:true,newContextConfirmed:true}),/ResultStillUnconfirmed/);assert.deepEqual(w.commands,[]);assert.equal(w.writes,0);assert.deepEqual(w.row,before);await runtime.close();
});
test('C078 replacing the current review document cannot consume old consent',async()=>{
 const {w,runtime}=world();await runtime.open();await runtime.advance({checkoutApproved:true,newContextConfirmed:true});await runtime.api.tabs.update(runtime.tabId,{url:'https://www.apple.com.cn/shop/checkout'});
 const r=await runtime.submit({termsAccepted:true,existingOrdersChecked:true,noExtras:true});assert.equal(r.realOrderVerified,false);assert.equal(w.commands.includes('submitOrder'),false);await runtime.close();
});
test('C078 pause in a sent checkout preserves pending truth, drains the run, then closes once',async()=>{
 const {w,runtime}=world();await runtime.open();let release,entered;w.blocked=new Promise(r=>release=r);const reached=new Promise(r=>entered=r);w.entered=entered;w.blockAction='checkout';
 const running=runtime.advance({checkoutApproved:true,newContextConfirmed:true});await reached;await assert.rejects(runtime.advance({checkoutApproved:true,newContextConfirmed:true}),/AlreadyRunning/);
 const closing=runtime.close();release();const r=await running;await closing;assert.equal(r.state,'PAUSED');assert.equal(w.row.pending.action,'checkout');assert.equal(w.commands.filter(x=>x==='checkout').length,1);assert.equal(w.commands.includes('selectPickup'),false);assert.equal(w.closes,1);assert.equal(w.releases,1);
});
test('C078 authentication completes then the programme resumes the same task without another checkout',async()=>{
 const {w,runtime}=world();w.requireAuth=true;await runtime.open();const auth=await runtime.advance({checkoutApproved:true,newContextConfirmed:true});assert.equal(auth.phase,'AUTH');assert.equal(w.row.pending.action,'checkout');let result;
 const watch=new AuthContinuation({observe:()=>runtime.observe(),setTimer:()=>1,clearTimer:()=>{}});watch.start(async()=>{result=await runtime.advance({checkoutApproved:true,newContextConfirmed:true});});await watch.tick();assert.equal(result,undefined);
 w.phase='FULFILLMENT';await runtime.api.tabs.update(runtime.tabId,{url:'https://secure8.www.apple.com.cn/shop/checkout'});await watch.tick();assert.equal(result.phase,'REVIEW');assert.equal(w.commands.filter(x=>x==='checkout').length,1);assert.equal(w.commands.filter(x=>x==='addBag').length,1);await watch.tick();assert.equal(w.commands.includes('submitOrder'),false);await runtime.close();
});
test('C093 actual lease holder loss pauses a sent FAKE checkout and prevents any later pickup action',async()=>{
 const {w,runtime}=world(),folder=resolve('.local/test-runs/c093-runtime-'+randomUUID());await mkdir(folder,{recursive:true});let holder,release,entered;
 runtime.store.acquireOwner=()=>acquireDesktopOwner(join(folder,'task.json.owner'),{spawnProcess:(...args)=>{holder=spawn(...args);return holder;}});
 await runtime.open();w.blocked=new Promise(r=>release=r);const reached=new Promise(r=>entered=r);w.entered=entered;w.blockAction='checkout';
 const running=runtime.advance({checkoutApproved:true,newContextConfirmed:true});await reached;const lost=new Promise(resolve=>runtime.lease.onLost(resolve));assert.equal(holder.kill(),true);await lost;release();
 const result=await running;await runtime.close();assert.equal(result.state,'PAUSED');assert.equal(w.row.pending.action,'checkout');assert.equal(w.commands.filter(x=>x==='checkout').length,1);assert.equal(w.commands.includes('selectPickup'),false);assert.equal(w.closes,1);assert.equal(runtime.cleanupConfirmed,true);
});
test('C097 pause retains context and ownership; REVIEW resumes with fresh consent and no second Add',async()=>{
 const {w,runtime}=world();await runtime.open();await runtime.advance({checkoutApproved:true,newContextConfirmed:true});const context=runtime.api.sessionId;
 await runtime.pause();assert.equal(runtime.api.sessionId,context);assert.equal(w.closes,0);assert.equal(w.releases,0);assert.equal(runtime.finalDescriptor,null);await assert.rejects(runtime.submit({termsAccepted:true,existingOrdersChecked:true,noExtras:true}),/Paused/);
 const ready=await runtime.resume({checkoutApproved:true,newContextConfirmed:true});assert.equal(ready.phase,'REVIEW');assert.equal(w.commands.filter(x=>x==='checkout').length,1);assert.equal(w.commands.filter(x=>x==='addBag').length,1);assert.equal(w.commands.includes('submitOrder'),false);await runtime.close();assert.equal(w.closes,1);assert.equal(w.releases,1);
});
test('C097 pause drains one sent checkout then explicit resume reconciles it without repeating checkout',async()=>{
 const {w,runtime}=world();await runtime.open();let release,entered;w.blocked=new Promise(r=>release=r);const reached=new Promise(r=>entered=r);w.entered=entered;w.blockAction='checkout';
 const running=runtime.advance({checkoutApproved:true,newContextConfirmed:true});await reached;const pausing=runtime.pause();release();const stopped=await running;await pausing;assert.equal(stopped.state,'PAUSED');assert.equal(w.row.pending.action,'checkout');assert.equal(w.commands.includes('selectPickup'),false);assert.equal(w.closes,0);
 await assert.rejects(runtime.advance({checkoutApproved:true,newContextConfirmed:true}),/Paused/);w.blockAction=null;const ready=await runtime.resume({checkoutApproved:true,newContextConfirmed:true});assert.equal(ready.phase,'REVIEW');assert.equal(w.commands.filter(x=>x==='checkout').length,1);await runtime.close();
});
