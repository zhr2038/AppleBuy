import {createReadonlyConnection} from './desktop-link.js';
const status=document.getElementById('status');const link=createReadonlyConnection(chrome,text=>{status.textContent=text;});
document.getElementById('connect').addEventListener('click',async event=>{
 if(!event.isTrusted||location.href!==chrome.runtime.getURL('desktop-bridge.html'))return;
 try{const allowed=await chrome.permissions.request({permissions:['nativeMessaging']});if(!allowed){status.textContent='本机连接权限未允许；没有读取官网。';return;}const result=await link.connect();if(!result.connected)status.textContent='本机连接未确认；请先完成已审查的本机登记。';}catch{status.textContent='本机连接未确认；没有开始购买。';}
});
