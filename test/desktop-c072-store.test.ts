import test from 'node:test';import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';import {resolve,join} from 'node:path';import {randomUUID} from 'node:crypto';
import {DesktopTaskStore} from '../src/desktop/task-store.mjs';import {exportDesktopHandoff} from '../web/checkout-connector/desktop-handoff.js';
import {createPurchaseRecord,TASK_KEY} from '../web/checkout-connector/job.js';import {PRO_PLAN,proDigest} from '../src/desktop/browser-session.mjs';
test('C072 local handoff import is exact readonly/idempotent and preserves all unknown pending state',async()=>{
 const folder=resolve('.local/test-runs/desktop-handoff-'+randomUUID());await mkdir(folder,{recursive:true});
 let row={...createPurchaseRecord(PRO_PLAN,{taskId:'FAKE-old',planDigest:proDigest,tabId:7,now:0,id:()=> 'FAKE'}),pending:{id:'FAKE-add',action:'addBag',documentId:'FAKE-doc',deadline:0},bagAddStarted:true,resourceWritten:true};
 const oldStore={async get(){return structuredClone(row);},async put(k,v){row=structuredClone(v);}};const envelope=await exportDesktopHandoff({store:oldStore,confirmed:true});
 const file=join(folder,'task.json'),store=new DesktopTaskStore(file);assert.equal((await store.importHandoff(envelope)).readOnly,true);assert.deepEqual(await store.get(TASK_KEY),envelope.record);await store.importHandoff(envelope);assert.deepEqual(JSON.parse(await readFile(file,'utf8'))[TASK_KEY].pending,row.pending);
 await assert.rejects(store.importHandoff({...envelope,record:{...envelope.record,reconcileOnly:false}}),/Unconfirmed/);assert.deepEqual(await store.get(TASK_KEY),envelope.record);
});
test('C072 independent store instances cannot contend for an already held or unknown owner marker',async()=>{
 const folder=resolve('.local/test-runs/desktop-owner-'+randomUUID());await mkdir(folder,{recursive:true});const a=new DesktopTaskStore(join(folder,'task.json')),b=new DesktopTaskStore(join(folder,'task.json'));
 const lease=await a.acquireOwner();await assert.rejects(b.acquireOwner(),/HeldOrUnconfirmed/);await lease.release();const next=await b.acquireOwner();await next.release();
});
