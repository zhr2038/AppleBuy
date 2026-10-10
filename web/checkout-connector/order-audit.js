// Normal rendered account pages only. Raw displayed links stay inside the browser peer.
export const ORDER_LIST='https://www.apple.com.cn/shop/order/list';
// Only Chrome's positive missing-owned-id result is disappearance; permission/transport errors are not.
export function missingOwnedTab(error,id){return Number.isSafeInteger(id)&&error instanceof Error&&new RegExp('^No tab with id: '+id+'\\.?$').test(error.message);}
export function orderUrl(raw){try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(u.hostname==='www.apple.com.cn'||/^secure\d+\.www\.apple\.com\.cn$/.test(u.hostname))&&/^\/shop\/(?:order\/(?:list|detail\/[^/]+\/W\d{6,30})|signIn(?:\/orders)?)\/?$/.test(u.pathname);}catch{return false;}}

// Explicitly selected existing official detail tab: fixed readonly parser, never adopts/closes/navigates the tab.
export async function auditCancelledOrder(api,plan,expectedRefHash){
 const unknown={state:'unknown'};
 if(!/^[a-f0-9]{64}$/.test(expectedRefHash??''))throw Error('CancelledOrderSelectionInvalid');
 const candidates=await api.tabs.query({url:['https://www.apple.com.cn/shop/order/detail/*','https://*.www.apple.com.cn/shop/order/detail/*']});
 if(!Array.isArray(candidates)||candidates.length>20)return unknown;
 const selected=[];for(const t of candidates){
  if(!Number.isSafeInteger(t.id)||!orderUrl(t.url))continue;
  const ref=/^\/shop\/order\/detail\/[^/]+\/(W\d{6,30})$/.exec(new URL(t.url).pathname)?.[1];if(!ref)continue;
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ref)))].map(v=>v.toString(16).padStart(2,'0')).join('');
  if(digest===expectedRefHash)selected.push(t.id);
 }
 if(selected.length!==1)return unknown;const tabId=selected[0];
 const before=await api.tabs.get(tabId);
 if(before?.status!=='complete'||!orderUrl(before.url)||!/^\/shop\/order\/detail\//.test(new URL(before.url).pathname)||!await api.permissions.contains({origins:[new URL(before.url).origin+'/*']}))return unknown;
 const rows=await api.scripting.executeScript({target:{tabId,frameIds:[0]},world:'ISOLATED',func:orderDocument,args:['detail']});
 const after=await api.tabs.get(tabId);
 if(after?.url!==before.url||after.status!=='complete'||rows?.length!==1||rows[0].frameId!==0||!rows[0].documentId||rows[0].error)return unknown;
 const r=rows[0].result;
 if(r?.state!=='detail'||r.referenceHash!==expectedRefHash||r.status!=='cancelled'||r.productTitle!==`${plan.product.model} ${plan.product.capacity} ${plan.product.color}`||r.totalCny!==9999||r.itemRows!==1)return unknown;
 return {state:'cancelled',sameReference:true,productMatches:true,totalCny:r.totalCny};
}

