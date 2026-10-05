import {merchantDocument} from './page-program.js';
import {canonicalJson,itemMatches} from './job.js';
export function allowedMerchantUrl(raw){try{const u=new URL(raw);return u.protocol==='https:'&&(u.hostname==='www.apple.com.cn'||/^secure(?:\d+)?\.www\.apple\.com\.cn$/.test(u.hostname))&&/^\/shop\/(?:buy-iphone\/(?:iphone-18-pro|iphone-duo)(?:\/[^/]+\/a)?|bag|checkout|order(?:\/[^?#]*)?|signIn(?:\/orders)?)(?:\/)?$/.test(u.pathname);}catch{return false;}}
// C035 (Claude): the observed public purchase entries (C-031 Duo evidence, October 1 Pro probe). Configuration then uses normal controls.
const PRODUCT_ENTRY={'iPhone Duo':'https://www.apple.com.cn/shop/buy-iphone/iphone-duo','iPhone 18 Pro':'https://www.apple.com.cn/shop/buy-iphone/iphone-18-pro'};
// C035-R1 (Claude): the ordinary public bag page (C-035 official cart evidence), read before the one Add to Bag.
const BAG_ENTRY='https://www.apple.com.cn/shop/bag';
export class ChromePort {
  // mode 'observe': act can never run. mode 'public-config': only public product choices, never Add to Bag or later.
  // C029 (Claude): orderSummary enables the ordinary order-summary disclosure read, only for an authorized purchase port.
  // C058 (Claude): only a purchase port carries a stored slot choice. An observe-only port never turns a later document into that old
  // choice's acceptance; the job further limits resolution to the originating purchase run.
  constructor(api,tabId,{authorized=false,mode='purchase',privatePickupData={},initialSequence=0,acceptedSlot=null,pending=null,reviewGrant=null,orderSummary=false}={}){this.api=api;this.tabId=tabId;this.mode=mode;this.authorized=authorized&&mode!=='observe';this.seq=initialSequence;this.generation=pending?.generation??0;this.last=null;this.privatePickupData=privatePickupData;this.acceptedSlot=acceptedSlot;this.reviewGrant=reviewGrant;this.lastChoice=mode==='purchase'&&pending?.action==='chooseSlot'?{date:pending.date,start:pending.start,end:pending.end}:null;
    this.orderSummary=orderSummary===true&&this.authorized&&mode==='purchase';this.summaryKey=this.orderSummary?crypto.randomUUID():null;this.summaryDocumentId=null;}
  // C058 (Claude): called by the job when its run is not the originating purchase context (read-only reconciliation, a human rebind or
  // any later run of a rebound task). The stored choice and stored acceptance carried into this port are no longer reported as evidence.
  detachStoredChoice(){this.lastChoice=null;this.acceptedSlot=null;}
  async permission(){this.currentOrigin=null;const t=await this.api.tabs.get(this.tabId);if(!allowedMerchantUrl(t.url))throw new Error('UnsupportedMerchantPage');const u=new URL(t.url);this.currentOrigin=u.origin;return await this.api.permissions.contains({origins:[u.origin+'/*']});}
  async observe(plan){
    this.addBagProof=null;
    if(!await this.permission())throw Object.assign(new Error('CurrentHostPermissionMissing'),{origin:this.currentOrigin});
    // C040-R1 (Claude): a rejected injection (e.g. its frame was replaced by a document change) is script transport, distinct from a
    // returned result that is missing, failed or unrecognized below. Only the job decides whether a bounded read-only re-read is allowed.
    let r;try{r=await this.api.scripting.executeScript({target:{tabId:this.tabId,frameIds:[0]},world:'ISOLATED',func:merchantDocument,args:[plan]});}catch{throw Object.assign(new Error('ScriptTransportRejected'),{scriptTransport:true});}
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
    // C035: navigation leaves only the verified empty bag this port last read, only in an authorized purchase port.
    const entry=command.action==='openProduct'?PRODUCT_ENTRY[command.plan?.product?.model]:command.action==='openBag'?BAG_ENTRY:null;
    if(command.action==='openProduct'&&(this.mode!=='purchase'||this.last.raw.phase!=='EMPTY_BAG'||this.last.raw.verifiedStep!==true||!allowedMerchantUrl(entry)))throw new Error('CurrentOperationNotAuthorized');
    // C035-R1 Codex quota completion: readBag found this plan's existing one item. Open only the known ordinary bag; the original
    // configured product document is re-verified below, and a fresh bag read must still precede Checkout.
    const afterAdd=command.afterAddReconciliation===true,proof=this.addBagProof;
    if(command.action==='openBag'&&(this.mode!=='purchase'||!allowedMerchantUrl(entry)||(afterAdd?
      !proof||proof.documentId!==this.last.documentId||proof.seq!==command.bagReadSeq||proof.plan!==canonicalJson(command.plan)||this.last.raw.phase!=='UNKNOWN'||this.last.raw.merchantError!=='page-not-found':
      this.last.raw.phase!=='VARIANT'||this.last.raw.variantVerified!==true||this.last.raw.quotedCny>command.plan?.maxTotalCny)))throw new Error('CurrentOperationNotAuthorized');
    const previousChoice=this.lastChoice;if(command.action==='chooseSlot')this.lastChoice={date:command.date,start:command.start,end:command.end};
    const r=await this.api.scripting.executeScript({target:{tabId:this.tabId,documentIds:[command.documentId]},world:'ISOLATED',func:merchantDocument,args:[command.plan,{...command,privatePickupData:command.action==='fillDetails'?this.privatePickupData:undefined,authorized:true,structured:true,expected:JSON.stringify(this.last.raw)}]});
    // Only a structured page report made before the first DOM write is positively untouched; everything else is unknown.
    if(r.length===1&&r[0].documentId===command.documentId&&!r[0].error&&r[0].result?.delivered===false&&r[0].result.touched===false){this.lastChoice=previousChoice;return {delivered:false,touched:false,reason:String(r[0].result.reason??'').slice(0,60)};}
    if(r.length!==1||r[0].documentId!==command.documentId||r[0].error||r[0].result?.delivered!==true)throw new Error('MutationResultUnknown');
    if(!['openProduct','openBag'].includes(command.action))return r[0].result;
    this.addBagProof=null;
    // C035 (Claude): the page program only re-verified, in this exact document, the unchanged empty bag (it writes nothing). The
    // tab is then navigated in the ordinary way to the fixed public entry; the job reconciles arrival from fresh reads.
    if(!await this.api.permissions.contains({origins:[new URL(entry).origin+'/*']}))return {delivered:false,touched:false,reason:'ProductEntryPermissionMissing'};
    await this.api.tabs.update(this.tabId,{url:entry});
    for(let n=0;n<150;n++){await this.wait(100);let t=null;try{t=await this.api.tabs.get(this.tabId);}catch{}if(t?.status==='complete'&&allowedMerchantUrl(t.url)&&(command.action==='openBag'?/^\/shop\/bag\/?$/.test(new URL(t.url).pathname):new URL(t.url).pathname.startsWith('/shop/buy-iphone/')))break;}
    return {delivered:true};
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
  // C035-R1 (Claude): current bag read at the Add boundary. Only an authorized purchase port, with the current official host permission
  // it already holds, opens the ordinary public bag page in a separate inactive tab of this same browser profile, reads it with the
  // read-only page program (no command, no DOM write) and always closes that tab. The bound tab and this.last are never touched, so Add
  // still re-verifies the configured product page. Only two consecutive identical verified EMPTY_BAG/BAG decodes of one document
  // count; a timeout, script/tab error, other page or a failed close is UNKNOWN, never empty. Bounded: 150 x 100 ms.
  async readBag(plan){
    if(!this.authorized||this.mode!=='purchase')throw new Error('BagReadNotAuthorized');
    const unknown=reason=>({schema:'applebuy-merchant-read/v1',phase:'UNKNOWN',verifiedStep:false,reason,seq:++this.seq});
    if(!await this.api.permissions.contains({origins:[new URL(BAG_ENTRY).origin+'/*']}))return unknown('BagPermissionMissing');
    let tab=null,read=null,previous=null;
    try{
      tab=await this.api.tabs.create({url:BAG_ENTRY,active:false});
      for(let n=0;n<150&&!read&&Number.isSafeInteger(tab?.id)&&tab.id!==this.tabId;n++){
        await this.wait(100);
        let t=null,r=null;try{t=await this.api.tabs.get(tab.id);}catch{}
        if(t?.status!=='complete'||!allowedMerchantUrl(t.url)||!/^\/shop\/bag\/?$/.test(new URL(t.url).pathname)){previous=null;continue;}
        try{r=await this.api.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},world:'ISOLATED',func:merchantDocument,args:[plan]});}catch{}
        const page=r?.length===1&&r[0].frameId===0&&r[0].documentId&&!r[0].error?r[0].result:null;
        if(!page||!['EMPTY_BAG','BAG'].includes(page.phase)||page.verifiedStep!==true){previous=null;continue;}
        const key=canonicalJson([r[0].documentId,page.phase,page.purchase??null,page.extras??null]);
        if(key===previous)read={phase:page.phase,purchase:structuredClone(page.purchase??null),extras:page.extras??null,documentId:r[0].documentId};else previous=key;
      }
    }catch{read=null;}
    let closed=!tab;if(tab&&Number.isSafeInteger(tab.id)&&tab.id!==this.tabId){try{await this.api.tabs.remove(tab.id);closed=true;}catch{}}
    if(!closed)return unknown('BagTabCloseFailed');
    if(!read)return unknown('BagNotVerified');
    return {schema:'applebuy-merchant-read/v1',phase:read.phase,verifiedStep:true,path:'/shop/bag',purchase:read.purchase,extras:read.extras,documentId:read.documentId,seq:++this.seq};
  }
  // C064: one current settled readonly bag check after this port sees the recognized Add error. Never restores an Add or final grant.
  async readBagAfterAdd(plan){
    this.addBagProof=null;
    if(!this.authorized||this.mode!=='purchase')throw new Error('BagReadNotAuthorized');
    const before=this.last;if(before?.raw.phase!=='UNKNOWN'||before.raw.merchantError!=='page-not-found')throw new Error('AddErrorDocumentNotVerified');
    const result=await this.readBag(plan);
    if(this.last===before&&result.phase==='BAG'&&result.verifiedStep===true&&itemMatches(plan,result.purchase)&&result.extras===false){
      this.addBagProof={documentId:before.documentId,seq:result.seq,plan:canonicalJson(plan)};
    }
    return result;
  }
  async lookupOrder(plan,expectedRef){
    // An explicit observe port may follow an already-bound reference as a read-only lookup (C023 contract).
    // An unauthorized purchase port cannot acquire navigation authority from a replacement receipt.
    if(!expectedRef||!['purchase','observe'].includes(this.mode)||!this.authorized&&this.mode!=='observe')return {state:'unknown',independent:false};
    // C043 (Claude): every read here is a full observe (current address, host permission, one recognized frame result). Only a rejected
    // injection (scriptTransport, e.g. the frame replaced while the followed detail document loads) is read again, read-only and never
    // by navigating again, within this lookup's one existing bound of 40 waits of 50 ms. Any other failure, or a rejection at the
    // bound, ends the lookup at once and the job keeps the sent final unconfirmed. A receipt read only at the bound is not followed.
    let waits=0;
    const read=async()=>{for(;;){try{return await this.observe(plan);}catch(error){if(error?.scriptTransport!==true||waits>=40)throw error;}waits++;await this.wait(50);}};
    let o=await read();
    if(waits<40&&o.phase==='ORDER_RECEIPT'&&expectedRef&&o.orderRefHash===expectedRef&&o.receiptVerified&&o.orderDetailLink){
      // Navigate ONLY the link observed in this exact receipt. No reconstructed order/account endpoint.
      const link=new URL(o.orderDetailLink);if(!allowedMerchantUrl(link.href)||!await this.api.permissions.contains({origins:[link.origin+'/*']}))return {state:'unknown',independent:false};
      await this.api.tabs.update(this.tabId,{url:link.href});
      while(waits<40){waits++;await this.wait(50);o=await read();if(o.phase!=='ORDER_RECEIPT'&&o.phase!=='PROCESSING')break;}
    }
    if(o.phase!=='ORDER_DETAIL'||!expectedRef||o.orderRefHash!==expectedRef||!o.purchase?.verified||!o.slotSummary?.verified)return {state:'unknown',independent:false};
    // An actual separately opened detail route, exact hashed receipt identity, current fields and unpaid state.
    return {state:'unpaid',independent:true,orderRefHash:o.orderRefHash,purchase:o.purchase,acceptedSlot:o.slotSummary};
  }
  async wait(ms){await new Promise(r=>setTimeout(r,ms));}
}
