// Codex independent C021 cases. Every Chrome API, clock, document, store and action is FAKE.
// No merchant request, login, permission grant, cart, pickup slot, order or payment is performed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ChromePort} from '../web/checkout-connector/chrome-port.js';
import {PurchaseJob,TASK_KEY,NO_EXTRAS} from '../web/checkout-connector/job.js';

const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{...NO_EXTRAS}};
const purchase={itemVerified:true,verified:false,...plan.product,quantity:1,totalCny:9999,store:null,fulfillment:null};
const origin='https://secure6.www.apple.com.cn';
function transport(){
  const h={url:'https://www.apple.com.cn/shop/bag',allowed:true,scripts:[],requested:[],permissionChecks:[],doc:'FAKE-bag',raw:{schema:'applebuy-merchant-read/v1',phase:'BAG',purchase,verifiedStep:true}};
  h.api={tabs:{async get(){return {url:h.url};}},permissions:{async contains(q){h.permissionChecks.push(q);return h.allowed;},async request(q){h.requested.push(q);throw new Error('No implicit request');}},scripting:{async executeScript(q){h.scripts.push(q);return [{frameId:0,documentId:h.doc,result:structuredClone(h.raw)}];}}};
  h.port=new ChromePort(h.api,7,{authorized:false});return h;
}
function jobHarness(){
  const h={time:100000,seq:0,current:{phase:'BAG',verifiedStep:true,purchase,extrasVerified:true},actions:[],states:[],reads:0,error:null,rows:{}};
  const store={async get(k){return structuredClone(h.rows[k]??null);},async put(k,s){h.rows[k]=structuredClone(s);}};
  const port={async observe(){h.reads++;if(h.error)throw h.error;return {schema:'applebuy-merchant-read/v1',documentId:'FAKE-doc-'+h.seq,seq:++h.seq,...structuredClone(h.current)};},async act(c){h.actions.push(structuredClone(c));h.current={phase:'AUTH',verifiedStep:false};return {delivered:true};},async wait(ms){h.time+=ms;}};
  h.make=()=>new PurchaseJob({store,port,now:()=>h.time,id:()=>`FAKE-${h.seq}-${h.actions.length}`,onState:s=>h.states.push(structuredClone(s))});
  h.run=(options={})=>h.make().run(plan,{tabId:7,planDigest:'FAKE-digest',...options});return h;
}

for(const path of ['/shop/signIn','/shop/checkout?_s=Fulfillment-init'])test('C021 a newly ungranted current secure origin is disclosed safely, no injection/request: '+path,async()=>{
  const h=transport();await h.port.observe(plan);h.url=origin+path;h.allowed=false;
  const error=await h.port.observe(plan).then(()=>null,e=>e);
  assert.match(error?.message??'',/CurrentHostPermissionMissing/);
  assert.equal(error.origin,origin,'only the exact current official origin is needed for the human permission handoff');
  assert.equal(h.scripts.length,1);assert.equal(h.requested.length,0);
  assert.deepEqual(h.permissionChecks.at(-1),{origins:[origin+'/*']});
  assert.equal(JSON.stringify(error).includes('Fulfillment-init'),false,'queries are never diagnostic output');
});

test('C021 granting the exact current origin permits a fresh read, not an action or login',async()=>{
  const h=transport();h.url=origin+'/shop/signIn';h.allowed=false;
  await assert.rejects(h.port.observe(plan),/Permission/);assert.equal(h.scripts.length,0);
  h.allowed=true;h.doc='FAKE-auth';h.raw={schema:'applebuy-merchant-read/v1',phase:'AUTH',verifiedStep:false};
  const o=await h.port.observe(plan);assert.equal(o.phase,'AUTH');assert.equal(o.documentId,'FAKE-auth');
  assert.equal(h.scripts.length,1);assert.equal(h.requested.length,0);
  await assert.rejects(h.port.act({plan,documentId:'FAKE-auth',action:'checkout'}),/Authorized/);
});

test('C021 an undisclosed URL is not guessed and requests no host or script',async()=>{
  const h=transport();h.url=undefined;await assert.rejects(h.port.observe(plan));
  assert.equal(h.scripts.length,0);assert.equal(h.permissionChecks.length,0);assert.equal(h.requested.length,0);
});

