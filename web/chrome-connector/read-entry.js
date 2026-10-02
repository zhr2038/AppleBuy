// C-011 Codex quota takeover. Self-contained function for Chrome MV3 executeScript serialization.
// Only whitelisted public facts leave the page. No actions, input values, identity data, cookies or requests.
export function inspectPublicEntry(){
  const blocked={schema:'applebuy-public-entry/v1',scope:'public-entry-read-only',state:'blocked',canPurchase:false};
  const url=new URL(location.href);
  const allowed=['/shop/buy-iphone/iphone-18-pro','/shop/buy-iphone/iphone-duo','/shop/buy-iphone/iphone-duo/mk2m4ch/a'];
  if(url.protocol!=='https:'||url.hostname!=='www.apple.com.cn'||!allowed.includes(url.pathname.replace(/\/$/,'')))return blocked;
  const main=document.querySelector('main,[role="main"]');if(!main)return blocked;
  // Treat login or sensitive forms as a hard boundary; never inspect their contents or values.
  if(main.querySelector('input[type="password"],input[type="email"],input[autocomplete="one-time-code"],input[autocomplete="cc-number"]'))return blocked;
  const shown=(element,transparentNative=false)=>{
    if(!element)return false;
    for(let e=element;e;e=e.parentElement){
      if(e.hasAttribute('hidden')||e.hasAttribute('inert')||e.getAttribute('aria-hidden')==='true')return false;
      const style=getComputedStyle(e);
      if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||(!transparentNative&&style.opacity==='0'))return false;
    }
    return true;
  };
  const norm=text=>String(text??'').replace(/[\s\u200b\u200c\u200d\u2060]+/g,' ').trim();
  const h1=main.querySelector('h1');const heading=norm(h1?.textContent);
  if(!shown(h1)||!['购买 iPhone 18 Pro','iPhone Duo','购买 iPhone Duo'].includes(heading))return blocked;
  const controls=[];
  for(const input of main.querySelectorAll('input[type="radio"]')){
    const labels=[...main.querySelectorAll('label')].filter(label=>label.getAttribute('for')===input.getAttribute('id'));
    const name=norm(input.getAttribute('aria-label')||labels.filter(label=>shown(label)).map(label=>label.textContent).join(' '));
    const match=/^(iPhone 18 Pro Max|iPhone 18 Pro|256GB|512GB|1TB|2TB|星光白色|夜空色|勃艮第酒红色|冰川蓝色|银色|黑色)(?![A-Za-z])/.exec(name);
    if(!match||!shown(input,true)||(!input.getAttribute('aria-label')&&!labels.some(label=>shown(label))))continue;
    // Price in the public selector is a configuration quote, never an order total or stock proof.
    const price=/\bRMB\s*(\d[\d,]*(?:\.\d{2})?)/.exec(name);
    controls.push({name:match[1],checked:input.checked===true,enabled:!input.disabled&&input.getAttribute('aria-disabled')!=='true',quotedCny:price?Number(price[1].replaceAll(',','')):null});
  }
  if(controls.length===0||controls.length>32)return blocked;
  const next=[...main.querySelectorAll('button')].filter(button=>shown(button)&&norm(button.textContent)==='继续');
  return {schema:'applebuy-public-entry/v1',scope:'public-entry-read-only',state:'observed',canPurchase:false,
    product:heading.includes('Duo')?'iPhone Duo':'iPhone 18 Pro',path:url.pathname,controls,
    continueEnabled:next.length===1&&!next[0].disabled&&next[0].getAttribute('aria-disabled')!=='true',
    slotListObserved:false,skuObserved:url.pathname==='/shop/buy-iphone/iphone-duo/mk2m4ch/a',sku:url.pathname==='/shop/buy-iphone/iphone-duo/mk2m4ch/a'?'MK2M4CH/A':null,orderStateObserved:false};
}
