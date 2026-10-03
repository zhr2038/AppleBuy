// C030 Codex genuine-quota takeover. Every merchant fact, store, Chrome API and authority here is FAKE.
// This does not inspect actual extension storage or establish an Apple slot/order contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto,createHash} from 'node:crypto';
import {PurchaseJob,TASK_KEY,VALIDATION_KEY,NO_EXTRAS,retirable,validStored} from '../web/checkout-connector/job.js';
import {withPurchaseOwner} from '../web/checkout-connector/owner.js';
const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{...NO_EXTRAS}};
const digest=createHash('sha256').update(JSON.stringify(plan)).digest('hex');
const row=(patch={})=>({schema:'applebuy-purchase-job/v1',taskId:'FAKE-c030-old',plan:structuredClone(plan),planDigest:digest,tabId:7,state:'NEEDS_USER',lastPhase:'BAG',lastDocumentId:'FAKE-old-bag-doc',entryDocumentId:'FAKE-old-entry',reason:'read-only-reconciliation-complete; a rebound tab cannot add purchase authority',pending:null,finalIntent:null,orderRefHash:null,initialDates:null,dateCursor:0,floors:{},rejected:[],refusals:0,lastRead:10,expiresAt:900,bagAddStarted:true,resourceWritten:true,untouchedFailures:0,untouchedStreak:0,quotedCny:9999,bagTotalCny:9999,reconcileOnly:true,mode:'purchase',revokedGrantIds:['FAKE-old-authority'],history:[{event:'human-tab-rebind',fromTabId:6,toTabId:7,at:500}],...patch});
const observation=(patch={})=>({schema:'applebuy-merchant-read/v1',phase:'BAG',documentId:'FAKE-c030-current-doc',seq:11,verifiedStep:true,extras:false,purchase:{...plan.product,itemVerified:true,verified:false,quantity:1,totalCny:9999,store:null,fulfillment:null},...patch});
function harness(initial=row()){
 const h={row:structuredClone(initial),writes:0,reads:0,acts:[],observes:0,observation:observation(),phase:'BAG',getHook:null,observeHook:null};
 const store={get:async k=>{assert.equal(k,TASK_KEY);h.reads++;await h.getHook?.(h);return structuredClone(h.row);},put:async(k,s)=>{assert.equal(k,TASK_KEY);h.writes++;h.row=structuredClone(s);}};
 let seq=10;const port={observe:async()=>{h.observes++;await h.observeHook?.(h);return {...structuredClone(h.observation),phase:h.phase,seq:Math.max(++seq,h.observation.seq)};},act:async c=>{h.acts.push(c.action);h.phase='AUTH';return {delivered:true};}};
 h.job=new PurchaseJob({store,port,now:()=>1000,id:()=> 'FAKE-c030-new'});h.store=store;h.port=port;h.retire=opts=>h.job.retireReadOnlyBag(plan,{tabId:7,planDigest:digest,...opts});return h;
}
test('C030 reproduces the old liveness stop: mutated read-only bag cannot use untouched retirement or advance',async()=>{
 const h=harness(),before=structuredClone(h.row);assert.equal(retirable(h.row),false);await assert.rejects(h.job.retire(),/TaskHasMerchantMutationHistory/);assert.deepEqual(h.row,before);assert.equal(h.writes,0);
 // Use a not-expired record to isolate permanent read-only behaviour from timeout.
 h.row.expiresAt=100000;const result=await h.job.run(plan,{tabId:7,planDigest:digest});assert.equal(result.reason,'read-only-reconciliation-complete; a rebound tab cannot add purchase authority');assert.deepEqual(h.acts,[]);
});
test('C030 explicit resolved-readonly retirement preserves history, never acts, and starts a distinct bag checkout without adding',async()=>{
 const h=harness(),before=structuredClone(h.row),retired=await h.retire();assert.equal(retired.state,'RETIRED');assert.equal(validStored(retired),true);assert.equal(retired.reconcileOnly,true);assert.deepEqual(retired.history,before.history);assert.deepEqual(h.acts,[]);assert.equal(h.observes,1);assert.equal(h.writes,1);
 for(const [k,v] of Object.entries(before))if(!['state','reason','observationCurrent'].includes(k))assert.deepEqual(retired[k],v,'preserved '+k);
 assert.equal(retired.readOnlyRetirement.previousState,before.state);assert.equal(retired.readOnlyRetirement.previousReason,before.reason);
 const result=await new PurchaseJob({store:h.store,port:h.port,now:()=>1000,id:()=> 'FAKE-c030-new'}).run(plan,{tabId:7,planDigest:digest});
 assert.equal(result.taskId,'FAKE-c030-new');assert.equal(result.reconcileOnly,undefined);assert.deepEqual(result.retiredHistory,[retired]);assert.equal(result.finalIntent,null);assert.equal(result.reason,'auth');assert.deepEqual(h.acts,['checkout']);
});
test('C030 duplicate retirement is idempotent and never rereads or replaces the record',async()=>{
 const h=harness();await h.retire();const before=structuredClone(h.row);await h.retire();assert.deepEqual(h.row,before);assert.equal(h.writes,1);assert.equal(h.observes,1);assert.deepEqual(h.acts,[]);
});
const pending={id:'FAKE-unknown-checkout',documentId:'FAKE-doc',action:'checkout',deadline:900};
const unsafeRows={
 'not permanently read-only':{reconcileOnly:false},
 'pending unknown checkout':{pending},
 'final intent even unsent':{finalIntent:{id:'FAKE-final',sent:false}},
 'unknown sent final':{finalIntent:{id:'FAKE-final',sent:true},pending:{...pending,action:'submitOrder'}},
 'order reference':{orderRefHash:'a'.repeat(64)},
 'slot dates were bound':{initialDates:['FAKE-date']},
 'date cursor advanced':{dateCursor:1},
 'refusal recorded':{refusals:1},
 'rejected slot':{rejected:[{date:'FAKE-date',start:'21:15',end:'21:30',generation:1}]},
 'slot floor':{floors:{'FAKE-date':'21:15'}},
 'accepted slot':{acceptedSlot:{date:'FAKE-date',start:'21:15',end:'21:30',verified:true}},
 'later checkout stage':{lastPhase:'DETAILS'},
 'earlier unknown action proof is absent':{resourceWritten:undefined},
 'unknown prior retired final':{retiredHistory:[row({state:'RETIRED',finalIntent:{id:'FAKE-final',sent:false}})]}
};
for(const [name,patch] of Object.entries(unsafeRows))test('C030 unsafe old task stays preserved with no observe/action: '+name,async()=>{
 const h=harness(row(patch)),before=structuredClone(h.row);await assert.rejects(h.retire(),/ReadOnlyBagTaskNotResolved/);assert.deepEqual(h.row,before);assert.equal(h.writes,0);assert.equal(h.observes,0);assert.deepEqual(h.acts,[]);
});
const badPages={
 'AUTH':{phase:'AUTH'},'not verified step':{verifiedStep:false},'extras unknown':{extras:null},'extras present':{extras:true},'old sequence':{seq:0},'missing document':{documentId:''},
 'quantity two':{purchase:{...observation().purchase,quantity:2}},'wrong colour':{purchase:{...observation().purchase,color:'白色'}},'over cap':{purchase:{...observation().purchase,totalCny:10000}},'missing item proof':{purchase:{...observation().purchase,itemVerified:false}}
};
for(const [name,patch] of Object.entries(badPages))test('C030 inconclusive current bag cannot retire: '+name,async()=>{
 const h=harness(),before=structuredClone(h.row);h.observation=observation(patch);h.phase=h.observation.phase;
 // Sequence normally comes from the port; deliberately inject a stale response here.
 if(name==='old sequence')h.job.port={observe:async()=>h.observation};
 await assert.rejects(h.retire(),/CurrentOneItemBagNotVerified/);assert.deepEqual(h.row,before);assert.equal(h.writes,0);assert.deepEqual(h.acts,[]);
});
for(const opts of [{tabId:8},{planDigest:'FAKE-other-digest'}])test('C030 changed binding cannot retire: '+JSON.stringify(opts),async()=>{
 const h=harness(),before=structuredClone(h.row);await assert.rejects(h.retire(opts),/ExistingTaskBindingDiffers/);assert.deepEqual(h.row,before);assert.equal(h.writes,0);assert.equal(h.observes,0);
});
test('C030 a changed valid plan cannot retire the old task',async()=>{const h=harness(),p={...plan,maxTotalCny:9000};await assert.rejects(h.job.retireReadOnlyBag(p,{tabId:7,planDigest:digest}),/ExistingTaskBindingDiffers/);assert.equal(h.writes,0);});
test('C030 observation error leaves every record intact',async()=>{const h=harness(),before=structuredClone(h.row);h.observeHook=()=>{throw Error('FAKE read failed');};await assert.rejects(h.retire(),/FAKE read failed/);assert.deepEqual(h.row,before);assert.equal(h.writes,0);assert.deepEqual(h.acts,[]);});
test('C030 pause during observation cancels retirement without writes',async()=>{const h=harness(),before=structuredClone(h.row);h.observeHook=()=>h.job.pause();await assert.rejects(h.retire(),/ReadOnlyRetirementCancelled/);assert.deepEqual(h.row,before);assert.equal(h.writes,0);});
test('C030 intervening storage replacement cannot be overwritten by retirement',async()=>{const h=harness();h.observeHook=()=>{h.row.taskId='FAKE-other-owner';};await assert.rejects(h.retire(),/StoredTaskChangedDuringRetirement/);assert.equal(h.row.taskId,'FAKE-other-owner');assert.equal(h.writes,0);assert.deepEqual(h.acts,[]);});
for(const mode of ['same-task','old-grant','revoked-grant'])test('C030 a new run cannot resurrect old identity/authority: '+mode,async()=>{
 const h=harness();await h.retire();const before=structuredClone(h.row),opts={tabId:7,planDigest:digest};if(mode==='same-task')opts.taskId=before.taskId;else opts.grant={id:mode==='old-grant'?'FAKE-grant':'FAKE-old-authority',taskId:mode==='old-grant'?before.taskId:'FAKE-c030-new'};
 await assert.rejects(h.job.run(plan,opts),/RetiredReadOnlyAuthorityCannotBeReused/);assert.deepEqual(h.row,before);assert.deepEqual(h.acts,[]);
});
test('C030 a retired marker cannot hide a newly found unknown final or slot fact',async()=>{
 for(const patch of [{finalIntent:{id:'FAKE-newly-found-final',sent:false}},{initialDates:['FAKE-old-slot-date']},{pending}]){
  const h=harness();await h.retire();Object.assign(h.row,patch);const before=structuredClone(h.row);
  await assert.rejects(h.retire(),/ReadOnlyBagTaskNotResolved/);await assert.rejects(h.job.run(plan,{tabId:7,planDigest:digest}),/RetiredReadOnlyAuthorityCannotBeReused/);
  assert.deepEqual(h.row,before);assert.deepEqual(h.acts,[]);assert.equal(h.writes,1);
 }
});

