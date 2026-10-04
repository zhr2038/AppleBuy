// C043 (Claude): bounded read-only recovery of a rejected read inside the sent final's receipt-link lookup, in the run that sent it.
// The actual ChromePort and PurchaseJob run over FAKE Chrome tabs/permissions/scripting, pages, documents, receipt hash, grant, clock
// and store. No browser, network, account, slot, order or payment.
import test from 'node:test';
import assert from 'node:assert/strict';
import {PurchaseJob,TASK_KEY} from '../web/checkout-connector/job.js';
import {ChromePort} from '../web/checkout-connector/chrome-port.js';

const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{tradeIn:'none',appleCare:'none'}};
// The FAKE clock starts at the real time only because the port checks its review grant against Date.now().
const digest='FAKE-c043-digest',ref='f'.repeat(64),link='https://www.apple.com.cn/shop/order/FAKE-c043-link',TERMS='https://www.apple.com.cn/shop/open/salespolicies',start=Date.now();
const purchase={itemVerified:true,verified:true,...plan.product,quantity:1,totalCny:9999,store:plan.stores[0],fulfillment:'pickup'};
const slot={date:'October 4',start:'21:15',end:'21:30',verified:true};
const pages={
  REVIEW:{phase:'REVIEW',verifiedStep:true,path:'/shop/checkout',purchase,slotSummary:slot,paymentMethod:'支付宝',extras:false,termsLinks:[TERMS]},
  RECEIPT:{phase:'ORDER_RECEIPT',verifiedStep:true,path:'/shop/checkout',purchase,slotSummary:slot,orderRefHash:ref,receiptVerified:true,orderDetailLink:link},
  PROCESSING:{phase:'PROCESSING',verifiedStep:false,path:'/shop/order/FAKE-c043-link'},
  DETAIL:{phase:'ORDER_DETAIL',verifiedStep:true,path:'/shop/order/FAKE-c043-link',purchase,slotSummary:slot,orderRefHash:ref},
  AUTH:{phase:'AUTH',verifiedStep:false,path:'/shop/signIn/orders'},
  UNKNOWN:{phase:'UNKNOWN',verifiedStep:false,path:'/shop/order/FAKE-c043-link'},
};
// FAKE Chrome. Reads before the receipt link is followed take the `before` entries, reads after it the `after` entries; the last entry
// repeats. An entry is [name, overrides, then]: a page name, REJECT (the injection promise rejects, as when a document change removes
// the frame) or RETURNED/ERRORED/TWO_FRAMES (frame results came back without one recognizable decode). `then` changes the FAKE tab,
// address or permission once that read is answered. A command injection is recorded and acknowledged as delivered.
function chromeApi({before=[['REVIEW'],['RECEIPT']],after=[['DETAIL']],granted=()=>true}={}){
  const h={url:'https://secure8.www.apple.com.cn/shop/checkout',granted,closed:false,navigations:[],commands:[],reads:0,rejected:0,used:{before:0,after:0}};
  h.api={tabs:{async get(id){assert.equal(id,7);if(h.closed)throw new Error('FAKE No tab with id');return {id,url:h.url,status:'complete'};},
      async update(id,{url}){assert.equal(id,7);h.navigations.push(url);h.url=url;return {id,url,status:'complete'};}},
    permissions:{async contains({origins}){return h.granted(origins[0]);}},
    scripting:{async executeScript(q){assert.equal(q.world,'ISOLATED');
      if(q.args.length>1){h.commands.push(q.args[1].action);return [{frameId:0,documentId:q.target.documentIds[0],result:{delivered:true}}];}
      h.reads++;const side=h.navigations.length?'after':'before',list=side==='after'?after:before,[name,over,then]=list[Math.min(h.used[side]++,list.length-1)];then?.(h);
      if(name==='REJECT'){h.rejected++;throw new Error('FAKE Frame with ID 0 was removed.');}
      if(name==='RETURNED')return [{frameId:0,documentId:'FAKE-c043-returned',result:null}];
      if(name==='ERRORED')return [{frameId:0,documentId:'FAKE-c043-errored',error:'FAKE page program error'}];
      const result={schema:'applebuy-merchant-read/v1',...structuredClone(pages[name==='TWO_FRAMES'?'DETAIL':name]),...structuredClone(over??{})};
      if(name==='TWO_FRAMES')return [{frameId:0,documentId:'FAKE-c043-detail',result},{frameId:0,documentId:'FAKE-c043-other',result}];
      return [{frameId:0,documentId:'FAKE-c043-'+name.toLowerCase(),result}];}}};
  return h;
}
const GRANT={id:'FAKE-c043-grant',start:true,entryDocumentId:'FAKE-c043-entry',taskId:'FAKE-c043-task',planDigest:digest,existingOrdersChecked:true,noExtras:true,termsAccepted:true,termsUrl:TERMS,expiry:start+600000};
// The task at its final review with an accepted FAKE slot, no final intent and nothing pending. The run below sends the one FAKE final.
const reviewRow=()=>({schema:'applebuy-purchase-job/v1',taskId:'FAKE-c043-task',plan:structuredClone(plan),planDigest:digest,tabId:7,state:'RUNNING',reason:null,lastRead:4,lastPhase:'PAYMENT',lastDocumentId:'FAKE-c043-payment',entryDocumentId:'FAKE-c043-entry',expiresAt:start+600000,initialDates:[slot.date],dateCursor:0,floors:{},rejected:[],refusals:0,pending:null,finalIntent:null,orderRefHash:null,acceptedSlot:{...slot},bagAddStarted:true,resourceWritten:true,untouchedFailures:0,untouchedStreak:0,quotedCny:9999,history:[{event:'FAKE-c043-kept'}],observationCurrent:false});
function job(h,{stored=reviewRow(),readOnly=false}={}){
  const t={row:structuredClone(stored),waits:0,time:start};
  const store={async get(k){assert.equal(k,TASK_KEY);return structuredClone(t.row);},async put(k,s){assert.equal(k,TASK_KEY);t.row=structuredClone(s);}};
  const seq=stored.lastRead,port=new ChromePort(h.api,7,readOnly?{mode:'observe',initialSequence:seq}:{authorized:true,initialSequence:seq,pending:stored.pending,acceptedSlot:stored.acceptedSlot,reviewGrant:GRANT});
  port.wait=async()=>{t.waits++;t.time+=50;};
  t.run=()=>new PurchaseJob({store,port,now:()=>t.time}).run(plan,{tabId:7,planDigest:digest,...(readOnly?{mode:'reconcile'}:{grant:GRANT})});
  return t;
}
const confirmed=(s,h)=>{
  assert.equal(s.state,'CONFIRMED_UNPAID');assert.equal(s.reason,null);assert.equal(s.pending,null);assert.equal(s.orderRefHash,ref);assert.equal(s.finalIntent.sent,true);assert.equal(s.finalIntent.grantId,GRANT.id);
  assert.equal(s.revokedGrantIds,undefined);assert.equal(s.expiresAt,start+600000);assert.deepEqual(s.history,[{event:'FAKE-c043-kept'}]);assert.deepEqual(h.commands,['submitOrder']);assert.deepEqual(h.navigations,[link]);
};
// The one sent final stays unconfirmed: its write-ahead record, original deadline, expiry and history are kept, its start grant stays
// revoked and nothing is sent again.
const unconfirmed=(s,h,navigations)=>{
  assert.equal(s.state,'NEEDS_VERIFICATION');assert.equal(s.reason,'final-result-unconfirmed; no resubmission');assert.equal(s.pending.action,'submitOrder');assert.equal(s.pending.deadline,start+8000);
  assert.equal(s.finalIntent.sent,true);assert.equal(s.finalIntent.grantId,GRANT.id);assert.equal(s.expiresAt,start+600000);assert.deepEqual(s.history,[{event:'FAKE-c043-kept'}]);assert.deepEqual(s.revokedGrantIds,[GRANT.id]);
  assert.deepEqual(h.commands,['submitOrder']);assert.deepEqual(h.navigations,navigations);
};

