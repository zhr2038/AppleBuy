import {merchantDocument} from './page-program.js';
export function allowedMerchantUrl(raw){try{const u=new URL(raw);return u.protocol==='https:'&&(u.hostname==='www.apple.com.cn'||/^secure(?:\d+)?\.www\.apple\.com\.cn$/.test(u.hostname))&&/^\/shop\/(?:buy-iphone\/(?:iphone-18-pro|iphone-duo)(?:\/[^/]+\/a)?|bag|checkout|order(?:\/[^?#]*)?|signIn)(?:\/)?$/.test(u.pathname);}catch{return false;}}
export class ChromePort {
  constructor(api,tabId,{authorized=false,privatePickupData={},initialSequence=0,acceptedSlot=null,pending=null,reviewGrant=null}={}){this.api=api;this.tabId=tabId;this.authorized=authorized;this.seq=initialSequence;this.generation=pending?.generation??0;this.last=null;this.privatePickupData=privatePickupData;this.acceptedSlot=acceptedSlot;this.reviewGrant=reviewGrant;this.lastChoice=pending?.action==='chooseSlot'?{date:pending.date,start:pending.start,end:pending.end}:null;}
  async permission(){const t=await this.api.tabs.get(this.tabId);if(!allowedMerchantUrl(t.url))throw new Error('UnsupportedMerchantPage');const u=new URL(t.url);return await this.api.permissions.contains({origins:[u.origin+'/*']});}
  async observe(plan){
    if(!await this.permission())throw new Error('CurrentHostPermissionMissing');
    const r=await this.api.scripting.executeScript({target:{tabId:this.tabId,frameIds:[0]},world:'ISOLATED',func:merchantDocument,args:[plan]});
    if(r.length!==1||r[0].frameId!==0||!r[0].documentId||r[0].error||!r[0].result)throw new Error('CurrentDocumentUnrecognized');
    const raw=r[0].result;const fingerprint=JSON.stringify([raw.dates,raw.times,raw.selectedDate]);if(!this.last||fingerprint!==this.last.fingerprint)this.generation++;
    this.last={raw:structuredClone(raw),fingerprint,documentId:r[0].documentId};
    if(this.lastChoice&&['DETAILS','PAYMENT','REVIEW'].includes(raw.phase)&&raw.verifiedStep&&raw.purchase?.verified){this.acceptedSlot={date:this.lastChoice.date,start:this.lastChoice.start,end:this.lastChoice.end,verified:true,basis:'normal-checkout-progression; not a hold guarantee'};this.lastChoice=null;}
    const humanReview=this.reviewGrant?.expiry>Date.now()&&(this.reviewGrant.documentId===r[0].documentId||(this.reviewGrant.start===true&&raw.termsLinks?.includes(this.reviewGrant.termsUrl)));
    return {...raw,acceptedSlot:this.acceptedSlot,extras:humanReview&&this.reviewGrant.noExtras?false:raw.extras,existingOrdersChecked:humanReview&&this.reviewGrant.existingOrdersChecked===true,documentId:r[0].documentId,seq:++this.seq,generation:this.generation};
  }
  async act(command){
    if(!this.authorized||!this.last||command.documentId!==this.last.documentId||!await this.permission())throw new Error('CurrentOperationNotAuthorized');
    if(command.action==='chooseSlot')this.lastChoice={date:command.date,start:command.start,end:command.end};
    const r=await this.api.scripting.executeScript({target:{tabId:this.tabId,documentIds:[command.documentId]},world:'ISOLATED',func:merchantDocument,args:[command.plan,{...command,privatePickupData:command.action==='fillDetails'?this.privatePickupData:undefined,authorized:true,expected:JSON.stringify(this.last.raw)}]});
    if(r.length!==1||r[0].documentId!==command.documentId||r[0].error||r[0].result?.delivered!==true)throw new Error('MutationResultUnknown');return r[0].result;
  }
  async lookupOrder(plan,expectedRef){
    let o=await this.observe(plan);
    if(o.phase==='ORDER_RECEIPT'&&expectedRef&&o.orderRefHash===expectedRef&&o.receiptVerified&&o.orderDetailLink){
      // Navigate ONLY the link observed in this exact receipt. No reconstructed order/account endpoint.
      const link=new URL(o.orderDetailLink);if(!allowedMerchantUrl(link.href)||!await this.api.permissions.contains({origins:[link.origin+'/*']}))return {state:'unknown',independent:false};
      await this.api.tabs.update(this.tabId,{url:link.href});
      for(let n=0;n<40;n++){await this.wait(50);o=await this.observe(plan);if(o.phase!=='ORDER_RECEIPT'&&o.phase!=='PROCESSING')break;}
    }
    if(o.phase!=='ORDER_DETAIL'||!expectedRef||o.orderRefHash!==expectedRef||!o.purchase?.verified||!o.slotSummary?.verified)return {state:'unknown',independent:false};
    // An actual separately opened detail route, exact hashed receipt identity, current fields and unpaid state.
    return {state:'unpaid',independent:true,orderRefHash:o.orderRefHash,purchase:o.purchase,acceptedSlot:o.slotSummary};
  }
  async wait(ms){await new Promise(r=>setTimeout(r,ms));}
}
