// Unlinked prepared checkout connector. Existing readonly connector/host is not changed.
import {CheckoutRpcPeer} from './checkout-rpc-peer.js';import {CHECKOUT_RPC} from './checkout-rpc-contract.js';
export function createCheckoutNativeLink(api,{purchaseAllowed=false,onStatus=()=>{}}={}){
 let port=null,connecting=null,peer=null;
 async function connect(){
  if(port)return {connected:true};if(connecting)return connecting;
  connecting=Promise.resolve().then(async()=>{
   if(!await api.permissions.contains({permissions:['nativeMessaging']}))return {connected:false};
   port=api.runtime.connectNative('com.applebuy.checkout');const current=port;
   current.onMessage.addListener(async message=>{
    if(current!==port||message?.schema!==CHECKOUT_RPC||message.kind!=='request')return;
    try{
     if(!peer)peer=new CheckoutRpcPeer({api,contextId:message.contextId,purchaseAllowed});
     const active=peer,reply=await active.receive(message);if(current===port)current.postMessage(reply);
     if(active.closed&&peer===active)peer=null;
    }catch{onStatus('购买通道消息未确认；没有发出新的购买动作。');}
   });
   current.onDisconnect.addListener(()=>{void api.runtime.lastError;if(current===port){port=null;onStatus('购买通道已断开；已发送动作结果仍可能未知，请勿重新开始。');}});
   onStatus('购买通道已申请；未开始购买，需在桌面程序单次确认。');return {connected:true};
  }).finally(()=>connecting=null);return connecting;
 }
 return {connect};
}
