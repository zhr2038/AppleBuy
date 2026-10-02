// Codex independent R08 regression. Actual control.js + PurchaseJob, FAKE DOM/Chrome/port only.
// Port.act records a synthetic command; no merchant request, reservation, mock order or payment exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
import {PurchaseJob,TASK_KEY,VALIDATION_KEY,NO_EXTRAS,retirable} from '../web/checkout-connector/job.js';
import {withPurchaseOwner} from '../web/checkout-connector/owner.js';

const plan={schema:'applebuy-intent/v1',product:{model:'iPhone Duo',capacity:'256GB',color:'星光白色'},quantity:1,maxTotalCny:15999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{...NO_EXTRAS}};
const terms='https://www.apple.com.cn/shop/open/salespolicies';
const slot={date:'FAKE-10月23日',start:'21:15',end:'21:30',verified:true};

async function harness(){
  const nodes=new Map(),actions=[];
  const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,disabled:false,href:'',textContent:''});return nodes.get(id);};
  node('product').value='duo';node('tab').value='7';node('approve').checked=true;node('finalReview').checked=true;node('terms').href=terms;
  let row={schema:'applebuy-purchase-job/v1',taskId:'FAKE-task',plan:structuredClone(plan),planDigest:createHash('sha256').update(JSON.stringify(plan)).digest('hex'),tabId:7,state:'NEEDS_USER',lastPhase:'REVIEW',lastDocumentId:'FAKE-doc',entryDocumentId:'FAKE-doc',lastRead:0,expiresAt:Date.now()+1800000,dateCursor:0,refusals:0,rejected:[],floors:{},initialDates:[slot.date],pending:null,finalIntent:null,orderRefHash:null,acceptedSlot:structuredClone(slot),bagAddStarted:true,resourceWritten:true,untouchedFailures:0,untouchedStreak:0,quotedCny:15999,mode:'purchase'};
  const h={nodes,actions,gate:null,held:false,row:()=>structuredClone(row)};
  async function barrier(kind){if(h.gate===kind&&!h.held){h.held=true;h.entered();await h.block;}}
  h.arm=kind=>{h.gate=kind;h.held=false;h.reached=new Promise(r=>h.entered=r);h.block=new Promise(r=>h.release=r);};
  const chrome={storage:{local:{async get(k){await barrier('record-read');return {[k]:structuredClone(row)};},async set(v){row=structuredClone(v[TASK_KEY]);}},session:{async get(){await barrier('session-read');return {};},async set(){}}}};
  let seq=0;
  class FakePort{
    constructor(){this.last={raw:{termsLinks:[terms]}};}
    async observe(){return {schema:'applebuy-merchant-read/v1',documentId:'FAKE-doc',seq:++seq,phase:'REVIEW',verifiedStep:true,purchase:{itemVerified:true,verified:true,...plan.product,quantity:1,totalCny:15999,store:plan.stores[0],fulfillment:'pickup'},paymentMethod:'支付宝',extras:false,existingOrdersChecked:true,slotSummary:structuredClone(slot),termsLinks:[terms]};}
    async act(c){actions.push(structuredClone(c));return {delivered:true};}
    async lookupOrder(){return {state:'unknown',independent:false};}
  }
  const locks={async request(name,options,fn){return fn({});}};
  const context=vm.createContext({document:{getElementById:node},chrome,navigator:{locks},crypto:webcrypto,TextEncoder,Date,URL,structuredClone,PurchaseJob,ChromePort:FakePort,allowedMerchantUrl:()=>true,withPurchaseOwner,TASK_KEY,VALIDATION_KEY,NO_EXTRAS,retirable});
  const source=readFileSync(new URL('../web/checkout-connector/control.js',import.meta.url),'utf8').replace(/^import .*;\r?$/gm,'');
  await vm.runInContext('(async()=>{'+source+'\n})()',context);return h;
}

for(const control of ['pause','stop'])for(const stage of ['record-read','session-read']){
  test(`C013 R08: ${control} during final ${stage} cancels that in-progress handler before any action`,async()=>{
    const h=await harness();h.arm(stage);
    const run=h.nodes.get('final').onclick();await h.reached;
    h.nodes.get(control).onclick();h.release();await run;
    assert.equal(h.actions.length,0,'no new command may be sent after cancellation during async preparation');
    assert.equal(h.row().pending,null);assert.equal(h.row().finalIntent,null,'cancelled preparation cannot create a sent intent');
    await h.nodes.get('resume').onclick();assert.equal(h.actions.length,0,'Resume cannot revive the cancelled final grant');
  });
}

test('C013 R08 positive control: a fresh explicit approved final confirmation still records one FAKE command',async()=>{
  const h=await harness();await h.nodes.get('final').onclick();
  assert.equal(h.actions.length,1);assert.equal(h.actions[0].action,'submitOrder');assert.equal(h.row().finalIntent.sent,true);
  await h.nodes.get('resume').onclick();assert.equal(h.actions.length,1,'unknown final result is not resent');
});
test('C013 R08 positive control: Resume at REVIEW without new final confirmation sends nothing',async()=>{
  const h=await harness();await h.nodes.get('resume').onclick();
  assert.equal(h.actions.length,0);assert.equal(h.row().finalIntent,null);
});
