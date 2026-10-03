// Codex independent C034 repro. All merchant fields, cart units, actions and storage below are FAKE.
// No Apple/browser/credential/order/slot action. Tests the actual current PurchaseJob rather than a replacement engine.
import test from 'node:test';
import assert from 'node:assert/strict';
import {PurchaseJob,TASK_KEY} from '../web/checkout-connector/job.js';
const pro={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{tradeIn:'none',appleCare:'none'}};
const duo={...pro,product:{model:'iPhone Duo',capacity:'256GB',color:'星光白色'},maxTotalCny:15999};
const initial=()=>({schema:'applebuy-purchase-job/v1',taskId:'FAKE-c034-old',plan:structuredClone(pro),planDigest:'FAKE-pro-digest',tabId:7,state:'NEEDS_USER',lastPhase:'BAG',lastDocumentId:'FAKE-bag-doc',entryDocumentId:'FAKE-old-doc',reason:'read-only-reconciliation-complete',pending:null,finalIntent:null,orderRefHash:null,initialDates:null,dateCursor:0,floors:{},rejected:[],refusals:0,lastRead:1,expiresAt:100000,bagAddStarted:true,resourceWritten:true,untouchedFailures:0,untouchedStreak:0,quotedCny:9999,bagTotalCny:9999,reconcileOnly:true,mode:'purchase',history:[{event:'human-tab-rebind',fromTabId:6,toTabId:7,at:100}]});
const bag=p=>({schema:'applebuy-merchant-read/v1',phase:'BAG',verifiedStep:true,documentId:'FAKE-current-doc',extras:false,purchase:{...p.product,itemVerified:true,verified:false,quantity:1,totalCny:p.maxTotalCny,store:null,fulfillment:null}});
async function prepare(){
 let row=initial(),seq=1;const store={get:async()=>structuredClone(row),put:async(k,v)=>{assert.equal(k,TASK_KEY);row=structuredClone(v);}};
 const port={observe:async()=>({...bag(pro),seq:++seq}),act:async()=>{throw Error('Retirement must never act');}};
 const retired=await new PurchaseJob({store,port,now:()=>1000}).retireReadOnlyBag(pro,{tabId:7,planDigest:'FAKE-pro-digest'});
 assert.equal(retired.state,'RETIRED');assert.equal(retired.bagAddStarted,true);return {store,retired,readRow:()=>structuredClone(row)};
}
for(const [name,p] of [['same Pro',pro],['Duo after Pro',duo]])for(const stage of ['ENTRY','VARIANT','PRELAUNCH'])test('C034 no second cart addition: successor '+name+' starts on '+stage,async()=>{
 const h=await prepare(),actions=[];let phase=stage,seq=2,units=1,serial=0,selectedProductChoices=[];
 const port={observe:async()=>({schema:'applebuy-merchant-read/v1',documentId:'FAKE-current-doc',seq:++seq,phase,verifiedStep:true,path:p.product.model==='iPhone Duo'?'/shop/buy-iphone/iphone-duo':'/shop/buy-iphone/iphone-18-pro',variantVerified:phase==='VARIANT',quotedCny:p.maxTotalCny,extrasConflict:false,continueAvailable:true,
   selectedProductChoices,...(phase==='PRELAUNCH'?{prelaunchConfigurable:true,nextChoice:{choice:p.product.color,state:'enabled'}}:{nextChoice:null})}),
  act:async c=>{actions.push(c.action);if(c.action==='configureProduct'){selectedProductChoices=[c.choice];phase='ENTRY';}else if(c.action==='continueProduct')phase='VARIANT';else if(c.action==='addBag'){units++;phase='AUTH';}return {delivered:true};},wait:async()=>{}};
 const r=await new PurchaseJob({store:h.store,port,now:()=>1000,id:()=> 'FAKE-c034-new-'+(++serial),maxSteps:20}).run(p,{tabId:7,planDigest:p===pro?'FAKE-pro-digest':'FAKE-duo-digest'});
 assert.equal(actions.includes('addBag'),false,'the retired cart still contains its original one item; no successor may append before a trustworthy new cart fact');
 assert.equal(units,1);assert.notEqual(r.state,'CONFIRMED_UNPAID');assert.ok(r.retiredHistory.some(x=>x.taskId===h.retired.taskId&&x.bagAddStarted===true));
});
test('C034 a matching BAG-start successor still performs exactly one checkout and no addition',async()=>{
 const h=await prepare(),actions=[];let phase='BAG',seq=2,serial=0;
 const port={observe:async()=>({...bag(pro),phase,seq:++seq}),act:async c=>{actions.push(c.action);phase='AUTH';return {delivered:true};}};
 const r=await new PurchaseJob({store:h.store,port,now:()=>1000,id:()=> 'FAKE-c034-new-'+(++serial)}).run(pro,{tabId:7,planDigest:'FAKE-pro-digest'});
 assert.deepEqual(actions,['checkout']);assert.equal(r.reason,'auth');assert.deepEqual(r.retiredHistory,[h.retired]);
});
