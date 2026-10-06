// Prepared checkout channel is distinct from the installed fixed readonly host. No browser/session activation here.
import {canonicalJson,NO_EXTRAS} from './job.js';
export const CHECKOUT_RPC='applebuy-native-checkout/v1';
export const CHECKOUT_PLAN={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{...NO_EXTRAS}};
export const ENTRY='https://www.apple.com.cn/shop/buy-iphone/iphone-18-pro',BAG='https://www.apple.com.cn/shop/bag';
const OPERATIONS=new Set(['createTab','getTab','removeTab','updateTab','containsHost','merchantDocument','closeSession']);
const ACTIONS=new Set(['configureProduct','continueProduct','addBag','viewBag','checkout','selectPickup','selectStore','selectDate','chooseSlot','fillDetails','selectPayment','continuePayment','submitOrder','openProduct','openBag','readOrderSummary']);
const COMMAND_KEYS=new Set(['action','id','documentId','beforePhase','deadline','choice','ref','date','start','end','generation','store','bagReadSeq','afterAddReconciliation','privatePickupData','authorized','structured','expected','plan','taskId','planDigest','summaryKey','finalGrant','intentId','contactOnly']);
export function checkoutUrl(raw){try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(u.hostname==='www.apple.com.cn'||/^secure\d*\.www\.apple\.com\.cn$/.test(u.hostname))&&/^\/shop\/(?:buy-iphone\/iphone-18-pro(?:\/[^/]+\/a)?|bag|checkout|order(?:\/[^?#]*)?|signIn(?:\/orders)?)(?:\/)?$/.test(u.pathname);}catch{return false;}}
export function boundedCheckoutJson(value){const text=JSON.stringify(value);if(typeof text!=='string'||new TextEncoder().encode(text).length>64000)throw Error('NativeFrameNotAllowed');return JSON.parse(text);}
export function planAllowed(plan){try{return canonicalJson(plan)===canonicalJson(CHECKOUT_PLAN);}catch{return false;}}
export function checkoutRequest(value,contextId){
 const q=boundedCheckoutJson(value);
 if(!q||Object.keys(q).sort().join(',')!=='contextId,id,kind,operation,payload,schema'||q.schema!==CHECKOUT_RPC||q.kind!=='request'||q.contextId!==contextId||typeof q.id!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(q.id)||!OPERATIONS.has(q.operation)||!q.payload||typeof q.payload!=='object'||Array.isArray(q.payload))throw Error('NativeRequestNotAllowed');
 return q;
}
export function checkoutCommand(command,plan){
 if(!command||typeof command!=='object'||Array.isArray(command)||Object.keys(command).some(k=>!COMMAND_KEYS.has(k))||!ACTIONS.has(command.action)||command.authorized!==true||command.structured!==true||typeof command.id!=='string'||!command.id||command.id.length>100||typeof command.taskId!=='string'||!command.taskId||command.taskId.length>100||typeof command.documentId!=='string'||typeof command.expected!=='string'||!planAllowed(plan)||command.plan!==undefined&&!planAllowed(command.plan))throw Error('NativeCommandNotAllowed');
 const fields=command.privatePickupData;
 if(fields!==undefined&&(command.action!=='fillDetails'||!fields||typeof fields!=='object'||Array.isArray(fields)||Object.entries(fields).some(([k,v])=>!['lastName','firstName','phone','email','identitySuffix'].includes(k)||typeof v!=='string'||v.length>100||k==='identitySuffix'&&!/^\d{4}$/.test(v))))throw Error('NativePrivateFieldNotAllowed');
 return command;
}
