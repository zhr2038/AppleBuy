// C056 Codex quota author self-checks: actual probe controller; all API/clock/store/proof/effects FAKE.
// No personal browser, network, real checkout, slot, order or payment.
import test from 'node:test';
import assert from 'node:assert/strict';
import {probeClosedCheckout} from '../web/checkout-connector/closed-checkout-probe.js';
import {TASK_KEY,NO_EXTRAS} from '../web/checkout-connector/job.js';
const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{...NO_EXTRAS}};
const proof={itemVerified:true,verified:true,...plan.product,quantity:1,totalCny:9999,store:null,fulfillment:null};
const retired={schema:'applebuy-purchase-job/v1',state:'RETIRED',finalIntent:null,acceptedSlot:null,pending:null,history:[]};
const row=()=>({schema:'applebuy-purchase-job/v1',taskId:'FAKE-c056-task',plan:structuredClone(plan),planDigest:'FAKE-c056-digest',tabId:6,state:'NEEDS_VERIFICATION',lastRead:4,lastPhase:'UNKNOWN',lastDocumentId:'FAKE-c056-old',expiresAt:90000,initialDates:['october5','october6'],dateCursor:0,floors:{october5:'21:15'},rejected:[],refusals:0,pending:{id:'FAKE-c056-old-choice',documentId:'FAKE-c056-old-slots',action:'chooseSlot',beforePhase:'SLOTS',deadline:99000,date:'october5',start:'21:15',end:'21:30'},acceptedSlot:null,finalIntent:null,bagAddStarted:true,resourceWritten:true,untouchedFailures:0,untouchedStreak:0,quotedCny:9999,bagTotalCny:9999,history:[{event:'FAKE-c056-kept'}],retiredHistory:[structuredClone(retired),{...structuredClone(retired),retiredHistory:[structuredClone(retired)]}],retiredCart:{quantity:1,totalCny:9999}});
function world(opts={}){
  const initial={...row(),...opts.record},h={row:structuredClone(initial),phase:'BAG',calls:[],reads:0,writes:0,live:true,seq:0};
  const store={async get(k){assert.equal(k,TASK_KEY);return structuredClone(h.row);},async put(k,v){assert.equal(k,TASK_KEY);h.writes++;h.row=structuredClone(v);opts.onSave?.(h);}};
  const api={tabs:{async query(){if(opts.queryError)throw Error('FAKE query failed');return opts.tabs??[{id:7,url:'https://www.apple.com.cn/shop/bag'}];}}};
  const port={async observe(){h.reads++;if(opts.permission&&h.phase!=='BAG')throw Object.assign(Error('CurrentHostPermissionMissing'),{origin:'https://secure11.www.apple.com.cn'});return {schema:'applebuy-merchant-read/v1',phase:h.phase,verifiedStep:true,path:h.phase==='BAG'?'/shop/bag':'/shop/checkout',documentId:'FAKE-c056-'+h.phase,seq:++h.seq,purchase:{...proof,...(h.phase==='BAG'?opts.bag:{})},extras:opts.extras??false};},
    async act(c){h.calls.push(c.action);assert.equal(c.action,'checkout');assert.equal(h.row.closedCheckoutProbe.pending.dispatched,undefined);assert.equal(h.row.pending.action,'chooseSlot');opts.onAct?.(h);if(opts.untouched)return {delivered:false,touched:false};h.phase=opts.after??'FULFILLMENT';if(opts.unknown)throw Error('FAKE result lost');return {delivered:true};}};
  const run=(change={})=>probeClosedCheckout({store,api,port,plan,tabId:7,planDigest:initial.planDigest,enabled:true,live:()=>h.live,now:()=>100000,id:()=> 'FAKE-c056-new-checkout',...change});
  const preserved=()=>{const {closedCheckoutProbe,...rest}=h.row;assert.deepEqual(rest,initial);};
  return {h,initial,run,preserved};
}
test('C056 matching singleton bag sends one write-ahead checkout, observes current step, preserves ALL old facts',async()=>{
  const w=world();const r=await w.run();assert.equal(r.state,'NEEDS_VERIFICATION');assert.equal(r.phase,'FULFILLMENT');assert.equal(r.originalSlotUnresolved,true);assert.equal(r.purchaseComplete,false);assert.equal(w.h.row.closedCheckoutProbe.pending,null);assert.deepEqual(w.h.calls,['checkout']);w.preserved();await w.run();assert.deepEqual(w.h.calls,['checkout']);w.preserved();
});
for(const [name,opts] of [['wrong product',{bag:{model:'iPhone Duo'}}],['two items',{bag:{quantity:2}}],['different total',{bag:{totalCny:9998}}],['extras',{extras:true}],['unverified item',{bag:{itemVerified:false}}],['prior final',{record:{finalIntent:{id:'FAKE-old-final',sent:false}}}],['readonly',{record:{reconcileOnly:true}}],['still-live task',{record:{expiresAt:200000}}],['original still open',{tabs:[{id:6},{id:7,url:'https://www.apple.com.cn/shop/bag'}]}],['query failed',{queryError:true}],['another disclosed checkout',{tabs:[{id:7,url:'https://www.apple.com.cn/shop/bag'},{id:8,url:'https://secure8.www.apple.com.cn/shop/checkout'}]}],['prior nested final',{record:{retiredHistory:[{...retired,retiredHistory:[{...retired,finalIntent:{id:'FAKE-old-final',sent:true}}]}]}}]])test('C056 '+name+' blocks with no checkout or old-record change',async()=>{
  const w=world(opts);await w.run();assert.deepEqual(w.h.calls,[]);assert.equal(w.h.writes,0);w.preserved();
});
test('C056 failed checkout and restart only observe; new tab cannot rebind or repeat',async()=>{
  const w=world({unknown:true,after:'UNKNOWN'});await w.run();assert.deepEqual(w.h.calls,['checkout']);assert.equal(w.h.row.closedCheckoutProbe.pending.action,'checkout');await w.run();assert.deepEqual(w.h.calls,['checkout']);w.h.phase='FULFILLMENT';await w.run();assert.equal(w.h.row.closedCheckoutProbe.pending,null);assert.deepEqual(w.h.calls,['checkout']);await w.run({tabId:8});assert.deepEqual(w.h.calls,['checkout']);w.preserved();
});
test('C056 AUTH and new host permission pause preserve probe and old slot; no repeated checkout',async()=>{
  const w=world({after:'AUTH'});const r=await w.run();assert.equal(r.state,'NEEDS_USER');assert.equal(r.phase,'AUTH');assert.equal(w.h.row.closedCheckoutProbe.pending.action,'checkout');await w.run();assert.deepEqual(w.h.calls,['checkout']);w.preserved();
  const m=world({after:'FULFILLMENT',permission:true});const p=await m.run();assert.equal(p.permissionOrigin,'https://secure11.www.apple.com.cn');assert.equal(m.h.row.closedCheckoutProbe.pending.action,'checkout');assert.deepEqual(m.h.calls,['checkout']);m.preserved();
});
test('C056 cancellation before send stays positively unsent; after send does not read or repeat',async()=>{
  const a=world({onSave:h=>{if(h.row.closedCheckoutProbe.state==='PREPARED')h.live=false;}});await a.run();assert.deepEqual(a.h.calls,[]);assert.equal(a.h.row.closedCheckoutProbe.pending.dispatched,false);a.h.live=true;await a.run();assert.deepEqual(a.h.calls,[]);a.preserved();
  const b=world({onAct:h=>h.live=false});await b.run();assert.deepEqual(b.h.calls,['checkout']);assert.equal(b.h.reads,1);assert.equal(b.h.row.closedCheckoutProbe.pending.action,'checkout');b.preserved();
});
test('C056 explicit enablement and binding are mandatory, a known untouched result never auto-repeats',async()=>{
  const a=world();await a.run({enabled:false});assert.equal(a.h.reads,0);assert.deepEqual(a.h.calls,[]);await a.run({planDigest:'FAKE-wrong'});assert.deepEqual(a.h.calls,[]);a.preserved();
  const b=world({untouched:true});await b.run();assert.equal(b.h.row.closedCheckoutProbe.pending.dispatched,false);await b.run();assert.deepEqual(b.h.calls,['checkout']);b.preserved();
});
