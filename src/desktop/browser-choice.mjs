// Normal installed-browser selection; never copies profiles or weakens browser/site security.
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
export function browserChoice(args=[]){
 if(args.length===0)return 'chrome';
 if(args.length!==1||!/^--browser=(chrome|msedge)$/.test(args[0]))throw Error('DesktopBrowserChoiceUnconfirmed');
 return args[0].slice('--browser='.length);
}
export function launchOptions(channel){
 if(!['chrome','msedge'].includes(channel))throw Error('DesktopBrowserChoiceUnconfirmed');
 return {channel,headless:false};
}
export function browserConfig(args=[]){
 const keep=args.filter(v=>v==='--keep-session');if(keep.length>1)throw Error('DesktopBrowserChoiceUnconfirmed');
 return {channel:browserChoice(args.filter(v=>v!=='--keep-session')),keepSession:keep.length===1};
}
export function ownProfile(channel){
 launchOptions(channel);
 return join(fileURLToPath(new URL('../../',import.meta.url)),'.local','desktop','browser-profiles',channel);
}
export async function createOwnedBrowser(chromium,{channel,keepSession=false},report){
 if(typeof keepSession!=='boolean')throw Error('DesktopBrowserChoiceUnconfirmed');
 const options=launchOptions(channel);let browser,context,detach;
 try{
  if(keepSession)context=await chromium.launchPersistentContext(ownProfile(channel),options);
  else{browser=await chromium.launch(options);context=await browser.newContext();}
  detach=watchFailures(context,report);
  return {context,close:async()=>{detach();try{await context.close();}finally{await browser?.close();}}};
 }catch(error){try{await context?.close();}finally{await browser?.close();}throw error;}
}
export function safeFailure(response){
 try{
  const status=response.status();if(!Number.isInteger(status)||status<400||status>599)return null;
  const url=new URL(response.url());const host=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||url.username||url.password||!(host==='www.apple.com.cn'||/^secure[0-9]+\.www\.apple\.com\.cn$/.test(host)||host==='idmsa.apple.com.cn'||host==='appleid.cdn-apple.com'))return null;
  return {host,status};
 }catch{return null;}
}
export function watchFailures(context,emit){
 let active=true;const seen=new Set();
 const handler=response=>{if(!active||seen.size>=16)return;const value=safeFailure(response);if(!value)return;const key=value.host+':'+value.status;if(seen.has(key))return;seen.add(key);emit(value);};
 context.on('response',handler);
 return ()=>{active=false;context.off('response',handler);};
}
