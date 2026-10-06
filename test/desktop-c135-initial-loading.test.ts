// Actual startup failed after createTab succeeded and getTab was rejected. Loading API shapes are FAKE here.
import test from 'node:test';import assert from 'node:assert/strict';
import {world} from './fixtures/c121-native-world.mjs';
import {BAG} from '../web/checkout-connector/checkout-rpc-contract.js';

for(const transient of ['empty-url','loading-url'])test('C135 initial '+transient+' settles before reading the first document, without another create or mutation',async()=>{
 const f=world(),get=f.chrome.tabs.get;let reads=0,scripts=0;
 f.chrome.tabs.get=async id=>{const tab=await get(id);reads++;return reads<=2?{...tab,status:'loading',url:transient==='empty-url'?'':BAG,pendingUrl:BAG}:tab;};
 const execute=f.chrome.scripting.executeScript;f.chrome.scripting.executeScript=async q=>{scripts++;assert.ok(reads>2);return execute(q);};
 const before=structuredClone(f.w.row);
 try {const observed=await f.runtime.open();assert.equal(observed.phase,'EMPTY_BAG');assert.equal(f.w.tabs.size,1);assert.equal(f.w.commands.length,0);assert.equal(scripts,1);assert.deepEqual(f.w.row,before);}
 finally {await f.runtime.close();}
 assert.equal(f.w.tabs.size,0);assert.equal(f.w.releases,1);
});

test('C135 a delivery-error transport cannot be polled or re-created at startup',async()=>{
 const f=world();let reads=0;
 const exchange=f.api.exchange;
 f.api.exchange=async q=>{if(q.operation==='getTab'){reads++;throw Error('NativeCheckoutDeliveryUnknown');}return exchange(q);};
 await assert.rejects(f.runtime.open(),/NativeCheckoutDeliveryUnknown|DesktopBrowserCleanupUnconfirmed/);
 assert.equal(reads,1);assert.equal(f.w.commands.length,0);assert.equal(f.w.writes,0);
 // This fixture exchange has not poisoned NativeCheckoutApi; closeSession remains a normal owned cleanup.
 if(!f.runtime.cleanupConfirmed)await f.api.close();
});

test('C135 repeated loading remains unknown within the fixed bound, with one tab and no mutations',async t=>{
 t.mock.timers.enable({apis:['Date','setTimeout'],now:100000});
 const f=world(),get=f.chrome.tabs.get;let reads=0;
 f.chrome.tabs.get=async id=>{reads++;return {...await get(id),status:'loading',url:'',pendingUrl:BAG};};
 const before=structuredClone(f.w.row);let finished=false;
 const done=assert.rejects(f.runtime.open(),/DesktopInitialPageUnconfirmed/).then(()=>{finished=true;});
 for(let n=0;n<160&&!finished;n++){await new Promise(setImmediate);t.mock.timers.tick(100);}
 await done;assert.ok(reads<=150);assert.equal(f.w.commands.length,0);assert.equal(f.w.writes,0);assert.deepEqual(f.w.row,before);assert.equal(f.w.tabs.size,0);assert.equal(f.w.releases,1);assert.equal(f.runtime.cleanupConfirmed,true);
});

test('C135 closing during loading cancels startup before any document or purchase command',async()=>{
 const f=world(),get=f.chrome.tabs.get;let reads=0;
 f.chrome.tabs.get=async id=>{reads++;if(reads===1)f.runtime.closing=true;return {...await get(id),status:'loading',url:BAG};};
 await assert.rejects(f.runtime.open(),/DesktopSessionCancelled/);assert.equal(reads,1);assert.equal(f.w.commands.length,0);assert.equal(f.w.writes,0);assert.equal(f.w.tabs.size,0);assert.equal(f.w.releases,1);
});

test('C135 current invalid address does not grant navigation or repeated create',async()=>{
 const f=world(),get=f.api.tabs.get;
 // Local runtime adapter shape only; the actual native peer has its own stricter address guard.
 const original=f.runtime.launch;f.runtime.launch=async()=>{const launch=await original();return {...launch,api:new Proxy(launch.api,{get(target,key){if(key==='tabs')return {...target.tabs,get:async id=>({...await get(id),url:'https://FAKE.invalid/',status:'complete'})};return Reflect.get(target,key);}})};};
 await assert.rejects(f.runtime.open(),/UnsupportedMerchantPage/);assert.equal(f.w.commands.length,0);assert.equal(f.w.writes,0);assert.equal(f.w.tabs.size,0);assert.equal(f.w.releases,1);
});

test('C135 an ungranted initial host stops before create, without polling or ledger changes',async()=>{
 const f=world();f.chrome.permissions.contains=async()=>false;
 await assert.rejects(f.runtime.open(),/NativeCheckoutResultUnconfirmed/);
 assert.equal(f.w.tabs.size,0);assert.equal(f.w.commands.length,0);assert.equal(f.w.writes,0);assert.equal(f.w.releases,1);assert.equal(f.runtime.cleanupConfirmed,true);
});
