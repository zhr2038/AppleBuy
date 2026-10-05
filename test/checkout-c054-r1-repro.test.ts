// Codex review reproduction: actual PurchaseJob, entirely FAKE clock/store/merchant proof/grant/order.
// No browser, network, customer data, slot, order or payment. Tests expose exact-label bypasses.
import test from 'node:test';
import assert from 'node:assert/strict';
import {PurchaseJob,TASK_KEY,NO_EXTRAS} from '../web/checkout-connector/job.js';
const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{...NO_EXTRAS}};
const proof={itemVerified:true,verified:true,...plan.product,quantity:1,totalCny:9999,store:plan.stores[0],fulfillment:'pickup'};
const time=date=>({date,start:'21:15',end:'21:30',verified:true});
const ref='d'.repeat(64),now=100000,digest='FAKE-c054r1-digest',terms='https://www.apple.com.cn/shop/open/salespolicies';
async function run(date,{lookup=false,dates=[date],missingBothSlots=false}={}){
  const initial={schema:'applebuy-purchase-job/v1',taskId:'FAKE-c054r1-task',plan:structuredClone(plan),planDigest:digest,tabId:7,state:'NEEDS_VERIFICATION',lastRead:4,lastPhase:'REVIEW',lastDocumentId:'FAKE-c054r1-review',entryDocumentId:'FAKE-c054r1-entry',expiresAt:lookup?90000:900000,initialDates:[...dates],dateCursor:0,floors:{[date]:'21:15'},rejected:[],refusals:0,
    pending:lookup?{id:'FAKE-c054r1-submit',action:'submitOrder',intentId:'FAKE-c054r1-intent',documentId:'FAKE-c054r1-review',beforePhase:'REVIEW',deadline:99000}:null,
    finalIntent:lookup?{id:'FAKE-c054r1-intent',grantId:'FAKE-c054r1-used-grant',sent:true}:null,orderRefHash:lookup?ref:null,acceptedSlot:missingBothSlots?null:time(date),bagAddStarted:true,resourceWritten:true,untouchedFailures:0,untouchedStreak:0,quotedCny:9999,bagTotalCny:9999,history:[{event:'FAKE-c054r1-kept'}]};
  const h={row:structuredClone(initial),seq:4,phase:lookup?'ORDER_RECEIPT':'REVIEW',commands:[],lookups:0};
  const store={async get(k){assert.equal(k,TASK_KEY);return structuredClone(h.row);},async put(k,v){assert.equal(k,TASK_KEY);h.row=structuredClone(v);}};
  const port={async observe(){return {schema:'applebuy-merchant-read/v1',documentId:h.phase==='REVIEW'?'FAKE-c054r1-review':'FAKE-c054r1-receipt',seq:++h.seq,phase:h.phase,verifiedStep:true,purchase:{...proof},extras:false,paymentMethod:'支付宝',existingOrdersChecked:true,termsLinks:[terms],slotSummary:missingBothSlots?null:time(date),orderRefHash:h.phase==='ORDER_RECEIPT'?ref:null,receiptVerified:h.phase==='ORDER_RECEIPT'};},
    async act(c){h.commands.push(c.action);h.phase='ORDER_RECEIPT';return {delivered:true};},
    async lookupOrder(){h.lookups++;return {independent:true,state:'unpaid',orderRefHash:ref,purchase:{...proof},acceptedSlot:missingBothSlots?null:time(date)};}};
  const grant=lookup?null:{id:'FAKE-c054r1-final-grant',taskId:initial.taskId,planDigest:digest,documentId:'FAKE-c054r1-review',termsUrl:terms,termsAccepted:true,existingOrdersChecked:true,noExtras:true,expiry:now+120000};
  const result=await new PurchaseJob({store,port,now:()=>now,id:()=> 'FAKE-c054r1-new-id'}).run(plan,{tabId:7,planDigest:digest,grant});
  assert.equal(result.expiresAt,initial.expiresAt);assert.deepEqual(result.initialDates,initial.initialDates);assert.deepEqual(result.floors,initial.floors);assert.deepEqual(result.history,initial.history);assert.deepEqual(result.acceptedSlot,initial.acceptedSlot);
  return {result,h,initial};
}
for(const lookup of [false,true])test('C054 R1 impossible identical calendar day cannot '+(lookup?'confirm an unknown final':'send a final'),async()=>{
  const {result,h,initial}=await run('February 30',{lookup});assert.notEqual(result.state,'CONFIRMED_UNPAID');assert.deepEqual(h.commands,[]);assert.deepEqual(result.pending,initial.pending);assert.deepEqual(result.finalIntent,initial.finalIntent);
});
for(const lookup of [false,true])test('C054 R1 exact label cannot bypass an ambiguous frozen calendar cohort at '+(lookup?'lookup':'review'),async()=>{
  const {result,h,initial}=await run('october5',{lookup,dates:['october5','October5','october6']});assert.notEqual(result.state,'CONFIRMED_UNPAID');assert.deepEqual(h.commands,[]);assert.deepEqual(result.pending,initial.pending);assert.deepEqual(result.finalIntent,initial.finalIntent);
});
test('C054 R1 missing saved and returned slots do not become a confirmed unknown final',async()=>{
  const {result,h,initial}=await run('october5',{lookup:true,missingBothSlots:true});assert.equal(result.state,'NEEDS_VERIFICATION');assert.deepEqual(h.commands,[]);assert.deepEqual(result.pending,initial.pending);assert.deepEqual(result.finalIntent,initial.finalIntent);
});
