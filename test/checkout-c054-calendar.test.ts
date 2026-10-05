// C054 (Claude) author cases. Only the actual PurchaseJob and its pure calendar helper run; the clock, store, verified observations,
// grants, receipt, order lookup and every merchant effect are FAKE. No browser, network, account, private value, real slot, order or
// payment is used. Labels follow the reader's own grammar (page-program.js); none of them is an observed Apple contract or claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import {PurchaseJob,TASK_KEY,NO_EXTRAS,calendarDay,sameCalendarDay} from '../web/checkout-connector/job.js';

const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{...NO_EXTRAS}};
const proof={itemVerified:true,verified:true,...plan.product,quantity:1,totalCny:9999,store:plan.stores[0],fulfillment:'pickup'};
const slot=(date,start='21:15',end='21:30')=>({date,start,end,verified:true});
const ref='b'.repeat(64),now=100000,digest='FAKE-c054c-digest',terms='https://www.apple.com.cn/shop/open/salespolicies';
const cohort=['october5','october6','october7'];
const REVIEW_BLOCK='final-review-or-existing-order-check-missing',UNKNOWN='final-result-unconfirmed; no resubmission',CONFIRM='confirm-current-terms-and-this-one-order';
function row(date,{lookup,dates}){
  return {schema:'applebuy-purchase-job/v1',taskId:'FAKE-c054c-task',plan:structuredClone(plan),planDigest:digest,tabId:7,state:'NEEDS_VERIFICATION',lastRead:4,lastPhase:'REVIEW',lastDocumentId:'FAKE-c054c-review',entryDocumentId:'FAKE-c054c-entry',expiresAt:lookup?90000:900000,initialDates:[...dates],dateCursor:0,floors:{[date]:'21:15'},rejected:[],refusals:0,
    pending:lookup?{id:'FAKE-c054c-submit',action:'submitOrder',intentId:'FAKE-c054c-intent',documentId:'FAKE-c054c-review',beforePhase:'REVIEW',deadline:99000}:null,
    finalIntent:lookup?{id:'FAKE-c054c-intent',grantId:'FAKE-c054c-used-grant',sent:true}:null,orderRefHash:lookup?ref:null,acceptedSlot:slot(date),bagAddStarted:true,resourceWritten:true,untouchedFailures:0,untouchedStreak:0,quotedCny:9999,bagTotalCny:9999,history:[{event:'FAKE-c054c-preserve'}],observationCurrent:false};
}
// C054 only compares. Every raw record (dates, cursor, floors, refusals, accepted slot, history, expiry, sent final) stays as it was.
function preserved(result,initial,lookup){
  assert.equal(result.taskId,initial.taskId);assert.equal(result.expiresAt,initial.expiresAt);assert.deepEqual(result.initialDates,initial.initialDates);assert.equal(result.dateCursor,initial.dateCursor);
  assert.deepEqual(result.floors,initial.floors);assert.deepEqual(result.rejected,initial.rejected);assert.equal(result.refusals,initial.refusals);assert.deepEqual(result.acceptedSlot,initial.acceptedSlot);assert.deepEqual(result.history,initial.history);
  if(lookup)assert.deepEqual(result.finalIntent,initial.finalIntent);
}
async function run({accepted='october5',summary='10月5日',dates,lookup=false,phase,obs={},order={},grant={},row:over={},mode='purchase'}={}){
  const initial={...row(accepted,{lookup,dates:dates??(cohort.includes(accepted)?cohort:[accepted])}),...over};
  const h={row:structuredClone(initial),phase:phase??(lookup?'ORDER_RECEIPT':'REVIEW'),seq:initial.lastRead,commands:[],lookups:0};
  const store={async get(k){assert.equal(k,TASK_KEY);return structuredClone(h.row);},async put(k,v){assert.equal(k,TASK_KEY);h.row=structuredClone(v);}};
  const port={async observe(){const receipt=h.phase==='ORDER_RECEIPT';return {schema:'applebuy-merchant-read/v1',documentId:receipt?'FAKE-c054c-receipt':'FAKE-c054c-review',seq:++h.seq,phase:h.phase,verifiedStep:true,purchase:{...proof},extras:false,paymentMethod:'支付宝',existingOrdersChecked:true,termsLinks:[terms],slotSummary:slot(summary),orderRefHash:receipt?ref:null,receiptVerified:receipt,...obs};},
    async act(c){h.commands.push(c.action);h.phase='ORDER_RECEIPT';return {delivered:true};},
    async lookupOrder(){h.lookups++;if(order==='throw')throw new Error('FAKE-c054c-lookup-failure');if(order===null)return null;return {independent:true,state:'unpaid',orderRefHash:ref,purchase:{...proof},acceptedSlot:slot(summary),...order};}};
  const g=grant===null?null:{id:'FAKE-c054c-grant',taskId:initial.taskId,planDigest:digest,documentId:'FAKE-c054c-review',termsUrl:terms,termsAccepted:true,existingOrdersChecked:true,noExtras:true,expiry:now+120000,...grant};
  const again=(gr=g,m='purchase')=>new PurchaseJob({store,port,now:()=>now,id:()=>'FAKE-c054c-new-id'}).run(plan,{tabId:7,planDigest:digest,grant:gr,mode:m});
  const result=await again(g,mode);preserved(result,initial,lookup);
  return {result,h,initial,again,g};
}