export async function orderDocument(kind){
 const norm=s=>String(s??'').normalize('NFKC').replace(/\s+/g,' ').trim();
 const visible=e=>!!e?.isConnected&&!e.closest('[hidden],[aria-hidden="true"],[inert]')&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';
 const hash=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(v=>v.toString(16).padStart(2,'0')).join('');
 const status=s=>/^(?:你的取货订单已取消。|取货已取消|已取消)$/.test(s)?'cancelled':/^已取货(?:\s*\d{1,2}月\s*\d{1,2})?$/.test(s)?'fulfilled':/^(?:请在\s*\d+\s*分钟内完成付款。|你的订单正在等待付款。|请完成付款|等待付款|待付款)$/.test(s)?'unpaid':'unknown';
 const unknown={state:'unknown'};
 if(location.href==='about:blank')return {state:'loading'};
 const url=new URL(location.href);if(url.protocol!=='https:'||url.username||url.password||url.port||!(url.hostname==='www.apple.com.cn'||/^secure\d+\.www\.apple\.com\.cn$/.test(url.hostname)))return unknown;
 if(/^\/shop\/signIn(?:\/orders)?\/?$/.test(url.pathname))return {state:'auth'};
 if(kind==='detail'&&/^\/shop\/order\/list\/?$/.test(url.pathname))return {state:'loading'};
 const roots=[...document.querySelectorAll('main,[role="main"]')].filter(visible);if(roots.length!==1)return unknown;
 const m=roots[0],startUrl=location.href,startHtml=m.innerHTML;const stable=value=>location.href===startUrl&&m.isConnected&&m.innerHTML===startHtml?value:unknown;if(m.querySelector('#aid-auth-widget-iFrame,input[type="password"]')||/\/shop\/signIn/.test(location.pathname))return {state:'auth'};
 if([...m.querySelectorAll('[role="alert"],[role="dialog"],[aria-modal="true"]')].some(e=>visible(e)&&norm(e.textContent)))return unknown;
 const h=[...m.querySelectorAll('h1')].filter(visible);
 if(kind==='list'){
  if(h.length!==1||norm(h[0].textContent)!=='你已订购的产品。'||!m.matches('.rs-ol')||!/^\/shop\/order\/list\/?$/.test(location.pathname))return unknown;
  const account=m.querySelector('.rs-order-appleidsubheader');if(!visible(account)||!/^你当前登录的账户是\s*\S+/.test(norm(account.textContent)))return unknown;
  const cards=[...m.querySelectorAll('li.rs-ol-tile')],links=[...m.querySelectorAll('a[data-autom="product-tile-name"]')];
  // Empty and pagination contracts are not guessed from an absent card or button.
  if(!cards.length||cards.length>100||cards.length!==links.length||[...m.querySelectorAll('button,a')].some(e=>visible(e)&&/^(?:下一页|下一批|加载更多|更多订单|查看更多)$/.test(norm(e.textContent))))return unknown;
  const rows=[];for(const card of cards){
   const as=[...card.querySelectorAll('a[data-autom="product-tile-name"]')];if(as.length!==1||!visible(card)||!visible(as[0]))return unknown;
   const a=as[0],label=norm(a.getAttribute('aria-label')),match=/^(.+) - Order (W\d{6,30})$/.exec(label),delivery=document.getElementById(a.getAttribute('aria-describedby'));
   if(!match||!delivery||!card.contains(delivery)||!delivery.matches('.rs-ol-tile-delivery')||!visible(delivery)||norm(a.textContent)!==match[1])return unknown;
   let u;try{u=new URL(a.href);}catch{return unknown;}
   if(u.protocol!=='https:'||u.username||u.password||u.port||!/^secure\d+\.www\.apple\.com\.cn$/.test(u.hostname)||!new RegExp('^/shop/order/detail/[^/]+/'+match[2]+'$').test(u.pathname))return unknown;
   rows.push({referenceHash:await hash(match[2]),model:match[1],status:status(norm(delivery.textContent)),link:u.href});
  }
  if(new Set(rows.map(r=>r.referenceHash)).size!==rows.length)return unknown;
  return stable({state:'list',accountHash:await hash(norm(account.textContent)),rows});
 }
 if(kind==='detail'){
  const ref=/^\/shop\/order\/detail\/[^/]+\/(W\d{6,30})$/.exec(location.pathname)?.[1],number=m.querySelector('.rs-od-order-number');
  if(!ref||h.length!==1||norm(h[0].textContent)!=='你的订单详情。'||!visible(number)||norm(number.textContent)!=='订单号: '+ref)return unknown;
  const items=[...m.querySelectorAll('.rs-od-itemdetail')],totals=[...m.querySelectorAll('[data-autom="total-billing-summary-row"]')];
  if(items.length!==1||totals.length!==1||!visible(items[0])||!visible(totals[0]))return unknown;
  const names=[...items[0].querySelectorAll('.rs-display-item-name')],states=[...items[0].querySelectorAll('.rs-od-itemstatus')],stores=[...m.querySelectorAll('.rs-od-itempickup .rs-pickuplocation')];
  const price=/^总计\s*\(含税\)\s*RMB\s*([\d,]+(?:\.\d{2})?)$/.exec(norm(totals[0].textContent));
  if(names.length!==1||states.length!==1||!visible(names[0])||!visible(states[0])||!price||stores.length>1)return unknown;
  const state=status(norm(states[0].textContent));
  return stable({state:'detail',referenceHash:await hash(ref),status:state,productTitle:norm(names[0].textContent),totalCny:Number(price[1].replaceAll(',','')),store:stores.length===1&&visible(stores[0])?norm(stores[0].textContent):null,quantity:null,slot:null,itemRows:1});
 }
 return unknown;
}

