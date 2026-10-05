// C064 author regressions; production controller/port, fully FAKE merchant and Chrome API effects.
import test from 'node:test';import assert from 'node:assert/strict';
import {createPurchaseRecord,PurchaseJob,TASK_KEY,NO_EXTRAS} from '../web/checkout-connector/job.js';
import {ChromePort} from '../web/checkout-connector/chrome-port.js';
const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{...NO_EXTRAS}};
const purchase={...plan.product,quantity:1,totalCny:9999,itemVerified:true,verified:false};
const matching={schema:'applebuy-merchant-read/v1',phase:'BAG',verifiedStep:true,path:'/shop/bag',documentId:'FAKE-side',extras:false,purchase};
function harness({bag=matching,sideError=false,pause=false,delta={}}={}){
 let row={...createPurchaseRecord(plan,{taskId:'FAKE-task',planDigest:'FAKE-digest',tabId:7,now:0,id:()=> 'FAKE'}),bagAddStarted:true,resourceWritten:true,pending:{id:'FAKE-sent-add',action:'addBag',beforePhase:'VARIANT',documentId:'FAKE-product',deadline:1}},phase='UNKNOWN',seq=0,reads=0;const commands=[];
 Object.assign(row,delta);const before=structuredClone(row),store={async get(){return structuredClone(row);},async put(k,v){assert.equal(k,TASK_KEY);row=structuredClone(v);}};
 let job;const port={async observe(){return {schema:'applebuy-merchant-read/v1',phase,verifiedStep:phase==='BAG',path:phase==='BAG'?'/shop/bag':'/shop/buy-iphone/iphone-18-pro',documentId:'FAKE-'+phase,seq:++seq,merchantError:phase==='UNKNOWN'?'page-not-found':undefined,purchase,extras:false};},async readBagAfterAdd(){reads++;if(pause)job.pause();if(sideError)throw Error('FAKE read');return {...bag,seq:++seq};},async act(c){commands.push(c.action);if(c.action==='openBag'){assert.equal(c.afterAddReconciliation,true);phase='BAG';}else if(c.action==='checkout')phase='AUTH';else throw Error('No second Add permitted');return {delivered:true};}};
 job=new PurchaseJob({store,port,now:()=>100,maxSteps:8});return {run:options=>job.run(plan,{tabId:7,planDigest:'FAKE-digest',...options}),before,commands,get row(){return row;},get reads(){return reads;},port};
}
test('C064 a fresh proved matching bag resolves only Add and automatically navigates then freshly checks out',async()=>{
 const w=harness(),r=await w.run();assert.deepEqual(w.commands,['openBag','checkout']);assert.equal(r.state,'NEEDS_USER');assert.equal(r.pending.action,'checkout');assert.equal(r.bagAddStarted,true);assert.equal(w.reads,1);assert.ok(r.history.some(h=>h.event==='add-reconciled-from-current-bag'&&h.originalPending.id===w.before.pending.id));
});
for(const [name,options] of [['empty',{bag:{...matching,phase:'EMPTY_BAG',purchase:null,extras:null}}],['query failure',{sideError:true}],['multiple items',{bag:{...matching,purchase:{...purchase,quantity:2}}}],['foreign item',{bag:{...matching,purchase:{...purchase,color:'FAKE-other'}}}],['extras',{bag:{...matching,extras:true}}],['unverified',{bag:{...matching,verifiedStep:false}}],['wrong path',{bag:{...matching,path:'/shop/checkout'}}]])test('C064 '+name+' retains the unknown Add and cannot navigate or resubmit',async()=>{
 const w=harness(options),r=await w.run();assert.deepEqual(w.commands,[]);assert.deepEqual(r.pending,w.before.pending);assert.equal(r.bagAddStarted,true);assert.match(r.reason,/merchant-page-not-found.*no automatic repeat/);await w.run();assert.deepEqual(w.commands,[]);
});
test('C064 pause during bag verification suppresses navigation and preserves the original Add',async()=>{const w=harness({pause:true}),r=await w.run();assert.equal(r.state,'PAUSED');assert.deepEqual(w.commands,[]);assert.deepEqual(r.pending,w.before.pending);});
test('C064 readonly and rebound jobs cannot use positive bag evidence to resume buying',async()=>{
 const a=harness();await a.run({mode:'reconcile'});assert.equal(a.reads,0);assert.deepEqual(a.commands,[]);
 const b=harness();await b.run({rebind:true});assert.equal(b.reads,0);assert.deepEqual(b.commands,[]);
});
test('C064 ChromePort read-after-Add proof is purchase-only and cannot be forged by a command flag',async()=>{
 for(const opts of [{authorized:false},{authorized:true,mode:'observe'},{authorized:true,mode:'public-config'}]){const p=new ChromePort({},7,opts);assert.equal(typeof p.readBagAfterAdd,'function');await assert.rejects(p.readBagAfterAdd(plan),/BagReadNotAuthorized/);}
 const api={tabs:{async get(){return {url:'https://www.apple.com.cn/shop/buy-iphone/iphone-18-pro'};}},permissions:{async contains(){return true;}}};const p=new ChromePort(api,7,{authorized:true});p.last={documentId:'FAKE-error',summaryUsable:true,raw:{phase:'UNKNOWN',merchantError:'page-not-found'}};
 await assert.rejects(p.act({action:'openBag',afterAddReconciliation:true,bagReadSeq:1,documentId:'FAKE-error',plan}),/CurrentOperationNotAuthorized/);
});
test('C064 final, accepted-slot and order-reference contexts never enter Add recovery',async()=>{
 for(const delta of [{finalIntent:{id:'FAKE-final',sent:false}},{acceptedSlot:{verified:true}},{orderRefHash:'FAKE-order'},{orderDetailLink:'FAKE-link'}]){const w=harness({delta}),r=await w.run();assert.equal(w.reads,0);assert.deepEqual(w.commands,[]);assert.deepEqual(r.pending,w.before.pending);}
});
test('C064 port-owned positive proof cannot transfer to another plan, document or read sequence',async()=>{
 for(const fault of ['plan','document','sequence','late-read']){
  const p=new ChromePort({tabs:{async get(){return {url:'https://www.apple.com.cn/shop/buy-iphone/iphone-18-pro'};}},permissions:{async contains(){return true;}}},7,{authorized:true});
  p.last={documentId:'FAKE-error',summaryUsable:true,raw:{phase:'UNKNOWN',merchantError:'page-not-found'}};
  p.readBag=async()=>{if(fault==='late-read')p.last={...p.last,documentId:'FAKE-replaced'};return {...matching,seq:2};};
  await p.readBagAfterAdd(plan);if(fault==='document')p.last.documentId='FAKE-replaced';
  await assert.rejects(p.act({action:'openBag',afterAddReconciliation:true,bagReadSeq:fault==='sequence'?3:2,documentId:p.last.documentId,plan:fault==='plan'?{...plan,maxTotalCny:10000}:plan}),/CurrentOperationNotAuthorized/);
 }
});
