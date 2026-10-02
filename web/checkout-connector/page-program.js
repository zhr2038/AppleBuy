// Serializable ISOLATED-world program. Merchant semantics, not undocumented HTTP interfaces.
// Unsupported/ambiguous evidence stops. Refusal text catalog is deliberately EMPTY for real Apple.
export async function merchantDocument(plan,command=null){
  const u=new URL(location.href);
  const safe=u.protocol==='https:'&&(u.hostname==='www.apple.com.cn'||/^secure(?:\d+)?\.www\.apple\.com\.cn$/.test(u.hostname))&&/^\/shop\/(?:buy-iphone\/(?:iphone-18-pro|iphone-duo)(?:\/[^/]+\/a)?|bag|checkout|order(?:\/[^?#]*)?|signIn)(?:\/)?$/.test(u.pathname);
  if(!safe)return {schema:'applebuy-merchant-read/v1',phase:'UNKNOWN',reason:'unsupported-official-url'};
  const main=document.querySelector('main,[role="main"]');if(!main)return {schema:'applebuy-merchant-read/v1',phase:'UNKNOWN',reason:'main-not-found'};
  const norm=s=>String(s??'').normalize('NFKC').replace(/[\s\u200b\u200c\u200d\u2060]+/g,' ').trim();
  const visible=e=>{if(!e||!e.isConnected)return false;for(let p=e;p;p=p.parentElement){const st=getComputedStyle(p);if(p.hidden||p.hasAttribute('inert')||p.getAttribute('aria-hidden')==='true'||st.display==='none'||['hidden','collapse'].includes(st.visibility))return false;}return true;};
  const disabled=e=>e.disabled===true||!!e.closest('[disabled],[aria-disabled="true"],[inert]');
  const name=e=>norm(e.getAttribute('aria-label')||([...e.labels??[]].filter(visible).map(x=>x.textContent).join(' '))||e.textContent);
  // Public labels/selected choices only. No password, contact values, cookie, storage or traffic capture.
  const buttons=[...main.querySelectorAll('button,a[role="button"],input[type="submit"]')].filter(visible);
  const radios=[...main.querySelectorAll('input[type="radio"],[role="radio"]')].filter(visible);
  const selects=[...main.querySelectorAll('select')].filter(visible);
  const texts=[...main.querySelectorAll('h1,h2,h3,p,span,div')].filter(visible).map(e=>norm(e.textContent)).filter(t=>t.length>0&&t.length<=180);
  const exact=t=>buttons.filter(b=>name(b)===t&&!disabled(b));
  const checked=e=>e.checked===true||e.getAttribute('aria-checked')==='true';
  const findRadio=t=>radios.filter(e=>(name(e)===t||name(e).startsWith(t+' '))&&!(t==='iPhone 18 Pro'&&name(e).startsWith('iPhone 18 Pro Max')));
  const fullVariant=norm(`${plan.product.model} ${plan.product.capacity} ${plan.product.color}`);
  const productLines=texts.filter(t=>/^iPhone (?:18 Pro(?: Max)?|Duo)\b/.test(t)&&/\b(?:256GB|512GB|1TB|2TB)\b/.test(t));
  const exactProduct=productLines.some(t=>t===fullVariant)&&productLines.every(t=>t===fullVariant);
  const quantityLines=[...new Set(texts.filter(t=>/^数量\s*[:：]?\s*\d+$/.test(t)))];
  const qtyControls=selects.filter(e=>/数量/.test(name(e)));
  const qty=qtyControls.length>1?null:qtyControls.length===1?Number(norm(qtyControls[0].selectedOptions[0]?.textContent)):quantityLines.length===1?Number(quantityLines[0].match(/\d+/)[0]):null;
  const totalLines=[...new Set(texts.filter(t=>/^(?:总计|合计|应付总额)(?:\s*\(含税\))?\s*[:：]?\s*(?:RMB|¥|￥)\s*[\d,]+(?:\.\d{2})?$/.test(t)))];
  const total=totalLines.length===1?Number(totalLines[0].match(/(?:RMB|¥|￥)\s*([\d,]+(?:\.\d{2})?)/)[1].replaceAll(',','')):null;
  const storeFields=texts.filter(t=>/^(?:取货地点|取货门店|自提门店|店内取货地点)\s*[:：]?/.test(t));
  const stores=plan.stores.filter(s=>findRadio(s).some(checked)||storeFields.some(t=>t.includes(norm(s))));
  const pickedPickup=findRadio('我要取货').filter(checked);
  const pickupShown=pickedPickup.length===1||texts.includes('店内取货')||texts.includes('到店取货');
  const purchase={itemVerified:exactProduct&&qty===1&&Number.isFinite(total),verified:exactProduct&&qty===1&&Number.isFinite(total)&&stores.length===1&&pickupShown,model:exactProduct?plan.product.model:null,capacity:exactProduct?plan.product.capacity:null,color:exactProduct?plan.product.color:null,quantity:qty,totalCny:total,store:stores.length===1?stores[0]:null,fulfillment:pickupShown?'pickup':null};
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
  const selected=radios.filter(checked).map(name);
  const title=norm(main.querySelector('h1')?.textContent);
  const modelShown=title===plan.product.model||title==='购买 '+plan.product.model;
  const modelChoices=findRadio(plan.product.model);
  const needed=[...(modelChoices.length?[plan.product.model]:[]),plan.product.color,plan.product.capacity];
  out.selectedProductChoices=needed.filter(t=>selected.some(n=>n===t||n.startsWith(t+' ')));
  out.needsSelection=needed.filter(t=>!out.selectedProductChoices.includes(t));
  const specSelected=modelShown&&out.needsSelection.length===0;
  const quoteRadio=findRadio(plan.product.capacity).filter(checked);
  const quote=quoteRadio.length===1?/\bRMB\s*([\d,]+(?:\.\d{2})?)/.exec(name(quoteRadio[0])):null;
  if(specSelected&&quote){out.variantVerified=true;out.quotedCny=Number(quote[1].replaceAll(',',''));}
  if(texts.some(t=>t.includes('暂未发售')||t.includes('机型将在获得批准后发售'))&&buttons.some(b=>name(b)==='继续'&&disabled(b))&&!buttons.some(b=>name(b)==='继续'&&!disabled(b)))out.phase=phase='PRELAUNCH';
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
  if(command.authorized!==true||command.expected!==JSON.stringify(out)||!command.id||!command.taskId)throw new Error('OperationEvidenceChanged');
  const memo=globalThis.__applebuyExecuted??=(new Set());if(memo.has(command.id))throw new Error('OperationAlreadyDelivered');memo.add(command.id);
  const click=t=>{const b=exact(t);if(b.length!==1||!b[0].isConnected)throw new Error('CurrentControlUnrecognized');b[0].click();};
  const pick=t=>{const r=findRadio(t).filter(e=>!disabled(e));if(r.length!==1||!r[0].isConnected)throw new Error('CurrentChoiceUnrecognized');r[0].click();};
  if(command.action==='configureProduct'){
    // Observe again after every individual public selection; never click a newly detached selector.
    if(!out.needsSelection.includes(command.choice))throw new Error('ProductChoiceChanged');pick(command.choice);
  }else if(command.action==='continueProduct'&&phase==='ENTRY'&&specSelected){click('继续');
  }else if(command.action==='addBag'&&phase==='VARIANT'&&out.variantVerified&&out.quotedCny<=plan.maxTotalCny)click('添加到购物袋');
  else if(command.action==='viewBag'&&phase==='ACCESSORIES')click('查看购物袋');
  else if(command.action==='checkout'&&phase==='BAG'&&purchase.itemVerified){if(exact('安全结账').length===1)click('安全结账');else click('结账');}
  else if(command.action==='selectPickup'&&phase==='FULFILLMENT'&&purchase.itemVerified)pick('我要取货');
  else if(command.action==='selectStore'&&phase==='FULFILLMENT'&&purchase.itemVerified&&pickupShown&&plan.stores.includes(command.store))pick(command.store);
  else if(command.action==='selectDate'&&phase==='SLOTS'){
    const index=Number(command.ref?.split(':')[1]),d=out.dates[index];if(!d||d.label!==command.date||!d.enabled)throw new Error('DateEvidenceChanged');
    if(dateChoices.length)dateChoices[index].click();else{const s=dateSelects[0];s.selectedIndex=index;s.dispatchEvent(new Event('change',{bubbles:true}));}
  }else if(command.action==='chooseSlot'&&phase==='SLOTS'&&purchase.verified&&out.listComplete){
    const t=out.times.find(t=>t.ref===command.ref);if(!t||!t.enabled||t.start!==command.start||t.end!==command.end||out.selectedDate!==command.date)throw new Error('SlotEvidenceChanged');
    const s=timeSelects[0];s.selectedIndex=Number(command.ref.split(':')[1]);s.dispatchEvent(new Event('change',{bubbles:true}));
    if(!s.isConnected)throw new Error('SlotControlRedrawn');click('继续填写取货详情');
  }else if(command.action==='fillDetails'&&phase==='DETAILS'&&purchase.verified){
    const rules={firstName:['名字'],lastName:['姓氏'],phone:['手机号码','电话号码'],email:['电子邮件地址'],identitySuffix:['身份证件号码最后4位','身份证件号码后四位']};
    const supplied=command.privatePickupData??{};if(Object.keys(supplied).some(k=>!Object.hasOwn(rules,k)))throw new Error('PrivateFieldNotAllowed');
    const targets=[];for(const [key,value] of Object.entries(supplied)){if(typeof value!=='string'||value.length>100||(key==='identitySuffix'&&!/^\d{4}$/.test(value)))throw new Error('PrivateFieldInvalid');const matches=[...main.querySelectorAll('input')].filter(e=>visible(e)&&!disabled(e)&&rules[key].includes(name(e)));if(matches.length!==1)throw new Error('PrivateFieldContractUnrecognized');targets.push([matches[0],value]);}
    // Validate all field bindings BEFORE transmitting the first value. Never return or persist values.
    for(const [e,v] of targets){const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(!setter)throw new Error('NativeInputSetterMissing');setter.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}
    if([...main.querySelectorAll('input[required]')].filter(visible).some(e=>!e.checkValidity()))throw new Error('PickupDetailsRequireHuman');click('继续选择付款方式');
  }else if(command.action==='selectPayment'&&phase==='PAYMENT'&&purchase.verified){pick('支付宝');}
  else if(command.action==='continuePayment'&&phase==='PAYMENT'&&purchase.verified&&out.paymentMethod==='支付宝'){if(exact('继续查看订单').length===1)click('继续查看订单');else click('继续');}
  else if(command.action==='submitOrder'&&phase==='REVIEW'&&purchase.verified&&out.paymentMethod==='支付宝'){
    const g=command.finalGrant;if(!g||g.termsAccepted!==true||g.taskId!==command.taskId||g.planDigest!==command.planDigest||g.expiry<=Date.now()||g.existingOrdersChecked!==true||g.noExtras!==true||!out.termsLinks.includes(g.termsUrl)||!out.slotSummary)throw new Error('CurrentFinalGrantMissing');click('立即下单');
  }
  else throw new Error('ActionNotRecognizedForCurrentStage');
  return {delivered:true};
}