test('C054 calendar identity equates only the same real day within the reader grammar',()=>{
  for(const [a,b] of [['october5','October 5'],['october5','10月5日'],['October 5','10月5日'],['october5','OCTOBER  5'],['october5','10月5日 周一'],['october5','10月5日星期一'],['10月5日 周日','10月5日'],
    ['10月05日','October 05'],['2026年10月5日','2026年10月5日 周一'],['2026年10月5日 星期一','2026年10月5日 周一'],['february29','2月29日'],['2028年2月29日','2028年2月29日 周二']]){
    assert.equal(sameCalendarDay(a,b),true,a+' / '+b);assert.equal(sameCalendarDay(b,a),true,b+' / '+a);
  }
  for(const [a,b] of [['october5','10月6日'],['october5','10月4日'],['october5','11月5日'],['october5','2026年10月5日'],['2026年10月5日','10月5日 周一'],['2026年10月5日','2027年10月5日'],
    ['10月5日 周一','10月5日 周二'],['2026年10月5日 周日','2026年10月5日'],['october5','明天'],['october5','今天'],['october5','Oct 5'],['october5','October 5th'],['october5','10/5'],['october5','2026-10-05'],
    ['october5','10 月 5 日'],['october5',' October 5'],['october5','10月5'],['october32','10月32日'],['february30','2月30日'],['2027年2月29日','2027年2月29日'],['13月5日','13月5日'],['0月5日','0月5日'],
    ['10月0日','10月0日'],['FAKE-c054c-day','FAKE-c054c-day'],['FAKE-c054c-day','FAKE-c054c-other'],[undefined,undefined],[null,'10月5日'],[5,'10月5日'],['october5',{month:10,day:5}]]){
    assert.equal(sameCalendarDay(a,b),false,String(a)+' / '+String(b));assert.equal(sameCalendarDay(b,a),false,String(b)+' / '+String(a));
  }
  assert.deepEqual(calendarDay('2026年10月5日 周一'),{year:2026,month:10,day:5,weekday:1});
  assert.deepEqual(calendarDay('october5'),{year:null,month:10,day:5,weekday:null});
  assert.deepEqual(calendarDay('10月5日星期天'),{year:null,month:10,day:5,weekday:0});
  for(const x of ['明天','后天','today','tomorrow','2026-10-05','10/05','Oct 5','october','october 0','2月30日','2026年2月29日','2026年10月5日 周日','','10月5日 ','10月5日 周八'])assert.equal(calendarDay(x),null,x);
});

