// Entirely FAKE source and merchant data.
import assert from 'node:assert/strict';
import {fixture,FLAGS} from './c185-ended-world.mjs';
import {renewEndedDraft} from '../../src/desktop/ended-draft.mjs';
import {restartExpiredPayment} from '../../src/desktop/expired-payment-restart.mjs';
import {restartExpiredReview} from '../../src/desktop/expired-review-restart.mjs';
import {CONTACT_SLOT_BASIS} from '../../web/checkout-connector/job.js';
import {CHECKOUT_EXECUTOR_VERSION} from '../../web/checkout-connector/page-program.js';
const OPTIONS={approved:true,newContextConfirmed:true,oldExecutorStopped:true,sameAccountOrdersClear:true,expiredCheckoutUrl:'https://secure10.www.apple.com.cn/shop/checkout'};
export async function cancelledWorld(){
 const f=await fixture();await renewEndedDraft({...f,...FLAGS});const {w,api}=f;
 const stage=(action)=>Object.assign(w.row,{state:'NEEDS_VERIFICATION',expiresAt:0,bagAddStarted:true,resourceWritten:true,bagTotalCny:9999,pending:{id:'FAKE-pending',action,beforePhase:action==='fillDetails'?'DETAILS':'PAYMENT',...(action==='fillDetails'?{contactOnly:true}:{paymentOnly:true}),documentId:'FAKE-before',deadline:0},acceptedSlot:{date:'October 7',start:'21:15',end:'21:30',verified:true,basis:CONTACT_SLOT_BASIS},history:[{event:'slot-continued-to-contact-only-details',readSequence:1}]});
 stage('fillDetails');api.sessionId='FAKE-payment-recovery';const get=api.tabs.get,execute=api.scripting.executeScript;w.probes=0;w.expired=true;w.closed=0;
 api.executorVersion=async()=>CHECKOUT_EXECUTOR_VERSION;api.createExpiryProbe=async()=>{w.probes++;return {id:88};};
 api.tabs.get=async id=>id===88?{status:'complete',url:'https://www.apple.com.cn/shop/sorry/session_expired'}:get(id);
 api.tabs.remove=async id=>{assert.equal(id,88);w.closed++;};
 api.scripting.executeScript=async q=>q.target.tabId===88?[{frameId:0,documentId:'FAKE-expired',result:{schema:'applebuy-merchant-read/v1',phase:'UNKNOWN',path:'/shop/sorry/session_expired',verifiedStep:false,...(w.expired?{merchantError:'session-expired'}:{})}}]:execute(q);
 await restartExpiredPayment({...f,...OPTIONS});stage('continuePayment');api.sessionId='FAKE-post-review-context';w.probes=0;w.closed=0;await restartExpiredReview({...f,...OPTIONS});Object.assign(w.row,{state:'NEEDS_VERIFICATION',expiresAt:0,pending:{action:'submitOrder',id:'FAKE-final-pending',beforePhase:'REVIEW',documentId:'FAKE-review',deadline:0},finalIntent:{id:'FAKE-sent',sent:true},orderRefHash:null});api.sessionId='FAKE-distinct-new-purchase';api.auditCancelledOrder=async()=>({state:'cancelled',sameReference:true,productMatches:true,totalCny:9999});api.auditOrders=async()=>({state:'clear',authenticated:true,accountHash:'b'.repeat(64),matchingCount:2});w.commands=[];return f;
}
