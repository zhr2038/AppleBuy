// Private stdin protocol of this own desktop application. No personal browser/profile attachment or credential logging.
import {createInterface} from 'node:readline';import {createRequire} from 'node:module';
import {join} from 'node:path';import {homedir} from 'node:os';
import {DesktopBrowserApi} from './browser-api.mjs';import {DesktopCheckoutRuntime} from './checkout-runtime.mjs';import {DesktopTaskStore} from './task-store.mjs';
import {AuthContinuation} from './auth-continuation.mjs';
import {browserConfig,createOwnedBrowser} from './browser-choice.mjs';
const selectedConfig=browserConfig(process.argv.slice(2)),selectedBrowser=selectedConfig.channel;
const emit=v=>process.stdout.write(JSON.stringify({scope:'desktop-pro-checkout',...v})+'\n');
const errors={DesktopLegacyHandoffRequired:'需要导入原任务；未打开购买浏览器。',DesktopLegacyResultStillUnconfirmed:'原任务仍有未知动作，只能核对，未开始新购买。',DesktopHandoffPermanentlyRevokedSource:'已交接记录不能恢复原购买权限，未发购买动作。',DesktopLegacyFinalHistoryUnconfirmed:'原记录含最终订单事实，需要核对；未开始新购买。',DesktopOwnerHeldOrUnconfirmed:'另一执行器或未确认的记录正在持有任务。',DesktopSessionAlreadyRunning:'当前执行尚未结束，未再次开始。',DesktopFinalConsentNotCurrent:'当前订单复核或条款确认已失效，未重复提交。',DesktopContextIdentityUnconfirmed:'浏览器与旧任务不同，未恢复旧购买权限。'};
Object.assign(errors,{
 DesktopOwnerLeaseLost:'执行权已丢失，停止自动动作；未知记录保留，请先核对当前状态。',
 DesktopOwnerCleanupUnconfirmed:'执行权清理未确认，保留任务，不得再次启动。',
 DesktopSessionPaused:'本任务已暂停；只可明确继续同一任务，已发送动作不重复。',
 DesktopReadonlyHandoffRequired:'没有可核对的只读交接记录；原任务保持，未发购买动作。',
 'DesktopLegacyResultStillUnconfirmed; DesktopHandoffPermanentlyRevokedSource':'原任务仍有未知动作且原购买权限已停用；只能核对，不能直接继续购买。',
 DesktopTransferNeedsExplicitCurrentApproval:'需确认接替当前同一账户的一台商品；没有接替或购买。',
 DesktopTransferLegacyUnconfirmed:'旧交接或购买条件未核实；记录保持，没有接替。',
 DesktopTransferOldSlotWindowUnconfirmed:'旧时段窗口尚未确认到期；未接替、未选择新的时段。',
 DesktopTransferNeedsCurrentMatchingSingleton:'当前购物袋不是已核实的同款唯一一台；没有接替或加购。',
 DesktopTransferBagChanged:'核对时购物袋发生变化；没有接替或购买。',
 DesktopTransferRecordChanged:'旧任务记录发生变化；没有接替或购买。',
 DesktopTransferCancelled:'接替已暂停，旧记录保持，未继续结账。'
});
let input,watch,closing=false;const store=new DesktopTaskStore(join(process.cwd(),'.local/desktop/task.json'));
const runtime=new DesktopCheckoutRuntime({store,onState:s=>{
 if(s.ownerLost===true){closing=true;watch?.stop();emit({type:'owner-lost',message:'执行权已丢失，停止自动动作；旧未知记录保留，当前执行器正在退出。'});input?.close();process.stdin.destroy();return;}
 emit({type:'progress',...s});
},launch:async()=>{
 const {chromium}=createRequire(import.meta.url)(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
 const owned=await createOwnedBrowser(chromium,selectedConfig,v=>{if(!closing)emit({type:'network-status',browser:selectedBrowser,...v});});
 return {api:new DesktopBrowserApi(owned.context,{publicOnly:false}),close:owned.close};
}});
try{
 const initial=await runtime.open();if(closing)throw Error('DesktopOwnerLeaseLost');emit({type:'ready',browser:selectedBrowser,readOnly:initial.legacyReadOnly===true,message:'程序已读取保留记录并打开 '+(selectedBrowser==='msedge'?'Edge':'Chrome')+' 官网窗口；旧未知动作保持，不自动重复。'});
 input=createInterface({input:process.stdin});let active=false,pausing=false;
 watch=new AuthContinuation({observe:()=>runtime.observe(),isBusy:()=>closing||active||pausing||runtime.paused,onStopped:why=>emit({type:'blocked',paused:runtime.paused,message:why==='expired'?'登录等待已暂停；完成官网验证后可继续原任务，不重复结账。':'登录后的页面未确认，已停止自动推进；旧结账记录保持。'})});
 async function advance(c){
  const options={checkoutApproved:c.checkoutApproved===true,newContextConfirmed:c.newContextConfirmed===true,privatePickupData:c.privatePickupData??{}};
  const result=c.action==='resume'?await runtime.resume(options):await runtime.advance(options);
  emit({type:'result',state:result.state,phase:result.phase,paused:runtime.paused,realOrderVerified:result.realOrderVerified===true,reviewReady:!!runtime.finalDescriptor});
  if(!runtime.paused&&result.phase==='AUTH'&&result.state==='NEEDS_USER'){
   watch.start(async()=>{active=true;try{await advance({...c,action:'advance'});}catch(error){emit({type:'blocked',paused:runtime.paused,message:errors[error?.message]??'登录后的推进未确认，旧动作保留，不自动重试。'});}finally{active=false;}});
  }
  return result;
 }
 input.on('line',async line=>{
  if(line.length>12000||closing)return;let c;try{c=JSON.parse(line);}catch{return;}
  if(c?.action==='stop'){closing=true;watch.stop();input.close();try{await runtime.close();}catch{process.exitCode=2;emit({type:'blocked',message:'浏览器清理未确认，保留任务锁，不得再启动。'});}finally{emit({type:'closed',cleanupConfirmed:runtime.cleanupConfirmed});process.stdin.destroy();}return;}
  if(c?.action==='pause'){watch.stop();if(pausing)return;pausing=true;try{emit({type:'paused',...await runtime.pause()});}catch{emit({type:'blocked',paused:runtime.paused,message:'暂停结果未确认；不发新动作，旧记录保持。'});}finally{pausing=false;}return;}
  if(active||watch.reading||pausing){emit({type:'blocked',paused:runtime.paused,message:'当前执行尚未结束，未再次发动作。'});return;}
  if(!['observe','reconcile','transfer','advance','resume','submit'].includes(c?.action))return;
  watch.stop();active=true;
  try{
   if(c.action==='advance'||c.action==='resume')await advance(c);
   else if(c.action==='transfer'){const result=await runtime.transfer({approved:c.approved===true,newContextConfirmed:c.newContextConfirmed===true,privatePickupData:c.privatePickupData??{}});emit({type:'result',state:result.state,phase:result.phase,paused:runtime.paused,realOrderVerified:result.realOrderVerified===true,reviewReady:!!runtime.finalDescriptor});if(!runtime.paused&&result.phase==='AUTH'&&result.state==='NEEDS_USER')watch.start(async()=>{active=true;try{await advance({checkoutApproved:true,newContextConfirmed:true,privatePickupData:c.privatePickupData??{}});}catch{emit({type:'blocked',paused:runtime.paused,message:'接替后的登录衔接未确认，旧动作保留，不重复结账。'});}finally{active=false;}});}
   else{const result=c.action==='observe'?await runtime.observe():c.action==='reconcile'?runtime.paused?await runtime.resume({mode:'reconcile'}):await runtime.reconcile():await runtime.submit({termsAccepted:c.termsAccepted===true,existingOrdersChecked:c.existingOrdersChecked===true,noExtras:c.noExtras===true});emit({type:'result',state:result.state,phase:result.phase,paused:runtime.paused,readOnly:c.action==='reconcile',realOrderVerified:result.realOrderVerified===true,reviewReady:!!runtime.finalDescriptor});}
  }catch(error){emit({type:'blocked',paused:runtime.paused,message:errors[error?.message]??'本次推进未确认；旧记录保持，未自动重试。'});}finally{active=false;}
 });
 await new Promise(resolve=>input.once('close',resolve));watch.stop();
}catch(error){emit({type:'blocked',message:errors[error?.message]??'结账入口未确认，旧任务保持；未重新开始购买。'});process.exitCode=1;}
finally{try{await runtime.close();}catch{process.exitCode=2;emit({type:'blocked',message:'浏览器清理未确认，保留任务锁，不得再启动。'});} }
