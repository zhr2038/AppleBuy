// Local private task ledger. Never reads browser storage; the operator explicitly exports a revoked old task.
import {mkdir,readFile,lstat,realpath,open,link,unlink} from 'node:fs/promises';
import {dirname,resolve,basename,join} from 'node:path';import {createHash,randomUUID} from 'node:crypto';
import {TASK_KEY,validStored,canonicalJson} from '../../web/checkout-connector/job.js';
import {PRO_PLAN} from './browser-session.mjs';
import {acquireDesktopOwner} from './owner-lease.mjs';
import {OWNER_VALUE_BYTES} from './owner-write-frames.mjs';
export class DesktopTaskStore {
 constructor(file){this.file=resolve(file);this.ownerFile=this.file+'.owner';}
 async get(key){try{const value=JSON.parse(await readFile(this.file,'utf8'));return value[key]??null;}catch(e){if(e.code==='ENOENT')return null;throw Error('DesktopLedgerUnconfirmed');}}
 async put(key,value){if(key!==TASK_KEY||this.lease?.owned!==true)throw Error('DesktopOwnerLeaseLost');return this.lease.put(key,value);}
 async acquireOwner(){await mkdir(dirname(this.file),{recursive:true});const lease=await acquireDesktopOwner(this.ownerFile);this.lease=lease;return lease;}
 async archiveDirectory(){
  if(this.lease?.owned!==true)throw Error('DesktopOwnerLeaseLost');
  const base=await realpath(dirname(this.file)),dir=join(base,basename(this.file)+'.archives');await mkdir(dir,{recursive:false}).catch(e=>{if(e.code!=='EEXIST')throw e;});
  const stat=await lstat(dir);if(!stat.isDirectory()||stat.isSymbolicLink()||(await realpath(dir)).toLowerCase()!==dir.toLowerCase())throw Error('DesktopArchiveUnconfirmed');return dir;
 }
 async readArchive(digest){
  if(!/^[a-f0-9]{64}$/.test(digest))throw Error('DesktopArchiveUnconfirmed');
  const file=join(await this.archiveDirectory(),digest+'.json'),stat=await lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>OWNER_VALUE_BYTES)throw Error('DesktopArchiveUnconfirmed');
  const bytes=await readFile(file);if(createHash('sha256').update(bytes).digest('hex')!==digest)throw Error('DesktopArchiveUnconfirmed');
  const row=JSON.parse(bytes.toString('utf8'));if(!validStored(row)||canonicalJson(row)!==bytes.toString('utf8'))throw Error('DesktopArchiveUnconfirmed');return row;
 }
 async archiveSnapshot(row){
  if(!validStored(row))throw Error('DesktopArchiveUnconfirmed');const bytes=Buffer.from(canonicalJson(row),'utf8');if(bytes.length>OWNER_VALUE_BYTES)throw Error('DesktopArchiveUnconfirmed');
  const digest=createHash('sha256').update(bytes).digest('hex'),dir=await this.archiveDirectory(),file=join(dir,digest+'.json'),temporary=join(dir,randomUUID()+'.tmp');let handle;
  try{handle=await open(temporary,'wx');await handle.writeFile(bytes);await handle.sync();await handle.close();handle=null;if(this.lease?.owned!==true)throw Error('DesktopOwnerLeaseLost');
   try{await link(temporary,file);}catch(e){if(e.code!=='EEXIST')throw e;}
   if(canonicalJson(await this.readArchive(digest))!==canonicalJson(row))throw Error('DesktopArchiveUnconfirmed');return digest;
  }finally{await handle?.close();await unlink(temporary).catch(e=>{if(e.code!=='ENOENT')throw e;});}
 }
 async importHandoff(envelope){
  const row=envelope?.record;
  if(envelope?.schema!=='applebuy-desktop-handoff/v1'||envelope.sourceOwnerRevoked!==true||!validStored(row)||row.reconcileOnly!==true||row.desktopHandoff?.schema!=='applebuy-desktop-handoff/v1'||!row.desktopHandoff.originalSnapshot||canonicalJson(row.plan)!==canonicalJson(PRO_PLAN))throw Error('DesktopHandoffUnconfirmed');
  const lease=await this.acquireOwner();try{const old=await this.get(TASK_KEY);if(old&&canonicalJson(old)!==canonicalJson(row))throw Error('DesktopTaskAlreadyPresent');await this.put(TASK_KEY,structuredClone(row));return {imported:true,pendingAction:row.pending?.action??null,readOnly:true,unknownPreserved:true,fingerprint:createHash('sha256').update(canonicalJson(row)).digest('hex')};}finally{await lease.release();}
 }
}
