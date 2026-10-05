// Codex independent pre-fix reproduction. Only the actual PurchaseJob runs; the clock, store,
// verified observations, authority, receipt, order lookup and every merchant effect are FAKE.
// No browser, network, account, private value, real slot, order or payment is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import {PurchaseJob,TASK_KEY,NO_EXTRAS} from '../web/checkout-connector/job.js';

const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{...NO_EXTRAS}};
const proof={itemVerified:true,verified:true,...plan.product,quantity:1,totalCny:9999,store:plan.stores[0],fulfillment:'pickup'};
const slot=date=>({date,start:'21:15',end:'21:30',verified:true});
const ref='a'.repeat(64),now=100000,digest='FAKE-c054-digest',terms='https://www.apple.com.cn/shop/open/salespolicies';
function row(date,lookup=false,dates=[date]){
  return {schema:'applebuy-purchase-job/v1',taskId:'FAKE-c054-task',plan:structuredClone(plan),planDigest:digest,tabId:7,state:'NEEDS_VERIFICATION',lastRead:4,lastPhase:'REVIEW',lastDocumentId:'FAKE-c054-review',entryDocumentId:'FAKE-c054-entry',expiresAt:lookup?90000:900000,initialDates:[...dates],dateCursor:0,floors:{[date]:'21:15'},rejected:[],refusals:0,
    pending:lookup?{id:'FAKE-c054-submit',action:'submitOrder',intentId:'FAKE-c054-intent',documentId:'FAKE-c054-review',beforePhase:'REVIEW',deadline:99000}:null,
    finalIntent:lookup?{id:'FAKE-c054-intent',grantId:'FAKE-c054-used-grant',sent:true}:null,orderRefHash:lookup?ref:null,acceptedSlot:slot(date),bagAddStarted:true,resourceWritten:true,untouchedFailures:0,untouchedStreak:0,quotedCny:9999,bagTotalCny:9999,history:[{event:'FAKE-c054-preserve'}],observationCurrent:false};
}
async function run(date,summaryDate,{lookup=false,dates=[date]}={}){
  const initial=row(date,lookup,dates),h={row:structuredClone(initial),phase:lookup?'ORDER_RECEIPT':'REVIEW',seq:4,commands:[],lookups:0};
  const store={async get(k){assert.equal(k,TASK_KEY);return structuredClone(h.row);},async put(k,v){assert.equal(k,TASK_KEY);h.row=structuredClone(v);}};
  const port={async observe(){return {schema:'applebuy-merchant-read/v1',documentId:h.phase==='REVIEW'?'FAKE-c054-review':'FAKE-c054-receipt',seq:++h.seq,phase:h.phase,verifiedStep:true,purchase:{...proof},extras:false,paymentMethod:'支付宝',existingOrdersChecked:true,termsLinks:[terms],slotSummary:slot(summaryDate),orderRefHash:h.phase==='ORDER_RECEIPT'?ref:null,receiptVerified:h.phase==='ORDER_RECEIPT'};},
    async act(c){assert.equal(c.action,'submitOrder');h.commands.push(c.action);h.phase='ORDER_RECEIPT';return {delivered:true};},
    async lookupOrder(){h.lookups++;return {independent:true,state:'unpaid',orderRefHash:ref,purchase:{...proof},acceptedSlot:slot(summaryDate)};}};
  const grant=lookup?null:{id:'FAKE-c054-current-final-grant',taskId:initial.taskId,planDigest:digest,documentId:'FAKE-c054-review',termsUrl:terms,termsAccepted:true,existingOrdersChecked:true,noExtras:true,expiry:now+120000};
  const job=new PurchaseJob({store,port,now:()=>now,id:()=> 'FAKE-c054-new-id'});
  const result=await job.run(plan,{tabId:7,planDigest:digest,grant});
  assert.equal(result.expiresAt,initial.expiresAt);assert.deepEqual(result.initialDates,initial.initialDates);assert.deepEqual(result.floors,initial.floors);assert.deepEqual(result.rejected,initial.rejected);assert.deepEqual(result.acceptedSlot,initial.acceptedSlot);assert.deepEqual(result.history,initial.history);
  if(lookup)assert.deepEqual(result.finalIntent,initial.finalIntent);
  return {result,h,initial};
}
for(const lookup of [false,true])test('C054 equivalent observed calendar representation '+(lookup?'confirms by lookup without resubmitting':'passes current review once'),async()=>{
  const {result,h}=await run('october5','10月5日',{lookup});
  assert.equal(result.state,'CONFIRMED_UNPAID');assert.equal(result.pending,null);
  assert.deepEqual(h.commands,lookup?[]:['submitOrder']);assert.equal(h.lookups,1);
});
for(const lookup of [false,true])test('C054 exact legacy date retains existing '+(lookup?'unknown-final lookup':'review')+' behavior',async()=>{
  const {result,h}=await run('October 5','October 5',{lookup});assert.equal(result.state,'CONFIRMED_UNPAID');assert.deepEqual(h.commands,lookup?[]:['submitOrder']);
});
for(const [name,date,summary,dates] of [
  ['a different date','october5','10月6日'],
  ['one-sided unproved year','october5','2026年10月5日'],
  ['two different explicit years','2026年10月5日','2027年10月5日'],
  ['no date summary','october5',undefined],
])for(const lookup of [false,true])test('C054 '+name+' cannot '+(lookup?'confirm an unknown final':'submit an order'),async()=>{
  const {result,h,initial}=await run(date,summary,{lookup,dates:dates??[date]});assert.notEqual(result.state,'CONFIRMED_UNPAID');assert.deepEqual(h.commands,[]);assert.deepEqual(result.pending,initial.pending);assert.deepEqual(result.finalIntent,initial.finalIntent);
});
