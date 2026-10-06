import {observeExistingChromeBag} from './desktop-readonly.js';
const HOST='com.applebuy.readonly';
export function nativeFailureReason(error){
 const message=String(error?.message??'').toLowerCase();
 if(message.includes('not found'))return 'HOST_NOT_FOUND';
 if(message.includes('forbidden')||message.includes('not allowed'))return 'HOST_FORBIDDEN';
 if(message.includes('failed to start'))return 'HOST_START_FAILED';
 if(message.includes('exited'))return 'HOST_EXITED';
 return 'CONNECT_UNCONFIRMED';
}
export function nativeConnectionText(reason){
 const labels={PERMISSION_MISSING:'Chrome 本机通信权限尚未生效',PERMISSION_REQUEST_FAILED:'Chrome 本机通信权限申请失败',PERMISSION_NOT_GRANTED:'Chrome 本机通信权限未允许',PERMISSION_CHECK_FAILED:'Chrome 本机通信权限查询失败',API_UNAVAILABLE:'当前连接页未加载本机通信接口；请刷新此连接页后再连接',READ_IN_FLIGHT:'原连接的只读核对仍在结束，请先等待',HOST_NOT_FOUND:'Chrome 没有找到已登记的本机主机',HOST_FORBIDDEN:'Chrome 拒绝了当前扩展来源或策略限制',HOST_START_FAILED:'Chrome 无法启动本机主机',HOST_EXITED:'本机主机启动后已退出',CONNECT_UNCONFIRMED:'Chrome 本机连接错误尚未识别'};
 const code=Object.hasOwn(labels,reason)?reason:'CONNECT_UNCONFIRMED';
 return '本机连接停止：'+labels[code]+'；诊断 '+code+'。未开始购买；已发出的只读核对可能已完成。';
}
export function createReadonlyConnection(api,onStatus=()=>{}){
 let port=null,busy=false,connecting=null;
 async function attempt(){
  try{if(!await api.permissions.contains({permissions:['nativeMessaging']}))return {connected:false,reason:'PERMISSION_MISSING'};}catch{return {connected:false,reason:'PERMISSION_CHECK_FAILED'};}
  if(typeof api.runtime?.connectNative!=='function')return {connected:false,reason:'API_UNAVAILABLE'};
  try{port=api.runtime.connectNative(HOST);}catch(error){return {connected:false,reason:nativeFailureReason(error)};}
  const current=port;
  current.onMessage.addListener(async request=>{
   if(current!==port||busy)return;busy=true;
   try{const response=await observeExistingChromeBag(api,request);if(current===port)current.postMessage(response);}catch{}finally{busy=false;}
  });
  current.onDisconnect.addListener(()=>{const reason=nativeFailureReason(api.runtime.lastError);if(current===port){port=null;onStatus(nativeConnectionText(reason));}});
  onStatus('本机连接已申请；请在桌面程序点“读取正常 Chrome 购物袋（只读）”；登录及账户身份未核实。');
  return {connected:true};
 }
 return {connect(){
  if(port)return Promise.resolve({connected:true});
  if(connecting)return connecting;
  if(busy)return Promise.resolve({connected:false,reason:'READ_IN_FLIGHT'});
  // Publish the pending attempt synchronously, before any API call or await.
  connecting=Promise.resolve().then(attempt).finally(()=>{connecting=null;});return connecting;
 }};
}
