// C060 Root genuine-quota implementation checks. Production restart and controller; ALL transport/merchant effects FAKE.
import test from 'node:test';
import assert from 'node:assert/strict';
import {restartExpiredPreFinal} from '../web/checkout-connector/pre-final-restart.js';
import {PurchaseJob,TASK_KEY,NO_EXTRAS,canonicalJson} from '../web/checkout-connector/job.js';
const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{...NO_EXTRAS}};
const NOW=100000,term='https://www.apple.com.cn/shop/open/salespolicies',digest='FAKE-c060-digest';
const retired={schema:'applebuy-purchase-job/v1',state:'RETIRED',finalIntent:null,acceptedSlot:null,pending:null,history:[]};
const oldRow=()=>({schema:'applebuy-purchase-job/v1',taskId:'FAKE-c060-old',plan:structuredClone(plan),planDigest:digest,tabId:6,state:'NEEDS_VERIFICATION',lastRead:4,lastPhase:'UNKNOWN',lastDocumentId:'FAKE-c060-old-slots',expiresAt:90000,initialDates:['october5','october6'],dateCursor:0,floors:{october5:'21:15'},rejected:[],refusals:0,pending:{id:'FAKE-c060-old-choice',action:'chooseSlot',documentId:'FAKE-c060-old-slots',beforePhase:'SLOTS',deadline:99000,date:'october5',start:'21:15',end:'21:30'},acceptedSlot:null,finalIntent:null,bagAddStarted:true,resourceWritten:true,untouchedFailures:0,untouchedStreak:0,quotedCny:9999,bagTotalCny:9999,history:[{event:'FAKE-old-kept'}],retiredHistory:[structuredClone(retired)],closedCheckoutProbe:{schema:'applebuy-checkout-probe/v1',planDigest:digest,tabId:8,state:'NEEDS_USER',pending:{action:'checkout'}}});
const empty={schema:'applebuy-merchant-read/v1',phase:'EMPTY_BAG',verifiedStep:true,path:'/shop/bag',documentId:'FAKE-c060-empty',seq:1};
function harness(opts={}){
 const h={row:{...oldRow(),...opts.row},live:true,writes:0,reads:0};h.before=structuredClone(h.row);
 const store={async get(){return structuredClone(h.row);},async put(k,v){assert.equal(k,TASK_KEY);h.writes++;h.row=structuredClone(v);opts.onPut?.(h);}};
 const api={tabs:{async query(){if(opts.queryError)throw Error('FAKE query');return opts.tabs??[{id:7,url:'https://www.apple.com.cn/shop/bag'}];}}};
 const port={async observe(){h.reads++;opts.onRead?.(h);if(opts.readError)throw Error('FAKE read');return {...empty,...opts.observation};},async act(){throw Error('Restart cannot act');}};
 const run=(changes={})=>restartExpiredPreFinal({store,api,port,plan,planDigest:digest,tabId:7,enabled:true,dateWindowConfirmed:true,live:()=>h.live,now:()=>NOW,id:()=> 'FAKE-c060-new',...changes});return {h,store,run};
}
test('C060 successor retains the full old unknown attempt and new dates have explicit new identity',async()=>{
 const w=harness(),r=await w.run();assert.equal(r.created,true);assert.equal(w.h.writes,1);assert.equal(w.h.row.taskId,'FAKE-c060-new');assert.equal(w.h.row.finalIntent,null);assert.equal(w.h.row.pending,null);assert.equal(w.h.row.bagAddStarted,false);assert.equal(w.h.row.initialDates,null);
 const a=w.h.row.retiredHistory.at(-1);assert.equal(a.state,'RETIRED');assert.equal(a.reconcileOnly,true);assert.deepEqual(a.pending,w.h.before.pending);assert.deepEqual(a.abandonedPreFinal.originalSnapshot,w.h.before);assert.equal(w.h.row.restartFromPreFinal.remoteHold,'unknown');
 const again=await w.run();assert.equal(again.created,false);assert.equal(w.h.writes,1);
});
for(const [name,opts] of [['unknown final',{row:{finalIntent:{id:'FAKE-final',sent:false}}}],['missing final field',{row:{finalIntent:undefined}}],['not expired',{row:{expiresAt:200000}}],['original tab open',{tabs:[{id:6},{id:7}]}],['probe tab open',{tabs:[{id:8},{id:7}]}],['competing checkout',{tabs:[{id:7},{id:9,url:'https://secure8.www.apple.com.cn/shop/checkout/'}]}],['competing authentication',{tabs:[{id:7},{id:9,url:'https://secure11.www.apple.com.cn/shop/signIn'}]}],['query failed',{queryError:true}],['read failed',{readError:true}],['bag not empty',{observation:{phase:'BAG'}}],['empty unverified',{observation:{verifiedStep:false}}],['history incomplete',{row:{retiredHistory:[{schema:'applebuy-purchase-job/v1',state:'RETIRED'}]}}],['old accepted slot',{row:{acceptedSlot:{date:'october5',start:'21:15',end:'21:30',verified:true}}}],['invalid probe',{row:{closedCheckoutProbe:{schema:'FAKE-unknown',tabId:8}}}]])test('C060 '+name+' creates no successor and preserves old state',async()=>{
 const w=harness(opts),r=await w.run();assert.equal(r.created,false);assert.equal(w.h.writes,0);assert.deepEqual(w.h.row,w.h.before);
});
test('C060 current enablement, date window, unique identity and immutable old snapshot are required',async()=>{
 for(const change of [{enabled:false},{dateWindowConfirmed:false},{id:()=> 'FAKE-c060-old'},{planDigest:'FAKE-other'}]){const w=harness();assert.equal((await w.run(change)).created,false);assert.equal(w.h.writes,0);}
 const w=harness({onRead:h=>h.row.reason='FAKE changed while read'});assert.equal((await w.run()).created,false);assert.equal(w.h.writes,0);
});
test('C060 any recorded order reference blocks a new buyer even when a final marker is absent',async()=>{
 for(const row of [{orderRefHash:'FAKE-order'},{orderDetailLink:'FAKE-order-link'},{retiredHistory:[{...retired,orderRefHash:'FAKE-prior-order'}]}]){const w=harness({row});assert.equal((await w.run()).created,false);assert.equal(w.h.writes,0);assert.deepEqual(w.h.row,w.h.before);}
});
test('C060 pause before write creates nothing; pause after local creation preserves both histories',async()=>{
 const a=harness({onRead:h=>h.live=false});assert.equal((await a.run()).created,false);assert.equal(a.h.writes,0);
 const b=harness({onPut:h=>h.live=false});const r=await b.run();assert.equal(r.created,true);assert.equal(r.state,'PAUSED_AFTER_LOCAL_CREATION');assert.deepEqual(b.h.row.retiredHistory.at(-1).abandonedPreFinal.originalSnapshot,b.h.before);
});
test('C060 actual successor controller runs empty bag to one unpaid FAKE order, duplicate restart never adds or submits twice',async()=>{
 const w=harness();assert.equal((await w.run()).created,true);
 let phase='EMPTY_BAG',seq=0,configured=[],selected=null,payment=null,ref=null,orders=0;const calls=[];
 const purchase={...plan.product,quantity:1,totalCny:9999,itemVerified:true,verified:true,fulfillment:'pickup',store:plan.stores[0],storeVerified:true};
 const base=()=>({schema:'applebuy-merchant-read/v1',phase,verifiedStep:true,documentId:'FAKE-'+phase,seq:++seq,generation:1,path:phase==='EMPTY_BAG'||phase==='BAG'?'/shop/bag':phase==='ENTRY'||phase==='VARIANT'?'/shop/buy-iphone/iphone-18-pro':'/shop/checkout',purchase:{...purchase},extras:false,termsLinks:[term],existingOrdersChecked:true,acceptedSlot:selected,slotSummary:selected,paymentMethod:payment,orderRefHash:ref,receiptVerified:!!ref});
 const port={async observe(){const o=base();if(phase==='ENTRY'){o.nextChoice={choice:['model','color','capacity','tradeIn','appleCare'][configured.length],state:'enabled'};o.selectedProductChoices=[...configured];}if(phase==='VARIANT'){o.variantVerified=true;o.quotedCny=9999;o.selectedProductChoices=[...configured];}if(phase==='FULFILLMENT'){o.fulfillmentChoice='unselected';o.purchase.fulfillment=null;}if(phase==='SLOTS'){o.fulfillmentChoice='pickup';o.listComplete=true;o.dates=[{label:'October 8',ref:'date:0',enabled:true,selected:true},{label:'October 9',ref:'date:1',enabled:true}];o.selectedDate='October 8';o.times=[{start:'09:00',end:'09:15',ref:'time:1',enabled:true},{start:'21:15',end:'21:30',ref:'time:46',enabled:true}];}return o;},
 async readBag(){return {...empty,documentId:'FAKE-c060-side-bag',seq:++seq};},
 async act(c){calls.push(c.action);if(c.action==='openProduct')phase='ENTRY';else if(c.action==='configureProduct'){configured.push(c.choice);if(configured.length===5)phase='VARIANT';}else if(c.action==='addBag')phase='BAG';else if(c.action==='checkout')phase='FULFILLMENT';else if(c.action==='selectPickup')phase='SLOTS';else if(c.action==='chooseSlot'){selected={date:c.date,start:c.start,end:c.end,verified:true};phase='DETAILS';}else if(c.action==='fillDetails')phase='PAYMENT';else if(c.action==='selectPayment')payment='支付宝';else if(c.action==='continuePayment')phase='REVIEW';else if(c.action==='submitOrder'){orders++;ref='b'.repeat(64);phase='ORDER_RECEIPT';}else throw Error('Unexpected '+c.action);return {delivered:true};},
 async lookupOrder(){return {state:'unpaid',independent:true,orderRefHash:ref,purchase,acceptedSlot:selected};}};
 const grant={id:'FAKE-c060-new-final-approval',taskId:'FAKE-c060-new',planDigest:digest,start:true,entryDocumentId:'FAKE-EMPTY_BAG',expiry:NOW+500000,existingOrdersChecked:true,noExtras:true,termsAccepted:true,termsUrl:term};
 const result=await new PurchaseJob({store:w.store,port,now:()=>NOW,maxSteps:100}).run(plan,{tabId:7,planDigest:digest,grant,taskId:grant.taskId});assert.equal(result.state,'CONFIRMED_UNPAID');assert.equal(orders,1);assert.equal(calls.filter(x=>x==='addBag').length,1);assert.equal(calls.filter(x=>x==='submitOrder').length,1);assert.equal(result.acceptedSlot.date,'October 8');assert.equal(result.acceptedSlot.start,'21:15');assert.deepEqual(result.retiredHistory.at(-1).abandonedPreFinal.originalSnapshot,w.h.before);
 assert.equal((await w.run()).created,false);await new PurchaseJob({store:w.store,port,now:()=>NOW}).run(plan,{tabId:7,planDigest:digest});assert.equal(orders,1);assert.equal(calls.filter(x=>x==='addBag').length,1);
});
