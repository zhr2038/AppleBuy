// C-019-R2 navigation-scope tests (Claude). FAKE offline DOM only. The purchased-list anchor OL[data-autom="bag-items"], its LI/H2
// line, the 数量 select and the header/bottom 结账 controls follow the October 3 supported public observation. Every 查看购物袋 or
// 添加到购物袋 control on the bag path, every duplicated/hidden anchor, extra/disabled checkout control, authentication field,
// no-anchor accessories page and action result is synthetic: none of these combinations has been observed on the real merchant
// page. Nothing here establishes a live Apple bag, accessories, checkout, refusal or order contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {PurchaseJob,TASK_KEY} from '../web/checkout-connector/job.js';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
import {ChromePort} from '../web/checkout-connector/chrome-port.js';

const pro={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{tradeIn:'none',appleCare:'none'}};
const BAG='https://www.apple.com.cn/shop/bag',ENTRY='https://www.apple.com.cn/shop/buy-iphone/iphone-18-pro',TITLE='iPhone 18 Pro 256GB 黑色';
let time=8000000,serial=0;

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
function cart({single=false}={}){
  const qlabel=el('LABEL','数量'),qty=el('SELECT','',{'data-autom':'item-quantity-dropdown'},[el('OPTION','1')]);qty.labels=[qlabel];
  const list=el('OL','',{role:'list','data-autom':'bag-items',class:'rs-bag-items rs-iteminfos'},[el('LI','',{role:'listitem','data-autom':'bag-item-1'},[el('DIV','商品：',{},[el('H2','',{class:'rs-iteminfo-title'},[el('A',TITLE)]),qlabel,qty,el('SPAN','RMB 9,999'),el('BUTTON','移除 '+TITLE)])])]);
  const top=el('BUTTON','结账',{'data-autom':'checkout'}),bottom=el('BUTTON','结账',{'data-autom':'checkout'});
  const main=el('DIV','',{role:'main'},[el('H1','你的购物袋总计 RMB 9,999。'),...(single?[]:[el('DIV','',{class:'row rs-bag-checkoutbutton-header'},[top])]),list,el('DIV','',{},[el('DIV','总计'),el('DIV','RMB 9,999')]),el('DIV','',{class:'row rs-bag-checkoutbutton-bottom'},[bottom])]);
  return {main,list,top,bottom};
}
function world(main,url=BAG){
  const html=Object.assign(el('HTML'),{root:true});html.add(el('BODY','',{},[main]));
  const fn=vm.runInContext('('+merchantDocument.toString()+')',vm.createContext({document:{querySelector:s=>html.querySelector(s),querySelectorAll:s=>html.querySelectorAll(s)},location:{href:url},URL,TextEncoder,crypto:webcrypto,Date,setTimeout,clearTimeout,HTMLInputElement:El,Event:class {constructor(t){this.type=t;}},getComputedStyle:e=>({display:e.hidden?'none':'block',visibility:'visible'})}));
  return {html,url,fn,clicks:()=>html.querySelectorAll('button,a').reduce((n,b)=>n+b.clicks,0)};
}
const decode=async w=>structuredClone(await w.fn(pro));
const send=async(w,o,action)=>structuredClone(await w.fn(pro,{id:'c19r2-cmd-'+(++serial),taskId:'t',authorized:true,structured:true,expected:JSON.stringify(o),action}));
async function controller(w){
  const actions=[],rows={},store={async get(k){return structuredClone(rows[k]??null);},async put(k,v){rows[k]=structuredClone(v);}};
  const api={tabs:{async get(){return {url:w.url};}},permissions:{async contains(){return true;}},scripting:{async executeScript({world:iso,func,args}){
    assert.equal(iso,'ISOLATED');assert.equal(func,merchantDocument);if(args[1])actions.push(args[1].action);return [{frameId:0,documentId:'FAKE-c019r2-doc',result:structuredClone(await w.fn(...args))}];}}};
  const port=new ChromePort(api,7,{authorized:true});port.wait=async n=>{time+=n;};
  const r=await new PurchaseJob({store,port,now:()=>time,id:()=>'c19r2-'+(++serial),maxSteps:20,hydrationMs:0}).run(pro,{tabId:7,planDigest:'digest'});
  return {r,actions,row:rows[TASK_KEY]};
}
// Anchored carts that are not a recognized checkout bag: unknown list scope, or the one visible list with ambiguous checkout.
const anchoredUnknown=[
  ['second empty visible anchor',false,p=>{p.main.add(el('OL','',{'data-autom':'bag-items'}));}],
  ['second empty visible anchor',true,p=>{p.main.add(el('OL','',{'data-autom':'bag-items'}));}],
  ['second hidden anchor',false,p=>{p.main.add(Object.assign(el('OL','',{'data-autom':'bag-items'}),{hidden:true}));}],
  ['hidden anchor',false,p=>{p.list.hidden=true;}],
  ['hidden anchor',true,p=>{p.list.hidden=true;}],
  ['aria-hidden anchor',false,p=>{p.list.attrs['aria-hidden']='true';}],
  ['aria-hidden anchor',true,p=>{p.list.attrs['aria-hidden']='true';}],
  ['visible list, hidden third checkout clone',false,p=>{const c=el('BUTTON','结账',{'data-autom':'checkout'});c.hidden=true;p.main.add(c);}],
  ['visible list, disabled bottom pair member',false,p=>{p.bottom.disabled=true;}],
  ['visible list, disabled single checkout',true,p=>{p.bottom.disabled=true;}],
  ['visible list, 安全结账 beside the pair',false,p=>{p.main.add(el('BUTTON','安全结账'));}],
  ['visible list, second visible 结账 beside the single control',true,p=>{p.main.add(el('BUTTON','结账'));}],
];
const label=(l,single)=>`${l} (${single?'single control':'header/bottom pair'})`;

