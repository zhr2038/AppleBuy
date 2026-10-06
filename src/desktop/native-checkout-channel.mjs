// Prepared distinct host transport. Caller must own/contain this process tree; no registration or GUI activation.
import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';import {NativeCheckoutApi} from './native-checkout-api.mjs';
const ROOT=fileURLToPath(new URL('../../',import.meta.url)),BROKER=fileURLToPath(new URL('./checkout_native_broker.py',import.meta.url));
export function launchNativeCheckout({spawnProcess=spawn,contextId=crypto.randomUUID()}={}){
 const child=spawnProcess('python',['-B','-X','utf8',BROKER,contextId],{cwd:ROOT,windowsHide:true,stdio:['pipe','pipe','pipe']});child.stderr.resume();child.stdin.on('error',()=>{});
 let pending=null,ended=false;const terminal=new Promise(resolve=>child.once('close',()=>{ended=true;pending?.no(Error('NativeCheckoutDeliveryUnknown'));pending=null;resolve();}));child.once('error',()=>{ended=true;pending?.no(Error('NativeCheckoutDeliveryUnknown'));pending=null;});
 const lines=createInterface({input:child.stdout});lines.on('line',text=>{
  if(!pending)return;if(Buffer.byteLength(text)>64000){pending.no(Error('NativeCheckoutDeliveryUnknown'));pending=null;return;}
  let row;try{row=JSON.parse(text);}catch{pending.no(Error('NativeCheckoutDeliveryUnknown'));pending=null;return;}
  const current=pending;pending=null;current.yes(row);
 });
 const api=new NativeCheckoutApi({contextId,exchange:q=>new Promise((yes,no)=>{
  if(ended||pending){no(Error('NativeCheckoutDeliveryUnknown'));return;}pending={yes,no};child.stdin.write(JSON.stringify(q)+'\n',error=>{if(error){pending?.no(Error('NativeCheckoutDeliveryUnknown'));pending=null;}});
 })});
 async function stop(){child.stdin.end();let timer;try{await Promise.race([terminal,new Promise((_,no)=>timer=setTimeout(()=>no(Error('NativeCheckoutCleanupUnconfirmed')),3000))]);}catch{child.kill();let killTimer;try{await Promise.race([terminal,new Promise((_,no)=>killTimer=setTimeout(()=>no(Error('NativeCheckoutCleanupUnconfirmed')),3000))]);}finally{clearTimeout(killTimer);}}finally{clearTimeout(timer);lines.close();}}
 return {api,async close(){let failure;try{await api.close();}catch(error){failure=error;}await stop();if(failure)throw failure;}};
}
