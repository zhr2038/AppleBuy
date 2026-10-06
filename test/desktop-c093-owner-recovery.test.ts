// Real OS processes and real private fixture files, with a FAKE task and zero merchant access.
import test from 'node:test';import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';import {once} from 'node:events';
import {mkdir,readFile,writeFile} from 'node:fs/promises';import {resolve,join} from 'node:path';import {randomUUID} from 'node:crypto';
import {DesktopTaskStore} from '../src/desktop/task-store.mjs';
import {acquireDesktopOwner,guardOwnedApi} from '../src/desktop/owner-lease.mjs';
import {TASK_KEY} from '../web/checkout-connector/job.js';
async function fixture(){const folder=resolve('.local/test-runs/c093-owner-'+randomUUID());await mkdir(folder,{recursive:true});const file=join(folder,'task.json');const bytes=Buffer.from('{"FAKE":"unknown-final-must-stay-unknown"}');await writeFile(file,bytes);return {file,bytes,store:new DesktopTaskStore(file)};}
test('C093 a forcibly terminated owned worker releases the OS lease without deleting its unknown ledger',async()=>{
 const {file,bytes,store}=await fixture(),child=spawn(process.execPath,['test/desktop-c093-lease-child.mjs',file],{cwd:resolve('.'),windowsHide:true,stdio:['pipe','pipe','pipe']});
 child.stderr.resume();let text='';await new Promise((yes,no)=>{child.stdout.on('data',chunk=>{text+=chunk;if(text.includes('\n'))yes();});child.once('error',no);child.once('exit',()=>no(Error('Fixture exited before ownership')));});assert.equal(JSON.parse(text.trim()).owned,true);
 await assert.rejects(store.acquireOwner(),/HeldOrUnconfirmed/);const exited=once(child,'exit');assert.equal(child.kill(),true);await exited;child.stdin.destroy();
 let next;for(let i=0;i<30&&!next;i++){try{next=await store.acquireOwner();}catch(error){if(i===29)throw error;await new Promise(r=>setTimeout(r,50));}}
 assert.equal(next.owned,true);assert.deepEqual(await readFile(file),bytes);await next.release();
});
test('C093 a legacy unknown owner marker is never discarded based on age or PID',async()=>{
 const {file,bytes,store}=await fixture(),marker=Buffer.from('{"id":"FAKE-legacy","pid":99999999}');await writeFile(file+'.owner',marker);
 await assert.rejects(store.acquireOwner(),/HeldOrUnconfirmed/);assert.deepEqual(await readFile(file+'.owner'),marker);assert.deepEqual(await readFile(file),bytes);
});
test('C093 an empty legacy marker is unconfirmed, not permission to initialise over it',async()=>{
 const {file,store}=await fixture();await writeFile(file+'.owner','');await assert.rejects(store.acquireOwner(),/HeldOrUnconfirmed/);assert.equal((await readFile(file+'.owner')).length,0);
});
test('C093 atomic private writer preserves Chinese and other keys; a lost old holder cannot overwrite the next owner',async()=>{
 const {file,store}=await fixture();let holder;
 const lease=await acquireDesktopOwner(file+'.owner',{spawnProcess:(...args)=>{holder=spawn(...args);return holder;}});
 try{
  await lease.put(TASK_KEY,{message:'旧订单结果未知',pending:{action:'submitOrder'}});
  const row=JSON.parse(await readFile(file,'utf8'));assert.equal(row.FAKE,'unknown-final-must-stay-unknown');assert.equal(row[TASK_KEY].message,'旧订单结果未知');
  const lost=new Promise(resolve=>lease.onLost(resolve));assert.equal(holder.kill(),true);await lost;assert.equal(lease.owned,false);
  let actions=0;const guarded=guardOwnedApi({scripting:{async executeScript(){actions++;}}},lease);await assert.rejects(guarded.scripting.executeScript({args:[null,{action:'submitOrder'}]}),/LeaseLost/);assert.equal(actions,0);
  const next=await store.acquireOwner();try{await store.put(TASK_KEY,{...row[TASK_KEY],verified:false,owner:'FAKE-next'});const after=await readFile(file);await assert.rejects(lease.put(TASK_KEY,{owner:'FAKE-late-old'}),/LeaseLost/);assert.deepEqual(await readFile(file),after);}finally{await next.release();}
 }finally{await lease.release();}
});
test('C093 a corrupt journal is not overwritten by an owner write',async()=>{
 const {file,store}=await fixture();await writeFile(file,'not-json');const lease=await store.acquireOwner();try{await assert.rejects(store.put(TASK_KEY,{FAKE:true}),/WriteUnconfirmed/);assert.equal(await readFile(file,'utf8'),'not-json');}finally{await lease.release();}
});
