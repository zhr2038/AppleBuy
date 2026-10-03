// C-023 implementation tests (Claude): truthful page labels after the nested final-order lookup. Chrome tabs, permissions,
// documents, receipt/order hashes, clock, locks and stores are FAKE; the actual ChromePort, PurchaseJob and control.js run
// against them. No browser, account, network, cart, slot, real order, navigation or payment is touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
import {PurchaseJob,TASK_KEY,VALIDATION_KEY,NO_EXTRAS,retirable} from '../web/checkout-connector/job.js';
import {ChromePort,allowedMerchantUrl} from '../web/checkout-connector/chrome-port.js';
import {withPurchaseOwner} from '../web/checkout-connector/owner.js';

// Same member order as control.js plan(), so the control page computes this exact digest.
const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{...NO_EXTRAS}};
const digest=createHash('sha256').update(JSON.stringify(plan)).digest('hex');
const ref='c'.repeat(64),slot={date:'FAKE-c023-date',start:'21:15',end:'21:30',verified:true};
const purchase={itemVerified:true,verified:true,...plan.product,quantity:1,totalCny:9999,store:plan.stores[0],fulfillment:'pickup'};
const detailLink='https://www.apple.com.cn/shop/order/FAKE-c023-link';
// FAKE Chrome. The receipt names one official detail link; following it shows `after` (a page phase, or LOST: that read
// throws). `detail` overrides only the detail page's facts. A script call carrying a command would be counted, never expected.
function chromeApi({after='ORDER_DETAIL',detail={},granted=()=>true}={}){
  const h={url:'https://secure6.www.apple.com.cn/shop/checkout',phase:'ORDER_RECEIPT',doc:'FAKE-c023-receipt',navigations:[],reads:0,commands:0,sessionReads:0};
  const page=()=>({schema:'applebuy-merchant-read/v1',phase:h.phase,verifiedStep:true,purchase:{...purchase},slotSummary:{...slot},orderRefHash:ref,receiptVerified:h.phase==='ORDER_RECEIPT',orderDetailLink:h.phase==='ORDER_RECEIPT'?detailLink:null,...(h.phase==='ORDER_DETAIL'?structuredClone(detail):{})});
  h.api={tabs:{async get(id){assert.equal(id,7);return {url:h.url};},async update(id,{url}){assert.equal(id,7);h.navigations.push(url);h.url=url;h.doc='FAKE-c023-detail';h.phase=after;}},
    permissions:{async contains({origins}){return granted(origins[0]);}},
    scripting:{async executeScript(q){assert.equal(q.world,'ISOLATED');if(q.args.length!==1)h.commands++;h.reads++;if(h.phase==='LOST')throw new Error('FAKE detail read lost');return [{frameId:0,documentId:h.doc,result:page()}];}}};
  return h;
}
// A preserved task whose final submission was dispatched with an unknown result; its old flag still says current.
function row(o={}){return {schema:'applebuy-purchase-job/v1',taskId:'FAKE-c023-task',plan:structuredClone(plan),planDigest:digest,tabId:7,state:'NEEDS_VERIFICATION',reason:'mutation-transport-lost; reconcile before proceeding',lastRead:4,lastPhase:'REVIEW',lastDocumentId:'FAKE-c023-review',entryDocumentId:'FAKE-c023-entry',expiresAt:90000,initialDates:[slot.date],dateCursor:0,floors:{},rejected:[],refusals:0,pending:{id:'FAKE-c023-submit',action:'submitOrder',intentId:'FAKE-c023-intent',documentId:'FAKE-c023-review',beforePhase:'REVIEW',deadline:99000},finalIntent:{id:'FAKE-c023-intent',grantId:'FAKE-c023-grant',sent:true},orderRefHash:null,acceptedSlot:{...slot},bagAddStarted:true,resourceWritten:true,untouchedFailures:0,untouchedStreak:0,quotedCny:9999,history:[{event:'FAKE-c023-kept'}],observationCurrent:true,...o};}
function job(h,stored){
  const t={row:stored,states:[]};
  const store={async get(k){assert.equal(k,TASK_KEY);return structuredClone(t.row);},async put(k,s){assert.equal(k,TASK_KEY);t.row=structuredClone(s);}};
  // Even an authorized purchase port only observes and looks up for an unknown final submission.
  const port=new ChromePort(h.api,7,{authorized:true,initialSequence:stored.lastRead,pending:stored.pending});port.wait=async()=>{};
  t.job=new PurchaseJob({store,port,now:()=>100000,onState:s=>t.states.push(structuredClone(s))});
  t.run=()=>t.job.run(plan,{tabId:7,planDigest:digest});return t;
}
const kept=(r,before)=>{assert.deepEqual(r.finalIntent,before.finalIntent);assert.equal(r.expiresAt,before.expiresAt);assert.deepEqual(r.history,before.history);assert.deepEqual(r.acceptedSlot,before.acceptedSlot);};

