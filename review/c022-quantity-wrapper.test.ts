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

// C022 native evidence: selected1, options1/2 plus hidden clone1 gives ancestor text Quantity121.
// The wrapper shape is observed; the tree/API/extra adversarial combinations below are all FAKE.
function nativeWrapper({value='1',hiddenValue='1',options=['1','2'],literal='数量'}={}){
  const f=fixture({recommended:false}),details=f.qty.parentElement,label=f.qty.labels[0];
  details.children=details.children.filter(e=>![label,f.qty,f.hiddenQty].includes(e));
  f.qty.children=[];f.qty.append(...options.map(x=>el('OPTION',x)));f.qty.selectedIndex=options.indexOf(value);
  f.hiddenQty.children=[];f.hiddenQty.append(el('OPTION',hiddenValue));
  const wrapper=el('DIV','',{class:'rs-quantity-wrapper form-dropdown'}).append(label,f.qty,f.hiddenQty);
  label.textContent=literal;
  const outer=el('DIV','',{class:'rs-iteminfo-quantity'}).append(el('DIV','',{class:'rs-quantity'}).append(el('DIV','',{class:'rs-quantity-selector'}).append(wrapper)));
  details.append(outer);return {...f,details,wrapper,outer,label};
}
test('C022 native-style aggregate quantity121 is not a literal count; actual selected quantity1 is proved',async()=>{
  const f=nativeWrapper();assert.equal(f.outer.textContent,'数量121');const o=await f.read();assert.equal(o.purchase.quantity,1);assert.equal(o.purchase.itemVerified,true);assert.equal(o.purchase.totalCny,9999);
});
test('C022 actual-style single bag retains its one normal checkout rather than a false quantity mismatch',async()=>{
  const f=nativeWrapper(),r=await f.send(await f.command());assert.equal(r.delivered,true);assert.equal(f.top.clicks+f.bottom.clicks,1);
});
test('C022 persisted View Bag can reconcile on the proved BAG with zero clicks',async()=>{
  const f=nativeWrapper(),s=stack(f),clock=100000;
  s.rows[TASK_KEY]={schema:'applebuy-purchase-job/v1',taskId:'FAKE-prior',plan,planDigest:'FAKE-digest',tabId:19,lastRead:3,expiresAt:90000,dateCursor:0,refusals:0,rejected:[],floors:{},initialDates:null,state:'NEEDS_VERIFICATION',lastPhase:'ACCESSORIES',pending:{id:'FAKE-old-view',action:'viewBag',documentId:'FAKE-old-document',beforePhase:'ACCESSORIES',deadline:99000},finalIntent:null,bagAddStarted:true,resourceWritten:true,history:[{event:'FAKE-keep'}]};
  const port=new ChromePort(s.port.api,19,{authorized:false,mode:'observe',initialSequence:3});
  const r=await new PurchaseJob({store:s.store,port,now:()=>clock}).run(plan,{tabId:19,planDigest:'FAKE-digest',mode:'reconcile'});
  assert.equal(r.pending,null);assert.equal(r.expiresAt,90000);assert.equal(r.resourceWritten,true);assert.equal(r.bagAddStarted,true);assert.deepEqual(r.history,[{event:'FAKE-keep'}]);assert.equal(s.actions.length+f.top.clicks+f.bottom.clicks,0);
});
for(const x of [
  {options:['2','1'],value:'1',hiddenValue:'2'},
  {options:['0','1','2'],value:'1',hiddenValue:'99'},
  {options:Array.from({length:100},(_,i)=>String(i+1)),value:'1'},
])test('C022 native selection stays1 across option order/hidden clone/large option lists: '+JSON.stringify(x.options.slice(0,3)),async()=>{
  const f=nativeWrapper(x),o=await f.read();assert.equal(o.purchase.quantity,1);assert.equal(o.purchase.itemVerified,true);
});
for(const value of ['0','2'])test('C022 selected quantity'+value+' never permits checkout despite wrapper cleanup',async()=>{
  const f=nativeWrapper({value,options:['0','1','2']}),o=await f.read();assert.equal(o.purchase.itemVerified,false);assert.equal((await f.send(await f.command())).delivered,false);assert.equal(f.top.clicks+f.bottom.clicks,0);
});
test('C022 missing visible quantity never borrows the hidden clone or aggregated options',async()=>{
  const f=nativeWrapper();f.qty.hidden=true;const o=await f.read();assert.equal(o.purchase.itemVerified,false);assert.equal((await f.send(await f.command())).delivered,false);
});
test('C022 a separate explicit contradictory quantity2 remains blocked',async()=>{
  const f=nativeWrapper();f.main.append(el('P','数量：2'));const o=await f.read();assert.equal(o.purchase.itemVerified,false);assert.equal((await f.send(await f.command())).delivered,false);
});
test('C022 explicit literal quantity2 in a selector-bearing wrapper remains blocked',async()=>{
  const f=nativeWrapper({literal:'数量：2'}),o=await f.read();assert.equal(o.purchase.itemVerified,false);assert.equal((await f.send(await f.command())).delivered,false);
});
test('C022 explicit conflict behind a large option list remains blocked, not lost to the raw-text length limit',async()=>{
  const f=nativeWrapper({literal:'数量：2',options:Array.from({length:100},(_,i)=>String(i+1))});assert.ok(f.outer.textContent.length>180);const o=await f.read();assert.equal(o.purchase.itemVerified,false);assert.equal((await f.send(await f.command())).delivered,false);
});
test('C022 two visible quantity controls remain ambiguous',async()=>{
  const f=nativeWrapper(),label=el('LABEL','数量'),other=el('SELECT').append(el('OPTION','1'));other.labels=[label];f.details.append(label,other);const o=await f.read();assert.equal(o.purchase.itemVerified,false);assert.equal((await f.send(await f.command())).delivered,false);
});
test('C022 cleanup cannot borrow an outside counter for a hidden purchased bag anchor',async()=>{
  const f=nativeWrapper();f.items.hidden=true;f.main.append(el('P','iPhone 18 Pro 256GB 黑色'),el('P','数量：1'));const o=await f.read();assert.equal(o.phase,'UNKNOWN');assert.equal(o.purchase.itemVerified,false);assert.equal((await f.send(await f.command())).delivered,false);
});
