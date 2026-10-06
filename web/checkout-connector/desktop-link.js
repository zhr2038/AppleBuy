import {observeExistingChromeBag} from './desktop-readonly.js';
const HOST='com.applebuy.readonly';
export function createReadonlyConnection(api,onStatus=()=>{}){
 let port=null,busy=false;
 return {async connect(){
  if(port)return {connected:true};
  if(!await api.permissions.contains({permissions:['nativeMessaging']}))return {connected:false};
  try{port=api.runtime.connectNative(HOST);}catch{return {connected:false};}
  const current=port;
  current.onMessage.addListener(async request=>{
   if(current!==port||busy)return;busy=true;
   try{const response=await observeExistingChromeBag(api,request);if(current===port)current.postMessage(response);}catch{}finally{busy=false;}
  });
  current.onDisconnect.addListener(()=>{if(current===port){port=null;onStatus('本机连接已断开；未开始购买。');}});
  onStatus('本机连接已申请；请在桌面程序点“读取正常 Chrome 购物袋（只读）”；登录及账户身份未核实。');
  return {connected:true};
 }};
}
