// Private stdin protocol of this own desktop application. No personal browser/profile attachment or credential logging.
import {createInterface} from 'node:readline';import {createRequire} from 'node:module';
import {join} from 'node:path';import {homedir} from 'node:os';
import {DesktopBrowserApi} from './browser-api.mjs';import {DesktopCheckoutRuntime} from './checkout-runtime.mjs';import {DesktopTaskStore} from './task-store.mjs';
import {AuthContinuation} from './auth-continuation.mjs';
const emit=v=>process.stdout.write(JSON.stringify({scope:'desktop-pro-checkout',...v})+'\n');
const errors={DesktopLegacyHandoffRequired:'需要导入原任务；未打开购买浏览器。',DesktopLegacyResultStillUnconfirmed:'原任务仍有未知动作，只能核对，未开始新购买。',DesktopHandoffPermanentlyRevokedSource:'已交接记录不能恢复原购买权限，未发购买动作。',DesktopLegacyFinalHistoryUnconfirmed:'原记录含最终订单事实，需要核对；未开始新购买。',DesktopOwnerHeldOrUnconfirmed:'另一执行器或未确认的记录正在持有任务。',DesktopSessionAlreadyRunning:'当前执行尚未结束，未再次开始。',DesktopFinalConsentNotCurrent:'当前订单复核或条款确认已失效，未重复提交。',DesktopContextIdentityUnconfirmed:'浏览器与旧任务不同，未恢复旧购买权限。'};
let browser,context,closing=false;const store=new DesktopTaskStore(join(process.cwd(),'.local/desktop/task.json'));
const runtime=new DesktopCheckoutRuntime({store,onState:s=>emit({type:'progress',...s}),launch:async()=>{
 const {chromium}=createRequire(import.meta.url)(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
 try{browser=await chromium.launch({channel:'chrome',headless:false});context=await browser.newContext({serviceWorkers:'block'});}
 catch(error){try{await context?.close();}finally{await browser?.close();}throw error;}
 return {api:new DesktopBrowserApi(context,{publicOnly:false}),close:async()=>{try{await context?.close();}finally{await browser?.close();}}};
}});
try{
 const initial=await runtime.open();emit({type:'ready',readOnly:initial.legacyReadOnly===true,message:'程序已读取保留记录并打开官网窗口；旧未知动作保持，不自动重复。'});
 const input=createInterface({input:process.stdin});let active=false;
 const watch=new AuthContinuation({observe:()=>runtime.observe(),isBusy:()=>closing||active,onStopped:why=>emit({type:'blocked',message:why==='expired'?'登录等待已暂停；完成官网验证后可继续原任务，不重复结账。':'登录后的页面未确认，已停止自动推进；旧结账记录保持。'})});
 async function advance(c){
  const result=await runtime.advance({checkoutApproved:c.checkoutApproved===true,newContextConfirmed:c.newContextConfirmed===true,privatePickupData:c.privatePickupData??{}});
  emit({type:'result',state:result.state,phase:result.phase,realOrderVerified:result.realOrderVerified===true,reviewReady:!!runtime.finalDescriptor});
  if(result.phase==='AUTH'&&result.state==='NEEDS_USER'){
   watch.start(async()=>{active=true;try{await advance(c);}catch(error){emit({type:'blocked',message:errors[error?.message]??'登录后的推进未确认，旧动作保留，不自动重试。'});}finally{active=false;}});
  }
  return result;
 }
 input.on('line',async line=>{
  if(line.length>12000||closing)return;let c;try{c=JSON.parse(line);}catch{return;}
  if(c?.action==='stop'){closing=true;watch.stop();input.close();try{await runtime.close();}finally{emit({type:'closed',cleanupConfirmed:runtime.cleanupConfirmed});process.stdin.destroy();}return;}
  if(active||watch.reading){emit({type:'blocked',message:'当前执行尚未结束，未再次发动作。'});return;}
  if(!['observe','reconcile','advance','submit'].includes(c?.action))return;
  watch.stop();active=true;
  try{
   if(c.action==='advance')await advance(c);
   else{const result=c.action==='observe'?await runtime.observe():c.action==='reconcile'?await runtime.reconcile():await runtime.submit({termsAccepted:c.termsAccepted===true,existingOrdersChecked:c.existingOrdersChecked===true,noExtras:c.noExtras===true});emit({type:'result',state:result.state,phase:result.phase,readOnly:c.action==='reconcile',realOrderVerified:result.realOrderVerified===true,reviewReady:!!runtime.finalDescriptor});}
  }catch(error){emit({type:'blocked',message:errors[error?.message]??'本次推进未确认；旧记录保持，未自动重试。'});}finally{active=false;}
 });
 await new Promise(resolve=>input.once('close',resolve));watch.stop();
}catch(error){emit({type:'blocked',message:errors[error?.message]??'结账入口未确认，旧任务保持；未重新开始购买。'});process.exitCode=1;}
finally{try{await runtime.close();}catch{process.exitCode=2;emit({type:'blocked',message:'浏览器清理未确认，保留任务锁，不得再启动。'});} }
