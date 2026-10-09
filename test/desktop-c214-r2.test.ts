// Production R2 job/peer/port/runtime; merchant responses, permissions, identity and authority are FAKE.
import test from 'node:test';import assert from 'node:assert/strict';
import {world} from './fixtures/c121-native-world.mjs';
import {createPurchaseRecord,canonicalJson,TASK_KEY} from '../web/checkout-connector/job.js';
import {PRO_PLAN,proDigest} from '../src/desktop/browser-session.mjs';
import {applyRowPatch,rowPatch,digest,R2_VERSION} from '../web/checkout-connector/r2-protocol.js';
import {DesktopTaskStore} from '../src/desktop/task-store.mjs';
import {BrowserJobExecutor} from '../web/checkout-connector/r2-executor.js';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve,sep} from 'node:path';
const YES={checkoutApproved:true,newContextConfirmed:true};
function r2(options={}){
 const f=world(options);f.runtime.executor='browser';let held=false;
 f.chrome.locks={request:async(name,opts,fn)=>{assert.equal(name,'applebuy-single-purchase-owner');assert.equal(opts.ifAvailable,true);if(held)return fn(null);held=true;try{return await fn({name});}finally{held=false;}}};
 f.w.row={...createPurchaseRecord(PRO_PLAN,{taskId:'FAKE-C214-owned',planDigest:proDigest,tabId:1,now:Date.now(),id:()=>crypto.randomUUID()}),desktopContext:f.api.sessionId};
 const execute=f.chrome.scripting.executeScript;f.chrome.scripting.executeScript=async q=>{
  const c=q.args[1];if(c&&c.action!=='readOrderSummary'){
   assert.equal(f.w.row.pending?.id,c.id,'native action must follow its persisted desktop pending intent');
   if(c.action==='submitOrder')assert.equal(f.w.row.finalIntent?.sent,true,'final must already be durable before the browser click');
  }return execute(q);
 };
 f.rpcFrames=[];const exchange=f.api.exchange;f.api.exchange=q=>{f.rpcFrames.push(q.operation);return exchange(q);};return f;
}
test('C214 whole browser-local chain keeps desktop journal; zero business DOM RPC and one independently matched FAKE unpaid detail',async()=>{
 const f=r2({refuse:true});try{
  await f.runtime.open();const start=f.rpcFrames.length,ready=await f.runtime.advance(YES);assert.equal(ready.phase,'REVIEW');
  assert.equal(f.w.commands.filter(x=>x==='addBag').length,1);assert.equal(f.w.commands.filter(x=>x==='checkout').length,1);assert.equal(f.w.commands.filter(x=>x==='chooseSlot').length,2);assert.equal(f.w.slot.start,'21:30');assert.equal(f.w.row.refusals,1);
  const middle=f.rpcFrames.slice(start);assert.ok(middle.includes('r2Run'));assert.ok(middle.filter(x=>x==='r2Ack').length>5);assert.equal(middle.filter(x=>x==='merchantDocument').length,1,'only final consent fresh read crosses native; ordinary business reads remain browser-local');
  const done=await f.runtime.submit({termsAccepted:true,existingOrdersChecked:true,noExtras:true});assert.equal(done.state,'CONFIRMED_UNPAID');assert.equal(done.realOrderVerified,true);assert.equal(f.w.commands.filter(x=>x==='submitOrder').length,1);await assert.rejects(f.runtime.submit({termsAccepted:true,existingOrdersChecked:true,noExtras:true}));
 }finally{await f.runtime.close();assert.equal(f.w.tabs.size,0);assert.equal(f.w.releases,1);}
});
test('C214 existing singleton cart takes zero Add; chunked full historical record remains byte-for-byte',async()=>{
 const f=r2();f.w.phase='BAG';f.w.count=1;f.w.row.bagAddStarted=true;f.w.row.resourceWritten=true;f.w.row.historicalEvidence='FAKE ONLY 历史'.repeat(25000);const history=f.w.row.historicalEvidence;
 try{await f.runtime.open();await f.runtime.advance(YES);assert.equal(f.w.commands.includes('addBag'),false);assert.equal(f.w.row.historicalEvidence,history);assert.ok(f.rpcFrames.filter(x=>x==='r2Chunk').length>10);}finally{await f.runtime.close();}
});
test('C214 durable write failure before checkout prevents the click and does not fall back to R1',async()=>{
 const f=r2();f.w.phase='BAG';f.w.count=1;const put=f.runtime.store.put;
 f.runtime.store.put=async(k,v)=>{if(v.pending?.action==='checkout')throw Error('FAKE disk failed');return put(k,v);};
 try{await f.runtime.open();await assert.rejects(f.runtime.advance(YES),/FAKE disk|R2/);assert.deepEqual(f.w.commands,[]);assert.equal(f.peer.browserJob.current,null);}finally{await f.runtime.close();}
});
test('C214 pause after sent checkout preserves pending and same actor resumes without a second checkout',async()=>{
 const f=r2(),execute=f.chrome.scripting.executeScript;f.w.phase='BAG';f.w.count=1;let reached,release;const entered=new Promise(r=>reached=r),hold=new Promise(r=>release=r);
 f.chrome.scripting.executeScript=async q=>{const r=await execute(q);if(q.args[1]?.action==='checkout'){reached();await hold;}return r;};
 try{await f.runtime.open();const running=f.runtime.advance(YES);await entered;const pause=f.runtime.pause();release();const result=await running;await pause;assert.equal(result.state,'PAUSED');assert.equal(f.w.row.pending.action,'checkout');assert.equal(f.w.commands.includes('selectPickup'),false);const resumed=await f.runtime.resume(YES);assert.equal(resumed.phase,'REVIEW');assert.equal(f.w.commands.filter(x=>x==='checkout').length,1);}finally{await f.runtime.close();}
});
test('C214 unknown final remains one final even when the native reply arrives but receipt cannot be read',async()=>{
 const f=r2(),execute=f.chrome.scripting.executeScript;let final=false;
 f.chrome.scripting.executeScript=async q=>{if(final&&!q.args[1])throw Error('FAKE unknown receipt');const r=await execute(q);if(q.args[1]?.action==='submitOrder')final=true;return r;};
 try{await f.runtime.open();await f.runtime.advance(YES);await assert.rejects(f.runtime.submit({termsAccepted:true,existingOrdersChecked:true,noExtras:true}),/R2|FinalConsent/);assert.equal(f.w.row.finalIntent.sent,true);assert.equal(f.w.row.pending.action,'submitOrder');assert.equal(f.w.commands.filter(x=>x==='submitOrder').length,1);await assert.rejects(f.runtime.submit({termsAccepted:true,existingOrdersChecked:true,noExtras:true}));}finally{await f.runtime.close();}
});
test('C214 second origin owner and permanently readonly source cannot start a local buyer',async()=>{
 const f=r2();f.chrome.locks.request=async(n,o,fn)=>fn(null);
 try{await f.runtime.open();await assert.rejects(f.runtime.advance(YES),/R2/);assert.deepEqual(f.w.commands,[]);f.w.row.reconcileOnly=true;await assert.rejects(f.runtime.advance(YES),/RevokedSource/);assert.deepEqual(f.w.commands,[]);}finally{await f.runtime.close();}
});
test('C214 AUTH waits inside the browser actor; an external FAKE login completion automatically reconciles once',async()=>{
 const f=r2({requireAuth:true});let sawAuth=false;
 f.runtime.onState=s=>{if(!sawAuth&&s.phase==='AUTH'){sawAuth=true;setTimeout(()=>{f.w.phase='FULFILLMENT';const t=f.w.tabs.get(f.w.mainId);t.url='https://secure8.www.apple.com.cn/shop/checkout';t.version++;},50);}};
 try{await f.runtime.open();assert.equal((await f.runtime.advance(YES)).phase,'REVIEW');assert.equal(sawAuth,true);assert.equal(f.w.commands.filter(x=>x==='checkout').length,1);assert.equal(f.rpcFrames.filter(x=>x==='r2Run').length,1);}finally{await f.runtime.close();}
});
test('C214 patches cannot change original deadlines, source archives, identity or namespace',()=>{
 const f=r2(),row=f.w.row;for(const k of ['taskId','tabId','desktopContext','expiresAt','desktopReviewRestart','retiredHistory','plan'])assert.throws(()=>applyRowPatch(row,{set:{[k]:'FAKE'},remove:[]}),/PatchInvalid/);
 const after={...row,state:'NEEDS_USER'};assert.deepEqual(applyRowPatch(row,rowPatch(row,after)),after);assert.equal(row.state,'RUNNING');
});
test('C214 malformed upload cannot start and a still active browser owner refuses R1 page RPCs',async()=>{
 const f=r2();try{await f.runtime.open();const runId='FAKE-upload-owner';await f.api.r2Exchange('r2Begin',{runId,bytes:2,sha256:await digest('{}')});await assert.rejects(f.api.tabs.get(f.runtime.tabId));await assert.rejects(f.api.r2Exchange('r2Chunk',{runId,sequence:1,data:'e30='}));assert.deepEqual(f.w.commands,[]);await f.api.r2Exchange('r2Pause',{runId});await f.api.r2Exchange('r2Finish',{runId});assert.ok(await f.api.tabs.get(f.runtime.tabId));}finally{await f.runtime.close();}
});
test('C214 disconnect during an awaited permission check cannot dispatch the following native click',async()=>{
 const f=r2();f.w.phase='BAG';f.w.count=1;let entered,release,held=false;const reached=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 f.chrome.permissions.contains=async()=>{if(!held&&f.w.row.pending?.action==='checkout'){held=true;entered();await gate;}return true;};
 try{await f.runtime.open();const running=f.runtime.advance(YES);await reached;f.peer.browserJob.stop();release();await assert.rejects(running,/R2/);assert.deepEqual(f.w.commands,[]);assert.equal(f.w.row.pending.action,'checkout');assert.notEqual(f.w.row.pending.dispatched,false);}finally{release();await f.runtime.close();}
});
test('C214 real kernel-held journal and atomic writer are shared with the browser executor; second desktop owner is denied',async()=>{
 const f=r2(),dir=await mkdtemp(join(tmpdir(),'applebuy-c214-')),store=new DesktopTaskStore(join(dir,'task.json'));let initial=await store.acquireOwner();await store.put(TASK_KEY,f.w.row);await initial.release();
 const put=store.put.bind(store);store.put=async(k,row)=>{await put(k,row);f.w.row=await store.get(TASK_KEY);};f.runtime.store=store;
 try{await f.runtime.open();const other=new DesktopTaskStore(join(dir,'task.json'));await assert.rejects(other.acquireOwner(),/HeldOrUnconfirmed/);const result=await f.runtime.advance(YES);assert.equal(result.phase,'REVIEW');const saved=await store.get(TASK_KEY);assert.equal(saved.pending,null);assert.equal(saved.taskId,f.w.row.taskId);assert.equal(saved.desktopContext,f.api.sessionId);assert.equal(f.w.commands.filter(x=>x==='checkout').length,1);}finally{await f.runtime.close();assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep+'applebuy-c214-'));await rm(dir,{recursive:true});}
});
test('C214 heartbeat expiry cancels an unacknowledged browser checkpoint without a merchant action',async()=>{
 const f=r2();try{
  await f.runtime.open();const record=f.w.row,runId='FAKE-host-lost-run',value={version:R2_VERSION,record,run:{taskId:record.taskId,tabId:1,planDigest:proDigest,mode:'purchase',grant:null},port:{authorized:true,mode:'purchase',orderSummary:true},proofs:{}};
  const bytes=Buffer.from(JSON.stringify(value));await f.api.r2Exchange('r2Begin',{runId,bytes:bytes.length,sha256:await digest(bytes)});await f.api.r2Exchange('r2Chunk',{runId,sequence:0,data:bytes.toString('base64')});await f.api.r2Exchange('r2Run',{runId});
  // No desktop journal acknowledgement and no more heartbeats. The real watchdog must terminate it.
  await new Promise(r=>setTimeout(r,2900));const status=await f.api.r2Exchange('r2Poll',{runId});assert.equal(status.paused,true);assert.equal(status.running,false);assert.equal(f.w.writes,0);assert.deepEqual(f.w.commands,[]);await assert.rejects(f.api.r2Exchange('r2Ack',{runId,sequence:1,sha256:await digest(canonicalJson(record))}));await f.api.r2Exchange('r2Finish',{runId});
 }finally{await f.runtime.close();}
});
test('C214 already-sent final can only reconcile its matching FAKE receipt after the original task expires',async()=>{
 const f=r2();f.w.count=1;f.w.phase='ORDER_RECEIPT';f.w.ref='e'.repeat(64);f.w.slot={date:'2099年1月1日',start:'21:15',end:'21:30',verified:true};f.w.payment='支付宝';
 f.w.row={...f.w.row,expiresAt:Date.now()-1000,bagAddStarted:true,resourceWritten:true,bagTotalCny:9999,acceptedSlot:f.w.slot,initialDates:['2099年1月1日'],floors:{'2099年1月1日':'21:15'},finalIntent:{id:'FAKE-final-once',sent:true},pending:{id:'FAKE-final-once',action:'submitOrder',documentId:'FAKE-doc-1-1',deadline:Date.now()-1000}};
 try{await f.runtime.open();const result=await f.runtime.advance(YES);assert.equal(result.state,'CONFIRMED_UNPAID');assert.deepEqual(f.w.commands,[]);assert.equal(f.w.row.orderRefHash,f.w.ref);}finally{await f.runtime.close();}
});
test('C214 a browser API that never returns stops within its bound and keeps the sent checkout unknown',async()=>{
 const f=r2();f.w.phase='BAG';f.w.count=1;const execute=f.chrome.scripting.executeScript;let release;
 f.chrome.scripting.executeScript=async q=>{const reply=await execute(q);if(q.args[1]?.action==='checkout')await new Promise(r=>release=r);return reply;};
 f.peer.browserJob=new BrowserJobExecutor({peer:f.peer,locks:f.chrome.locks,operationMs:50});
 try{await f.runtime.open();await assert.rejects(f.runtime.advance(YES),/R2/);assert.equal(f.w.row.pending.action,'checkout');assert.equal(f.w.commands.filter(x=>x==='checkout').length,1);assert.equal(f.w.commands.includes('selectPickup'),false);release();}finally{release?.();await f.runtime.close();}
});
test('C214 old installed peer is rejected before tab creation, journal write or consuming a successor',async()=>{
 const f=r2(),exchange=f.api.exchange,original=canonicalJson(f.w.row);f.api.exchange=q=>q.operation==='r2Version'?Promise.resolve({schema:q.schema,kind:'reply',contextId:q.contextId,id:q.id,ok:true,result:'FAKE-old-version'}):exchange(q);
 await assert.rejects(f.runtime.open(),/R2ExecutorUpdateRequired/);assert.equal(f.w.nextId,1);assert.equal(f.w.writes,0);assert.equal(canonicalJson(f.w.row),original);assert.deepEqual(f.w.commands,[]);assert.equal(f.runtime.cleanupConfirmed,true);
});
