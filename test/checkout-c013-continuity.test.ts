// C-013-R1 implementation tests (Claude). Every browser API, document, store, choice and merchant observation here is
// explicitly FAKE/synthetic. Nothing establishes a live Apple contract, and no real or mock merchant order is submitted.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
import {PurchaseJob,TASK_KEY,VALIDATION_KEY,NO_EXTRAS,retirable,validStored} from '../web/checkout-connector/job.js';
import {withPurchaseOwner} from '../web/checkout-connector/owner.js';
import {merchantDocument} from '../web/checkout-connector/page-program.js';

const plan={schema:'applebuy-intent/v1',product:{model:'iPhone Duo',capacity:'256GB',color:'星光白色'},quantity:1,maxTotalCny:15999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{...NO_EXTRAS}};
const purchase={itemVerified:true,verified:true,...plan.product,quantity:1,totalCny:15999,store:plan.stores[0],fulfillment:'pickup'};
const terms='https://www.apple.com.cn/shop/open/salespolicies';
// Monotonic across harnesses so a restarted job sees fresh observation sequences.
let clock=100000,seq=0,serial=0;

// ---------- control page harness (FAKE DOM, storage and Web Locks; the job is a facade that only records its grant) ----------
async function control(){
  const nodes=new Map(),calls=[];
  const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,disabled:false,href:'',textContent:''});return nodes.get(id);};
  node('product').value='duo';node('tab').value='7';node('approve').checked=true;node('finalReview').checked=true;node('terms').href=terms;
  const row={schema:'applebuy-purchase-job/v1',taskId:'FAKE-task',planDigest:createHash('sha256').update(JSON.stringify(plan)).digest('hex'),lastPhase:'REVIEW',lastDocumentId:'FAKE-doc',finalIntent:null,resourceWritten:false,bagAddStarted:false,pending:null};
  const h={nodes,calls,row,lock:'ok',localThrows:false,sessionThrows:false,retireCalls:0,writes:0,state:()=>nodes.get('state').textContent,click:id=>nodes.get(id).onclick()};
  class JobFacade{
    constructor(){this.port={last:null};}
    async run(p,options){calls.push(structuredClone(options));return {state:'NEEDS_USER',lastPhase:'REVIEW',finalIntent:null};}
    async retire(){h.retireCalls++;}
    pause(){} stop(){}
  }
  const lockApi={async request(name,options,fn){if(h.lock==='error')throw new Error('FAKE lock failure');return fn(h.lock==='busy'?null:{});}};
  const chrome={storage:{local:{async get(){if(h.localThrows)throw new Error('FAKE storage failure');return {[TASK_KEY]:structuredClone(h.row)};},async set(){h.writes++;}},session:{async get(){if(h.sessionThrows)throw new Error('FAKE session failure');return {};},async set(){h.writes++;}}}};
  const navigator={get locks(){return h.lock==='absent'?null:lockApi;}};
  const context=vm.createContext({document:{getElementById:node},chrome,navigator,crypto:webcrypto,TextEncoder,Date,URL,structuredClone,PurchaseJob:JobFacade,ChromePort:class {},allowedMerchantUrl:()=>true,withPurchaseOwner,TASK_KEY,VALIDATION_KEY,NO_EXTRAS,retirable});
  const source=readFileSync(new URL('../web/checkout-connector/control.js',import.meta.url),'utf8').replace(/^import .*;\r?$/gm,'');
  await vm.runInContext('(async()=>{'+source+'\n})()',context);return h;
}

