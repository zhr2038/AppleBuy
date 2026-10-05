// Local private task ledger. Never reads browser storage; the operator explicitly exports a revoked old task.
import {mkdir,readFile,writeFile,rename,open,unlink} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';import {randomUUID,createHash} from 'node:crypto';
import {TASK_KEY,validStored,canonicalJson} from '../../web/checkout-connector/job.js';
import {PRO_PLAN} from './browser-session.mjs';
export class DesktopTaskStore {
 constructor(file){this.file=resolve(file);this.ownerFile=this.file+'.owner';}
 async get(key){try{const value=JSON.parse(await readFile(this.file,'utf8'));return value[key]??null;}catch(e){if(e.code==='ENOENT')return null;throw Error('DesktopLedgerUnconfirmed');}}
 async put(key,value){await mkdir(dirname(this.file),{recursive:true});let all={};try{all=JSON.parse(await readFile(this.file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw Error('DesktopLedgerUnconfirmed');}const tmp=this.file+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify({...all,[key]:value}),{encoding:'utf8',flag:'wx'});await rename(tmp,this.file);}
 async acquireOwner(){await mkdir(dirname(this.file),{recursive:true});const id=randomUUID();let handle;try{handle=await open(this.ownerFile,'wx');await handle.writeFile(JSON.stringify({id,pid:process.pid}));}catch{throw Error('DesktopOwnerHeldOrUnconfirmed');}
  let released=false;return {owned:true,release:async()=>{if(released)return;const value=JSON.parse(await readFile(this.ownerFile,'utf8'));if(value.id!==id)throw Error('DesktopOwnerChanged');await handle.close();await unlink(this.ownerFile);released=true;}};
 }
 async importHandoff(envelope){
  const row=envelope?.record;
  if(envelope?.schema!=='applebuy-desktop-handoff/v1'||envelope.sourceOwnerRevoked!==true||!validStored(row)||row.reconcileOnly!==true||row.desktopHandoff?.schema!=='applebuy-desktop-handoff/v1'||!row.desktopHandoff.originalSnapshot||canonicalJson(row.plan)!==canonicalJson(PRO_PLAN))throw Error('DesktopHandoffUnconfirmed');
  const lease=await this.acquireOwner();try{const old=await this.get(TASK_KEY);if(old&&canonicalJson(old)!==canonicalJson(row))throw Error('DesktopTaskAlreadyPresent');await this.put(TASK_KEY,structuredClone(row));return {imported:true,pendingAction:row.pending?.action??null,readOnly:true,unknownPreserved:true,fingerprint:createHash('sha256').update(canonicalJson(row)).digest('hex')};}finally{await lease.release();}
 }
}
