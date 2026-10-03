// C-022-R1 implementation tests (Claude): run-local page currentness. Every store, clock, page, Chrome API, lock and command
// is FAKE. No browser, permission, credential, cart, slot, real order or payment is touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
import {PurchaseJob,TASK_KEY,VALIDATION_KEY,NO_EXTRAS,retirable} from '../web/checkout-connector/job.js';
import {allowedMerchantUrl} from '../web/checkout-connector/chrome-port.js';
import {withPurchaseOwner} from '../web/checkout-connector/owner.js';

// Same member order as control.js plan(), so the control page computes this exact digest.
const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{...NO_EXTRAS}};
const digest=createHash('sha256').update(JSON.stringify(plan)).digest('hex');
const purchase={itemVerified:true,verified:false,...plan.product,quantity:1,totalCny:9999,store:null,fulfillment:null};
const bag={phase:'BAG',verifiedStep:true,purchase,extras:false},auth={phase:'AUTH',verifiedStep:false};
const sentCheckout=()=>({id:'FAKE-sent-checkout',action:'checkout',documentId:'FAKE-old-doc',beforePhase:'BAG',deadline:99000});
// A preserved task whose last run ended right after a valid BAG read, so its stored flag still says current.
function row(expiresAt){return {schema:'applebuy-purchase-job/v1',taskId:'FAKE-task',plan:structuredClone(plan),planDigest:digest,tabId:7,state:'NEEDS_USER',lastPhase:'BAG',lastDocumentId:'FAKE-old-doc',entryDocumentId:'FAKE-entry',lastRead:3,expiresAt,initialDates:null,dateCursor:0,floors:{},rejected:[],refusals:0,pending:null,finalIntent:null,orderRefHash:null,bagAddStarted:true,resourceWritten:true,untouchedFailures:0,untouchedStreak:0,quotedCny:9999,history:[{event:'FAKE-kept'}],observationCurrent:true};}
function job(){
  const h={row:row(200000),now:100000,pages:[bag],reads:0,writes:0,actions:[],states:[],reply:{delivered:true},onState:null};
  const store={async get(k){assert.equal(k,TASK_KEY);return structuredClone(h.row);},async put(k,s){assert.equal(k,TASK_KEY);h.writes++;h.row=structuredClone(s);}};
  const port={async observe(){const page=h.pages[Math.min(h.reads,h.pages.length-1)];h.reads++;return {schema:'applebuy-merchant-read/v1',documentId:'FAKE-doc-'+h.reads,seq:3+h.reads,...structuredClone(page)};},
    async act(c){h.actions.push(c.action);return structuredClone(h.reply);},async wait(){throw new Error('FAKE test must not poll');},async lookupOrder(){throw new Error('FAKE test must not look up an order');}};
  h.job=new PurchaseJob({store,port,now:()=>h.now,id:()=>`FAKE-id-${h.reads}-${h.actions.length}`,onState:s=>{h.states.push(structuredClone(s));h.onState?.(s);}});
  h.run=(o={})=>h.job.run(plan,{tabId:7,planDigest:digest,...o});h.flags=()=>h.states.map(s=>s.observationCurrent);return h;
}

