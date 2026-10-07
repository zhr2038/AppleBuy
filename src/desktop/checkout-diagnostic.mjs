// Closed observation metadata only; never authority, customer fields, urls, references or arbitrary error messages.
import {itemMatches} from '../../web/checkout-connector/job.js';
export function bagPlanCheck(observation,plan){
 if(observation?.phase!=='BAG')return null;const p=observation.purchase;
 return {schema:'applebuy-bag-check/v1',verifiedStep:observation.verifiedStep===true,matchesPlan:itemMatches(plan,p)===true,
  modelMatches:p?.model===plan.product.model,capacityMatches:p?.capacity===plan.product.capacity,colorMatches:p?.color===plan.product.color,
  quantity:Number.isSafeInteger(p?.quantity)&&p.quantity>=0&&p.quantity<=200?p.quantity:null,
  totalCny:Number.isFinite(p?.totalCny)&&p.totalCny>0&&p.totalCny<=1000000?p.totalCny:null,extrasClear:observation.extras===false};
}
const CODES=new Set(['DesktopTransferNeedsExplicitCurrentApproval','DesktopTransferLegacyUnconfirmed','DesktopTransferOldSlotWindowUnconfirmed','DesktopTransferNeedsCurrentMatchingSingleton','DesktopTransferBagChanged','DesktopTransferRecordChanged','DesktopTransferProspectiveUnconfirmed','DesktopTransferCancelled','DesktopOwnerLeaseLost','DesktopOwnerWriteUnconfirmed','CurrentHostPermissionMissing','UnsupportedMerchantPage','ScriptTransportRejected','NativeCheckoutResultUnconfirmed','NativeCheckoutDeliveryUnknown']);
export function safeCheckoutDiagnostic(error){return CODES.has(error?.message)?error.message:'CheckoutResultUnconfirmed';}
