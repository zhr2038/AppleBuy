// Controlled merchant contracts only. No Apple/session/customer data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {PurchaseJob,TASK_KEY,createPurchaseRecord,canonicalJson,validStored} from '../web/checkout-connector/job.js';
import {PRO_PLAN,proDigest} from '../src/desktop/browser-session.mjs';
const dates=['October 10','October 11','October 12'];
const item={...PRO_PLAN.product,quantity:1,totalCny:9999,store:PRO_PLAN.stores[0],fulfillment:'pickup',verified:true,itemVerified:true};
const slot={date:dates[0],start:'21:15',end:'21:30',verified:true};
function fixture(){
 let now=100000,seq=0,n=0;
 const final={id:'FAKE-final',sent:true,grantId:'FAKE-consent'};
 const pending={id:'FAKE-command',action:'submitOrder',intentId:final.id,beforePhase:'REVIEW',documentId:'FAKE-document',deadline:now+8000,reviewOnly:true,finalGrant:{reviewProgressId:'FAKE-trace'}};
 const feedback={kind:'pickup-final-refused',verified:true,taskId:'FAKE-task',planDigest:proDigest,commandId:pending.id,intentId:final.id,traceId:'FAKE-trace',date:slot.date,start:slot.start,end:slot.end,store:item.store,totalCny:9999};
 const row={...createPurchaseRecord(PRO_PLAN,{taskId:'FAKE-task',planDigest:proDigest,tabId:7,now,id:()=>String(++n)}),acceptedSlot:slot,initialDates:dates,floors:{[dates[0]]:'21:15'},bagTotalCny:9999,bagAddStarted:true,resourceWritten:true,finalIntent:final,pending};
 const w={row,actions:[],feedback,phase:'SLOTS',date:dates[0],oldFinal:structuredClone(final),oldPending:structuredClone(pending)};
 const store={get:async()=>structuredClone(w.row),put:async(k,r)=>{assert.equal(k,TASK_KEY);w.row=structuredClone(r);}};
 const port={controlledReview:true,detachStoredChoice(){},observe:async()=>({schema:'applebuy-merchant-read/v1',path:'/shop/checkout',documentId:'FAKE-document',seq:++seq,generation:2,phase:w.phase,verifiedStep:true,purchase:item,extras:false,listComplete:true,dates:dates.map((label,i)=>({label,ref:'date:'+i,enabled:true})),selectedDate:w.date,times:[{ref:'time:0',start:'21:15',end:'21:30',enabled:true}],feedback:w.feedback,acceptedSlot:w.phase==='DETAILS'?{...slot,date:w.date}:null,slotSummary:w.phase==='REVIEW'?{...slot,date:w.date}:null,paymentMethod:'支付宝',existingOrdersChecked:true,termsLinks:['https://www.apple.com.cn/shop/open/salespolicies']}),act:async c=>{w.actions.push(c);if(c.action==='selectDate')w.date=c.date;else if(c.action==='chooseSlot'){w.phase='DETAILS';w.feedback=null;}else if(c.action==='fillDetails')w.phase='PAYMENT';else if(c.action==='continuePayment')w.phase='REVIEW';return{delivered:true};},lookupOrder:async()=>({state:'unknown',independent:false}),wait:async ms=>{now+=ms;}};
 const job=new PurchaseJob({store,port,now:()=>now,id:()=>`FAKE-${++n}`});
 return Object.assign(w,{job,port,run:options=>job.run(PRO_PLAN,{tabId:7,planDigest:proDigest,taskId:row.taskId,...options})});
}
test('C253 explicit same-command final refusal archives the sent intent and reselects the next original day, stopping for new terms',async()=>{
 const w=fixture(),r=await w.run();assert.equal(r.lastPhase,'REVIEW');assert.equal(r.pending,null);assert.equal(r.finalIntent,null);
 assert.equal(r.finalRejections.length,1);assert.deepEqual(r.finalRejections[0].finalIntent,w.oldFinal);assert.deepEqual(r.finalRejections[0].pending,w.oldPending);
 assert.equal(r.dateCursor,1);assert.deepEqual(r.initialDates,dates);assert.equal(r.floors[dates[0]],'21:15');assert.equal(r.refusals,1);
 assert.deepEqual(w.actions.map(x=>x.action),['selectDate','chooseSlot','fillDetails','continuePayment']);assert.equal(w.actions[1].date,dates[1]);assert.equal(w.actions[1].retryRejectedFinal,'FAKE-final');assert.equal(validStored(r),true);
});
for(const [label,mutate]of [
 ['unverified',w=>w.feedback.verified=false],['other command',w=>w.feedback.commandId='OTHER'],['other intent',w=>w.feedback.intentId='OTHER'],['other trace',w=>w.feedback.traceId='OTHER'],['other task',w=>w.feedback.taskId='OTHER'],['wrong date',w=>w.feedback.date=dates[1]],['wrong amount',w=>w.feedback.totalCny=10000],['foreign context',w=>w.port.controlledReview=false],['expired task',w=>w.row.expiresAt=0],['reference already found',w=>w.row.orderRefHash='a'.repeat(64)],['generic error',w=>w.feedback={kind:'unknown',verified:true}],['readonly',w=>w.row.reconcileOnly=true]
])test('C253 '+label+' retains unknown final without another action',async()=>{const w=fixture();mutate(w);const final=canonicalJson(w.row.finalIntent),pending=canonicalJson(w.row.pending);await w.run();assert.equal(canonicalJson(w.row.finalIntent),final);assert.equal(canonicalJson(w.row.pending),pending);assert.deepEqual(w.actions,[]);});
test('C253 a consumed last offered date never rolls to a fourth date',async()=>{const w=fixture();w.row.initialDates=[dates[0]];const r=await w.run();assert.equal(r.state,'EXHAUSTED');assert.deepEqual(w.actions,[]);assert.equal(r.finalRejections.length,1);});
test('C253 durable rejection write failure sends no new slot and preserves prior final',async()=>{const w=fixture();const put=w.job.store.put;w.job.store.put=async(k,r)=>{if(r.finalRejections)throw Error('FAKE-write-failed');return put(k,r);};await assert.rejects(w.run(),/write-failed/);assert.deepEqual(w.actions,[]);assert.equal(w.row.finalIntent.sent,true);});
