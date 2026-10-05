// C058 author tests (Claude). Production ChromePort, PurchaseJob, closed-checkout probe and stored-task diagnostic run over FAKE Chrome
// API, store, clock and merchant pages. No browser, network, Apple request, personal profile, authentication, slot, order or payment.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ChromePort} from '../web/checkout-connector/chrome-port.js';
import {PurchaseJob,TASK_KEY,NO_EXTRAS,CONTACT_SLOT_BASIS} from '../web/checkout-connector/job.js';
import {probeClosedCheckout} from '../web/checkout-connector/closed-checkout-probe.js';
import {taskDiagnostic} from '../web/checkout-connector/task-diagnostic.js';

const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{...NO_EXTRAS}};
const NOW=100000;
// The old sent choice: its result is unknown and its own deadline has passed.
const pending={id:'FAKE-c058a-choice',documentId:'FAKE-c058a-slots',action:'chooseSlot',beforePhase:'SLOTS',deadline:99000,date:'october5',start:'21:15',end:'21:30',ref:'time:46',generation:1};
const purchase={...plan.product,quantity:1,totalCny:9999,itemVerified:true,verified:true,store:'Apple 大连恒隆广场',storeVerified:true,fulfillment:'pickup'};
const row=(o={})=>({schema:'applebuy-purchase-job/v1',taskId:'FAKE-c058a-task',plan:structuredClone(plan),planDigest:'FAKE-c058a-digest',tabId:6,state:'NEEDS_VERIFICATION',lastRead:4,lastPhase:'UNKNOWN',lastDocumentId:'FAKE-c058a-slots',
  expiresAt:200000,initialDates:['october5','october6'],dateCursor:0,floors:{october5:'21:15'},rejected:[],refusals:0,pending:structuredClone(pending),acceptedSlot:null,finalIntent:null,
  bagAddStarted:true,resourceWritten:true,untouchedFailures:0,untouchedStreak:0,quotedCny:9999,bagTotalCny:9999,history:[{event:'FAKE-c058a-kept'}],...o});
const page=(phase,o={})=>({schema:'applebuy-merchant-read/v1',phase,verifiedStep:true,path:'/shop/checkout',purchase:structuredClone(purchase),extras:false,dates:[],times:[],selectedDate:null,slotSummary:null,...o});
const same={date:'october5',start:'21:15',end:'21:30',verified:true},other={...same,date:'october6'};
const slotsWithRefusal=page('SLOTS',{listComplete:true,dates:[{label:'october5',ref:'date:0',enabled:true,selected:true}],selectedDate:'october5',times:[{start:'21:15',end:'21:30',ref:'time:46',enabled:true}],feedback:{kind:'slot-refused',verified:true,ref:'time:46',generation:2}});
// FAKE contact-only details step after a sent slot (C051 shape): no product/store/quantity/slot fact, only the companion total.
const contact=page('DETAILS',{contactStep:{kind:'contact-only-details',verified:true,totalCny:9999,fields:5},purchase:{itemVerified:false,verified:false,model:null,capacity:null,color:null,quantity:null,totalCny:9999,store:null,fulfillment:null},extras:null});

// FAKE Chrome over one bound tab: every read returns the given page; any command injection is recorded.
function chrome(tabId,current){
  const h={reads:0,commands:[]};
  h.api={tabs:{async get(id){assert.equal(id,tabId);return {id,url:'https://secure11.www.apple.com.cn/shop/checkout',status:'complete'};}},permissions:{async contains(){return true;}},
    scripting:{async executeScript(q){
      if(q.args.length>1){h.commands.push(q.args[1].action);return [{frameId:0,documentId:q.target.documentIds[0],result:{delivered:true}}];}
      h.reads++;return [{frameId:0,documentId:'FAKE-c058a-current',result:structuredClone(current)}];}}};
  return h;
}
// Ports exactly as control.js builds them for Start/Resume, human rebind and same-tab read-only reconciliation.
const ports={
  purchase:(api,tabId,r)=>new ChromePort(api,tabId,{authorized:true,initialSequence:r.lastRead,acceptedSlot:r.acceptedSlot??null,pending:r.pending??null,privatePickupData:{},reviewGrant:null,orderSummary:true}),
  rebind:(api,tabId,r)=>new ChromePort(api,tabId,{authorized:false,initialSequence:r.lastRead,acceptedSlot:r.acceptedSlot??null,pending:r.pending??null,privatePickupData:{},reviewGrant:null,orderSummary:false}),
  reconcile:(api,tabId,r)=>new ChromePort(api,tabId,{authorized:false,mode:'observe',initialSequence:r.lastRead,acceptedSlot:r.acceptedSlot??null,pending:r.pending??null}),
};
async function runJob(kind,{tabId,initial,current,maxSteps=3}){
  const h=chrome(tabId,current),t={row:structuredClone(initial),writes:0};
  const store={async get(k){assert.equal(k,TASK_KEY);return structuredClone(t.row);},async put(k,v){assert.equal(k,TASK_KEY);t.writes++;t.row=structuredClone(v);}};
  const options={tabId,planDigest:initial.planDigest,...(kind==='rebind'?{rebind:true}:kind==='reconcile'?{mode:'reconcile'}:{})};
  const result=await new PurchaseJob({store,port:ports[kind](h.api,tabId,initial),now:()=>NOW,maxSteps}).run(plan,options);
  return {result,h,t};
}
const KEPT=['taskId','plan','planDigest','expiresAt','initialDates','dateCursor','floors','rejected','refusals','finalIntent','bagAddStarted','resourceWritten','quotedCny','bagTotalCny','untouchedFailures'];
function unresolved(before,r){
  assert.equal(r.state,'NEEDS_VERIFICATION');assert.equal(r.reason,'slot-result-unconfirmed; no resubmission');
  assert.deepEqual(r.pending,before.pending);assert.equal(r.acceptedSlot??null,null);assert.equal(r.inheritedIdentity,undefined);
  for(const k of KEPT)assert.deepEqual(r[k],before[k],k);
}

