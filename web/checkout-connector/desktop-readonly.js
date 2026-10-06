// The user-approved native connection reads only its own new official bag tab. Never cookies or extension-page control.
import {merchantDocument} from './page-program.js';
import {NO_EXTRAS} from './job.js';
const PLAN={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{...NO_EXTRAS}};
export function readonlyRequest(request){
 if(!request||Object.keys(request).sort().join(',')!=='nonce,operation,schema'||request.schema!=='applebuy-chrome-readonly/v1'||request.operation!=='observe-bag'||!/^([0-9a-f]{32})$/.test(request.nonce??''))throw Error('ReadonlyOperationNotAllowed');
 return request.nonce;
}
export function readonlyUrl(raw){try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&(u.hostname==='www.apple.com.cn'||/^secure[0-9]+\.www\.apple\.com\.cn$/.test(u.hostname))&&/^\/shop\/(?:bag|signIn(?:\/orders)?)\/?$/.test(u.pathname);}catch{return false;}}
export async function observeExistingChromeBag(api,request,{wait=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const nonce=readonlyRequest(request);let tab=null,phase='UNKNOWN',closed=false,previous=null;
 try{
  if(!await api.permissions.contains({origins:['https://www.apple.com.cn/*']}))throw Error('HostPermissionMissing');
  tab=await api.tabs.create({url:'https://www.apple.com.cn/shop/bag',active:false});
  if(!Number.isSafeInteger(tab?.id))throw Error('TabUnconfirmed');
  for(let n=0;n<30;n++){
   await wait(200);const current=await api.tabs.get(tab.id);
   if(current.status!=='complete'||!readonlyUrl(current.url)){previous=null;continue;}
   if(!await api.permissions.contains({origins:[new URL(current.url).origin+'/*']}))throw Error('HostPermissionMissing');
   const rows=await api.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},world:'ISOLATED',func:merchantDocument,args:[PLAN]});
   if(rows?.length!==1||rows[0].frameId!==0||!rows[0].documentId||!rows[0].result){previous=null;continue;}
   const page=rows[0].result;if(page.schema!=='applebuy-merchant-read/v1'||!['EMPTY_BAG','BAG','AUTH'].includes(page.phase)||page.phase!=='AUTH'&&page.verifiedStep!==true){previous=null;continue;}
   const key=JSON.stringify([rows[0].documentId,page.phase,page.purchase??null,page.extras??null]);
   if(previous===key){phase=page.phase;break;}previous=key;
  }
 }catch{phase='UNKNOWN';}
 finally{if(Number.isSafeInteger(tab?.id)){try{await api.tabs.remove(tab.id);closed=true;}catch{}}}
 if(!closed)phase='UNKNOWN';
 return {schema:'applebuy-chrome-readonly/v1',nonce,phase,readOnly:true,mutationCount:0,tabClosed:closed};
}
