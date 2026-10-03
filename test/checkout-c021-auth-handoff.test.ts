// C021 implementation tests (Codex, actual provider-quota takeover). All DOM/API/store observations and commands
// are explicitly FAKE. No actual login, permission, merchant request, slot, order or payment is performed.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
import {PurchaseJob,TASK_KEY,VALIDATION_KEY,NO_EXTRAS,retirable} from '../web/checkout-connector/job.js';
import {ChromePort,allowedMerchantUrl} from '../web/checkout-connector/chrome-port.js';
import {withPurchaseOwner} from '../web/checkout-connector/owner.js';

const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{...NO_EXTRAS}};
const digest=createHash('sha256').update(JSON.stringify(plan)).digest('hex');
const purchase={itemVerified:true,verified:false,...plan.product,quantity:1,totalCny:9999,fulfillment:null,store:null};
const afterLogin={phase:'FULFILLMENT',verifiedStep:true,purchase,extras:false,fulfillmentChoice:'unselected'};
const auth={phase:'AUTH',verifiedStep:false};
function row(){return {schema:'applebuy-purchase-job/v1',taskId:'FAKE-original-task',plan:structuredClone(plan),planDigest:digest,tabId:7,state:'NEEDS_VERIFICATION',lastPhase:'BAG',lastDocumentId:'FAKE-bag',entryDocumentId:'FAKE-product',lastRead:3,expiresAt:200000,initialDates:null,dateCursor:0,floors:{},rejected:[],refusals:0,pending:{id:'FAKE-sent-checkout',action:'checkout',documentId:'FAKE-bag',beforePhase:'BAG',deadline:99000},finalIntent:null,orderRefHash:null,bagAddStarted:true,resourceWritten:true,untouchedFailures:0,untouchedStreak:2,quotedCny:9999,revokedGrantIds:['FAKE-revoked-start'],history:[{event:'FAKE-preserved-history'}]};}
// A store seed uses valid count invariants and deterministic dates; the only next operation ever is a FAKE recorder.
function fixedRow(){const r=row();r.untouchedFailures=2;return r;}
function jobHarness(){
  const h={row:fixedRow(),clock:100000,page:structuredClone(afterLogin),reads:0,writes:0,actions:[],waits:0,lookup:0,states:[],onRead:null};
  const store={async get(){return structuredClone(h.row);},async put(k,s){assert.equal(k,TASK_KEY);h.row=structuredClone(s);h.writes++;}};
  const port={async observe(){h.reads++;await h.onRead?.();return {schema:'applebuy-merchant-read/v1',documentId:'FAKE-after-login',seq:(h.row?.lastRead??0)+1,...structuredClone(h.page)};},async act(c){h.actions.push(structuredClone(c));h.page=auth;return {delivered:true};},async wait(){h.waits++;throw new Error('Diagnostic must not poll');},async lookupOrder(){h.lookup++;throw new Error('Diagnostic must not navigate');}};
  h.make=()=>new PurchaseJob({store,port,now:()=>h.clock,id:()=>`FAKE-new-${h.reads}`,onState:s=>h.states.push(structuredClone(s))});
  h.run=options=>h.make().run(plan,{tabId:7,planDigest:digest,mode:'reconcile',...options});return h;
}

