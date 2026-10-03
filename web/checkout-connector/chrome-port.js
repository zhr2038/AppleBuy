import {merchantDocument} from './page-program.js';
import {canonicalJson} from './job.js';
export function allowedMerchantUrl(raw){try{const u=new URL(raw);return u.protocol==='https:'&&(u.hostname==='www.apple.com.cn'||/^secure(?:\d+)?\.www\.apple\.com\.cn$/.test(u.hostname))&&/^\/shop\/(?:buy-iphone\/(?:iphone-18-pro|iphone-duo)(?:\/[^/]+\/a)?|bag|checkout|order(?:\/[^?#]*)?|signIn(?:\/orders)?)(?:\/)?$/.test(u.pathname);}catch{return false;}}
export class ChromePort {
  // mode 'observe': act can never run. mode 'public-config': only public product choices, never Add to Bag or later.
  // C029 (Claude): orderSummary enables the ordinary order-summary disclosure read, only for an authorized purchase port.
  constructor(api,tabId,{authorized=false,mode='purchase',privatePickupData={},initialSequence=0,acceptedSlot=null,pending=null,reviewGrant=null,orderSummary=false}={}){this.api=api;this.tabId=tabId;this.mode=mode;this.authorized=authorized&&mode!=='observe';this.seq=initialSequence;this.generation=pending?.generation??0;this.last=null;this.privatePickupData=privatePickupData;this.acceptedSlot=acceptedSlot;this.reviewGrant=reviewGrant;this.lastChoice=pending?.action==='chooseSlot'?{date:pending.date,start:pending.start,end:pending.end}:null;
    this.orderSummary=orderSummary===true&&this.authorized&&mode==='purchase';this.summaryKey=this.orderSummary?crypto.randomUUID():null;this.summaryDocumentId=null;}
  async permission(){this.currentOrigin=null;const t=await this.api.tabs.get(this.tabId);if(!allowedMerchantUrl(t.url))throw new Error('UnsupportedMerchantPage');const u=new URL(t.url);this.currentOrigin=u.origin;return await this.api.permissions.contains({origins:[u.origin+'/*']});}
  async observe(plan){
    if(!await this.permission())throw Object.assign(new Error('CurrentHostPermissionMissing'),{origin:this.currentOrigin});
    const r=await this.api.scripting.executeScript({target:{tabId:this.tabId,frameIds:[0]},world:'ISOLATED',func:merchantDocument,args:[plan]});
    if(r.length!==1||r[0].frameId!==0||!r[0].documentId||r[0].error||!r[0].result)throw new Error('CurrentDocumentUnrecognized');
    // C-018: a list generation advances only on a changed date/time fact or order, never on reordered object members alone.
    const page=r[0].result;const fingerprint=canonicalJson([page.dates,page.times,page.selectedDate]);if(!this.last||fingerprint!==this.last.fingerprint)this.generation++;
    // C029 (Claude): a summary-sourced quantity counts only when THIS port read that summary on this exact document. Another run's
    // record (restart, second control page, observe port) is shown as unverified; the page's own raw stays the action's expectation.
    const ownSummary=this.orderSummary&&page.orderSummary?.state==='current'&&page.orderSummary.readBy===this.summaryKey&&this.summaryDocumentId===r[0].documentId;
    const raw=page.quantitySource==='order-summary'&&!ownSummary?{...page,quantitySource:null,orderSummary:{state:'not-current'},receiptVerified:false,extras:page.extras===false?null:page.extras,purchase:{...page.purchase,quantity:null,itemVerified:false,verified:false}}:page;
    this.last={raw:structuredClone(page),fingerprint,documentId:r[0].documentId,summaryUsable:page.quantitySource!=='order-summary'||ownSummary};
    if(this.lastChoice&&['DETAILS','PAYMENT','REVIEW'].includes(raw.phase)&&raw.verifiedStep&&raw.purchase?.verified){this.acceptedSlot={date:this.lastChoice.date,start:this.lastChoice.start,end:this.lastChoice.end,verified:true,basis:'normal-checkout-progression; not a hold guarantee'};this.lastChoice=null;}
    const humanReview=this.reviewGrant?.expiry>Date.now()&&(this.reviewGrant.documentId===r[0].documentId||(this.reviewGrant.start===true&&raw.termsLinks?.includes(this.reviewGrant.termsUrl)));
    // Existing-order check is a human confirmation by design. No-extras proof comes ONLY from merchant page evidence.
    return {...raw,acceptedSlot:this.acceptedSlot,extras:raw.extras,existingOrdersChecked:humanReview&&this.reviewGrant.existingOrdersChecked===true,documentId:r[0].documentId,seq:++this.seq,generation:this.generation};
  }
  async act(command){
    if(!this.authorized||this.mode==='observe'||!this.last||command.documentId!==this.last.documentId||this.last.summaryUsable===false||!await this.permission())throw new Error('CurrentOperationNotAuthorized');
    if(this.mode==='public-config'&&!['configureProduct','continueProduct'].includes(command.action))throw new Error('ValidationModeCannotMutate');
    const previousChoice=this.lastChoice;if(command.action==='chooseSlot')this.lastChoice={date:command.date,start:command.start,end:command.end};
    const r=await this.api.scripting.executeScript({target:{tabId:this.tabId,documentIds:[command.documentId]},world:'ISOLATED',func:merchantDocument,args:[command.plan,{...command,privatePickupData:command.action==='fillDetails'?this.privatePickupData:undefined,authorized:true,structured:true,expected:JSON.stringify(this.last.raw)}]});
    // Only a structured page report made before the first DOM write is positively untouched; everything else is unknown.
    if(r.length===1&&r[0].documentId===command.documentId&&!r[0].error&&r[0].result?.delivered===false&&r[0].result.touched===false){this.lastChoice=previousChoice;return {delivered:false,touched:false,reason:String(r[0].result.reason??'').slice(0,60)};}
    if(r.length!==1||r[0].documentId!==command.documentId||r[0].error||r[0].result?.delivered!==true)throw new Error('MutationResultUnknown');return r[0].result;
  }
  // C029 (Claude): ordinary order-summary disclosure on the last observed document (open, read, close). Not a merchant mutation and
  // not available to observe/validation ports. Returns only a sanitized count and money; the page keeps the record for later reads.
  async readSummary(plan,taskId){
    if(!this.orderSummary||!this.last||!taskId||!await this.permission())throw new Error('SummaryDisclosureNotAuthorized');
    const documentId=this.last.documentId,command={id:crypto.randomUUID(),taskId,action:'readOrderSummary',summaryKey:this.summaryKey,authorized:true,structured:true,expected:JSON.stringify(this.last.raw)};
    const r=await this.api.scripting.executeScript({target:{tabId:this.tabId,documentIds:[documentId]},world:'ISOLATED',func:merchantDocument,args:[plan,command]});
    const x=r.length===1&&r[0].documentId===documentId&&!r[0].error?r[0].result:null,s=x?.summary;
    if(x?.delivered===true&&Number.isSafeInteger(s?.goodsCount)&&Number.isFinite(s.subtotalCny)&&Number.isFinite(s.totalCny)){this.summaryDocumentId=documentId;return {read:true,goodsCount:s.goodsCount,subtotalCny:s.subtotalCny,totalCny:s.totalCny};}
    if(x?.delivered===false&&typeof x.touched==='boolean')return {read:false,touched:x.touched,reason:String(x.reason??'').slice(0,60)};
    throw new Error('SummaryDisclosureResultUnknown');
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
