// Codex independent C035 repro: actual PurchaseJob; all cart, tabs, transport, authority and clock are FAKE.
// A known current item is inserted during public preparation, before this executor reaches Add to Bag.
// Old empty evidence must not cause a second addition. No Apple/browser/profile/network/resource is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import {PurchaseJob,TASK_KEY,NO_EXTRAS} from '../web/checkout-connector/job.js';
const pro={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{...NO_EXTRAS}};
const duo={...pro,product:{model:'iPhone Duo',capacity:'256GB',color:'星光白色'},maxTotalCny:15999};
async function run(foreign){
 const P=duo,choices=['星光白色','256GB','不折抵换购','不加 AppleCare+ 服务计划'];
 let row={schema:'applebuy-purchase-job/v1',taskId:'FAKE-root-c035',plan:structuredClone(P),planDigest:'FAKE-root-digest',tabId:17,state:'NEEDS_USER',lastPhase:'VARIANT',lastDocumentId:null,entryDocumentId:null,reason:null,pending:null,finalIntent:null,orderRefHash:null,initialDates:null,dateCursor:0,floors:{},rejected:[],refusals:0,lastRead:0,expiresAt:100000,bagAddStarted:false,resourceWritten:false,untouchedFailures:0,untouchedStreak:0,quotedCny:null,mode:'purchase',retiredCart:{kind:'resolved-pre-slot-bag',fromTaskId:'FAKE-old-pro',product:{...pro.product},quantity:1,totalCny:9999,readSequence:1,retiredAt:900}};
 const cart=[],acts=[],selected=[];let phase='EMPTY_BAG',seq=0,doc=0,bagReads=0;
 const read=()=>{const base={schema:'applebuy-merchant-read/v1',documentId:'FAKE-doc-'+doc,seq:++seq,phase,verifiedStep:!['AUTH','UNKNOWN'].includes(phase),path:phase==='EMPTY_BAG'||phase==='BAG'?'/shop/bag':'/shop/buy-iphone/iphone-duo'};
  if(phase==='EMPTY_BAG')return {...base,purchase:{itemVerified:false,verified:false,quantity:null,totalCny:null}};
  if(phase==='BAG'){const one=cart.length===1;return {...base,extras:false,purchase:{...(one?cart[0]:P.product),quantity:cart.length,itemVerified:one,verified:false,totalCny:one?(cart[0].model==='iPhone Duo'?15999:9999):31998}};}
  const choice=choices.find(c=>!selected.includes(c));return {...base,nextChoice:choice?{choice,state:'enabled'}:null,selectedProductChoices:[...selected],continueAvailable:true,variantVerified:phase==='VARIANT',quotedCny:15999,extrasConflict:false};};
 // Root adapter completion after the actual Claude R1 chose readBag. This reads the present cart at the boundary, not a cached
 // empty flag; original no-second-add assertions remain unchanged. No production fallback is added for legacy FAKE transports.
 const port={observe:async()=>read(),wait:async()=>{},readBag:async()=>{const one=cart.length===1;return {schema:'applebuy-merchant-read/v1',documentId:'FAKE-side-bag-'+(++bagReads),seq:++seq,path:'/shop/bag',phase:cart.length?'BAG':'EMPTY_BAG',verifiedStep:true,extras:false,purchase:one?{...cart[0],quantity:1,itemVerified:true,totalCny:cart[0].model==='iPhone Duo'?15999:9999}:null};},act:async c=>{acts.push(c.action);
  if(c.action==='openProduct'){phase='ENTRY';doc++;}
  else if(c.action==='configureProduct')selected.push(c.choice);
  else if(c.action==='continueProduct'){phase='VARIANT';doc++;if(foreign)cart.push({...foreign});}
  else if(c.action==='addBag'){cart.push({...P.product});phase='ACCESSORIES';doc++;}
  else if(c.action==='viewBag'){phase='BAG';doc++;}
  else if(c.action==='openBag'){phase='BAG';doc++;}
  else if(c.action==='checkout'){phase='AUTH';doc++;}
  return {delivered:true};}};
 const store={get:async k=>{assert.equal(k,TASK_KEY);return structuredClone(row);},put:async(k,v)=>{assert.equal(k,TASK_KEY);row=structuredClone(v);}};
 const result=await new PurchaseJob({store,port,now:()=>1000,id:()=>'FAKE-id-'+(++seq),maxSteps:40}).run(P,{tabId:17,planDigest:'FAKE-root-digest'});
 return {cart,acts,result};
}
test('C035 fresh-empty positive: normal preparation adds one and only one',async()=>{const r=await run(null);assert.equal(r.acts.filter(a=>a==='addBag').length,1);assert.equal(r.cart.length,1);assert.equal(r.acts.filter(a=>a==='checkout').length,1);});
test('C035 current same-plan item appearing before Add must prevent a second addition',async()=>{const r=await run(duo.product);assert.equal(r.acts.filter(a=>a==='addBag').length,0,'one Duo already exists before Add; post-Add two-line rejection is too late');assert.equal(r.cart.length,1);});
test('C035 current earlier-Pro item appearing before Add must prevent appending Duo',async()=>{const r=await run(pro.product);assert.equal(r.acts.filter(a=>a==='addBag').length,0,'one Pro already exists before Add; do not append Duo using the previous empty snapshot');assert.equal(r.cart.length,1);assert.equal(r.acts.filter(a=>a==='checkout').length,0);});
