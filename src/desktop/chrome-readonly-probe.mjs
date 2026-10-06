// GUI-owned read-only exchange under the SAME kernel task owner. No SDK/CDP/personal profile access.
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';import {resolve} from 'node:path';
import {DesktopTaskStore} from './task-store.mjs';
import {TASK_KEY,validStored} from '../../web/checkout-connector/job.js';
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
export async function runChromeReadonlyProbe({store=new DesktopTaskStore(resolve(ROOT,'.local/desktop/task.json')),spawnProcess=spawn}={}){
 let lease,child,closed;const failure={scope:'existing-chrome-readonly',phase:'UNKNOWN',readOnly:true,mutationCount:0,confirmed:false,reason:'normal-chrome-connection-unconfirmed; old record preserved'};
 try{
  lease=await store.acquireOwner();const old=await store.get(TASK_KEY);
  if(!old||!validStored(old)||old.reconcileOnly!==true||lease.owned!==true)throw Error('ReadonlyHandoffRequired');
  child=spawnProcess('python',['-B','-X','utf8',fileURLToPath(new URL('./chrome_native_broker.py',import.meta.url))],{cwd:ROOT,windowsHide:true,stdio:['pipe','pipe','pipe']});
  closed=new Promise((yes,no)=>{child.once('close',code=>yes(code));child.once('error',no);});
  child.stdin.end();child.stderr.resume();
  let stdout='',bytes=0;child.stdout.on('data',data=>{bytes+=Buffer.byteLength(data);if(bytes>10000){child.kill();return;}stdout+=data;});
  const code=await closed;
  const rows=stdout.split('\n').filter(Boolean).map(x=>JSON.parse(x)),row=rows.at(-1);
  if(code!==0||bytes>10000||lease.owned!==true||!row||row.scope!=='existing-chrome-readonly'||row.readOnly!==true||row.mutationCount!==0||row.tabClosed!==true||!['EMPTY_BAG','BAG','AUTH','UNKNOWN'].includes(row.phase))throw Error('ChromeReadUnconfirmed');
  const current=await store.get(TASK_KEY);if(lease.owned!==true||JSON.stringify(current)!==JSON.stringify(old))throw Error('OriginalRecordChanged');
  return {scope:'existing-chrome-readonly',phase:row.phase,readOnly:true,mutationCount:0,tabClosed:true,oldRecordUnchanged:true,personalProfileCopied:false};
 }catch{return failure;}
 finally{if(child?.exitCode===null){child.kill();try{await closed;}catch{}}await lease?.release();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const result=await runChromeReadonlyProbe();console.log(JSON.stringify(result));if(result.confirmed===false)process.exitCode=1;}
