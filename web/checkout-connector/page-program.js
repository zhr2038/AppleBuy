// Serializable ISOLATED-world program. Merchant semantics, not undocumented HTTP interfaces.
// Unsupported/ambiguous evidence stops. Refusal text catalog is deliberately EMPTY for real Apple.
// C-012-R1 (Claude): exact store proof, separate line counting, observed no-trade-in/no-AppleCare dependency,
// merchant-only extras evidence and structured untouched failure reports.
// Codex quota takeover: reject conflicting quantity/store evidence and revalidate after a native slot change.
// C-013 (Codex, quota fallback): observed order-login path is an explicit human authentication gate.
// C-013-R3 (Claude): delivery memo before stale-evidence handling; slot continuation decided after the change task boundary.
// C-015 (Claude): the order-reference digest is the only awaited decoding step. After it the program re-enters and decodes
// the whole current document again; every action decides synchronously from that final decode. Slot continuation re-enters too.
// C-016 (Claude): pickup details are sent one value per pass; each next value and Continue are decided only after re-entry.
// C-018 (Claude): transported expected evidence is compared independent of object-member order only.
// C-019 (Claude): observed public bag structure: purchased line, unselected inline offer and header/bottom checkout pair.
// C-019-R1 (Claude): a duplicated or hidden purchased-list anchor is unknown cart scope, never a generic/legacy bag proof.
// C-019-R2 (Claude): an anchored cart that is not a recognized checkout bag never falls through to View Bag/Add to Bag navigation.
// C-020 (Claude): an anchored cart is BAG (recognized, proved checkout) or UNKNOWN; no other stage label there is step authority.
// C035 (Claude): the observed complete normal empty bag is EMPTY_BAG; there only openProduct is accepted, as a write-free re-verification.
// C037 (Claude): selectStore can choose the observed numbered native Dalian radio when it is not preselected, by the same exact proof.
// C051 (Claude): the observed contact-only details step is a recognized step (contactStep), never purchase proof; see below.
export async function merchantDocument(plan,command=null,internal=null){
  // `internal` is set only by this program's own re-entry; ChromePort passes plan and command only.
  // A structured command always receives a structured report. Nothing was written unless this id was already delivered.
  const report=reason=>{const memo=globalThis.__applebuyExecuted,prior=typeof memo?.has==='function'&&memo.has(command.id)===true;
    if(command.structured!==true)throw new Error(prior?'OperationAlreadyDelivered':reason);
    return {delivered:false,touched:prior,reason:prior?'OperationAlreadyDelivered':reason};};
  const u=new URL(location.href);
  const safe=u.protocol==='https:'&&(u.hostname==='www.apple.com.cn'||/^secure(?:\d+)?\.www\.apple\.com\.cn$/.test(u.hostname))&&/^\/shop\/(?:buy-iphone\/(?:iphone-18-pro|iphone-duo)(?:\/[^/]+\/a)?|bag|checkout|order(?:\/[^?#]*)?|signIn(?:\/orders)?)(?:\/)?$/.test(u.pathname);
  if(!safe)return command?.structured===true?report('UnsupportedOfficialUrl'):{schema:'applebuy-merchant-read/v1',phase:'UNKNOWN',reason:'unsupported-official-url'};
  if(/^\/shop\/signIn(?:\/orders)?\/?$/.test(u.pathname)){
    // C-013-R1: same-document delivery evidence survives the AUTH route. A memoized command is never positively
    // untouched. Only the memo is consulted: no authentication DOM or field is read and no action is taken.
    if(command)return report('AuthenticationRequired');
    return {schema:'applebuy-merchant-read/v1',phase:'AUTH',verifiedStep:false,reason:u.pathname.includes('/orders')?'official-order-sign-in-required':'official-checkout-sign-in-required',dates:[],times:[]};
  }
  const main=document.querySelector('main,[role="main"]');if(!main)return command?.structured===true?report('MainNotFound'):{schema:'applebuy-merchant-read/v1',phase:'UNKNOWN',reason:'main-not-found'};
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s\u{200B}\u{200C}\u{200D}\u{2060}]+/gu,' ').trim();
  const visible=e=>{if(!e||!e.isConnected)return false;for(let p=e;p;p=p.parentElement){const st=getComputedStyle(p);if(p.hidden||p.hasAttribute('inert')||p.getAttribute('aria-hidden')==='true'||st.display==='none'||['hidden','collapse'].includes(st.visibility))return false;}return true;};
  const disabled=e=>e.disabled===true||!!e.closest('[disabled],[aria-disabled="true"],[inert]');
  const name=e=>norm(e.getAttribute('aria-label')||([...e.labels??[]].filter(visible).map(x=>x.textContent).join(' '))||e.textContent);
  // Public labels/selected choices only. No password, contact values, cookie, storage or traffic capture.
  const buttons=[...main.querySelectorAll('button,a[role="button"],input[type="submit"]')].filter(visible);
  const radios=[...main.querySelectorAll('input[type="radio"],[role="radio"]')].filter(visible);
  const boxes=[...main.querySelectorAll('input[type="checkbox"],[role="checkbox"]')].filter(visible);
  const allSelects=[...main.querySelectorAll('select')],selects=allSelects.filter(visible);
  const textNodes=[...main.querySelectorAll('h1,h2,h3,p,span,div')].filter(visible);
  const textEls=textNodes.map(e=>({e,t:norm(e.textContent)})).filter(x=>x.t.length>0&&x.t.length<=180);
  const texts=textEls.map(x=>x.t);
  // Separate page lines: an identical nested wrapper is one line, identical siblings are separate lines (never deduplicated by text).
  const within=(a,b)=>{for(let p=b.parentElement;p;p=p.parentElement)if(p===a)return true;return false;};
  const lines=(re,fields=textEls)=>{const m=fields.filter(x=>re.test(x.t));return m.filter(x=>!m.some(y=>y!==x&&within(y.e,x.e)));};
  const exact=t=>buttons.filter(b=>name(b)===t&&!disabled(b));
  const checked=e=>e.checked===true||e.getAttribute('aria-checked')==='true';
  const findRadio=t=>radios.filter(e=>(name(e)===t||name(e).startsWith(t+' '))&&!(t==='iPhone 18 Pro'&&name(e).startsWith('iPhone 18 Pro Max')));
  const fullVariant=norm(`${plan.product.model} ${plan.product.capacity} ${plan.product.color}`);
  const productRe=/^iPhone (?:18 Pro(?: Max)?|Duo)\b.*\b(?:256GB|512GB|1TB|2TB)\b/;
  // C-019 (Claude): observed public bag (October 3, supported read-only observation), used only on /shop/bag with exactly one
  // visible OL[data-autom="bag-items"]. Purchased lines are its LI children; the item is the single line's one H2 title. Inside
  // that line a visible .rs-inline-recommendation that reads 添加…, has no 移除/checked control and holds neither title nor
  // quantity is an unselected offer: its text is cut out before marker checks. Any other product text, marker or removal blocks.
  // Checkout: one visible enabled 结账/安全结账 control, or exactly the observed header/bottom 结账 pair with data-autom=checkout,
  // which is one semantic action (the bottom one is clicked). Any further checkout-like control, hidden or not, is ambiguous.
  const bagLists=/^\/shop\/bag\/?$/.test(u.pathname)?[...main.querySelectorAll('ol[data-autom="bag-items"]')]:[];
  const bag=bagLists.length!==1||!visible(bagLists[0])?null:(()=>{
    const inside=(r,s)=>r?[...new Set(r.querySelectorAll(s))]:[];
    const items=[...bagLists[0].children].filter(e=>e.tagName==='LI'),line=items.length===1?items[0]:null;
    const heads=inside(line,'h2').filter(visible),title=heads.length===1?heads[0]:null;
    const offers=inside(line,'.rs-inline-recommendation').filter(o=>visible(o)&&norm(o.textContent).startsWith('添加')&&!heads.some(h=>o===h||within(o,h)||within(h,o))&&!inside(o,'select').length&&
      !inside(o,'button,a').some(b=>name(b).startsWith('移除'))&&!inside(o,'input,[role="checkbox"],[role="radio"]').some(checked));
    // C048 Codex genuine-quota takeover: the current bag repeats its exact item in the normal Remove/Save Later
    // buttons, and separately lists non-purchased favorites. Neither counterpart supplies item count or quantity.
    const nativeActionButtons=[],actionCopies=[];
    for(const [autom,caption] of [['bag-item-remove-button','移除'],['bag-item-savelater-button','移入收藏']]){
      const matches=inside(line,`[data-autom="${autom}"]`),b=matches.length===1?matches[0]:null,kids=b?[...b.children]:[];
      if(b?.tagName==='BUTTON'&&visible(b)&&kids.length===2&&kids.every(k=>k.tagName==='SPAN'&&visible(k))&&
        norm(kids[0].textContent)===caption&&kids[1].matches('.visuallyhidden')&&norm(kids[1].textContent)===fullVariant&&
        inside(b,'.visuallyhidden').length===1&&name(b)===caption+fullVariant){nativeActionButtons.push(b);actionCopies.push(kids[1]);}
    }
    const savedScopes=inside(main,'.rs-savedbyyou'),savedLists=inside(main,'ul.rs-savedbyyou-tiles'),savedHeads=inside(main,'h2.rs-savedbyyou-title');
    const saved=savedScopes.length===1?savedScopes[0]:null,savedList=savedLists.length===1?savedLists[0]:null,savedHead=savedHeads.length===1?savedHeads[0]:null;
    const savedRows=savedList?[...savedList.children]:[];
    const knownSaved=!!(saved?.tagName==='DIV'&&visible(saved)&&savedList&&visible(savedList)&&savedList.getAttribute('role')==='list'&&
      savedHead&&visible(savedHead)&&norm(savedHead.textContent)==='个人收藏'&&within(saved,savedHead)&&within(saved,savedList)&&
      !within(bagLists[0],saved)&&!within(saved,bagLists[0])&&
      !inside(saved,'[data-autom="bag-items"],select,[data-autom="item-quantity-dropdown"],[data-autom="bag-item-remove-button"],[data-autom="checkout"]').length&&
      !inside(saved,'input,[role="checkbox"],[role="radio"]').some(checked)&&savedRows.length>0&&savedRows.every(r=>{
        if(r.tagName!=='LI'||r.getAttribute('role')!=='listitem')return false;
        if(r.matches('.rs-product-list-emptytile'))return r.children.length===0&&norm(r.textContent)==='';
        const buys=inside(r,'[data-autom="bag-item-buybtn"]'),b=buys.length===1?buys[0]:null,names=inside(r,'h3.rs-product-list-item-productname');
        return r.matches('.rs-product-list-item')&&visible(r)&&/^product-list-item-[a-z0-9/]+$/i.test(r.getAttribute('data-autom')??'')&&
          names.length===1&&visible(names[0])&&b?.tagName==='A'&&visible(b)&&b.matches('.rs-product-list-item-buybtn')&&
          norm([...b.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join(''))==='继续';
      }));
    const badSavedScope=savedScopes.length+savedLists.length+savedHeads.length>0&&!knownSaved;
    const notPurchased=[...offers,...(knownSaved?[saved]:[])];
    const free=e=>!notPurchased.some(o=>o===e||within(o,e));
    const strip=e=>{let s=String(e.textContent??'');for(const o of notPurchased)if(within(e,o))s=s.replace(String(o.textContent??''),' ');return norm(s);};
    const stray=badSavedScope||textEls.some(x=>productRe.test(x.t)&&free(x.e)&&
      !(title&&(x.e===title||within(title,x.e)||within(x.e,title)))&&!actionCopies.some(c=>c===x.e||within(c,x.e)));
    const removes=inside(line,'button,a').filter(b=>visible(b)&&name(b).startsWith('移除'));
    const named=inside(main,'button,a,input[type="submit"],[data-autom="checkout"]').filter(b=>['结账','安全结账'].includes(name(b))||b.getAttribute('data-autom')==='checkout');
    const row=(b,c)=>!!b.closest('.'+c),ok=b=>visible(b)&&!disabled(b);
    const header=named.filter(b=>row(b,'rs-bag-checkoutbutton-header')&&!row(b,'rs-bag-checkoutbutton-bottom')),bottom=named.filter(b=>row(b,'rs-bag-checkoutbutton-bottom')&&!row(b,'rs-bag-checkoutbutton-header'));
    const pair=named.length===2&&header.length===1&&bottom.length===1&&named.every(b=>ok(b)&&name(b)==='结账'&&b.getAttribute('data-autom')==='checkout');
    return {items:items.length,line,title,offers,free,strip,stray,otherRemove:removes.length>1||removes.some(b=>!['移除','移除 '+fullVariant].includes(name(b))&&!nativeActionButtons.includes(b)),
      checkout:named.length===1&&ok(named[0])&&['结账','安全结账'].includes(name(named[0]))?named[0]:pair?bottom[0]:null};
  })();
  // C-019-R1 (Claude): on /shop/bag any purchased-list anchor commits the page to the observed cart scope. A duplicated or
  // hidden anchor (bag===null) is unknown structure: no generic item, quantity, store, pickup or checkout fact is borrowed.
  const bagScoped=bagLists.length>0;
  const productLines=texts.filter(t=>productRe.test(t));
  // C-026 (Claude quota-interrupted proposal, completed by Codex): equal independent title rows do not prove one purchased line.
  // The observed secure checkout has one visible shipment group/strip and a repeated title in its accessible fulfillment legend.
  // Merge only that bounded structural counterpart; count hidden group/strip/legend anchors too. Generic pages still need one
  // separate title line. Neither a group, a title nor its accessibility representation supplies quantity.
  const checkoutScope=/^secure(?:\d+)?\.www\.apple\.com\.cn$/.test(u.hostname)&&/^\/shop\/checkout\/?$/.test(u.pathname);
  const groups=checkoutScope?[...main.querySelectorAll('.rs-fulfillment-shipmentgroup')]:[],group=groups.length===1&&visible(groups[0])?groups[0]:null;
  const related=(a,b)=>!!a&&!!b&&(a===b||within(a,b)||within(b,a));
  const strips=groups.length?[...main.querySelectorAll('.rs-fulfillment-productstrip-content')]:[],strip=strips.length===1?strips[0]:null;
  const legends=groups.length?[...main.querySelectorAll('.rs-fulfillment-selector-title')]:[],legend=legends.length===1?legends[0]:null;
  const headers=legend?[...legend.querySelectorAll('.rs-fullfillment-selector-header')]:[],header=headers.length===1?headers[0]:null;
  const copies=legend?[...legend.querySelectorAll('.visuallyhidden')]:[],copy=copies.length===1?copies[0]:null;
  const options=legend?.closest('.rs-fulfillment-deliveryoptions');
  const knownLegend=legends.length===0||!!(legend&&legend.tagName==='LEGEND'&&visible(legend)&&within(group,legend)&&
    options?.tagName==='FIELDSET'&&within(group,options)&&header?.tagName==='H2'&&copy?.tagName==='SPAN'&&within(header,copy)&&
    visible(copy)&&norm(copy.textContent)===fullVariant);
  const groupLine=!!(group&&strip&&strip.tagName==='DIV'&&visible(strip)&&within(group,strip)&&norm(strip.textContent)===fullVariant&&knownLegend&&
    textEls.filter(x=>productRe.test(x.t)).every(x=>related(x.e,strip)||related(x.e,copy)));
  // C045 (Codex authorized quota takeover): current historical order detail (normal Chrome evidence) pairs a model-only H2 with
  // one full-title H3 in the SAME LI.rs-od-itemdetail/order-item-N. The item summary is identity scope, never a piece count.
  // Count every native marker including hidden/duplicate/misplaced ones. A present but incomplete native scope cannot borrow the
  // generic text fallback; every other iPhone mention still conflicts below. Real quantity/unpaid/slot/extras remain unverified.
  const nativeOrderPage=/^\/shop\/order\/detail\/[^/]+\/[^/]+\/?$/.test(u.pathname);
  const nativeItems=nativeOrderPage?[...main.querySelectorAll('.rs-od-itemdetail')]:[];
  const nativeSummaries=nativeOrderPage?[...main.querySelectorAll('.rs-od-itemsummary')]:[];
  const nativeNames=nativeOrderPage?[...main.querySelectorAll('.rs-display-item-name')]:[];
  const nativeHeads=nativeOrderPage?[...main.querySelectorAll('.rs-od-itemtitle')]:[];
  const nativeInfos=nativeOrderPage?[...main.querySelectorAll('.rs-od-iteminfo')]:[];
  const nativeScope=nativeItems.length>0||nativeSummaries.length>0||nativeNames.length>0;
  const ni=nativeItems.length===1?nativeItems[0]:null,ns=nativeSummaries.length===1?nativeSummaries[0]:null;
  const nn=nativeNames.length===1?nativeNames[0]:null,nh=nativeHeads.length===1?nativeHeads[0]:null,nf=nativeInfos.length===1?nativeInfos[0]:null;
  const nativeStates=nh?[...nh.querySelectorAll('.rs-od-itemstatus')]:[],st=nativeStates.length===1?nativeStates[0]:null;
  let nativeHeaderText=String(nh?.textContent??'');if(st)nativeHeaderText=nativeHeaderText.replace(String(st.textContent??''),' ');
  const nativeLine=!!(ni&&ni.tagName==='LI'&&/^order-item-\d+$/.test(ni.getAttribute('data-autom')??'')&&visible(ni)&&
    ns&&ns.tagName==='DIV'&&visible(ns)&&within(ni,ns)&&nn&&nn.tagName==='H3'&&visible(nn)&&within(ns,nn)&&norm(nn.textContent)===fullVariant&&
    nf&&nf.tagName==='DIV'&&visible(nf)&&within(ni,nf)&&nh&&nh.tagName==='H2'&&visible(nh)&&within(nf,nh)&&
    st&&st.tagName==='SPAN'&&visible(st)&&within(nh,st)&&!/iphone/i.test(norm(st.textContent))&&norm(nativeHeaderText)===norm(plan.product.model));
  const oneLine=nativeScope?nativeLine:groups.length===0?lines(productRe).length===1:groupLine;
  // C028-R1 (Claude): the line rules above see only visible h1-h3/p/span/div text of at most 180 characters. Outside the observed
  // bag (which keeps its own structural purchased-line count), every iPhone mention in main's whole text - hidden, bare text,
  // any element type or long text - must be an accepted anchor's own mention: the recognized strip/copy pair, or the single
  // generic title line. Nested anchors count once. An ancestor holding the known copy lends no identity to further product
  // text. Only a count is derived; no page text is returned or kept.
  const mentions=e=>(norm(e?.textContent).match(/iphone/gi)??[]).length;
  const anchors=[...new Set(nativeScope?[nn]:groups.length>0?[strip,copy]:lines(productRe).map(x=>x.e))].filter(Boolean);
  // C036 Codex quota adaptation: current native pickup adds a model-only date LEGEND beside the single selected-store product row.
  // It is metadata, not another purchased item. Whitelist only this observed structural counterpart; every other iPhone mention,
  // duplicate/hidden product scope or mismatching caption still conflicts. Neither this row nor the caption supplies quantity.
  const pickupLists=checkoutScope&&groups.length===0?[...main.querySelectorAll('.rt-storelocator-store-multipleavailability-list')]:[];
  const pickupRows=pickupLists.length===1?[...pickupLists[0].querySelectorAll('.rt-storelocator-store-multipleavailability-item')]:[];
  const pickupTitles=pickupRows.length===1?[...pickupRows[0].querySelectorAll('div.column.large-7')]:[];
  const pickupCaptions=checkoutScope&&groups.length===0?[...main.querySelectorAll('legend.rs-pickup-slottitle')]:[];
  const pc=pickupCaptions.length===1?pickupCaptions[0]:null,pf=pc?.parentElement;
  const knownPickupCaption=pickupLists.length===1&&pickupLists[0].tagName==='UL'&&visible(pickupLists[0])&&pickupRows.length===1&&pickupRows[0].tagName==='LI'&&visible(pickupRows[0])&&
    pickupTitles.length===1&&visible(pickupTitles[0])&&norm(pickupTitles[0].textContent)===fullVariant&&pc&&visible(pc)&&norm(pc.textContent)===norm('为你的 '+plan.product.model+' 选择取货日期：')&&
    pf?.tagName==='FIELDSET'&&pf.querySelectorAll('input[name="bartPickupDateSelectorButtonGroup"]').length>0&&pf.querySelectorAll('select[data-autom="pickup-availablewindow-dropdown"]').length===1;
  const mentionAnchors=[...anchors,...(knownPickupCaption?[pc]:[]),...(nativeLine?[nh]:[])];
  const soleMentions=mentions(main)<=mentionAnchors.filter(e=>!mentionAnchors.some(o=>o!==e&&within(o,e))).reduce((n,e)=>n+mentions(e),0);
  // C027 (Codex quota completion): the recognized strip/copy supply exact titles. Their real-DOM ancestors also contain
  // native option labels; that aggregate is not another title. Generic pages retain the strict textual proof.
  const exactProduct=bag?!!bag.title&&norm(bag.title.textContent)===fullVariant&&!bag.stray:!bagScoped&&oneLine&&soleMentions&&
    (nativeScope?nativeLine:groups.length>0?groupLine:productLines.some(t=>t===fullVariant)&&productLines.every(t=>t===fullVariant));
  // C022 (Codex quota takeover): wrapper text includes every option, even hidden native clones (observed 数量121).
  // Remove descendant select text only; literal quantity outside those controls still conflicts with selected values.
  // Strip outermost controls once, before the length bound, so long/nested option lists cannot hide a real contradiction.
  const quantityFields=textNodes.map(e=>{const contained=allSelects.filter(s=>within(e,s)),roots=contained.filter(s=>!contained.some(other=>other!==s&&within(other,s)));let raw=String(e.textContent??'');for(const s of roots){const content=String(s.textContent??'');if(content)raw=raw.replace(content,'');}return {e,t:norm(raw)};}).filter(x=>x.t.length>0&&x.t.length<=180);
  const quantityLines=lines(/^数量\s*[:：]?\s*\d+$/,quantityFields);
  const qtyControls=selects.filter(e=>/数量/.test(name(e)));
  const controlQty=qtyControls.length===1&&qtyControls[0].selectedOptions.length===1?Number(norm(qtyControls[0].selectedOptions[0]?.textContent)):null;
  const lineQty=quantityLines.length===1?Number(quantityLines[0].t.match(/\d+/)[0]):null;
  const pageQty=qtyControls.length>1||quantityLines.length>1||(qtyControls.length===1&&quantityLines.length===1&&controlQty!==lineQty)?null:qtyControls.length===1?controlQty:lineQty;
  // C-019: in the observed bag the single quantity control must belong to the single purchased line.
  const mainQty=bag?(bag.line&&qtyControls.length===1&&within(bag.line,qtyControls[0])?pageQty:null):bagScoped?null:pageQty;
  const totalLines=[...new Set(texts.filter(t=>/^(?:总计|合计|应付总额)(?:\s*\(含税\))?\s*[:：]?\s*(?:RMB|¥|￥)\s*[\d,]+(?:\.\d{2})?$/.test(t)))];
  const labelledTotal=totalLines.length===1?Number(totalLines[0].match(/(?:RMB|¥|￥)\s*([\d,]+(?:\.\d{2})?)/)[1].replaceAll(',','')):null;
  // C-024 (Claude): the observed official checkout (secure host, /shop/checkout; October 3 supported read-only observation) shows
  // its current total only as one visible companion-bar button captioned 显示订单摘要： RMB 9,999. Only there is it money evidence:
  // exactly one such control in main (hidden ones counted), a visible BUTTON, with exactly that caption form and a positive amount.
  // Any other widget count (even equal), hidden widget, other caption/currency or zero leaves the checkout total unknown, and a
  // labelled total there must agree with it. Nothing outside main is read. It never supplies quantity; the summary dialogue is
  // read only by the C029 readOrderSummary step below.
  const bars=checkoutScope?[...main.querySelectorAll('button,a[role="button"],input[type="submit"]')].filter(b=>b.getAttribute('data-autom')==='companionbar-button'):[];
  const barMoney=bars.length===1&&bars[0].tagName==='BUTTON'&&visible(bars[0])?/^显示订单摘要\s*[:：]?\s*RMB\s*(\d{1,3}(?:,\d{3})*|\d+)(\.\d{2})?$/.exec(norm(bars[0].textContent)):null;
  const barTotal=barMoney?Number(barMoney[1].replaceAll(',','')+(barMoney[2]??'')):null;
  const total=bars.length===0?labelledTotal:barTotal>0&&(totalLines.length===0||labelledTotal===barTotal)?barTotal:null;
  // C029 (Claude): the observed current checkout (October 3 supported normal observation) states its whole-order goods count only
  // OUTSIDE main, in the ordinary order-summary disclosure: a visible DIV role=dialog aria-modal=true with a visuallyhidden 订单摘要
  // title and one SPAN.rs-companionbar-items 「1 件商品」 in P.rs-companionbar-bagitemrow within .rs-order-item-details,
  // .rs-companionbar-ordertotal and .rs-companionbar-ordersummary-section, beside subtotal/shipping/total rows. Nothing here opens or
  // reads it: only this program's own readOrderSummary step does (below), and keeps the sanitized count/money in this document's
  // isolated world. That record supplies quantity only while it is current: same main element and URL, unchanged order context
  // (companion caption and total, product anchors and lines, iPhone mention count, no main quantity evidence), no visible dialog
  // anywhere, within SUMMARY_TTL_MS. Main quantity evidence keeps priority and must agree. Hidden or pre-rendered summary text is
  // never read. C029-R1: the current self-label 「N 件商品」 in this observed shape is read as an explicit piece count and is the
  // quantity source (bounded management interpretation). Money comparisons only detect a changed order; quantity is never derived
  // from money, titles or group counts. No general Apple count contract, quantity-2 behaviour or later-stage shape is claimed.
  const SUMMARY_TTL_MS=15000;
  const mainQtyShown=qtyControls.length>0||quantityLines.length>0;
  const shownDialogs=()=>{try{return [...new Set(document.querySelectorAll('[role="dialog"],[role="alertdialog"],[aria-modal="true"],dialog'))].filter(visible);}catch{return null;}};
  const orderContext=()=>JSON.stringify([u.href,bars.map(b=>[b.tagName,norm(b.textContent),visible(b),disabled(b)]),total,groups.length,strips.length,norm(strip?.textContent),norm(copy?.textContent),lines(productRe).map(x=>x.t),mentions(main),mainQtyShown]);
  const summaryMemo=checkoutScope&&!bagScoped?globalThis.__applebuySummary??null:null,dialogs=checkoutScope?shownDialogs():null;
  const summaryAge=summaryMemo?Date.now()-summaryMemo.at:-1;
  const summaryCurrent=!!summaryMemo&&summaryMemo.main===main&&summaryMemo.href===u.href&&summaryAge>=0&&summaryAge<=SUMMARY_TTL_MS&&dialogs?.length===0&&
    summaryMemo.total===total&&summaryMemo.context===orderContext();
  const summaryQty=summaryCurrent?summaryMemo.count:null;
  const qty=summaryQty===null?mainQty:!mainQtyShown||mainQty===summaryQty?summaryQty:null;
  const quantitySource=qty===null?null:summaryQty===null?'main':mainQtyShown?'main+order-summary':'order-summary';
  // Store proof: one enabled checked store choice or one exact labelled value. Any other checked store,
  // store-like labelled value, container listing several stores or disagreement leaves the store unproven.
  const planStore=n=>plan.stores.find(s=>n===norm(s))??null;
  // C036 Codex quota adaptation: current normal pickup uses numbered native store-locator radios. The independently observed
  // mainland Dalian label and public R609 identifier must BOTH match; never infer a store from its ID or a substring alone.
  const nativeStore=e=>e.tagName==='INPUT'&&e.getAttribute('name')==='store-locator-result';
  const nativeStoreName=e=>{
    if(e.value!=='R609')return null;
    // C049 Root genuine-quota adaptation: native label SPANs join without spaces and now say 明天.
    // Exact associated public title and R609 are identity; availability prose never binds a date or quantity.
    const nativeLabel=l=>/(?:^|\s)form-selector-label(?:\s|$)/.test(l.getAttribute('class')??'');
    const labels=[...e.labels??[]],hasNative=labels.some(l=>nativeLabel(l)||l.querySelectorAll('span.form-selector-title').length>0);
    if(hasNative){
      const l=labels.length===1?labels[0]:null,ts=l?[...l.querySelectorAll('span.form-selector-title')]:[];
      return norm(e.getAttribute('type')).toLowerCase()==='radio'&&l?.tagName==='LABEL'&&visible(l)&&nativeLabel(l)&&
        ts.length===1&&visible(ts[0])&&norm(ts[0].textContent)==='Apple 大连恒隆广场'&&name(e)===norm(l.textContent)&&
        /^\d+\s*Apple 大连恒隆广场\s*(?:今天|明天)\s*可取货\s*店内取货$/.test(name(e))?'Apple 大连恒隆广场':null;
    }
    const m=/^\d+\s+(Apple .+)\s+今天 可取货 店内取货$/.exec(name(e));return m&&m[1]==='Apple 大连恒隆广场'?m[1]:null;
  };
  const storeRadios=radios.filter(e=>/^Apple\s/.test(name(e))||nativeStore(e)),checkedStores=storeRadios.filter(checked);
  const radioStore=checkedStores.length===1&&!disabled(checkedStores[0])?planStore(nativeStore(checkedStores[0])?nativeStoreName(checkedStores[0])??'':name(checkedStores[0])):null;
  const fieldValues=[...new Set(texts.flatMap(t=>{const m=/^(?:取货地点|取货门店|自提门店|店内取货地点)\s*[:：]?\s*(.*)$/.exec(t);return m&&/Apple\s/.test(m[1])?[m[1]]:[];}))];
  const fieldStores=fieldValues.map(v=>plan.stores.find(s=>v===norm(s))??null);
  const storeConflict=checkedStores.length>1||(checkedStores.length===1&&!radioStore)||fieldStores.some(x=>x===null);
  const storeProof=[...new Set([...(radioStore?[radioStore]:[]),...fieldStores])];
  const store=!storeConflict&&storeProof.length===1?storeProof[0]:null;
  // Fulfillment (F-K): a current native fulfillment choice outranks generic/summary prose. Unselected, conflicting,
  // multiple or disabled choices never prove pickup. Prose counts only when no fulfillment control is shown at all.
  const pickupRadios=findRadio('我要取货'),pickupGroup=pickupRadios.length===1?pickupRadios[0].getAttribute('name'):null;
  const deliveryRadios=radios.filter(e=>!pickupRadios.includes(e)&&(/送货|配送|快递|邮寄/.test(name(e))||(!!pickupGroup&&e.getAttribute('name')===pickupGroup)));
  const deliveryChecked=deliveryRadios.filter(checked);
  const fulfillmentChoice=pickupRadios.length+deliveryRadios.length===0?null:pickupRadios.length>1?'ambiguous':pickupRadios.length===1&&disabled(pickupRadios[0])?'disabled':pickupRadios.length===1&&checked(pickupRadios[0])?(deliveryChecked.length?'conflict':'pickup'):deliveryChecked.length>1?'conflict':deliveryChecked.length===1?'delivery':'unselected';
  const deliveryProse=texts.some(t=>/^(?:送货|配送)/.test(t));
  const pickupShown=fulfillmentChoice!==null?fulfillmentChoice==='pickup':(texts.includes('店内取货')||texts.includes('到店取货'))&&!deliveryProse;
  // C035 (Claude): observed normal empty bag (October 3 authorized normal observation, sanitized in C-035-official-cart-evidence.json).
  // Only /shop/bag with no purchased-list anchor (any visibility) and exactly one visible #bag-content holding exactly one visible
  // DIV.rs-bagempty with its one H1.rs-bag-header 你的购物袋中没有商品。 and its one A 继续购物 (bag-empty-continueshopping-button
  // to /store). Inside #bag-content no other control and no goods/money text; its live regions are empty or carry only the observed
  // removal notice. Anywhere in main: no checkout control, alert/error text or processing marker; no visible dialog in the page.
  // Saved/recommended products outside #bag-content are ignored and are never purchased goods. Anything else is not empty proof.
  const emptyBag=/^\/shop\/bag\/?$/.test(u.pathname)&&!bagScoped&&(()=>{
    const all=(r,s)=>[...r.querySelectorAll(s)],text=e=>norm(e?.textContent);
    if(all(main,'[data-autom="bag-items"],.rs-bag-items,.rs-iteminfos').length)return false;
    const contents=all(main,'#bag-content'),boxes=all(main,'.rs-bagempty'),heads=all(main,'.rs-bag-header'),links=all(main,'[data-autom="bag-empty-continueshopping-button"]');
    if(contents.length!==1||boxes.length!==1||heads.length!==1||links.length!==1)return false;
    const [content]=contents,[box]=boxes,[head]=heads,[link]=links;let href=null;try{href=new URL(link.getAttribute('href')??'',u.href);}catch{}
    if(![content,box,head,link].every(visible)||!within(content,box)||!within(box,head)||!within(box,link)||box.tagName!=='DIV'||head.tagName!=='H1'||text(head)!=='你的购物袋中没有商品。'||
      link.tagName!=='A'||text(link)!=='继续购物'||href?.origin!=='https://www.apple.com.cn'||href.pathname!=='/store')return false;
    if(all(content,'button,a,select,input,textarea,[role="button"],[role="checkbox"],[role="radio"],[role="option"],[role="spinbutton"]').some(e=>e!==link))return false;
    if(all(main,'button,a,input[type="submit"],[data-autom="checkout"]').some(b=>['结账','安全结账'].includes(name(b))||b.getAttribute('data-autom')==='checkout'))return false;
    const dialogs=shownDialogs();if(dialogs===null||dialogs.length)return false;
    const busy=/正在处理|处理中|正在加载|加载中/;
    if(textEls.some(x=>busy.test(x.t))||all(main,'[alt],[aria-label]').some(e=>visible(e)&&busy.test(norm(e.getAttribute('alt'))+' '+norm(e.getAttribute('aria-label')))))return false;
    const notice=/^iPhone [^。]{1,80} 已从购物袋中移除。$/,notices=[];
    for(const r of all(main,'[role="status"],[role="alert"],[role="alertdialog"],[aria-live]').filter(visible)){const t=text(r);if(!t)continue;
      if(['alert','alertdialog'].includes(r.getAttribute('role'))||!within(content,r)||!notice.test(t))return false;notices.push(r);}
    let rest=String(content.textContent??'');for(const e of [box,...notices])rest=rest.replace(String(e.textContent??''),' ');
    return !/iphone|ipad|mac|airpods|watch|vision|RMB|¥|￥|件商品|数量/i.test(norm(rest));
  })();
  // C-019: bag availability prose (store name, 今天取货, 店内取货) is not a selected fulfillment or store in the observed bag.
  // C035: the verified empty bag names no purchased goods; nothing outside its scope can lend it an item.
  const purchase=emptyBag?{itemVerified:false,verified:false,model:null,capacity:null,color:null,quantity:null,totalCny:null,store:null,fulfillment:null}:{itemVerified:exactProduct&&qty===1&&Number.isFinite(total),verified:!bagScoped&&exactProduct&&qty===1&&Number.isFinite(total)&&!!store&&pickupShown,model:exactProduct?plan.product.model:null,capacity:exactProduct?plan.product.capacity:null,color:exactProduct?plan.product.color:null,quantity:qty,totalCny:total,store:bagScoped?null:store,fulfillment:!bagScoped&&pickupShown?'pickup':null};
  // C044 (Claude): order-detail address. The single-segment alias is kept for the bounded C023-C043 software (FAKE). The current
  // official account detail address (C-044 normal Chrome evidence, secure8) is /shop/order/detail/ plus exactly two opaque segments.
  // order/list and a bare order/detail are not an order. The address alone never proves an order; the decoded page facts do.
  const orderDetailPath=/^\/shop\/order\/(?:(?!(?:list|detail)(?:\/|$))[^/]+|detail\/[^/]+\/[^/]+)\/?$/;
  // C044 (Claude): current official native order detail (C-044 evidence, historical Pro records only): each item's own state is
  // span.rs-od-itemstatus in h2.rs-od-itemtitle (observed 取货已取消 and a picked-up text); a cancelled item also carries
  // .rs-od-itemsummary-canceled. That native state outranks page prose: any native status in main (any visibility) that is not a
  // pending word, or any cancelled marker, means no unpaid order is shown, whatever pending or help text is beside it.
  const PENDING=['待付款','等待付款','请完成付款'];
  const nativeNotUnpaid=()=>[...main.querySelectorAll('.rs-od-itemstatus')].some(e=>!PENDING.includes(norm(e.textContent)))||!!main.querySelector('.rs-od-itemsummary-canceled');
  // C064: actual post-Add error document. Both observed title and visible main heading are required; no HTTP/rejection inference.
  const notFound=norm(document.title)==='Page Not Found - Apple'&&[...main.querySelectorAll('h1.section-headline')].some(e=>visible(e)&&norm(e.textContent)==='The page you’re looking for can’t be found.');
  let phase='UNKNOWN';
  if(main.querySelector('input[type="password"],input[autocomplete="one-time-code"]')||texts.includes('以游客身份继续'))phase='AUTH';
  else if(texts.some(t=>t==='Apple 和你的数据隐私'))phase='CONSENT';
  else if(main.querySelector('[aria-busy="true"]'))phase='PROCESSING';
  else if(notFound)phase='UNKNOWN';
  else if(texts.some(t=>PENDING.includes(t))){const route=orderDetailPath.test(u.pathname)?'ORDER_DETAIL':u.pathname==='/shop/checkout'?'ORDER_RECEIPT':'UNKNOWN';phase=route!=='UNKNOWN'&&nativeNotUnpaid()?'UNKNOWN':route;}
  // C-020 (Claude): on /shop/bag a purchased-list anchor makes the cart itself the only stage evidence. Only the recognized bag
  // with its proved checkout is BAG; any other anchored cart is UNKNOWN. Review/details/slots/payment/fulfillment or navigation
  // labels never become step authority there. The human/processing gates and order-state line above keep priority.
  else if(bagScoped)phase=bag&&bag.checkout?'BAG':'UNKNOWN';
  else if(emptyBag)phase='EMPTY_BAG';
  else if(exact('立即下单').length===1)phase='REVIEW';
  else if(exact('继续选择付款方式').length===1)phase='DETAILS';
  else if(exact('继续填写取货详情').length===1&&purchase.fulfillment==='pickup'&&purchase.store)phase='SLOTS';
  else if(findRadio('支付宝').length===1)phase='PAYMENT';
  else if(findRadio('我要取货').length===1)phase='FULFILLMENT';
  else if(bag?!!bag.checkout:!bagScoped&&(exact('结账').length===1||exact('安全结账').length===1))phase='BAG';
  // C-019-R2: unknown cart scope or ambiguous checkout on an anchored bag stays UNKNOWN; generic navigation needs no anchor.
  else if(!bagScoped&&exact('查看购物袋').length===1)phase='ACCESSORIES';
  else if(!bagScoped&&exact('添加到购物袋').length===1)phase='VARIANT';
  else if(u.pathname.startsWith('/shop/buy-iphone/'))phase='ENTRY';
  const out={schema:'applebuy-merchant-read/v1',phase,purchase,verifiedStep:!['UNKNOWN','AUTH','CONSENT','PROCESSING'].includes(phase),path:u.pathname,feedback:null,acceptedSlot:null,slotSummary:null,continueAvailable:exact('继续').length===1,variantVerified:false,quotedCny:null,listComplete:false,dates:[],times:[],selectedDate:null,paymentMethod:findRadio('支付宝').some(checked)?'支付宝':null,extras:null,existingOrdersChecked:false,orderRefHash:null,orderDetailLink:null};
  if(notFound&&phase==='UNKNOWN')out.merchantError='page-not-found';
  out.fulfillmentChoice=fulfillmentChoice;
  // C029: sanitized summary facts only (a count, money and the reading port's random key); never page text, IDs or URLs.
  out.quantitySource=quantitySource;
  out.orderSummary=summaryCurrent?{state:'current',goodsCount:summaryMemo.count,subtotalCny:summaryMemo.subtotal,totalCny:summaryMemo.total,shipping:summaryMemo.shipping??'免费',readBy:summaryMemo.readBy}:{state:summaryMemo?'not-current':'not-read'};
  // A disclosure read could supply the only missing fact: exact product, positive capped companion total, no main quantity, no dialog.
  out.summaryReadable=checkoutScope&&!bagScoped&&!mainQtyShown&&['FULFILLMENT','SLOTS','DETAILS','PAYMENT','REVIEW'].includes(phase)&&exactProduct&&
    dialogs?.length===0&&bars.length===1&&bars[0].tagName==='BUTTON'&&visible(bars[0])&&!disabled(bars[0])&&barTotal>0&&total===barTotal&&total<=plan.maxTotalCny;
  const title=norm(main.querySelector('h1')?.textContent);
  const modelShown=title===plan.product.model||title==='购买 '+plan.product.model;
  const modelChoices=findRadio(plan.product.model);
  // Observed public dependency (Pro, October 2): no trade-in enables no AppleCare+, which enables Add to Bag.
  // Exactly one matching control per choice; one choice per command; disabled controls are never forced.
  const NO_TRADE_IN='不折抵换购',NO_APPLECARE='不加 AppleCare+ 服务计划',extrasPlan=plan.extras??{tradeIn:'none',appleCare:'none'};
  const choiceState=t=>{const m=findRadio(t);return m.length===0?'absent':m.length>1?'ambiguous':checked(m[0])?'selected':disabled(m[0])?'disabled':'enabled';};
  const spec=[...(modelChoices.length?[plan.product.model]:[]),plan.product.color,plan.product.capacity];
  const extra=[...(extrasPlan.tradeIn==='none'?[NO_TRADE_IN]:[]),...(extrasPlan.appleCare==='none'?[NO_APPLECARE]:[])];
  const states=Object.fromEntries([...spec,...extra].map(t=>[t,choiceState(t)]));
  out.selectedProductChoices=[...spec,...extra].filter(t=>states[t]==='selected');
  out.needsSelection=[...spec,...extra].filter(t=>states[t]!=='selected');
  out.extrasConflict=[...radios,...boxes].filter(checked).map(name).some(n=>(/AppleCare/.test(n)&&!n.startsWith(NO_APPLECARE))||(/折抵|换购/.test(n)&&!n.startsWith(NO_TRADE_IN)));
  const bagButtons=buttons.filter(b=>name(b)==='添加到购物袋');
  const addToBag=bagButtons.length===0?'absent':bagButtons.length>1?'ambiguous':disabled(bagButtons[0])?'disabled':'enabled';
  const specMissing=spec.filter(t=>states[t]!=='selected'),extraMissing=extra.filter(t=>states[t]!=='selected');
  // A step with neither Add to Bag nor any extras group may defer extras to the next public step; the add stage still requires both.
  const defer=specMissing.length===0&&addToBag==='absent'&&out.continueAvailable&&extraMissing.every(t=>states[t]==='absent');
  const next=specMissing[0]??(defer?undefined:extraMissing[0]);
  out.nextChoice=u.pathname.startsWith('/shop/buy-iphone/')&&next?{choice:next,state:states[next]}:null;
  const specSelected=modelShown&&specMissing.length===0;
  const configured=specSelected&&extraMissing.length===0&&!out.extrasConflict;
  out.configuration={addToBag,complete:configured};
  const quoteRadio=findRadio(plan.product.capacity).filter(checked);
  const quote=quoteRadio.length===1?/\bRMB\s*([\d,]+(?:\.\d{2})?)/.exec(name(quoteRadio[0])):null;
  if(configured&&quote){out.variantVerified=true;out.quotedCny=Number(quote[1].replaceAll(',',''));}
  if(texts.some(t=>t.includes('暂未发售')||t.includes('机型将在获得批准后发售'))&&buttons.some(b=>name(b)==='继续'&&disabled(b))&&!buttons.some(b=>name(b)==='继续'&&!disabled(b))){
    // C031 Codex quota takeover: the normally observed Duo page permits public spec choices before release.
    // Only this public product scope may configure; the release gate never permits Continue/Add or checkout actions.
    const slug=plan.product.model==='iPhone Duo'?'iphone-duo':'iphone-18-pro';
    out.prelaunchConfigurable=u.hostname==='www.apple.com.cn'&&new RegExp('^/shop/buy-iphone/'+slug+'(?:/[^/]+/a)?/?$').test(u.pathname)&&modelShown&&['ENTRY','VARIANT'].includes(phase)&&
      texts.includes('暂未发售')&&texts.includes('目前暂不提供 Apple Store 零售店取货服务')&&!texts.some(t=>t.includes('机型将在获得批准后发售'));
    out.phase=phase='PRELAUNCH';
  }
  // Merchant no-extra evidence (bag/review): one separate product line, no extra marker. Human consent never substitutes.
  // C-019: only the observed bag (phase BAG) excludes recognized unselected offers; REVIEW and every other page are unchanged.
  if(phase==='REVIEW'||phase==='BAG'){
    const b=phase==='BAG'?bag:null,markerText=t=>(/AppleCare/.test(t)&&!t.includes(NO_APPLECARE))||(/折抵|换购/.test(t)&&!t.includes(NO_TRADE_IN));
    const marker=b?textEls.some(x=>b.free(x.e)&&markerText(b.strip(x.e)))||(!!b.line&&markerText(b.strip(b.line))):texts.some(markerText);
    const items=b?b.items:lines(productRe).length;
    out.extras=out.extrasConflict||marker||items>1||quantityLines.length>1||(!!b&&(b.stray||b.otherRemove))?true:purchase.itemVerified&&items===1?false:null;
  }
  const timeSelects=selects.filter(e=>[...e.options].some(o=>/^\d{2}:\d{2}\s*[-–—至]\s*\d{2}:\d{2}$/.test(norm(o.textContent))));
  const datePattern=/^(?:(?:\d{4}年)?\d{1,2}月\d{1,2}日(?:\s*(?:周|星期)[一二三四五六日天])?|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2})$/;
  const dateSummary=[...new Set(texts.flatMap(t=>{const m=/^取货日期\s*[:：]?\s*(.+)$/.exec(t);return m&&datePattern.test(m[1])?[m[1]]:[]}))];
  const timeSummary=[...new Set(texts.flatMap(t=>{const m=/^取货时间\s*[:：]?\s*(\d{2}:\d{2})\s*[-–—至]\s*(\d{2}:\d{2})$/.exec(t);return m?[m[1]+'-'+m[2]]:[]}))];
  if(dateSummary.length===1&&timeSummary.length===1){const [start,end]=timeSummary[0].split('-');if(start<end)out.slotSummary={date:dateSummary[0],start,end,verified:true};}
  // C050 Root genuine-quota adaptation: current native labels are compact/lowercase (october5), not generic date prose.
  // Their complete associated group, proved pickup fieldset and matching day values are required; no year is invented.
  const nativeDateInputs=checkoutScope?[...main.querySelectorAll('input[name="bartPickupDateSelectorButtonGroup"]')]:[];
  const nativeDateLabel=l=>/(?:^|\s)form-selector-label(?:\s|$)/.test(l.getAttribute('class')??'');
  const nativeDateMode=nativeDateInputs.some(e=>[...e.labels??[]].some(nativeDateLabel));
  const nativeDateKnown=e=>{
    const ls=[...e.labels??[]],l=ls.length===1?ls[0]:null,m=/^(january|february|march|april|may|june|july|august|september|october|november|december)\s*([1-9]|[12]\d|3[01])$/i.exec(name(e));
    const days={january:31,february:29,march:31,april:30,may:31,june:30,july:31,august:31,september:30,october:31,november:30,december:31};
    return !!(knownPickupCaption&&pf&&within(pf,e)&&visible(e)&&norm(e.getAttribute('type')).toLowerCase()==='radio'&&
      l?.tagName==='LABEL'&&visible(l)&&nativeDateLabel(l)&&within(pf,l)&&name(e)===norm(l.textContent)&&m&&
      Number(m[2])<=days[m[1].toLowerCase()]&&e.value===m[2]);
  };
  const dateChoices=nativeDateMode?nativeDateInputs.filter(nativeDateKnown):radios.filter(e=>datePattern.test(name(e)));
  const nativeDatesComplete=!nativeDateMode||nativeDateInputs.length===dateChoices.length&&new Set(dateChoices.map(name)).size===dateChoices.length;
  const dateSelects=selects.filter(e=>e!==timeSelects[0]&&[...e.options].length>0&&[...e.options].every(o=>datePattern.test(norm(o.textContent))));
  if(phase==='SLOTS'&&nativeDatesComplete&&timeSelects.length===1&&(dateChoices.length>0) !== (dateSelects.length===1)){
    const ds=dateChoices.length?dateChoices:[...dateSelects[0].options];
    out.dates=ds.map((d,i)=>({label:name(d),ref:'date:'+i,enabled:!disabled(d),selected:d.tagName==='OPTION'?d.selected:checked(d)}));
    const one=out.dates.filter(d=>d.selected);out.selectedDate=one.length===1?one[0].label:null;
    out.times=[...timeSelects[0].options].flatMap((o,i)=>{const m=/^(\d{2}:\d{2})\s*[-–—至]\s*(\d{2}:\d{2})$/.exec(norm(o.textContent));return m?[{start:m[1],end:m[2],ref:'time:'+i,enabled:!disabled(timeSelects[0])&&!disabled(o)}]:[];});
    // Complete current native control capture, not proof of server capacity or a held allocation.
    out.listComplete=one.length===1&&out.times.length>0&&[...timeSelects[0].options].every(o=>norm(o.textContent)==='可选时段'||/^\d{2}:\d{2}\s*[-–—至]\s*\d{2}:\d{2}$/.test(norm(o.textContent)));
  }
  // Known normal-flow transition is not a hold guarantee. ChromePort binds it to its delivered choice.
  out.termsLinks=[...new Set([...document.querySelectorAll('a[href]')].filter(a=>visible(a)&&/条款|销售政策/.test(name(a))).flatMap(a=>{try{const h=new URL(a.href);return h.protocol==='https:'&&h.hostname==='www.apple.com.cn'&&/^\/shop\/open\/salespolicies\/?$/.test(h.pathname)?[h.origin+h.pathname.replace(/\/$/,'')]:[];}catch{return [];}}))];
  const orderLabels=[...new Set(texts.filter(t=>/^订单(?:编号|号)\s*[:：]?\s*[A-Z0-9-]{6,30}$/.test(t)).map(t=>t.match(/[A-Z0-9-]{6,30}$/)[0]))];
  // C-015: hash a newly seen reference, then decode the WHOLE current document again with the hash cached. Only that final,
  // await-free decode is returned or acted on. A reference that changed while it was hashed is not current evidence.
  let referenceChanged=false;
  if(orderLabels.length===1){const known=internal?.hashes?.get(orderLabels[0]);
    if(known)out.orderRefHash=known;else if(internal?.hashes)referenceChanged=true;
    else{const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(orderLabels[0]));
      return merchantDocument(plan,command,{hashes:new Map([[orderLabels[0],[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')]])});}}
  const detailLinks=[...new Set([...main.querySelectorAll('a[href]')].filter(a=>visible(a)&&['查看订单','查看订单详情'].includes(name(a))).flatMap(a=>{try{const h=new URL(a.href);return h.protocol==='https:'&&(h.hostname==='www.apple.com.cn'||/^secure(?:\d+)?\.www\.apple\.com\.cn$/.test(h.hostname))&&orderDetailPath.test(h.pathname)?[h.href]:[];}catch{return [];}}))];
  if(detailLinks.length===1)out.orderDetailLink=detailLinks[0];
  // C051 (Claude): current normal contact-only pickup-details step (C-051 normal Chrome evidence, secure8 /shop/checkout; public
  // metadata only, no values): one live 继续选择付款方式, the five observed labelled required contact inputs, the companion-bar total and
  // no other order fact. It repeats no product, store, quantity or slot, so it is a recognized STEP and purchase stays unverified.
  // Any iPhone mention (any visibility), store/fulfillment/date/time/quantity/extras/order evidence, visible dialog, other money,
  // duplicated or differently typed contact field means it is not this step. Only the job continues it, from its own bound slot send.
  const CONTACT=[['姓氏',['','text']],['名字',['','text']],['电子邮件地址',['email']],['联系人手机号码',['tel']],['政府颁发的身份证件号码的后四位',['','text'],4]];
  const shownInputs=[...main.querySelectorAll('input')].filter(visible);
  const contactForm=CONTACT.every(([label,types,max])=>{const m=shownInputs.filter(e=>name(e)===label),e=m.length===1?m[0]:null;
    return !!e&&!disabled(e)&&e.readOnly!==true&&e.required===true&&types.includes(norm(e.getAttribute('type')).toLowerCase())&&(max===undefined||e.maxLength===max);});
  const contactOnly=checkoutScope&&!bagScoped&&phase==='DETAILS'&&contactForm&&mentions(main)===0&&productLines.length===0&&!mainQtyShown&&!/件商品|数量/.test(norm(main.textContent))&&
    radios.length===0&&storeRadios.length===0&&fieldValues.length===0&&fulfillmentChoice===null&&!deliveryProse&&selects.length===0&&nativeDateInputs.length===0&&
    !texts.some(t=>/^(?:取货(?:日期|时间|地点|门店)|自提门店|店内取货地点)|AppleCare|折抵|换购/.test(t))&&!out.slotSummary&&!out.extrasConflict&&orderLabels.length===0&&!out.orderRefHash&&
    dialogs?.length===0&&bars.length===1&&bars[0].tagName==='BUTTON'&&visible(bars[0])&&!disabled(bars[0])&&barTotal>0&&totalLines.length===0&&total===barTotal;
  out.contactStep=contactOnly?{kind:'contact-only-details',verified:true,totalCny:barTotal,fields:CONTACT.length}:null;
  out.receiptVerified=phase==='ORDER_RECEIPT'&&!!out.orderRefHash&&purchase.verified;
  // Official refusal anchors are not yet observed: real alerts remain unknown rather than invented rejection.
  if(referenceChanged)return command?report('OperationEvidenceChanged'):{schema:'applebuy-merchant-read/v1',phase:'UNKNOWN',reason:'order-reference-changed'};
  if(!command)return out;
  // Private DOM fingerprint for slot continuation. It never reads input values or leaves document memory.
  const snapshot=()=>JSON.stringify([location.href,document.querySelector('main,[role="main"]')===main,
    [...main.querySelectorAll('h1,h2,h3,p,span,div')].filter(visible).map(e=>norm(e.textContent)).filter(t=>t.length>0&&t.length<=180),
    [...main.querySelectorAll('input[type="radio"],[role="radio"]')].filter(visible).map(e=>[name(e),checked(e),disabled(e)]),
    [...main.querySelectorAll('select')].filter(visible).map(e=>[name(e),disabled(e),e.selectedIndex,[...e.options].map(o=>[name(o),disabled(o)])]),
    [...main.querySelectorAll('button,a[role="button"],input[type="submit"]')].filter(visible).map(e=>[name(e),disabled(e)])]);
  // touched becomes true immediately before the first DOM write. A structured caller learns whether a failure
  // happened before any control was touched; otherwise the original exception propagates.
  let touched=false;
  // C-016: a pickup value goes only to the ONLY visible input carrying one of its key's labels, and only when that input is
  // a native, enabled, writable text/tel/email field that is not an authentication field.
  // C051 (Claude): the observed contact labels 联系人手机号码 (tel) and 政府颁发的身份证件号码的后四位 (text, maxlength 4) bind only with
  // that observed type/length. Any two allowed labels of one key on visible inputs are ambiguous; hidden inputs never receive a value.
  const rules={firstName:['名字'],lastName:['姓氏'],phone:['手机号码','电话号码','联系人手机号码'],email:['电子邮件地址'],identitySuffix:['身份证件号码最后4位','身份证件号码后四位','政府颁发的身份证件号码的后四位']};
  const observedBinding={'联系人手机号码':e=>norm(e.getAttribute('type')).toLowerCase()==='tel','政府颁发的身份证件号码的后四位':e=>['','text'].includes(norm(e.getAttribute('type')).toLowerCase())&&e.maxLength===4};
  const bind=key=>{const m=[...main.querySelectorAll('input')].filter(e=>visible(e)&&rules[key].includes(name(e))),e=m.length===1?m[0]:null;
    return e&&e instanceof HTMLInputElement&&!disabled(e)&&e.readOnly!==true&&['','text','tel','email'].includes(norm(e.getAttribute('type')).toLowerCase())&&!/password|one-time-code/.test(norm(e.getAttribute('autocomplete')).toLowerCase())&&(observedBinding[name(e)]?.(e)??true)?e:null;};
  // C051: a contact-only step continues only under the job's explicit contactOnly command and this decode's own recognized step.
  const detailsStep=c=>phase==='DETAILS'&&(purchase.verified||c?.contactOnly===true&&out.contactStep?.verified===true);
  // Labels and states of the visible inputs, never their values.
  const inputSig=l=>JSON.stringify(l.map(e=>[name(e),norm(e.getAttribute('type')).toLowerCase(),norm(e.getAttribute('autocomplete')).toLowerCase(),disabled(e),e.required===true,e.readOnly===true]));
  const requiredInvalid=()=>[...main.querySelectorAll('input[required]')].filter(visible).some(e=>!e.checkValidity());
  // C029 (Claude): ordinary order-summary disclosure: open the single companion-bar control, read the one newly shown summary
  // dialog, close it with its single close control, and keep the facts only if main is exactly as before. No merchant resource
  // step; any old record is dropped first, so a failure leaves no proof. C029-R1: the normal close control was observed with the
  // accessible name 关闭. Only that exact name is used: one visible enabled BUTTON named 关闭 and no other visible close-like
  // control in the dialog. Any other label (关闭订单, Close, ...) or ambiguity is never clicked; the opened summary is reported
  // truthfully as touched and left for a human.
  const readSummary=async()=>{
    const sig=()=>JSON.stringify([snapshot(),norm(main.textContent)]),before=sig(),context=orderContext(),bar=bars[0];
    const settle=async ok=>{const t0=Date.now();for(let i=0;i<200;i++){await new Promise(r=>setTimeout(r,16));const v=ok();if(v)return v;if(Date.now()-t0>1500)break;}return null;};
    const one=(root,s)=>{const m=[...root.querySelectorAll(s)];return m.length===1?m[0]:null;};
    const money=t=>{const m=/^RMB\s*(\d{1,3}(?:,\d{3})*|\d+)(\.\d{2})?$/.exec(t);return m?Number(m[1].replaceAll(',','')+(m[2]??'')):null;};
    delete globalThis.__applebuySummary;touched=true;bar.click();
    const dialog=await settle(()=>{const d=shownDialogs();return d?.length===1?d[0]:null;});if(!dialog)throw new Error('OrderSummaryNotShown');
    const facts=(()=>{
      if(dialog.tagName!=='DIV'||dialog.getAttribute('role')!=='dialog'||dialog.getAttribute('aria-modal')!=='true'||within(dialog,main)||within(main,dialog))return null;
      const titles=[...dialog.querySelectorAll('span.visuallyhidden')].filter(e=>norm(e.textContent)==='订单摘要');
      const section=one(dialog,'.rs-companionbar-ordersummary-section'),item=one(dialog,'.rs-companionbar-items');
      const row=item?.closest('.rs-companionbar-bagitemrow'),details=item?.closest('.rs-order-item-details'),orderTotal=item?.closest('.rs-companionbar-ordertotal');
      if(titles.length!==1||!section||item?.tagName!=='SPAN'||!visible(item)||row?.tagName!=='P'||!details||!orderTotal||!within(section,orderTotal)||!within(orderTotal,details)||!within(details,row))return null;
      const count=/^(\d{1,2}) ?件商品$/.exec(norm(item.textContent));if(!count||(norm(dialog.textContent).match(/件商品/g)??[]).length!==1)return null;
      const rows=['rs-companionbar-summary-subtotal','rs-companionbar-summary-shipping','rs-companionbar-total-row'].map(c=>one(dialog,'.'+c));
      if([rows[0],rows[2]].some(r=>r?.tagName!=='DIV'||!visible(r)))return null;
      // C036: the observed normal pickup summary has subtotal/total and an explicit piece label, with no shipping row. That shape
      // is allowed only under a current unambiguous pickup choice; a missing delivery row remains unknown. No amount implies count.
      const shippingRows=[...dialog.querySelectorAll('.rs-companionbar-summary-shipping')];
      const pickupNoShipping=shippingRows.length===0&&fulfillmentChoice==='pickup';
      const freeShipping=shippingRows.length===1&&rows[1]?.tagName==='DIV'&&visible(rows[1])&&/^运费\s*免费$/.test(norm(rows[1].textContent));
      if(!pickupNoShipping&&!freeShipping)return null;
      const sub=/^小计\s*(.+)$/.exec(norm(rows[0].textContent)),tot=/^总计\s*(.+)$/.exec(norm(rows[2].textContent));
      const subtotal=sub?money(sub[1]):null,sum=tot?money(tot[1]):null;
      return subtotal!==null&&sum!==null?{count:Number(count[1]),subtotal,total:sum,shipping:pickupNoShipping?'pickup-no-shipping-row':'免费'}:null;
    })();
    const closers=[...dialog.querySelectorAll('button,[role="button"]')].filter(b=>visible(b)&&/关闭|close/i.test(name(b)));
    if(closers.length!==1||closers[0].tagName!=='BUTTON'||name(closers[0])!=='关闭'||disabled(closers[0]))throw new Error('OrderSummaryCloseUnrecognized');closers[0].click();
    if(!await settle(()=>shownDialogs()?.length===0&&visible(main)))throw new Error('OrderSummaryNotClosed');
    if(!facts)throw new Error('OrderSummaryUnrecognized');
    if(facts.subtotal!==facts.total||facts.total!==total)throw new Error('OrderSummaryMoneyDiffers');
    if(document.querySelector('main,[role="main"]')!==main||new URL(location.href).href!==u.href||sig()!==before)throw new Error('OrderSummaryContextChanged');
    globalThis.__applebuySummary={readBy:command.summaryKey,main,href:u.href,context,at:Date.now(),count:facts.count,subtotal:facts.subtotal,total:facts.total,shipping:facts.shipping};
    return {delivered:true,summary:{goodsCount:facts.count,subtotalCny:facts.subtotal,totalCny:facts.total,shipping:facts.shipping}};
  };
  // One value per pass, to its original receiver while it is still the current binding, then a task boundary and re-entry.
  // Synchronous handlers, every microtask they queue and zero-delay timers queued earlier have run before the next decision.
  // Longer timers, network/server validation and any merchant-side effect of the written value remain unknown.
  const fillDetail=async c=>{
    const [key,...rest]=c.keys,e=c.bound[key],setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
    if(!setter)throw new Error('NativeInputSetterMissing');if(bind(key)!==e)throw new Error('PrivateFieldReceiverChanged');
    touched=true;setter.call(e,command.privatePickupData[key]);e.dispatchEvent(new Event('input',{bubbles:true}));
    if(bind(key)!==e)throw new Error('PrivateFieldReceiverChanged');e.dispatchEvent(new Event('change',{bubbles:true}));
    const writtenAt=Date.now();await new Promise(r=>setTimeout(r,0));
    return await merchantDocument(plan,command,{hashes:internal?.hashes??new Map(),details:{...c,keys:rest,writtenAt}});
  };
  try{
    if(internal?.slot){
      // C-015: slot continuation, re-entered after the change task boundary. The selection was already written, so any
      // failure is touched. This gate uses THIS synchronous decode of the current document and is immediately followed
      // by the click: no await separates the evidence from the decision. Same main, native selector holding the commanded
      // enabled terminal, same date, item/quote/store, complete lists, unchanged fingerprint and the same live Continue.
      const c=internal.slot,s=c.select;touched=true;
      const liveNext=buttons.filter(b=>name(b)==='继续填写取货详情');
      const selected=s.selectedOptions.length===1?s.selectedOptions[0]:null;
      const m=selected?/^(\d{2}:\d{2})\s*[-–—至]\s*(\d{2}:\d{2})$/.exec(norm(selected.textContent)):null;
      if(Date.now()-c.changedAt>c.limit||snapshot()!==c.afterChange||main!==c.main||!s.isConnected||timeSelects.length!==1||timeSelects[0]!==s||disabled(s)||!selected||disabled(selected)||
        s.selectedIndex!==Number(command.ref.split(':')[1])||!m||m[1]!==command.start||m[2]!==command.end||
        phase!=='SLOTS'||out.listComplete!==true||out.selectedDate!==command.date||!purchase.verified||
        JSON.stringify(purchase)!==JSON.stringify(c.out.purchase)||JSON.stringify(out.dates)!==JSON.stringify(c.out.dates)||JSON.stringify(out.times)!==JSON.stringify(c.out.times)||
        liveNext.length!==1||liveNext[0]!==c.next||!c.next.isConnected||disabled(c.next))throw new Error('SlotEvidenceChangedAfterSelection');
      c.next.click();return {delivered:true};
    }
    if(internal?.details){
      // C-016: details continuation, re-entered after the task boundary that follows the previous value's input/change events.
      // A value was already written, so every failure is touched. THIS synchronous decode must equal the verified details
      // evidence (URL, same main, phase, purchase, slot summary), keep the identical visible input set and the same live
      // Continue. Only then is the next value sent to its original, still unique allowed receiver, or Continue clicked.
      const c=internal.details,live=exact('继续选择付款方式'),now=[...main.querySelectorAll('input')].filter(visible);touched=true;
      if(Date.now()-c.writtenAt>c.limit||u.href!==c.href||main!==c.main||!detailsStep(c)||JSON.stringify(out)!==c.expected||
        now.length!==c.inputs.length||now.some((e,i)=>e!==c.inputs[i])||inputSig(now)!==c.inputSig||live.length!==1||live[0]!==c.next||!c.next.isConnected)throw new Error('DetailsEvidenceChangedAfterInput');
      if(c.keys.length)return await fillDetail(c);
      if(requiredInvalid())throw new Error('PickupDetailsRequireHuman');c.next.click();return {delivered:true};
    }
    if(command.authorized!==true||!command.id||!command.taskId)throw new Error('OperationEvidenceChanged');
    // C-013-R3: delivery truth first. A known id stays touched even when its own delivery changed the evidence;
    // only a never-seen id with stale evidence is positively untouched.
    const memo=globalThis.__applebuyExecuted??=(new Set());if(memo.has(command.id)){touched=true;throw new Error('OperationAlreadyDelivered');}
    // C-018: the expected evidence crossed a structured-clone/JSON boundary that may reorder object members. Both sides are
    // compared with members sorted, recursively; values, types, array order and member presence must still match exactly.
    // Defined inside this function so the serialized program stays self-contained. Unparsable expected evidence is changed.
    const canon=v=>JSON.stringify(v,(k,x)=>x!==null&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(n=>[n,x[n]])):x);
    let same=false;try{same=typeof command.expected==='string'&&canon(JSON.parse(command.expected))===canon(out);}catch{}
    if(!same)throw new Error('OperationEvidenceChanged');memo.add(command.id);
    const click=t=>{const b=exact(t);if(b.length!==1||!b[0].isConnected)throw new Error('CurrentControlUnrecognized');touched=true;b[0].click();};
    const pick=t=>{const r=findRadio(t).filter(e=>!disabled(e));if(r.length!==1||!r[0].isConnected)throw new Error('CurrentChoiceUnrecognized');touched=true;r[0].click();};
    if(command.action==='configureProduct'&&(phase==='ENTRY'||phase==='VARIANT'||phase==='PRELAUNCH'&&out.prelaunchConfigurable===true)){
      // Observe again after every individual public selection; only the current next enabled choice may be clicked.
      if(out.nextChoice?.choice!==command.choice||out.nextChoice.state!=='enabled'||out.extrasConflict)throw new Error('ProductChoiceChanged');pick(command.choice);
    }else if(command.action==='continueProduct'&&phase==='ENTRY'&&specSelected&&!out.extrasConflict&&!out.nextChoice){click('继续');
    }else if(command.action==='addBag'&&phase==='VARIANT'&&out.variantVerified&&!out.nextChoice&&out.quotedCny<=plan.maxTotalCny)click('添加到购物袋');
    else if(command.action==='viewBag'&&phase==='ACCESSORIES'&&!bagScoped)click('查看购物袋');
    else if(command.action==='checkout'&&phase==='BAG'&&purchase.itemVerified&&!bagScoped){if(exact('安全结账').length===1)click('安全结账');else click('结账');}
    // C-019: observed bag checkout additionally needs merchant no-extras proof and the cap on this fresh decode; one control only.
    else if(command.action==='checkout'&&phase==='BAG'&&bag&&purchase.itemVerified&&out.extras===false&&purchase.totalCny<=plan.maxTotalCny){
      const b=bag.checkout;if(!b?.isConnected||!visible(b)||disabled(b))throw new Error('CurrentControlUnrecognized');touched=true;b.click();
    }
    // C-024 (Claude): a FULFILLMENT mutation also needs this fresh decode's total to be positive and within the cap (as the observed
    // bag checkout does); choosing pickup also needs no conflicting store evidence. Quantity still comes only from itemVerified.
    else if(command.action==='selectPickup'&&phase==='FULFILLMENT'&&purchase.itemVerified&&purchase.totalCny>0&&purchase.totalCny<=plan.maxTotalCny&&!storeConflict&&['unselected','delivery'].includes(fulfillmentChoice))pick('我要取货');
    // C037 (Claude): a numbered native store radio is chosen only through the same exact label+R609 proof (nativeStoreName), never
    // by its ID or a name substring alone. It must be a visible enabled radio and the only store-locator input in main, of any
    // visibility or state, that carries its ID or names the store. A duplicate, disabled or hidden twin, or a rival, stops untouched.
    else if(command.action==='selectStore'&&phase==='FULFILLMENT'&&purchase.itemVerified&&purchase.totalCny>0&&purchase.totalCny<=plan.maxTotalCny&&pickupShown&&plan.stores.includes(command.store)){
      const want=norm(command.store),label=e=>nativeStore(e)?nativeStoreName(e):name(e);
      const choices=storeRadios.filter(e=>label(e)===want&&!disabled(e));
      const names=x=>[norm(x.getAttribute('aria-label')),...[...x.labels??[]].map(l=>norm(l.textContent))];
      const sole=e=>!nativeStore(e)||norm(e.getAttribute('type')).toLowerCase()==='radio'&&
        [...main.querySelectorAll('input[name="store-locator-result"]')].every(x=>x===e||x.value!==e.value&&!names(x).some(t=>t.includes(want)));
      if(choices.length!==1||!choices[0].isConnected||!sole(choices[0]))throw new Error('CurrentChoiceUnrecognized');touched=true;choices[0].click();
    }
    else if(command.action==='selectDate'&&phase==='SLOTS'){
      const index=Number(command.ref?.split(':')[1]),d=out.dates[index];if(!d||d.label!==command.date||!d.enabled)throw new Error('DateEvidenceChanged');
      touched=true;if(dateChoices.length)dateChoices[index].click();else{const s=dateSelects[0];s.selectedIndex=index;s.dispatchEvent(new Event('change',{bubbles:true}));}
    }else if(command.action==='chooseSlot'&&phase==='SLOTS'&&purchase.verified&&out.listComplete){
      const t=out.times.find(t=>t.ref===command.ref);if(!t||!t.enabled||t.start!==command.start||t.end!==command.end||out.selectedDate!==command.date)throw new Error('SlotEvidenceChanged');
      const next=exact('继续填写取货详情');if(next.length!==1||!next[0].isConnected)throw new Error('CurrentControlUnrecognized');
      const s=timeSelects[0];touched=true;s.selectedIndex=Number(command.ref.split(':')[1]);s.dispatchEvent(new Event('change',{bubbles:true}));
      if(!s.isConnected)throw new Error('SlotControlRedrawn');
      // A change handler may reset the choice, disable it, redraw controls, or change purchase conditions.
      // C-013-R3: decide only after the browser task boundary that follows the change event. By then every microtask the
      // page queued (any nesting depth) has run, and so has every zero-delay timer it queued earlier in this frame's
      // timer order. Longer timers, network validation and any later server decision are NOT covered (contract unknown).
      // The boundary is bounded: a selection older than SETTLE_LIMIT_MS (throttled/frozen page) is no longer current.
      // C-015: the decision re-enters this program, which decodes the current document and gates synchronously (above).
      const SETTLE_LIMIT_MS=2000,changedAt=Date.now(),afterChange=snapshot();
      await new Promise(r=>setTimeout(r,0));
      return await merchantDocument(plan,command,{hashes:internal?.hashes??new Map(),slot:{select:s,next:next[0],main,out,afterChange,changedAt,limit:SETTLE_LIMIT_MS}});
    }else if(command.action==='fillDetails'&&detailsStep(command)){
      const supplied=command.privatePickupData??{};if(Object.keys(supplied).some(k=>!Object.hasOwn(rules,k)))throw new Error('PrivateFieldNotAllowed');
      const bound={};for(const [key,value] of Object.entries(supplied)){if(typeof value!=='string'||value.length>100||(key==='identitySuffix'&&!/^\d{4}$/.test(value)))throw new Error('PrivateFieldInvalid');bound[key]=bind(key);if(!bound[key])throw new Error('PrivateFieldContractUnrecognized');}
      // Validate all field bindings BEFORE transmitting the first value. Never return or persist values.
      // Nothing supplied: nothing is written, so this synchronous decode is still current for Continue.
      if(!Object.keys(bound).length){if(requiredInvalid())throw new Error('PickupDetailsRequireHuman');click('继续选择付款方式');}
      else{const next=exact('继续选择付款方式'),inputs=[...main.querySelectorAll('input')].filter(visible);if(next.length!==1||!next[0].isConnected)throw new Error('CurrentControlUnrecognized');
        return await fillDetail({keys:Object.keys(bound),bound,main,href:u.href,expected:JSON.stringify(out),next:next[0],inputs,inputSig:inputSig(inputs),limit:2000,contactOnly:command.contactOnly===true});}
    }else if(command.action==='selectPayment'&&phase==='PAYMENT'&&purchase.verified){pick('支付宝');}
    else if(command.action==='continuePayment'&&phase==='PAYMENT'&&purchase.verified&&out.paymentMethod==='支付宝'){if(exact('继续查看订单').length===1)click('继续查看订单');else click('继续');}
    else if(command.action==='submitOrder'&&phase==='REVIEW'&&purchase.verified&&out.paymentMethod==='支付宝'){
      const g=command.finalGrant;if(!g||g.termsAccepted!==true||g.taskId!==command.taskId||g.planDigest!==command.planDigest||g.expiry<=Date.now()||g.existingOrdersChecked!==true||g.noExtras!==true||!out.termsLinks.includes(g.termsUrl)||!out.slotSummary)throw new Error('CurrentFinalGrantMissing');click('立即下单');
    }
    // C035 (Claude): openProduct is only re-verified here: this exact document still decodes as the expected verified empty bag. No
    // control is touched; ChromePort then navigates the tab to the plan's public entry. Later additions use fresh product reads.
    else if(command.action==='openProduct'&&phase==='EMPTY_BAG'&&emptyBag){}
    // C035-R1 Codex quota completion: ordinary navigation back to the bag after a current side read found one matching item. It
    // does not Add or Checkout here; the configured original document must still be unchanged and a fresh BAG check follows.
    else if(command.action==='openBag'&&phase==='VARIANT'&&out.variantVerified===true&&Number.isFinite(out.quotedCny)&&out.quotedCny>0&&out.quotedCny<=plan.maxTotalCny&&!out.extrasConflict){}
    // C064: write-free current error-document revalidation. ChromePort also requires its own fresh matching bag proof before navigation.
    else if(command.action==='openBag'&&command.afterAddReconciliation===true&&phase==='UNKNOWN'&&out.merchantError==='page-not-found'){}
    else if(command.action==='readOrderSummary'&&out.summaryReadable===true&&typeof command.summaryKey==='string'&&command.summaryKey.length>0)return await readSummary();
    else throw new Error('ActionNotRecognizedForCurrentStage');
  }catch(e){
    if(command.structured!==true)throw e;
    return {delivered:false,touched,reason:/^[A-Za-z]{1,60}$/.test(e?.message)?e.message:'PageProgramError'};
  }
  return {delivered:true};
}
