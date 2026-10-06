// The desktop entry uses the production controller; a carried unknown record never enables a second buyer.
import {runDesktopSession,PRO_PLAN,proDigest} from './browser-session.mjs';
import {TASK_KEY,validStored} from '../../web/checkout-connector/job.js';
import {ChromePort} from '../../web/checkout-connector/chrome-port.js';
import {transferExistingCart,validateDesktopCartTransfer} from './cart-transfer.mjs';
import {guardOwnedApi} from './owner-lease.mjs';
const BAG='https://www.apple.com.cn/shop/bag',TERMS='https://www.apple.com.cn/shop/open/salespolicies';
const PHASES=new Set(['ENTRY','VARIANT','EMPTY_BAG','BAG','AUTH','FULFILLMENT','SLOTS','DETAILS','PAYMENT','REVIEW','ORDER_RECEIPT','ORDER_DETAIL','PROCESSING','UNKNOWN']);
const safeState=s=>({state:typeof s.state==='string'?s.state:'NEEDS_VERIFICATION',phase:PHASES.has(s.phase)?s.phase:'UNKNOWN',pendingAction:['addBag','checkout','chooseSlot','submitOrder'].includes(s.pendingAction)?s.pendingAction:null});
export class DesktopCheckoutRuntime {
 constructor({store,launch,onState=()=>{}}){this.store=store;this.launch=launch;this.onState=onState;this.opened=false;this.busy=false;this.closing=false;this.closed=false;this.cleanupConfirmed=false;this.finalDescriptor=null;this.active=null;}
 async open(){
  if(this.opened||this.busy||this.closing)throw Error('DesktopSessionAlreadyRunning');this.busy=true;
  try{
   const old=await this.store.get(TASK_KEY);if(!old||!validStored(old))throw Error('DesktopLegacyHandoffRequired');
   this.lease=await this.store.acquireOwner();if(this.lease?.owned!==true)throw Error('DesktopOwnerLeaseUnconfirmed');
   const owned=await this.launch();this.api=guardOwnedApi(owned.api,this.lease);this.closeBrowser=owned.close;
   this.unwatchLease=this.lease.onLost?.(()=>{this.abort?.abort();this.close().catch(()=>{this.cleanupConfirmed=false;});});
   const tab=await this.api.create(BAG);this.tabId=tab.id;this.opened=true;
   return await this.observe();
  }catch(error){this.busy=false;await this.close();throw error;}finally{this.busy=false;}
 }
 async observe(){
  if(!this.opened||this.closed||this.closing)throw Error('DesktopSessionNotOpen');
  if(this.active)throw Error('DesktopSessionAlreadyRunning');
  const port=new ChromePort(this.api,this.tabId,{mode:'observe'}),o=await port.observe(PRO_PLAN),old=await this.store.get(TASK_KEY);
  const recover=old?.desktopContext!==this.api.sessionId&&old?.desktopContext&&validateDesktopCartTransfer(old,{sessionId:old.desktopContext});
  const result={state:'OBSERVED',phase:o.phase,pendingAction:old?.pending?.action??null,legacyReadOnly:old?.reconcileOnly===true||!!recover,realOrderVerified:false};
  this.onState(safeState(result));return result;
 }
 async execute(options){
  if(!this.opened||this.closed||this.closing)throw Error('DesktopSessionNotOpen');if(this.busy)throw Error('DesktopSessionAlreadyRunning');
  this.busy=true;this.finalDescriptor=null;this.abort=new AbortController();
  const leased={get:k=>this.store.get(k),put:(k,v)=>this.store.put(k,v),acquireOwner:async()=>({get owned(){return runtime.lease?.owned===true;},release:async()=>{}})},runtime=this;
  try{
   this.active=runDesktopSession({api:this.api,tabId:this.tabId,store:leased,mode:'purchase',signal:this.abort.signal,onState:s=>this.onState({...safeState(s),readOnly:options.mode==='reconcile'}),...options});
   const result=await this.active;if(options.mode!=='reconcile'&&result.phase==='REVIEW'&&!this.closing)await this.prepareReview();this.onState(safeState(result));return result;
  }finally{this.active=null;this.busy=false;}
 }
 async advance({checkoutApproved=false,newContextConfirmed=false,privatePickupData={}}={}){
  if(this.busy||this.closing||this.closed)throw Error('DesktopSessionAlreadyRunning');
  const old=await this.store.get(TASK_KEY);
  const authority={checkoutApproved,newContextConfirmed,legacyOwnershipRevoked:old?.state==='RETIRED'||old?.desktopContext===this.api?.sessionId,planDigest:proDigest};
  this.authority=authority;return this.execute({authority,privatePickupData});
 }
 async reconcile(){return this.execute({mode:'reconcile',authority:null,privatePickupData:{}});}
 async transfer({approved=false,newContextConfirmed=false,privatePickupData={}}={}){
  if(!this.opened||this.busy||this.closing||this.closed||this.lease?.owned!==true)throw Error('DesktopSessionAlreadyRunning');
  this.busy=true;
  try{this.active=transferExistingCart({store:this.store,api:this.api,tabId:this.tabId,approved,newContextConfirmed,live:()=>!this.closing});await this.active;}finally{this.active=null;this.busy=false;}
  return this.advance({checkoutApproved:true,newContextConfirmed:true,privatePickupData});
 }
 async prepareReview(){
  const old=await this.store.get(TASK_KEY),port=new ChromePort(this.api,this.tabId,{mode:'observe'}),o=await port.observe(PRO_PLAN);
  if(old?.desktopContext!==this.api.sessionId||old.lastPhase!=='REVIEW'||old.pending||old.finalIntent||old.reconcileOnly===true||o.phase!=='REVIEW'||o.documentId!==old.lastDocumentId||!o.termsLinks?.includes(TERMS))throw Error('DesktopFinalConsentNotCurrent');
  this.finalDescriptor={taskId:old.taskId,documentId:old.lastDocumentId,termsUrl:TERMS};
  return {phase:'REVIEW',termsUrl:TERMS,product:PRO_PLAN.product,totalCapCny:9999,quantity:1,store:PRO_PLAN.stores[0],paymentMethod:'支付宝'};
 }
 async submit({termsAccepted=false,existingOrdersChecked=false,noExtras=false}={}){
  if(this.busy||this.closing||this.closed)throw Error('DesktopSessionAlreadyRunning');
  if(!this.finalDescriptor||termsAccepted!==true||existingOrdersChecked!==true||noExtras!==true)throw Error('DesktopFinalConsentNotCurrent');
  const finalConsent={...this.finalDescriptor,termsAccepted,existingOrdersChecked,noExtras,acceptedAt:Date.now()};
  return this.execute({authority:{...this.authority,finalConsent}});
 }
 async close(){
  if(this.closePromise)return this.closePromise;this.closePromise=this.closeOnce();return this.closePromise;
 }
 async closeOnce(){
  if(this.closed)return;this.closing=true;this.finalDescriptor=null;this.abort?.abort();
  if(this.active){try{await this.active;}catch{} }
  try{if(this.closeBrowser)await this.closeBrowser();await this.lease?.release();this.unwatchLease?.();this.cleanupConfirmed=true;this.closed=true;}
  catch{this.cleanupConfirmed=false;throw Error('DesktopBrowserCleanupUnconfirmed');}
 }
}
