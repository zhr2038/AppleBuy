// Serializable ISOLATED-world program. Merchant semantics, not undocumented HTTP interfaces.
// Unsupported/ambiguous evidence stops. Refusal text catalog is deliberately EMPTY for real Apple.
// C-012-R1 (Claude): exact store proof, separate line counting, observed no-trade-in/no-AppleCare dependency,
// merchant-only extras evidence and structured untouched failure reports.
// Codex quota takeover: reject conflicting quantity/store evidence and revalidate after a native slot change.
// C-013 (Codex, quota fallback): observed order-login path is an explicit human authentication gate.
export async function merchantDocument(plan,command=null){
  const u=new URL(location.href);
  const safe=u.protocol==='https:'&&(u.hostname==='www.apple.com.cn'||/^secure(?:\d+)?\.www\.apple\.com\.cn$/.test(u.hostname))&&/^\/shop\/(?:buy-iphone\/(?:iphone-18-pro|iphone-duo)(?:\/[^/]+\/a)?|bag|checkout|order(?:\/[^?#]*)?|signIn(?:\/orders)?)(?:\/)?$/.test(u.pathname);
  if(!safe)return {schema:'applebuy-merchant-read/v1',phase:'UNKNOWN',reason:'unsupported-official-url'};
  if(/^\/shop\/signIn\/orders\/?$/.test(u.pathname)){
    if(command){if(command.structured!==true)throw new Error('AuthenticationRequired');return {delivered:false,touched:false,reason:'AuthenticationRequired'};}
    return {schema:'applebuy-merchant-read/v1',phase:'AUTH',verifiedStep:false,reason:'official-order-sign-in-required',dates:[],times:[]};
  }
  const main=document.querySelector('main,[role="main"]');if(!main)return {schema:'applebuy-merchant-read/v1',phase:'UNKNOWN',reason:'main-not-found'};
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s\u{200B}\u{200C}\u{200D}\u{2060}]+/gu,' ').trim();
  const visible=e=>{if(!e||!e.isConnected)return false;for(let p=e;p;p=p.parentElement){const st=getComputedStyle(p);if(p.hidden||p.hasAttribute('inert')||p.getAttribute('aria-hidden')==='true'||st.display==='none'||['hidden','collapse'].includes(st.visibility))return false;}return true;};
  const disabled=e=>e.disabled===true||!!e.closest('[disabled],[aria-disabled="true"],[inert]');
  const name=e=>norm(e.getAttribute('aria-label')||([...e.labels??[]].filter(visible).map(x=>x.textContent).join(' '))||e.textContent);
  // Public labels/selected choices only. No password, contact values, cookie, storage or traffic capture.
  const buttons=[...main.querySelectorAll('button,a[role="button"],input[type="submit"]')].filter(visible);
  const radios=[...main.querySelectorAll('input[type="radio"],[role="radio"]')].filter(visible);
  const boxes=[...main.querySelectorAll('input[type="checkbox"],[role="checkbox"]')].filter(visible);
  const selects=[...main.querySelectorAll('select')].filter(visible);
  const textEls=[...main.querySelectorAll('h1,h2,h3,p,span,div')].filter(visible).map(e=>({e,t:norm(e.textContent)})).filter(x=>x.t.length>0&&x.t.length<=180);
  const texts=textEls.map(x=>x.t);
  // Separate page lines: an identical nested wrapper is one line, identical siblings are separate lines (never deduplicated by text).
  const within=(a,b)=>{for(let p=b.parentElement;p;p=p.parentElement)if(p===a)return true;return false;};
  const lines=re=>{const m=textEls.filter(x=>re.test(x.t));return m.filter(x=>!m.some(y=>y!==x&&within(y.e,x.e)));};
  const exact=t=>buttons.filter(b=>name(b)===t&&!disabled(b));
  const checked=e=>e.checked===true||e.getAttribute('aria-checked')==='true';
  const findRadio=t=>radios.filter(e=>(name(e)===t||name(e).startsWith(t+' '))&&!(t==='iPhone 18 Pro'&&name(e).startsWith('iPhone 18 Pro Max')));
  const fullVariant=norm(`${plan.product.model} ${plan.product.capacity} ${plan.product.color}`);
  const productRe=/^iPhone (?:18 Pro(?: Max)?|Duo)\b.*\b(?:256GB|512GB|1TB|2TB)\b/;
  const productLines=texts.filter(t=>productRe.test(t));
  const exactProduct=productLines.some(t=>t===fullVariant)&&productLines.every(t=>t===fullVariant);
  const quantityLines=lines(/^数量\s*[:：]?\s*\d+$/);
  const qtyControls=selects.filter(e=>/数量/.test(name(e)));
  const controlQty=qtyControls.length===1&&qtyControls[0].selectedOptions.length===1?Number(norm(qtyControls[0].selectedOptions[0]?.textContent)):null;
  const lineQty=quantityLines.length===1?Number(quantityLines[0].t.match(/\d+/)[0]):null;
  const qty=qtyControls.length>1||quantityLines.length>1||(qtyControls.length===1&&quantityLines.length===1&&controlQty!==lineQty)?null:qtyControls.length===1?controlQty:lineQty;
  const totalLines=[...new Set(texts.filter(t=>/^(?:总计|合计|应付总额)(?:\s*\(含税\))?\s*[:：]?\s*(?:RMB|¥|￥)\s*[\d,]+(?:\.\d{2})?$/.test(t)))];
  const total=totalLines.length===1?Number(totalLines[0].match(/(?:RMB|¥|￥)\s*([\d,]+(?:\.\d{2})?)/)[1].replaceAll(',','')):null;
  // Store proof: one enabled checked store choice or one exact labelled value. Any other checked store,
  // store-like labelled value, container listing several stores or disagreement leaves the store unproven.
  const planStore=n=>plan.stores.find(s=>n===norm(s))??null;
  const storeRadios=radios.filter(e=>/^Apple\s/.test(name(e))),checkedStores=storeRadios.filter(checked);
  const radioStore=checkedStores.length===1&&!disabled(checkedStores[0])?planStore(name(checkedStores[0])):null;
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
  const purchase={itemVerified:exactProduct&&qty===1&&Number.isFinite(total),verified:exactProduct&&qty===1&&Number.isFinite(total)&&!!store&&pickupShown,model:exactProduct?plan.product.model:null,capacity:exactProduct?plan.product.capacity:null,color:exactProduct?plan.product.color:null,quantity:qty,totalCny:total,store,fulfillment:pickupShown?'pickup':null};
  let phase='UNKNOWN';
  if(main.querySelector('input[type="password"],input[autocomplete="one-time-code"]')||texts.includes('以游客身份继续'))phase='AUTH';
  else if(texts.some(t=>t==='Apple 和你的数据隐私'))phase='CONSENT';
  else if(main.querySelector('[aria-busy="true"]'))phase='PROCESSING';
  else if(texts.some(t=>['待付款','等待付款','请完成付款'].includes(t)))phase=/^\/shop\/order\/(?!list(?:\/|$))[^/]+\/?$/.test(u.pathname)?'ORDER_DETAIL':u.pathname==='/shop/checkout'?'ORDER_RECEIPT':'UNKNOWN';
  else if(exact('立即下单').length===1)phase='REVIEW';
  else if(exact('继续选择付款方式').length===1)phase='DETAILS';
  else if(exact('继续填写取货详情').length===1&&purchase.fulfillment==='pickup'&&purchase.store)phase='SLOTS';
  else if(findRadio('支付宝').length===1)phase='PAYMENT';
  else if(findRadio('我要取货').length===1)phase='FULFILLMENT';
  else if(exact('结账').length===1||exact('安全结账').length===1)phase='BAG';
  else if(exact('查看购物袋').length===1)phase='ACCESSORIES';
  else if(exact('添加到购物袋').length===1)phase='VARIANT';
  else if(u.pathname.startsWith('/shop/buy-iphone/'))phase='ENTRY';
  const out={schema:'applebuy-merchant-read/v1',phase,purchase,verifiedStep:!['UNKNOWN','AUTH','CONSENT','PROCESSING'].includes(phase),path:u.pathname,feedback:null,acceptedSlot:null,slotSummary:null,continueAvailable:exact('继续').length===1,variantVerified:false,quotedCny:null,listComplete:false,dates:[],times:[],selectedDate:null,paymentMethod:findRadio('支付宝').some(checked)?'支付宝':null,extras:null,existingOrdersChecked:false,orderRefHash:null,orderDetailLink:null};
  out.fulfillmentChoice=fulfillmentChoice;
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
  if(texts.some(t=>t.includes('暂未发售')||t.includes('机型将在获得批准后发售'))&&buttons.some(b=>name(b)==='继续'&&disabled(b))&&!buttons.some(b=>name(b)==='继续'&&!disabled(b)))out.phase=phase='PRELAUNCH';
  // Merchant no-extra evidence (bag/review): one separate product line, no extra marker. Human consent never substitutes.
  if(phase==='REVIEW'||phase==='BAG'){
    const marker=texts.some(t=>(/AppleCare/.test(t)&&!t.includes(NO_APPLECARE))||(/折抵|换购/.test(t)&&!t.includes(NO_TRADE_IN)));
    const items=lines(productRe).length;
    out.extras=out.extrasConflict||marker||items>1||quantityLines.length>1?true:purchase.itemVerified&&items===1?false:null;
  }
  const timeSelects=selects.filter(e=>[...e.options].some(o=>/^\d{2}:\d{2}\s*[-–—至]\s*\d{2}:\d{2}$/.test(norm(o.textContent))));
  const datePattern=/^(?:(?:\d{4}年)?\d{1,2}月\d{1,2}日(?:\s*(?:周|星期)[一二三四五六日天])?|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2})$/;
  const dateSummary=[...new Set(texts.flatMap(t=>{const m=/^取货日期\s*[:：]?\s*(.+)$/.exec(t);return m&&datePattern.test(m[1])?[m[1]]:[]}))];
  const timeSummary=[...new Set(texts.flatMap(t=>{const m=/^取货时间\s*[:：]?\s*(\d{2}:\d{2})\s*[-–—至]\s*(\d{2}:\d{2})$/.exec(t);return m?[m[1]+'-'+m[2]]:[]}))];
  if(dateSummary.length===1&&timeSummary.length===1){const [start,end]=timeSummary[0].split('-');if(start<end)out.slotSummary={date:dateSummary[0],start,end,verified:true};}
  const dateChoices=radios.filter(e=>datePattern.test(name(e)));
  const dateSelects=selects.filter(e=>e!==timeSelects[0]&&[...e.options].length>0&&[...e.options].every(o=>datePattern.test(norm(o.textContent))));
  if(phase==='SLOTS'&&timeSelects.length===1&&(dateChoices.length>0) !== (dateSelects.length===1)){
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
  if(orderLabels.length===1){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(orderLabels[0]));out.orderRefHash=[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
  const detailLinks=[...new Set([...main.querySelectorAll('a[href]')].filter(a=>visible(a)&&['查看订单','查看订单详情'].includes(name(a))).flatMap(a=>{try{const h=new URL(a.href);return h.protocol==='https:'&&(h.hostname==='www.apple.com.cn'||/^secure(?:\d+)?\.www\.apple\.com\.cn$/.test(h.hostname))&&/^\/shop\/order\/(?!list(?:\/|$))[^/]+(?:\/)?$/.test(h.pathname)?[h.href]:[];}catch{return [];}}))];
  if(detailLinks.length===1)out.orderDetailLink=detailLinks[0];
  out.receiptVerified=phase==='ORDER_RECEIPT'&&!!out.orderRefHash&&purchase.verified;
  // Official refusal anchors are not yet observed: real alerts remain unknown rather than invented rejection.
  if(!command)return out;
  // touched becomes true immediately before the first DOM write. A structured caller learns whether a failure
  // happened before any control was touched; otherwise the original exception propagates.
  let touched=false;
  try{
    if(command.authorized!==true||command.expected!==JSON.stringify(out)||!command.id||!command.taskId)throw new Error('OperationEvidenceChanged');
    const memo=globalThis.__applebuyExecuted??=(new Set());if(memo.has(command.id)){touched=true;throw new Error('OperationAlreadyDelivered');}memo.add(command.id);
    const click=t=>{const b=exact(t);if(b.length!==1||!b[0].isConnected)throw new Error('CurrentControlUnrecognized');touched=true;b[0].click();};
    const pick=t=>{const r=findRadio(t).filter(e=>!disabled(e));if(r.length!==1||!r[0].isConnected)throw new Error('CurrentChoiceUnrecognized');touched=true;r[0].click();};
    if(command.action==='configureProduct'&&(phase==='ENTRY'||phase==='VARIANT')){
      // Observe again after every individual public selection; only the current next enabled choice may be clicked.
      if(out.nextChoice?.choice!==command.choice||out.nextChoice.state!=='enabled'||out.extrasConflict)throw new Error('ProductChoiceChanged');pick(command.choice);
    }else if(command.action==='continueProduct'&&phase==='ENTRY'&&specSelected&&!out.extrasConflict&&!out.nextChoice){click('继续');
    }else if(command.action==='addBag'&&phase==='VARIANT'&&out.variantVerified&&!out.nextChoice&&out.quotedCny<=plan.maxTotalCny)click('添加到购物袋');
    else if(command.action==='viewBag'&&phase==='ACCESSORIES')click('查看购物袋');
    else if(command.action==='checkout'&&phase==='BAG'&&purchase.itemVerified){if(exact('安全结账').length===1)click('安全结账');else click('结账');}
    else if(command.action==='selectPickup'&&phase==='FULFILLMENT'&&purchase.itemVerified&&['unselected','delivery'].includes(fulfillmentChoice))pick('我要取货');
    else if(command.action==='selectStore'&&phase==='FULFILLMENT'&&purchase.itemVerified&&pickupShown&&plan.stores.includes(command.store)){
      const choices=storeRadios.filter(e=>name(e)===norm(command.store)&&!disabled(e));
      if(choices.length!==1||!choices[0].isConnected)throw new Error('CurrentChoiceUnrecognized');touched=true;choices[0].click();
    }
    else if(command.action==='selectDate'&&phase==='SLOTS'){
      const index=Number(command.ref?.split(':')[1]),d=out.dates[index];if(!d||d.label!==command.date||!d.enabled)throw new Error('DateEvidenceChanged');
      touched=true;if(dateChoices.length)dateChoices[index].click();else{const s=dateSelects[0];s.selectedIndex=index;s.dispatchEvent(new Event('change',{bubbles:true}));}
    }else if(command.action==='chooseSlot'&&phase==='SLOTS'&&purchase.verified&&out.listComplete){
      const t=out.times.find(t=>t.ref===command.ref);if(!t||!t.enabled||t.start!==command.start||t.end!==command.end||out.selectedDate!==command.date)throw new Error('SlotEvidenceChanged');
      const s=timeSelects[0];touched=true;s.selectedIndex=Number(command.ref.split(':')[1]);s.dispatchEvent(new Event('change',{bubbles:true}));
      if(!s.isConnected)throw new Error('SlotControlRedrawn');
      // A change handler may reset the choice, disable it, redraw controls, or change purchase conditions.
      // Re-read production evidence before continuation. The local fingerprint stays private and detects
      // any asynchronous DOM drift while that read is awaited. It never reads input values or leaves document memory.
      const snapshot=()=>JSON.stringify([location.href,document.querySelector('main,[role="main"]')===main,
        [...main.querySelectorAll('h1,h2,h3,p,span,div')].filter(visible).map(e=>norm(e.textContent)).filter(t=>t.length>0&&t.length<=180),
        [...main.querySelectorAll('input[type="radio"],[role="radio"]')].filter(visible).map(e=>[name(e),checked(e),disabled(e)]),
        [...main.querySelectorAll('select')].filter(visible).map(e=>[name(e),disabled(e),e.selectedIndex,[...e.options].map(o=>[name(o),disabled(o)])]),
        [...main.querySelectorAll('button,a[role="button"],input[type="submit"]')].filter(visible).map(e=>[name(e),disabled(e)])]);
      const afterChange=snapshot(),current=await merchantDocument(plan);
      const liveSelectors=[...main.querySelectorAll('select')].filter(visible).filter(e=>[...e.options].some(o=>/^\d{2}:\d{2}\s*[-–—至]\s*\d{2}:\d{2}$/.test(norm(o.textContent))));
      const selected=s.selectedOptions.length===1?s.selectedOptions[0]:null;
      const m=selected?/^(\d{2}:\d{2})\s*[-–—至]\s*(\d{2}:\d{2})$/.exec(norm(selected.textContent)):null;
      if(snapshot()!==afterChange||!s.isConnected||liveSelectors.length!==1||liveSelectors[0]!==s||disabled(s)||!selected||disabled(selected)||
        s.selectedIndex!==Number(command.ref.split(':')[1])||!m||m[1]!==command.start||m[2]!==command.end||
        current.phase!=='SLOTS'||current.listComplete!==true||current.selectedDate!==command.date||!current.purchase?.verified||
        JSON.stringify(current.purchase)!==JSON.stringify(out.purchase)||JSON.stringify(current.dates)!==JSON.stringify(out.dates)||JSON.stringify(current.times)!==JSON.stringify(out.times))throw new Error('SlotEvidenceChangedAfterSelection');
      click('继续填写取货详情');
    }else if(command.action==='fillDetails'&&phase==='DETAILS'&&purchase.verified){
      const rules={firstName:['名字'],lastName:['姓氏'],phone:['手机号码','电话号码'],email:['电子邮件地址'],identitySuffix:['身份证件号码最后4位','身份证件号码后四位']};
      const supplied=command.privatePickupData??{};if(Object.keys(supplied).some(k=>!Object.hasOwn(rules,k)))throw new Error('PrivateFieldNotAllowed');
      const targets=[];for(const [key,value] of Object.entries(supplied)){if(typeof value!=='string'||value.length>100||(key==='identitySuffix'&&!/^\d{4}$/.test(value)))throw new Error('PrivateFieldInvalid');const matches=[...main.querySelectorAll('input')].filter(e=>visible(e)&&!disabled(e)&&rules[key].includes(name(e)));if(matches.length!==1)throw new Error('PrivateFieldContractUnrecognized');targets.push([matches[0],value]);}
      // Validate all field bindings BEFORE transmitting the first value. Never return or persist values.
      const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(targets.length&&!setter)throw new Error('NativeInputSetterMissing');
      for(const [e,v] of targets){touched=true;setter.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}
      if([...main.querySelectorAll('input[required]')].filter(visible).some(e=>!e.checkValidity()))throw new Error('PickupDetailsRequireHuman');click('继续选择付款方式');
    }else if(command.action==='selectPayment'&&phase==='PAYMENT'&&purchase.verified){pick('支付宝');}
    else if(command.action==='continuePayment'&&phase==='PAYMENT'&&purchase.verified&&out.paymentMethod==='支付宝'){if(exact('继续查看订单').length===1)click('继续查看订单');else click('继续');}
    else if(command.action==='submitOrder'&&phase==='REVIEW'&&purchase.verified&&out.paymentMethod==='支付宝'){
      const g=command.finalGrant;if(!g||g.termsAccepted!==true||g.taskId!==command.taskId||g.planDigest!==command.planDigest||g.expiry<=Date.now()||g.existingOrdersChecked!==true||g.noExtras!==true||!out.termsLinks.includes(g.termsUrl)||!out.slotSummary)throw new Error('CurrentFinalGrantMissing');click('立即下单');
    }
    else throw new Error('ActionNotRecognizedForCurrentStage');
  }catch(e){
    if(command.structured!==true)throw e;
    return {delivered:false,touched,reason:/^[A-Za-z]{1,60}$/.test(e?.message)?e.message:'PageProgramError'};
  }
  return {delivered:true};
}
