// Independent C026 Codex regressions for synthetic duplicate product groups.
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

// C024 quantities/variants are synthetic; the unique companionbar summary button/caption and current checkout lack
// of a quantity label were observed. Every DOM/API/mutation is FAKE, not a live Apple contract.
function checkout({quantity=null,amount='RMB 9,999',label='显示订单摘要： ',phasePath='/shop/checkout',hidden=false,duplicate=false}={}){
  const main=el('MAIN'),title=el('H1','你希望如何收到订单商品？'),product=el('DIV','iPhone 18 Pro 256GB 黑色');
  const summary=el('BUTTON',label,{'data-autom':'companionbar-button'}),price=el('SPAN',amount);summary.append(price);summary.hidden=hidden;
  const pickup=el('INPUT','',{type:'radio',name:'FAKE-fulfillment'}),plabel=el('LABEL','我要取货');pickup.labels=[plabel];
  const delivery=el('INPUT','',{type:'radio',name:'FAKE-fulfillment'}),dlabel=el('LABEL','为我送货');delivery.labels=[dlabel];delivery.checked=true;
  pickup.onClick=()=>{pickup.checked=true;delivery.checked=false;};main.append(title,product,summary,plabel,pickup,dlabel,delivery);
  if(quantity!==null)main.append(el('P','数量：'+quantity));if(duplicate)main.append(el('BUTTON',label+amount,{'data-autom':'companionbar-button'}));
  const document=el('HTML').append(el('BODY').append(main));
  const ctx=vm.createContext({document,location:{href:'https://secure6.www.apple.com.cn'+phasePath},URL,TextEncoder,crypto:webcrypto,Date,setTimeout,clearTimeout,HTMLInputElement:El,Event:class{},getComputedStyle:e=>({display:e.hidden?'none':'block',visibility:'visible'})});
  const fn=vm.runInContext('('+merchantDocument.toString()+')',ctx);
  const f={main,document,summary,price,pickup,fn,read:async()=>structuredClone(await fn(plan)),async command(){return {id:'FAKE-c026-command',taskId:'FAKE-c026-task',authorized:true,structured:true,action:'selectPickup',expected:JSON.stringify(await this.read())};},async send(c){return structuredClone(await fn(plan,c));}};return f;
}
// The one-group/two-title shape was observed: one product strip plus a screen-reader legend. Explicit quantities and
// duplicate groups below are FAKE counterexamples, not observed Apple two-unit behavior. A title is never a unit count.
function observedGroup(f,{secondGroup=false,quantity=1}={}){
  const product=f.main.children[1];f.main.children=f.main.children.filter(e=>e!==product);
  product.attrs.class='rs-fulfillment-productstrip-content';
  const group=el('DIV','FAKE shipment heading. ',{class:'rs-fulfillment-shipmentgroup'}).append(product,
    el('FIELDSET','',{class:'rs-fulfillment-deliveryoptions'}).append(el('LEGEND','',{class:'rs-fulfillment-selector-title'}).append(el('H2','',{class:'rs-fullfillment-selector-header'}).append(el('SPAN','iPhone 18 Pro 256GB 黑色',{class:'visuallyhidden'})))));
  f.main.append(group);
  if(secondGroup)f.main.append(el('DIV','FAKE shipment heading. ',{class:'rs-fulfillment-shipmentgroup'}).append(el('DIV','iPhone 18 Pro 256GB 黑色',{class:'rs-fulfillment-productstrip-content'})));
  return f;
}
// Real browser discovery: the containing DIV starts with the accessible title, followed by the native option labels.
// Its aggregate is not an additional purchased product. Every event/API/quantity here remains synthetic.
function rendererShape(quantity=null){
  const f=observedGroup(checkout({quantity})),g=f.main.querySelector('.rs-fulfillment-shipmentgroup'),fieldset=g.querySelector('fieldset');
  g.children=g.children.filter(e=>e!==fieldset);g.append(el('DIV','',{class:'rs-fulfillment-shipment'}).append(fieldset,el('LABEL','为我送货'),el('LABEL','我要取货')));return f;
}
// Independent regressions from the actual isolated rendered-browser repro. All products/events here are synthetic.
for(const variant of ['bare-header','strong-header','li-main','long-main'])test('C028 '+variant+' extra product text cannot borrow the known strip/copy proof',async()=>{
 const f=rendererShape('1'),header=f.main.querySelector('.rs-fullfillment-selector-header'),title='iPhone 18 Pro 256GB 黑色';
 if(variant==='bare-header')header.ownText=title;
 else if(variant==='strong-header')header.append(el('STRONG',title));
 else f.main.append(el(variant==='li-main'?'LI':'P',(variant==='long-main'?'FAKE filler '.repeat(40):'')+title));
 assert.equal((await f.read()).purchase.itemVerified,false);const r=await f.send(await f.command());assert.equal(r.delivered,false);assert.equal(r.touched,false);assert.equal(f.pickup.clicks,0);
});
