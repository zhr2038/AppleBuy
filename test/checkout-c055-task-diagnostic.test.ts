// C055 Codex quota implementation self-checks; all records/API/clock/DOM/locks are FAKE, no browser or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {taskDiagnostic} from '../web/checkout-connector/task-diagnostic.js';
import {TASK_KEY,VALIDATION_KEY,NO_EXTRAS,retirable} from '../web/checkout-connector/job.js';
import {withPurchaseOwner} from '../web/checkout-connector/owner.js';
const secret='FAKE-PRIVATE-NOT-FOR-DOM';
const record=()=>({schema:'applebuy-purchase-job/v1',state:'NEEDS_VERIFICATION',lastPhase:'DETAILS',tabId:7,expiresAt:90000,
  plan:{product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,stores:['Apple 大连恒隆广场'],fulfillment:'pickup'},
  initialDates:['october5','october6'],dateCursor:0,floors:{october5:'21:15'},pending:{action:'chooseSlot',beforePhase:'SLOTS',deadline:99000,date:'october5',start:'21:15',end:'21:30',id:secret,ref:secret},acceptedSlot:null,finalIntent:null,
  taskId:secret,planDigest:secret,orderRefHash:secret,orderDetailLink:secret,privatePickupData:{identitySuffix:secret},bagAddStarted:true,resourceWritten:true,reconcileOnly:false,bagTotalCny:9999,refusals:0,retiredHistory:[],retiredCart:{private:secret},history:[{event:secret}]});
