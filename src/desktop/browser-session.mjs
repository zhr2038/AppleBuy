// Same production purchasing controller, application-owned transport. Live buying requires a carried valid ledger/authority.
import {PurchaseJob,TASK_KEY,validStored,canonicalJson,normalizeIntent,NO_EXTRAS} from '../../web/checkout-connector/job.js';
import {ChromePort} from '../../web/checkout-connector/chrome-port.js';
import {createHash,randomUUID} from 'node:crypto';
import {validateDesktopCartTransfer} from './cart-transfer.mjs';
export const PRO_PLAN={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{...NO_EXTRAS}};
export const proDigest=createHash('sha256').update(JSON.stringify(PRO_PLAN)).digest('hex');
const activeStores=new WeakSet();
// New-context migration cannot hide a final in an older retained snapshot/history. No missing/cyclic history is absence proof.
export function legacyFinalProofClear(record){
 const stack=[record],seen=new Set();let count=0;
 while(stack.length){const value=stack.pop();if(value===null||typeof value!=='object')continue;if(seen.has(value)||++count>3000)return false;seen.add(value);
  if(value.finalIntent!=null||value.orderRefHash!=null||value.orderDetailLink!=null||value.action==='submitOrder'||typeof value.event==='string'&&/final/.test(value.event))return false;
  if(Array.isArray(value)){if(value.length>200)return false;stack.push(...value);}else stack.push(...Object.values(value));
 }return true;
}
export async function runDesktopSession(options){
 const {store,mode='public-config'}=options;if(activeStores.has(store))throw Error('DesktopSessionAlreadyRunning');activeStores.add(store);let lease;
 try{if(mode==='purchase'||mode==='reconcile'){if(typeof store.acquireOwner!=='function')throw Error('DesktopOwnerLeaseRequired');lease=await store.acquireOwner();if(lease?.owned!==true)throw Error('DesktopOwnerLeaseUnconfirmed');}return await executeSession(options);}
 finally{try{await lease?.release();}finally{activeStores.delete(store);}}
}
async function executeSession({api,tabId,store,mode='public-config',authority=null,onState=()=>{},privatePickupData={},signal=null}){
  if(signal?.aborted)throw Error('DesktopSessionCancelled');
  if(!['public-config','purchase','reconcile'].includes(mode))throw Error('DesktopModeNotAuthorized');
  let old=null,grant=null;
  if(mode==='reconcile'){
    old=await store.get(TASK_KEY);
    if(!old||!validStored(old)||old.state==='RETIRED'||old.reconcileOnly!==true||canonicalJson(normalizeIntent(old.plan))!==canonicalJson(PRO_PLAN))throw Error('DesktopReadonlyHandoffRequired');
  }
  if(mode==='purchase'){
    old=await store.get(TASK_KEY);
    if(!old||!validStored(old))throw Error('DesktopLegacyHandoffRequired');
    if(old.reconcileOnly===true)throw Error('DesktopLegacyResultStillUnconfirmed; DesktopHandoffPermanentlyRevokedSource');
    const own=typeof api.sessionId==='string'&&old.desktopContext===api.sessionId;
    if(!own&&!legacyFinalProofClear(old))throw Error('DesktopLegacyFinalHistoryUnconfirmed');
    if(!own&&(old.pending||old.finalIntent||old.acceptedSlot||old.reconcileOnly===true))throw Error('DesktopLegacyResultStillUnconfirmed');
    if(!own&&old.state!=='RETIRED')throw Error('DesktopContextIdentityUnconfirmed');
    if(authority?.checkoutApproved!==true||authority?.legacyOwnershipRevoked!==true||authority?.newContextConfirmed!==true||authority?.planDigest!==proDigest||canonicalJson(normalizeIntent(old.plan))!==canonicalJson(PRO_PLAN))throw Error('DesktopPurchaseAuthorityMissing');
    if(old.state!=='RETIRED'&&old.tabId!==tabId)throw Error('DesktopLegacyTabBindingUnconfirmed');
    if(authority.finalConsent){
      const c=authority.finalConsent;
      if(!own||old.lastPhase!=='REVIEW'||old.pending||old.finalIntent||c.termsAccepted!==true||c.existingOrdersChecked!==true||c.noExtras!==true||c.taskId!==old.taskId||c.documentId!==old.lastDocumentId||!Number.isFinite(c.acceptedAt)||Date.now()-c.acceptedAt<0||Date.now()-c.acceptedAt>60000||typeof c.termsUrl!=='string')throw Error('DesktopFinalConsentNotCurrent');
      grant={id:randomUUID(),taskId:old.taskId,planDigest:proDigest,start:false,documentId:old.lastDocumentId,expiry:Math.min(old.expiresAt,Date.now()+60000),existingOrdersChecked:true,noExtras:true,termsAccepted:true,termsUrl:c.termsUrl};
    }
  }
  const port=new ChromePort(api,tabId,{authorized:mode!=='reconcile',mode:mode==='public-config'?'public-config':mode==='reconcile'?'observe':'purchase',orderSummary:mode==='purchase',privatePickupData:mode==='reconcile'?{}:privatePickupData,pending:old?.pending,acceptedSlot:old?.acceptedSlot,initialSequence:old?.lastRead??0,reviewGrant:grant});
  port.desktopTransferProof=mode==='purchase'?validateDesktopCartTransfer(old,api):null;
  const boundStore={get:k=>store.get(k),put:(k,v)=>store.put(k,k===TASK_KEY&&mode!=='reconcile'?{...v,desktopContext:api.sessionId}:v)};
  const job=new PurchaseJob({store:boundStore,port,maxSteps:100,maxWaitMs:15000});job.onState=s=>onState({state:s.state,phase:s.phase,reason:s.reason,pendingAction:s.pendingAction});
  const cancel=()=>job.pause();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
  try{
    const result=await job.run(PRO_PLAN,{tabId,planDigest:mode==='reconcile'?old.planDigest:proDigest,taskId:old?.state==='RETIRED'?randomUUID():old?.taskId??randomUUID(),mode:mode==='reconcile'?'purchase':mode,rebind:mode==='reconcile',grant});
    return {state:result.state,phase:result.lastPhase,reason:result.reason,realOrderVerified:mode==='purchase'&&result.state==='CONFIRMED_UNPAID',quoteCny:port.last?.raw.quotedCny??null,skuPath:port.last?.raw.productForm?.ready===true?port.last.raw.path:null};
  }finally{signal?.removeEventListener('abort',cancel);}
}