test('C054 calendar identity never reads the machine clock',()=>{
  const RealDate=globalThis.Date;
  class NoClock extends RealDate{constructor(...a){if(a.length===0)throw new Error('clock read');super(...a);}static now(){throw new Error('clock read');}}
  globalThis.Date=NoClock;
  try{
    assert.equal(sameCalendarDay('october5','10月5日'),true);assert.equal(sameCalendarDay('october5','2026年10月5日'),false);
    assert.deepEqual(calendarDay('2028年2月29日 周二'),{year:2028,month:2,day:29,weekday:2});assert.equal(calendarDay('2028年2月29日 周三'),null);
  }finally{globalThis.Date=RealDate;}
});

for(const [summary,lookupDate] of [['10月5日','10月5日'],['10月5日 周一','10月5日 周一'],['October 5','October 5'],['10月5日','October 5']])
  test('C054 complete FAKE review shown as '+summary+' submits once and the independent lookup ('+lookupDate+') confirms that order; reruns never submit again',async()=>{
    const {result,h,initial,again,g}=await run({summary,order:{acceptedSlot:slot(lookupDate)}});
    assert.equal(result.state,'CONFIRMED_UNPAID');assert.equal(result.reason,null);assert.equal(result.pending,null);assert.equal(result.orderRefHash,ref);
    assert.deepEqual(result.finalIntent,{id:'FAKE-c054c-new-id',grantId:'FAKE-c054c-grant',sent:true});
    assert.deepEqual(h.commands,['submitOrder']);assert.equal(h.lookups,1);
    for(const gr of [g,null,{...g,id:'FAKE-c054c-second-grant'}]){
      const r=await again(gr);assert.equal(r.state,'CONFIRMED_UNPAID');assert.deepEqual(r.finalIntent,result.finalIntent);preserved(r,initial,false);
    }
    assert.deepEqual(h.commands,['submitOrder']);assert.equal(h.lookups,1);
  });

test('C054 explicit equal years, distinct explicit-year cohort members and exact opaque labels keep progressing',async()=>{
  for(const c of [{accepted:'2026年10月5日',summary:'2026年10月5日 周一',dates:['2026年10月5日','2027年10月5日']},{accepted:'FAKE-c054c-opaque-day',summary:'FAKE-c054c-opaque-day'}])
    for(const lookup of [false,true]){
      const {result,h}=await run({...c,lookup});
      assert.equal(result.state,'CONFIRMED_UNPAID',c.summary);assert.deepEqual(h.commands,lookup?[]:['submitOrder']);assert.equal(h.lookups,1);
    }
});

for(const [name,accepted,summary,dates] of [
  ['an adjacent day','october5','10月6日'],
  ['a different month','october5','11月5日'],
  ['a one-sided unproved year','october5','2026年10月5日'],
  ['a year only on the accepted side','2026年10月5日','10月5日 周一'],
  ['different explicit years','2026年10月5日','2027年10月5日'],
  ['a weekday contradicting the explicit year','2026年10月5日','2026年10月5日 周日'],
  ['a relative word','october5','明天'],
  ['an unsupported abbreviation','october5','Oct 5'],
  ['an invalid day on both sides','february30','2月30日'],
  ['a non-leap February 29','2027年2月29日','2027年2月29日 周一'],
  ['a different opaque string','FAKE-c054c-opaque-day','FAKE-c054c-opaque-day2'],
  ['an empty summary date','october5',''],
  ['no summary date','october5',undefined],
])for(const lookup of [false,true])test('C054 '+name+' cannot '+(lookup?'confirm an unknown final':'submit an order'),async()=>{
  // The observed date is passed explicitly so an absent date stays absent (a destructuring default would replace undefined).
  const {result,h,initial}=await run({accepted,summary,dates,lookup,obs:{slotSummary:slot(summary)},order:{acceptedSlot:slot(summary)}});
  assert.equal(result.state,lookup?'NEEDS_VERIFICATION':'BLOCKED');assert.equal(result.reason,lookup?UNKNOWN:REVIEW_BLOCK);
  assert.deepEqual(h.commands,[]);assert.equal(h.lookups,lookup?1:0);assert.deepEqual(result.pending,initial.pending);assert.deepEqual(result.finalIntent,initial.finalIntent);
});

