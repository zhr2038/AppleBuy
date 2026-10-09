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
for(const action of ['checkout','submitOrder'])test('C216 pause during durable '+action+' write records positively not released, then fresh continuation works',async()=>{
 const f=r2();f.w.phase='BAG';f.w.count=1;let pause,triggered=false;
 try{
  await f.runtime.open();if(action==='submitOrder')await f.runtime.advance(YES);
  const put=f.runtime.store.put;f.runtime.store.put=async(k,v)=>{await put(k,v);if(!triggered&&v.pending?.action===action&&v.pending.dispatched!==false){triggered=true;pause=f.runtime.pause();}};
  if(action==='submitOrder')await f.runtime.submit({termsAccepted:true,existingOrdersChecked:true,noExtras:true}).catch(()=>{});else await f.runtime.advance(YES);
  await pause;assert.equal(triggered,true);assert.equal(f.w.commands.filter(x=>x===action).length,0);assert.equal(f.w.row.pending?.dispatched,false);if(action==='submitOrder')assert.equal(f.w.row.finalIntent.sent,false);
  const resumed=await f.runtime.resume(YES);assert.equal(resumed.phase,'REVIEW');assert.ok(f.runtime.finalDescriptor);
  const done=await f.runtime.submit({termsAccepted:true,existingOrdersChecked:true,noExtras:true});assert.equal(done.state,'CONFIRMED_UNPAID');assert.equal(f.w.commands.filter(x=>x==='submitOrder').length,1);assert.equal(f.w.commands.filter(x=>x==='checkout').length,1);
 }finally{await f.runtime.close();}
});
for(const action of ['checkout','submitOrder'])test('C216 slow fsync longer than old heartbeat must not turn '+action+' into a false unknown',async()=>{
 const f=r2();f.w.phase='BAG';f.w.count=1;let held=false;
 try{
  await f.runtime.open();if(action==='submitOrder')await f.runtime.advance(YES);
  const put=f.runtime.store.put;f.runtime.store.put=async(k,v)=>{await put(k,v);if(!held&&v.pending?.action===action&&v.pending.dispatched!==false){held=true;await new Promise(r=>setTimeout(r,3000));}};
  const result=await(action==='submitOrder'?f.runtime.submit({termsAccepted:true,existingOrdersChecked:true,noExtras:true}):f.runtime.advance(YES));
  assert.equal(held,true);if(action==='submitOrder'){assert.equal(result.state,'CONFIRMED_UNPAID');assert.equal(result.realOrderVerified,true);}else assert.equal(result.phase,'REVIEW');assert.equal(f.w.commands.filter(x=>x===action).length,1);
 }finally{await f.runtime.close();}
});
for(const action of ['checkout','submitOrder'])test('C216 explicitly refused '+action+' ack corrects only after matching terminal proof',async()=>{
 const f=r2();f.w.phase='BAG';f.w.count=1;let triggered=false;
 try{await f.runtime.open();if(action==='submitOrder')await f.runtime.advance(YES);const put=f.runtime.store.put;
  f.runtime.store.put=async(k,v)=>{await put(k,v);if(!triggered&&v.pending?.action===action){triggered=true;f.peer.browserJob.now=()=>Date.now()+16000;}};
  await assert.rejects(action==='submitOrder'?f.runtime.submit({termsAccepted:true,existingOrdersChecked:true,noExtras:true}):f.runtime.advance(YES));assert.equal(f.w.commands.filter(x=>x===action).length,0);assert.equal(f.w.row.pending.dispatched,false);if(action==='submitOrder')assert.equal(f.w.row.finalIntent.sent,false);
 }finally{await f.runtime.close();}
});
for(const action of ['checkout','submitOrder'])test('C216 lost reply after accepted '+action+' ack remains unknown, never positively not-sent',async()=>{
 const f=r2();f.w.phase='BAG';f.w.count=1;let dropped=false;
 try{await f.runtime.open();if(action==='submitOrder')await f.runtime.advance(YES);const exchange=f.api.exchange;
  f.api.exchange=async q=>{const result=await exchange(q);if(!dropped&&q.operation==='r2Ack'&&f.w.row.pending?.action===action){dropped=true;throw Error('FAKE accepted ack reply lost');}return result;};
  await assert.rejects(action==='submitOrder'?f.runtime.submit({termsAccepted:true,existingOrdersChecked:true,noExtras:true}):f.runtime.advance(YES));assert.equal(dropped,true);assert.notEqual(f.w.row.pending?.dispatched,false);if(action==='submitOrder')assert.equal(f.w.row.finalIntent.sent,true);assert.ok(f.w.commands.filter(x=>x===action).length<=1);
 }finally{await f.runtime.close();}
});
test('C216 inherited unknown pending cannot be relabelled not-sent by an unacknowledged state-only checkpoint',async()=>{
 const f=r2();f.w.phase='AUTH';f.w.row.pending={id:'FAKE-old-unknown-checkout',action:'checkout',documentId:'FAKE-old',deadline:Date.now()+10000};const old=structuredClone(f.w.row.pending);let pause,triggered=false;
 try{await f.runtime.open();const put=f.runtime.store.put;f.runtime.store.put=async(k,v)=>{await put(k,v);if(!triggered){triggered=true;pause=f.runtime.pause();}};await f.runtime.advance(YES);await pause;assert.deepEqual(f.w.row.pending,old);assert.deepEqual(f.w.commands,[]);}finally{await f.runtime.close();}
});
test('C216 forged stop proof cannot roll back a newly persisted intent',async()=>{
 const f=r2();f.w.phase='BAG';f.w.count=1;let pause,triggered=false;const exchange=f.api.exchange;
 f.api.exchange=async q=>{const reply=await exchange(q);if(q.operation==='r2Finish'&&reply.result?.unreleased)reply.result.unreleased.sha256='0'.repeat(64);return reply;};
 try{await f.runtime.open();const put=f.runtime.store.put;f.runtime.store.put=async(k,v)=>{await put(k,v);if(!triggered&&v.pending?.action==='checkout'){triggered=true;pause=f.runtime.pause();}};await f.runtime.advance(YES);await pause;assert.notEqual(f.w.row.pending?.dispatched,false);assert.deepEqual(f.w.commands,[]);}finally{await f.runtime.close();}
});
test('C216 pause at the earlier final draft checkpoint also needs fresh consent instead of a stuck unsent final',async()=>{
 const f=r2();f.w.phase='BAG';f.w.count=1;let pause,triggered=false;
 try{await f.runtime.open();await f.runtime.advance(YES);const put=f.runtime.store.put;f.runtime.store.put=async(k,v)=>{await put(k,v);if(!triggered&&v.finalIntent?.sent===false&&!v.pending){triggered=true;pause=f.runtime.pause();}};
  await f.runtime.submit({termsAccepted:true,existingOrdersChecked:true,noExtras:true}).catch(()=>{});await pause;assert.equal(f.w.commands.includes('submitOrder'),false);assert.equal(f.w.row.finalIntent.sent,false);assert.ok(f.w.row.finalIntent.notDispatched);
  await f.runtime.resume(YES);assert.ok(f.runtime.finalDescriptor);const result=await f.runtime.submit({termsAccepted:true,existingOrdersChecked:true,noExtras:true});assert.equal(result.state,'CONFIRMED_UNPAID');assert.equal(f.w.commands.filter(x=>x==='submitOrder').length,1);
 }finally{await f.runtime.close();}
});
