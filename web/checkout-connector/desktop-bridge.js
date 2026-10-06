import {createReadonlyConnection,nativeConnectionText} from './desktop-link.js';
export function createDesktopBridge(api,{button,setStatus,currentUrl}){
 let busy=false;const link=createReadonlyConnection(api,setStatus);
 return async event=>{
  if(!event.isTrusted||currentUrl()!==api.runtime.getURL('desktop-bridge.html')||busy)return;
  busy=true;button.disabled=true;
  try{
   let allowed;try{allowed=await api.permissions.request({permissions:['nativeMessaging']});}catch{setStatus(nativeConnectionText('PERMISSION_REQUEST_FAILED'));return;}
   if(!allowed){setStatus(nativeConnectionText('PERMISSION_NOT_GRANTED'));return;}
   const result=await link.connect();if(!result.connected)setStatus(nativeConnectionText(result.reason));
  }catch{setStatus(nativeConnectionText('CONNECT_UNCONFIRMED'));}
  finally{busy=false;button.disabled=false;}
 };
}
if(typeof document!=='undefined'&&typeof chrome!=='undefined'){
 const status=document.getElementById('status'),button=document.getElementById('connect');
 button.addEventListener('click',createDesktopBridge(chrome,{button,setStatus:text=>{status.textContent=text;},currentUrl:()=>location.href}));
}