export class OrderAudit {
 constructor(peer,{wait=ms=>new Promise(r=>setTimeout(r,ms)),now=Date.now}={}){this.peer=peer;this.wait=wait;this.now=now;this.tabId=null;this.expected=null;this.authUntil=null;this.authFocused=false;this.removals=0;this.userClosed=false;this.closingId=null;}
 removed(id,{intentional=false}={}){if(!Number.isSafeInteger(id))return;this.peer.tabs.delete(id);if(this.tabId===id){if(!intentional&&this.closingId!==id)this.userClosed=true;this.tabId=null;this.expected=null;this.authUntil=null;this.authFocused=false;this.removals++;}}
 beginClose(id){if(this.tabId===id)this.closingId=id;}
 async closeTab(api){if(this.tabId===null)return;const id=this.tabId;this.beginClose(id);try{await api.tabs.remove(id);}catch(error){if(this.tabId===id&&!missingOwnedTab(error,id))throw error;}finally{this.closingId=null;}this.removed(id,{intentional:true});}
 async read(api,kind){
  for(let i=0;i<30;i++){
   const t=await api.tabs.get(this.tabId);
   if(!t.url||t.url==='about:blank'){await this.wait(100);continue;}
   if(!orderUrl(t.url))return {state:'unknown'};
   if(t.status==='complete'){
    if(kind==='detail'&&/^\/shop\/order\/list\/?$/.test(new URL(t.url).pathname)){await this.wait(100);continue;}
    if(!await api.permissions.contains({origins:[new URL(t.url).origin+'/*']}))return {state:'permission'};
    const rows=await api.scripting.executeScript({target:{tabId:this.tabId,frameIds:[0]},world:'ISOLATED',func:orderDocument,args:[kind]});
    if(rows?.length!==1||rows[0].frameId!==0||!rows[0].documentId||rows[0].error)return {state:'unknown'};
    if(rows[0].result?.state==='loading'){await this.wait(100);continue;}
    return rows[0].result??{state:'unknown'};
   }
   await this.wait(100);
  }return {state:'loading'};
 }
 async run(api,plan,expectedRefHash=null,{automatic=false}={}){
  if(automatic&&this.userClosed)return {state:'unknown'};
  if(!automatic)this.userClosed=false;
  let keep=false;const removalEpoch=this.removals;try{
   const result=await this.runOnce(api,plan,expectedRefHash);
   keep=['auth','waiting'].includes(result.state)||this.authUntil!==null&&result.state==='unknown';
   return result;
  }catch(error){
   if(this.removals!==removalEpoch||missingOwnedTab(error,this.tabId)){this.removed(this.tabId);return {state:'unknown'};}
   throw error;
  }finally{if(!keep)await this.closeTab(api);}
 }
 async runOnce(api,plan,expectedRefHash=null){
  if(expectedRefHash!==null&&!/^[a-f0-9]{64}$/.test(expectedRefHash))throw Error('OrderReferenceInvalid');
  if(this.tabId!==null&&this.expected!==expectedRefHash)await this.closeTab(api);
  this.expected=expectedRefHash;
  if(this.tabId===null){
   if(this.peer.tabs.size>=4||!await api.permissions.contains({origins:['https://www.apple.com.cn/*']}))return {state:'permission'};
   const t=await api.tabs.create({url:ORDER_LIST,active:false});if(!Number.isSafeInteger(t?.id))throw Error('OrderTabUnconfirmed');
   this.tabId=t.id;this.peer.tabs.set(t.id,{last:null,navigation:null,orderAudit:true});
  }
  const tab=await api.tabs.get(this.tabId);let isDetail=false;try{isDetail=/\/shop\/order\/detail\//.test(new URL(tab.url).pathname);}catch{}
  let value=await this.read(api,isDetail?'detail':'list');
  if(['auth','loading'].includes(value.state)){
   this.authUntil??=this.now()+300000;
   if(this.now()>=this.authUntil)return {state:'unknown'};
   if(value.state==='auth'&&!this.authFocused){await api.tabs.update(this.tabId,{active:true});this.authFocused=true;}
   return {state:value.state==='auth'?'auth':'waiting'};
  }
  if(value.state==='list'){
   const matches=value.rows.filter(r=>r.model===plan.product.model||r.model.startsWith(plan.product.model+' ')&&!r.model.startsWith(plan.product.model+' Max'));
   if(!expectedRefHash)return {state:matches.some(r=>r.status==='unpaid')?'unpaid-exists':matches.some(r=>r.status==='unknown')?'unconfirmed':'clear',authenticated:true,accountHash:value.accountHash,matchingCount:matches.length};
   const target=value.rows.find(r=>r.referenceHash===expectedRefHash);if(!target||target.model!==plan.product.model||!orderUrl(target.link))return {state:'not-found'};
   if(!await api.permissions.contains({origins:[new URL(target.link).origin+'/*']}))return {state:'permission'};
   await api.tabs.update(this.tabId,{url:target.link});value=await this.read(api,'detail');
   if(['auth','loading'].includes(value.state)){
    this.authUntil??=this.now()+300000;
    if(this.now()>=this.authUntil)return {state:'unknown'};
    if(value.state==='auth'&&!this.authFocused){await api.tabs.update(this.tabId,{active:true});this.authFocused=true;}
    return {state:value.state==='auth'?'auth':'waiting'};
   }
  }
  if(value.state==='detail'&&expectedRefHash&&value.referenceHash===expectedRefHash){
   const {status,productTitle,totalCny,store,quantity,slot,itemRows}=value;
   return {state:'detail',sameReference:true,status,productMatches:productTitle===`${plan.product.model} ${plan.product.capacity} ${plan.product.color}`,totalCny,storeMatches:store===plan.stores[0],quantity,slot,itemRows};
  }
  return {state:['auth','permission'].includes(value.state)?value.state:'unknown'};
 }
}
