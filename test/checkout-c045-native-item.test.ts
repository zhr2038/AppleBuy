// C045 Codex authorized provider-quota takeover tests. All DOM/refs/quantity/unpaid/slot data are FAKE.
// Observed historical native item grouping supplies identity only; actual quantity was not observed.
// These are author self-verification, not independent cross-author acceptance. Original Claude review pending.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{tradeIn:'none',appleCare:'none'}};
const REF='FAKE-C045-0001',TERMS='https://www.apple.com.cn/shop/open/salespolicies';
const DEEP='https://secure8.www.apple.com.cn/shop/order/detail/FAKE-ORDER/FAKE-LOOKUP';
// Minimal FAKE element tree: comma lists of tag/.class/[attr]/[attr="v"] selectors, document-order descendants, parents, textContent.
class El{
  constructor(tag,attrs,children){Object.assign(this,{tagName:tag.toUpperCase(),attrs,children:[],parentElement:null,isConnected:true,hidden:'hidden' in attrs,labels:[]});
    if('href' in attrs)this.href=attrs.href;for(const c of children){if(typeof c!=='string')c.parentElement=this;this.children.push(c);}}
  get textContent(){return this.children.map(c=>typeof c==='string'?c:c.textContent).join('');}
  getAttribute(k){return Object.hasOwn(this.attrs,k)?String(this.attrs[k]):null;}
  hasAttribute(k){return Object.hasOwn(this.attrs,k);}
  matches(selectors){return selectors.split(',').some(s=>{const m=/^([a-z0-9]*)((?:\.[\w-]+)*)((?:\[[\w-]+(?:="[^"]*")?\])*)$/.exec(s.trim());if(!m)throw new Error('FAKE selector unsupported: '+s);
    const classes=String(this.attrs.class??'').split(/\s+/);
    return (!m[1]||this.tagName===m[1].toUpperCase())&&m[2].split('.').slice(1).every(c=>classes.includes(c))&&[...m[3].matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].every(([,k,v])=>v===undefined?this.hasAttribute(k):this.getAttribute(k)===v);});}
  querySelectorAll(s){const all=e=>e.children.flatMap(c=>typeof c==='string'?[]:[c,...all(c)]);return all(this).filter(e=>e.matches(s));}
  querySelector(s){return this.querySelectorAll(s)[0]??null;}
  closest(s){for(let e=this;e;e=e.parentElement)if(e.matches(s))return e;return null;}
}
const h=(tag,attrs={},...children)=>new El(tag,attrs,children);
// The given program source runs as a page script would: one document at one address, read-only (no command).
async function decode(href,main,source=merchantDocument){
  const root=h('html',{},h('body',{},main,h('a',{href:TERMS},'销售政策与条款')));
  const context=vm.createContext({document:{querySelector:s=>root.querySelector(s),querySelectorAll:s=>root.querySelectorAll(s)},location:{href},URL,TextEncoder,crypto:webcrypto,Date,setTimeout,clearTimeout,
    HTMLInputElement:class{},Event:class{},getComputedStyle:()=>({display:'block',visibility:'visible'})});
  return structuredClone(await vm.runInContext('('+source.toString()+')',context)(plan));
}
// FAKE order facts in the C040 receipt/detail prose form; `false` omits one.
function facts({ref=REF,pending='待付款',title='iPhone 18 Pro 256GB 黑色',quantity='数量：1',total='总计：RMB 9,999',store='取货地点：Apple 大连恒隆广场',date='取货日期：October 4',time='取货时间：21:15 – 21:30'}={}){
  return [ref&&'订单号：'+ref,pending,title,quantity,total,store,'店内取货',date,time].filter(Boolean).map(t=>h('p',{},t));
}

const full='iPhone 18 Pro 256GB 黑色';
function card(o={}){
  const title=h(o.titleTag||'h3',{class:'rs-display-item-name typography-body-reduced',...(o.hiddenTitle?{hidden:''}:{})},o.title??full);
  const state=h(o.stateTag||'span',{class:'rs-od-itemstatus',...(o.hiddenState?{hidden:''}:{})},o.state??'待付款');
  const head=h(o.headerTag||'h2',{class:'rs-od-itemtitle',...(o.hiddenHeader?{hidden:''}:{})},o.model??'iPhone 18 Pro',' ',state,...(o.secondState?[h('span',{class:'rs-od-itemstatus'},'待付款')]:[]));
  const info=h(o.infoTag||'div',{class:'column large-7 small-12 rs-od-iteminfo'},head);
  const attrs=h('div',{class:'row rs-od-itemattrs'},h('div',{class:'row'},h('div',{class:'rs-od-itemname column'},title)),h('div',{class:'rs-display-item-price'},h('span',{},'RMB 9,999')),...(o.duplicateTitle?[h('h3',{class:'rs-display-item-name'},full)]:[]));
  const summary=h(o.summaryTag||'div',{class:'row as-l-container rs-od-itemsummary',...(o.hiddenSummary?{hidden:''}:{})},h('div',{class:'rs-od-itemsummary-start column large-4'},attrs));
  return h(o.itemTag||'li',{class:'rs-od-itemdetail','data-autom':o.marker??'order-item-0',...(o.hiddenItem?{hidden:''}:{})},...(o.missingInfo?[]:[info]),...(o.missingSummary?[]:[summary]),...(o.looseTitle?[title]:[]));
}
const page=({items=[card()],extra=[],quantity='数量：1',...proof}={})=>h('div',{role:'main',class:'as-l-fullwidth rs-od-container'},h('h1',{class:'rs-od-title'},'你的订单详情。'),h('ul',{},...items),...facts({title:false,quantity,...proof}),...extra);
const identity=o=>{assert.equal(o.purchase.model,'iPhone 18 Pro');assert.equal(o.purchase.capacity,'256GB');assert.equal(o.purchase.color,'黑色');};
test('C045 one structurally paired native model header/full title has exact identity and FAKE explicit one-unit proof',async()=>{
  const o=await decode(DEEP,page());identity(o);assert.equal(o.purchase.quantity,1);assert.equal(o.purchase.verified,true);assert.equal(o.phase,'ORDER_DETAIL');
});
for(const quantity of [false,'数量：2','数量：0'])test('C045 a native item never converts missing/other quantity '+String(quantity)+' to one',async()=>{
  const o=await decode(DEEP,page({quantity}));identity(o);assert.equal(o.purchase.quantity,quantity===false?null:Number(quantity.slice(-1)));assert.equal(o.purchase.itemVerified,false);assert.equal(o.purchase.verified,false);
});
for(const [name,options] of [
  ['hidden item',{hiddenItem:true}],['hidden title',{hiddenTitle:true}],['hidden summary',{hiddenSummary:true}],
  ['hidden model header',{hiddenHeader:true}],['hidden status',{hiddenState:true}],['another model',{model:'iPhone 18 Pro Max'}],
  ['another full capacity',{title:'iPhone 18 Pro 512GB 黑色'}],['another full color',{title:'iPhone 18 Pro 256GB 银色'}],
  ['wrong item tag',{itemTag:'div'}],['missing item marker',{marker:''}],['wrong marker',{marker:'recommendation-0'}],
  ['wrong summary tag',{summaryTag:'section'}],['wrong title tag',{titleTag:'div'}],['wrong header tag',{headerTag:'div'}],
  ['wrong info tag',{infoTag:'section'}],['wrong status tag',{stateTag:'div'}],['missing info',{missingInfo:true}],
  ['missing summary but loose exact title',{missingSummary:true,looseTitle:true}],['duplicate full title',{duplicateTitle:true}],
  ['duplicate status',{secondState:true}],['status carries another phone',{state:'iPhone Duo 待付款'}],
])test('C045 an incomplete/conflicting native '+name+' cannot borrow generic proof',async()=>{
  const o=await decode(DEEP,page({items:[card(options)]}));assert.equal(o.purchase.model,null);assert.equal(o.purchase.verified,false);
});
for(const [name,items] of [
  ['two identical item rows',[card(),card({marker:'order-item-1'})]],
  ['a hidden duplicate row',[card(),card({marker:'order-item-1',hiddenItem:true})]],
  ['another purchased phone',[card(),card({marker:'order-item-1',title:'iPhone Duo 256GB 星光白色'})]],
  ['another purchased device',[card(),card({marker:'order-item-1',title:'iPad FAKE'})]],
])test('C045 '+name+' is not one native item',async()=>{
  const o=await decode(DEEP,page({items}));assert.equal(o.purchase.model,null);assert.equal(o.purchase.verified,false);
});
for(const [name,extra] of [
  ['visible bare phone text',[h('div',{},'iPhone')]],['hidden bare phone text',[h('div',{hidden:''},'iPhone')]],
  ['another full title',[h('p',{},full)]],['extra native header',[h('h2',{class:'rs-od-itemtitle'},'iPhone 18 Pro')]],
  ['extra native summary',[h('div',{class:'rs-od-itemsummary'})]],['misplaced native full title',[h('h3',{class:'rs-display-item-name'},full)]],
])test('C045 '+name+' outside the paired anchors cannot be ignored',async()=>{
  const o=await decode(DEEP,page({extra}));assert.equal(o.purchase.verified,false);assert.equal(o.purchase.model,null);
});
for(const state of ['取货已取消','已取货 9月 17'])test('C045 native identity does not revive '+state,async()=>{
  const o=await decode(DEEP,page({items:[card({state})]}));identity(o);assert.equal(o.phase,'UNKNOWN');
});
test('C045 a single native row with no quantity still does not infer one from card count or matching price',async()=>{
  const o=await decode(DEEP,page({quantity:false,total:'总计：RMB 9,999'}));identity(o);assert.equal(o.purchase.quantity,null);assert.equal(o.quantitySource,null);assert.equal(o.purchase.verified,false);
});
test('C045 the observed native order scope does not whitelist model headers on ordinary checkout',async()=>{
  const o=await decode('https://secure8.www.apple.com.cn/shop/checkout',page());assert.equal(o.purchase.model,null);assert.equal(o.purchase.verified,false);
});
