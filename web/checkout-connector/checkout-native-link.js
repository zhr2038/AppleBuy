// Unlinked prepared checkout connector. Existing readonly connector/host is not changed.
import {CheckoutRpcPeer} from './checkout-rpc-peer.js';import {CHECKOUT_RPC} from './checkout-rpc-contract.js';
export function createCheckoutNativeLink(api,{purchaseAllowed=false,onStatus=()=>{},schedule=(fn,ms)=>setTimeout(fn,ms),cancel=clearTimeout}={}){
 let port=null,connecting=null,peer=null,retries=0,retryTimer=null,stopped=false;
 async function reconnect(){
  if(stopped||port||connecting||retries>=3)return;
  const delay=[1000,3000,8000][retries++];onStatus('购买通道断开，正在尝试恢复连接；保留原任务，不重新下单。');
  retryTimer=schedule(()=>{retryTimer=null;connect().then(r=>{if(!r.connected)reconnect();}).catch(()=>reconnect());},delay);
 }
 async function connect(){
  if(stopped)return {connected:false};if(port)return {connected:true};if(connecting)return connecting;
  connecting=Promise.resolve().then(async()=>{
   if(!await api.permissions.contains({permissions:['nativeMessaging']}))return {connected:false};
   if(stopped)return {connected:false};
   port=api.runtime.connectNative('com.applebuy.checkout');const current=port;
   current.onMessage.addListener(async message=>{
    if(current!==port||message?.schema!==CHECKOUT_RPC||message.kind!=='request')return;
    try{
     if(!peer)peer=new CheckoutRpcPeer({api,contextId:message.contextId,purchaseAllowed});
     const active=peer,reply=await active.receive(message);if(current===port)current.postMessage(reply);
     if(active.closed&&peer===active)peer=null;
    }catch{onStatus('购买通道消息未确认；没有发出新的购买动作。');}
   });
   current.onDisconnect.addListener(()=>{void api.runtime.lastError;if(current===port){const old=peer;old?.browserJob?.stop();port=null;onStatus('购买通道已断开；已发送动作结果仍可能未知，请勿重新开始。');Promise.resolve(old?.browserJob?.current?.promise).finally(()=>{if(peer===old){peer=null;old?.dispose();}reconnect();});}});
   onStatus('购买通道已申请；未开始购买，需在桌面程序单次确认。');return {connected:true};
  }).finally(()=>connecting=null);return connecting;
 }
 return {connect,stop(){stopped=true;if(retryTimer!==null)cancel(retryTimer);retryTimer=null;peer?.browserJob?.stop();port?.disconnect();port=null;}};
}