test('C023 a fresh receipt read is current until the nested lookup; the confirmed order then names it only as last read',async()=>{
  const h=chromeApi(),before=row(),t=job(h,before);const r=await t.run();
  assert.equal(r.state,'CONFIRMED_UNPAID');assert.equal(r.pending,null);assert.equal(r.orderRefHash,ref);assert.equal(r.lastPhase,'ORDER_RECEIPT');assert.equal(r.observationCurrent,false);kept(r,before);
  assert.deepEqual(h.navigations,[detailLink]);assert.equal(h.phase,'ORDER_DETAIL');assert.equal(h.commands,0);
  // RUNNING (old REVIEW, not current), receipt read, receipt identity save, confirmed after the lookup.
  assert.deepEqual(t.states.map(s=>[s.state,s.phase,s.observationCurrent]),[['RUNNING','REVIEW',false],['RUNNING','ORDER_RECEIPT',true],['RUNNING','ORDER_RECEIPT',true],['CONFIRMED_UNPAID','ORDER_RECEIPT',false]]);
});
test('C023 an ungranted detail-link host is neither navigated nor treated as failure; the sent final stays unconfirmed',async()=>{
  const h=chromeApi({granted:o=>o!=='https://www.apple.com.cn/*'}),before=row(),t=job(h,before);const r=await t.run();
  assert.equal(r.state,'NEEDS_VERIFICATION');assert.equal(r.reason,'final-result-unconfirmed; no resubmission');assert.deepEqual(r.pending,before.pending);assert.equal(r.observationCurrent,false);kept(r,before);
  assert.deepEqual(h.navigations,[]);assert.equal(h.commands,0);assert.equal(t.states.at(-1).observationCurrent,false);
});
test('C023 a lost detail read stays unknown; a later Resume looks up again, confirms once and never resubmits',async()=>{
  const h=chromeApi({after:'LOST'}),before=row({orderRefHash:ref}),t=job(h,before);const r=await t.run();
  assert.equal(r.state,'NEEDS_VERIFICATION');assert.equal(r.reason,'final-result-unconfirmed; no resubmission');assert.deepEqual(r.pending,before.pending);assert.equal(r.observationCurrent,false);assert.equal(r.lastPhase,'ORDER_RECEIPT');kept(r,before);
  // The detail page later finishes loading in the same tab: the new run reads it itself and the lookup does not navigate again.
  h.phase='ORDER_DETAIL';const again=job(h,t.row),r2=await again.run();
  assert.equal(r2.state,'CONFIRMED_UNPAID');assert.equal(r2.pending,null);assert.equal(r2.lastPhase,'ORDER_DETAIL');assert.equal(r2.observationCurrent,false);kept(r2,before);
  assert.deepEqual(h.navigations,[detailLink]);assert.equal(h.commands,0);
});
for(const [name,detail] of [['another slot',{slotSummary:{...slot,start:'21:00',end:'21:15'}}],['a total above the cap',{purchase:{...purchase,totalCny:10000}}],['two units',{purchase:{...purchase,quantity:2}}],['another store',{purchase:{...purchase,store:'Apple FAKE 其他门店'}}],['another receipt identity',{orderRefHash:'d'.repeat(64)}]])
  test('C023 a navigated detail page with '+name+' is never confirmed and never labelled current',async()=>{
    const h=chromeApi({detail}),before=row({orderRefHash:ref}),t=job(h,before);const r=await t.run();
    assert.equal(r.state,'NEEDS_VERIFICATION');assert.equal(r.reason,'final-result-unconfirmed; no resubmission');assert.deepEqual(r.pending,before.pending);assert.equal(r.observationCurrent,false);kept(r,before);
    assert.deepEqual(h.navigations,[detailLink]);assert.equal(h.commands,0);
  });

// The actual control.js status text, driven through its buttons with the actual ChromePort over the FAKE Chrome API.
async function control(h,stored){
  const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,disabled:false,textContent:'',href:'',replaceChildren(){}});return nodes.get(id);};
  node('product').value='pro';node('tab').value='7';node('approve').checked=true;
  const c={row:stored,node};
  const chrome={...h.api,storage:{local:{async get(k){return {[k]:structuredClone(c.row)};},async set(v){c.row=structuredClone(v[TASK_KEY]);}},session:{async get(){h.sessionReads++;return {};},async set(){throw new Error('FAKE test must not write session data');}}}};
  const context=vm.createContext({document:{getElementById:node},chrome,navigator:{locks:{async request(name,opt,fn){return fn({});}}},crypto:webcrypto,TextEncoder,Date,URL,structuredClone,PurchaseJob,ChromePort,allowedMerchantUrl,withPurchaseOwner,TASK_KEY,VALIDATION_KEY,NO_EXTRAS,retirable});
  const source=readFileSync(new URL('../web/checkout-connector/control.js',import.meta.url),'utf8').replace(/^import .*;\r?$/gm,'');
  await vm.runInContext('(async()=>{'+source+'\n})()',context);
  c.click=id=>nodes.get(id).onclick();c.status=()=>node('state').textContent;return c;
}
for(const [after,expected] of [['ORDER_DETAIL','状态：CONFIRMED_UNPAID；最近已读页面：ORDER_RECEIPT；'],['AUTH','状态：NEEDS_VERIFICATION；最近已读页面：ORDER_RECEIPT；待确认动作：提交订单；请勿重复执行；final-result-unconfirmed; no resubmission']])
  test('C023 control Resume after a lookup that reached '+after+' names the receipt only as the last read page',async()=>{
    const h=chromeApi({after}),c=await control(h,row({orderRefHash:ref}));await c.click('resume');
    assert.equal(c.status(),expected);assert.deepEqual(h.navigations,[detailLink]);assert.equal(h.commands,0);assert.equal(c.node('final').disabled,true);
  });
test('C023 control same-tab readonly reconcile reads once, never navigates or looks up, and calls only that fresh read current',async()=>{
  const h=chromeApi(),c=await control(h,row({orderRefHash:ref}));await c.click('reconcile');
  assert.equal(c.status(),'状态：NEEDS_VERIFICATION；页面：ORDER_RECEIPT；待确认动作：提交订单；请勿重复执行；final-result-unconfirmed; no resubmission');
  assert.equal(h.reads,1);assert.deepEqual(h.navigations,[]);assert.equal(h.commands,0);assert.equal(h.sessionReads,0);assert.equal(c.row.pending.action,'submitOrder');assert.equal(c.row.expiresAt,90000);
});