test('C055 snapshot preserves unknown sent slot, expiry and one-unit facts without echoing private fields or mutating',()=>{
  const s=record(),before=structuredClone(s),o=taskDiagnostic(s,100000);
  assert.equal(o.scope,'persisted-task-only');assert.equal(o.merchantQueried,false);assert.equal(o.purchaseAction,false);
  assert.equal(o.windowExpired,true);assert.equal(o.pending.delivery,'SENT_OR_UNKNOWN');assert.equal(o.pending.deadlineExpired,true);
  assert.deepEqual(o.initialDates,['october5','october6']);assert.equal(o.floors.october5,'21:15');assert.equal(o.finalIntentPresent,false);assert.equal(o.acceptedSlot,null);
  assert.equal(o.fixedQuantityOne,true);assert.equal(o.fixedPriceCapMatches,true);assert.equal(o.moneyBasisMatchesFixedProduct,true);assert.equal(o.retainedCartPresent,true);
  assert.ok(!JSON.stringify(o).includes(secret));assert.deepEqual(s,before);
});
test('C055 malformed/unrecognized diagnostic fields are masked, never turned into facts or private text',()=>{
  const s=record();s.state=s.lastPhase=secret;s.plan.product.model=s.plan.product.color=s.plan.product.capacity=secret;s.initialDates=[secret,'october5',secret,'october7'];s.floors={[secret]:secret,october5:'99:99'};s.pending.action=s.pending.beforePhase=secret;s.expiresAt=undefined;s.finalIntent={id:secret,sent:secret};
  const o=taskDiagnostic(s,100000);assert.ok(!JSON.stringify(o).includes(secret));assert.equal(o.windowExpired,null);assert.equal(o.state,'UNRECOGNIZED');assert.equal(o.model,null);assert.equal(o.finalIntentPresent,true);assert.equal(o.finalSent,null);assert.equal(o.initialDatesOverflow,true);assert.deepEqual(o.initialDates,[null,'october5',null]);assert.deepEqual(o.floors,{});
});
test('C055 a positively unsent pending action and a sent final stay distinct; earlier protected history is not erased',()=>{
  const s=record();s.pending.dispatched=false;s.finalIntent={id:secret,sent:true};s.retiredHistory=[{pending:{action:'submitOrder',id:secret}}];
  const o=taskDiagnostic(s,100000);assert.equal(o.pending.delivery,'POSITIVELY_NOT_SENT');assert.equal(o.finalIntentPresent,true);assert.equal(o.finalSent,true);assert.equal(o.priorSlotOrFinalPresent,true);assert.equal(o.retiredHistoryCount,1);assert.ok(!JSON.stringify(o).includes(secret));
});
test('C055 unavailable/schema-unknown/overflow fields never pretend to be current merchant proof',()=>{
  assert.equal(taskDiagnostic(null,100000).record,'NONE');assert.equal(taskDiagnostic({schema:secret},100000).record,'UNRECOGNIZED');
  const s=record();s.retiredHistory=Array.from({length:51},()=>({}));const o=taskDiagnostic(s,NaN);assert.equal(o.windowExpired,null);assert.equal(o.retiredHistoryOverflow,true);assert.equal(o.merchantQueried,false);
});
async function control({owned=true,get=null}={}){
  const s=record(),before=structuredClone(s),nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,disabled:false,textContent:'',href:'',replaceChildren(){}});return nodes.get(id);};
  node('product').value='pro';node('tab').value='7';node('approve').checked=true;node('finalReview').checked=true;
  const h={reads:0,writes:0,privateReads:0,siteCalls:0,requests:0,record:s};
  const chrome={storage:{local:{async get(k){assert.equal(k,TASK_KEY);h.reads++;return {[k]:get?await get():structuredClone(s)};},async set(){h.writes++;throw Error('FAKE no write allowed');}},session:{async get(){h.privateReads++;throw Error('FAKE private session forbidden');},async set(){throw Error('FAKE private write forbidden');}}},tabs:new Proxy({},{get(){h.siteCalls++;throw Error('FAKE no site API');}})};
  const locks={async request(name,opt,fn){assert.equal(name,'applebuy-single-purchase-owner');assert.equal(opt.ifAvailable,true);h.requests++;return await fn(owned?{}:null);}};
  class NoPurchaseJob{constructor(){throw Error('FAKE diagnostic must not create a buyer');}}
  const ctx=vm.createContext({document:{getElementById:node},chrome,navigator:{locks},crypto:webcrypto,TextEncoder,URL,structuredClone,Date:class extends Date{static now(){return 100000;}},PurchaseJob:NoPurchaseJob,ChromePort:NoPurchaseJob,allowedMerchantUrl:()=>{throw Error('FAKE no merchant URL');},withPurchaseOwner,taskDiagnostic,TASK_KEY,VALIDATION_KEY,NO_EXTRAS,retirable});
  const source=readFileSync(new URL('../web/checkout-connector/control.js',import.meta.url),'utf8').replace(/^import .*;\r?$/gm,'');await vm.runInContext('(async()=>{'+source+'\n})()',ctx);
  h.reads=0;h.requests=0;return {h,s,before,node,click:id=>node(id).onclick()};
}
test('C055 actual control handler reads the exact task once under the owner lock, never a site/private field/grant/write',async()=>{
  const c=await control();await c.click('inspectTask');assert.match(c.node('state').textContent,/程序诊断 C055/);assert.match(c.node('state').textContent,/保留记录，不是当前官网结果/);assert.ok(!c.node('state').textContent.includes(secret));assert.equal(c.h.reads,1);assert.equal(c.h.requests,1);assert.equal(c.h.writes,0);assert.equal(c.h.privateReads,0);assert.equal(c.h.siteCalls,0);assert.deepEqual(c.s,c.before);assert.equal(c.node('approve').checked,true);assert.equal(c.node('finalReview').checked,true);
});
test('C055 another owner prevents even task reading, and no action is sent',async()=>{
  const c=await control({owned:false});await c.click('inspectTask');assert.equal(c.h.reads,0);assert.equal(c.h.writes,0);assert.match(c.node('state').textContent,/未读取记录或发出动作/);
});
test('C055 pause during a diagnostic read suppresses stale output and preserves the stored record',async()=>{
  let resolve=null,delayed=false;const c=await control({get:()=>delayed?new Promise(r=>resolve=r):record()});delayed=true;
  const pending=c.click('inspectTask');await new Promise(r=>setImmediate(r));await c.click('pause');resolve(record());await pending;
  assert.match(c.node('state').textContent,/已暂停/);assert.doesNotMatch(c.node('state').textContent,/程序诊断 C055/);assert.equal(c.h.writes,0);assert.equal(c.h.privateReads,0);assert.equal(c.h.siteCalls,0);assert.deepEqual(c.s,c.before);
});
test('C055 storage failure shows only a fixed diagnostic error, never private exception text',async()=>{
  let fail=false;const c=await control({get:()=>{if(fail)throw Error(secret);return record();}});fail=true;await c.click('inspectTask');
  assert.match(c.node('state').textContent,/只读诊断未完成/);assert.ok(!c.node('state').textContent.includes(secret));assert.equal(c.h.writes,0);assert.equal(c.h.privateReads,0);assert.equal(c.h.siteCalls,0);assert.deepEqual(c.s,c.before);
});