test('C013-R1 P3-1: a storage failure while building a final grant is a visible gate and arms nothing',async()=>{
  const h=await control();h.localThrows=true;
  await assert.doesNotReject(h.click('final'));assert.equal(h.calls.length,0);assert.match(h.state(),/最终确认未完成/);
  h.localThrows=false;await h.click('resume');assert.equal(h.calls.length,1);assert.equal(h.calls[0].grant,null);
});
test('C013-R1 P3-1: missing Web Locks or a lock error during final confirmation arms nothing',async()=>{
  const h=await control();h.lock='absent';
  await h.click('final');assert.equal(h.calls.length,0);assert.match(h.state(),/互斥/);
  h.lock='error';await assert.doesNotReject(h.click('final'));assert.equal(h.calls.length,0);assert.match(h.state(),/未能安全开始/);
  h.lock='ok';await h.click('resume');assert.equal(h.calls.length,1);assert.equal(h.calls[0].grant,null);
});
test('C013-R1 P3-1: an exception inside the owned run is caught and the next Resume has no grant',async()=>{
  const h=await control();h.sessionThrows=true;
  await assert.doesNotReject(h.click('final'));assert.equal(h.calls.length,0);assert.match(h.state(),/执行已停止/);
  h.sessionThrows=false;await h.click('resume');assert.equal(h.calls[0].grant,null);
});
test('C013-R1 P3-1: a Start refused for a missing read-only preflight carries no advance grant',async()=>{
  const h=await control();await h.click('start');assert.equal(h.calls.length,0);assert.match(h.state(),/重新只读预检/);
  await h.click('resume');assert.equal(h.calls.length,1);assert.equal(h.calls[0].grant,null);
});
test('C013-R1 P3-1: each explicit approved confirmation hands off exactly one distinct grant; durable sent truth refuses a new one',async()=>{
  const h=await control();const before=Date.now();
  await h.click('final');await h.click('resume');await h.click('final');
  assert.equal(h.calls.length,3);assert.equal(h.calls[1].grant,null);
  const [a,b]=[h.calls[0].grant,h.calls[2].grant];
  for(const g of [a,b]){assert.equal(g.taskId,'FAKE-task');assert.equal(g.documentId,'FAKE-doc');assert.equal(g.termsUrl,terms);assert.ok(g.expiry>before&&g.expiry<=Date.now()+120000);}
  assert.notEqual(a.id,b.id);
  h.row.finalIntent={id:'FAKE-intent',sent:true};await h.click('final');assert.equal(h.calls.length,3);assert.match(h.state(),/不能发出新的最终订单/);
  await h.click('resume');assert.equal(h.calls[3].grant,null);assert.equal(h.writes,0,'the control page never rewrites the durable record');
});
test('C013-R1 P3-2: retirement lock errors, busy owner and storage failures change nothing; a retirable task still retires',async()=>{
  const h=await control();
  h.lock='error';await assert.doesNotReject(h.click('retire'));assert.equal(h.state(),'退役未完成；记录保持不变');
  h.lock='busy';await h.click('retire');assert.match(h.state(),/另一控制页/);
  h.lock='ok';h.localThrows=true;await assert.doesNotReject(h.click('retire'));assert.equal(h.state(),'退役未完成；记录保持不变');
  assert.equal(h.retireCalls,0);assert.equal(h.writes,0);
  h.localThrows=false;await h.click('retire');assert.equal(h.retireCalls,1);
});

// ---------- page program at the observed AUTH route (FAKE document memo; the DOM must never be read) ----------
function authProgram(memo){
  const deny=()=>{throw new Error('AUTH must not read DOM');};
  const context=vm.createContext({location:{href:'https://secure11.www.apple.com.cn/shop/signIn/orders'},URL,document:{querySelector:deny,querySelectorAll:deny},...(memo===undefined?{}:{__applebuyExecuted:memo})});
  const fn=vm.runInContext('('+merchantDocument.toString()+')',context);return async(...args)=>structuredClone(await fn(...args));
}
const command=id=>({id,taskId:'FAKE-task',authorized:true,structured:true,action:'selectStore'});
test('C013-R1 P3-3: AUTH keeps memoized delivery conservative, reports only a fresh command untouched and never extends the memo',async()=>{
  const memo=new Set(['FAKE-delivered']);const run=authProgram(memo);
  await assert.rejects(run(plan,{...command('FAKE-delivered'),structured:false}),/OperationAlreadyDelivered/);
  assert.deepEqual(await run(plan,command('FAKE-delivered')),{delivered:false,touched:true,reason:'OperationAlreadyDelivered'});
  assert.deepEqual(await run(plan,command('FAKE-fresh')),{delivered:false,touched:false,reason:'AuthenticationRequired'});
  await assert.rejects(run(plan,{...command('FAKE-fresh'),structured:false}),/AuthenticationRequired/);
  assert.deepEqual([...memo],['FAKE-delivered']);
  assert.deepEqual(await authProgram()(plan,command('FAKE-fresh')),{delivered:false,touched:false,reason:'AuthenticationRequired'});
  const o=await run(plan);assert.equal(o.phase,'AUTH');assert.equal(o.verifiedStep,false);
});

// ---------- job harness (FAKE merchant observations; act records commands only) ----------
function memoryStore(){const s={rows:{},async get(k){return structuredClone(s.rows[k]??null);},async put(k,v){s.rows[k]=structuredClone(v);}};return s;}
function harness(current,{store=memoryStore(),act=()=>({delivered:true}),onWait=()=>{},options={}}={}){
  const h={store,current,actions:[],waits:0};
  const port={
    async observe(){const o=typeof h.current==='function'?h.current(h):h.current;return {schema:'applebuy-merchant-read/v1',documentId:'FAKE-doc',verifiedStep:true,...structuredClone(o),seq:++seq};},
    async act(c){h.actions.push(structuredClone(c));return act(c,h);},
    async wait(n){clock+=n;h.waits++;onWait(h);}
  };
  h.job=new PurchaseJob({store,port,now:()=>clock,id:()=>`FAKE-${++serial}`,...options});
  h.run=(mode='purchase')=>h.job.run(plan,{tabId:7,planDigest:'FAKE-digest',mode});return h;
}
const untouched=()=>({delivered:false,touched:false,reason:'FAKEEvidenceChanged'});

