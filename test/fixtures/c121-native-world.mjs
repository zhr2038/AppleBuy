// Production Runtime/Job/ChromePort/named-RPC peer. Chrome/merchant/authority/data remain FAKE; no installation or website.
import assert from 'node:assert/strict';
import {NativeCheckoutApi} from '../../src/desktop/native-checkout-api.mjs';
import {CheckoutRpcPeer} from '../../web/checkout-connector/checkout-rpc-peer.js';
import {CHECKOUT_RPC,BAG,CHECKOUT_PLAN} from '../../web/checkout-connector/checkout-rpc-contract.js';
import {merchantDocument} from '../../web/checkout-connector/page-program.js';
import {DesktopCheckoutRuntime} from '../../src/desktop/checkout-runtime.mjs';
import {PRO_PLAN,proDigest} from '../../src/desktop/browser-session.mjs';
import {createPurchaseRecord,TASK_KEY} from '../../web/checkout-connector/job.js';
const TERMS='https://www.apple.com.cn/shop/open/salespolicies',CONTEXT='FAKE-C121-native-session';
export function world({purchaseAllowed=true,refuse=false,requireAuth=false,contextId=CONTEXT}={}){
 const w={phase:'EMPTY_BAG',count:0,nextId:1,mainId:null,tabs:new Map(),commands:[],rows:[],slot:null,payment:null,ref:null,feedback:null,last:'21:15',date:'2099年1月1日',firstRefused:false,writes:0,releases:0,requireAuth,refuse,
 row:{...createPurchaseRecord(PRO_PLAN,{taskId:'FAKE-retired',planDigest:proDigest,tabId:999,now:Date.now(),id:()=> 'FAKE'}),state:'RETIRED'}};
 const chrome={permissions:{async contains(){return true;}},tabs:{async create({url}){const id=w.nextId++;w.tabs.set(id,{id,url,status:'complete',version:1});if(w.mainId===null)w.mainId=id;return {id,url,status:'complete'};},async get(id){const t=w.tabs.get(id);if(!t)throw Error('FAKE missing tab');return {...t};},async update(id,{url}){const t=w.tabs.get(id);t.url=url;t.version++;if(url.includes('/buy-iphone/'))w.phase='VARIANT';},async remove(id){assert.ok(w.tabs.has(id));w.tabs.delete(id);}},scripting:{async executeScript(q){
  assert.equal(q.func,merchantDocument);assert.equal(q.world,'ISOLATED');const t=w.tabs.get(q.target.tabId);if(!t)throw Error('FAKE missing tab');const doc='FAKE-doc-'+t.id+'-'+t.version,c=q.args[1];
  if(q.target.documentIds&&q.target.documentIds[0]!==doc)throw Error('FAKE replaced document');
  if(c){w.commands.push(c.action);w.rows.push(structuredClone(c));if(c.action==='addBag'){w.count=1;w.phase='BAG';}else if(c.action==='checkout'){w.phase=w.requireAuth?'AUTH':'FULFILLMENT';t.url=w.requireAuth?'https://secure8.www.apple.com.cn/shop/signIn':'https://secure8.www.apple.com.cn/shop/checkout';t.version++;}else if(c.action==='selectPickup')w.phase='SLOTS';else if(c.action==='chooseSlot'){
    if(w.refuse){w.refuse=false;w.firstRefused=true;w.last='21:30';w.feedback={kind:'slot-refused',verified:true,ref:c.ref,generation:c.generation+1};}
    else{w.feedback=null;w.slot={date:c.date,start:c.start,end:c.end,verified:true};w.phase='DETAILS';}
   }else if(c.action==='selectDate')w.date=c.date;else if(c.action==='fillDetails')w.phase='PAYMENT';else if(c.action==='selectPayment')w.payment='支付宝';else if(c.action==='continuePayment')w.phase='REVIEW';else if(c.action==='submitOrder'){w.ref='e'.repeat(64);w.phase='ORDER_RECEIPT';}
   return [{frameId:0,documentId:doc,result:{delivered:true}}];
  }
  const side=t.id!==w.mainId,detail=t.url.includes('/order/detail/'),phase=side?(w.count?'BAG':'EMPTY_BAG'):detail?'ORDER_DETAIL':w.phase;
 const quantity=w.mergedQuantity??1,oneLine=(w.mergedLines??1)===1;
 const p={...PRO_PLAN.product,quantity,totalCny:9999*quantity,verified:oneLine,itemVerified:oneLine,fulfillment:'pickup',store:PRO_PLAN.stores[0],storeVerified:true};
  const raw={schema:'applebuy-merchant-read/v1',phase,path:new URL(t.url).pathname,verifiedStep:phase!=='AUTH',purchase:p,extras:false,variantVerified:true,quotedCny:9999,nextChoice:null,feedback:w.feedback,acceptedSlot:w.slot,slotSummary:w.slot,paymentMethod:w.payment,termsLinks:[TERMS],receiptVerified:!!w.ref,orderRefHash:w.ref,orderDetailLink:w.ref?'https://secure8.www.apple.com.cn/shop/order/detail/FAKE/FAKE':null};
  if(phase==='FULFILLMENT'){p.fulfillment=null;raw.fulfillmentChoice='unselected';}
  if(phase==='SLOTS'){raw.listComplete=true;raw.selectedDate=w.date;raw.dates=['2099年1月1日','2099年1月2日','2099年1月3日'].map((label,index)=>({label,ref:'date:'+index,enabled:index!==0||!w.firstRefused,selected:label===w.date}));raw.times=[{start:'09:00',end:'09:15',ref:'time:1',enabled:true},{start:w.last,end:w.last==='21:15'?'21:30':'21:45',ref:w.last==='21:15'?'time:46':'time:47',enabled:true}];}
 return [{frameId:0,documentId:doc,result:raw}];
 }}};
 const peer=new CheckoutRpcPeer({api:chrome,contextId,purchaseAllowed});let frames=0;
 const api=new NativeCheckoutApi({contextId,exchange:q=>{frames++;return peer.receive(structuredClone(q));}});
 const store={async get(){return structuredClone(w.row);},async put(k,row){assert.equal(k,TASK_KEY);w.row=structuredClone(row);w.writes++;},async acquireOwner(){return {owned:true,release:async()=>{w.releases++;}};}};
 const runtime=new DesktopCheckoutRuntime({store,launch:async()=>({api,close:()=>api.close()})});return {w,chrome,peer,api,runtime,get frames(){return frames;}};
}