test('C058 an observe-only port never turns the stored choice into acceptance on any later verified step and cannot act',async()=>{
  for(const phase of ['DETAILS','PAYMENT','REVIEW'])for(const slotSummary of [null,same,other]){
    const h=chrome(7,page(phase,{slotSummary})),p=ports.reconcile(h.api,7,row()),o=await p.observe(plan);
    assert.equal(o.acceptedSlot,null,phase);
    await assert.rejects(p.act({documentId:o.documentId,plan,action:'fillDetails'}),/NotAuthorized/);assert.deepEqual(h.commands,[]);
  }
  // Positive control: the originating authorized purchase port still reports normal progression, never a hold.
  const o=await ports.purchase(chrome(6,page('DETAILS')).api,6,row()).observe(plan);
  assert.deepEqual(o.acceptedSlot,{date:'october5',start:'21:15',end:'21:30',verified:true,basis:'normal-checkout-progression; not a hold guarantee'});
});

for(const [name,slotSummary,expiresAt] of [['no slot summary',null,200000],['the same slot named',same,200000],['a different slot named',other,200000],['an expired window',same,90000]])
  test('C058 a production-shaped human rebind keeps the old choice pending with '+name,async()=>{
    const before=row({expiresAt}),{result:r,h}=await runJob('rebind',{tabId:7,initial:before,current:page('DETAILS',{slotSummary})});
    unresolved(before,r);assert.equal(r.reconcileOnly,true);assert.equal(r.tabId,7);assert.deepEqual(h.commands,[]);
    assert.deepEqual(r.history,[...before.history,{event:'human-tab-rebind',fromTabId:6,toTabId:7,at:NOW}]);
  });

test('C058 a later authorized Resume of a rebound task cannot acknowledge the old choice or act',async()=>{
  for(const current of [page('DETAILS'),page('REVIEW',{slotSummary:same}),contact]){
    const before=row({tabId:7,reconcileOnly:true}),{result:r,h}=await runJob('purchase',{tabId:7,initial:before,current});
    unresolved(before,r);assert.equal(r.reconcileOnly,true);assert.deepEqual(r.history,before.history);assert.deepEqual(h.commands,[]);
  }
});

test('C058 same-tab read-only reconciliation leaves the choice unknown; the originating Resume still resolves it once',async()=>{
  const before=row(),a=await runJob('reconcile',{tabId:6,initial:before,current:page('DETAILS')});
  unresolved(before,a.result);assert.equal(a.result.reconcileOnly,undefined);assert.deepEqual(a.h.commands,[]);
  const b=await runJob('purchase',{tabId:6,initial:a.t.row,current:page('DETAILS'),maxSteps:1});
  assert.equal(b.result.pending,null);assert.deepEqual(b.result.acceptedSlot,{date:'october5',start:'21:15',end:'21:30',verified:true,basis:'normal-checkout-progression; not a hold guarantee'});
  assert.equal(b.result.reason,'step-bound-reached');assert.deepEqual(b.h.commands,[]);
});