for(const [name,before,after,waits,rejected] of [
  ['one rejected read just after the receipt link is followed',undefined,[['REJECT'],['DETAIL']],2,1],
  ['rejected reads around the still shown receipt and processing',undefined,[['REJECT'],['RECEIPT'],['PROCESSING'],['REJECT'],['DETAIL']],5,2],
  ['a rejected lookup read of the receipt before its link is followed',[['REVIEW'],['RECEIPT'],['REJECT'],['RECEIPT']],undefined,2,1],
])
  test('C043 '+name+' is read again; the run that sent the one FAKE final confirms it unpaid',async()=>{
    const h=chromeApi({before,after}),t=job(h),s=await t.run();
    confirmed(s,h);assert.equal(h.rejected,rejected);assert.equal(t.waits,waits);
  });
for(const [name,before,after,rejected,navigations] of [
  ['every read after the link is rejected',undefined,[['REJECT']],40,[link]],
  ['the detail page still shows processing after one rejected read',undefined,[['REJECT'],['PROCESSING']],1,[link]],
  ['every receipt read inside the lookup is rejected',[['REVIEW'],['RECEIPT'],['REJECT']],undefined,41,[]],
  ['the receipt is read again only at the bound, leaving no read for a detail page',[['REVIEW'],['RECEIPT'],...Array.from({length:40},()=>['REJECT']),['RECEIPT']],undefined,40,[]],
])
  test('C043 when '+name+', the lookup ends at its existing bound of 40 waits and the sent final stays unconfirmed',async()=>{
    const h=chromeApi({before,after}),t=job(h),s=await t.run();
    unconfirmed(s,h,navigations);assert.equal(t.waits,40);assert.equal(h.rejected,rejected);
  });
