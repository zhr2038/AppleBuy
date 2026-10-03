// Codex independent business-finalization repro of actual Claude review O4.
// All Chrome tabs, permissions, documents, receipt/order hashes and statuses below are FAKE; no real account/network,
// cart, slot, order, navigation or payment is performed. Actual ChromePort.lookupOrder is exercised against fake APIs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ChromePort} from '../web/checkout-connector/chrome-port.js';
import {PurchaseJob,TASK_KEY,NO_EXTRAS} from '../web/checkout-connector/job.js';
const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{...NO_EXTRAS}};
const ref='a'.repeat(64),slot={date:'FAKE-date',start:'21:15',end:'21:30',verified:true};
const purchase={itemVerified:true,verified:true,...plan.product,quantity:1,totalCny:9999,store:plan.stores[0],fulfillment:'pickup'};
function harness({outcome='unpaid'}={}){
  const h={url:'https://secure6.www.apple.com.cn/shop/checkout',doc:'FAKE-receipt',phase:'ORDER_RECEIPT',states:[],commands:[],navigations:0,scriptReads:0};
  const raw=()=>({schema:'applebuy-merchant-read/v1',phase:h.phase,verifiedStep:true,purchase:{...purchase,verified:outcome!=='wrong-item'||h.phase==='ORDER_RECEIPT'},slotSummary:slot,orderRefHash:ref,receiptVerified:h.phase==='ORDER_RECEIPT',orderDetailLink:h.phase==='ORDER_RECEIPT'?'https://www.apple.com.cn/shop/order/FAKE-observed-link':null});
  const api={tabs:{async get(){return {url:h.url};},async update(id,{url}){h.navigations++;h.url=url;h.doc='FAKE-detail';h.phase=outcome==='auth'?'AUTH':'ORDER_DETAIL';}},permissions:{async contains(){return true;}},scripting:{async executeScript(q){assert.equal(q.world,'ISOLATED');assert.equal(q.args.length,1,'lookup never dispatches a command');h.scriptReads++;if(outcome==='read-lost'&&h.navigations)throw new Error('FAKE detail read lost');return [{frameId:0,documentId:h.doc,result:raw()}];}}};
  h.row={schema:'applebuy-purchase-job/v1',taskId:'FAKE-sent-task',plan,planDigest:'FAKE-digest',tabId:7,state:'NEEDS_VERIFICATION',lastRead:4,lastPhase:'ORDER_RECEIPT',lastDocumentId:'FAKE-receipt',entryDocumentId:'FAKE-entry',expiresAt:90000,initialDates:[slot.date],dateCursor:0,floors:{},rejected:[],refusals:0,pending:{id:'FAKE-submit',action:'submitOrder',documentId:'FAKE-old-doc',beforePhase:'REVIEW',deadline:99000},finalIntent:{id:'FAKE-intent',sent:true},orderRefHash:ref,acceptedSlot:slot,bagAddStarted:true,resourceWritten:true,history:[{event:'FAKE-kept'}],observationCurrent:true};
  const store={async get(){return structuredClone(h.row);},async put(k,s){assert.equal(k,TASK_KEY);h.row=structuredClone(s);}};
  h.port=new ChromePort(api,7,{authorized:false,mode:'observe',initialSequence:4});h.port.wait=async()=>{};
  h.job=new PurchaseJob({store,port:h.port,now:()=>100000,onState:s=>h.states.push({...s})});
  h.run=(options={})=>h.job.run(plan,{tabId:7,planDigest:'FAKE-digest',...options});return h;
}
const truthful=h=>{for(const s of h.states.filter(s=>s.state==='CONFIRMED_UNPAID'||s.reason==='final-result-unconfirmed; no resubmission'))assert.ok(!s.observationCurrent||s.phase===h.phase,'post-lookup may record its real observed phase, or qualify the old phase as last-read; cannot call receipt the current detail/auth page');};
test('C023 verified independent unpaid lookup never labels its old receipt as the current detail page',async()=>{
  const h=harness(),before=structuredClone(h.row);const r=await h.run();assert.equal(r.state,'CONFIRMED_UNPAID');assert.equal(r.pending,null);assert.equal(h.navigations,1);assert.equal(h.phase,'ORDER_DETAIL');truthful(h);
  assert.equal(r.expiresAt,before.expiresAt);assert.deepEqual(r.history,before.history);assert.equal(r.finalIntent.sent,true);assert.equal(h.commands.length,0);
});
for(const outcome of ['auth','wrong-item','read-lost'])test('C023 '+outcome+' after lookup navigation keeps unknown sent truth and does not claim receipt current',async()=>{
  const h=harness({outcome}),before=structuredClone(h.row);const r=await h.run();assert.equal(r.state,'NEEDS_VERIFICATION');assert.equal(r.reason,'final-result-unconfirmed; no resubmission');assert.deepEqual(r.pending,before.pending);assert.equal(r.finalIntent.sent,true);assert.equal(h.navigations,1);truthful(h);assert.equal(h.commands.length,0);
});
test('C023 readonly same-tab final reconciliation never navigates/looks up/resubmits, its fresh receipt read remains truthful',async()=>{
  const h=harness(),before=structuredClone(h.row);const r=await h.run({mode:'reconcile'});assert.equal(r.state,'NEEDS_VERIFICATION');assert.equal(r.observationCurrent,true);assert.equal(r.lastPhase,'ORDER_RECEIPT');assert.equal(h.navigations,0);assert.equal(h.scriptReads,1);assert.deepEqual(r.pending,before.pending);assert.equal(h.commands.length,0);
});
