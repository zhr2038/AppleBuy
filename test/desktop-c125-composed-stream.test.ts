// Real Windows broker/host stdio and pipe + production Runtime/Job/Port/Peer, FAKE Chrome/merchant/authority only.
import test from 'node:test';import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';import {mkdir,writeFile,readFile,access} from 'node:fs/promises';import {resolve,join} from 'node:path';
import {DesktopTaskStore} from '../src/desktop/task-store.mjs';import {launchNativeCheckout} from '../src/desktop/native-checkout-channel.mjs';
import {world} from './fixtures/c121-native-world.mjs';import {TASK_KEY} from '../web/checkout-connector/job.js';
for(const fromReadonlyEmpty of [false,true])test('C125 composed Windows native stream reaches one FAKE unpaid detail after refusal with real owner; empty successor='+fromReadonlyEmpty, {skip:process.platform!=='win32'}, async()=>{
 const folder=resolve('.local/test-runs/c125-stream-'+crypto.randomUUID()),contextId='FAKE-C123-native-context';await mkdir(join(folder,'.local/desktop'),{recursive:true});await writeFile(join(folder,'.local/desktop/checkout-native-config.json'),JSON.stringify({extensionId:'a'.repeat(32),hostName:'com.applebuy.checkout'}));
 const f=world({refuse:true,contextId}),file=join(folder,'task.json');let original;
 if(fromReadonlyEmpty){original={...structuredClone(f.w.row),state:'NEEDS_VERIFICATION',pending:{action:'addBag',id:'FAKE-old-unknown',documentId:'FAKE-old',deadline:0},bagAddStarted:true,resourceWritten:true};f.w.row={...structuredClone(original),reconcileOnly:true,desktopHandoff:{schema:'applebuy-desktop-handoff/v1',id:'FAKE-handoff',originalSnapshot:structuredClone(original)}};original=structuredClone(f.w.row);}
 await writeFile(file,JSON.stringify({[TASK_KEY]:f.w.row}));const actual=new DesktopTaskStore(file);
 f.runtime.store={get:key=>actual.get(key),put:async(key,row)=>{await actual.put(key,row);f.w.row=structuredClone(row);},acquireOwner:()=>actual.acquireOwner()};
 let host,channel,frames=0,buffer=Buffer.alloc(0),fault=null;
 try{
  channel=launchNativeCheckout({contextId,spawnProcess:()=>spawn('python',['-B','test/desktop-c123-stream-fixture.py','broker',folder],{cwd:resolve('.'),windowsHide:true,stdio:['pipe','pipe','pipe']})});
  const ticket=join(folder,'.local/desktop/checkout-native-ticket.json');for(let n=0;n<100;n++){try{await access(ticket);break;}catch{await new Promise(r=>setTimeout(r,20));}}
  host=spawn('python',['-B','test/desktop-c123-stream-fixture.py','host',folder],{cwd:resolve('.'),windowsHide:true,stdio:['pipe','pipe','pipe']});host.stderr.resume();
  host.stdout.on('data',chunk=>{
   buffer=Buffer.concat([buffer,chunk]);
   while(buffer.length>=4){const size=buffer.readUInt32LE(0);if(size>64000){fault=Error('FAKE frame over limit');host.kill();return;}if(buffer.length<4+size)return;const request=JSON.parse(buffer.subarray(4,4+size).toString('utf8'));buffer=buffer.subarray(4+size);frames++;
    f.peer.receive(request).then(reply=>{const body=Buffer.from(JSON.stringify(reply)),header=Buffer.alloc(4);header.writeUInt32LE(body.length);host.stdin.write(Buffer.concat([header,body]));}).catch(error=>fault=error);
   }
  });
  f.runtime.launch=async()=>channel;await f.runtime.open();const ready=fromReadonlyEmpty?await f.runtime.restartEmpty({approved:true,accountConfirmedByUser:true,oldCheckoutStoppedByUser:true,existingOrdersCheckedByUser:true}):await f.runtime.advance({checkoutApproved:true,newContextConfirmed:true});assert.equal(ready.phase,'REVIEW');assert.equal(f.w.row.refusals,1);
  const unpaid=await f.runtime.submit({termsAccepted:true,existingOrdersChecked:true,noExtras:true});assert.equal(unpaid.state,'CONFIRMED_UNPAID');assert.equal(f.w.commands.filter(a=>a==='addBag').length,1);assert.equal(f.w.commands.filter(a=>a==='checkout').length,1);assert.equal(f.w.commands.filter(a=>a==='chooseSlot').length,2);assert.equal(f.w.commands.filter(a=>a==='submitOrder').length,1);assert.equal(f.w.slot.date,'2099年1月2日');assert.ok(frames>30);assert.equal(fault,null);await f.runtime.close();assert.equal(f.w.tabs.size,0);
  const stored=JSON.parse(await readFile(file,'utf8'))[TASK_KEY];assert.equal(stored.state,'CONFIRMED_UNPAID');assert.equal(stored.finalIntent.sent,true);
  if(fromReadonlyEmpty){assert.deepEqual(stored.desktopEmptyRestart.originalTask,original);assert.deepEqual(stored.retiredHistory[0].desktopEmptyArchive.originalSnapshot,original);assert.equal(stored.desktopEmptyRestart.originalTask.pending.action,'addBag');}
 }finally{
  try{await f.runtime.close();}catch{}
  if(channel&&f.runtime.cleanupConfirmed!==true){try{await channel.close();}catch{}}
  if(host){host.stdin.end();await new Promise(resolve=>{if(host.exitCode!==null)return resolve();const timer=setTimeout(()=>host.kill(),3000);host.once('close',()=>{clearTimeout(timer);resolve();});});}
 }
});
