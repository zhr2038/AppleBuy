// Real runtime/controller in contained FAKE checkout worlds; no real browser/account or transaction.
import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,FLAGS} from './fixtures/c185-ended-world.mjs';
import {DesktopCheckoutRuntime} from '../src/desktop/checkout-runtime.mjs';
import {PRO_PLAN,proDigest} from '../src/desktop/browser-session.mjs';
import {PurchaseJob,createPurchaseRecord,TASK_KEY} from '../web/checkout-connector/job.js';
import {CheckoutRpcPeer} from '../web/checkout-connector/checkout-rpc-peer.js';
import {NativeCheckoutApi} from '../src/desktop/native-checkout-api.mjs';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
const CURRENT='https://www.apple.com.cn/shop/browse/open/salespolicies',OLD='https://www.apple.com.cn/shop/open/salespolicies';
async function runtimeWorld({primary=CURRENT,terms=[CURRENT],missingStore=false,omitPrimary=false}={}){
 const f=await fixture(),execute=f.api.scripting.executeScript;
 f.api.scripting.executeScript=async q=>{const rows=await execute(q);if(!q.args[1]&&rows[0].result.phase==='REVIEW'){const o=rows[0].result;o.termsLinks=terms;if(!omitPrimary)o.primaryTermsUrl=primary;if(missingStore){o.purchase.verified=false;o.purchase.store=null;o.slotSummary=null;}}return rows;};
 const runtime=new DesktopCheckoutRuntime({store:f.store,launch:async()=>({api:f.api,close:async()=>{}})});await runtime.open();return {...f,runtime};
}
test('C205 current native browse terms drives the fresh descriptor and consent URL through one FAKE final',async()=>{
 const f=await runtimeWorld();try{await f.runtime.renewDraft(FLAGS);assert.equal(f.runtime.finalDescriptor?.termsUrl,CURRENT);const result=await f.runtime.submit({termsAccepted:true,existingOrdersChecked:true,noExtras:true});assert.equal(result.realOrderVerified,true);assert.equal(f.w.commands.filter(a=>a==='submitOrder').length,1);assert.equal(f.w.commands.includes('addBag'),false);}finally{await f.runtime.close();}
});
test('C205 primary native agreement is kept even when the footer lists the old alias',async()=>{
 const f=await runtimeWorld({terms:[OLD,CURRENT]});try{await f.runtime.renewDraft(FLAGS);assert.equal(f.runtime.finalDescriptor?.termsUrl,CURRENT);}finally{await f.runtime.close();}
});
for(const [label,primary]of [['absent primary',null],['foreign primary','https://example.invalid/terms'],['primary not in observed list',OLD]])test('C205 '+label+' cannot prepare or submit a final',async()=>{
 const f=await runtimeWorld({primary});try{await f.runtime.renewDraft(FLAGS);assert.equal(f.runtime.finalDescriptor,null);await assert.rejects(f.runtime.submit({termsAccepted:true,existingOrdersChecked:true,noExtras:true}),/FinalConsentNotCurrent/);assert.equal(f.w.commands.includes('submitOrder'),false);}finally{await f.runtime.close();}
});
test('C205 current URL never supplies a missing store or slot',async()=>{const f=await runtimeWorld({missingStore:true});try{await f.runtime.renewDraft(FLAGS);assert.equal(f.runtime.finalDescriptor,null);assert.equal(f.w.commands.includes('submitOrder'),false);}finally{await f.runtime.close();}});
test('C207 truly absent native primary field does not widen the legacy contract to the new alias',async()=>{const f=await runtimeWorld({omitPrimary:true});try{await f.runtime.renewDraft(FLAGS);assert.equal(f.runtime.finalDescriptor,null);assert.equal(f.w.commands.includes('submitOrder'),false);}finally{await f.runtime.close();}});
test('C207 legacy complete review retains its old agreement contract',async()=>{const f=await runtimeWorld({omitPrimary:true,terms:[OLD]});try{await f.runtime.renewDraft(FLAGS);assert.equal(f.runtime.finalDescriptor?.termsUrl,OLD);}finally{await f.runtime.close();}});
test('C207 a conflicting recorded Add quote cannot prepare consent even when the bag total matches',async()=>{const f=await runtimeWorld();try{await f.runtime.renewDraft(FLAGS);f.w.row.quotedCny=9998;await assert.rejects(f.runtime.prepareReview(),/FinalConsentNotCurrent/);assert.equal(f.w.commands.includes('submitOrder'),false);}finally{await f.runtime.close();}});
test('C205 changed total still under cap is blocked against the explicit reused bag basis before final write/send',async()=>{
 const now=Date.now(),slot={date:'FAKE-day',start:'21:15',end:'21:30',verified:true};let row={...createPurchaseRecord(PRO_PLAN,{taskId:'FAKE-c205',planDigest:proDigest,tabId:7,now,id:()=>crypto.randomUUID()}),state:'NEEDS_USER',lastPhase:'REVIEW',lastDocumentId:'FAKE-review',bagAddStarted:true,resourceWritten:true,bagTotalCny:9999,quotedCny:null,initialDates:['FAKE-day'],floors:{'FAKE-day':'21:15'},acceptedSlot:slot};const sent=[];
 const store={get:async()=>structuredClone(row),put:async(k,v)=>{assert.equal(k,TASK_KEY);row=structuredClone(v);}},o={schema:'applebuy-merchant-read/v1',documentId:'FAKE-review',seq:1,phase:'REVIEW',verifiedStep:true,purchase:{...PRO_PLAN.product,quantity:1,totalCny:9998,store:PRO_PLAN.stores[0],fulfillment:'pickup',itemVerified:true,verified:true},paymentMethod:'支付宝',extras:false,existingOrdersChecked:true,slotSummary:slot,termsLinks:[CURRENT]},port={observe:async()=>structuredClone(o),act:async c=>{sent.push(c.action);return {delivered:true};}};
 const grant={id:'FAKE-grant',taskId:row.taskId,planDigest:proDigest,documentId:'FAKE-review',termsAccepted:true,existingOrdersChecked:true,noExtras:true,termsUrl:CURRENT,expiry:now+30000,start:false};
 await new PurchaseJob({store,port,now:()=>now,maxWaitMs:0}).run(PRO_PLAN,{tabId:7,planDigest:proDigest,grant});assert.equal(row.state,'BLOCKED');assert.equal(row.finalIntent,null);assert.deepEqual(sent,[]);
});
for(const privateField of [false,true])test('C205 named native API '+(privateField?'still refuses customer fields':'carries the primary public agreement field')+' through the actual peer',async()=>{
 const contextId='FAKE-c205-native-context';const page={schema:'applebuy-merchant-read/v1',phase:'REVIEW',verifiedStep:true,path:'/shop/checkout',primaryTermsUrl:CURRENT,termsLinks:[CURRENT],...(privateField?{email:'FAKE@example.invalid'}:{})};
 const peer=new CheckoutRpcPeer({contextId,api:{permissions:{contains:async()=>true},tabs:{create:async()=>({id:7,status:'complete'}),get:async()=>({id:7,status:'complete',url:'https://secure10.www.apple.com.cn/shop/checkout'})},scripting:{executeScript:async()=>[{frameId:0,documentId:'FAKE-current-review',result:page}]}}});
 const api=new NativeCheckoutApi({contextId,exchange:q=>peer.receive(q)});const t=await api.create('https://www.apple.com.cn/shop/bag');
 const observe=()=>api.scripting.executeScript({target:{tabId:t.id,frameIds:[0]},world:'ISOLATED',func:merchantDocument,args:[PRO_PLAN]});
 if(privateField)await assert.rejects(observe(),/ResultUnconfirmed/);else assert.equal((await observe())[0].result.primaryTermsUrl,CURRENT);
});
