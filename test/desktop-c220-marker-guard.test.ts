import test from 'node:test';import assert from 'node:assert/strict';
import {applyRowPatch} from '../web/checkout-connector/r2-protocol.js';
import {createPurchaseRecord} from '../web/checkout-connector/job.js';
import {PRO_PLAN,proDigest} from '../src/desktop/browser-session.mjs';
import {world} from './fixtures/c121-native-world.mjs';
import {UNRELEASED_FINAL_KIND,knownUnreleasedFinal} from '../web/checkout-connector/review-progress.js';
const fresh=()=>({...createPurchaseRecord(PRO_PLAN,{taskId:'FAKE-C220',planDigest:proDigest,tabId:1,now:Date.now(),id:()=>crypto.randomUUID()}),desktopContext:'FAKE-context'});
test('C220 browser checkpoint cannot introduce a desktop-only final not-sent marker',()=>{
 const before=fresh(),marker={kind:'FAKE-marker',sha256:'a'.repeat(64)};
 assert.throws(()=>applyRowPatch(before,{set:{finalIntent:{id:'FAKE-final',sent:false,notDispatched:marker}},remove:[]}),/R2FinalMarkerHostOnly/);assert.equal(before.finalIntent,null);
});
test('C220 browser checkpoint cannot modify an existing marker, but may carry it unchanged or drop it for a new intent',()=>{
 const marker={kind:'FAKE-marker',sha256:'a'.repeat(64)},before={...fresh(),finalIntent:{id:'FAKE-final',sent:false,notDispatched:marker}};
 assert.throws(()=>applyRowPatch(before,{set:{finalIntent:{...before.finalIntent,notDispatched:{...marker,sha256:'b'.repeat(64)}}},remove:[]}),/R2FinalMarkerHostOnly/);
 assert.deepEqual(applyRowPatch(before,{set:{finalIntent:{...before.finalIntent}},remove:[]}).finalIntent.notDispatched,marker);
 const after=applyRowPatch(before,{set:{finalIntent:{id:'FAKE-new-final',sent:false}},remove:[]});assert.equal(after.finalIntent.notDispatched,undefined);assert.equal(before.finalIntent.id,'FAKE-final');
});
function r2(){const f=world();f.runtime.executor='browser';f.w.phase='BAG';f.w.count=1;f.w.row={...fresh(),desktopContext:f.api.sessionId};f.chrome.locks={request:async(n,o,fn)=>fn({name:n})};return f;}
test('C220 a checkpoint already reported stopped is not written to the shared journal',async()=>{
 const f=r2(),exchange=f.api.exchange;let stopped=false;
 f.api.exchange=async q=>{if(!stopped&&q.operation==='r2Poll'){for(let n=0;n<10&&!f.peer.browserJob.current?.checkpoint;n++)await new Promise(r=>setTimeout(r,10));assert.ok(f.peer.browserJob.current.checkpoint);f.peer.browserJob.stop();stopped=true;}return exchange(q);};
 try{await f.runtime.open();await assert.rejects(f.runtime.advance({checkoutApproved:true,newContextConfirmed:true}),/R2/);assert.equal(stopped,true);assert.equal(f.w.writes,0);assert.deepEqual(f.w.commands,[]);}finally{await f.runtime.close();}
});
test('C220 positive terminal proof stores only matched receipt fields and cannot override marker kind',async()=>{
 const f=r2(),exchange=f.api.exchange;let pause,stopped=false;
 f.api.exchange=async q=>{const reply=await exchange(q);if(q.operation==='r2Finish'&&reply.result?.unreleased){reply.result.unreleased.kind='FAKE-untrusted-kind';reply.result.unreleased.extra='FAKE-not-persisted';}return reply;};
 try{await f.runtime.open();await f.runtime.advance({checkoutApproved:true,newContextConfirmed:true});const put=f.runtime.store.put;
  f.runtime.store.put=async(k,v)=>{await put(k,v);if(!stopped&&v.pending?.action==='submitOrder'){stopped=true;pause=f.runtime.pause();}};
  await f.runtime.submit({termsAccepted:true,existingOrdersChecked:true,noExtras:true});await pause;const marker=f.w.row.finalIntent.notDispatched;assert.equal(marker.kind,UNRELEASED_FINAL_KIND);assert.equal(marker.extra,undefined);assert.equal(knownUnreleasedFinal(f.w.row),true);assert.equal(f.w.commands.includes('submitOrder'),false);
 }finally{await f.runtime.close();}
});
