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
  const f={main,document,summary,price,pickup,fn,read:async()=>structuredClone(await fn(plan)),async command(){return {id:'FAKE-c024-command',taskId:'FAKE-c024-task',authorized:true,structured:true,action:'selectPickup',expected:JSON.stringify(await this.read())};},async send(c){return structuredClone(await fn(plan,c));}};return f;
}
test('C024 observed checkout header gives a current total but never supplies an absent quantity',async()=>{
  const f=checkout(),o=await f.read();assert.equal(o.phase,'FULFILLMENT');assert.equal(o.purchase.totalCny,9999);assert.equal(o.purchase.quantity,null);assert.equal(o.purchase.itemVerified,false);assert.equal((await f.send(await f.command())).delivered,false);assert.equal(f.pickup.clicks,0);
});
test('C024 current checkout total plus an explicit1 supports normal pickup, without weakening item/quantity proof',async()=>{
  const f=checkout({quantity:'1'}),o=await f.read();assert.equal(o.purchase.totalCny,9999);assert.equal(o.purchase.quantity,1);assert.equal(o.purchase.itemVerified,true);assert.equal((await f.send(await f.command())).delivered,true);assert.equal(f.pickup.clicks,1);
});
for(const quantity of ['0','2'])test('C024 explicit quantity'+quantity+' still stops before pickup despite recognized money',async()=>{
  const f=checkout({quantity}),o=await f.read();assert.equal(o.purchase.itemVerified,false);assert.equal((await f.send(await f.command())).delivered,false);assert.equal(f.pickup.clicks,0);
});
test('C024 two current header totals are ambiguous, even if equal',async()=>{
  const f=checkout({quantity:'1',duplicate:true}),o=await f.read();assert.equal(o.purchase.totalCny,null);assert.equal(o.purchase.itemVerified,false);assert.equal((await f.send(await f.command())).delivered,false);
});
test('C024 hidden summary header cannot prove the checkout total',async()=>{
  const f=checkout({quantity:'1',hidden:true}),o=await f.read();assert.equal(o.purchase.totalCny,null);assert.equal(o.purchase.itemVerified,false);
});
test('C024 explicit labelled total contradicting the summary remains unknown',async()=>{
  const f=checkout({quantity:'1'});f.main.append(el('DIV','总计：RMB 10,999'));const o=await f.read();assert.equal(o.purchase.totalCny,null);assert.equal(o.purchase.itemVerified,false);
});
test('C024 consistent explicit labelled and summary totals retain proof',async()=>{
  const f=checkout({quantity:'1'});f.main.append(el('DIV','总计：RMB 9,999'));assert.equal((await f.read()).purchase.totalCny,9999);
});
for(const args of [{label:'小计： '},{amount:'USD 9,999'},{amount:'RMB 0'},{amount:'RMB 10,000'},{phasePath:'/shop/bag'}])test('C024 unsupported/subtotal/zero/over-cap/wrong-route evidence does not permit pickup: '+JSON.stringify(args),async()=>{
  const f=checkout({...args,quantity:'1'}),o=await f.read();assert.equal((await f.send(await f.command())).delivered,false);assert.equal(f.pickup.clicks,0);if(args.label||args.amount?.startsWith('USD')||args.phasePath)assert.equal(o.purchase.totalCny,null);
});
test('C024 a price change after decoding stays untouched and prevents pickup',async()=>{
  const f=checkout({quantity:'1'}),c=await f.command();f.price.textContent='RMB 10,000';const r=await f.send(c);assert.equal(r.delivered,false);assert.equal(r.touched,false);assert.equal(f.pickup.clicks,0);
});
