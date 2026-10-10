// Entire merchant/account/authority/source chain is FAKE. No personal browser, orders or files.
import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {fixture,FLAGS} from './fixtures/c185-ended-world.mjs';
import {renewEndedDraft,unpackArchivedSource} from '../src/desktop/ended-draft.mjs';
import {restartExpiredPayment} from '../src/desktop/expired-payment-restart.mjs';
import {restartExpiredReview} from '../src/desktop/expired-review-restart.mjs';
import {CONTACT_SLOT_BASIS,canonicalJson,TASK_KEY} from '../web/checkout-connector/job.js';
import {PRO_PLAN,runDesktopSession,proDigest} from '../src/desktop/browser-session.mjs';
import {startAfterCancelledOrder,validateCancelledOrderPurchase} from '../src/desktop/cancelled-order-purchase.mjs';
import {DesktopCheckoutRuntime} from '../src/desktop/checkout-runtime.mjs';
import {CHECKOUT_EXECUTOR_VERSION} from '../web/checkout-connector/page-program.js';
import {auditCancelledOrder,orderDocument} from '../web/checkout-connector/order-audit.js';
import {CheckoutRpcPeer} from '../web/checkout-connector/checkout-rpc-peer.js';
import {NativeCheckoutApi} from '../src/desktop/native-checkout-api.mjs';
import {guardOwnedApi} from '../src/desktop/owner-lease.mjs';
import {DesktopTaskStore} from '../src/desktop/task-store.mjs';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve,sep} from 'node:path';
import {rowPatch} from '../web/checkout-connector/r2-protocol.js';
const OPTIONS={approved:true,newContextConfirmed:true,oldExecutorStopped:true,sameAccountOrdersClear:true,expiredCheckoutUrl:'https://secure10.www.apple.com.cn/shop/checkout'};
const REF=createHash('sha256').update('W1234567890').digest('hex'),NEW={approved:true,originalOrderAssociated:true,expectedRefHash:REF};
async function world(){
 const f=await fixture();await renewEndedDraft({...f,...FLAGS});const {w,api}=f;
 const stage=(action)=>Object.assign(w.row,{state:'NEEDS_VERIFICATION',expiresAt:0,bagAddStarted:true,resourceWritten:true,bagTotalCny:9999,pending:{id:'FAKE-pending',action,beforePhase:action==='fillDetails'?'DETAILS':'PAYMENT',...(action==='fillDetails'?{contactOnly:true}:{paymentOnly:true}),documentId:'FAKE-before',deadline:0},acceptedSlot:{date:'October 7',start:'21:15',end:'21:30',verified:true,basis:CONTACT_SLOT_BASIS},history:[{event:'slot-continued-to-contact-only-details',readSequence:1}]});
 stage('fillDetails');api.sessionId='FAKE-payment-recovery';const get=api.tabs.get,execute=api.scripting.executeScript;w.probes=0;w.expired=true;w.closed=0;
 api.executorVersion=async()=>CHECKOUT_EXECUTOR_VERSION;api.createExpiryProbe=async()=>{w.probes++;return {id:88};};
 api.tabs.get=async id=>id===88?{status:'complete',url:'https://www.apple.com.cn/shop/sorry/session_expired'}:get(id);
 api.tabs.remove=async id=>{assert.equal(id,88);w.closed++;};
 api.scripting.executeScript=async q=>q.target.tabId===88?[{frameId:0,documentId:'FAKE-expired',result:{schema:'applebuy-merchant-read/v1',phase:'UNKNOWN',path:'/shop/sorry/session_expired',verifiedStep:false,...(w.expired?{merchantError:'session-expired'}:{})}}]:execute(q);
 await restartExpiredPayment({...f,...OPTIONS});stage('continuePayment');api.sessionId='FAKE-post-review-context';w.probes=0;w.closed=0;await restartExpiredReview({...f,...OPTIONS});Object.assign(w.row,{state:'NEEDS_VERIFICATION',expiresAt:0,pending:{action:'submitOrder',id:'FAKE-final-pending',beforePhase:'REVIEW',documentId:'FAKE-review',deadline:0},finalIntent:{id:'FAKE-sent',sent:true},orderRefHash:null});api.sessionId='FAKE-distinct-new-purchase';api.auditCancelledOrder=async()=>({state:'cancelled',sameReference:true,productMatches:true,totalCny:9999});api.auditOrders=async()=>({state:'clear',authenticated:true,accountHash:'b'.repeat(64),matchingCount:2});w.commands=[];return f;
}

