// C-019-R1 cart-scope tests (Claude). FAKE offline DOM only. The purchased-list anchor OL[data-autom="bag-items"], its LI/H2
// line, the 数量 select and the header/bottom 结账 controls follow the October 3 supported public observation; every duplicated
// or hidden anchor, outside prose, authentication field, legacy no-anchor page and action result is synthetic. Nothing here
// establishes a live Apple bag, checkout, refusal or order contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {PurchaseJob,TASK_KEY} from '../web/checkout-connector/job.js';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
import {ChromePort} from '../web/checkout-connector/chrome-port.js';

const pro={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{tradeIn:'none',appleCare:'none'}};
const BAG='https://www.apple.com.cn/shop/bag',TITLE='iPhone 18 Pro 256GB 黑色';
let time=7000000,serial=0;

function one(e,s){const m=/^([a-zA-Z0-9]*)(.*)$/.exec(s);if(m[1]&&e.tagName!==m[1].toUpperCase())return false;
  for(const [,cls,an,op,v] of m[2].matchAll(/\.([\w-]+)|\[([\w-]+)(?:([*^$]?=)"([^"]*)")?\]/g)){
    if(cls){if(!(e.attrs.class??'').split(/\s+/).includes(cls))return false;continue;}
    const a=e.getAttribute(an);if(a===null||(op==='='&&a!==v)||(op==='*='&&!a.includes(v))||(op==='^='&&!a.startsWith(v))||(op==='$='&&!a.endsWith(v)))return false;
  }return true;}
class El {
  constructor(tag,text='',attrs={},kids=[]){Object.assign(this,{tagName:tag,own:text,attrs:{...attrs},children:[],parentElement:null,hidden:false,disabled:false,checked:false,labels:[],clicks:0,selectedIndex:0,root:false});this.add(...kids);}
  add(...kids){for(const c of kids){c.parentElement=this;this.children.push(c);}return this;}
  get isConnected(){let p=this;while(p.parentElement)p=p.parentElement;return p.root===true;}
  get textContent(){return this.own+this.children.map(c=>c.textContent).join('');}
  set textContent(v){this.own=String(v);this.children=[];}
  getAttribute(k){return Object.hasOwn(this.attrs,k)?this.attrs[k]:null;} hasAttribute(k){return Object.hasOwn(this.attrs,k);}
  get options(){return this.querySelectorAll('option');} get selectedOptions(){return this.options.filter((o,i)=>i===this.selectedIndex);}
  matches(sel){return sel.split(',').some(s=>one(this,s.trim().split(/\s+|>/).filter(Boolean).at(-1)));}
  closest(sel){for(let p=this;p;p=p.parentElement)if(p.matches(sel))return p;return null;}
  querySelectorAll(sel){const out=[],walk=e=>{for(const c of e.children){if(c.matches(sel))out.push(c);walk(c);}};walk(this);return out;}
  querySelector(sel){return this.querySelectorAll(sel)[0]??null;}
  click(){if(this.disabled)return;this.clicks++;this.onClick?.();}
  dispatchEvent(){return true;} checkValidity(){return true;}
}
const el=(tag,text,attrs,kids)=>new El(tag,text,attrs,kids);
// Observed-shape cart: one visible purchased list with one line; header/bottom checkout pair unless single.
function cart({single=false,outside=[]}={}){
  const qlabel=el('LABEL','数量'),qty=el('SELECT','',{'data-autom':'item-quantity-dropdown'},[el('OPTION','1')]);qty.labels=[qlabel];
  const list=el('OL','',{role:'list','data-autom':'bag-items',class:'rs-bag-items rs-iteminfos'},[el('LI','',{role:'listitem','data-autom':'bag-item-1'},[el('DIV','商品：',{},[el('H2','',{class:'rs-iteminfo-title'},[el('A',TITLE)]),qlabel,qty,el('SPAN','RMB 9,999'),el('BUTTON','移除 '+TITLE)])])]);
  const top=el('BUTTON','结账',{'data-autom':'checkout'}),bottom=el('BUTTON','结账',{'data-autom':'checkout'});
  const main=el('DIV','',{role:'main'},[el('H1','你的购物袋总计 RMB 9,999。'),...(single?[]:[el('DIV','',{class:'row rs-bag-checkoutbutton-header'},[top])]),list,el('DIV','',{},[el('DIV','总计'),el('DIV','RMB 9,999')]),el('DIV','',{class:'row rs-bag-checkoutbutton-bottom'},[bottom]),...outside]);
  return {main,list,top,bottom};
}
// Legacy no-anchor bag shape (synthetic, as in the older decoder tests): separate item, quantity and total lines.
const legacy=()=>{const b=el('BUTTON','结账');return {b,main:el('DIV','',{role:'main'},[el('H1','购物袋'),el('DIV',TITLE),el('DIV','数量：1'),el('DIV','总计：RMB 9,999'),el('DIV','店内取货'),el('DIV','取货地点：Apple 大连恒隆广场'),b])};};
function world(main,url=BAG){
  const html=Object.assign(el('HTML'),{root:true});html.add(el('BODY','',{},[main]));
  const fn=vm.runInContext('('+merchantDocument.toString()+')',vm.createContext({document:{querySelector:s=>html.querySelector(s),querySelectorAll:s=>html.querySelectorAll(s)},location:{href:url},URL,TextEncoder,crypto:webcrypto,Date,setTimeout,clearTimeout,HTMLInputElement:El,Event:class {constructor(t){this.type=t;}},getComputedStyle:e=>({display:e.hidden?'none':'block',visibility:'visible'})}));
  return {html,url,fn,clicks:()=>html.querySelectorAll('button,a').reduce((n,b)=>n+b.clicks,0)};
}
const decode=async w=>structuredClone(await w.fn(pro));
const checkout=async(w,o)=>structuredClone(await w.fn(pro,{id:'c19r1-cmd-'+(++serial),taskId:'t',authorized:true,structured:true,expected:JSON.stringify(o),action:'checkout'}));
async function controller(w){
  const actions=[],rows={},store={async get(k){return structuredClone(rows[k]??null);},async put(k,v){rows[k]=structuredClone(v);}};
  const api={tabs:{async get(){return {url:w.url};}},permissions:{async contains(){return true;}},scripting:{async executeScript({world:iso,func,args}){
    assert.equal(iso,'ISOLATED');assert.equal(func,merchantDocument);if(args[1])actions.push(args[1].action);return [{frameId:0,documentId:'FAKE-c019r1-doc',result:structuredClone(await w.fn(...args))}];}}};
  const port=new ChromePort(api,7,{authorized:true});port.wait=async n=>{time+=n;};
  const r=await new PurchaseJob({store,port,now:()=>time,id:()=>'c19r1-'+(++serial),maxSteps:20,hydrationMs:0}).run(pro,{tabId:7,planDigest:'digest'});
  return {r,actions,row:rows[TASK_KEY]};
}
const invalidScopes=[
  ['second empty visible anchor',p=>{p.main.add(el('OL','',{'data-autom':'bag-items'}));}],
  ['second anchor with an identical line',p=>{p.main.add(el('OL','',{'data-autom':'bag-items'},[el('LI','',{},[el('H2',TITLE)])]));}],
  ['second hidden anchor',p=>{p.main.add(Object.assign(el('OL','',{'data-autom':'bag-items'}),{hidden:true}));}],
  ['hidden anchor, exact outside item/quantity/total/store prose',p=>{p.list.hidden=true;p.main.add(el('P',TITLE),el('P','数量：1'),el('P','总计：RMB 9,999'),el('P','店内取货'),el('P','取货地点：Apple 大连恒隆广场'));}],
  ['aria-hidden anchor, exact outside item/quantity prose',p=>{p.list.attrs['aria-hidden']='true';p.main.add(el('P',TITLE),el('P','数量：1'));}],
];

test('C019-R1 duplicated or hidden purchased-list anchors are unknown scope: no borrowed item/store fact, untouched page, zero controller actions',async()=>{
  for(const single of [true,false])for(const [label,mutate] of invalidScopes){
    const name=`${label} (${single?'single control':'header/bottom pair'})`,p=cart({single});mutate(p);const w=world(p.main),o=await decode(w);
    assert.equal(o.phase,'UNKNOWN',name);assert.equal(o.verifiedStep,false,name);assert.equal(o.extras,null,name);
    assert.equal(o.purchase.itemVerified,false,name);assert.equal(o.purchase.verified,false,name);assert.equal(o.purchase.quantity,null,name);
    assert.equal(o.purchase.model,null,name);assert.equal(o.purchase.store,null,name);assert.equal(o.purchase.fulfillment,null,name);
    assert.deepEqual(await checkout(w,o),{delivered:false,touched:false,reason:'ActionNotRecognizedForCurrentStage'},name);assert.equal(w.clicks(),0,name);
    const c=await controller(w);
    assert.equal(c.r.state,'NEEDS_USER',name);assert.equal(c.r.reason,'unknown',name);assert.deepEqual(c.actions,[],name);assert.equal(w.clicks(),0,name);
    assert.equal(c.row.pending,null,name);assert.equal(c.row.resourceWritten,false,name);assert.equal(c.row.bagAddStarted,false,name);
  }
});

test('C019-R1 authentication stays a truthful human gate even with an invalid cart scope',async()=>{
  const p=cart();p.main.add(el('OL','',{'data-autom':'bag-items'}),el('INPUT','',{type:'password'}));const w=world(p.main),o=await decode(w);
  assert.equal(o.phase,'AUTH');assert.equal(o.purchase.itemVerified,false);
  const r=await checkout(w,o);assert.equal(r.delivered,false);assert.equal(r.touched,false);
  const c=await controller(w);assert.equal(c.r.state,'NEEDS_USER');assert.equal(c.r.reason,'auth');assert.deepEqual(c.actions,[]);assert.equal(w.clicks(),0);
});

test('C019-R1 positive controls: the single visible observed cart and the legacy no-anchor bag still check out exactly once',async()=>{
  for(const single of [true,false]){
    const p=cart({single}),w=world(p.main),o=await decode(w);
    assert.equal(o.phase,'BAG');assert.equal(o.purchase.itemVerified,true);assert.equal(o.extras,false);assert.equal(o.purchase.store,null);assert.equal(o.purchase.fulfillment,null);
    assert.deepEqual(await checkout(w,o),{delivered:true});assert.equal(p.bottom.clicks,1);assert.equal(p.top.clicks,0);
  }
  // Legacy pages without any observed anchor keep the generic decoder, including its earlier store/pickup prose rules.
  const l=legacy(),w=world(l.main),o=await decode(w);
  assert.equal(o.phase,'BAG');assert.equal(o.purchase.itemVerified,true);assert.equal(o.purchase.verified,true);assert.equal(o.purchase.store,'Apple 大连恒隆广场');assert.equal(o.extras,false);
  assert.deepEqual(await checkout(w,o),{delivered:true});assert.equal(l.b.clicks,1);
});
