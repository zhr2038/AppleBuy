// The own Python child holds a kernel lock, never a PID/TTL heuristic. Its pipe belongs only to this process.
import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';
import {ownerWriteFrames} from './owner-write-frames.mjs';
const HELPER=fileURLToPath(new URL('./owner_lease.py',import.meta.url));
export async function acquireDesktopOwner(file,{spawnProcess=spawn}={}){
 const child=spawnProcess('python',['-B',HELPER,file],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 child.stderr.resume();child.stdin.on('error',()=>{});
 let active=false,releasing=false,terminal=false,nextId=1,readyYes,readyNo;const listeners=new Set(),pending=new Map();
 const ready=new Promise((yes,no)=>{readyYes=yes;readyNo=no;});
 const exited=new Promise(resolve=>child.once('close',()=>{terminal=true;active=false;readyNo(Error('DesktopOwnerHeldOrUnconfirmed'));for(const p of pending.values())p.no(Error('DesktopOwnerLeaseLost'));pending.clear();if(!releasing)for(const f of listeners){try{f();}catch{}}resolve();}));
 child.once('error',()=>readyNo(Error('DesktopOwnerHeldOrUnconfirmed')));
 const lines=createInterface({input:child.stdout});
 lines.on('line',line=>{if(line.length>2048)return;let v;try{v=JSON.parse(line);}catch{return;}if(v.scope!=='applebuy-owner-lease')return;
  if(Object.hasOwn(v,'owned')){if(v.owned===true){active=true;readyYes();}else readyNo(Error('DesktopOwnerHeldOrUnconfirmed'));return;}
  const p=pending.get(v.id);if(!p){if(pending.size){active=false;for(const q of pending.values())q.no(Error('DesktopOwnerWriteUnconfirmed'));pending.clear();child.stdin.end('release\n');}return;}pending.delete(v.id);v.ok===true?p.yes():p.no(Error('DesktopOwnerWriteUnconfirmed'));
 });
 async function quiesce(){
  child.stdin.end('release\n');
  let timeout;try{await Promise.race([exited,new Promise((_,no)=>timeout=setTimeout(()=>no(Error('DesktopOwnerCleanupUnconfirmed')),3000))]);}
  catch{child.kill();let timer;try{await Promise.race([exited,new Promise((_,no)=>timer=setTimeout(()=>no(Error('DesktopOwnerCleanupUnconfirmed')),3000))]);}finally{clearTimeout(timer);}}
  finally{clearTimeout(timeout);}
 }
 try{
  let timeout;try{await Promise.race([ready,new Promise((_,no)=>timeout=setTimeout(()=>no(Error('DesktopOwnerHeldOrUnconfirmed')),3000))]);}finally{clearTimeout(timeout);}
 }catch(error){releasing=true;await quiesce();throw error;}
 let releasePromise,writeTail=Promise.resolve();
 async function putOnce(key,value){
  if(!active||terminal||releasing)throw Error('DesktopOwnerLeaseLost');const id=nextId++;
  const frames=ownerWriteFrames(key,value,id),first=frames.next();
  await new Promise((yes,no)=>{
   pending.set(id,{yes,no});
   try{for(const line of (function*(){yield first.value;yield*frames;})())child.stdin.write(line,error=>{if(error){pending.delete(id);no(Error('DesktopOwnerLeaseLost'));}});}
   catch(error){pending.delete(id);no(error);}
  });
 }
 return {get owned(){return active&&!terminal&&!releasing&&child.exitCode===null&&child.signalCode===null;},onLost(f){listeners.add(f);return ()=>listeners.delete(f);},
  put(key,value){const running=writeTail.then(()=>putOnce(key,value));writeTail=running.catch(()=>{});return running;},
  release(){if(!releasePromise){releasing=true;active=false;releasePromise=quiesce();}return releasePromise;}};
}

// Every transport dispatch checks the currently held lease, including a command after an awaited page read.
export function guardOwnedApi(api,lease){
 const check=()=>{if(lease?.owned!==true)throw Error('DesktopOwnerLeaseLost');};
 return new Proxy(api,{get(target,name){
  if(['create','createExpiryProbe','executorVersion','r2Exchange','auditOrders'].includes(name))return async(...args)=>{check();return target[name](...args);};
  if(['tabs','permissions','scripting'].includes(name)){const group=target[name];return new Proxy(group,{get(g,k){const fn=g[k];return typeof fn==='function'?async(...args)=>{check();return fn.apply(g,args);}:fn;}});}
  return Reflect.get(target,name,target);
 }});
}
