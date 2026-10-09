// Current native REVIEW facts plus this same controlled task's earlier choices. Never merchant store/slot/hold proof.
export const REVIEW_PROGRESS_KIND='native-controlled-review-progression/v1';
export const UNRELEASED_FINAL_KIND='browser-stopped-before-checkpoint-ack/v1';
export function knownUnreleasedFinal(row){
 const f=row?.finalIntent,p=f?.notDispatched;
 return f?.sent===false&&p?.kind===UNRELEASED_FINAL_KIND&&p.intentId===f.id&&p.taskId===row.taskId&&p.contextId===row.desktopContext&&p.documentId===row.lastDocumentId&&typeof p.runId==='string'&&p.runId.length>=8&&Number.isSafeInteger(p.sequence)&&p.sequence>0&&/^[a-f0-9]{64}$/.test(p.sha256);
}
const time=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
export function currentReviewProgress(plan,row,observation,{contextOwned=false,now=Date.now()}={}){
 const w=observation?.reviewProgress,p=observation?.purchase,a=row?.acceptedSlot;
 if(contextOwned!==true||row?.reconcileOnly===true||row?.expiresAt<=now||row?.finalIntent!=null&&!knownUnreleasedFinal(row)||row?.orderRefHash!=null||row?.orderDetailLink!=null||
   observation?.phase!=='REVIEW'||observation.verifiedStep!==true||w?.kind!==REVIEW_PROGRESS_KIND||w.controlled!==true||typeof w.id!=='string'||!w.id||
   w.taskId!==row.taskId||w.planDigest!==row.planDigest||w.documentId!==observation.documentId||w.intervened!==false||w.store!==plan.stores?.[0]||
   w.paymentMethod!==plan.paymentMethod||observation.paymentMethod!==plan.paymentMethod||observation.extras!==false||typeof observation.primaryTermsUrl!=='string'||
   !observation.termsLinks?.includes(observation.primaryTermsUrl)||w.pickupNotice!=='取货日期待付款完成后确定。'||
   p?.itemVerified!==true||p.verified!==false||p.model!==plan.product?.model||p.capacity!==plan.product?.capacity||p.color!==plan.product?.color||p.quantity!==1||
   !Number.isFinite(p.totalCny)||p.totalCny<=0||p.totalCny>plan.maxTotalCny||p.store!==null||p.fulfillment!==null||observation.slotSummary!==null||
   a?.verified!==true||a.basis!=='contact-only-details-after-sent-slot; inherited task identity; not a hold guarantee'||typeof a.date!=='string'||!time.test(a.start)||!time.test(a.end)||a.start>=a.end||w.date!==a.date||w.start!==a.start||w.end!==a.end||
   row.initialDates?.[row.dateCursor]!==a.date||row.floors?.[a.date]!==a.start||row.rejected?.some(r=>r.date===a.date&&r.start===a.start&&r.end===a.end))return null;
 const money=[row.bagTotalCny,row.quotedCny].filter(v=>v!=null);
 if(!money.length||money.some(v=>v!==p.totalCny)||w.totalCny!==p.totalCny)return null;
 const pending=row.pending;
 if(pending){if(pending.action!=='continuePayment'||pending.beforePhase!=='PAYMENT'||pending.paymentOnly!==true||pending.dispatched===false||pending.documentId!==observation.documentId)return null;}
 else if(row.reviewProgress?.id!==w.id||row.reviewProgress?.documentId!==observation.documentId)return null;
 return {kind:REVIEW_PROGRESS_KIND,id:w.id,documentId:observation.documentId,store:w.store,date:w.date,start:w.start,end:w.end,totalCny:p.totalCny,
   factsOrigin:'current SKU/quantity/money/provider; store and time from this controlled originating task',pickupNotice:w.pickupNotice,heldSlotVerified:false};
}
