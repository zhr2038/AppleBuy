// C038-R1 (Claude): bounded read recovery after a delivered navigating action. Actual PurchaseJob; port, pages, clock and authority FAKE.
import test from 'node:test';
import assert from 'node:assert/strict';
import {PurchaseJob} from '../web/checkout-connector/job.js';

const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{tradeIn:'none',appleCare:'none'}};
const item={itemVerified:true,verified:false,model:'iPhone 18 Pro',capacity:'256GB',color:'黑色',quantity:1,totalCny:9999,store:null,fulfillment:null};
const page={
  VARIANT:{phase:'VARIANT',verifiedStep:true,path:'/shop/buy-iphone/iphone-18-pro',nextChoice:null,variantVerified:true,quotedCny:9999,extrasConflict:false,selectedProductChoices:['黑色','256GB','不折抵换购','不加 AppleCare+ 服务计划'],purchase:{...item,itemVerified:false,quantity:null}},
  ACCESSORIES:{phase:'ACCESSORIES',verifiedStep:true,path:'/shop/buy-iphone/iphone-18-pro',nextChoice:null,purchase:{...item,itemVerified:false,quantity:null}},
  BAG:{phase:'BAG',verifiedStep:true,path:'/shop/bag',purchase:item,extras:false},
  FULFILLMENT:{phase:'FULFILLMENT',verifiedStep:true,path:'/shop/checkout',purchase:item,fulfillmentChoice:'delivery'},
  SLOTS:{phase:'SLOTS',verifiedStep:true,path:'/shop/checkout',purchase:{...item,verified:true,store:'Apple 大连恒隆广场',fulfillment:'pickup'},fulfillmentChoice:'pickup',listComplete:true,dates:[{label:'October 4',ref:'date:0',enabled:true,selected:true}],selectedDate:'October 4',times:[{start:'21:15',end:'21:30',ref:'time:46',enabled:true}]},
  AUTH:{phase:'AUTH',verifiedStep:false,path:'/shop/signIn'},
};
// script: page names or {throw:'transport'|'permission'}; after the script ends the last entry repeats.
function fakePort(script,{onWait}={}){
  let seq=0,doc=0,i=0,t=0;const log={observes:0,throws:0,waits:0,acts:[]};
  const port={orderSummary:false,
    async observe(){log.observes++;const x=script[Math.min(i++,script.length-1)];
      if(x.throw==='permission'){log.throws++;throw Object.assign(new Error('CurrentHostPermissionMissing'),{origin:'https://secure8.www.apple.com.cn'});}
      if(x.throw){log.throws++;throw new Error('CurrentDocumentUnrecognized');}
      if(x!==script[Math.min(i-2,script.length-1)]||i===1)doc++;
      return {schema:'applebuy-merchant-read/v1',...structuredClone(page[x]),documentId:'FAKE-doc-'+doc,seq:++seq,generation:1};},
    async act(c){log.acts.push(c.action);return {delivered:true};},
    async wait(){log.waits++;t+=50;onWait?.();}};
  return {port,log,now:()=>1_000_000+t};
}
function store(){const m=new Map();return {async get(k){return m.has(k)?structuredClone(m.get(k)):null;},async put(k,v){m.set(k,structuredClone(v));}};}
const run=(job,opts={})=>job.run(plan,{tabId:7,planDigest:'FAKE-digest',taskId:'FAKE-task',...opts});
const T={throw:'transport'};

test('one transient read loss after a delivered Add re-reads within the deadline and never re-adds',async()=>{
  const {port,log,now}=fakePort(['VARIANT',T,'ACCESSORIES','ACCESSORIES','AUTH']);const job=new PurchaseJob({store:store(),port,now});
  const s=await run(job);
  assert.deepEqual(log.acts,['addBag','viewBag']);assert.equal(log.throws,1);assert.equal(log.waits,1);
  assert.equal(s.state,'NEEDS_USER');assert.equal(s.reason,'auth');assert.equal(s.pending.action,'viewBag');assert.equal(s.bagAddStarted,true);
});
test('one transient read loss after a delivered Checkout re-reads and continues without a second Checkout',async()=>{
  const {port,log,now}=fakePort(['BAG',T,'FULFILLMENT','FULFILLMENT','AUTH']);const job=new PurchaseJob({store:store(),port,now});
  const s=await run(job);
  assert.deepEqual(log.acts,['checkout','selectPickup']);assert.equal(log.throws,1);
  assert.equal(s.reason,'auth');assert.equal(s.pending.action,'selectPickup');
});
test('current-host permission loss after a navigating action still stops at once',async()=>{
  const {port,log,now}=fakePort(['BAG',{throw:'permission'}]);const job=new PurchaseJob({store:store(),port,now});
  const s=await run(job);
  assert.deepEqual(log.acts,['checkout']);assert.equal(log.waits,0);
  assert.equal(s.state,'NEEDS_USER');assert.equal(s.reason,'current-host-permission-missing; no automatic action');assert.equal(s.permissionOrigin,'https://secure8.www.apple.com.cn');assert.equal(s.pending.action,'checkout');
});
test('persistent read loss stops truthfully at the existing deadline with the original pending Add',async()=>{
  const {port,log,now}=fakePort(['VARIANT',T]);const job=new PurchaseJob({store:store(),port,now});
  const s=await run(job);
  assert.deepEqual(log.acts,['addBag']);assert.ok(log.waits>=150&&log.waits<=161,'bounded by the 8000 ms pending deadline: '+log.waits);
  assert.equal(s.state,'NEEDS_VERIFICATION');assert.equal(s.reason,'observation-transport-failed');assert.equal(s.pending.action,'addBag');assert.equal(s.bagAddStarted,true);assert.equal(s.resourceWritten,true);
});
test('stop during the recovery wait sends nothing and keeps the pending fact',async()=>{
  let job;const {port,log,now}=fakePort(['VARIANT',T],{onWait:()=>job.stop()});job=new PurchaseJob({store:store(),port,now});
  const s=await run(job);
  assert.deepEqual(log.acts,['addBag']);assert.equal(log.waits,1);assert.equal(s.state,'STOPPED');assert.equal(s.pending.action,'addBag');
});
test('a read loss after a slot continuation is not retried (no broadening to slot results)',async()=>{
  const {port,log,now}=fakePort(['SLOTS',T,'SLOTS']);const job=new PurchaseJob({store:store(),port,now});
  const s=await run(job);
  assert.deepEqual(log.acts,['chooseSlot']);assert.equal(log.waits,0);assert.equal(log.observes,2);
  assert.equal(s.reason,'observation-transport-failed');assert.equal(s.pending.action,'chooseSlot');
});
test('an advance start grant that expires during the recovery wait still blocks after the new read',async()=>{
  const {port,log,now}=fakePort(['VARIANT',T,T,'ACCESSORIES']);const job=new PurchaseJob({store:store(),port,now});
  const grant={id:'FAKE-grant',start:true,entryDocumentId:'FAKE-doc-1',taskId:'FAKE-task',planDigest:'FAKE-digest',existingOrdersChecked:true,noExtras:true,termsAccepted:true,expiry:now()+60};
  const s=await run(job,{grant});
  assert.deepEqual(log.acts,['addBag']);assert.equal(log.waits,2);
  assert.equal(s.state,'BLOCKED');assert.equal(s.reason,'start-authorization-no-longer-current');assert.equal(s.pending.action,'addBag');
});