for(const [name,obs] of [
  ['a different start time',{slotSummary:slot('10月5日','21:00','21:15')}],
  ['a different end time',{slotSummary:slot('10月5日','21:15','21:45')}],
  ['no slot summary',{slotSummary:undefined}],
  ['a null slot summary',{slotSummary:null}],
  ['a different store',{purchase:{...proof,store:'FAKE-c054c-other-store'}}],
  ['a different product',{purchase:{...proof,color:'白色'}}],
  ['two units',{purchase:{...proof,quantity:2}}],
  ['money different from the recorded quote',{purchase:{...proof,totalCny:9998}}],
  ['money above the cap',{purchase:{...proof,totalCny:10000}}],
  ['an unverified purchase',{purchase:{...proof,verified:false}}],
  ['another payment method',{paymentMethod:'FAKE-c054c-other-payment'}],
  ['unknown extras',{extras:undefined}],
  ['selected extras',{extras:true}],
  ['unchecked existing orders',{existingOrdersChecked:false}],
])test('C054 a same-day review with '+name+' stays blocked',async()=>{
  const {result,h}=await run({obs});
  assert.equal(result.state,'BLOCKED');assert.equal(result.reason,REVIEW_BLOCK);assert.deepEqual(h.commands,[]);assert.equal(result.finalIntent,null);assert.equal(result.pending,null);
});

for(const [name,grant,obs] of [
  ['no current grant',null],
  ['a grant for another review document',{documentId:'FAKE-c054c-old-review'}],
  ['a grant for another task',{taskId:'FAKE-c054c-other-task'}],
  ['terms not linked on the current page',{termsUrl:'FAKE-c054c-other-terms'}],
  ['current terms missing from the page',{},{termsLinks:[]}],
  ['terms not accepted',{termsAccepted:false}],
  ['an expired grant',{expiry:now}],
  ['an over-long grant',{expiry:now+180001}],
])test('C054 a same-day date never replaces final authority: '+name,async()=>{
  const {result,h}=await run({grant,obs});
  assert.equal(result.state,'NEEDS_USER');assert.equal(result.reason,CONFIRM);assert.deepEqual(h.commands,[]);assert.equal(result.finalIntent,null);
});

for(const [name,order,over,phase] of [
  ['a non-independent read',{independent:false}],
  ['a different order state',{state:'FAKE-c054c-other-state'}],
  ['another order reference',{orderRefHash:'c'.repeat(64)}],
  ['no order reference',{orderRefHash:undefined}],
  ['no reference recorded from a verified receipt',{},{orderRefHash:null},'REVIEW'],
  ['a different store',{purchase:{...proof,store:'FAKE-c054c-other-store'}}],
  ['a different product',{purchase:{...proof,color:'白色'}}],
  ['two units',{purchase:{...proof,quantity:2}}],
  ['money above the cap',{purchase:{...proof,totalCny:10000}}],
  ['a different time',{acceptedSlot:slot('10月5日','21:00','21:15')}],
  ['no accepted slot',{acceptedSlot:undefined}],
  ['no lookup result',null],
  ['a failed lookup','throw'],
])test('C054 a same-day lookup with '+name+' stays unknown and never resubmits',async()=>{
  const {result,h,initial}=await run({lookup:true,order,row:over,phase});
  assert.equal(result.state,'NEEDS_VERIFICATION');assert.equal(result.reason,UNKNOWN);assert.deepEqual(h.commands,[]);assert.equal(h.lookups,1);
  assert.deepEqual(result.pending,initial.pending);assert.equal(result.orderRefHash,initial.orderRefHash);
});