test('C013-R1 P3-3: a touched report never counts as untouched; the pending action is kept and AUTH stops for a person',async()=>{
  const h=harness({phase:'FULFILLMENT',purchase:{...purchase,verified:false,store:null},fulfillmentChoice:'pickup'},{act:(c,x)=>{x.current={phase:'AUTH',verifiedStep:false};return {delivered:false,touched:true,reason:'OperationAlreadyDelivered'};}});
  const r=await h.run();
  assert.equal(r.reason,'auth');assert.equal(r.state,'NEEDS_USER');assert.equal(h.actions.length,1);assert.equal(r.pending.action,'selectStore');
  assert.equal(r.untouchedFailures,0);assert.equal(r.untouchedStreak,0);assert.equal((r.history??[]).length,0);
});

test('C013-R1 P3-5: restart, touched/unproven results and repeated lists never reset the consecutive bound; verified progress does',async()=>{
  const store=memoryStore();let selected=[],next='FAKE-choice-a';
  const page=()=>({phase:'ENTRY',nextChoice:{choice:next,state:'enabled'},selectedProductChoices:[...selected]});
  // Three untouched failures, then the step bound: the durable streak is 3.
  let r=await harness(page,{store,act:untouched,options:{maxSteps:3}}).run();
  assert.equal(r.reason,'step-bound-reached');assert.equal(r.untouchedStreak,3);assert.equal(r.untouchedFailures,3);
  // A touched (unknown) report is not untouched; its effect is never proven, so it is not repeated and resets nothing.
  const t=harness(page,{store,act:()=>({delivered:false,touched:true})});r=await t.run();
  assert.equal(r.reason,'mutation-result-unconfirmed; no automatic repeat');assert.equal(t.actions.length,1);assert.equal(r.untouchedStreak,3);assert.equal(r.pending.choice,'FAKE-choice-a');
  // Restart with the same unproven page: reconciliation only, no repeat, no reset.
  const u=harness(page,{store,act:untouched});r=await u.run();
  assert.equal(r.reason,'mutation-result-unconfirmed; no automatic repeat');assert.equal(u.actions.length,0);assert.equal(r.untouchedStreak,3);
  // Verified progress of the delivered choice resets the streak; a full consecutive allowance follows, then the bound stops.
  selected=['FAKE-choice-a'];next='FAKE-choice-b';
  const v=harness(page,{store,act:untouched});r=await v.run();
  assert.equal(r.reason,'repeated-untouched-failures; human check required');assert.equal(v.actions.length,4);
  assert.ok(v.actions.every(c=>c.choice==='FAKE-choice-b'));assert.equal(r.untouchedStreak,4);assert.equal(r.untouchedFailures,7);assert.equal(r.pending,null);
  // Once exhausted, a restart without progress allows exactly one further attempt before stopping again.
  const w=harness(page,{store,act:untouched});r=await w.run();assert.equal(w.actions.length,1);assert.equal(r.untouchedStreak,5);
});

test('C013-R1 P3-5: a public-configuration restart on the same tab and intent keeps the consecutive count',async()=>{
  const store=memoryStore(),page={phase:'ENTRY',nextChoice:{choice:'FAKE-choice',state:'enabled'},selectedProductChoices:[]};
  let r=await harness(page,{store,act:untouched,options:{maxSteps:3}}).run('public-config');assert.equal(r.untouchedStreak,3);
  const h=harness(page,{store,act:untouched});r=await h.run('public-config');
  assert.equal(r.reason,'repeated-untouched-failures; human check required');assert.equal(h.actions.length,1);assert.equal(store.rows[TASK_KEY],undefined);
});

test('C013-R1 P3-5: legacy records count every untouched failure as consecutive; malformed streaks are rejected',async()=>{
  const store=memoryStore();await harness({phase:'AUTH',verifiedStep:false},{store}).run();
  const row=store.rows[TASK_KEY];delete row.untouchedStreak;row.untouchedFailures=3;assert.equal(validStored(row),true);
  const h=harness({phase:'ENTRY',nextChoice:{choice:'FAKE-choice',state:'enabled'}},{store,act:untouched});const r=await h.run();
  assert.equal(r.reason,'repeated-untouched-failures; human check required');assert.equal(h.actions.length,1);assert.equal(r.untouchedStreak,4);
  for(const bad of [-1,1.5,'1',null,4]){assert.equal(validStored({...row,untouchedFailures:3,untouchedStreak:bad}),false);}
  assert.equal(validStored({...row,untouchedFailures:3,untouchedStreak:2}),true);
  // A streak without a recorded total migrates conservatively: the total is at least the streak.
  const {untouchedFailures,...noTotal}=store.rows[TASK_KEY];store.rows[TASK_KEY]={...noTotal,untouchedStreak:3};assert.equal(validStored(store.rows[TASK_KEY]),true);
  const m=harness({phase:'ENTRY',nextChoice:{choice:'FAKE-choice',state:'enabled'}},{store,act:untouched});const out=await m.run();
  assert.equal(m.actions.length,1);assert.equal(out.untouchedStreak,4);assert.equal(out.untouchedFailures,4);assert.equal(out.reason,'repeated-untouched-failures; human check required');
});