test('C058 a stored acceptance equal to the pending choice is not reported as current evidence in a replacement context',async()=>{
  const stored={...same,basis:'normal-checkout-progression; not a hold guarantee'};
  for(const [kind,tabId] of [['reconcile',6],['rebind',7]]){
    const before=row({acceptedSlot:stored}),{result:r,h}=await runJob(kind,{tabId,initial:before,current:page('DETAILS')});
    assert.equal(r.reason,'slot-result-unconfirmed; no resubmission');assert.deepEqual(r.pending,before.pending);assert.deepEqual(r.acceptedSlot,stored);assert.deepEqual(h.commands,[]);
  }
  const p=ports.purchase(chrome(7,page('DETAILS')).api,7,row({acceptedSlot:stored}));p.detachStoredChoice();assert.equal((await p.observe(plan)).acceptedSlot,null);
  // Positive control: the originating purchase run still resolves its own choice.
  const {result:r}=await runJob('purchase',{tabId:6,initial:row({acceptedSlot:stored}),current:page('DETAILS'),maxSteps:1});assert.equal(r.pending,null);assert.deepEqual(r.acceptedSlot,stored);
});

test('C058 a refusal shown to a read-only or rebound context is not recorded as this choice refusal',async()=>{
  for(const [kind,tabId] of [['reconcile',6],['rebind',7]]){
    const before=row(),{result:r,h}=await runJob(kind,{tabId,initial:before,current:slotsWithRefusal});
    unresolved(before,r);assert.deepEqual(h.commands,[]);
  }
  // Positive control: the originating purchase run records the verified fresh refusal and moves to the next date.
  const {result:r,h}=await runJob('purchase',{tabId:6,initial:row(),current:slotsWithRefusal,maxSteps:1});
  assert.deepEqual(r.rejected,[{date:'october5',start:'21:15',end:'21:30',generation:1}]);assert.equal(r.refusals,1);assert.equal(r.dateCursor,1);assert.equal(r.pending,null);assert.deepEqual(h.commands,[]);
});

test('C058 the C051 contact-only continuation stays limited to the originating purchase run',async()=>{
  const {result:r,h}=await runJob('purchase',{tabId:6,initial:row(),current:contact,maxSteps:1});
  assert.equal(r.pending,null);assert.deepEqual(r.acceptedSlot,{date:'october5',start:'21:15',end:'21:30',verified:true,basis:CONTACT_SLOT_BASIS});
  assert.equal(r.inheritedIdentity.source,'purchase-verified-at-slot-send');assert.deepEqual(h.commands,[]);
  const before=row(),x=await runJob('rebind',{tabId:7,initial:before,current:contact});unresolved(before,x.result);assert.deepEqual(x.h.commands,[]);
});

// Closed-checkout probe over a FAKE tab inventory and a FAKE recording port. The record is the eligible C056 shape.
const retired=()=>({schema:'applebuy-purchase-job/v1',state:'RETIRED',finalIntent:null,acceptedSlot:null,pending:null,history:[]});
const probeRow=()=>row({expiresAt:90000,retiredHistory:[retired()]});
async function probe(query){
  const t={row:probeRow(),writes:0,reads:0,calls:[]};const before=structuredClone(t.row);
  const store={async get(){return structuredClone(t.row);},async put(k,v){t.writes++;t.row=structuredClone(v);}};
  const port={async observe(){t.reads++;return {schema:'applebuy-merchant-read/v1',phase:'BAG',verifiedStep:true,path:'/shop/bag',documentId:'FAKE-c058a-bag',seq:5,purchase:structuredClone(purchase),extras:false};},async act(c){t.calls.push(c.action);return {delivered:true};}};
  const r=await probeClosedCheckout({store,api:{tabs:{query}},port,plan,tabId:7,planDigest:before.planDigest,enabled:true,now:()=>NOW,id:()=>'FAKE-c058a-probe'});
  return {r,t,before};
}
const tabs=url=>async()=>[{id:7,url:'https://www.apple.com.cn/shop/bag'},{id:8,url}];
for(const url of ['https://secure8.www.apple.com.cn/shop/checkout','https://secure8.www.apple.com.cn/shop/checkout/','https://www.apple.com.cn/shop/checkout/','https://secure.www.apple.com.cn/shop/checkout/FAKE-step','https://secure8.www.apple.com.cn/shop/CHECKOUT/'])
  test('C058 a disclosed competing checkout address blocks the probe before any read, write or action: '+new URL(url).host+new URL(url).pathname,async()=>{
    const {r,t,before}=await probe(tabs(url));
    assert.equal(r.reason,'another-disclosed-checkout-context');assert.equal(r.originalSlotUnresolved,true);assert.equal(r.purchaseComplete,false);
    assert.deepEqual(t.calls,[]);assert.equal(t.writes+t.reads,0);assert.deepEqual(t.row,before);
  });
test('C058 an unconfirmed tab inventory is unknown, never absence: no read, write or action',async()=>{
  for(const query of [async()=>{throw Error('FAKE query failure');},async()=>null]){
    const {r,t,before}=await probe(query);assert.equal(r.state,'NEEDS_VERIFICATION');assert.match(r.reason,/tab-inventory-unconfirmed|not-proven/);
    assert.deepEqual(t.calls,[]);assert.equal(t.writes+t.reads,0);assert.deepEqual(t.row,before);
  }
});
test('C058 positive control: another disclosed non-checkout official page leaves the one probe Checkout available',async()=>{
  const {t}=await probe(tabs('https://secure8.www.apple.com.cn/shop/bag'));assert.deepEqual(t.calls,['checkout']);
});