test('C248 explicit cancelled resolution archives sent final verbatim and starts a distinct authorised date cohort',async()=>{
 const f=await world(),old=structuredClone(f.w.row),before=canonicalJson(old);const r=await startAfterCancelledOrder({...f,...NEW});
 assert.equal(r.created,true);assert.notEqual(f.w.row.taskId,old.taskId);assert.equal(f.w.row.finalIntent,null);assert.equal(f.w.row.pending,null);assert.equal(f.w.row.orderRefHash,null);
 assert.equal(f.w.row.initialDates,null);assert.deepEqual(f.w.row.floors,{});const t=f.w.row.desktopCancelledOrderPurchase;
 assert.equal(canonicalJson(await f.store.readArchive(t.sourceArchive)),before);assert.equal(canonicalJson(unpackArchivedSource(t.sourceBackup,t.sourceArchive)),before);
 assert.ok(await validateCancelledOrderPurchase(f.w.row,f.api,f.store));assert.deepEqual(f.w.commands,[]);
 await assert.rejects(startAfterCancelledOrder({...f,...NEW}),/PriorTaskUnconfirmed/);
});
for(const [name,change,options] of [
 ['no new approval',()=>{},{approved:false}],['no association',()=>{},{originalOrderAssociated:false}],['bad reference',()=>{},{expectedRefHash:'bad'}],
 ['unknown old result',f=>f.api.auditCancelledOrder=async()=>({state:'unknown'}),{}],
 ['unpaid old result',f=>f.api.auditCancelledOrder=async()=>({state:'unpaid',sameReference:true,productMatches:true,totalCny:9999}),{}],
 ['wrong reference',f=>f.w.row.orderRefHash='f'.repeat(64),{}],
 ['wrong product',f=>f.api.auditCancelledOrder=async()=>({state:'cancelled',sameReference:true,productMatches:false,totalCny:9999}),{}],
 ['wrong price',f=>f.api.auditCancelledOrder=async()=>({state:'cancelled',sameReference:true,productMatches:true,totalCny:10000}),{}],
 ['unknown account',f=>f.api.auditOrders=async()=>({state:'unknown'}),{}],
 ['existing unpaid',f=>f.api.auditOrders=async()=>({state:'unpaid-exists'}),{}],
 ['two bag items',f=>f.w.quantity=2,{}],['over cap bag',f=>f.w.total=10000,{}],
 ['old window active',f=>f.w.row.expiresAt=Date.now()+100000,{}],['paused',()=>{},{live:()=>false}],
 ['old peer',f=>f.api.executorVersion=async()=> 'old',{}],['missing host',f=>f.w.host=false,{}]
])test('C248 '+name+' refuses without a new record, archive or merchant mutation',async()=>{
 const f=await world();change(f);const before=canonicalJson(f.w.row),count=f.w.archives.size;
 await assert.rejects(startAfterCancelledOrder({...f,...NEW,...options}));assert.equal(canonicalJson(f.w.row),before);assert.equal(f.w.archives.size,count);assert.deepEqual(f.w.commands,[]);
});
test('C248 pause after archive preserves the current old row and never creates a new task',async()=>{const f=await world();const before=canonicalJson(f.w.row),archive=f.store.archiveSnapshot;let live=true;f.store.archiveSnapshot=async row=>{const h=await archive(row);live=false;return h;};await assert.rejects(startAfterCancelledOrder({...f,...NEW,live:()=>live}));assert.equal(canonicalJson(f.w.row),before);});
test('C248 source change while auditing cannot be overwritten',async()=>{const f=await world(),audit=f.api.auditOrders;f.api.auditOrders=async()=>{f.w.row.reason='FAKE-external-change';return audit();};const count=f.w.archives.size;await assert.rejects(startAfterCancelledOrder({...f,...NEW}),/SourceChanged/);assert.equal(f.w.row.reason,'FAKE-external-change');assert.equal(f.w.archives.size,count);});
test('C248 tampered backup/archive or context denies the new purchase proof',async()=>{const f=await world();await startAfterCancelledOrder({...f,...NEW});const row=structuredClone(f.w.row);for(const edit of [r=>r.desktopCancelledOrderPurchase.sourceBackup.data='AAAA',r=>r.desktopCancelledOrderPurchase.originalOrderAssociated=false,r=>r.desktopContext='FAKE-foreign',r=>r.retainedSourceArchives=[]]){const r=structuredClone(row);edit(r);assert.equal(await validateCancelledOrderPurchase(r,f.api,f.store),null);}});
test('C248 actual production Runtime reaches REVIEW then one FAKE final without Add or resubmission',async()=>{
 const f=await world(),old=canonicalJson(f.w.row),runtime=new DesktopCheckoutRuntime({store:f.store,launch:async()=>({api:f.api,close:async()=>{}}),ordersEnabled:true});
 // The FAKE fixture's expiry-probe remove assertion is not a browser lifecycle adapter.
 f.api.tabs.remove=async()=>{};
 await runtime.open();const r=await runtime.newPurchase(NEW);assert.equal(r.phase,'REVIEW');assert.ok(runtime.finalDescriptor);assert.equal(f.w.commands.filter(x=>x==='checkout').length,1);assert.equal(f.w.commands.filter(x=>x==='addBag'||x==='submitOrder').length,0);
 assert.equal(canonicalJson(await f.store.readArchive(f.w.row.desktopCancelledOrderPurchase.sourceArchive)),old);
 await runtime.submit({termsAccepted:true,existingOrdersChecked:true,noExtras:true});assert.equal(f.w.commands.filter(x=>x==='submitOrder').length,1);assert.equal(f.w.row.finalIntent.sent,true);
 await assert.rejects(runtime.submit({termsAccepted:true,existingOrdersChecked:true,noExtras:true}));assert.equal(f.w.commands.filter(x=>x==='submitOrder').length,1);await runtime.close();
});
test('C248 real physical archive and kernel owner preserve the complete original sent-final record',async()=>{
 const f=await world(),dir=await mkdtemp(join(tmpdir(),'applebuy-c248-')),store=new DesktopTaskStore(join(dir,'task.json'));let lease;
 try{lease=await store.acquireOwner();for(const row of f.w.archives.values())await store.archiveSnapshot(row);await store.put(TASK_KEY,f.w.row);const old=canonicalJson(f.w.row);
  await assert.rejects(new DesktopTaskStore(join(dir,'task.json')).acquireOwner(),/DesktopOwnerHeldOrUnconfirmed/);
  await startAfterCancelledOrder({...f,store,...NEW});const r=await store.get(TASK_KEY);assert.ok(await validateCancelledOrderPurchase(r,f.api,store));assert.equal(canonicalJson(await store.readArchive(r.desktopCancelledOrderPurchase.sourceArchive)),old);
 }finally{await lease?.release();assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep));await rm(dir,{recursive:true,force:true});}
});
test('C248 R2 cannot edit or remove new-purchase authority or archived source metadata',async()=>{const f=await world();await startAfterCancelledOrder({...f,...NEW});const r=structuredClone(f.w.row);delete r.desktopCancelledOrderPurchase;assert.throws(()=>rowPatch(f.w.row,r),/HistoricalIdentityChanged/);});
test('C248 explicit new purchase accepts only positively verified empty bag',async()=>{const f=await world(),execute=f.api.scripting.executeScript;f.w.phase='EMPTY_BAG';f.api.scripting.executeScript=async q=>{const rows=await execute(q);if(!q.args[1])rows[0].result.purchase=null;return rows;};const r=await startAfterCancelledOrder({...f,...NEW});assert.equal(r.startPhase,'EMPTY_BAG');assert.equal(f.w.row.bagAddStarted,false);assert.deepEqual(f.w.commands,[]);});
function detailApi(){
 const url='https://secure10.www.apple.com.cn/shop/order/detail/FAKE/W1234567890';let mutations=0;
 const result={state:'detail',referenceHash:REF,status:'cancelled',productTitle:'iPhone 18 Pro 256GB 黑色',totalCny:9999,itemRows:1,quantity:null,slot:null};
 const api={tabs:{query:async()=>[{id:22,url}],get:async()=>({id:22,url,status:'complete'}),update:async()=>{mutations++;throw Error('forbidden');},remove:async()=>{mutations++;throw Error('forbidden');}},permissions:{contains:async()=>true},scripting:{executeScript:async q=>{assert.equal(q.func,orderDocument);assert.deepEqual(q.args,['detail']);return[{frameId:0,documentId:'FAKE-native-detail',result}];}}};
 return {api,result,mutations:()=>mutations};
}
test('C248 real named API/Peer checks exact existing cancelled detail without taking ownership or navigation',async()=>{const f=detailApi(),contextId='FAKE-C248-native-context',peer=new CheckoutRpcPeer({api:f.api,contextId});const api=new NativeCheckoutApi({contextId,exchange:q=>peer.receive(q)});assert.deepEqual(await api.auditCancelledOrder(PRO_PLAN,REF),{state:'cancelled',sameReference:true,productMatches:true,totalCny:9999});assert.equal(peer.tabs.size,0);assert.equal(f.mutations(),0);peer.dispose();});
for(const [name,edit]of [['other reference',f=>f.result.referenceHash='f'.repeat(64)],['unpaid',f=>f.result.status='unpaid'],['unknown',f=>f.result.status='unknown'],['wrong item',f=>f.result.productTitle='iPhone 18 Pro Max'],['wrong price',f=>f.result.totalCny=15999],['two items',f=>f.result.itemRows=2],['missing permission',f=>f.api.permissions.contains=async()=>false],['duplicate matching tabs',f=>{const q=f.api.tabs.query;f.api.tabs.query=async()=>[...(await q()),...(await q())];}],['auth page',f=>f.api.tabs.get=async()=>({status:'complete',url:'https://secure10.www.apple.com.cn/shop/signIn'})]])test('C248 cancelled reader refuses '+name,async()=>{const f=detailApi();edit(f);assert.deepEqual(await auditCancelledOrder(f.api,PRO_PLAN,REF),{state:'unknown'});assert.equal(f.mutations(),0);});
test('C248 ownership guard covers cancellation read',async()=>{let calls=0;const api=guardOwnedApi({auditCancelledOrder:async()=>calls++},{owned:false});await assert.rejects(api.auditCancelledOrder(PRO_PLAN,REF),/OwnerLeaseLost/);assert.equal(calls,0);});