test('C054 an unknown sent final with the review still shown and a fresh grant only looks up on restart, then confirms the same reference',async()=>{
  const order={acceptedSlot:slot('10月6日')};
  const {result,h,initial,again}=await run({lookup:true,phase:'REVIEW',order});
  assert.equal(result.state,'NEEDS_VERIFICATION');
  const second=await again();assert.equal(second.state,'NEEDS_VERIFICATION');
  order.acceptedSlot=slot('2026年10月5日');const third=await again();assert.equal(third.state,'NEEDS_VERIFICATION');
  order.acceptedSlot=slot('10月5日 周一');const fourth=await again();assert.equal(fourth.state,'CONFIRMED_UNPAID');assert.equal(fourth.pending,null);
  const fifth=await again();assert.equal(fifth.state,'CONFIRMED_UNPAID');
  for(const r of [second,third,fourth,fifth])preserved(r,initial,true);
  assert.deepEqual(h.commands,[]);assert.equal(h.lookups,4);
});

test('C054 read-only reconciliation neither looks up nor submits for a same-day review or unknown final',async()=>{
  const a=await run({lookup:true,mode:'reconcile'});
  assert.equal(a.result.state,'NEEDS_VERIFICATION');assert.equal(a.result.reason,UNKNOWN);assert.equal(a.h.lookups,0);assert.deepEqual(a.h.commands,[]);assert.deepEqual(a.result.pending,a.initial.pending);
  const b=await run({mode:'reconcile'});assert.equal(b.result.state,'NEEDS_USER');assert.deepEqual(b.h.commands,[]);assert.equal(b.result.finalIntent,null);
  const c=await run({row:{reconcileOnly:true}});assert.equal(c.result.state,'NEEDS_USER');assert.deepEqual(c.h.commands,[]);assert.equal(c.result.finalIntent,null);
});

test('C054 a recorded final intent or an expired task window still stops a same-day review',async()=>{
  const recorded={id:'FAKE-c054c-old-intent',grantId:'FAKE-c054c-grant',sent:false};
  const a=await run({row:{finalIntent:recorded}});
  assert.equal(a.result.state,'NEEDS_VERIFICATION');assert.equal(a.result.reason,'final-intent-already-recorded');assert.deepEqual(a.result.finalIntent,recorded);assert.deepEqual(a.h.commands,[]);
  const b=await run({row:{expiresAt:now}});
  assert.equal(b.result.state,'EXPIRED');assert.deepEqual(b.h.commands,[]);assert.equal(b.result.finalIntent,null);
});

for(const [name,dates] of [['two labels of the same unyear day',['october5','October5','october6']],['a year-bearing label that could be the same day',['october5','2026年10月5日','october6']]])
  test('C054 a frozen cohort with '+name+' blocks a different representation without merging, dropping, rebinding or rolling',async()=>{
    const a=await run({dates});assert.equal(a.result.state,'BLOCKED');assert.equal(a.result.reason,REVIEW_BLOCK);assert.deepEqual(a.h.commands,[]);
    const b=await run({dates,lookup:true});assert.equal(b.result.state,'NEEDS_VERIFICATION');assert.deepEqual(b.h.commands,[]);
    // C054-R1 (manager-permitted strengthening of these four expectations): the frozen cohort itself is ambiguous, so even the exact accepted
    // raw label stops with no new action and the pending/final facts preserved; nothing is merged, dropped, rebound or rolled.
    for(const lookup of [false,true]){const c=await run({dates,summary:'october5',lookup});assert.equal(c.result.state,lookup?'NEEDS_VERIFICATION':'BLOCKED');assert.deepEqual(c.h.commands,[]);assert.deepEqual(c.result.pending,c.initial.pending);assert.deepEqual(c.result.finalIntent,c.initial.finalIntent);}
  });

