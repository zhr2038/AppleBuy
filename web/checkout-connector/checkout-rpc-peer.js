// Own Chrome tabs only; fixed reviewed merchant program only. Prepared and unreachable from the installed readonly link.
import {merchantDocument} from './page-program.js';
import {canonicalJson} from './job.js';
import {CHECKOUT_RPC,BAG,ENTRY,checkoutUrl,checkoutObservedUrl,checkoutRequest,checkoutCommand,planAllowed,boundedCheckoutJson} from './checkout-rpc-contract.js';
const PAGE_KEYS=new Set(['schema','phase','purchase','verifiedStep','path','feedback','acceptedSlot','slotSummary','continueAvailable','variantVerified','quotedCny','listComplete','dates','times','selectedDate','paymentMethod','extras','existingOrdersChecked','orderRefHash','orderDetailLink','configuration','contactStep','extrasConflict','fulfillmentChoice','merchantError','needsSelection','nextChoice','orderSummary','prelaunchConfigurable','productForm','productFormLoading','quantitySource','receiptVerified','selectedProductChoices','summaryReadable','termsLinks','reason']);
function safeOutput(value,depth=0){
 if(depth>16)throw Error('NativeResultNotAllowed');
 if(!value||typeof value!=='object')return;
 if(Array.isArray(value)){if(value.length>200)throw Error('NativeResultNotAllowed');for(const item of value)safeOutput(item,depth+1);return;}
 for(const [key,item]of Object.entries(value)){if(/^(?:password|passwd|cookie|cookies|authorization|accessToken|refreshToken|otp|email|phone|identitySuffix|firstName|lastName|privatePickupData|rawPrivate)$/i.test(key))throw Error('NativeResultNotAllowed');safeOutput(item,depth+1);}
}
export class CheckoutRpcPeer{
 constructor({api,contextId,purchaseAllowed=false}){if(typeof contextId!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(contextId)||typeof purchaseAllowed!=='boolean')throw Error('NativeContextNotAllowed');this.api=api;this.contextId=contextId;this.purchaseAllowed=purchaseAllowed;this.tabs=new Map();this.requests=new Set();this.actions=new Set();this.taskId=null;this.actionTabId=null;this.busy=false;this.closed=false;}
 async tab(id){if(!Number.isSafeInteger(id)||!this.tabs.has(id))throw Error('NativeTabNotOwned');const t=await this.api.tabs.get(id);if(!checkoutObservedUrl(t.url))throw Error('NativeAddressNotAllowed');return t;}
 async receive(value){
  let q;try{q=checkoutRequest(value,this.contextId);}catch{return {schema:CHECKOUT_RPC,kind:'reply',contextId:this.contextId,id:typeof value?.id==='string'?value.id.slice(0,80):'',ok:false,error:'NativeRequestNotAllowed'};}
  const reply=(ok,result)=>({schema:CHECKOUT_RPC,kind:'reply',contextId:this.contextId,id:q.id,ok,...(ok?{result}:{error:'NativeOperationUnconfirmed'})});
  if(this.closed||this.busy||this.requests.has(q.id)||this.requests.size>=5000&&q.operation!=='closeSession')return reply(false);
  this.requests.add(q.id);this.busy=true;
  try{return boundedCheckoutJson(reply(true,await this.operation(q.operation,q.payload)));}catch{return reply(false);}finally{this.busy=false;}
 }
 async operation(op,p){
  const keys=allowed=>{if(Object.keys(p).some(k=>!allowed.includes(k)))throw Error('NativePayloadNotAllowed');};
  if(op==='containsHost'){
   keys(['origins']);if(!Array.isArray(p.origins)||p.origins.length!==1||typeof p.origins[0]!=='string'||p.origins[0]!=='https://*.www.apple.com.cn/*'&&!/^https:\/\/(?:www|secure\d*\.www)\.apple\.com\.cn\/\*$/.test(p.origins[0]))throw Error('NativeOriginNotAllowed');
   return await this.api.permissions.contains({origins:p.origins});
  }
  if(op==='closeSession'){
   keys([]);for(const id of this.tabs.keys()){await this.api.tabs.remove(id);this.tabs.delete(id);}this.closed=true;return {closed:true};
  }
  if(op==='createTab'){
   keys(['url','active']);if(![BAG,ENTRY].includes(p.url)||p.active!==undefined&&typeof p.active!=='boolean'||this.tabs.size>=4||p.url===ENTRY&&!this.purchaseAllowed)throw Error('NativeCreateNotAllowed');
   if(!await this.api.permissions.contains({origins:[new URL(p.url).origin+'/*']}))throw Error('NativeHostNotGranted');
   const tab=await this.api.tabs.create({url:p.url,active:p.active===true});if(!Number.isSafeInteger(tab?.id))throw Error('NativeTabUnconfirmed');this.tabs.set(tab.id,{last:null,navigation:null});return {id:tab.id,url:p.url,status:tab.status??'loading'};
  }
  const tab=await this.tab(p.tabId),state=this.tabs.get(p.tabId);
  if(op==='getTab'){keys(['tabId']);const u=new URL(tab.url);return {id:p.tabId,url:u.origin+u.pathname,status:tab.status};}
  if(op==='removeTab'){keys(['tabId']);await this.api.tabs.remove(p.tabId);this.tabs.delete(p.tabId);return {removed:true};}
  if(!await this.api.permissions.contains({origins:[new URL(tab.url).origin+'/*']}))throw Error('NativeHostNotGranted');
  if(op==='updateTab'){
   keys(['tabId','url']);if(!checkoutUrl(tab.url)||!checkoutUrl(p.url))throw Error('NativeAddressNotAllowed');
   const receipt=state.last?.page.phase==='ORDER_RECEIPT'&&state.last.page.receiptVerified===true&&state.last.page.orderDetailLink===p.url;
   if(!receipt&&(!this.purchaseAllowed||state.navigation!==p.url))throw Error('NativeNavigationNotAuthorized');
   state.navigation=null;state.last=null;await this.api.tabs.update(p.tabId,{url:p.url});return {id:p.tabId,url:p.url,status:'loading'};
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
  const rows=await this.api.scripting.executeScript({target:command?{tabId:p.tabId,documentIds:[p.documentId]}:{tabId:p.tabId,frameIds:[0]},world:'ISOLATED',func:merchantDocument,args:command?[p.plan,command]:[p.plan]});
  if(rows?.length!==1||rows[0].frameId!==0||!rows[0].documentId||rows[0].error||command&&rows[0].documentId!==p.documentId)throw Error('NativeScriptUnconfirmed');
  const result=boundedCheckoutJson(rows[0].result);
  if(!result||typeof result!=='object'||Array.isArray(result))throw Error('NativeScriptUnconfirmed');
  safeOutput(result);
  if(!command){
   if(result.schema!=='applebuy-merchant-read/v1'||Object.keys(result).some(k=>!PAGE_KEYS.has(k)))throw Error('NativePageNotAllowed');state.last={documentId:rows[0].documentId,page:result};state.navigation=null;
  }else{
   if(Object.keys(result).some(k=>!['delivered','touched','reason','summary'].includes(k))||typeof result.delivered!=='boolean')throw Error('NativeCommandResultNotAllowed');
   if(result.delivered===true&&['openProduct','openBag'].includes(command.action))state.navigation=command.action==='openProduct'?ENTRY:BAG;
  }
  return [{frameId:0,documentId:rows[0].documentId,result}];
 }
}