test('C019-R2 anchored unknown cart plus View Bag: UNKNOWN, direct viewBag untouched, controller zero commands',async()=>{
  for(const [l,single,mutate] of anchoredUnknown){
    const name=label(l,single),p=cart({single});mutate(p);const view=el('BUTTON','查看购物袋');p.main.add(view);
    const w=world(p.main),o=await decode(w);
    assert.equal(o.phase,'UNKNOWN',name);assert.equal(o.verifiedStep,false,name);
    assert.deepEqual(await send(w,o,'viewBag'),{delivered:false,touched:false,reason:'ActionNotRecognizedForCurrentStage'},name);assert.equal(view.clicks,0,name);assert.equal(w.clicks(),0,name);
    const c=await controller(w);
    assert.equal(c.r.state,'NEEDS_USER',name);assert.equal(c.r.reason,'unknown',name);assert.deepEqual(c.actions,[],name);assert.equal(w.clicks(),0,name);
    assert.equal(c.row.pending,null,name);assert.equal(c.row.resourceWritten,false,name);assert.equal(c.row.bagAddStarted,false,name);
  }
});

test('C019-R2 anchored unknown cart plus Add to Bag does not become a product-variant page',async()=>{
  for(const [l,single,mutate] of anchoredUnknown){
    const name=label(l,single),p=cart({single});mutate(p);const add=el('BUTTON','添加到购物袋');p.main.add(add);
    const w=world(p.main),o=await decode(w);
    assert.equal(o.phase,'UNKNOWN',name);assert.equal(o.verifiedStep,false,name);
    assert.deepEqual(await send(w,o,'addBag'),{delivered:false,touched:false,reason:'ActionNotRecognizedForCurrentStage'},name);assert.equal(w.clicks(),0,name);
    const c=await controller(w);
    assert.equal(c.r.state,'NEEDS_USER',name);assert.equal(c.r.reason,'unknown',name);assert.deepEqual(c.actions,[],name);assert.equal(w.clicks(),0,name);
    assert.equal(c.row.pending,null,name);assert.equal(c.row.resourceWritten,false,name);assert.equal(c.row.bagAddStarted,false,name);
  }
});

test('C019-R2 authentication stays the human gate on an anchored unknown cart with View Bag',async()=>{
  for(const [l,single,mutate] of [anchoredUnknown[0],anchoredUnknown[8]]){
    const name=label(l,single),p=cart({single});mutate(p);p.main.add(el('BUTTON','查看购物袋'),el('INPUT','',{type:'password'}));
    const w=world(p.main),o=await decode(w);assert.equal(o.phase,'AUTH',name);assert.equal(o.verifiedStep,false,name);
    const r=await send(w,o,'viewBag');assert.equal(r.delivered,false,name);assert.equal(r.touched,false,name);
    const c=await controller(w);assert.equal(c.r.state,'NEEDS_USER',name);assert.equal(c.r.reason,'auth',name);assert.deepEqual(c.actions,[],name);assert.equal(w.clicks(),0,name);
    assert.equal(c.row.pending,null,name);assert.equal(c.row.resourceWritten,false,name);
  }
});

test('C019-R2 positives: no-anchor View Bag navigation is unchanged and a recognized cart beside View Bag still checks out once',async()=>{
  // No purchased-list anchor at all (synthetic accessories shape): one View Bag click, on the bag path and on the entry path.
  for(const url of [BAG,ENTRY]){
    const view=el('BUTTON','查看购物袋'),main=el('DIV','',{role:'main'},[el('H1','配件'),view]),w=world(main,url),o=await decode(w);
    assert.equal(o.phase,'ACCESSORIES',url);assert.equal(o.verifiedStep,true,url);
    assert.deepEqual(await send(w,o,'viewBag'),{delivered:true},url);assert.equal(view.clicks,1,url);
  }
  // The controller still sends its one viewBag there; the synthetic next document is an authentication gate.
  const view=el('BUTTON','查看购物袋'),main=el('DIV','',{role:'main'},[el('H1','配件'),view]);view.onClick=()=>{main.add(el('INPUT','',{type:'password'}));};
  const w=world(main),c=await controller(w);
  assert.deepEqual(c.actions,['viewBag']);assert.equal(view.clicks,1);assert.equal(c.r.state,'NEEDS_USER');assert.equal(c.r.reason,'auth');
  // A recognized single visible cart keeps BAG precedence over a View Bag control and clicks exactly one checkout control.
  for(const single of [true,false]){
    const p=cart({single}),v=el('BUTTON','查看购物袋');p.main.add(v);const x=world(p.main),o=await decode(x);
    assert.equal(o.phase,'BAG');assert.equal(o.purchase.itemVerified,true);assert.equal(o.extras,false);
    assert.deepEqual(await send(x,o,'viewBag'),{delivered:false,touched:false,reason:'ActionNotRecognizedForCurrentStage'});assert.equal(x.clicks(),0);
    const fresh=await decode(x);assert.deepEqual(await send(x,fresh,'checkout'),{delivered:true});assert.equal(p.bottom.clicks,1);assert.equal(p.top.clicks,0);assert.equal(v.clicks,0);
  }
});
