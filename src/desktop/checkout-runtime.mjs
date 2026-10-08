// The desktop entry uses the production controller; a carried unknown record never enables a second buyer.
import {runDesktopSession,PRO_PLAN,proDigest} from './browser-session.mjs';
import {TASK_KEY,validStored,purchaseMatches,sameAcceptedSlot} from '../../web/checkout-connector/job.js';
import {ChromePort,allowedMerchantUrl} from '../../web/checkout-connector/chrome-port.js';
import {transferExistingCart,transferExpiredContactOnce,validateDesktopCartTransfer} from './cart-transfer.mjs';
import {guardOwnedApi} from './owner-lease.mjs';
import {restartFromCurrentEmpty,validateEmptyRestart} from './empty-restart.mjs';
import {bagPlanCheck} from './checkout-diagnostic.mjs';
import {renewEndedDraft,validateEndedDraft} from './ended-draft.mjs';
import {restartExpiredPayment,validateExpiredPaymentRestart} from './expired-payment-restart.mjs';
const BAG='https://www.apple.com.cn/shop/bag',TERMS='https://www.apple.com.cn/shop/open/salespolicies';
const REVIEW_TERMS=[TERMS,'https://www.apple.com.cn/shop/browse/open/salespolicies'];
function currentTerms(o){
 const links=Array.isArray(o?.termsLinks)?o.termsLinks.filter(u=>REVIEW_TERMS.includes(u)):[];
 if(Object.hasOwn(o??{},'primaryTermsUrl'))return REVIEW_TERMS.includes(o.primaryTermsUrl)&&links.includes(o.primaryTermsUrl)?o.primaryTermsUrl:null;
 // Earlier generic checkout fixtures have no native primary field. A present but failed native field never falls back.
 return links.includes(TERMS)?TERMS:null;
}
const PHASES=new Set(['ENTRY','VARIANT','EMPTY_BAG','BAG','AUTH','FULFILLMENT','SLOTS','DETAILS','PAYMENT','REVIEW','ORDER_RECEIPT','ORDER_DETAIL','PROCESSING','UNKNOWN']);
const safeState=s=>({state:typeof s.state==='string'?s.state:'NEEDS_VERIFICATION',phase:PHASES.has(s.phase)?s.phase:'UNKNOWN',pendingAction:['addBag','checkout','chooseSlot','fillDetails','selectPayment','continuePayment','submitOrder'].includes(s.pendingAction)?s.pendingAction:null});
export class DesktopCheckoutRuntime {
 constructor({store,launch,onState=()=>{}}){this.store=store;this.launch=launch;this.onState=onState;this.opened=false;this.busy=false;this.closing=false;this.closed=false;this.paused=false;this.cleanupConfirmed=false;this.finalDescriptor=null;this.active=null;this.operations=new Set();this.ownerLost=false;}
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
     if(!allowedMerchantUrl(tab.url))throw Error('UnsupportedMerchantPage');
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
  const recover=old?.desktopContext!==this.api.sessionId&&old?.desktopContext&&(validateDesktopCartTransfer(old,{sessionId:old.desktopContext})||validateEmptyRestart(old,{sessionId:old.desktopContext})||await validateEndedDraft(old,{sessionId:old.desktopContext},this.store,{readonly:true})||await validateExpiredPaymentRestart(old,{sessionId:old.desktopContext},this.store,{readonly:true}));
  const result={state:'OBSERVED',phase:o.phase,pendingAction:old?.pending?.action??null,legacyReadOnly:old?.reconcileOnly===true||!!recover,realOrderVerified:false,bagCheck:bagPlanCheck(o,PRO_PLAN)};
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
   this.active=runDesktopSession({api:this.api,tabId:this.tabId,store:leased,mode:'purchase',signal:this.abort.signal,onState:s=>this.onState({...safeState(s),readOnly:options.mode==='reconcile',paused:this.paused}),...options});
   const result=await this.active,record=await this.store.get(TASK_KEY);
   if(options.mode!=='reconcile'&&result.phase==='REVIEW'&&record?.finalIntent)throw Error('DesktopFinalConsentNotCurrent');
   if(options.mode!=='reconcile'&&result.phase==='REVIEW'&&!record?.pending&&!record?.finalIntent&&!this.closing&&!this.paused){try{await this.prepareReview();}catch(error){this.finalDescriptor=null;if(this.paused||this.closing||this.ownerLost)throw error;}}
   this.onState({...safeState({...result,pendingAction:record?.pending?.action??null}),paused:this.paused});return {...result,pendingAction:record?.pending?.action??null};
  }finally{this.active=null;this.busy=false;}
 }
 advance(options={}){return this.track(()=>this.advanceOnce(options));}
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
  if(!old?.pending&&!old?.finalIntent&&o.phase==='REVIEW'&&o.summaryReadable===true&&o.quantitySource!=='order-summary'){if((await port.readSummary(PRO_PLAN,old.taskId)).read!==true)throw Error('DesktopFinalConsentNotCurrent');o=await port.observe(PRO_PLAN);}
  const termsUrl=currentTerms(o);
  const moneyBases=[old?.bagTotalCny,old?.quotedCny].filter(v=>v!=null);
  if(this.paused||this.closing||this.ownerLost||old?.expiresAt<=Date.now()||old?.desktopContext!==this.api.sessionId||old.lastPhase!=='REVIEW'||old.pending||old.finalIntent||old.reconcileOnly===true||o.phase!=='REVIEW'||o.documentId!==old.lastDocumentId||!termsUrl||!purchaseMatches(PRO_PLAN,o.purchase)||o.extras!==false||o.paymentMethod!=='支付宝'||!sameAcceptedSlot(old,o.slotSummary)||moneyBases.length===0||moneyBases.some(v=>v!==o.purchase.totalCny))throw Error('DesktopFinalConsentNotCurrent');
  this.finalDescriptor={taskId:old.taskId,documentId:old.lastDocumentId,termsUrl};
  return {phase:'REVIEW',termsUrl,product:PRO_PLAN.product,totalCapCny:9999,quantity:1,store:PRO_PLAN.stores[0],paymentMethod:'支付宝'};
 }
 transferContact(options={}){return this.track(()=>this.transferContactOnce(options));}
 restartPayment(options={}){return this.track(()=>this.restartPaymentOnce(options));}
 async restartPaymentOnce({approved=false,newContextConfirmed=false,oldExecutorStopped=false,sameAccountOrdersClear=false,expiredCheckoutUrl,privatePickupData={}}={}){
  if(this.ownerLost||this.paused||!this.opened||this.busy||this.closing||this.closed||this.lease?.owned!==true)throw Error('DesktopSessionAlreadyRunning');this.busy=true;let created;
  try{this.active=restartExpiredPayment({store:this.store,api:this.api,tabId:this.tabId,expiredCheckoutUrl,approved,newContextConfirmed,oldExecutorStopped,sameAccountOrdersClear,live:()=>!this.ownerLost&&!this.closing&&!this.paused&&this.lease?.owned===true});created=await this.active;}finally{this.active=null;this.busy=false;}
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
  const recovered=old?.desktopContext!==this.api.sessionId&&old?.desktopContext&&(validateDesktopCartTransfer(old,{sessionId:old.desktopContext})||validateEmptyRestart(old,{sessionId:old.desktopContext})||await validateEndedDraft(old,{sessionId:old.desktopContext},this.store,{readonly:true})||await validateExpiredPaymentRestart(old,{sessionId:old.desktopContext},this.store,{readonly:true}));
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
  if(this.closed)return;this.closing=true;this.finalDescriptor=null;this.abort?.abort();
  await Promise.allSettled([...this.operations,...(this.starting?[this.starting]:[])]);
  try{if(this.closeBrowser)await this.closeBrowser();await this.lease?.release();this.unwatchLease?.();this.cleanupConfirmed=true;this.closed=true;}
  catch{this.cleanupConfirmed=false;throw Error('DesktopBrowserCleanupUnconfirmed');}
 }
}
