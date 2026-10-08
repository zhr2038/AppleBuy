import test from 'node:test';import assert from 'node:assert/strict';
import {PurchaseJob,createPurchaseRecord,TASK_KEY} from '../web/checkout-connector/job.js';
import {PRO_PLAN,proDigest} from '../src/desktop/browser-session.mjs';import {AuthContinuation} from '../src/desktop/auth-continuation.mjs';
function pendingWorld({wrong=false,expired=false}={}){
 let clock=Date.now(),seq=0,reads=0,step=0;const actions=[];
 let row={...createPurchaseRecord(PRO_PLAN,{taskId:'FAKE-transition',planDigest:proDigest,tabId:7,now:clock,id:()=>crypto.randomUUID()}),state:'NEEDS_VERIFICATION',lastPhase:'SLOTS',bagAddStarted:true,resourceWritten:true,bagTotalCny:9999,initialDates:['october8'],dateCursor:0,floors:{october8:'21:15'},pending:{action:'chooseSlot',id:'FAKE-slot',documentId:'FAKE-before',beforePhase:'SLOTS',date:'october8',start:'21:15',end:'21:30',ref:'time:46',generation:1,deadline:expired?clock-1:clock+8000}};
 const full={...PRO_PLAN.product,quantity:wrong?2:1,totalCny:9999,verified:true,itemVerified:true,store:PRO_PLAN.stores[0],fulfillment:'pickup'};
 const port={wait:async ms=>{clock+=ms;},observe:async()=>{reads++;let o={schema:'applebuy-merchant-read/v1',documentId:'FAKE-current',seq:++seq,generation:1,verifiedStep:true,extras:false,purchase:full};
  if(step===0&&reads===1)return {...o,phase:wrong?'FULFILLMENT':'UNKNOWN',verifiedStep:wrong};
  if(step===0&&reads===2)return {...o,phase:'FULFILLMENT'};
  if(step===0)return {...o,phase:'DETAILS',purchase:{model:null,capacity:null,color:null,quantity:null,store:null,fulfillment:null,totalCny:9999,verified:false,itemVerified:false},extras:null,contactStep:{kind:'contact-only-details',verified:true,totalCny:9999},slotSummary:null};
  if(step===1)return {...o,phase:'PAYMENT',paymentMethod:null};
  if(step===2)return {...o,phase:'PAYMENT',paymentMethod:'支付宝'};
  return {...o,phase:'REVIEW',paymentMethod:'支付宝',slotSummary:{date:'october8',start:'21:15',end:'21:30',verified:true},termsLinks:['https://www.apple.com.cn/shop/open/salespolicies'],existingOrdersChecked:false};
 },act:async c=>{actions.push(c.action);if(c.action==='fillDetails')step=1;else if(c.action==='selectPayment')step=2;else if(c.action==='continuePayment')step=3;else throw Error('No repeated slot/checkout/final');return {delivered:true};}};
 const store={get:async()=>structuredClone(row),put:async(k,r)=>{assert.equal(k,TASK_KEY);row=structuredClone(r);}};
 return {actions,get row(){return row;},get reads(){return reads;},run:()=>new PurchaseJob({store,port,now:()=>clock,maxWaitMs:500}).run(PRO_PLAN,{tabId:7,planDigest:proDigest})};
}
test('C199 UNKNOWN and old FULFILLMENT during a sent slot settle by read-only polling and run through review without coordinator buying clicks',async()=>{
 const w=pendingWorld(),r=await w.run();assert.equal(r.lastPhase,'REVIEW');assert.equal(r.pending,null);assert.equal(r.finalIntent,null);assert.deepEqual(w.actions,['fillDetails','selectPayment','continuePayment']);assert.ok(w.reads>=6);
});
test('C199 positively wrong item blocks the transition immediately without waiting or repeating slot',async()=>{const w=pendingWorld({wrong:true}),r=await w.run();assert.equal(r.state,'BLOCKED');assert.equal(r.pending.action,'chooseSlot');assert.equal(w.reads,1);assert.deepEqual(w.actions,[]);});
test('C199 original pending deadline is never extended by transition settling',async()=>{const w=pendingWorld({expired:true}),r=await w.run();assert.equal(r.state,'NEEDS_VERIFICATION');assert.equal(r.pending.action,'chooseSlot');assert.equal(w.reads,1);assert.deepEqual(w.actions,[]);});
test('C199 authentication observer survives bounded frame replacement then resumes once without checkout resend',async()=>{
 let n=0,resumes=0,clock=0,stopped=0;const watch=new AuthContinuation({observe:async()=>{if(n++<2)throw Object.assign(Error('ScriptTransportRejected'),{scriptTransport:true});return {phase:'FULFILLMENT'};},now:()=>clock,setTimer:()=>1,clearTimer:()=>{},onStopped:()=>stopped++});watch.start(async()=>resumes++);await watch.tick();clock+=1000;await watch.tick();clock+=1000;await watch.tick();assert.equal(resumes,1);assert.equal(stopped,0);await watch.tick();assert.equal(resumes,1);
});
test('C199 authentication permission/delivery errors stop immediately and repeated frame loss remains bounded',async()=>{
 for(const scriptTransport of [false,true]){let calls=0,stops=0;const watch=new AuthContinuation({observe:async()=>{calls++;throw Object.assign(Error('FAKE failure'),{scriptTransport});},setTimer:()=>1,clearTimer:()=>{},onStopped:()=>stops++});watch.start(async()=>{throw Error('No resume');});for(let i=0;i<20;i++)await watch.tick();assert.equal(calls,scriptTransport?11:1);assert.equal(stops,1);}
});