test('C021 a checkout followed by AUTH preserves the single pending action and sends no login',async()=>{
  const h=jobHarness(),r=await h.run();assert.equal(r.state,'NEEDS_USER');assert.equal(r.reason,'auth');
  assert.equal(r.pending.action,'checkout');assert.deepEqual(h.actions.map(c=>c.action),['checkout']);
  assert.equal(r.resourceWritten,true);assert.equal(r.bagAddStarted,true);
  assert.equal(h.states.at(-1).pendingAction,'checkout','the human-facing stop identifies the unresolved kind without exposing private fields');
});

test('C021 missing new-host access while checkout is pending yields an actionable human gate and preserves sent truth',async()=>{
  const h=jobHarness(),before=await h.run(),pending=structuredClone(before.pending);
  h.error=Object.assign(new Error('CurrentHostPermissionMissing'),{origin});const r=await h.run();
  assert.equal(r.state,'NEEDS_USER');assert.match(r.reason,/current-host-permission-missing/);
  assert.equal(r.permissionOrigin,origin);assert.deepEqual(r.pending,pending);
  assert.equal(r.resourceWritten,true);assert.equal(r.bagAddStarted,true);
  assert.deepEqual(h.actions.map(c=>c.action),['checkout']);
});

test('C021 unrelated transport failures never invent AUTH, permission or a successful checkout',async()=>{
  const h=jobHarness(),before=await h.run();h.error=new Error('FAKE unrelated failure');const r=await h.run();
  assert.equal(r.state,'NEEDS_VERIFICATION');assert.equal(r.reason,'observation-transport-failed');
  assert.deepEqual(r.pending,before.pending);assert.equal(r.permissionOrigin??null,null);
  assert.deepEqual(h.actions.map(c=>c.action),['checkout']);
});

test('C021 delayed checkout and restart on the same bag never click checkout twice',async()=>{
  const h=jobHarness();h.make=()=>new PurchaseJob({store:{async get(k){return structuredClone(h.rows[k]??null);},async put(k,s){h.rows[k]=structuredClone(s);}},port:{async observe(){return {schema:'applebuy-merchant-read/v1',seq:++h.seq,documentId:'FAKE-bag',...structuredClone(h.current)};},async act(c){h.actions.push(structuredClone(c));return {delivered:true};},async wait(ms){h.time+=ms;}},now:()=>h.time,id:()=>`FAKE-late-${h.seq}`});
  const first=await h.run();assert.equal(first.state,'NEEDS_VERIFICATION');assert.match(first.reason,/mutation-result-unconfirmed/);
  const second=await h.run();assert.deepEqual(second.pending,first.pending);assert.deepEqual(h.actions.map(c=>c.action),['checkout']);
});

test('C021 a late human login can be read with old expiry preserved and no mutation in existing reconciliation',async()=>{
  const h=jobHarness(),before=await h.run();h.time=before.expiresAt+1;
  h.current={phase:'FULFILLMENT',verifiedStep:true,purchase,fulfillmentChoice:'unselected',extrasVerified:true};
  const r=await h.run({rebind:true});assert.equal(r.state,'NEEDS_USER');assert.equal(r.pending,null);
  assert.equal(r.expiresAt,before.expiresAt);assert.equal(r.reconcileOnly,true);
  assert.deepEqual(h.actions.map(c=>c.action),['checkout']);assert.equal(r.bagAddStarted,true);
});

for(const wrong of [{quantity:2},{model:'iPhone Duo'},{totalCny:10000}])test('C021 post-login mismatched item does not confirm the checkout: '+JSON.stringify(wrong),async()=>{
  const h=jobHarness(),before=await h.run();h.current={phase:'FULFILLMENT',verifiedStep:true,purchase:{...purchase,...wrong},fulfillmentChoice:'unselected',extrasVerified:true};
  const r=await h.run({rebind:true});assert.deepEqual(r.pending,before.pending);assert.notEqual(r.state,'CONFIRMED_UNPAID');
  assert.deepEqual(h.actions.map(c=>c.action),['checkout']);
});