test('C022-R1 a valid read after a dispatched checkout makes that new page current again',async()=>{
  const h=job();h.pages=[bag,auth];const r=await h.run();
  assert.deepEqual(h.actions,['checkout']);assert.equal(h.reads,2);
  assert.equal(r.state,'NEEDS_USER');assert.equal(r.reason,'auth');assert.equal(r.lastPhase,'AUTH');assert.equal(r.observationCurrent,true);assert.equal(r.pending.action,'checkout');
  // RUNNING (persisted flag cleared), BAG read, write-ahead, post-act, AUTH read, AUTH gate.
  assert.deepEqual(h.flags(),[false,true,false,false,true,true]);assert.equal(h.states[0].phase,'BAG');
});
test('C022-R1 a control change between write-ahead and act is not dispatched and never calls the old page current',async()=>{
  const h=job();h.onState=s=>{if(s.pendingAction==='checkout')h.job.pause();};const r=await h.run();
  assert.deepEqual(h.actions,[]);assert.equal(h.reads,1);assert.equal(r.state,'PAUSED');assert.equal(r.reason,'control-changed-after-write; not dispatched');
  assert.equal(r.pending.dispatched,false);assert.equal(r.observationCurrent,false);
  assert.ok(h.states.filter(s=>s.pendingAction==='checkout').every(s=>s.observationCurrent===false));
});
test('C022-R1 a positively untouched command stays non-current until the next valid read',async()=>{
  const h=job();h.pages=[bag,auth];h.reply={delivered:false,touched:false,reason:'FAKE'};const r=await h.run();
  assert.deepEqual(h.actions,['checkout']);assert.equal(r.pending,null);assert.deepEqual(r.history.at(-1),{event:'untouched-not-sent',action:'checkout',reason:'FAKE'});
  // RUNNING, BAG read, write-ahead, untouched record, AUTH read, AUTH gate.
  assert.deepEqual(h.flags(),[false,true,false,false,true,true]);assert.equal(r.observationCurrent,true);assert.equal(r.lastPhase,'AUTH');
});
test('C022-R1 a confirmed unpaid task still returns without any write, read or notification and is not current',async()=>{
  const h=job();Object.assign(h.row,{state:'CONFIRMED_UNPAID',lastPhase:'ORDER_DETAIL',finalIntent:{id:'FAKE-final',sent:true}});const before=structuredClone(h.row);
  const r=await h.run();assert.equal(r.state,'CONFIRMED_UNPAID');assert.equal(r.observationCurrent,false);
  assert.equal(h.writes+h.reads+h.actions.length+h.states.length,0);assert.deepEqual(h.row,before);
});

// The actual control.js status text, driven through Resume with a FAKE port class.
async function control(stored){
  const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,disabled:false,textContent:'',href:'',replaceChildren(){}});return nodes.get(id);};
  node('product').value='pro';node('tab').value='7';node('approve').checked=true;
  const h={row:stored,observations:0,actions:[],sessionWrites:0};
  const chrome={storage:{local:{async get(k){return {[k]:structuredClone(h.row)};},async set(v){h.row=structuredClone(v[TASK_KEY]);}},session:{async get(){return {};},async set(){h.sessionWrites++;}}},permissions:{request(){throw new Error('FAKE test must not request permission');}}};
  class FakePort{constructor(api,tabId,options){this.seq=options.initialSequence??0;}async observe(){h.observations++;return {schema:'applebuy-merchant-read/v1',seq:++this.seq,documentId:'FAKE-bag-doc',...structuredClone(bag)};}async act(c){h.actions.push(c.action);throw new Error('FAKE transport lost after dispatch');}}
  const context=vm.createContext({document:{getElementById:node},chrome,navigator:{locks:{async request(name,opt,fn){return fn({});}}},crypto:webcrypto,TextEncoder,Date,URL,structuredClone,PurchaseJob,ChromePort:FakePort,allowedMerchantUrl,withPurchaseOwner,TASK_KEY,VALIDATION_KEY,NO_EXTRAS,retirable});
  const source=readFileSync(new URL('../web/checkout-connector/control.js',import.meta.url),'utf8').replace(/^import .*;\r?$/gm,'');
  await vm.runInContext('(async()=>{'+source+'\n})()',context);
  h.click=id=>nodes.get(id).onclick();h.status=()=>node('state').textContent;return h;
}
test('C022-R1 control status after a dispatched checkout with lost transport names BAG only as the last read page',async()=>{
  const h=await control(row(Date.now()+600000));await h.click('resume');
  assert.deepEqual(h.actions,['checkout']);assert.equal(h.observations,1);assert.equal(h.row.pending.action,'checkout');assert.equal(h.row.observationCurrent,false);
  assert.match(h.status(),/最近已读页面：BAG/);assert.match(h.status(),/待确认动作：结账/);assert.match(h.status(),/mutation-transport-lost/);assert.doesNotMatch(h.status(),/；页面：/);
});
test('C022-R1 control status for an expired Resume reads nothing and names the persisted BAG only as the last read page',async()=>{
  const stored=row(Date.now()-1);stored.pending=sentCheckout();const h=await control(stored);await h.click('resume');
  assert.equal(h.observations+h.actions.length+h.sessionWrites,0);assert.equal(h.row.state,'EXPIRED');assert.deepEqual(h.row.pending,stored.pending);assert.equal(h.row.expiresAt,stored.expiresAt);assert.deepEqual(h.row.history,stored.history);
  assert.match(h.status(),/状态：EXPIRED；最近已读页面：BAG/);assert.match(h.status(),/待确认动作：结账/);assert.doesNotMatch(h.status(),/；页面：/);
});