// Stored-only diagnostic: tri-state prior slot/final over the bounded nested retired chain.
const secret='FAKE-C058-PRIVATE-NOT-FOR-OUTPUT';
const diag=chain=>{const s=row({retiredHistory:chain});if(chain===undefined)delete s.retiredHistory;const before=structuredClone(s),o=taskDiagnostic(s,NOW);assert.deepEqual(s,before);return o.priorSlotOrFinalPresent;};
const nest=(...records)=>records.reduceRight((inner,r)=>[{...r,...(inner?{retiredHistory:inner}:{})}],null);
const deep=(n,last={})=>{let list=null;for(let i=n;i>=1;i--)list=[{...retired(),...(i===n?last:{}),...(list?{retiredHistory:list}:{})}];return list;};
test('C058 a provable prior slot or final anywhere in the bounded nested chain is present',()=>{
  for(const fact of [{finalIntent:{id:secret,sent:true}},{finalIntent:{id:secret,sent:false}},{acceptedSlot:{...same}},{pending:{action:'chooseSlot',id:secret}},{pending:{action:'submitOrder',id:secret}},{history:[{event:'final-not-dispatched',intentId:secret}]}]){
    assert.equal(diag(nest(retired(),{...retired(),...fact})),true,JSON.stringify(fact));
    assert.equal(diag(nest(retired(),retired(),{...retired(),...fact})),true,JSON.stringify(fact));
  }
  assert.equal(diag(deep(200,{finalIntent:{sent:true}})),true);
  // Found within the 50-entry window even though the list overflows.
  assert.equal(diag([{...retired(),finalIntent:{sent:true}},...Array.from({length:60},retired)]),true);
  const s=row({retiredHistory:[{...retired(),taskId:secret,orderRefHash:secret,history:[{event:secret}],retiredHistory:[{...retired(),finalIntent:{id:secret,grantId:secret,sent:true},orderDetailLink:secret}]}]});
  const o=taskDiagnostic(s,NOW);assert.equal(o.priorSlotOrFinalPresent,true);assert.ok(!JSON.stringify(o).includes(secret));assert.equal(o.retiredHistoryCount,1);
});
test('C058 only a fully read finite chain of clean retired records is positively absent',()=>{
  assert.equal(diag(undefined),false);assert.equal(diag([]),false);
  assert.equal(diag(nest(retired(),retired(),retired())),false);
  assert.equal(diag([{...retired(),pending:{action:'checkout',id:secret}}]),false);
  assert.equal(diag(Array.from({length:50},retired)),false);assert.equal(diag(deep(200)),false);
});
test('C058 malformed, cyclic or over-bound chains are unknown, never positively absent',()=>{
  const cases={
    'top-level null':null,'top-level object':{},
    'a null entry':[{...retired(),retiredHistory:[null]}],'an array entry':[retired(),[retired()]],'a string entry':[secret],
    'a missing finalIntent':[(({finalIntent,...r})=>r)(retired())],'a missing pending':[(({pending,...r})=>r)(retired())],'a string pending':[{...retired(),pending:secret}],
    'another schema':[{...retired(),schema:secret}],'a non-retired state':[{...retired(),state:'RUNNING'}],'a non-array history':[{...retired(),history:{event:secret}}],
    'a nested non-array chain':[{...retired(),retiredHistory:{}}],'a nested null chain':[{...retired(),retiredHistory:null}],
    'a top-level list over 50':Array.from({length:51},retired),'a nested list over 50':[{...retired(),retiredHistory:Array.from({length:51},retired)}],
    'more than 200 records':deep(201),'a final beyond 200 records':deep(201,{finalIntent:{sent:true}}),'a final beyond the 50-entry window':[...Array.from({length:50},retired),{...retired(),finalIntent:{sent:true}}],
  };
  for(const [name,chain] of Object.entries(cases))assert.equal(diag(chain),null,name);
  const a=retired();a.retiredHistory=[a];assert.equal(taskDiagnostic(row({retiredHistory:[a]}),NOW).priorSlotOrFinalPresent,null,'a record that contains itself');
  const list=[retired()];list[0].retiredHistory=list;assert.equal(taskDiagnostic(row({retiredHistory:list}),NOW).priorSlotOrFinalPresent,null,'a list that contains itself');
  const shared=retired();assert.equal(taskDiagnostic(row({retiredHistory:[shared,{...retired(),retiredHistory:[shared]}]}),NOW).priorSlotOrFinalPresent,null,'a repeated record');
});
