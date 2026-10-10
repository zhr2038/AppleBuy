// Own Chrome tabs only; fixed reviewed merchant program only. Prepared and unreachable from the installed readonly link.
import {merchantDocument,CHECKOUT_EXECUTOR_VERSION} from './page-program.js';
import {AppleLogin} from './apple-login.js';
import {canonicalJson} from './job.js';
import {BrowserJobExecutor} from './r2-executor.js';
import {OrderAudit,missingOwnedTab,auditCancelledOrder} from './order-audit.js';
import {R2_OPERATIONS} from './r2-protocol.js';
import {CHECKOUT_RPC,BAG,ENTRY,checkoutUrl,checkoutObservedUrl,checkoutRequest,checkoutCommand,planAllowed,boundedCheckoutJson} from './checkout-rpc-contract.js';
const PAGE_KEYS=new Set(['schema','phase','purchase','verifiedStep','path','feedback','acceptedSlot','slotSummary','continueAvailable','variantVerified','quotedCny','listComplete','dates','times','selectedDate','paymentMethod','extras','existingOrdersChecked','orderRefHash','orderDetailLink','configuration','contactStep','paymentStep','reviewProgress','extrasConflict','fulfillmentChoice','merchantError','needsSelection','nextChoice','orderSummary','prelaunchConfigurable','productForm','productFormLoading','quantitySource','receiptVerified','receiptAwaitingPayment','selectedProductChoices','summaryReadable','termsLinks','primaryTermsUrl','reason']);
function safeOutput(value,depth=0){
 if(depth>16)throw Error('NativeResultNotAllowed');
 if(!value||typeof value!=='object')return;
 if(Array.isArray(value)){if(value.length>200)throw Error('NativeResultNotAllowed');for(const item of value)safeOutput(item,depth+1);return;}
 for(const [key,item]of Object.entries(value)){if(/^(?:password|passwd|cookie|cookies|authorization|accessToken|refreshToken|otp|email|phone|identitySuffix|firstName|lastName|privatePickupData|rawPrivate)$/i.test(key))throw Error('NativeResultNotAllowed');safeOutput(item,depth+1);}
}
export class CheckoutRpcPeer{
 constructor({api,contextId,purchaseAllowed=false}){if(typeof contextId!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(contextId)||typeof purchaseAllowed!=='boolean')throw Error('NativeContextNotAllowed');this.api=api;this.contextId=contextId;this.purchaseAllowed=purchaseAllowed;this.tabs=new Map();this.requests=new Set();this.actions=new Set();this.taskId=null;this.actionTabId=null;this.busy=false;this.closed=false;
  this.login=new AppleLogin();this.onRemoved=id=>{if(this.tabs.has(id)){this.orderAudit?.removed(id);this.tabs.delete(id);}};api.tabs?.onRemoved?.addListener(this.onRemoved);
 }
 dispose(){this.closed=true;this.login.clear();this.api.tabs?.onRemoved?.removeListener(this.onRemoved);}
 async tab(id){if(!Number.isSafeInteger(id)||!this.tabs.has(id))throw Error('NativeTabNotOwned');const t=await this.api.tabs.get(id);if(!checkoutObservedUrl(t.url))throw Error('NativeAddressNotAllowed');return t;}
 async receive(value){
  let q;try{q=checkoutRequest(value,this.contextId);}catch{return {schema:CHECKOUT_RPC,kind:'reply',contextId:this.contextId,id:typeof value?.id==='string'?value.id.slice(0,80):'',ok:false,error:'NativeRequestNotAllowed'};}
  const reply=(ok,result)=>({schema:CHECKOUT_RPC,kind:'reply',contextId:this.contextId,id:q.id,ok,...(ok?{result}:{error:'NativeOperationUnconfirmed'})});
  if(this.closed||this.busy||this.requests.has(q.id)||this.requests.size>=5000&&q.operation!=='closeSession')return reply(false);
  this.requests.add(q.id);this.busy=true;
  try{
   if(R2_OPERATIONS.has(q.operation)){this.browserJob??=new BrowserJobExecutor({peer:this,locks:this.api.locks??globalThis.navigator?.locks});return boundedCheckoutJson(reply(true,await this.browserJob.operation(q.operation,q.payload)));}
   if(this.browserJob?.active){
    if(q.operation!=='closeSession')throw Error('R2BrowserOwnerActive');
    this.browserJob.stop();await this.browserJob.current?.promise;
   }
   return boundedCheckoutJson(reply(true,await this.operation(q.operation,q.payload)));
  }catch{return reply(false);}finally{this.busy=false;}
 }
 async operation(op,p,live=()=>{}){
  const guarded=new Proxy(this.api,{get:(target,name)=>{
   const group=Reflect.get(target,name,target);if(!['tabs','permissions','scripting'].includes(name))return group;
   return new Proxy(group,{get:(g,k)=>typeof g[k]==='function'?async(...args)=>{live();return g[k](...args);}:g[k]});
  }});
  const keys=allowed=>{if(Object.keys(p).some(k=>!allowed.includes(k)))throw Error('NativePayloadNotAllowed');};
  if(op==='executorVersion'){keys([]);return CHECKOUT_EXECUTOR_VERSION;}
  if(op==='configureLogin'){keys(['credentials']);return this.login.configure(p.credentials);}
  if(op==='loginStatus'){keys([]);return {...this.login.last};}
  if(op==='auditCancelledOrder'){
   keys(['plan','expectedRefHash']);if(!planAllowed(p.plan))throw Error('NativeOrderPlanNotAllowed');
   return auditCancelledOrder(guarded,p.plan,p.expectedRefHash);
  }
  if(op==='auditOrders'){
   keys(['plan','expectedRefHash','automatic']);if(!planAllowed(p.plan)||p.automatic!==undefined&&typeof p.automatic!=='boolean')throw Error('NativeOrderPlanNotAllowed');
   this.orderAudit??=new OrderAudit(this);const result=await this.orderAudit.run(guarded,p.plan,p.expectedRefHash??null,{automatic:p.automatic===true});
   if(result.state==='auth'&&this.orderAudit.tabId!==null)await this.login.attempt(guarded,this.orderAudit.tabId,live);
   return result;
  }
  if(op==='createExpiryProbe'){
   keys(['url']);let u;try{u=new URL(p.url);}catch{throw Error('NativeAddressNotAllowed');}
   if(!this.purchaseAllowed||this.tabs.size>=4||u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash||!/^secure\d+\.www\.apple\.com\.cn$/.test(u.hostname)&&u.hostname!=='www.apple.com.cn'||u.pathname!=='/shop/checkout')throw Error('NativeExpiryProbeNotAllowed');
   const t=await guarded.tabs.create({url:p.url,active:false});this.tabs.set(t.id,{last:null,navigation:null});return {id:t.id};
  }
  if(op==='containsHost'){
   keys(['origins']);if(!Array.isArray(p.origins)||p.origins.length!==1||typeof p.origins[0]!=='string'||p.origins[0]!=='https://*.www.apple.com.cn/*'&&!/^https:\/\/(?:www|secure\d*\.www)\.apple\.com\.cn\/\*$/.test(p.origins[0]))throw Error('NativeOriginNotAllowed');
   return await guarded.permissions.contains({origins:p.origins});
  }
  if(op==='closeSession'){
   keys([]);for(const id of this.tabs.keys()){this.orderAudit?.beginClose(id);try{await guarded.tabs.remove(id);}catch(error){if(this.tabs.has(id)&&!missingOwnedTab(error,id))throw error;}this.orderAudit?.removed(id);this.tabs.delete(id);}this.dispose();return {closed:true};
  }
  if(op==='createTab'){
   keys(['url','active']);if(![BAG,ENTRY].includes(p.url)||p.active!==undefined&&typeof p.active!=='boolean'||this.tabs.size>=4||p.url===ENTRY&&!this.purchaseAllowed)throw Error('NativeCreateNotAllowed');
   if(!await guarded.permissions.contains({origins:[new URL(p.url).origin+'/*']}))throw Error('NativeHostNotGranted');
   const tab=await guarded.tabs.create({url:p.url,active:p.active===true});if(!Number.isSafeInteger(tab?.id))throw Error('NativeTabUnconfirmed');this.tabs.set(tab.id,{last:null,navigation:null});return {id:tab.id,url:p.url,status:tab.status??'loading'};
  }
  const tab=await this.tab(p.tabId),state=this.tabs.get(p.tabId);
  if(state.orderAudit&&op!=='removeTab')throw Error('NativeOrderTabReserved');
  if(op==='getTab'){keys(['tabId']);const u=new URL(tab.url);return {id:p.tabId,url:u.origin+u.pathname,status:tab.status};}
  if(op==='removeTab'){keys(['tabId']);await guarded.tabs.remove(p.tabId);this.tabs.delete(p.tabId);return {removed:true};}
  if(!await guarded.permissions.contains({origins:[new URL(tab.url).origin+'/*']}))throw Error('NativeHostNotGranted');
  if(op==='updateTab'){
   keys(['tabId','url']);if(!checkoutUrl(tab.url)||!checkoutUrl(p.url))throw Error('NativeAddressNotAllowed');
   const receipt=state.last?.page.phase==='ORDER_RECEIPT'&&state.last.page.receiptVerified===true&&state.last.page.orderDetailLink===p.url;
   if(!receipt&&(!this.purchaseAllowed||state.navigation!==p.url))throw Error('NativeNavigationNotAuthorized');
   state.navigation=null;state.last=null;await guarded.tabs.update(p.tabId,{url:p.url});return {id:p.tabId,url:p.url,status:'loading'};
  }
  if(op!=='merchantDocument')throw Error('NativeOperationNotAllowed');
  keys(['tabId','documentId','plan','command']);if(!planAllowed(p.plan)||tab.status!=='complete')throw Error('NativeDocumentNotReady');
  const command=p.command;
  if(command&&!checkoutUrl(tab.url))throw Error('NativeCommandNotAllowed');
  if(command){
   checkoutCommand(command,p.plan);
   if(!this.purchaseAllowed||!state.last||p.documentId!==state.last.documentId||command.documentId!==p.documentId||command.expected!==JSON.stringify(state.last.page)||this.actions.has(command.id))throw Error('NativeActionNotAuthorized');
   if(this.taskId!==null&&(command.taskId!==this.taskId||p.tabId!==this.actionTabId))throw Error('NativeTaskBindingChanged');
   this.taskId=command.taskId;this.actionTabId=p.tabId;
   this.actions.add(command.id);state.navigation=null;state.last=null;
  }else{if(p.documentId!==undefined)throw Error('NativeReadTargetNotAllowed');state.last=null;state.navigation=null;}
  const rows=await guarded.scripting.executeScript({target:command?{tabId:p.tabId,documentIds:[p.documentId]}:{tabId:p.tabId,frameIds:[0]},world:'ISOLATED',func:merchantDocument,args:command?[p.plan,command]:[p.plan]});
  if(rows?.length!==1||rows[0].frameId!==0||!rows[0].documentId||rows[0].error||command&&rows[0].documentId!==p.documentId)throw Error('NativeScriptUnconfirmed');
  const result=boundedCheckoutJson(rows[0].result);
  if(!result||typeof result!=='object'||Array.isArray(result))throw Error('NativeScriptUnconfirmed');
  safeOutput(result);
  if(!command&&result.phase==='AUTH')await this.login.attempt(guarded,p.tabId,live);
  if(!command){
   if(result.schema!=='applebuy-merchant-read/v1'||Object.keys(result).some(k=>!PAGE_KEYS.has(k)))throw Error('NativePageNotAllowed');state.last={documentId:rows[0].documentId,page:result};state.navigation=null;
  }else{
   if(Object.keys(result).some(k=>!['delivered','touched','reason','summary'].includes(k))||typeof result.delivered!=='boolean')throw Error('NativeCommandResultNotAllowed');
   if(result.delivered===true&&['openProduct','openBag'].includes(command.action))state.navigation=command.action==='openProduct'?ENTRY:BAG;
  }
  return [{frameId:0,documentId:rows[0].documentId,result}];
 }
}
