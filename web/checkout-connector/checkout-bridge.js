import {createCheckoutNativeLink} from './checkout-native-link.js';
const button=document.getElementById('connect'),purchase=document.getElementById('purchase'),status=document.getElementById('status');let busy=false,link=null;
button.addEventListener('click',async event=>{
 if(!event.isTrusted||location.href!==chrome.runtime.getURL('checkout-bridge.html')||busy||link)return;busy=true;button.disabled=true;
 try{
  if(!await chrome.permissions.request({permissions:['nativeMessaging']})){status.textContent='本机权限未允许；未连接或购买。';return;}
  const allowed=purchase.checked===true;link=createCheckoutNativeLink(chrome,{purchaseAllowed:allowed,onStatus:text=>status.textContent=text});purchase.disabled=true;
  const result=await link.connect();if(!result.connected){link=null;purchase.disabled=false;status.textContent='独立结账通道未连接，原权限和任务保持。';}
 }catch{link=null;purchase.disabled=false;status.textContent='独立结账通道未确认，未开始新购买。';}
 finally{busy=false;button.disabled=!!link;}
});
