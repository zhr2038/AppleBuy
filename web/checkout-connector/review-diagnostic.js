// Closed diagnostic vocabulary only. Never purchase evidence or permission.
export const REVIEW_CHECK_CODES=Object.freeze(['trace-missing','document-changed','interaction-detected','payment-step-unconfirmed','final-already-sent','review-root','item','quantity','unexpected-store-or-fulfillment','amount','unexpected-slot','extras','payment-method','terms','pickup-notice','store-edit','dialog','task-proof']);
const PREFIX='review-check:',SUFFIX='; no automatic repeat';
export function reviewCheckCodes(reason){
 if(typeof reason!=='string'||reason.length>600||!reason.startsWith(PREFIX)||!reason.endsWith(SUFFIX))return [];
 const codes=reason.slice(PREFIX.length,-SUFFIX.length).split(',');
 return codes.length>0&&codes.length<=REVIEW_CHECK_CODES.length&&new Set(codes).size===codes.length&&codes.every(c=>REVIEW_CHECK_CODES.includes(c))?codes:[];
}
export function reviewCheckReason(reason){return reviewCheckCodes(reason).length?reason:null;}