for(const [name,after] of [
  ['the detail host permission is removed',[['REJECT',null,h=>{h.granted=()=>false;}],['DETAIL']]],
  ['the tab is closed',[['REJECT',null,h=>{h.closed=true;}],['DETAIL']]],
  ['the tab shows an unsupported account address',[['REJECT',null,h=>{h.url='https://www.apple.com.cn/shop/account/home';}],['DETAIL']]],
  ['the tab shows a non-Apple address',[['REJECT',null,h=>{h.url='https://example.invalid/shop/order/FAKE-c043-link';}],['DETAIL']]],
  ['a frame result returns no decode',[['REJECT'],['RETURNED'],['DETAIL']]],
  ['a frame result returns an error',[['REJECT'],['ERRORED'],['DETAIL']]],
  ['two frame results return',[['REJECT'],['TWO_FRAMES'],['DETAIL']]],
])
  test('C043 after one rejected lookup read, when '+name+', the lookup stops at once and the sent final stays unconfirmed',async()=>{
    const h=chromeApi({after}),t=job(h),s=await t.run();
    // The later detail entry is never read: no further attempt follows a failure that is not script transport.
    unconfirmed(s,h,[link]);assert.equal(h.rejected,1);assert.equal(t.waits,2);assert.equal(h.used.after,after.length-1);
  });
for(const [name,page] of [
  ['an authentication page',['AUTH']],
  ['an unrecognized page',['UNKNOWN']],
  ['a detail page without verified purchase evidence',['DETAIL',{purchase:{...purchase,verified:false}}]],
  ['a detail page without a slot summary',['DETAIL',{slotSummary:null}]],
  ['a detail page without an order identity',['DETAIL',{orderRefHash:null}]],
  ['a detail page of another order identity',['DETAIL',{orderRefHash:'d'.repeat(64)}]],
  ['a detail page with two units',['DETAIL',{purchase:{...purchase,quantity:2}}]],
  ['a detail page of another color',['DETAIL',{purchase:{...purchase,color:'星光白色'}}]],
  ['a detail page of another capacity',['DETAIL',{purchase:{...purchase,capacity:'512GB'}}]],
  ['a detail page above the price cap',['DETAIL',{purchase:{...purchase,totalCny:10000}}]],
  ['a detail page with another store',['DETAIL',{purchase:{...purchase,store:'Apple FAKE 其他门店'}}]],
  ['a detail page with another pickup date',['DETAIL',{slotSummary:{...slot,date:'October 5'}}]],
  ['a detail page with another pickup slot',['DETAIL',{slotSummary:{...slot,start:'21:00',end:'21:15'}}]],
])
  test('C043 a rejected lookup read followed by '+name+' is never confirmed',async()=>{
    const h=chromeApi({after:[['REJECT'],page]}),t=job(h),s=await t.run();
    unconfirmed(s,h,[link]);assert.equal(h.rejected,1);assert.equal(t.waits,2);
  });
for(const [name,granted,receipt] of [
  ['an ungranted detail host',o=>o!=='https://www.apple.com.cn/*',{}],
  ['an observed link outside the order route',()=>true,{orderDetailLink:'https://www.apple.com.cn/shop/account/home'}],
])
  test('C043 a rejected receipt read inside the lookup never lets '+name+' be navigated',async()=>{
    const h=chromeApi({before:[['REVIEW'],['RECEIPT',receipt],['REJECT'],['RECEIPT',receipt]],granted}),t=job(h),s=await t.run();
    unconfirmed(s,h,[]);assert.equal(h.rejected,1);assert.equal(t.waits,1);
  });
test('C043 read-only reconciliation after the lookup bound reads once, never waits, looks up or navigates again',async()=>{
  // The run that sent the final stopped at the lookup bound; the detail document still rejects every injection.
  const h=chromeApi({after:[['REJECT']]}),first=job(h);await first.run();
  const t=job(h,{stored:first.row,readOnly:true}),reads=h.reads,s=await t.run();
  assert.equal(s.state,'NEEDS_VERIFICATION');assert.equal(s.reason,'observation-transport-failed');assert.equal(t.waits,0);assert.equal(h.reads,reads+1);
  assert.deepEqual(h.commands,['submitOrder']);assert.deepEqual(h.navigations,[link]);assert.deepEqual(s.pending,first.row.pending);assert.deepEqual(s.finalIntent,first.row.finalIntent);
});
test('C043 read-only reconciliation on the receipt never follows its link, even once its host is granted',async()=>{
  const h=chromeApi({granted:o=>o!=='https://www.apple.com.cn/*'}),first=job(h);await first.run();assert.deepEqual(h.navigations,[]);
  h.granted=()=>true;const t=job(h,{stored:first.row,readOnly:true}),reads=h.reads,s=await t.run();
  assert.equal(s.state,'NEEDS_VERIFICATION');assert.equal(s.reason,'final-result-unconfirmed; no resubmission');assert.equal(t.waits,0);assert.equal(h.reads,reads+1);
  assert.deepEqual(h.commands,['submitOrder']);assert.deepEqual(h.navigations,[]);assert.deepEqual(s.pending,first.row.pending);assert.deepEqual(s.finalIntent,first.row.finalIntent);
});
