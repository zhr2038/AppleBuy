// The desktop entry uses the production controller; a carried unknown record never enables a second buyer.
import {runDesktopSession,PRO_PLAN,proDigest} from './browser-session.mjs';
import {TASK_KEY,validStored,purchaseMatches,sameAcceptedSlot} from '../../web/checkout-connector/job.js';
import {ChromePort,allowedMerchantUrl,allowedMerchantObservationUrl} from '../../web/checkout-connector/chrome-port.js';
import {transferExistingCart,transferExpiredContactOnce,validateDesktopCartTransfer} from './cart-transfer.mjs';
import {guardOwnedApi} from './owner-lease.mjs';
import {restartFromCurrentEmpty,validateEmptyRestart} from './empty-restart.mjs';
import {bagPlanCheck} from './checkout-diagnostic.mjs';
import {renewEndedDraft,validateEndedDraft} from './ended-draft.mjs';
import {restartExpiredPayment,validateExpiredPaymentRestart} from './expired-payment-restart.mjs';
import {restartExpiredReview,validateExpiredReviewRestart,expiredReviewSourceShape,additionalExpiredReviewSourceShape,policyExpiredReviewSourceShape} from './expired-review-restart.mjs';
import {currentReviewProgress,knownUnreleasedFinal} from '../../web/checkout-connector/review-progress.js';
import {R2_VERSION} from '../../web/checkout-connector/r2-protocol.js';
import {CHECKOUT_EXECUTOR_VERSION} from '../../web/checkout-connector/page-program.js';
import {reviewCheckCodes} from '../../web/checkout-connector/review-diagnostic.js';
import {startAfterCancelledOrder,validateCancelledOrderPurchase,reopenBeforeSlots,restartAfterObservedRefusal,restartExpiredPreparedReview} from './cancelled-order-purchase.mjs';
const BAG='https://www.apple.com.cn/shop/bag',TERMS='https://www.apple.com.cn/shop/open/salespolicies';
const REVIEW_TERMS=[TERMS,'https://www.apple.com.cn/shop/browse/open/salespolicies'];
function currentTerms(o){
 const links=Array.isArray(o?.termsLinks)?o.termsLinks.filter(u=>REVIEW_TERMS.includes(u)):[];
 if(Object.hasOwn(o??{},'primaryTermsUrl'))return REVIEW_TERMS.includes(o.primaryTermsUrl)&&links.includes(o.primaryTermsUrl)?o.primaryTermsUrl:null;
 // Earlier generic checkout fixtures have no native primary field. A present but failed native field never falls back.
 return links.includes(TERMS)?TERMS:null;
}
const PHASES=new Set(['ENTRY','VARIANT','EMPTY_BAG','BAG','AUTH','FULFILLMENT','SLOTS','DETAILS','PAYMENT','REVIEW','ORDER_RECEIPT','ORDER_DETAIL','PROCESSING','UNKNOWN']);
const safeState=s=>({state:typeof s.state==='string'?s.state:'NEEDS_VERIFICATION',phase:PHASES.has(s.phase)?s.phase:'UNKNOWN',...(s.receiptAwaitingPayment===true?{receiptAwaitingPayment:true}:{}),pendingAction:['addBag','checkout','chooseSlot','fillDetails','selectPayment','continuePayment','submitOrder'].includes(s.pendingAction)?s.pendingAction:null,...(s.phase==='REVIEW'&&reviewCheckCodes(s.reason).length?{reviewDiagnostic:reviewCheckCodes(s.reason)}:{})});
export class DesktopCheckoutRuntime {
 constructor({store,launch,onState=()=>{},executor='desktop',ordersEnabled=false}){this.ordersEnabled=ordersEnabled===true;if(!['desktop','browser'].includes(executor))throw Error('DesktopExecutorNotAllowed');this.executor=executor;this.store=store;this.launch=launch;this.onState=onState;this.opened=false;this.busy=false;this.closing=false;this.closed=false;this.paused=false;this.cleanupConfirmed=false;this.finalDescriptor=null;this.active=null;this.operations=new Set();this.ownerLost=false;}
 track(operation){const running=Promise.resolve().then(operation);this.operations.add(running);running.then(()=>this.operations.delete(running),()=>this.operations.delete(running));return running;}
 async open(){
  if(this.opened||this.busy||this.closing)throw Error('DesktopSessionAlreadyRunning');this.busy=true;
  // The inner startup settles independently of the outer error cleanup, avoiding a close/open cycle.
  const starting=Promise.resolve().then(()=>this.openOnce());this.starting=starting;
  try{const result=await starting;if(this.closing||this.ownerLost)throw Error('DesktopSessionCancelled');return result;}
  catch(error){await this.close();throw error;}
  finally{this.busy=false;if(this.starting===starting)this.starting=null;}
 }
 async openOnce(){
   if(this.closing||this.ownerLost)throw Error('DesktopSessionCancelled');
   const old=await this.store.get(TASK_KEY);if(!old||!validStored(old))throw Error('DesktopLegacyHandoffRequired');
   if(this.closing||this.ownerLost)throw Error('DesktopSessionCancelled');
   this.lease=await this.store.acquireOwner();if(this.lease?.owned!==true)throw Error('DesktopOwnerLeaseUnconfirmed');
   this.unwatchLease=this.lease.onLost?.(()=>{this.ownerLost=true;this.finalDescriptor=null;this.abort?.abort();try{this.onState({state:'NEEDS_VERIFICATION',phase:'UNKNOWN',pendingAction:null,readOnly:true,ownerLost:true});}finally{this.close().catch(()=>{this.cleanupConfirmed=false;});}});
   if(this.closing||this.ownerLost)throw Error('DesktopSessionCancelled');
   const owned=await this.launch();this.api=guardOwnedApi(owned.api,this.lease);this.closeBrowser=owned.close;
   if(this.closing||this.ownerLost||this.lease?.owned!==true)throw Error('DesktopSessionCancelled');
   if(this.executor==='browser'&&(typeof this.api.r2Exchange!=='function'||await this.api.r2Exchange('r2Version',{})!==R2_VERSION))throw Error('R2ExecutorUpdateRequired');
   if(this.ordersEnabled&&(typeof this.api.executorVersion!=='function'||await this.api.executorVersion()!==CHECKOUT_EXECUTOR_VERSION))throw Error('NativeOrderExecutorUpdateRequired');
   const tab=await this.api.create(BAG);this.tabId=tab.id;this.opened=true;
   return await this.observeInitialPage();
 }
 async observeInitialPage(){
  // Creation does not mean navigation has committed. Only bounded, same-tab reads may be retried here.
  const until=Date.now()+15000;
  for(let attempt=0;attempt<150;attempt++){
   if(this.closing||this.ownerLost||this.lease?.owned!==true)throw Error('DesktopSessionCancelled');
   try{
    const tab=await this.api.tabs.get(this.tabId);
    if(tab&&!['loading','unloaded'].includes(tab.status)){
     if(!allowedMerchantObservationUrl(tab.url))throw Error('UnsupportedMerchantPage');
     return await this.observe();
    }
   }catch(error){
    // A rejected loading metadata read or replaced initial frame is not a failed purchase action.
    // Delivery/identity uncertainty, missing permission and other errors remain terminal.
    if(!['NativeCheckoutResultUnconfirmed','ScriptTransportRejected'].includes(error.message))throw error;
   }
   if(Date.now()>=until)break;
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw Error('DesktopInitialPageUnconfirmed');
 }
 observe(){return this.track(()=>this.observeOnce());}
 async observeOnce(){
  if(!this.opened||this.closed||this.closing)throw Error('DesktopSessionNotOpen');
  if(this.active)throw Error('DesktopSessionAlreadyRunning');
  const port=new ChromePort(this.api,this.tabId,{mode:'observe'}),o=await port.observe(PRO_PLAN),old=await this.store.get(TASK_KEY);
  const recover=old?.desktopContext!==this.api.sessionId&&old?.desktopContext&&(validateDesktopCartTransfer(old,{sessionId:old.desktopContext})||validateEmptyRestart(old,{sessionId:old.desktopContext})||await validateEndedDraft(old,{sessionId:old.desktopContext},this.store,{readonly:true})||await validateExpiredPaymentRestart(old,{sessionId:old.desktopContext},this.store,{readonly:true})||await validateExpiredReviewRestart(old,{sessionId:old.desktopContext},this.store,{readonly:true})||await validateCancelledOrderPurchase(old,{sessionId:old.desktopContext},this.store,{readonly:true}));
  const result={state:'OBSERVED',phase:o.phase,pendingAction:old?.pending?.action??null,legacyReadOnly:old?.reconcileOnly===true||!!recover,realOrderVerified:false,bagCheck:bagPlanCheck(o,PRO_PLAN),...(o.merchantError?{merchantError:true}:{}),...(o.feedback?{feedback:true}:{})};
  if(!this.paused&&!this.closing&&!this.ownerLost)this.onState(safeState(result));return result;
 }
 execute(options){return this.track(()=>this.executeOnce(options));}
 async executeOnce(options){
  if(this.ownerLost)throw Error('DesktopOwnerLeaseLost');
  if(!this.opened||this.closed||this.closing)throw Error('DesktopSessionNotOpen');if(this.busy)throw Error('DesktopSessionAlreadyRunning');
  if(this.paused)throw Error('DesktopSessionPaused');
  this.busy=true;this.finalDescriptor=null;this.abort=new AbortController();
  const leased={get:k=>this.store.get(k),put:(k,v)=>this.store.put(k,v),readArchive:d=>this.store.readArchive(d),acquireOwner:async()=>({get owned(){return runtime.lease?.owned===true;},release:async()=>{}})},runtime=this;
  try{
   if(this.ordersEnabled){
    const prior=await this.store.get(TASK_KEY),sent=prior?.finalIntent?.sent===true||prior?.pending?.action==='submitOrder'&&prior.pending.dispatched!==false;
    if(sent&&(prior.orderRefHash||prior.desktopContext!==this.api.sessionId||prior.reconcileOnly===true||prior.state==='RETIRED'||options.mode==='reconcile'))return await this.checkNativeOrders(prior);
    if(!sent&&options.mode!=='reconcile'&&!this.hasPreflight(prior)){
     const preflight=await this.checkNativeOrders(null);if(preflight.orderCheck.state!=='clear')return preflight;
     const current=await this.store.get(TASK_KEY);if(current?.taskId!==prior?.taskId||current?.planDigest!==prior?.planDigest)throw Error('DesktopPreflightSourceChanged');
     this.rememberPreflight(current);
    }
    if(this.paused||this.closing||this.ownerLost)throw Error('DesktopSessionCancelled');
   }
   this.active=runDesktopSession({api:this.api,tabId:this.tabId,store:leased,mode:'purchase',signal:this.abort.signal,onState:s=>this.onState({...safeState(s),readOnly:options.mode==='reconcile',paused:this.paused}),...options,executor:this.executor});
   const result=await this.active,record=await this.store.get(TASK_KEY);
   if(options.mode!=='reconcile'&&result.phase==='REVIEW'&&record?.finalIntent&&!knownUnreleasedFinal(record))throw Error('DesktopFinalConsentNotCurrent');
   if(options.mode!=='reconcile'&&result.phase==='REVIEW'&&!record?.pending&&(!record?.finalIntent||knownUnreleasedFinal(record))&&!this.closing&&!this.paused){try{await this.prepareReview();}catch(error){this.finalDescriptor=null;if(this.paused||this.closing||this.ownerLost)throw error;}}
   if(this.ordersEnabled&&record?.finalIntent?.sent===true&&record?.orderRefHash){return {...result,...await this.checkNativeOrders(record)};}
   this.onState({...safeState({...result,pendingAction:record?.pending?.action??null}),paused:this.paused});return {...result,pendingAction:record?.pending?.action??null};
  }finally{this.active=null;this.busy=false;}
 }
 hasPreflight(row){return !!this.orderPreflight&&typeof row?.taskId==='string'&&row.taskId.length>0&&row.planDigest===proDigest&&typeof this.api?.sessionId==='string'&&this.lease?.owned===true&&this.orderPreflight.taskId===row.taskId&&this.orderPreflight.planDigest===row.planDigest&&this.orderPreflight.contextId===this.api.sessionId;}
 rememberPreflight(row){if(this.ownerLost||this.closing||this.lease?.owned!==true||!row||typeof row.taskId!=='string'||!row.taskId||row.planDigest!==proDigest||typeof this.api?.sessionId!=='string'||row.desktopContext!==this.api.sessionId)throw Error('DesktopPreflightSourceChanged');this.orderPreflight={taskId:row.taskId,planDigest:row.planDigest,contextId:this.api.sessionId};}
 async checkNativeOrders(finalRecord=null,{automatic=false}={}){
  if(!this.ordersEnabled||typeof this.api.auditOrders!=='function')throw Error('NativeOrderAuditUnavailable');
  if(this.ownerLost||this.paused||this.closing||this.lease?.owned!==true)throw Error('DesktopSessionCancelled');
  let check;
  if(finalRecord&&!/^[a-f0-9]{64}$/.test(finalRecord.orderRefHash??''))check={state:'reference-missing'};
  else check=await this.api.auditOrders(PRO_PLAN,finalRecord?.orderRefHash??null,{automatic});
  if(this.ownerLost||this.paused||this.closing||this.lease?.owned!==true)throw Error('DesktopSessionCancelled');
  if(!check||!['clear','auth','waiting','unpaid-exists','unconfirmed','permission','unknown','not-found','detail','reference-missing'].includes(check.state))check={state:'unknown'};
  if(check.state==='clear'&&(check.authenticated!==true||!/^[a-f0-9]{64}$/.test(check.accountHash??'')||!Number.isSafeInteger(check.matchingCount)||check.matchingCount<0))check={state:'unknown'};
  if(check.state==='detail'&&(check.sameReference!==true||!['cancelled','fulfilled','unpaid','unknown'].includes(check.status)||typeof check.productMatches!=='boolean'||typeof check.storeMatches!=='boolean'||!Number.isFinite(check.totalCny)||check.totalCny<=0||check.quantity!==null||check.slot!==null))check={state:'unknown'};
  // Public UI receives no account identity, reference or URL. This never patches a historical journal.
  const publicCheck={state:check.state,...(check.state==='detail'?{status:check.status,sameReference:check.sameReference===true,productMatches:check.productMatches===true,totalCny:check.totalCny,storeMatches:check.storeMatches===true,quantity:null,slot:null}: {})};
  return {readOnly:!!finalRecord,state:'NEEDS_VERIFICATION',phase:['auth','waiting'].includes(check.state)?'AUTH':check.state==='detail'?'ORDER_DETAIL':'UNKNOWN',pendingAction:finalRecord?.pending?.action??null,realOrderVerified:false,receiptAwaitingPayment:false,orderCheck:publicCheck};
 }
 orderAudit(){return this.track(async()=>{if(this.busy||this.closed||this.closing)throw Error('DesktopSessionAlreadyRunning');this.busy=true;try{const row=await this.store.get(TASK_KEY);return await this.checkNativeOrders(row?.finalIntent?.sent===true?row:null,{automatic:true});}finally{this.busy=false;}});}
 advance(options={}){return this.track(()=>this.advanceOnce(options));}
 newPurchase(options={}){return this.track(()=>this.newPurchaseOnce(options));}
 reopenInitial(options={}){return this.track(()=>this.reopenInitialOnce(options));}
 restartObservedRefusal(options={}){return this.track(async()=>{
  if(this.busy||this.paused||this.closing||this.closed||this.ownerLost||!this.opened)throw Error('DesktopSessionAlreadyRunning');
  this.busy=true;this.finalDescriptor=null;let created;
  try{created=await (options.preparedReviewExpired===true?restartExpiredPreparedReview:restartAfterObservedRefusal)({store:this.store,api:this.api,tabId:this.tabId,approved:options.approved,operatorObservedRefusal:options.operatorObservedRefusal,merchantExpiryConfirmed:options.merchantExpiryConfirmed,sameAccountConfirmed:options.sameAccountConfirmed,live:()=>!this.paused&&!this.closing&&!this.closed&&!this.ownerLost&&this.lease?.owned===true});}finally{this.busy=false;}
  if(created.created!==true)throw Error('ObservedRefusalUnconfirmed');this.rememberPreflight(await this.store.get(TASK_KEY));
  this.onState({state:'RUNNING',phase:'BAG',pendingAction:null,newPurchaseStarted:true});
  return {...await this.advance({checkoutApproved:true,newContextConfirmed:true,privatePickupData:options.privatePickupData??{}}),newPurchaseStarted:true,operatorAssisted:true};
 });}
 async reopenInitialOnce({approved=false,expiredCheckoutUrl,privatePickupData={}}={}){
  if(this.busy||this.paused||this.closing||this.closed||this.ownerLost||!this.opened)throw Error('DesktopSessionAlreadyRunning');
  this.busy=true;this.finalDescriptor=null;let created;
  try{created=await reopenBeforeSlots({store:this.store,api:this.api,tabId:this.tabId,approved,expiredCheckoutUrl,live:()=>!this.paused&&!this.closing&&!this.closed&&!this.ownerLost&&this.lease?.owned===true});}finally{this.busy=false;}
  if(created.created!==true)throw Error('InitialCheckoutUnconfirmed');
  this.rememberPreflight(await this.store.get(TASK_KEY));
  this.onState({state:'RUNNING',phase:'BAG',pendingAction:null,newPurchaseStarted:true});
  return {...await this.advance({checkoutApproved:true,newContextConfirmed:true,privatePickupData}),localTransitionCreated:true};
 }
 async newPurchaseOnce({approved=false,originalOrderAssociated=false,expectedRefHash,privatePickupData={}}={}){
  if(this.busy||this.paused||this.closing||this.closed||this.ownerLost||!this.opened)throw Error('DesktopSessionAlreadyRunning');
  this.busy=true;this.finalDescriptor=null;let created;
  try{expectedRefHash??=(await this.store.get(TASK_KEY))?.orderRefHash;created=await startAfterCancelledOrder({store:this.store,api:this.api,tabId:this.tabId,approved,originalOrderAssociated,expectedRefHash,live:()=>!this.paused&&!this.closing&&!this.closed&&!this.ownerLost&&this.lease?.owned===true});}finally{this.busy=false;}
  if(created.created!==true)throw Error('NewPurchaseUnconfirmed');
  this.rememberPreflight(await this.store.get(TASK_KEY));
  this.onState({state:'RUNNING',phase:created.startPhase,pendingAction:null,newPurchaseStarted:true});
  return {...await this.advance({checkoutApproved:true,newContextConfirmed:true,privatePickupData}),localTransitionCreated:true,newPurchase:true};
 }
 async advanceOnce({checkoutApproved=false,newContextConfirmed=false,privatePickupData={}}={}){
  if(this.ownerLost)throw Error('DesktopOwnerLeaseLost');
  if(this.paused)throw Error('DesktopSessionPaused');
  if(this.busy||this.closing||this.closed)throw Error('DesktopSessionAlreadyRunning');
  const old=await this.store.get(TASK_KEY);
  const authority={checkoutApproved,newContextConfirmed,legacyOwnershipRevoked:old?.state==='RETIRED'||old?.desktopContext===this.api?.sessionId,planDigest:proDigest};
  this.authority=authority;return this.execute({authority,privatePickupData});
 }
 async reconcile(){return this.execute({mode:'reconcile',authority:null,privatePickupData:{}});}
 transfer(options={}){return this.track(()=>this.transferOnce(options));}
 async transferOnce({approved=false,newContextConfirmed=false,privatePickupData={}}={}){
  if(this.ownerLost)throw Error('DesktopOwnerLeaseLost');
  if(this.paused)throw Error('DesktopSessionPaused');
  if(!this.opened||this.busy||this.closing||this.closed||this.lease?.owned!==true)throw Error('DesktopSessionAlreadyRunning');
  this.busy=true;let created;
  try{this.active=transferExistingCart({store:this.store,api:this.api,tabId:this.tabId,approved,newContextConfirmed,live:()=>!this.closing&&!this.paused});created=await this.active;}finally{this.active=null;this.busy=false;}
  if(created?.created===true&&!this.closing&&!this.paused&&this.lease?.owned===true)this.onState({state:'NEEDS_USER',phase:'BAG',pendingAction:null,readOnly:false});
  return this.advance({checkoutApproved:true,newContextConfirmed:true,privatePickupData});
 }
 async prepareReview(){
  const old=await this.store.get(TASK_KEY),port=new ChromePort(this.api,this.tabId,{mode:'purchase',authorized:true,orderSummary:true,acceptedSlot:old?.acceptedSlot});let o=await port.observe(PRO_PLAN);
  if(!old?.pending&&(!old?.finalIntent||knownUnreleasedFinal(old))&&o.phase==='REVIEW'&&o.summaryReadable===true&&o.quantitySource!=='order-summary'){if((await port.readSummary(PRO_PLAN,old.taskId)).read!==true)throw Error('DesktopFinalConsentNotCurrent');o=await port.observe(PRO_PLAN);}
  const termsUrl=currentTerms(o);
  const nativeReview=currentReviewProgress(PRO_PLAN,old,o,{contextOwned:port.controlledReview===true});
  const moneyBases=[old?.bagTotalCny,old?.quotedCny].filter(v=>v!=null);
  if(this.paused||this.closing||this.ownerLost||old?.expiresAt<=Date.now()||old?.desktopContext!==this.api.sessionId||old.lastPhase!=='REVIEW'||old.pending||old.finalIntent&&!knownUnreleasedFinal(old)||old.reconcileOnly===true||o.phase!=='REVIEW'||o.documentId!==old.lastDocumentId||!termsUrl||(!purchaseMatches(PRO_PLAN,o.purchase)&&!nativeReview)||o.extras!==false||o.paymentMethod!=='支付宝'||(!sameAcceptedSlot(old,o.slotSummary)&&!nativeReview)||moneyBases.length===0||moneyBases.some(v=>v!==o.purchase.totalCny))throw Error('DesktopFinalConsentNotCurrent');
  this.finalDescriptor={taskId:old.taskId,documentId:old.lastDocumentId,termsUrl,totalCny:o.purchase.totalCny,...(nativeReview?{reviewProgressId:nativeReview.id,sourceChoice:{store:nativeReview.store,date:nativeReview.date,start:nativeReview.start,end:nativeReview.end},pickupNotice:nativeReview.pickupNotice}: {})};
  return {phase:'REVIEW',termsUrl,product:PRO_PLAN.product,totalCny:o.purchase.totalCny,totalCapCny:9999,quantity:1,store:PRO_PLAN.stores[0],paymentMethod:'支付宝',...(nativeReview?{factsOrigin:nativeReview.factsOrigin,pickupNotice:nativeReview.pickupNotice,heldSlotVerified:false,sourceDate:nativeReview.date,sourceStart:nativeReview.start,sourceEnd:nativeReview.end}: {})};
 }
 transferContact(options={}){return this.track(()=>this.transferContactOnce(options));}
 restartPayment(options={}){return this.track(()=>this.restartPaymentOnce(options));}
 async restartPaymentOnce({approved=false,newContextConfirmed=false,oldExecutorStopped=false,sameAccountOrdersClear=false,additionalRecoveryApproved=false,automaticRecoveryApproved=false,expiredCheckoutUrl,privatePickupData={}}={}){
  if(this.ownerLost||this.paused||!this.opened||this.busy||this.closing||this.closed||this.lease?.owned!==true)throw Error('DesktopSessionAlreadyRunning');this.busy=true;let created;
  try{const source=await this.store.get(TASK_KEY),recover=expiredReviewSourceShape(source)||additionalExpiredReviewSourceShape(source)||policyExpiredReviewSourceShape(source)?restartExpiredReview:restartExpiredPayment;this.active=recover({store:this.store,api:this.api,tabId:this.tabId,expiredCheckoutUrl,approved,newContextConfirmed,oldExecutorStopped,sameAccountOrdersClear,additionalRecoveryApproved,automaticRecoveryApproved,live:()=>!this.ownerLost&&!this.closing&&!this.paused&&this.lease?.owned===true});created=await this.active;}finally{this.active=null;this.busy=false;}
  if(created?.created!==true)throw Error('ExpiredPaymentProspectiveUnconfirmed');
  if(this.paused||this.closing||this.ownerLost||this.lease?.owned!==true)return {state:this.paused?'PAUSED':'NEEDS_VERIFICATION',phase:'BAG',localTransitionCreated:true,realOrderVerified:false};
  return {...await this.advance({checkoutApproved:true,newContextConfirmed:true,privatePickupData}),localTransitionCreated:true};
 }
 renewDraft(options={}){return this.track(()=>this.renewDraftOnce(options));}
 async renewDraftOnce({approved=false,newContextConfirmed=false,merchantExpiryConfirmed=false,oldExecutorStopped=false,sameAccountOrdersClear=false,privatePickupData={}}={}){
  if(this.ownerLost||this.paused||!this.opened||this.busy||this.closing||this.closed||this.lease?.owned!==true)throw Error('DesktopSessionAlreadyRunning');this.busy=true;let created;
  try{this.active=renewEndedDraft({store:this.store,api:this.api,tabId:this.tabId,approved,newContextConfirmed,merchantExpiryConfirmed,oldExecutorStopped,sameAccountOrdersClear,live:()=>!this.ownerLost&&!this.closing&&!this.paused&&this.lease?.owned===true});created=await this.active;}finally{this.active=null;this.busy=false;}
  if(created?.created!==true)throw Error('EndedDraftProspectiveUnconfirmed');
  if(this.paused||this.closing||this.ownerLost||this.lease?.owned!==true)return {state:this.paused?'PAUSED':'NEEDS_VERIFICATION',phase:'BAG',localTransitionCreated:true,realOrderVerified:false};
  return this.advance({checkoutApproved:true,newContextConfirmed:true,privatePickupData});
 }
 async transferContactOnce({approved=false,newContextConfirmed=false,merchantExpiryConfirmed=false,oldCheckoutStopped=false,sameAccountOrdersChecked=false,privatePickupData={}}={}){
  if(this.ownerLost||this.paused||!this.opened||this.busy||this.closing||this.closed||this.lease?.owned!==true)throw Error('DesktopSessionAlreadyRunning');
  this.busy=true;let created;
  try{this.active=transferExpiredContactOnce({store:this.store,api:this.api,tabId:this.tabId,approved,newContextConfirmed,merchantExpiryConfirmed,oldCheckoutStopped,sameAccountOrdersChecked,live:()=>!this.ownerLost&&!this.closing&&!this.paused&&this.lease?.owned===true});created=await this.active;}finally{this.active=null;this.busy=false;}
  if(created?.created!==true||this.ownerLost||this.closing||this.paused||this.lease?.owned!==true)throw Error('DesktopTransferCancelled');
  return this.advance({checkoutApproved:true,newContextConfirmed:true,privatePickupData});
 }
 restartEmpty(options={}){return this.track(()=>this.restartEmptyOnce(options));}
 async restartEmptyOnce({approved=false,accountConfirmedByUser=false,oldCheckoutStoppedByUser=false,existingOrdersCheckedByUser=false,privatePickupData={}}={}){
  if(this.ownerLost||this.paused||!this.opened||this.busy||this.closing||this.closed||this.lease?.owned!==true)throw Error('DesktopSessionAlreadyRunning');
  this.busy=true;let created;
  try{this.active=restartFromCurrentEmpty({store:this.store,api:this.api,tabId:this.tabId,approved,accountConfirmedByUser,oldCheckoutStoppedByUser,existingOrdersCheckedByUser,live:()=>!this.closing&&!this.paused&&this.lease?.owned===true});created=await this.active;}finally{this.active=null;this.busy=false;}
  if(created?.created!==true||this.paused||this.closing||this.lease?.owned!==true)throw Error('EmptyRestartCancelled');
  this.onState({state:'NEEDS_USER',phase:'EMPTY_BAG',pendingAction:null,readOnly:false});return this.advance({checkoutApproved:true,newContextConfirmed:true,privatePickupData});
 }
 async submit({termsAccepted=false,existingOrdersChecked=false,noExtras=false}={}){
  if(this.paused)throw Error('DesktopSessionPaused');
  if(this.busy||this.closing||this.closed)throw Error('DesktopSessionAlreadyRunning');
  if(!this.finalDescriptor||termsAccepted!==true||existingOrdersChecked!==true||noExtras!==true)throw Error('DesktopFinalConsentNotCurrent');
  const finalConsent={...this.finalDescriptor,termsAccepted,existingOrdersChecked,noExtras,acceptedAt:Date.now()};
  return this.execute({authority:{...this.authority,finalConsent}});
 }
 async pause(){
  if(this.ownerLost)throw Error('DesktopOwnerLeaseLost');
  if(!this.opened||this.closed||this.closing)throw Error('DesktopSessionNotOpen');
  this.paused=true;this.finalDescriptor=null;this.abort?.abort();
  await Promise.allSettled([...this.operations,...(this.starting?[this.starting]:[])]);
  if(this.ownerLost)throw Error('DesktopOwnerLeaseLost');
  const old=await this.store.get(TASK_KEY);
  const recovered=old?.desktopContext!==this.api.sessionId&&old?.desktopContext&&(validateDesktopCartTransfer(old,{sessionId:old.desktopContext})||validateEmptyRestart(old,{sessionId:old.desktopContext})||await validateEndedDraft(old,{sessionId:old.desktopContext},this.store,{readonly:true})||await validateExpiredPaymentRestart(old,{sessionId:old.desktopContext},this.store,{readonly:true})||await validateExpiredReviewRestart(old,{sessionId:old.desktopContext},this.store,{readonly:true})||await validateCancelledOrderPurchase(old,{sessionId:old.desktopContext},this.store,{readonly:true}));
  return {...safeState({state:'PAUSED',phase:old?.lastPhase,pendingAction:old?.pending?.action}),paused:true,readOnly:old?.reconcileOnly===true||!!recovered,canContinue:old?.desktopContext===this.api.sessionId&&old?.reconcileOnly!==true&&old?.state!=='CONFIRMED_UNPAID'&&old?.expiresAt>Date.now()};
 }
 async resume({mode='purchase',...options}={}){
  if(this.ownerLost)throw Error('DesktopOwnerLeaseLost');
  if(!this.paused||this.busy||this.closing||this.closed||this.lease?.owned!==true)throw Error('DesktopSessionAlreadyRunning');
  this.paused=false;return mode==='reconcile'?this.reconcile():this.advance(options);
 }
 async close(){
  if(this.closePromise)return this.closePromise;this.closePromise=this.closeOnce();return this.closePromise;
 }
 async closeOnce(){
  if(this.closed)return;this.closing=true;this.finalDescriptor=null;this.orderPreflight=null;this.abort?.abort();
  await Promise.allSettled([...this.operations,...(this.starting?[this.starting]:[])]);
  try{if(this.closeBrowser)await this.closeBrowser();await this.lease?.release();this.unwatchLease?.();this.cleanupConfirmed=true;this.closed=true;}
  catch{this.cleanupConfirmed=false;throw Error('DesktopBrowserCleanupUnconfirmed');}
 }
}