test('C013-R1 P3-5: alternating progress cannot loop; the per-run absolute untouched bound stops it',async()=>{
  const selected=[];let stage=0;const tried=new Set();
  const page=()=>({phase:'ENTRY',nextChoice:{choice:'FAKE-choice-'+stage,state:'enabled'},selectedProductChoices:[...selected]});
  const h=harness(page,{act:c=>{if(!tried.has(stage)){tried.add(stage);return untouched();}selected.push(c.choice);stage++;return {delivered:true};},options:{maxSteps:100}});
  const r=await h.run('public-config');
  assert.equal(r.state,'NEEDS_VERIFICATION');assert.equal(r.reason,'untouched-failure-run-limit; human check required');
  assert.equal(h.actions.length,25);assert.equal(r.untouchedFailures,13);assert.equal(r.untouchedStreak,1);
});

const fulfillment=(extra={})=>({phase:'FULFILLMENT',purchase:structuredClone(purchase),fulfillmentChoice:'pickup',...extra});
test('C013-R1 P3-6: never-ending loading of a selected store is a bounded NOT_READY gate with no click and no implied slot',async()=>{
  const h=harness(fulfillment());const r=await h.run();
  assert.equal(r.state,'NOT_READY');assert.match(r.reason,/selected-store-controls-not-loaded/);assert.match(r.reason,/no slot held/);
  assert.equal(h.actions.length,0);assert.ok(h.waits>0&&h.waits<=601,'elapsed-time bounded');assert.equal(r.pending,null);assert.equal(r.acceptedSlot,undefined);
});
test('C013-R1 P3-6: an unselected, unverified or disallowed store still receives one normal selection',async()=>{
  const cases=[
    [fulfillment({purchase:{...purchase,verified:false,store:null}}),'selectStore'],
    [fulfillment({purchase:{...purchase,store:'Apple 合成其他门店'}}),'selectStore'],
    [fulfillment({fulfillmentChoice:undefined}),'selectStore'],
    [fulfillment({fulfillmentChoice:'unselected',purchase:{...purchase,verified:false,store:null,fulfillment:null}}),'selectPickup']
  ];
  for(const [page,action] of cases){
    const h=harness(page,{act:(c,x)=>{x.current={phase:'AUTH',verifiedStep:false};return {delivered:true};}});await h.run();
    assert.deepEqual(h.actions.map(c=>c.action),[action]);if(action==='selectStore')assert.equal(h.actions[0].store,'Apple 大连恒隆广场');
  }
});
test('C013-R1 P3-6: contradictory evidence or authentication during the wait stops without clicking',async()=>{
  const changes=[
    [{...fulfillment({purchase:{...purchase,verified:false,store:null}})},'NEEDS_VERIFICATION',/selected-store-evidence-changed-while-loading/],
    [{...fulfillment({fulfillmentChoice:'delivery',purchase:{...purchase,verified:false,fulfillment:null}})},'NEEDS_VERIFICATION',/selected-store-evidence-changed-while-loading/],
    [{...fulfillment({purchase:{...purchase,totalCny:16999}})},'BLOCKED',/pickup-conditions-not-verified/],
    [{phase:'AUTH',verifiedStep:false},'NEEDS_USER',/^auth$/]
  ];
  for(const [later,state,reason] of changes){
    const h=harness(fulfillment(),{onWait:x=>{if(x.waits===2)x.current=later;}});const r=await h.run();
    assert.equal(r.state,state);assert.match(r.reason,reason);assert.equal(h.actions.length,0);assert.equal(h.waits,2);
  }
  // A processing interval belongs to the same wait episode: a store changed after it still stops.
  const p=harness(fulfillment(),{onWait:x=>{if(x.waits===1)x.current={phase:'PROCESSING',verifiedStep:false};if(x.waits===2)x.current=fulfillment({purchase:{...purchase,verified:false,store:null}});}});
  const r=await p.run();assert.match(r.reason,/selected-store-evidence-changed-while-loading/);assert.equal(p.actions.length,0);
});
