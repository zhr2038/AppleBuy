import test from 'node:test';
import assert from 'node:assert/strict';
import {probeCheckoutHostScope} from '../src/desktop/checkout-host-scope.mjs';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {expiredPaymentSourceShape} from '../src/desktop/expired-payment-restart.mjs';

for(const granted of [true,false])test(`C192 existing host grant ${granted} is read once without permission request or browser action`,async()=>{
 const requests=[];
 const api=new Proxy({permissions:{contains:async request=>{requests.push(request);return granted;}}},{get(target,key){assert.equal(key,'permissions');return target[key];}});
 assert.deepEqual(await probeCheckoutHostScope(api),{shopHostScopeVerified:true,shopHostScopeGranted:granted});
 assert.deepEqual(requests,[{origins:['https://*.www.apple.com.cn/*']}]);
});

test('C192 failed permission query is unknown, not missing permission',async()=>{
 const api={permissions:{contains:async()=>{throw Error('private transport detail');}}};
 assert.deepEqual(await probeCheckoutHostScope(api),{shopHostScopeVerified:false,shopHostScopeGranted:null});
});

test('C192 malformed replies never become an existing grant or confirmed denial',async()=>{
 for(const reply of [undefined,null,'true',1,{granted:true}]){
  assert.deepEqual(await probeCheckoutHostScope({permissions:{contains:async()=>reply}}),{shopHostScopeVerified:false,shopHostScopeGranted:null});
 }
});

test('C192 unavailable permission API stays unknown and leaks no arbitrary error',async()=>{
 assert.deepEqual(await probeCheckoutHostScope({}),{shopHostScopeVerified:false,shopHostScopeGranted:null});
});

// Exercise the actual worker startup body with contained FAKE dependencies; no Chrome or real ledger.
async function workerStartup(reply,{loseOwner=false,loseOwnerOnSourceRead=false}={}){
 const source=await readFile(new URL('../src/desktop/native-purchase-worker.mjs',import.meta.url),'utf8');
 const rows=[],calls=[];let currentRuntime;
 class Runtime{
  constructor(){currentRuntime=this;this.ownerLost=false;this.api={permissions:{contains:async q=>{calls.push(q);if(loseOwner)this.ownerLost=true;return reply;}}};}
  async open(){return {legacyReadOnly:true};}
  async close(){calls.push('close');}
 }
 class Store{async get(){if(loseOwnerOnSourceRead)currentRuntime.ownerLost=true;return {record:'FAKE unchanged old source'};}}
 class Watch{stop(){}}
 const input={on(){},once(_event,resolve){resolve();},close(){}};
 const process={cwd:()=>'/FAKE',argv:['FAKE','FAKE'],stdin:{destroy(){}},stdout:{write(line){rows.push(JSON.parse(line));}}};
 await vm.runInNewContext(`(async()=>{${source.slice(source.indexOf('const emit='))}})()`,{
  process,DesktopCheckoutRuntime:Runtime,DesktopTaskStore:Store,AuthContinuation:Watch,
  createInterface:()=>input,join:(...parts)=>parts.join('/'),launchNativeCheckout:()=>{throw Error('No real transport');},
  stoppedCheckoutDraftSource:()=>true,expiredPaymentSourceShape,TASK_KEY:'FAKE',probeCheckoutHostScope,safeCheckoutDiagnostic:()=> 'FAKE',
 });
 return {rows,calls,currentRuntime};
}

test('C192 actual worker reports existing scope at readonly readiness without store or merchant mutations',async()=>{
 const {rows,calls}=await workerStartup(true);
 assert.deepEqual(rows.map(r=>r.type),['ready']);
 assert.equal(rows[0].readOnly,true);assert.equal(rows[0].shopHostScopeVerified,true);assert.equal(rows[0].shopHostScopeGranted,true);
 assert.deepEqual(calls,[{origins:['https://*.www.apple.com.cn/*']},'close']);
});

test('C192 owner loss during the actual startup scope query cannot emit late ready',async()=>{
 const {rows,calls}=await workerStartup(true,{loseOwner:true});
 assert.deepEqual(rows.map(r=>r.type),['blocked']);
 assert.equal(calls.at(-1),'close');
});

test('C192 owner loss while reading the retained source after the scope query cannot emit late ready',async()=>{
 const {rows,calls}=await workerStartup(true,{loseOwnerOnSourceRead:true});
 assert.deepEqual(rows.map(r=>r.type),['blocked']);
 assert.equal(calls.at(-1),'close');
});
