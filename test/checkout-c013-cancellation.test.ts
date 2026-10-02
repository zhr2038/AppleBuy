// C-013-R2 implementation tests (Claude). Actual control.js and PurchaseJob; DOM, Chrome storage, Web Locks and the
// merchant port are explicitly FAKE. Port.act only records a synthetic command: no merchant request, slot, order or payment.
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
const HALTED=/进行中的准备已取消/;

async function harness(extra={}){
  const nodes=new Map(),actions=[];
  const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,disabled:false,href:'',textContent:''});return nodes.get(id);};
  node('product').value='duo';node('tab').value='7';node('approve').checked=true;node('finalReview').checked=true;node('rebindConfirm').checked=true;node('terms').href=terms;
  const initial={schema:'applebuy-purchase-job/v1',taskId:'FAKE-task',plan:structuredClone(plan),planDigest:createHash('sha256').update(JSON.stringify(plan)).digest('hex'),tabId:7,state:'NEEDS_USER',lastPhase:'REVIEW',lastDocumentId:'FAKE-doc',entryDocumentId:'FAKE-doc',lastRead:0,expiresAt:Date.now()+1800000,dateCursor:0,refusals:0,rejected:[],floors:{},initialDates:[slot.date],pending:null,finalIntent:null,orderRefHash:null,acceptedSlot:structuredClone(slot),bagAddStarted:true,resourceWritten:true,untouchedFailures:0,untouchedStreak:0,quotedCny:15999,mode:'purchase',...extra};
  const rows={[TASK_KEY]:structuredClone(initial)};
  const h={nodes,actions,rows,initial,gate:null,held:false,fail:false,record:()=>structuredClone(rows[TASK_KEY]),state:()=>nodes.get('state').textContent,click:id=>nodes.get(id).onclick()};
  // One armed barrier holds the first matching await until released; optionally it then throws.
  async function barrier(kind){if(h.gate===kind&&!h.held){h.held=true;h.entered();await h.block;if(h.fail)throw new Error('FAKE failure after release');}}
  h.arm=(kind,{fail=false}={})=>{Object.assign(h,{gate:kind,held:false,fail});h.reached=new Promise(r=>h.entered=r);h.block=new Promise(r=>h.release=r);};
  const chrome={storage:{
    local:{async get(k){await barrier(k===VALIDATION_KEY?'validation-read':'record-read');return k in rows?{[k]:structuredClone(rows[k])}:{};},async set(v){for(const [k,x] of Object.entries(v))rows[k]=structuredClone(x);}},
    session:{async get(){await barrier('session-read');return {};},async set(){}}}};
  let seq=0;
  class FakePort{
    constructor(){this.last={raw:{termsLinks:[terms]}};}
    async observe(){await barrier('observe');return {schema:'applebuy-merchant-read/v1',documentId:'FAKE-doc',seq:++seq,phase:'REVIEW',verifiedStep:true,purchase:{itemVerified:true,verified:true,...plan.product,quantity:1,totalCny:15999,store:plan.stores[0],fulfillment:'pickup'},paymentMethod:'支付宝',extras:false,existingOrdersChecked:true,slotSummary:structuredClone(slot),termsLinks:[terms]};}
    async act(c){actions.push(structuredClone(c));return {delivered:true};}
    async lookupOrder(){return {state:'unknown',independent:false};}
  }
  const locks={async request(name,options,fn){await barrier('lock');return fn({});}};
  const context=vm.createContext({document:{getElementById:node},chrome,navigator:{locks},crypto:webcrypto,TextEncoder,Date,URL,structuredClone,PurchaseJob,ChromePort:FakePort,allowedMerchantUrl:()=>true,withPurchaseOwner,TASK_KEY,VALIDATION_KEY,NO_EXTRAS,retirable});
  const source=readFileSync(new URL('../web/checkout-connector/control.js',import.meta.url),'utf8').replace(/^import .*;\r?$/gm,'');
  await vm.runInContext('(async()=>{'+source+'\n})()',context);return h;
}
// Click a handler, hold the armed await, cancel, release, and wait for the handler to finish.
async function cancelDuring(h,handler,stage,control,options){h.arm(stage,options);const run=h.click(handler);await h.reached;h.click(control);h.release();await run;}

