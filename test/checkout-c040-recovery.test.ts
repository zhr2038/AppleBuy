// C040-R1 (Claude): script-transport read recovery and bounded final reconciliation. The actual ChromePort and PurchaseJob run over
// FAKE Chrome tabs/permissions/scripting, pages, documents, receipt hash, clock and store. No browser, network, slot, order or payment.
import test from 'node:test';
import assert from 'node:assert/strict';
import {PurchaseJob,TASK_KEY} from '../web/checkout-connector/job.js';
import {ChromePort} from '../web/checkout-connector/chrome-port.js';

const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{tradeIn:'none',appleCare:'none'}};
const digest='FAKE-c040-digest',ref='e'.repeat(64),link='https://www.apple.com.cn/shop/order/FAKE-c040-link',start=1_000_000;
const purchase={itemVerified:true,verified:true,...plan.product,quantity:1,totalCny:9999,store:plan.stores[0],fulfillment:'pickup'};
const slot={date:'October 4',start:'21:15',end:'21:30',verified:true};
const pages={
  SLOTS:{phase:'SLOTS',verifiedStep:true,path:'/shop/checkout',purchase,fulfillmentChoice:'pickup',listComplete:true,dates:[{label:'October 4',ref:'date:0',enabled:true,selected:true}],selectedDate:'October 4',times:[{start:'21:15',end:'21:30',ref:'time:46',enabled:true}]},
  DETAILS:{phase:'DETAILS',verifiedStep:true,path:'/shop/checkout',purchase},
  AUTH:{phase:'AUTH',verifiedStep:false,path:'/shop/signIn'},
  REVIEW:{phase:'REVIEW',verifiedStep:true,path:'/shop/checkout',purchase},
  PROCESSING:{phase:'PROCESSING',verifiedStep:false,path:'/shop/checkout'},
  ORDER_RECEIPT:{phase:'ORDER_RECEIPT',verifiedStep:true,path:'/shop/checkout',purchase,slotSummary:slot,orderRefHash:ref,receiptVerified:true,orderDetailLink:link},
  ORDER_DETAIL:{phase:'ORDER_DETAIL',verifiedStep:true,path:'/shop/order/FAKE-c040-link',purchase,slotSummary:slot,orderRefHash:ref},
};
// FAKE Chrome. Script entries: [page, documentId, overrides], REJECT (the injection promise rejects, as when a document change removes
// the frame) or RETURNED (a frame result came back without a decode). The last entry repeats; following the receipt link shows the
// detail page. A command injection is recorded and acknowledged as delivered.
function chromeApi(script,{granted=true,closed=false}={}){
  const h={i:0,reads:0,commands:[],navigations:[],detail:false};
  h.api={tabs:{async get(id){assert.equal(id,7);if(closed)throw new Error('FAKE No tab with id');return {id,url:h.detail?link:'https://secure8.www.apple.com.cn/shop/checkout',status:'complete'};},
      async update(id,{url}){assert.equal(id,7);h.navigations.push(url);h.detail=true;return {id,url,status:'complete'};}},
    permissions:{async contains(){return granted;}},
    scripting:{async executeScript(q){assert.equal(q.world,'ISOLATED');
      if(q.args.length>1){h.commands.push(q.args[1].action);return [{frameId:0,documentId:q.target.documentIds[0],result:{delivered:true}}];}
      h.reads++;if(h.detail)return [{frameId:0,documentId:'FAKE-c040-detail',result:structuredClone(pages.ORDER_DETAIL)}];
      const [name,doc,over]=script[Math.min(h.i++,script.length-1)];
      if(name==='REJECT')throw new Error('FAKE Frame with ID 0 was removed.');
      if(name==='RETURNED')return [{frameId:0,documentId:'FAKE-c040-unknown',result:null}];
      return [{frameId:0,documentId:doc,result:{schema:'applebuy-merchant-read/v1',...structuredClone(pages[name]),...structuredClone(over??{})}}];}}};
  return h;
}
function job(h,{stored=null,readOnly=false}={}){
  const t={row:structuredClone(stored),waits:0,time:start};
  const store={async get(k){assert.equal(k,TASK_KEY);return structuredClone(t.row);},async put(k,s){assert.equal(k,TASK_KEY);t.row=structuredClone(s);}};
  const seq=stored?.lastRead??0,port=new ChromePort(h.api,7,readOnly?{mode:'observe',initialSequence:seq}:{authorized:true,initialSequence:seq,pending:stored?.pending??null,acceptedSlot:stored?.acceptedSlot??null});
  port.wait=async()=>{t.waits++;t.time+=50;};
  t.run=()=>new PurchaseJob({store,port,now:()=>t.time}).run(plan,{tabId:7,planDigest:digest,...(stored?{}:{taskId:'FAKE-c040-task'}),...(readOnly?{mode:'reconcile'}:{})});
  return t;
}
// A sent final click whose result is still unknown, its own write-ahead deadline 7900 ms after the FAKE clock start.
const finalRow=(pending={})=>({schema:'applebuy-purchase-job/v1',taskId:'FAKE-c040-task',plan:structuredClone(plan),planDigest:digest,tabId:7,state:'RUNNING',reason:null,lastRead:4,lastPhase:'REVIEW',lastDocumentId:'FAKE-c040-review',entryDocumentId:'FAKE-c040-entry',expiresAt:start+600000,initialDates:[slot.date],dateCursor:0,floors:{},rejected:[],refusals:0,pending:{id:'FAKE-c040-submit',action:'submitOrder',intentId:'FAKE-c040-intent',documentId:'FAKE-c040-review',beforePhase:'REVIEW',deadline:start+7900,...pending},finalIntent:{id:'FAKE-c040-intent',grantId:'FAKE-c040-grant',sent:true},orderRefHash:null,acceptedSlot:{...slot},bagAddStarted:true,resourceWritten:true,untouchedFailures:0,untouchedStreak:0,quotedCny:9999,history:[],observationCurrent:true});

