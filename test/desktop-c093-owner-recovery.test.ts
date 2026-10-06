// Real OS processes and real private fixture files, with a FAKE task and zero merchant access.
import test from 'node:test';import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';import {once} from 'node:events';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';import {resolve,join} from 'node:path';import {randomUUID} from 'node:crypto';
import {createInterface} from 'node:readline';
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

test('C103 two first-start holders cannot both leave an empty owner marker', {skip:process.platform!=='win32'}, async()=>{
 for(let n=0;n<8;n++){
  const {file}=await fixture();const children=[];
  function launch(mode){
   const child=spawn('python',['-B','test/desktop-c103-owner-fixture.py',resolve('src/desktop/owner_lease.py'),file+'.owner',mode],{cwd:resolve('.'),windowsHide:true,stdio:['pipe','pipe','pipe']});
   child.stderr.resume();const lines=createInterface({input:child.stdout}),queued=[],waiting=[];
   lines.on('line',line=>{const row=JSON.parse(line);if(waiting.length)waiting.shift()(row);else queued.push(row);});
   const ended=once(child,'close');children.push(child);return {child,ended,next:()=>queued.length?Promise.resolve(queued.shift()):new Promise(yes=>waiting.push(yes))};
  }
  let a,b;
  try{
   a=launch('first');const first=await a.next();b=launch('second');let left=first,right=await b.next();
   if(first.fixture==='created-empty'){
    assert.equal(right.fixture,'second-lock-held');a.child.stdin.write('continue\n');left=await a.next();b.child.stdin.write('continue\n');right=await b.next();
   }
   assert.equal(Number(left.owned===true)+Number(right.owned===true),1);
  }finally{
   for(const child of children)if(child.exitCode===null&&child.signalCode===null)child.stdin.end('release\n');
   await Promise.all(children.map(child=>child.exitCode!==null?Promise.resolve():once(child,'close')));
  }
  assert.equal(await readFile(file+'.owner','utf8'),'APPLEBUY-OS-LEASE-v1\n');
 }
});

for(const existing of [false,true])test('C103 escaped lone surrogate remains writable and no temporary file remains; existing='+existing,async()=>{
 const {file,store}=await fixture();if(existing)await writeFile(file,JSON.stringify({FAKE:'retained',escaped:'\ud800'}));
 const lease=await store.acquireOwner();try{
  await store.put(TASK_KEY,{FAKE:'only fixture',value:'\ud800',chinese:'旧结果未知'});
  const value=JSON.parse(await readFile(file,'utf8'));assert.equal(value[TASK_KEY].value,'\ud800');assert.equal(value[TASK_KEY].chinese,'旧结果未知');if(existing)assert.equal(value.escaped,'\ud800');
  assert.equal((await readdir(resolve(file,'..'))).filter(n=>n.endsWith('.tmp')).length,0);
 }finally{await lease.release();}
});

test('C103 replacement failure preserves the journal and cleans only its own temporary file',async()=>{
 const {file,bytes}=await fixture();const lease=await acquireDesktopOwner(file+'.owner',{spawnProcess:(cmd,args,options)=>spawn(cmd,['-B','test/desktop-c103-owner-fixture.py',resolve('src/desktop/owner_lease.py'),file+'.owner','replace-failure'],options)});
 try{await assert.rejects(lease.put(TASK_KEY,{FAKE:'replacement failure'}),/WriteUnconfirmed/);assert.deepEqual(await readFile(file),bytes);assert.equal((await readdir(resolve(file,'..'))).filter(n=>n.endsWith('.tmp')).length,0);}finally{await lease.release();}
});
