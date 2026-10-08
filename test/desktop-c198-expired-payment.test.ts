// Full retained source and programme controller; every merchant/profile/API/result is FAKE.
import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,FLAGS} from './fixtures/c185-ended-world.mjs';
import {renewEndedDraft} from '../src/desktop/ended-draft.mjs';
import {expiredPaymentSourceShape,restartExpiredPayment,validateExpiredPaymentRestart} from '../src/desktop/expired-payment-restart.mjs';
import {DesktopCheckoutRuntime} from '../src/desktop/checkout-runtime.mjs';
import {TASK_KEY,CONTACT_SLOT_BASIS,canonicalJson} from '../web/checkout-connector/job.js';
import {CHECKOUT_EXECUTOR_VERSION} from '../web/checkout-connector/page-program.js';
import {DesktopTaskStore} from '../src/desktop/task-store.mjs';
import {mkdtemp,rm,unlink,lstat,realpath} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve,sep} from 'node:path';
const URL='https://secure7.www.apple.com.cn/shop/checkout',OPTIONS={approved:true,newContextConfirmed:true,oldExecutorStopped:true,sameAccountOrdersClear:true,expiredCheckoutUrl:URL};
async function world(){
 const f=await fixture();await renewEndedDraft({...f,...FLAGS});const {w,api}=f;
 Object.assign(w.row,{state:'NEEDS_VERIFICATION',expiresAt:0,bagAddStarted:true,resourceWritten:true,bagTotalCny:9999,pending:{id:'FAKE-contact-current',action:'fillDetails',contactOnly:true,beforePhase:'DETAILS',documentId:'FAKE-before',deadline:0},acceptedSlot:{date:'October 7',start:'21:15',end:'21:30',verified:true,basis:CONTACT_SLOT_BASIS},history:[{event:'slot-continued-to-contact-only-details',readSequence:1}]});
 const old=structuredClone(w.row);api.sessionId='FAKE-fresh-payment-recovery';const get=api.tabs.get,execute=api.scripting.executeScript;w.probeExpiry=true;w.probes=0;w.closedProbes=0;
 api.executorVersion=async()=>CHECKOUT_EXECUTOR_VERSION;
 api.createExpiryProbe=async url=>{assert.equal(url,URL);w.probes++;return {id:88};};
 api.tabs.get=async id=>id===88?{id,status:'complete',url:'https://www.apple.com.cn/shop/sorry/session_expired'}:get(id);
 api.tabs.remove=async id=>{assert.equal(id,88);w.closedProbes++;};
 api.scripting.executeScript=async q=>q.target.tabId===88?[{frameId:0,documentId:'FAKE-expiry-document',result:{schema:'applebuy-merchant-read/v1',phase:'UNKNOWN',path:'/shop/sorry/session_expired',verifiedStep:false,...(w.probeExpiry?{merchantError:'session-expired'}:{})}}]:execute(q);
 return {...f,old};
}
test('C198 eligible stopped source starts one distinct cart-only task after actual expiry probe, preserves full source/cohort and never inherits slot acceptance',async()=>{
 const f=await world(),before=canonicalJson(f.old);assert.equal(expiredPaymentSourceShape(f.old),true);const r=await restartExpiredPayment({...f,...OPTIONS});assert.equal(r.created,true);assert.notEqual(f.w.row.taskId,f.old.taskId);assert.notEqual(f.w.row.desktopContext,f.old.desktopContext);assert.equal(f.w.row.acceptedSlot,null);assert.equal(f.w.row.finalIntent,null);assert.equal(f.w.row.pending,null);assert.equal(canonicalJson(await f.store.readArchive(f.w.row.desktopPaymentRestart.sourceArchive)),before);assert.deepEqual(f.w.row.initialDates,f.old.initialDates);assert.deepEqual(f.w.row.floors,f.old.floors);assert.equal(f.w.row.dateCursor,f.old.dateCursor);assert.equal(f.w.probes,1);assert.equal(f.w.closedProbes,1);assert.deepEqual(f.w.commands,[]);assert.ok(await validateExpiredPaymentRestart(f.w.row,f.api,f.store));
 await assert.rejects(restartExpiredPayment({...f,...OPTIONS}),/SourceUnconfirmed/);assert.equal(f.w.probes,1);
});
for(const [label,edit]of [['existing final',r=>r.finalIntent={id:'FAKE-final',sent:false}],['hidden earlier final',r=>r.history.push({event:'final-unknown'})],['unexpired local window',r=>r.expiresAt=Date.now()+100000],['wrong slot floor',r=>r.floors['October 7']='21:30'],['missing prior contact transition',r=>r.history=[]],['unknown slot instead of contact',r=>r.pending.action='chooseSlot'],['not-dispatched contact',r=>r.pending.dispatched=false],['confirmed state',r=>r.state='CONFIRMED_UNPAID']])test('C198 '+label+' rejects before probe/archive/new intent',async()=>{
 const f=await world();edit(f.w.row);const before=canonicalJson(f.w.row),writes=f.w.writes,archives=f.w.archives.size;await assert.rejects(restartExpiredPayment({...f,...OPTIONS}),/SourceUnconfirmed/);assert.equal(canonicalJson(f.w.row),before);assert.equal(f.w.writes,writes);assert.equal(f.w.archives.size,archives);assert.equal(f.w.probes,0);assert.deepEqual(f.w.commands,[]);
});
for(const flag of ['approved','newContextConfirmed','oldExecutorStopped','sameAccountOrdersClear'])test('C198 missing '+flag+' never creates an intent',async()=>{const f=await world(),before=canonicalJson(f.w.row);await assert.rejects(restartExpiredPayment({...f,...OPTIONS,[flag]:false}),/ApprovalRequired/);assert.equal(canonicalJson(f.w.row),before);assert.equal(f.w.probes,0);});
test('C198 failed/absent merchant expiry is not a refusal or retry permission',async()=>{const f=await world();f.w.probeExpiry=false;const before=canonicalJson(f.w.row);await assert.rejects(restartExpiredPayment({...f,...OPTIONS}),/MerchantExpiryUnconfirmed/);assert.equal(canonicalJson(f.w.row),before);assert.equal(f.w.closedProbes,1);});
test('C198 old or unavailable loaded executor is refused before probe/archive/intent',async()=>{const f=await world();f.api.executorVersion=async()=> 'FAKE-old';const before=canonicalJson(f.w.row);await assert.rejects(restartExpiredPayment({...f,...OPTIONS}),/ExecutorUpdateRequired/);assert.equal(f.w.probes,0);assert.equal(canonicalJson(f.w.row),before);});
for(const [label,change]of [['wrong quantity',w=>w.quantity=2],['overcap total',w=>w.total=10000],['lost scope',w=>w.host=false]])test('C198 '+label+' rejects without changing source',async()=>{const f=await world();change(f.w);const before=canonicalJson(f.w.row);await assert.rejects(restartExpiredPayment({...f,...OPTIONS}));assert.equal(canonicalJson(f.w.row),before);assert.deepEqual(f.w.commands,[]);});
test('C198 changed source or lost owner between archive and write preserves the actual old source',async()=>{const f=await world(),archive=f.store.archiveSnapshot;let live=true;f.store.archiveSnapshot=async row=>{const h=await archive(row);live=false;return h;};const before=canonicalJson(f.w.row);await assert.rejects(restartExpiredPayment({...f,...OPTIONS,live:()=>live}),/ArchiveUnconfirmed/);assert.equal(canonicalJson(f.w.row),before);assert.deepEqual(f.w.commands,[]);});
test('C198 production runtime reaches current verified FAKE REVIEW, exposes no pending, then one fresh consent yields one unpaid result with zero Add/one Checkout',async()=>{
 const f=await world();f.w.row.reconcileOnly=true;const runtime=new DesktopCheckoutRuntime({store:f.store,launch:async()=>({api:f.api,close:async()=>{}})});await runtime.open();const r=await runtime.restartPayment(OPTIONS);assert.equal(r.phase,'REVIEW');assert.equal(r.pendingAction,null);assert.equal(r.localTransitionCreated,true);assert.ok(runtime.finalDescriptor);assert.equal(f.w.commands.filter(a=>a==='checkout').length,1);assert.equal(f.w.commands.includes('addBag'),false);assert.equal(f.w.commands.includes('submitOrder'),false);
 const done=await runtime.submit({termsAccepted:true,existingOrdersChecked:true,noExtras:true});assert.equal(done.realOrderVerified,true);assert.equal(f.w.commands.filter(a=>a==='submitOrder').length,1);await runtime.close();
});
test('C198 combined desktop runtime carries payment-only pending review truthfully and never prepares final consent on an unverified review',async()=>{
 const f=await world(),execute=f.api.scripting.executeScript,states=[];f.w.row.reconcileOnly=true;
 f.api.scripting.executeScript=async q=>{const rows=await execute(q);if(q.args.length===1&&q.target.tabId!==88&&['DETAILS','PAYMENT','REVIEW'].includes(rows[0].result.phase)){
  const o=rows[0].result;o.purchase={model:null,capacity:null,color:null,quantity:null,store:null,fulfillment:null,totalCny:9999,itemVerified:false,verified:false};o.extras=null;o.slotSummary=null;o.acceptedSlot=null;
  if(o.phase==='DETAILS')o.contactStep={kind:'contact-only-details',verified:true,totalCny:9999};
  if(o.phase==='PAYMENT')o.paymentStep={kind:'native-alipay-payment-only',verified:true,totalCny:9999};
 }return rows;};
 const runtime=new DesktopCheckoutRuntime({store:f.store,launch:async()=>({api:f.api,close:async()=>{}}),onState:s=>states.push(s)});await runtime.open();
 const r=await runtime.restartPayment(OPTIONS);assert.equal(r.phase,'REVIEW');assert.equal(r.pendingAction,'continuePayment');assert.equal(runtime.finalDescriptor,null);assert.equal(states.at(-1).pendingAction,'continuePayment');assert.equal(f.w.row.pending.action,'continuePayment');
 await assert.rejects(runtime.submit({termsAccepted:true,existingOrdersChecked:true,noExtras:true}),/FinalConsentNotCurrent/);assert.equal(f.w.commands.filter(a=>a==='continuePayment').length,1);assert.equal(f.w.commands.includes('submitOrder'),false);await runtime.close();
});
test('C198 physical managed archive and atomic task preserve the full source, fallback on exact ENOENT and refuse tampered backup',async()=>{
 const f=await world(),dir=await mkdtemp(join(tmpdir(),'applebuy-c198-')),file=join(dir,'task.json'),store=new DesktopTaskStore(file),lease=await store.acquireOwner();
 try{
  for(const row of f.w.archives.values())await store.archiveSnapshot(row);await store.put(TASK_KEY,f.old);
  await restartExpiredPayment({...f,store,...OPTIONS});const row=await store.get(TASK_KEY),hash=row.desktopPaymentRestart.sourceArchive;
  assert.equal(canonicalJson(await store.readArchive(hash)),canonicalJson(f.old));assert.ok(await validateExpiredPaymentRestart(row,f.api,store));
  await unlink(join(file+'.archives',hash+'.json'));assert.ok(await validateExpiredPaymentRestart(row,f.api,store));
  const bad=structuredClone(row);bad.desktopPaymentRestart.sourceBackup.data='AAAA';assert.equal(await validateExpiredPaymentRestart(bad,f.api,store),null);
  assert.deepEqual(f.w.commands,[]);assert.equal(f.w.closedProbes,1);
 }finally{
  await lease.release();const target=resolve(dir),base=resolve(tmpdir())+sep+'applebuy-c198-';assert.ok(target.toLowerCase().startsWith(base.toLowerCase()));assert.equal((await lstat(target)).isSymbolicLink(),false);assert.equal((await realpath(target)).toLowerCase(),target.toLowerCase());await rm(target,{recursive:true});
 }
});