// C054-R1 (Claude) appended author cases. Same FAKE-only harness; nothing here is an observed Apple contract.
for(const label of ['February 30','february30','2月30日','13月5日','october32','2027年2月29日','2026年10月5日 周日','October 5th',' October 5','10 月 5 日','１０月５日','10月5日 周八','Oct 5','Sept. 5','2026-10-05','10/5','明天','tomorrow'])
  for(const lookup of [false,true])test('C054-R1 identical invalid or unsupported calendar-shaped '+JSON.stringify(label)+' cannot '+(lookup?'confirm an unknown final':'send a final'),async()=>{
    const {result,h,initial}=await run({accepted:label,summary:label,dates:[label],lookup});
    assert.equal(result.state,lookup?'NEEDS_VERIFICATION':'BLOCKED');assert.equal(result.reason,lookup?UNKNOWN:REVIEW_BLOCK);
    assert.deepEqual(h.commands,[]);assert.equal(h.lookups,lookup?1:0);assert.deepEqual(result.pending,initial.pending);assert.deepEqual(result.finalIntent,initial.finalIntent);
  });

for(const label of ['October 4','october5','10月23日','2026年10月5日 周一','FAKE-c023-date','FAKE-10月23日','FAKE-date'])for(const lookup of [false,true])
  test('C054-R1 identical valid or opaque label '+JSON.stringify(label)+' still '+(lookup?'confirms the same unknown final':'sends one final'),async()=>{
    const {result,h}=await run({accepted:label,summary:label,dates:[label],lookup});
    assert.equal(result.state,'CONFIRMED_UNPAID');assert.deepEqual(h.commands,lookup?[]:['submitOrder']);assert.equal(h.lookups,1);
  });

for(const [name,dates,accepted,summary] of [
  ['another member of a same-day pair',['october5','October5','october6'],'october6','october6'],
  ['a weekday-contradicting unyear pair',['10月5日 周一','10月5日 周二','october6'],'october6','10月6日'],
])for(const lookup of [false,true])test('C054-R1 an ambiguous frozen cohort blocks '+name+' at '+(lookup?'lookup':'review'),async()=>{
  const {result,h,initial}=await run({accepted,summary,dates,lookup});
  assert.equal(result.state,lookup?'NEEDS_VERIFICATION':'BLOCKED');assert.deepEqual(h.commands,[]);assert.deepEqual(result.pending,initial.pending);assert.deepEqual(result.finalIntent,initial.finalIntent);
});

test('C054-R1 distinct explicit years and opaque or invalid members do not make a cohort ambiguous',async()=>{
  for(const dates of [['2026年10月5日','2027年10月5日','october6'],['october6','FAKE-date','February 30']])for(const lookup of [false,true]){
    const {result,h}=await run({accepted:'october6',summary:'10月6日',dates,lookup});
    assert.equal(result.state,'CONFIRMED_UNPAID');assert.deepEqual(h.commands,lookup?[]:['submitOrder']);
  }
});

for(const [name,saved,seen] of [
  ['no saved or returned slot',null,null],
  ['no times on either side',{date:'october5',verified:true},{date:'october5',verified:true}],
  ['no end time on either side',{date:'october5',start:'21:15',verified:true},{date:'october5',start:'21:15',verified:true}],
  ['an empty date on both sides',slot(''),slot('')],
  ['no date on either side',{start:'21:15',end:'21:30',verified:true},{start:'21:15',end:'21:30',verified:true}],
  ['unrecognized times on both sides',slot('october5','9:15','9:30'),slot('october5','9:15','9:30')],
])for(const lookup of [false,true])test('C054-R1 '+name+' never '+(lookup?'confirms an unknown final':'sends a final'),async()=>{
  const {result,h,initial}=await run({lookup,row:{acceptedSlot:saved},obs:{slotSummary:seen},order:{acceptedSlot:seen}});
  assert.equal(result.state,lookup?'NEEDS_VERIFICATION':'BLOCKED');assert.equal(result.reason,lookup?UNKNOWN:REVIEW_BLOCK);
  assert.deepEqual(h.commands,[]);assert.equal(h.lookups,lookup?1:0);assert.deepEqual(result.pending,initial.pending);assert.deepEqual(result.finalIntent,initial.finalIntent);
});
