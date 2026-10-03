// Independent Codex regressions derived from the supported October 3 public bag observation.
// This is a FAKE DOM and FAKE Chrome API. Labels/structural anchors are observed; mutations, variants and
// adversarial changes are synthetic. No browser, account, network, real bag/order or permission is accessed.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
import {ChromePort} from '../web/checkout-connector/chrome-port.js';
import {PurchaseJob,TASK_KEY} from '../web/checkout-connector/job.js';

const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{tradeIn:'none',appleCare:'none'}};
const bagUrl='https://www.apple.com.cn/shop/bag';
class El{
  constructor(tag='DIV',text='',attrs={}){Object.assign(this,{tagName:tag.toUpperCase(),ownText:text,attrs,children:[],parentElement:null,isConnected:true,hidden:false,disabled:false,checked:false,labels:[],clicks:0,selectedIndex:0});}
  append(...nodes){for(const n of nodes){n.parentElement=this;this.children.push(n);}return this;}
  get textContent(){return this.ownText+this.children.map(n=>n.textContent).join('');}
  set textContent(s){this.ownText=s;this.children=[];}
  get innerText(){return this.textContent;}
  get parentNode(){return this.parentElement;}
  get className(){return this.attrs.class??'';}
  get classList(){return {contains:s=>this.className.split(/\s+/).includes(s)};}
  getAttribute(k){return this.attrs[k]??null;}
  hasAttribute(k){return Object.hasOwn(this.attrs,k);}
  contains(n){for(let p=n;p;p=p.parentElement)if(p===this)return true;return false;}
  matches(s){return s.split(',').some(x=>match(this,x.trim(),this));}
  closest(s){for(let p=this;p;p=p.parentElement)if(p.matches(s))return p;return null;}
  querySelectorAll(s){const out=[];const visit=n=>{for(const c of n.children){if(s.split(',').some(x=>match(c,x.trim(),this)))out.push(c);visit(c);}};visit(this);return out;}
  querySelector(s){return this.querySelectorAll(s)[0]??null;}
  get options(){return this.querySelectorAll('option');}
  get selectedOptions(){return this.options.filter((o,i)=>o.selected===true||i===this.selectedIndex);}
  click(){assert.equal(this.disabled,false);assert.equal(this.hidden,false);this.clicks++;this.onClick?.();}
  dispatchEvent(e){this.onEvent?.(e);return true;}
  checkValidity(){return true;}
}
// A small generic CSS subset for this independent tree fixture. Unsupported selectors fail visibly rather than
// returning production-shaped canned answers. It handles tag/class/attributes, ancestry, child and :scope selectors.
function simple(e,s,scope){
  if(s==='*')return true;if(s===':scope')return e===scope;
  let ok=true;
  s=s.replace(/\[([\w-]+)(?:([~|^$*]?=)["']?([^\]"']*)["']?)?\]/g,(_,k,op,v)=>{const a=e.getAttribute(k);if(!op)ok&&=a!==null;else if(op==='=')ok&&=a===v;else if(op==='^=')ok&&=a?.startsWith(v)===true;else if(op==='$=')ok&&=a?.endsWith(v)===true;else if(op==='*=')ok&&=a?.includes(v)===true;else throw Error('UnsupportedFakeCssOperator');return '';});
  s=s.replace(/\.([\w-]+)/g,(_,c)=>{ok&&=e.classList.contains(c);return '';});
  s=s.replace(/#([\w-]+)/g,(_,id)=>{ok&&=e.getAttribute('id')===id;return '';});
  assert.match(s,/^(?:[\w-]+|\*)?$/,'unsupported fake CSS selector');return ok&&(!s||s==='*'||e.tagName===s.toUpperCase());
}
function match(e,s,scope){
  // The fixture's attribute values have no whitespace; whitespace separates ancestor selectors.
  const parts=s.replace(/\s*>\s*/g,' > ').trim().split(/\s+/);let i=parts.length-1,p=e;
  if(!simple(p,parts[i--],scope))return false;
  while(i>=0){if(parts[i]==='>'){p=p.parentElement;i--;if(!p||!simple(p,parts[i--],scope))return false;}else{const part=parts[i--];p=p.parentElement;while(p&&!simple(p,part,scope))p=p.parentElement;if(!p)return false;}}
  return true;
}
const el=(tag,text='',attrs={})=>new El(tag,text,attrs);
function fixture({recommended=true,duplicateCheckout=true,secondLine=null,quantity='1',auth=false}={}){
  const main=el('DIV','',{role:'main'}),content=el('DIV','',{class:'rs-bag-content as-l-container rs-zoom-content'});main.append(content);
  const head=el('H1','你的购物袋总计 RMB 9,999，分期付款 RMB 417/月。每月');
  const header=el('DIV','',{class:'row rs-bag-checkoutbutton-header'}),top=el('BUTTON','结账',{'data-autom':'checkout',id:'shoppingCart.actions.navCheckout',type:'button'});header.append(top);
  const items=el('OL','',{role:'list','data-autom':'bag-items',class:'rs-bag-items rs-iteminfos'});
  const item=el('LI','',{role:'listitem','data-autom':'bag-item-1',class:'rs-bag-item rs-iteminfo-wrap'});
  const details=el('DIV','',{class:'rs-iteminfo-details'}),heading=el('H2','',{class:'rs-iteminfo-title'}),link=el('A','iPhone 18 Pro 256GB 黑色',{href:'/shop/product/mjt74ch/a'});heading.append(link);
  const qlabel=el('LABEL','数量'),qty=el('SELECT','',{'data-autom':'item-quantity-dropdown',class:'rs-quantity-dropdown form-dropdown-select'});qty.labels=[qlabel];qty.append(el('OPTION',quantity));
  const hiddenQty=el('SELECT','',{class:'rs-quantity-hidden-select'});hiddenQty.hidden=true;hiddenQty.append(el('OPTION','1'));
  details.append(heading,qlabel,qty,hiddenQty,el('SPAN','RMB 9,999'),el('BUTTON','移除 iPhone 18 Pro 256GB 黑色'));
  const itemContent=el('DIV','',{class:'rs-iteminfo-content column large-9 small-12'});itemContent.append(details);item.append(itemContent);items.append(item);
  const care=el('DIV','',{class:'rs-inline-recommendation rs-iteminfo-child'}),careTitle=el('H3','添加 适用于 iPhone 18 Pro 的 AppleCare+ 服务计划 (同时加入 iPhone 年年焕新计划) - RMB 1,799'),careAdd=el('BUTTON','添加 适用于 iPhone 18 Pro 的 AppleCare+ 服务计划 (同时加入 iPhone 年年焕新计划) - RMB 1,799');care.append(careTitle,careAdd);if(recommended)itemContent.append(care);
  if(secondLine){const extra=el('LI','',{role:'listitem','data-autom':'bag-item-2',class:'rs-bag-item rs-iteminfo-wrap'});extra.append(el('H2',secondLine),el('BUTTON','移除 '+secondLine));items.append(extra);}
  const total=el('DIV','',{class:'rs-summary-total'}),amount=el('DIV','RMB 9,999');total.append(el('DIV','总计'),amount);
  const bottomRow=el('DIV','',{class:'row rs-bag-checkoutbutton-bottom'}),bottom=el('BUTTON','结账',{'data-autom':'checkout',id:'shoppingCart.actions.checkout',type:'button'});bottomRow.append(bottom);
  content.append(head,header,items,total);if(duplicateCheckout)content.append(bottomRow);
  // Public accessories recommendations OUTSIDE purchased items: cannot establish a purchased second item.
  const recommendations=el('DIV','',{class:'rs-recommendations'});recommendations.append(el('H2','你可能还会喜欢'),el('H3','iPhone 18 Pro 专用 MagSafe 硅胶保护壳 - 黑色'),el('BUTTON','添加到购物袋 (iPhone 18 Pro 专用 MagSafe 硅胶保护壳 - 黑色)'));content.append(recommendations);
  if(auth)content.append(el('INPUT','',{type:'password'}));
  const document=el('HTML').append(el('BODY').append(main));
  const ctx=vm.createContext({document,location:{href:bagUrl},URL,TextEncoder,crypto:webcrypto,Date,setTimeout,clearTimeout,HTMLInputElement:El,Event:class{constructor(type){this.type=type;}},getComputedStyle:e=>({display:e.hidden?'none':'block',visibility:'visible'})});
  const fn=vm.runInContext('('+merchantDocument.toString()+')',ctx);
  return {main,content,header,items,item,heading,link,qty,hiddenQty,total,amount,top,bottom,care,careAdd,fn,read:async()=>structuredClone(await fn(plan)),async command(action='checkout',id='FAKE-c019-command'){return {id,taskId:'FAKE-c019-task',planDigest:'FAKE-c019-digest',authorized:true,structured:true,action,expected:JSON.stringify(await this.read())};},async send(c){return structuredClone(await fn(plan,c));}};
}
function stack(f){
  const actions=[],rows={};const api={tabs:{async get(){return {url:bagUrl};}},permissions:{async contains(){return true;}},scripting:{async executeScript({world,args}){assert.equal(world,'ISOLATED');if(args[1])actions.push(args[1].action);return [{frameId:0,documentId:'FAKE-c019-doc',result:await f.fn(...args)}];}}};
  const store={async get(k){return structuredClone(rows[k]??null);},async put(k,v){rows[k]=structuredClone(v);}};
  return {actions,rows,store,port:new ChromePort(api,19,{authorized:true})};
}
test('C019 observed bag: two checkout affordances and inline AppleCare offer still identify one exact no-extra item',async()=>{
  const f=fixture(),o=await f.read();assert.equal(o.phase,'BAG');assert.equal(o.purchase.itemVerified,true);assert.equal(o.purchase.quantity,1);assert.equal(o.purchase.totalCny,9999);assert.equal(o.extras,false);assert.equal(o.purchase.verified,false);assert.equal(o.purchase.store,null);assert.equal(o.purchase.fulfillment,null);assert.equal(f.top.clicks+f.bottom.clicks+f.careAdd.clicks,0);
});
test('C019 observed bag: an authorized synthetic checkout clicks exactly one current checkout affordance',async()=>{
  const f=fixture(),c=await f.command();assert.deepEqual(await f.send(c),{delivered:true});assert.equal(f.top.clicks+f.bottom.clicks,1);assert.equal(f.careAdd.clicks,0);
  const again=await f.send(c);assert.equal(again.delivered,false);assert.equal(again.touched,true);assert.equal(f.top.clicks+f.bottom.clicks,1);
});
test('C019 inline upsell alone is not a purchased AppleCare line',async()=>{
  const f=fixture({duplicateCheckout:false}),o=await f.read();assert.equal(o.phase,'BAG');assert.equal(o.purchase.itemVerified,true);assert.equal(o.extras,false);
});
for(const extra of ['适用于 iPhone 18 Pro 的 AppleCare+ 服务计划','USB-C 充电线'])test('C019 purchased extra remains blocked: '+extra,async()=>{
  const f=fixture({secondLine:extra}),o=await f.read();assert.notEqual(o.extras,false);const s=stack(f),r=await new PurchaseJob({...s,hydrationMs:0}).run(plan,{tabId:19,planDigest:'FAKE-c019-digest'});assert.notEqual(r.state,'CONFIRMED_UNPAID');assert.deepEqual(s.actions,[]);assert.equal(f.top.clicks+f.bottom.clicks,0);
});
test('C019 two identical purchased phone lines cannot become one item',async()=>{
  const f=fixture({secondLine:'iPhone 18 Pro 256GB 黑色'}),s=stack(f);await new PurchaseJob({...s,hydrationMs:0}).run(plan,{tabId:19,planDigest:'FAKE-c019-digest'});assert.deepEqual(s.actions,[]);
});
for(const q of ['0','2'])test('C019 observed quantity '+q+' stops before synthetic checkout',async()=>{
  const f=fixture({quantity:q}),o=await f.read();assert.equal(o.purchase.itemVerified,false);const s=stack(f);await new PurchaseJob({...s,hydrationMs:0}).run(plan,{tabId:19,planDigest:'FAKE-c019-digest'});assert.deepEqual(s.actions,[]);
});
test('C019 missing cart quantity and conflicting total do not borrow facts from a header or hidden clone',async()=>{
  for(const change of ['quantity','total']){const f=fixture();if(change==='quantity')f.qty.hidden=true;else f.content.append(el('DIV','总计：RMB 10,999'));const o=await f.read();assert.equal(o.purchase.itemVerified,false);const s=stack(f);await new PurchaseJob({...s,hydrationMs:0}).run(plan,{tabId:19,planDigest:'FAKE-c019-digest'});assert.deepEqual(s.actions,[]);}
});
test('C019 stale price and changed item remain positively untouched before checkout',async()=>{
  for(const change of ['price','item']){const f=fixture(),c=await f.command();if(change==='price')f.amount.textContent='RMB 10,999';else f.link.textContent='iPhone 18 Pro 512GB 黑色';const r=await f.send(c);assert.equal(r.delivered,false);assert.equal(r.touched,false);assert.equal(f.top.clicks+f.bottom.clicks,0);}
});
test('C019 unproved duplicate controls, disabled controls and authentication are not checkout authority',async()=>{
  for(const change of ['anchors','disabled','auth','third']){const f=fixture({auth:change==='auth'});if(change==='anchors'){f.top.attrs={};f.bottom.attrs={};f.header.attrs={};f.bottom.parentElement.attrs={};}if(change==='disabled'){f.top.disabled=true;f.bottom.disabled=true;}if(change==='third')f.content.append(el('BUTTON','结账',{'data-autom':'checkout'}));const r=await f.send(await f.command());assert.equal(r.delivered,false,change);assert.equal(r.touched,false,change);assert.equal(f.top.clicks+f.bottom.clicks,0,change);}
});
test('C019 Observe mode bypasses purchase history and sends no action even on the observed bag',async()=>{
  const f=fixture(),s=stack(f);s.store.get=async()=>{throw Error('must not read purchase storage');};s.store.put=async()=>{throw Error('must not write purchase storage');};const r=await new PurchaseJob(s).run(plan,{tabId:19,planDigest:'observe-only',mode:'observe'});assert.equal(r.state,'OBSERVED');assert.equal(r.phase,'BAG');assert.deepEqual(s.actions,[]);assert.equal(s.rows[TASK_KEY],undefined);
});

// Codex C019 R1 review: these new adversarial leading-prose/layout changes are SYNTHETIC, not current Apple evidence.
// All original12 assertions above are retained verbatim. A failed observed scope must not become a legacy positive proof.
function leadingProse(f){f.item.children[0].ownText='商品：';f.item.children[0].children[0].ownText='商品详情：';}
test('C019 R1 positive: a single visible cart keeps exact title proof with harmless leading prose',async()=>{
  const f=fixture({recommended:false,duplicateCheckout:false});leadingProse(f);const o=await f.read();assert.equal(o.phase,'BAG');assert.equal(o.purchase.itemVerified,true);assert.equal(o.extras,false);assert.deepEqual(await f.send(await f.command()),{delivered:true});assert.equal(f.top.clicks+f.bottom.clicks,1);
});
test('C019 R1 duplicate purchased-list anchor cannot fall back to legacy checkout proof',async()=>{
  const f=fixture({recommended:false,duplicateCheckout:false});leadingProse(f);f.content.append(el('OL','',{'data-autom':'bag-items'}));
  const o=await f.read();assert.notEqual(o.phase,'BAG');const r=await f.send(await f.command());assert.equal(r.delivered,false);assert.equal(r.touched,false);assert.equal(f.top.clicks+f.bottom.clicks,0);
  const s=stack(f);await new PurchaseJob({...s,hydrationMs:0}).run(plan,{tabId:19,planDigest:'FAKE-c019-digest'});assert.deepEqual(s.actions,[]);
});
test('C019 R1 hidden purchased-list anchor cannot borrow an outside product and quantity to authorize checkout',async()=>{
  const f=fixture({recommended:false,duplicateCheckout:false});f.items.hidden=true;
  f.content.append(el('P','iPhone 18 Pro 256GB 黑色'),el('P','数量：1'));
  const o=await f.read();assert.notEqual(o.phase,'BAG');const r=await f.send(await f.command());assert.equal(r.delivered,false);assert.equal(r.touched,false);assert.equal(f.top.clicks+f.bottom.clicks,0);
  const s=stack(f);await new PurchaseJob({...s,hydrationMs:0}).run(plan,{tabId:19,planDigest:'FAKE-c019-digest'});assert.deepEqual(s.actions,[]);
});

// Codex C019 R2: independently reproduce Claude's read-only cross-review F1. These 查看购物袋 controls and
// malformed layouts are SYNTHETIC. Preserve all15 earlier reviewer cases; unknown bag scope sends no command.
function unknownCartShape(kind){
  const f=fixture({recommended:false});leadingProse(f);
  if(kind==='duplicate')f.content.append(el('OL','',{'data-autom':'bag-items'}));
  if(kind==='hidden')f.items.hidden=true;
  if(kind==='aria-hidden')f.items.attrs['aria-hidden']='true';
  if(kind==='third'){const c=el('BUTTON','结账',{'data-autom':'checkout'});c.hidden=true;f.content.append(c);}
  if(kind==='disabled')f.bottom.disabled=true;
  if(kind==='different-checkout')f.content.append(el('BUTTON','安全结账'));
  const view=el('BUTTON','查看购物袋');f.main.append(view);return {f,view};
}
test('C019 R2 unknown purchased-list scope does not become an accessories page or click View Bag',async()=>{
  for(const kind of ['duplicate','hidden','aria-hidden']){const {f,view}=unknownCartShape(kind),o=await f.read();assert.equal(o.phase,'UNKNOWN',kind);assert.equal(o.verifiedStep,false);const r=await f.send(await f.command('viewBag'));assert.equal(r.delivered,false);assert.equal(r.touched,false);assert.equal(view.clicks+f.top.clicks+f.bottom.clicks,0);}
});
test('C019 R2 controller sends zero commands on invalid cart scope even with a View Bag control',async()=>{
  for(const kind of ['duplicate','hidden','aria-hidden']){const {f,view}=unknownCartShape(kind),s=stack(f);const r=await new PurchaseJob({...s,hydrationMs:0}).run(plan,{tabId:19,planDigest:'FAKE-c019-digest'});assert.deepEqual(s.actions,[],kind);assert.equal(r.state,'NEEDS_USER');assert.equal(r.reason,'unknown');assert.equal(s.rows[TASK_KEY].pending,null);assert.equal(s.rows[TASK_KEY].resourceWritten,false);assert.equal(view.clicks+f.top.clicks+f.bottom.clicks,0);}
});
test('C019 R2 recognized list with ambiguous checkout does not fall through to accessories',async()=>{
  for(const kind of ['third','disabled','different-checkout']){const {f,view}=unknownCartShape(kind),o=await f.read();assert.equal(o.phase,'UNKNOWN',kind);assert.equal(o.verifiedStep,false);const r=await f.send(await f.command('viewBag'));assert.equal(r.delivered,false);assert.equal(r.touched,false);assert.equal(view.clicks+f.top.clicks+f.bottom.clicks,0);}
});
test('C019 R2 controller preserves untouched state on an ambiguous checkout plus View Bag',async()=>{
  for(const kind of ['third','disabled','different-checkout']){const {f,view}=unknownCartShape(kind),s=stack(f);const r=await new PurchaseJob({...s,hydrationMs:0}).run(plan,{tabId:19,planDigest:'FAKE-c019-digest'});assert.deepEqual(s.actions,[],kind);assert.equal(r.state,'NEEDS_USER');assert.equal(r.reason,'unknown');assert.equal(s.rows[TASK_KEY].pending,null);assert.equal(s.rows[TASK_KEY].resourceWritten,false);assert.equal(view.clicks+f.top.clicks+f.bottom.clicks,0);}
});
test('C019 R2 positive: legacy no-anchor accessories still allows its one View Bag navigation',async()=>{
  const {f,view}=unknownCartShape('disabled');f.items.attrs['data-autom']='FAKE-legacy-items';f.top.disabled=true;
  const o=await f.read();assert.equal(o.phase,'ACCESSORIES');assert.deepEqual(await f.send(await f.command('viewBag')),{delivered:true});assert.equal(view.clicks,1);assert.equal(f.top.clicks+f.bottom.clicks,0);
});