test('C021 same-tab reconciliation confirms the old checkout in one fresh matching read and preserves identity/history/expiry',async()=>{
  const h=jobHarness(),before=structuredClone(h.row),r=await h.run();
  assert.equal(r.pending,null);assert.equal(r.state,'NEEDS_USER');assert.match(r.reason,/same-tab-read-only/);
  for(const key of ['taskId','entryDocumentId','planDigest','tabId','expiresAt','bagAddStarted','resourceWritten','revokedGrantIds','history'])assert.deepEqual(r[key],before[key]);
  assert.equal(r.reconcileOnly,undefined);assert.equal(h.reads,1);assert.equal(h.actions.length+h.waits+h.lookup,0);
});
test('C021 a supplied start grant is discarded by diagnostic reconciliation',async()=>{
  const h=jobHarness(),r=await h.run({grant:{id:'FAKE-extra-grant',start:true,expiry:999999,taskId:'wrong'}});
  assert.equal(r.pending,null);assert.deepEqual(r.revokedGrantIds,['FAKE-revoked-start']);assert.equal(h.actions.length,0);
});
test('C021 an expired task can be reconciled, but explicit purchase Resume remains expired',async()=>{
  const h=jobHarness();h.clock=h.row.expiresAt+1;const expiry=h.row.expiresAt;
  const r=await h.run();assert.equal(r.pending,null);assert.equal(r.expiresAt,expiry);assert.equal(r.reconcileOnly,undefined);
  const resumed=await h.run({mode:'purchase'});assert.equal(resumed.state,'EXPIRED');assert.equal(h.actions.length,0);
});
test('C021 diagnostic does not permanently restrict a same-tab task; a separately explicit valid Resume advances normally once',async()=>{
  const h=jobHarness();await h.run();const resumed=await h.run({mode:'purchase'});
  assert.deepEqual(h.actions.map(c=>c.action),['selectPickup']);assert.equal(resumed.pending.action,'selectPickup');assert.equal(resumed.state,'NEEDS_USER');assert.equal(resumed.reason,'auth');
});
test('C021 an existing human-rebind restriction is never cleared by diagnostic',async()=>{
  const h=jobHarness();h.row.reconcileOnly=true;await h.run();assert.equal(h.row.reconcileOnly,true);await h.run({mode:'purchase'});assert.equal(h.actions.length,0);
});
test('C021 invalid current read cannot relabel historical successful evidence as current',async()=>{
  const h=jobHarness();h.row.observationCurrent=true;h.page={schema:'FAKE-invalid-schema',phase:'AUTH'};
  const r=await h.run();assert.equal(r.reason,'invalid-or-stale-observation');assert.equal(r.observationCurrent,false);assert.equal(h.states.at(-1).observationCurrent,false);assert.equal(r.lastPhase,'BAG');assert.equal(r.pending.action,'checkout');
});
for(const page of [auth,{phase:'BAG',verifiedStep:true,purchase},{phase:'PROCESSING',verifiedStep:false},{...afterLogin,verifiedStep:false},{...afterLogin,purchase:{...purchase,quantity:2}},{...afterLogin,purchase:{...purchase,color:'白色'}},{...afterLogin,purchase:{...purchase,totalCny:10000}},{...afterLogin,extras:true}])test('C021 inconclusive/auth/processing/wrong-item/extras diagnostic retains sent checkout: '+JSON.stringify(page),async()=>{
  const h=jobHarness(),pending=structuredClone(h.row.pending);h.page=page;await h.run();
  assert.deepEqual(h.row.pending,pending);assert.equal(h.actions.length+h.waits+h.lookup,0);assert.equal(h.reads,1);
});
test('C021 unknown final submission is not navigated, resent, cleared or treated as the old checkout',async()=>{
  const h=jobHarness();h.row.pending.action='submitOrder';h.row.finalIntent={id:'FAKE-final',sent:true};const pending=structuredClone(h.row.pending);
  await h.run();assert.deepEqual(h.row.pending,pending);assert.equal(h.row.finalIntent.sent,true);assert.equal(h.actions.length+h.waits+h.lookup,0);
});
for(const state of ['absent','retired','corrupt','wrong-tab','wrong-digest','wrong-plan','mode-and-rebind'])test('C021 diagnostic never creates or rebinds incompatible saved tasks: '+state,async()=>{
  const h=jobHarness(),options={};if(state==='absent')h.row=null;
  if(state==='retired')h.row.state='RETIRED';if(state==='corrupt')h.row.pending.id=2;
  if(state==='wrong-tab')options.tabId=8;if(state==='wrong-digest')options.planDigest='FAKE-other';
  if(state==='wrong-plan')h.row.plan.product.color='白色';if(state==='mode-and-rebind')options.rebind=true;
  if(['absent','retired','corrupt','wrong-plan','mode-and-rebind'].includes(state))await assert.rejects(h.run(options));else assert.equal((await h.run(options)).state,'BLOCKED');
  assert.equal(h.reads+h.actions.length,0);if(['absent','retired','corrupt','wrong-plan','mode-and-rebind'].includes(state))assert.equal(h.writes,0);
});
for(const control of ['pause','stop'])test('C021 '+control+' while observing records the read but leaves sent pending action intact',async()=>{
  const h=jobHarness(),job=h.make(),pending=structuredClone(h.row.pending);h.onRead=()=>job[control]();
  const r=await job.run(plan,{tabId:7,planDigest:digest,mode:'reconcile'});assert.equal(r.state,control==='pause'?'PAUSED':'STOPPED');assert.deepEqual(r.pending,pending);assert.equal(h.actions.length+h.waits,0);
});