test('C013-R2 positive control: an uncancelled prepared one-click Start uses its advance grant once',async()=>{
  const h=await harness();await h.click('prepare');await h.click('start');
  assert.equal(h.actions.length,1);assert.equal(h.actions[0].action,'submitOrder');assert.equal(h.actions[0].finalGrant.start,true);
});
for(const stage of ['lock','record-read','session-read'])for(const control of ['pause','stop']){
  test(`C013-R2: ${control} during Start ${stage} creates no job and leaves no advance grant`,async()=>{
    const h=await harness();await h.click('prepare');
    await cancelDuring(h,'start',stage,control);
    assert.equal(h.actions.length,0);assert.match(h.state(),HALTED);assert.deepEqual(h.record(),h.initial,'the durable record is untouched');
    await h.click('resume');assert.equal(h.actions.length,0,'Resume cannot revive the cancelled advance grant');
  });
}
test('C013-R2: Stop during Final lock acquisition sends nothing; Resume sends nothing; a fresh explicit Final proceeds once',async()=>{
  const h=await harness();await cancelDuring(h,'final','lock','stop');
  assert.equal(h.actions.length,0);assert.match(h.state(),HALTED);assert.deepEqual(h.record(),h.initial);
  await h.click('resume');assert.equal(h.actions.length,0);assert.equal(h.record().finalIntent,null);
  await h.click('final');assert.equal(h.actions.length,1);assert.equal(h.actions[0].action,'submitOrder');assert.equal(h.record().finalIntent.sent,true);
  await h.click('final');await h.click('resume');assert.equal(h.actions.length,1,'an unknown final result is reconciled, never repeated');
});
test('C013-R2: an exception after cancellation is contained and sends nothing',async()=>{
  for(const stage of ['record-read','session-read','lock']){
    const h=await harness();
    await assert.doesNotReject(cancelDuring(h,'final',stage,'pause',{fail:true}));
    assert.equal(h.actions.length,0);assert.deepEqual(h.record(),h.initial);
    await h.click('resume');assert.equal(h.actions.length,0);
  }
});
test('C013-R2: Rebind cancelled during its reads writes nothing; an uncancelled Rebind becomes read-only reconciliation',async()=>{
  const ok=await harness();await ok.click('rebind');assert.equal(ok.record().reconcileOnly,true);assert.equal(ok.actions.length,0);
  for(const stage of ['lock','record-read']){
    const h=await harness();await cancelDuring(h,'rebind',stage,'stop');
    assert.deepEqual(h.record(),h.initial);assert.equal(h.actions.length,0);assert.match(h.state(),HALTED);
  }
});
test('C013-R2: public validation cancelled during its record read creates no job or validation record',async()=>{
  const ok=await harness();await ok.click('validate');assert.equal(ok.rows[VALIDATION_KEY].state,'VALIDATION_STOPPED');
  const h=await harness();await cancelDuring(h,'validate','validation-read','pause');
  assert.equal(h.rows[VALIDATION_KEY],undefined);assert.equal(h.actions.length,0);assert.match(h.state(),HALTED);
});
test('C013-R2: retirement cancelled during its record read changes nothing; an uncancelled retirement still retires',async()=>{
  const fresh={bagAddStarted:false,resourceWritten:false,acceptedSlot:undefined,lastPhase:'ENTRY'};
  const h=await harness(fresh);await cancelDuring(h,'retire','record-read','stop');
  assert.equal(h.record().state,'NEEDS_USER');assert.match(h.state(),HALTED);
  const ok=await harness(fresh);await ok.click('retire');assert.equal(ok.record().state,'RETIRED');
});
test('C013-R2: Pause reaching an already created job is enforced by the job; nothing is sent and Resume cannot revive the grant',async()=>{
  const h=await harness();await cancelDuring(h,'final','observe','pause');
  assert.equal(h.actions.length,0);const r=h.record();assert.equal(r.state,'PAUSED');assert.notEqual(r.finalIntent?.sent,true);assert.equal(r.pending,null);
  await h.click('resume');assert.equal(h.actions.length,0);
});
