// Scope of the user's labelled Start click: same task, fixed plan, displayed terms, one final, no payment.
import {proDigest} from './browser-session.mjs';
export const START_TERMS='https://www.apple.com.cn/shop/browse/open/salespolicies';
export class StartApproval {
 constructor(){this.clear();}
 clear(){this.binding=null;this.used=false;}
 bind(row,terms){
  // A continuation cannot mint approval for another task or a previous unknown/rejected final.
  if(this.binding||this.used)return;
  if(terms!==START_TERMS||row?.planDigest!==proDigest||!row.taskId||row.reconcileOnly===true||row.finalIntent||row.pending?.action==='submitOrder'||row.finalRejections?.length||row.expiresAt<=Date.now())return;
  this.binding={taskId:row.taskId,expiresAt:row.expiresAt,termsUrl:terms};
 }
 consume(row,descriptor){
  const b=this.binding;
  if(this.used||!b||!descriptor||row?.taskId!==b.taskId||row.planDigest!==proDigest||row.expiresAt!==b.expiresAt||row.expiresAt<=Date.now()||row.reconcileOnly===true||row.pending||row.finalIntent||row.finalRejections?.length||descriptor.taskId!==b.taskId||descriptor.documentId!==row.lastDocumentId||descriptor.termsUrl!==b.termsUrl||!Number.isFinite(descriptor.totalCny)||descriptor.totalCny<=0||descriptor.totalCny>9999)return false;
  this.used=true;this.binding=null;return true;
 }
}
