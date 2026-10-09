// Named RPC facade for the production runtime. No arbitrary JS, cookies, authentication UI or personal browser SDK.
import {merchantDocument} from '../../web/checkout-connector/page-program.js';
import {CHECKOUT_RPC,checkoutUrl,boundedCheckoutJson} from '../../web/checkout-connector/checkout-rpc-contract.js';
export class NativeCheckoutApi{
 constructor({contextId,exchange,id=()=>crypto.randomUUID(),timeoutMs=10000}){if(typeof contextId!=='string'||typeof exchange!=='function'||!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>30000)throw Error('NativeCheckoutNotConnected');this.sessionId=contextId;this.controlledReview=true;this.exchange=exchange;this.id=id;this.timeoutMs=timeoutMs;this.active=false;this.closed=false;this.poisoned=false;}
 async request(operation,payload){
  if(this.active||this.closed||this.poisoned)throw Error('NativeCheckoutAlreadyRunning');this.active=true;
  const id=this.id();let timer;try{
   const sending=Promise.resolve().then(()=>this.exchange(boundedCheckoutJson({schema:CHECKOUT_RPC,kind:'request',contextId:this.sessionId,id,operation,payload})));
   const received=await Promise.race([sending,new Promise((_,no)=>timer=setTimeout(()=>{this.poisoned=true;no(Error('NativeCheckoutDeliveryUnknown'));},this.timeoutMs))]);
   const reply=boundedCheckoutJson(received);
   if(reply?.schema!==CHECKOUT_RPC||reply.kind!=='reply'||reply.contextId!==this.sessionId||reply.id!==id){this.poisoned=true;throw Error('NativeCheckoutResultUnconfirmed');}
   if(reply.ok!==true)throw Error('NativeCheckoutResultUnconfirmed');return reply.result;
  }finally{clearTimeout(timer);this.active=false;}
 }
 create(url){return this.tabs.create({url,active:true});}
 executorVersion(){return this.request('executorVersion',{});}
 r2Exchange(operation,payload){if(!/^r2(?:Version|Begin|Chunk|Run|Poll|Ack|Pause|Finish)$/.test(operation))throw Error('R2OperationInvalid');return this.request(operation,payload);}
 createExpiryProbe(url){return this.request('createExpiryProbe',{url});}
 get tabs(){return {create:async({url,active=false})=>{if(!checkoutUrl(url))throw Error('NativeAddressNotAllowed');return this.request('createTab',{url,active});},get:tabId=>this.request('getTab',{tabId}),remove:async tabId=>{const r=await this.request('removeTab',{tabId});if(r?.removed!==true)throw Error('NativeTabCloseUnconfirmed');},update:async(tabId,{url})=>{if(!checkoutUrl(url))throw Error('NativeAddressNotAllowed');return this.request('updateTab',{tabId,url});}};}
 get permissions(){return {contains:origins=>this.request('containsHost',origins)};}
 get scripting(){return {executeScript:async q=>{
  const target=q.target??{};
  if(q.func!==merchantDocument||q.world!=='ISOLATED'||!Number.isSafeInteger(target.tabId)||Object.keys(target).some(k=>!['tabId','frameIds','documentIds'].includes(k))||target.frameIds&&target.frameIds.join(',')!=='0'||target.documentIds&&(target.documentIds.length!==1||typeof target.documentIds[0]!=='string')||target.frameIds&&target.documentIds||!Array.isArray(q.args)||![1,2].includes(q.args.length))throw Error('NativeProgramNotAllowed');
  return this.request('merchantDocument',{tabId:target.tabId,...(target.documentIds?{documentId:target.documentIds[0]}:{}),plan:q.args[0],...(q.args.length===2?{command:q.args[1]}:{})});
 }};}
 async close(){if(this.closed)return;const r=await this.request('closeSession',{});if(r?.closed!==true)throw Error('NativeCleanupUnconfirmed');this.closed=true;}
}