async function control(){
  const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,disabled:false,textContent:'',href:'',replaceChildren(){}});return nodes.get(id);};
  node('product').value='pro';node('tab').value='7';node('hostOrigin').value='';
  const h={nodes,row:fixedRow(),writes:0,reads:0,sessionReads:0,sessionWrites:0,actions:[],observations:0,constructors:[],requests:[],lock:'ok',localThrows:false,page:structuredClone(afterLogin),error:null};
  let barrierKind=null,blocked=false;
  h.arm=kind=>{barrierKind=kind;blocked=false;h.reached=new Promise(r=>h.entered=r);h.block=new Promise(r=>h.release=r);};
  const barrier=async kind=>{if(barrierKind===kind&&!blocked){blocked=true;h.entered();await h.block;}};
  const chrome={storage:{local:{async get(k){h.reads++;await barrier('record');if(h.localThrows)throw new Error('FAKE storage');return {[k]:structuredClone(h.row)};},async set(v){h.writes++;h.row=structuredClone(v[TASK_KEY]);}},session:{async get(){h.sessionReads++;throw new Error('Diagnostic must not read private session');},async set(){h.sessionWrites++;}}},permissions:{request(q){h.requests.push(structuredClone(q));return Promise.resolve(true);}}};
  class FakePort{constructor(api,tabId,options){this.options=options;this.seq=options.initialSequence??0;h.constructors.push(structuredClone(options));}async observe(){h.observations++;await barrier('observe');if(h.error)throw h.error;return {schema:'applebuy-merchant-read/v1',seq:++this.seq,documentId:'FAKE-authenticated-doc',...structuredClone(h.page)};}async act(c){h.actions.push(c);throw new Error('Diagnostic must not act');}}
  const locks={async request(name,opt,fn){await barrier('lock');if(h.lock==='error')throw new Error('FAKE lock');return fn(h.lock==='busy'?null:{});}};
  const context=vm.createContext({document:{getElementById:node},chrome,navigator:{get locks(){return h.lock==='absent'?null:locks;}},crypto:{subtle:{async digest(...args){await barrier('digest');return webcrypto.subtle.digest(...args);}},randomUUID:()=>webcrypto.randomUUID()},TextEncoder,Date,URL,structuredClone,PurchaseJob,ChromePort:FakePort,allowedMerchantUrl,withPurchaseOwner,TASK_KEY,VALIDATION_KEY,NO_EXTRAS,retirable});
  const source=readFileSync(new URL('../web/checkout-connector/control.js',import.meta.url),'utf8').replace(/^import .*;\r?$/gm,'');
  await vm.runInContext('(async()=>{'+source+'\n})()',context);
  h.click=id=>nodes.get(id).onclick();h.status=()=>node('state').textContent;return h;
}
test('C021 control reconciliation requires no purchase checkbox and supplies an unauthorized observe-only port with no private reads',async()=>{
  const h=await control();assert.equal(h.nodes.get('approve')?.checked??false,false);await h.click('reconcile');
  assert.equal(h.row.pending,null);assert.equal(h.actions.length+h.sessionReads+h.sessionWrites,0);assert.equal(h.constructors[0].authorized,false);assert.equal(h.constructors[0].mode,'observe');assert.equal(h.constructors[0].privatePickupData,undefined);assert.equal(h.constructors[0].reviewGrant,undefined);assert.equal(h.observations,1);
});
for(const gate of ['absent','retired','wrong-tab','wrong-product','storage','lock-busy','lock-error','locks-absent'])test('C021 control diagnostic preserves task and never observes across gate: '+gate,async()=>{
  const h=await control();if(gate==='absent')h.row=null;if(gate==='retired')h.row.state='RETIRED';if(gate==='wrong-tab')h.nodes.get('tab').value='8';if(gate==='wrong-product')h.nodes.get('product').value='duo';if(gate==='storage')h.localThrows=true;if(gate==='lock-busy')h.lock='busy';if(gate==='lock-error')h.lock='error';if(gate==='locks-absent')h.lock='absent';
  const before=structuredClone(h.row);await assert.doesNotReject(h.click('reconcile'));assert.deepEqual(h.row,before);assert.equal(h.writes+h.observations+h.actions.length+h.sessionReads,0);
});
for(const action of ['pause','stop'])for(const barrier of ['lock','record','digest'])test('C021 control '+action+' during '+barrier+' cancels preparation before task/observation',async()=>{
  const h=await control();h.arm(barrier);const before=structuredClone(h.row),run=h.click('reconcile');await h.reached;h.click(action);h.release();await run;assert.deepEqual(h.row,before);assert.equal(h.writes+h.observations+h.actions.length+h.sessionReads,0);assert.match(h.status(),/进行中的准备已取消/);
});
test('C021 AUTH status names checkout and instructs a readonly login handoff, not Start',async()=>{
  const h=await control();h.page=auth;await h.click('reconcile');assert.match(h.status(),/待确认动作：结账/);assert.match(h.status(),/登录后核对原任务/);assert.equal(h.row.pending.action,'checkout');
});
test('C021 native binding diagnostic distinguishes an old tab from purchase conditions, retaining both records',async()=>{
  const h=await control(),before=structuredClone(h.row);h.nodes.get('tab').value='8';await h.click('reconcile');assert.match(h.status(),/标签页与原任务不同/);assert.match(h.status(),/原任务：iPhone 18 Pro · 标签页 7/);assert.match(h.status(),/当前：iPhone 18 Pro · 标签页 8/);assert.deepEqual(h.row,before);assert.equal(h.writes+h.observations+h.actions.length,0);
});
test('C021 native binding diagnostic distinguishes a different requested product and never silently changes it',async()=>{
  const h=await control(),before=structuredClone(h.row);h.nodes.get('product').value='duo';await h.click('reconcile');assert.match(h.status(),/购买条件与原任务不同/);assert.match(h.status(),/原任务：iPhone 18 Pro/);assert.match(h.status(),/当前：iPhone Duo/);assert.deepEqual(h.row,before);assert.equal(h.nodes.get('product').value,'duo');assert.equal(h.writes+h.observations+h.actions.length,0);
});
test('C021 binding status never echoes arbitrary saved model/contact/credential strings',async()=>{
  const h=await control();h.row.plan.product.model='FAKE-private-secret';h.row.planDigest='FAKE-other-digest';h.row.plan.contact='FAKE-sensitive-contact';await h.click('reconcile');assert.match(h.status(),/型号记录无法确认/);assert.doesNotMatch(h.status(),/FAKE-private-secret|FAKE-sensitive-contact/);assert.equal(h.writes+h.observations+h.actions.length,0);
});
test('C021 permission status qualifies the stale BAG read and supplies only the exact observed secure origin',async()=>{
  const h=await control();h.error=Object.assign(new Error('CurrentHostPermissionMissing'),{origin:'https://secure6.www.apple.com.cn'});await h.click('reconcile');assert.match(h.status(),/最近已读页面：BAG/);assert.match(h.status(),/主机尚未获访问权限/);assert.match(h.status(),/待确认动作：结账/);assert.equal(h.nodes.get('hostOrigin').value,'https://secure6.www.apple.com.cn');
});
for(const origin of ['https://secure6.www.apple.com.cn?secret=FAKE','https://secure6.www.apple.com.cn/','https://www.apple.com.cn.example.org','https://idmsa.apple.com.cn','http://secure6.www.apple.com.cn','https://secure6.www.apple.com.cn:443'])test('C021 untrusted permission-error origin is neither echoed nor treated as known access gate: '+origin,async()=>{
  const h=await control();h.error=Object.assign(new Error('CurrentHostPermissionMissing'),{origin});await h.click('reconcile');assert.doesNotMatch(h.status(),/secret|example.org|idmsa|:443/);assert.equal(h.row.state,'NEEDS_VERIFICATION');assert.equal(h.row.permissionOrigin,undefined);assert.equal(h.nodes.get('hostOrigin')?.value??'','');
});
test('C021 explicit human host entry requests only that validated declared origin, even with opaque unselected tab',async()=>{
  const h=await control();h.nodes.get('tab').value='';h.nodes.get('hostOrigin').value='https://secure6.www.apple.com.cn';const before=structuredClone(h.row);await h.click('permission');assert.deepEqual(h.requests,[{origins:['https://secure6.www.apple.com.cn/*']}]);assert.deepEqual(h.row,before);assert.equal(h.writes+h.observations+h.actions.length+h.sessionReads,0);
});
test('C021 invalid manually entered host requests nothing and changes no task',async()=>{
  const h=await control();h.nodes.get('hostOrigin').value='https://secure6.www.apple.com.cn/shop/checkout?FAKE';await h.click('permission');assert.equal(h.requests.length+h.writes+h.observations+h.actions.length,0);assert.match(h.status(),/未申请权限/);
});
test('C021 Observe keeps its original no-task/no-write contract',async()=>{
  const h=await control(),reads=h.reads;await h.click('observe');assert.equal(h.reads,reads);assert.equal(h.writes+h.actions.length+h.sessionReads,0);
});
test('C021 HTML supplies the existing-origin handoff and exact readonly control',()=>{
  const html=readFileSync(new URL('../web/checkout-connector/control.html',import.meta.url),'utf8');assert.match(html,/id="reconcile"/);assert.match(html,/id="hostOrigin"/);assert.doesNotMatch(html,/<input[^>]*type="password"/);
});
