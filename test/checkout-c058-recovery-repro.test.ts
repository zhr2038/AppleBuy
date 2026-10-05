// Codex independent C058 reproductions. Production classes; API/store/merchant facts are FAKE.
// No personal profile, Apple network, authentication, slot, order or payment.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ChromePort} from '../web/checkout-connector/chrome-port.js';
import {PurchaseJob,TASK_KEY,NO_EXTRAS} from '../web/checkout-connector/job.js';
import {probeClosedCheckout} from '../web/checkout-connector/closed-checkout-probe.js';
import {taskDiagnostic} from '../web/checkout-connector/task-diagnostic.js';
const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{...NO_EXTRAS}};
const pending={id:'FAKE-c058-old-choice',documentId:'FAKE-c058-original-slots',action:'chooseSlot',beforePhase:'SLOTS',deadline:99000,date:'october5',start:'21:15',end:'21:30'};
const purchase={...plan.product,quantity:1,totalCny:9999,itemVerified:true,verified:true,store:'Apple 大连恒隆广场',storeVerified:true,fulfillment:'pickup'};
const retired={schema:'applebuy-purchase-job/v1',state:'RETIRED',finalIntent:null,acceptedSlot:null,pending:null,history:[]};
const row=()=>({schema:'applebuy-purchase-job/v1',taskId:'FAKE-c058-task',plan:structuredClone(plan),planDigest:'FAKE-c058-digest',tabId:6,state:'NEEDS_VERIFICATION',lastRead:4,lastPhase:'UNKNOWN',lastDocumentId:'FAKE-c058-original-slots',expiresAt:90000,initialDates:['october5','october6'],dateCursor:0,floors:{october5:'21:15'},rejected:[],refusals:0,pending:structuredClone(pending),acceptedSlot:null,finalIntent:null,bagAddStarted:true,resourceWritten:true,untouchedFailures:0,untouchedStreak:0,quotedCny:9999,bagTotalCny:9999,history:[],retiredHistory:[structuredClone(retired)],closedCheckoutProbe:{schema:'applebuy-checkout-probe/v1',tabId:7,planDigest:'FAKE-c058-digest',state:'NEEDS_USER',pending:{action:'checkout'},originalSlotOutcome:'unknown'}});
function portFor({readonly=true,tabId=7,summary=null,mode=undefined}={}){
 const page={schema:'applebuy-merchant-read/v1',phase:'DETAILS',verifiedStep:true,path:'/shop/checkout',purchase:structuredClone(purchase),extras:false,dates:[],times:[],selectedDate:null,slotSummary:summary};
 const api={tabs:{async get(id){assert.equal(id,tabId);return {id,url:'https://secure11.www.apple.com.cn/shop/checkout'};}},permissions:{async contains(){return true;}},scripting:{async executeScript(){return [{frameId:0,documentId:'FAKE-c058-current-details',result:structuredClone(page)}];}}};
 return new ChromePort(api,tabId,{authorized:!readonly,mode:mode??(readonly?'observe':'purchase'),initialSequence:4,pending:structuredClone(pending)});
}
test('C058 read-only replacement page cannot manufacture acceptance from the old pending slot',async()=>{
 const o=await portFor().observe(plan);assert.equal(o.acceptedSlot,null,'no current slot summary corroborates the old unknown choice');
});
test('C058 read-only rebind with a different current slot keeps the original pending resource unknown',async()=>{
 let s=row();const store={async get(k){assert.equal(k,TASK_KEY);return structuredClone(s);},async put(k,v){assert.equal(k,TASK_KEY);s=structuredClone(v);}};
 const port=portFor({summary:{date:'october6',start:'21:15',end:'21:30',verified:true}});
 const result=await new PurchaseJob({store,port,now:()=>100000,maxSteps:3}).run(plan,{tabId:7,planDigest:s.planDigest,rebind:true});
 assert.equal(result.acceptedSlot,null,'a different checkout session is not the old action acknowledgement');assert.deepEqual(result.pending,pending);assert.equal(result.reconcileOnly,true);
});
test('C058 originating purchase-port progression remains a positive control',async()=>{
 const o=await portFor({readonly:false,tabId:6}).observe(plan);assert.equal(o.acceptedSlot?.verified,true);assert.equal(o.acceptedSlot?.date,'october5');
});
test('C058 actual control-page rebind configuration cannot acknowledge the old choice',async()=>{
 let s=row();const store={async get(){return structuredClone(s);},async put(k,v){assert.equal(k,TASK_KEY);s=structuredClone(v);}};
 // control.js supplies authorized:false but leaves ChromePort's mode at its purchase default.
 const port=portFor({mode:'purchase',summary:{date:'october6',start:'21:15',end:'21:30',verified:true}});
 const result=await new PurchaseJob({store,port,now:()=>100000,maxSteps:3}).run(plan,{tabId:7,planDigest:s.planDigest,rebind:true});
 assert.equal(result.acceptedSlot,null);assert.deepEqual(result.pending,pending);assert.equal(result.reconcileOnly,true);assert.equal(result.expiresAt,90000);
});
test('C058 disclosed trailing-slash checkout prevents a competing recovery checkout',async()=>{
 let s=row();delete s.closedCheckoutProbe;const calls=[];const store={async get(){return structuredClone(s);},async put(k,v){s=structuredClone(v);}};
 const api={tabs:{async query(){return [{id:7,url:'https://www.apple.com.cn/shop/bag'},{id:8,url:'https://secure8.www.apple.com.cn/shop/checkout/'}];}}};
 const port={async observe(){return {schema:'applebuy-merchant-read/v1',phase:'BAG',verifiedStep:true,path:'/shop/bag',documentId:'FAKE-c058-bag',seq:5,purchase:structuredClone(purchase),extras:false};},async act(c){calls.push(c.action);return {delivered:true};}};
 await probeClosedCheckout({store,api,port,plan,tabId:7,planDigest:s.planDigest,enabled:true,now:()=>100000,id:()=> 'FAKE-c058-probe'});assert.deepEqual(calls,[]);
});
test('C058 nested legacy final is never reported as positively absent',()=>{
 const s=row();s.retiredHistory=[{...retired,retiredHistory:[{...retired,finalIntent:{sent:true}}]}];assert.equal(taskDiagnostic(s,100000).priorSlotOrFinalPresent,true);
});
