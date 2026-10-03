// Codex independent repro of actual Claude C022 review F1. All stores, clocks, document/merchant observations and
// commands are FAKE. No browser, permission, credential, cart, slot, real order or payment is touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import {PurchaseJob,TASK_KEY,NO_EXTRAS,validStored} from '../web/checkout-connector/job.js';
const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{...NO_EXTRAS}};
const purchase={itemVerified:true,verified:false,...plan.product,quantity:1,totalCny:9999,store:null,fulfillment:null};
function oldRow(){return {schema:'applebuy-purchase-job/v1',taskId:'FAKE-old-task',plan:structuredClone(plan),planDigest:'FAKE-digest',tabId:7,state:'NEEDS_VERIFICATION',lastPhase:'BAG',lastDocumentId:'FAKE-old-doc',entryDocumentId:'FAKE-entry',lastRead:4,expiresAt:200000,initialDates:null,dateCursor:0,floors:{},rejected:[],refusals:0,pending:{id:'FAKE-old-checkout',action:'checkout',documentId:'FAKE-old-doc',beforePhase:'BAG',deadline:99000},finalIntent:null,bagAddStarted:true,resourceWritten:true,untouchedFailures:0,untouchedStreak:0,history:[{event:'FAKE-preserved'}],observationCurrent:true};}
function harness(){
  const h={row:oldRow(),now:100000,states:[],actions:[],reads:0,page:{phase:'BAG',verifiedStep:true,purchase,extras:false},actMode:'lost'};
  const store={async get(k){assert.equal(k,TASK_KEY);return structuredClone(h.row);},async put(k,s){assert.equal(k,TASK_KEY);h.row=structuredClone(s);}};
  const port={async observe(){h.reads++;return {schema:'applebuy-merchant-read/v1',documentId:'FAKE-current-doc',seq:4+h.reads,...structuredClone(h.page)};},async act(c){h.actions.push(c);if(h.actMode==='pause')h.job.pause();if(h.actMode==='stop')h.job.stop();if(h.actMode==='lost')throw new Error('FAKE transport loss');return {delivered:true};},async wait(){throw new Error('Test must not poll');}};
  h.make=opts=>h.job=new PurchaseJob({store,port,now:()=>h.now,id:()=>`FAKE-${h.reads}`,onState:s=>h.states.push(structuredClone(s)),...opts});h.make();
  h.run=opts=>h.job.run(plan,{tabId:7,planDigest:'FAKE-digest',...opts});return h;
}
for(const gate of ['expired','wrong-binding','paused','stopped','step-bound','confirmed-unpaid','revoked-start'])test('C022-F1 old persisted current flag is false at every pre-read stop: '+gate,async()=>{
  const h=harness(),opts={};if(gate==='expired')h.row.expiresAt=90000;if(gate==='wrong-binding')opts.planDigest='FAKE-wrong';if(gate==='paused')h.job.pause();if(gate==='stopped')h.job.stop();if(gate==='step-bound')h.make({maxSteps:0});
  if(gate==='confirmed-unpaid'){h.row.pending=null;h.row.finalIntent={id:'FAKE-sent-final',sent:true};h.row.state='CONFIRMED_UNPAID';h.row.lastPhase='ORDER_DETAIL';}
  if(gate==='revoked-start'){h.row.revokedGrantIds=['FAKE-revoked'];opts.grant={id:'FAKE-revoked',start:true};}
  const before=structuredClone(h.row);assert.equal(validStored(h.row),true);const r=await h.run(opts);
  assert.equal(h.reads+h.actions.length,0);assert.equal(r.observationCurrent,false,'an old flag cannot claim a fresh/current observation');
  for(const s of h.states)assert.notEqual(s.observationCurrent,true,'no pre-read notification may claim a fresh/current page');
  assert.deepEqual(r.pending,before.pending);assert.equal(r.expiresAt,before.expiresAt);assert.deepEqual(r.history,before.history);
});
for(const mode of ['lost','pause','stop'])test('C022-F1 a dispatched checkout invalidates page-currentness before its unknown/control-change stop: '+mode,async()=>{
  const h=harness();h.row.pending=null;h.actMode=mode;const r=await h.run();
  assert.equal(h.actions.length,1);assert.equal(h.reads,1);assert.equal(r.pending.action,'checkout');assert.equal(r.lastPhase,'BAG');
  assert.equal(r.observationCurrent,false,'the page after a dispatched action was never read');
  const afterWrite=h.states.filter(s=>s.pendingAction==='checkout');assert.ok(afterWrite.length>0);assert.ok(afterWrite.every(s=>s.observationCurrent===false),'write-ahead and post-act statuses cannot call the old BAG current');
});
test('C022-F1 positive: a fresh valid readonly AUTH read is distinguished and preserves old pending checkout',async()=>{
  const h=harness();h.page={phase:'AUTH',verifiedStep:false};const r=await h.run({mode:'reconcile'});
  assert.equal(h.reads,1);assert.equal(h.actions.length,0);assert.equal(r.observationCurrent,true);assert.equal(r.lastPhase,'AUTH');assert.equal(r.pending.action,'checkout');
});
test('C022-F1 positive: fresh matching readonly evidence can confirm the old View Bag without any command',async()=>{
  const h=harness();h.row.pending.action='viewBag';h.row.pending.beforePhase='ACCESSORIES';const r=await h.run({mode:'reconcile'});
  assert.equal(r.observationCurrent,true);assert.equal(r.lastPhase,'BAG');assert.equal(r.pending,null);assert.equal(h.reads,1);assert.equal(h.actions.length,0);assert.equal(r.resourceWritten,true);
});