// Public control handler, actual controller + job, with FAKE DOM, Chrome observation and lock transport.
async function control(){
 const h=harness(),nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,disabled:false,textContent:'',href:''});return nodes.get(id);};
 node('product').value='pro';node('tab').value='7';node('approve').checked=true;node('finalReview').checked=true;h.lock='ok';h.sessionReads=0;
 const chrome={storage:{local:{get:async k=>({[k]:await h.store.get(k)}),set:async v=>{for(const [k,s] of Object.entries(v))await h.store.put(k,s);}},session:{get:async()=>{h.sessionReads++;throw Error('Private session read is forbidden for retirement');}}}};
 class FakePort{constructor(api,tabId,opts){assert.equal(opts.mode,'observe');this.opts=opts;}async observe(p){return h.port.observe(p);}}
 const locks={request:async(name,opts,fn)=>fn(h.lock==='busy'?null:{})};
 const context=vm.createContext({document:{getElementById:node},chrome,navigator:{get locks(){return h.lock==='absent'?null:locks;}},crypto:webcrypto,TextEncoder,Date,URL,structuredClone,PurchaseJob,ChromePort:FakePort,allowedMerchantUrl:()=>true,withPurchaseOwner,TASK_KEY,VALIDATION_KEY,NO_EXTRAS,retirable});
 const code=readFileSync(new URL('../web/checkout-connector/control.js',import.meta.url),'utf8').replace(/^import .*;\r?$/gm,'');await vm.runInContext('(async()=>{'+code+'\n})()',context);
 h.nodes=nodes;h.click=id=>nodes.get(id).onclick();h.status=()=>nodes.get('state').textContent;return h;
}
test('C030 public management control retires only via observation and clears all purchase controls',async()=>{
 const h=await control();await h.click('retire');assert.equal(h.row.state,'RETIRED');assert.deepEqual(h.acts,[]);assert.equal(h.sessionReads,0);assert.equal(h.nodes.get('approve').checked,false);assert.equal(h.nodes.get('finalReview').checked,false);assert.equal(h.nodes.get('final').disabled,true);assert.match(h.status(),/全部记录保留/);
});
for(const lock of ['busy','absent'])test('C030 public control without exclusive ownership cannot retire: '+lock,async()=>{const h=await control();h.lock=lock;const before=structuredClone(h.row);await h.click('retire');assert.deepEqual(h.row,before);assert.equal(h.writes,0);assert.equal(h.observes,0);assert.deepEqual(h.acts,[]);});
test('C030 public pause during observation cancels the entire old handler and preserves the old record',async()=>{const h=await control(),before=structuredClone(h.row);h.observeHook=()=>h.click('pause');await h.click('retire');assert.deepEqual(h.row,before);assert.equal(h.writes,0);assert.deepEqual(h.acts,[]);assert.equal(h.sessionReads,0);});