test('C040-R1 ChromePort names only a rejected injection script transport; returned, permission and closed-tab failures are not',async()=>{
  await assert.rejects(new ChromePort(chromeApi([['REJECT']]).api,7).observe(plan),e=>e.message==='ScriptTransportRejected'&&e.scriptTransport===true);
  await assert.rejects(new ChromePort(chromeApi([['RETURNED']]).api,7).observe(plan),e=>e.message==='CurrentDocumentUnrecognized'&&!('scriptTransport' in e));
  const denied=chromeApi([['REJECT']],{granted:false});
  await assert.rejects(new ChromePort(denied.api,7).observe(plan),e=>e.message==='CurrentHostPermissionMissing'&&!('scriptTransport' in e));assert.equal(denied.reads,0);
  const closed=chromeApi([['REJECT']],{closed:true});
  await assert.rejects(new ChromePort(closed.api,7).observe(plan),e=>!('scriptTransport' in e));assert.equal(closed.reads,0);
});
test('C040-R1 a rejected read after a sent slot Continue re-reads once and reconciles the new details document without a second slot',async()=>{
  const h=chromeApi([['SLOTS','FAKE-c040-slots'],['REJECT'],['DETAILS','FAKE-c040-details'],['AUTH','FAKE-c040-auth']]),t=job(h),s=await t.run();
  assert.deepEqual(h.commands,['chooseSlot']);assert.equal(t.waits,1);assert.equal(h.reads,4);
  assert.equal(s.state,'NEEDS_USER');assert.equal(s.reason,'auth');assert.equal(s.pending,null);assert.deepEqual([s.acceptedSlot?.date,s.acceptedSlot?.start,s.acceptedSlot?.end,s.acceptedSlot?.verified],['October 4','21:15','21:30',true]);
});
test('C040-R1 a returned but unrecognized document after a sent slot Continue still stops at once',async()=>{
  const h=chromeApi([['SLOTS','FAKE-c040-slots'],['RETURNED'],['DETAILS','FAKE-c040-details']]),t=job(h),s=await t.run();
  assert.deepEqual(h.commands,['chooseSlot']);assert.equal(t.waits,0);assert.equal(h.reads,2);
  assert.equal(s.state,'NEEDS_VERIFICATION');assert.equal(s.reason,'observation-transport-failed');assert.equal(s.pending.action,'chooseSlot');assert.equal(s.acceptedSlot??null,null);
});
test('C040-R1 persistent script transport loss stops at the original slot deadline, which is never extended',async()=>{
  const h=chromeApi([['SLOTS','FAKE-c040-slots'],['REJECT']]),t=job(h),s=await t.run();
  assert.deepEqual(h.commands,['chooseSlot']);assert.ok(t.waits>=150&&t.waits<=161,'bounded by the 8000 ms pending deadline: '+t.waits);
  assert.equal(s.reason,'observation-transport-failed');assert.equal(s.pending.action,'chooseSlot');assert.equal(s.pending.deadline,start+8000);assert.ok(t.time>=s.pending.deadline);
});
test('C040-R1 a read-only reconcile run never waits on script transport loss, even inside the open deadline',async()=>{
  const first=job(chromeApi([['SLOTS','FAKE-c040-slots'],['RETURNED']]));await first.run();assert.equal(first.row.pending.action,'chooseSlot');
  const h=chromeApi([['REJECT'],['DETAILS','FAKE-c040-details']]),t=job(h,{stored:first.row,readOnly:true}),s=await t.run();
  assert.ok(t.time<s.pending.deadline);assert.equal(t.waits,0);assert.equal(h.reads,1);assert.deepEqual(h.commands,[]);
  assert.equal(s.reason,'observation-transport-failed');assert.deepEqual(s.pending,first.row.pending);
});
test('C040-R1 a sent final waits read-only through its own review and processing, then confirms by the receipt link lookup once',async()=>{
  const before=finalRow(),h=chromeApi([['REJECT'],['REVIEW','FAKE-c040-review'],['PROCESSING','FAKE-c040-processing'],['ORDER_RECEIPT','FAKE-c040-receipt']]),t=job(h,{stored:before}),s=await t.run();
  assert.equal(s.state,'CONFIRMED_UNPAID');assert.equal(s.pending,null);assert.equal(s.orderRefHash,ref);assert.deepEqual(s.finalIntent,before.finalIntent);
  // One re-read after the rejection, one each while review and processing are shown, one inside the lookup after the link.
  assert.equal(t.waits,4);assert.deepEqual(h.commands,[]);assert.deepEqual(h.navigations,[link]);assert.ok(t.time<before.pending.deadline);
});
for(const [name,pending,script,reason] of [
  ['an expired final deadline while its review is shown',{deadline:start},[['REVIEW','FAKE-c040-review']],'final-result-unconfirmed; no resubmission'],
  ['an expired final deadline after a rejected read',{deadline:start},[['REJECT']],'observation-transport-failed'],
  ['a review of another document',{},[['REVIEW','FAKE-c040-other-review']],'final-result-unconfirmed; no resubmission'],
  ['its review showing two units',{},[['REVIEW','FAKE-c040-review',{purchase:{...purchase,quantity:2}}]],'final-result-unconfirmed; no resubmission'],
])
  test('C040-R1 a sent final with '+name+' gets no wait or new deadline and is never resubmitted',async()=>{
    const before=finalRow(pending),h=chromeApi(script),t=job(h,{stored:before}),s=await t.run();
    assert.equal(t.waits,0);assert.deepEqual(h.commands,[]);assert.deepEqual(h.navigations,[]);
    assert.equal(s.state,'NEEDS_VERIFICATION');assert.equal(s.reason,reason);assert.deepEqual(s.pending,before.pending);assert.deepEqual(s.finalIntent,before.finalIntent);
  });
