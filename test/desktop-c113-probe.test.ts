// Production readonly probe with FAKE child/store: no private ledger, registry or Chrome.
import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {runChromeReadonlyProbe} from '../src/desktop/chrome-readonly-probe.mjs';
import {createPurchaseRecord} from '../web/checkout-connector/job.js';import {PRO_PLAN,proDigest} from '../src/desktop/browser-session.mjs';
function fixture({valid=true,readonly=true,changed=false,overflow=false,lost=false,extra=false}={}){
 const row={...createPurchaseRecord(PRO_PLAN,{taskId:'FAKE-old',planDigest:proDigest,tabId:7,now:0,id:()=> 'FAKE'}),reconcileOnly:readonly};let releases=0,spawns=0,reads=0,kills=0,writes=0,owned=true;
 const store={async acquireOwner(){return {get owned(){return owned;},async release(){releases++;}};},async get(){reads++;return valid?{...structuredClone(row),...(changed&&reads>1?{state:'FAKE-CHANGED'}:{})}:null;},async put(){writes++;throw Error('Readonly must not write');}};
 function spawnProcess(){spawns++;const child=new EventEmitter() as any;child.stdin={end(){}};child.stderr={resume(){}};child.stdout=new EventEmitter();child.exitCode=null;child.kill=()=>{kills++;child.exitCode=1;setImmediate(()=>child.emit('close',1));};
  setImmediate(()=>{child.exitCode=0;child.emit('exit',0);if(lost)owned=false;
   setImmediate(()=>{const reply={scope:'existing-chrome-readonly',phase:'EMPTY_BAG',readOnly:true,mutationCount:0,tabClosed:true,...(extra?{cookie:'FAKE-not-exported',matchingSingleton:true}:{})};child.stdout.emit('data',overflow?'x'.repeat(10001):JSON.stringify(reply)+'\n');child.emit('close',overflow?1:0);});});return child;
 }
 return {store,spawnProcess,get counts(){return {releases,spawns,reads,kills,writes};}};
}
test('C113 late stdout after exit is collected through close, original record stays readonly and projection excludes payload',async()=>{
 const f=fixture({extra:true}),result=await runChromeReadonlyProbe(f);assert.equal(result.phase,'EMPTY_BAG');assert.equal(result.oldRecordUnchanged,true);assert.equal('cookie' in result,false);assert.equal('matchingSingleton' in result,false);assert.deepEqual(f.counts,{releases:1,spawns:1,reads:2,kills:0,writes:0});
});
test('C113 invalid or nonreadonly import never launches native broker and releases the owner',async()=>{
 for(const change of [{valid:false},{readonly:false}]){const f=fixture(change),result=await runChromeReadonlyProbe(f);assert.equal(result.phase,'UNKNOWN');assert.equal(f.counts.spawns,0);assert.equal(f.counts.releases,1);}
});
test('C113 changed original row, lost lease or overlong output remains unconfirmed without any ledger write',async()=>{
 for(const change of [{changed:true},{lost:true},{overflow:true}]){const f=fixture(change),result=await runChromeReadonlyProbe(f);assert.equal(result.phase,'UNKNOWN');assert.equal(result.confirmed,false);assert.equal(f.counts.releases,1);assert.equal(f.counts.writes,0);}
});
