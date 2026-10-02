// Codex C-012 quota takeover. These are synthetic merchant contracts, NOT live Apple evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {PurchaseJob,TASK_KEY,validIntent,validStored} from '../web/checkout-connector/job.js';

const plan={schema:'applebuy-intent/v1',product:{model:'iPhone Duo',capacity:'256GB',color:'星光白色'},quantity:1,maxTotalCny:15999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝'};
const purchase={itemVerified:true,verified:true,...plan.product,quantity:1,totalCny:15999,store:plan.stores[0],fulfillment:'pickup'};
const slot={date:'10月23日',start:'21:15',end:'21:30',verified:true};
const hash='a'.repeat(64),terms='https://www.apple.com.cn/shop/open/salespolicies';
function read(phase,extra={}){return {schema:'applebuy-merchant-read/v1',documentId:'doc',phase,verifiedStep:true,continueAvailable:true,purchase:structuredClone(purchase),...extra};}
function slots(extra={}){return read('SLOTS',{listComplete:true,generation:1,dates:['10月23日','10月24日','10月25日'].map((label,i)=>({label,ref:'date:'+i,enabled:true})),selectedDate:'10月23日',times:[{ref:'time:0',start:'09:00',end:'09:15',enabled:true},{ref:'time:1',start:'21:15',end:'21:30',enabled:true}],...extra});}
function setup(initial,handler=(c,h)=>{},seed=null){
  let time=100000,seq=seed?.lastRead??0,serial=0;
  const store={row:seed,async get(k){assert.equal(k,TASK_KEY);return structuredClone(this.row);},async put(k,v){assert.equal(k,TASK_KEY);this.row=structuredClone(v);}};
  const h={store,actions:[],current:initial,now:()=>time,advance:n=>{time+=n;}};
  const port={async observe(){return {...structuredClone(h.current),seq:++seq};},async act(c){assert.equal(store.row.pending.id,c.id,'write-ahead precedes every send');h.actions.push(structuredClone(c));return await handler(c,h);},async lookupOrder(){return h.order??{state:'unknown',independent:false};},async wait(n){time+=n;}};
  const job=new PurchaseJob({store,port,now:()=>time,id:()=>`id-${++serial}`,maxSteps:200});
  Object.assign(h,{port,job,run:grant=>job.run(plan,{tabId:7,planDigest:'digest',grant})});return h;
}
function grant(h,extra={}){return {id:'grant',taskId:h.store.row.taskId,planDigest:'digest',documentId:'doc',termsUrl:terms,termsAccepted:true,existingOrdersChecked:true,noExtras:true,expiry:h.now()+120000,...extra};}
function review(extra={}){return read('REVIEW',{paymentMethod:'支付宝',extras:false,existingOrdersChecked:true,slotSummary:slot,termsLinks:[terms],...extra});}
function fullHandler(c,h){
  if(c.action==='configureProduct')h.current=read('ENTRY',{needsSelection:[],selectedProductChoices:[c.choice]});
  else if(c.action==='continueProduct')h.current=read('VARIANT',{variantVerified:true,quotedCny:15999});
  else if(c.action==='addBag')h.current=read('ACCESSORIES');
  else if(c.action==='viewBag')h.current=read('BAG',{purchase:{...purchase,verified:false,fulfillment:null,store:null}});
  else if(c.action==='checkout')h.current=read('FULFILLMENT',{purchase:{...purchase,verified:false,fulfillment:null,store:null}});
  else if(c.action==='selectPickup')h.current=read('FULFILLMENT',{purchase:{...purchase,verified:false,store:null}});
  else if(c.action==='selectStore')h.current=slots();
  else if(c.action==='selectDate')h.current=slots({generation:h.current.generation+1,selectedDate:c.date});
  else if(c.action==='chooseSlot'){
    if(h.actions.filter(x=>x.action==='chooseSlot').length<3)h.current=slots({generation:h.current.generation+1,selectedDate:c.date,feedback:{kind:'slot-refused',verified:true,ref:c.ref,generation:h.current.generation+1}});
    else h.current=read('DETAILS',{acceptedSlot:{...slot,date:c.date}});
  }else if(c.action==='fillDetails')h.current=read('PAYMENT',{paymentMethod:null});
  else if(c.action==='selectPayment')h.current=read('PAYMENT',{paymentMethod:'支付宝'});
  else if(c.action==='continuePayment')h.current=review({slotSummary:{...slot,date:'10月25日'}});
  else if(c.action==='submitOrder'){
    h.current=read('ORDER_RECEIPT',{receiptVerified:true,orderRefHash:hash});
    h.order={state:'unpaid',independent:true,orderRefHash:hash,purchase,acceptedSlot:{...slot,date:'10月25日'}};
  }
  return {delivered:true};
}
test('full native-stage contract: configure, one bag, pickup/store, two fresh refusals, third terminal, details, Alipay, one independently matched unpaid order',async()=>{
  const h=setup(read('ENTRY',{needsSelection:['星光白色']}),fullHandler);
  const prepared=await h.run();assert.equal(prepared.state,'NEEDS_USER');assert.equal(prepared.refusals,2);
  assert.deepEqual(h.actions.filter(x=>x.action==='chooseSlot').map(x=>[x.date,x.start]),[['10月23日','21:15'],['10月24日','21:15'],['10月25日','21:15']]);
  assert.equal(h.actions.filter(x=>x.action==='addBag').length,1);assert.equal(h.actions.some(x=>x.action==='submitOrder'),false);
  assert.equal((await h.run(grant(h))).state,'CONFIRMED_UNPAID');const n=h.actions.length;assert.equal((await h.run(grant(h))).state,'CONFIRMED_UNPAID');assert.equal(h.actions.length,n);
  assert.equal(h.actions.filter(x=>x.action==='submitOrder').length,1);
  assert.equal(h.actions.some(x=>['pay','submitPayment','paymentSubmit'].includes(x.action)),false);
});
test('advance terms and single-order permission allow ONE start from public configuration through independent unpaid confirmation',async()=>{
  const h=setup(read('ENTRY',{needsSelection:['星光白色']}),fullHandler);
  const g={id:'start',start:true,taskId:'prepared',planDigest:'digest',entryDocumentId:'doc',termsUrl:terms,termsAccepted:true,existingOrdersChecked:true,noExtras:true,expiry:h.now()+1200000};
  const result=await h.job.run(plan,{tabId:7,planDigest:'digest',taskId:'prepared',grant:g});assert.equal(result.state,'CONFIRMED_UNPAID');assert.equal(h.actions.filter(x=>x.action==='submitOrder').length,1);assert.equal(h.actions.filter(x=>x.action==='chooseSlot').length,3);
});
test('advance permission bound to a replaced entry document, wrong task or expired grant blocks before any mutation',async()=>{
  for(const delta of [{entryDocumentId:'old'},{taskId:'other'},{expiry:1},{noExtras:false}]){const h=setup(read('ENTRY',{needsSelection:['星光白色']}));const g={id:'start',start:true,taskId:'prepared',planDigest:'digest',entryDocumentId:'doc',termsUrl:terms,termsAccepted:true,existingOrdersChecked:true,noExtras:true,expiry:h.now()+1200000,...delta};assert.equal((await h.job.run(plan,{tabId:7,planDigest:'digest',taskId:'prepared',grant:g})).state,'BLOCKED');assert.equal(h.actions.length,0);}
});
test('bag reconciliation after lost reply never adds the item again, including restart',async()=>{
  const h=setup(read('VARIANT',{variantVerified:true,quotedCny:15999}),(c,h)=>{if(c.action==='addBag'){h.current=read('BAG',{purchase:{...purchase,verified:false,store:null,fulfillment:null}});throw Error('lost');}h.current=read('AUTH');});
  assert.equal((await h.run()).state,'NEEDS_VERIFICATION');assert.equal(h.store.row.pending.action,'addBag');
  const resumed=setup(h.current,(c,h)=>{h.current=read('AUTH');},h.store.row);await resumed.run();
  assert.deepEqual(resumed.actions.map(x=>x.action),['checkout']);assert.equal(h.actions.filter(x=>x.action==='addBag').length,1);
});
test('slot processing is awaited, not interpreted as a refusal or sent twice',async()=>{
  const h=setup(slots(),(c,h)=>{h.current=read('PROCESSING');});let waits=0;
  h.port.wait=async n=>{h.advance(n);if(++waits===3)h.current=read('DETAILS',{acceptedSlot:slot});};
  h.port.act=async c=>{h.actions.push(c);h.current=c.action==='chooseSlot'?read('PROCESSING'):read('AUTH');return {delivered:true};};
  await h.run();assert.equal(h.actions.filter(x=>x.action==='chooseSlot').length,1);assert.equal(h.store.row.refusals,0);assert.equal(h.actions.filter(x=>x.action==='fillDetails').length,1);
});
test('unverified alert and unchanged list never authorize slot reselection',async()=>{
  const h=setup(slots(),(c,h)=>{h.current=slots({feedback:{kind:'slot-refused',ref:c.ref,generation:2,verified:false}});});
  assert.equal((await h.run()).state,'NEEDS_VERIFICATION');assert.equal(h.actions.length,1);assert.equal(h.store.row.refusals,0);
});
test('same-generation refusal cannot authorize a second choice',async()=>{
  const h=setup(slots(),(c,h)=>{h.current=slots({feedback:{kind:'slot-refused',ref:c.ref,generation:1,verified:true}});});await h.run();assert.equal(h.actions.length,1);assert.equal(h.store.row.refusals,0);
});
test('disabled terminal advances a date; removing a previously observed terminal cannot allow an earlier slot after restart',async()=>{
  const h=setup(slots({times:[{ref:'time:0',start:'09:00',end:'09:15',enabled:true},{ref:'time:1',start:'21:15',end:'21:30',enabled:false}]}),(c,h)=>{h.current=read('AUTH');});await h.run();assert.equal(h.actions[0].action,'selectDate');assert.equal(h.actions[0].date,'10月24日');
  h.store.row.dateCursor=0;h.store.row.pending=null;
  const r=setup(slots({generation:4,times:[{ref:'time:0',start:'09:00',end:'09:15',enabled:true}]}),(c,h)=>{h.current=read('AUTH');},h.store.row);await r.run();assert.equal(r.actions[0].action,'selectDate');assert.equal(r.actions[0].date,'10月24日');
});
test('initial offered date set stays frozen; disappearance cannot silently roll to a fourth day',async()=>{
  const h=setup(slots(),(c,h)=>{throw Error('loss');});await h.run();h.store.row.pending=null;h.store.row.dateCursor=2;
  const r=setup(slots({dates:['10月24日','10月26日'].map((label,i)=>({label,ref:'date:'+i,enabled:true})),selectedDate:'10月24日'}),()=>{},h.store.row);
  assert.equal((await r.run()).state,'EXHAUSTED');assert.equal(r.actions.length,0);assert.deepEqual(r.store.row.initialDates,['10月23日','10月24日','10月25日']);
});
test('one final write-ahead intent survives lost reply and independently reconciles, no repeat after restart',async()=>{
  const h=setup(review(),(c,h)=>{h.current=read('ORDER_RECEIPT',{receiptVerified:true,orderRefHash:hash});throw Error('lost');});await h.store.put(TASK_KEY,{...(await setup(slots(),()=>{}).run()),pending:null,acceptedSlot:slot,lastPhase:'REVIEW',lastRead:0,tabId:7,planDigest:'digest'});
  await h.run(grant(h));assert.equal(h.actions.length,1);assert.equal(h.store.row.finalIntent.sent,true);
  const r=setup(h.current,()=>{throw Error('must not resend');},h.store.row);r.order={state:'unpaid',independent:true,orderRefHash:hash,purchase,acceptedSlot:slot};
  assert.equal((await r.run()).state,'CONFIRMED_UNPAID');assert.equal(r.actions.length,0);
});
test('unknown final, wrong order identity, paid state, wrong pickup or non-independent lookup preserve intent without another submission',async()=>{
  for(const change of [{},{orderRefHash:'b'.repeat(64)},{state:'paid'},{acceptedSlot:{...slot,start:'09:00'}},{independent:false},{purchase:{...purchase,quantity:2}}]){
    const h=setup(review(),(c,h)=>{h.current=read('ORDER_RECEIPT',{receiptVerified:true,orderRefHash:hash});});
    const seed=await setup(slots(),()=>{throw Error();}).run();Object.assign(seed,{pending:null,acceptedSlot:slot,lastRead:0});await h.store.put(TASK_KEY,seed);
    h.order=Object.keys(change).length?{state:'unpaid',independent:true,orderRefHash:hash,purchase,acceptedSlot:slot,...change}:{state:'unknown'};
    assert.equal((await h.run(grant(h))).state,'NEEDS_VERIFICATION');await h.run(grant(h));assert.equal(h.actions.length,1);assert.equal(h.store.row.finalIntent.sent,true);
  }
});
test('final grant must bind the actual document, terms link, plan and short expiry',async()=>{
  for(const delta of [{expiry:1},{expiry:99999999},{documentId:'stale'},{planDigest:'other'},{termsUrl:'https://example.org'},{termsAccepted:false}]){
    const h=setup(review());const seed=await setup(slots(),()=>{throw Error();}).run();Object.assign(seed,{pending:null,acceptedSlot:slot,lastRead:0});await h.store.put(TASK_KEY,seed);
    assert.equal((await h.run(grant(h,delta))).state,'NEEDS_USER');assert.equal(h.actions.length,0);
  }
});
test('final review rejects shifted slot and missing human existing-order/no-extras checks',async()=>{
  for(const delta of [{slotSummary:{...slot,start:'09:00'}},{slotSummary:null},{existingOrdersChecked:false},{extras:null},{paymentMethod:'银行卡'}]){
    const h=setup(review(delta));const seed=await setup(slots(),()=>{throw Error();}).run();Object.assign(seed,{pending:null,acceptedSlot:slot,lastRead:0});await h.store.put(TASK_KEY,seed);assert.equal((await h.run(grant(h))).state,'BLOCKED');assert.equal(h.actions.length,0);
  }
});
test('wrong product, quantity, price or store never advances checkout',async()=>{
  for(const change of [{model:'iPhone 18 Pro'},{quantity:2},{totalCny:16000},{store:'Apple 北京'}, {fulfillment:'shipping'},{verified:false}]){const h=setup(slots({purchase:{...purchase,...change}}));assert.equal((await h.run()).state,'BLOCKED');assert.equal(h.actions.length,0);}
});
test('stale or duplicate observations never advance',async()=>{const h=setup(slots());h.port.observe=async()=>({...slots(),seq:0});assert.equal((await h.run()).state,'NEEDS_VERIFICATION');assert.equal(h.actions.length,0);});
test('disabled public Continue causes no prepared mutation and is not called out of stock',async()=>{const h=setup(read('ENTRY',{needsSelection:[],continueAvailable:false}));const s=await h.run();assert.equal(s.state,'NOT_READY');assert.equal(s.pending,null);assert.equal(h.actions.length,0);assert.match(s.reason,/availability not established/);});
test('human authentication, consent, challenge, throttle, query unknown and prelaunch are distinct non-mutating gates',async()=>{
  for(const phase of ['AUTH','CONSENT','CHALLENGE','THROTTLE','UNKNOWN','PRELAUNCH']){const h=setup(read(phase));const s=await h.run();assert.equal(h.actions.length,0);assert.equal(s.state,phase==='PRELAUNCH'?'NOT_RELEASED':'NEEDS_USER');}
});
test('plan or tab rebinding, expired task and corrupt persistence do not reset unknown history',async()=>{
  const h=setup(slots(),()=>{throw Error('lost');});await h.run();const before=structuredClone(h.store.row);
  assert.equal((await h.job.run(plan,{tabId:8,planDigest:'digest'})).state,'BLOCKED');assert.deepEqual(h.store.row.pending,before.pending);
  h.advance(1800001);assert.equal((await h.run()).state,'EXPIRED');assert.equal(h.actions.length,1);
  h.store.row.floors={date:'bad'};assert.equal(validStored(h.store.row),false);await assert.rejects(h.run(),/Corrupt/);
  assert.equal(validIntent({...plan,quantity:2}),false);assert.equal(validIntent({...plan,city:'北京'}),false);
});
test('write-ahead storage failure means no send; pause arriving during storage also prevents send',async()=>{
  const h=setup(slots());h.store.put=async(k,v)=>{if(v.pending)throw Error('disk');h.store.row=v;};await assert.rejects(h.run(),/disk/);assert.equal(h.actions.length,0);
  const p=setup(slots());const put=p.store.put.bind(p.store);p.store.put=async(k,v)=>{await put(k,v);if(v.pending)p.job.pause();};assert.equal((await p.run()).state,'PAUSED');assert.equal(p.actions.length,0);assert.equal(p.store.row.pending.action,'chooseSlot');
});
