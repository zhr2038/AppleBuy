import {inspectPublicEntry} from './read-entry.js';
const status=document.getElementById('status'),result=document.getElementById('result'),read=document.getElementById('read');
read.addEventListener('click',async()=>{
  read.disabled=true;status.textContent='正在只读核对当前商品页';
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    const url=new URL(tab?.url??'');
    const allowed=['/shop/buy-iphone/iphone-18-pro','/shop/buy-iphone/iphone-duo','/shop/buy-iphone/iphone-duo/mk2m4ch/a'];
    if(url.protocol!=='https:'||url.hostname!=='www.apple.com.cn'||!allowed.includes(url.pathname.replace(/\/$/,'')))throw new Error('OutsidePublicEntry');
    const replies=await chrome.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},world:'ISOLATED',func:inspectPublicEntry});
    const report=replies.length===1&&replies[0].frameId===0?replies[0].result:null;
    if(!report||report.scope!=='public-entry-read-only')throw new Error('UnknownDocument');
    result.textContent=JSON.stringify(report,null,2);
    status.textContent=report.state==='observed'?'配置已读取。此组件不能下单。':'页面无法安全识别：停止读取';
  }catch{status.textContent='当前页面或临时权限无法核实：停止读取，不执行任何官网动作';result.textContent='';}
  finally{read.disabled=false;}
});
