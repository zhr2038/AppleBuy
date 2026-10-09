// Prepared native-only entry: production controller/private stdin. Never SDK attach, profile copy or auto-authentication.
import {createInterface} from 'node:readline';import {join} from 'node:path';
import {DesktopCheckoutRuntime} from './checkout-runtime.mjs';import {DesktopTaskStore} from './task-store.mjs';
import {AuthContinuation} from './auth-continuation.mjs';import {launchNativeCheckout} from './native-checkout-channel.mjs';
import {safeCheckoutDiagnostic} from './checkout-diagnostic.mjs';
import {stoppedCheckoutDraftSource} from './cart-transfer.mjs';import {TASK_KEY} from '../../web/checkout-connector/job.js';
import {probeCheckoutHostScope} from './checkout-host-scope.mjs';
import {expiredPaymentSourceShape} from './expired-payment-restart.mjs';
import {expiredReviewSourceShape,additionalExpiredReviewSourceShape} from './expired-review-restart.mjs';
if(process.argv.length>3||process.argv.length===3&&process.argv[2]!=='--browser-executor')throw Error('NativeWorkerArgumentsNotAllowed');
const emit=value=>process.stdout.write(JSON.stringify({scope:'desktop-pro-checkout',...value})+'\n');
const executor=process.argv[2]==='--browser-executor'?'browser':'desktop';
let input,watch,closing=false;const store=new DesktopTaskStore(join(process.cwd(),'.local/desktop/task.json'));
const runtime=new DesktopCheckoutRuntime({store,executor,launch:async()=>launchNativeCheckout(),onState:s=>{
 if(s.ownerLost===true){closing=true;watch?.stop();emit({type:'owner-lost',message:'执行权已丢失，停止新动作；未知记录保留。'});input?.close();process.stdin.destroy();return;}
 emit({type:'progress',...s});
}});
try{
 const initial=await runtime.open();if(closing)throw Error('NativeOwnerLost');
 const hostScope=await probeCheckoutHostScope(runtime.api),source=await store.get(TASK_KEY),canRenewEndedDraft=!!stoppedCheckoutDraftSource(source),canAdditionalReviewRecovery=source?.desktopReviewRestart?.generation===1&&!!additionalExpiredReviewSourceShape(source),canRestartExpiredPayment=!!(expiredPaymentSourceShape(source)||expiredReviewSourceShape(source)||canAdditionalReviewRecovery);if(closing||runtime.ownerLost)throw Error('NativeOwnerLost');
 emit({type:'ready',readOnly:initial.legacyReadOnly===true,canRenewEndedDraft,canRestartExpiredPayment,canAdditionalReviewRecovery,...hostScope,message:'程序已连接正常 Chrome 的独立结账通道；旧只读和未知记录不增加购买权限。'});
 input=createInterface({input:process.stdin});let active=false,pausing=false;
 watch=new AuthContinuation({observe:()=>runtime.observe(),isBusy:()=>closing||active||pausing||runtime.paused,onStopped:()=>emit({type:'blocked',paused:runtime.paused,message:'官网验证或页面仍未确认，自动衔接已停止；旧动作不重复。'})});
 function consentSummary(){const d=runtime.finalDescriptor;return d?{termsUrl:d.termsUrl,sourceChoice:d.sourceChoice??null,pickupNotice:d.pickupNotice??null}:null;}
 async function continueWhenReady(result,c){
  if(executor==='browser')return; // R2 waits within the bridge actor; do not add a second desktop observation loop.
  if(runtime.paused||closing||result.reviewReady||runtime.finalDescriptor)return;
  const row=await store.get(TASK_KEY),p=row?.pending;
  if(row?.reconcileOnly===true||row?.finalIntent||row?.expiresAt<=Date.now())return;
  const next={checkout:['FULFILLMENT','SLOTS'],selectPickup:['SLOTS'],chooseSlot:['DETAILS','PAYMENT','REVIEW'],fillDetails:['PAYMENT','REVIEW'],continuePayment:['REVIEW']}[p?.action];
  if(result.phase!=='AUTH'&&(!next||!['UNKNOWN','PROCESSING',p.beforePhase].includes(result.phase)))return;
  watch.start(async()=>{active=true;try{await advance({...c,action:'advance'});}catch{emit({type:'blocked',paused:runtime.paused,message:'原任务后续页面未确认；旧动作保持，不重复发送。'});}finally{active=false;}},{phases:next??['FULFILLMENT','SLOTS','DETAILS','PAYMENT','REVIEW'],deadline:row.expiresAt});
 }
 async function advance(c){
  const options={checkoutApproved:c.checkoutApproved===true,newContextConfirmed:c.newContextConfirmed===true,privatePickupData:c.privatePickupData??{}};
  const result=c.action==='resume'?await runtime.resume(options):await runtime.advance(options);
  emit({type:'result',state:result.state,phase:result.phase,pendingAction:result.pendingAction??null,paused:runtime.paused,realOrderVerified:result.realOrderVerified===true,reviewReady:!!runtime.finalDescriptor,consentSummary:consentSummary()});
  await continueWhenReady(result,c);
  return result;
 }
 input.on('line',async line=>{
  if(line.length>12000||closing)return;let c;try{c=JSON.parse(line);}catch{return;}
  if(c?.action==='stop'){closing=true;watch.stop();input.close();try{await runtime.close();}catch{process.exitCode=2;emit({type:'blocked',message:'结账通道清理未确认，未知记录保持。'});}finally{emit({type:'closed',cleanupConfirmed:runtime.cleanupConfirmed});process.stdin.destroy();}return;}
  if(c?.action==='pause'){watch.stop();if(pausing)return;pausing=true;try{emit({type:'paused',...await runtime.pause()});}catch{emit({type:'blocked',paused:runtime.paused,message:'暂停未确认；已发送动作可能继续，未知记录保持。'});}finally{pausing=false;}return;}
  if(active||watch.reading||pausing){emit({type:'blocked',paused:runtime.paused,message:'当前执行尚未结束，未再次发动作。'});return;}
  if(!['observe','reconcile','transfer','transfer-contact','renew-draft','restart-payment','restart-empty','advance','resume','submit'].includes(c?.action))return;
  watch.stop();active=true;
  try{
   if(c.action==='advance'||c.action==='resume')await advance(c);
   else if(c.action==='restart-payment'){
    const result=await runtime.restartPayment({approved:c.approved===true,newContextConfirmed:c.newContextConfirmed===true,oldExecutorStopped:c.oldExecutorStopped===true,sameAccountOrdersClear:c.sameAccountOrdersClear===true,additionalRecoveryApproved:c.additionalRecoveryApproved===true,expiredCheckoutUrl:c.expiredCheckoutUrl,privatePickupData:c.privatePickupData??{}});
    emit({type:'result',state:result.state,phase:result.phase,pendingAction:result.pendingAction??null,paused:runtime.paused,localTransitionCreated:result.localTransitionCreated===true,realOrderVerified:result.realOrderVerified===true,reviewReady:!!runtime.finalDescriptor,consentSummary:consentSummary()});
    await continueWhenReady(result,{checkoutApproved:true,newContextConfirmed:true,privatePickupData:c.privatePickupData??{}});
   }
   else if(c.action==='restart-empty'){
    const result=await runtime.restartEmpty({approved:c.approved===true,accountConfirmedByUser:c.accountConfirmedByUser===true,oldCheckoutStoppedByUser:c.oldCheckoutStoppedByUser===true,existingOrdersCheckedByUser:c.existingOrdersCheckedByUser===true,privatePickupData:c.privatePickupData??{}});
    emit({type:'result',state:result.state,phase:result.phase,paused:runtime.paused,readOnly:false,realOrderVerified:result.realOrderVerified===true,reviewReady:!!runtime.finalDescriptor});
    if(executor!=='browser'&&!runtime.paused&&result.phase==='AUTH'&&result.state==='NEEDS_USER')watch.start(async()=>{active=true;try{await advance({checkoutApproved:true,newContextConfirmed:true,privatePickupData:c.privatePickupData??{}});}catch{emit({type:'blocked',paused:runtime.paused,message:'新尝试的登录衔接未确认，旧结果保持，不重复结账。'});}finally{active=false;}});
   }
   else if(c.action==='renew-draft'){
    const result=await runtime.renewDraft({approved:c.approved===true,newContextConfirmed:c.newContextConfirmed===true,merchantExpiryConfirmed:c.merchantExpiryConfirmed===true,oldExecutorStopped:c.oldExecutorStopped===true,sameAccountOrdersClear:c.sameAccountOrdersClear===true,privatePickupData:c.privatePickupData??{}});
    emit({type:'result',state:result.state,phase:result.phase,paused:runtime.paused,localTransitionCreated:result.localTransitionCreated===true,realOrderVerified:result.realOrderVerified===true,reviewReady:!!runtime.finalDescriptor});
    if(executor!=='browser'&&!runtime.paused&&result.phase==='AUTH'&&result.state==='NEEDS_USER')watch.start(async()=>{active=true;try{await advance({checkoutApproved:true,newContextConfirmed:true,privatePickupData:c.privatePickupData??{}});}catch{emit({type:'blocked',paused:runtime.paused,message:'登录衔接未确认，原记录保持，不重复结账。'});}finally{active=false;}});
   }
   else if(c.action==='transfer'||c.action==='transfer-contact'){
    const options={approved:c.approved===true,newContextConfirmed:c.newContextConfirmed===true,privatePickupData:c.privatePickupData??{}};
    const result=c.action==='transfer-contact'?await runtime.transferContact({...options,merchantExpiryConfirmed:c.merchantExpiryConfirmed===true,oldCheckoutStopped:c.oldCheckoutStopped===true,sameAccountOrdersChecked:c.sameAccountOrdersChecked===true}):await runtime.transfer(options);
    emit({type:'result',state:result.state,phase:result.phase,paused:runtime.paused,realOrderVerified:result.realOrderVerified===true,reviewReady:!!runtime.finalDescriptor});
    if(executor!=='browser'&&!runtime.paused&&result.phase==='AUTH'&&result.state==='NEEDS_USER')watch.start(async()=>{active=true;try{await advance({checkoutApproved:true,newContextConfirmed:true,privatePickupData:c.privatePickupData??{}});}catch{emit({type:'blocked',paused:runtime.paused,message:'接替后的登录衔接未确认；旧动作保持。'});}finally{active=false;}});
   }else{
    const result=c.action==='observe'?await runtime.observe():c.action==='reconcile'?runtime.paused?await runtime.resume({mode:'reconcile'}):await runtime.reconcile():await runtime.submit({termsAccepted:c.termsAccepted===true,existingOrdersChecked:c.existingOrdersChecked===true,noExtras:c.noExtras===true});
    emit({type:'result',state:result.state,phase:result.phase,paused:runtime.paused,readOnly:c.action==='reconcile',realOrderVerified:result.realOrderVerified===true,reviewReady:!!runtime.finalDescriptor,bagCheck:result.bagCheck??null});
   }
  }catch(error){emit({type:'blocked',paused:runtime.paused,diagnosticCode:safeCheckoutDiagnostic(error),message:'本次结账结果未确认；须重新核对实际已保存记录，未重复下单。'});}finally{active=false;}
 });
 await new Promise(resolve=>input.once('close',resolve));watch.stop();
}catch{process.exitCode=1;emit({type:'blocked',message:'正常 Chrome 结账通道未连接或原任务无法继续；未启用新购买。'});}
finally{try{await runtime.close();}catch{process.exitCode=2;emit({type:'blocked',message:'通道清理未确认；保留结果，不重新开始。'});}}
