// Runtime/NativeApi/Peer production code; Chrome, merchant and owner objects are FAKE.
import test from 'node:test';import assert from 'node:assert/strict';
import {world} from './fixtures/c121-native-world.mjs';
const tick=()=>new Promise(setImmediate);

test('C140 close during an in-flight startup read drains it then closes one tab and releases once',async()=>{
 const f=world(),get=f.chrome.tabs.get;let entered,release;
 const seen=new Promise(r=>entered=r),gate=new Promise(r=>release=r);let first=true;
 f.chrome.tabs.get=async id=>{const tab=await get(id);if(first){first=false;entered();await gate;return {...tab,status:'loading',url:''};}return tab;};
 const before=structuredClone(f.w.row);const opening=f.runtime.open().then(()=>false,()=>true);await seen;
 let closed=false;const closing=f.runtime.close().then(()=>{closed=true;});await tick();assert.equal(closed,false);release();
 assert.equal(await opening,true);await closing;assert.equal(f.runtime.cleanupConfirmed,true);assert.equal(f.w.tabs.size,0);assert.equal(f.w.releases,1);assert.equal(f.w.commands.length,0);assert.deepEqual(f.w.row,before);
});

for(const stage of ['owner','launch'])test('C140 close during delayed '+stage+' prevents tab creation and releases once',async()=>{
 const f=world();let entered,release,launches=0;const seen=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 const acquire=f.runtime.store.acquireOwner,launch=f.runtime.launch;
 if(stage==='owner')f.runtime.store.acquireOwner=async()=>{entered();await gate;return acquire();};
 f.runtime.launch=async()=>{launches++;if(stage==='launch'){entered();await gate;}return launch();};
 const opening=f.runtime.open().then(()=>false,()=>true);await seen;const closing=f.runtime.close();release();assert.equal(await opening,true);await closing;
 assert.equal(f.w.nextId,1);assert.equal(f.w.tabs.size,0);assert.equal(f.w.releases,1);assert.equal(f.runtime.cleanupConfirmed,true);assert.equal(f.w.commands.length,0);assert.equal(launches,stage==='owner'?0:1);
});

test('C140 standalone observation is drained before transport close and emits no late observed state',async()=>{
 const f=world();await f.runtime.open();let entered,release;const seen=new Promise(r=>entered=r),gate=new Promise(r=>release=r);const get=f.chrome.tabs.get;let first=true,states=0;
 f.runtime.onState=()=>states++;
 f.chrome.tabs.get=async id=>{const tab=await get(id);if(first){first=false;entered();await gate;}return tab;};
 const observing=f.runtime.observe().then(()=>true,()=>false);await seen;const closing=f.runtime.close();release();await observing;await closing;
 assert.equal(f.runtime.cleanupConfirmed,true);assert.equal(f.w.tabs.size,0);assert.equal(f.w.releases,1);assert.equal(f.w.commands.length,0);assert.equal(states,0);
});

test('C140 startup failure after transport acquisition cleans up without a circular wait',async()=>{
 const f=world();f.chrome.permissions.contains=async()=>false;
 await assert.rejects(f.runtime.open());assert.equal(f.runtime.cleanupConfirmed,true);assert.equal(f.w.releases,1);assert.equal(f.w.tabs.size,0);assert.equal(f.w.commands.length,0);await f.runtime.close();assert.equal(f.w.releases,1);
});

test('C140 immediate close cancels deferred startup without acquiring or launching',async()=>{
 const f=world();let launches=0;const launch=f.runtime.launch;f.runtime.launch=async()=>{launches++;return launch();};
 const opening=f.runtime.open().then(()=>false,()=>true);await f.runtime.close();assert.equal(await opening,true);assert.equal(launches,0);assert.equal(f.w.nextId,1);assert.equal(f.w.releases,0);assert.equal(f.runtime.cleanupConfirmed,true);assert.equal(f.w.writes,0);
});

test('C140 owner loss during an in-flight initial read drains cleanup without a late observed callback',async()=>{
 const f=world();let lost,owned=true,entered,release;const seen=new Promise(r=>entered=r),gate=new Promise(r=>release=r),get=f.chrome.tabs.get;let first=true;const states=[];
 f.runtime.store.acquireOwner=async()=>({get owned(){return owned;},onLost(callback){lost=callback;return ()=>{};},async release(){f.w.releases++;}});f.runtime.onState=s=>states.push(s);
 f.chrome.tabs.get=async id=>{const tab=await get(id);if(first){first=false;entered();await gate;}return {...tab,status:'loading',url:''};};
 const opening=f.runtime.open().then(()=>false,()=>true);await seen;owned=false;lost();release();assert.equal(await opening,true);await f.runtime.close();
 assert.equal(f.runtime.cleanupConfirmed,true);assert.equal(f.w.tabs.size,0);assert.equal(f.w.releases,1);assert.equal(states.length,1);assert.equal(states[0].ownerLost,true);assert.equal(f.w.writes,0);assert.equal(f.w.commands.length,0);
});

test('C140 an already-sent create may finish after close; cleanup removes that owned tab and never exposes ready',async()=>{
 const f=world(),create=f.chrome.tabs.create;let entered,release;const seen=new Promise(r=>entered=r),gate=new Promise(r=>release=r);let states=0;f.runtime.onState=()=>states++;
 f.chrome.tabs.create=async q=>{entered();await gate;return create(q);};
 const opening=f.runtime.open().then(()=>false,()=>true);await seen;const closing=f.runtime.close();release();assert.equal(await opening,true);await closing;
 assert.equal(f.runtime.cleanupConfirmed,true);assert.equal(f.w.tabs.size,0);assert.equal(f.w.nextId,2);assert.equal(f.w.releases,1);assert.equal(states,0);assert.equal(f.w.writes,0);assert.equal(f.w.commands.length,0);
});
