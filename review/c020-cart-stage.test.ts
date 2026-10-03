// Independent Codex C020 acceptance cases. Entirely FAKE DOM, location, storage and Chrome API.
// The one-item OL/LI/H2 and header/bottom checkout anchors derive from the prior supported public
// observation. Every stage decoy, malformed cart, click result and checkout document below is synthetic.
// This file does not establish an Apple fulfillment/refusal/order contract or mutate any browser/cart.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
import {ChromePort} from '../web/checkout-connector/chrome-port.js';
import {PurchaseJob,TASK_KEY} from '../web/checkout-connector/job.js';

const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{tradeIn:'none',appleCare:'none'}};
const BAG='https://www.apple.com.cn/shop/bag',CHECKOUT='https://secure6.www.apple.com.cn/shop/checkout',TITLE='iPhone 18 Pro 256GB 黑色';
let serial=0;
function matches(e,s){const m=/^([a-zA-Z0-9]*)(.*)$/.exec(s);if(m[1]&&e.tagName!==m[1].toUpperCase())return false;
  for(const [,cls,attr,op,value] of m[2].matchAll(/\.([\w-]+)|\[([\w-]+)(?:([*^$]?=)"([^"]*)")?\]/g)){
    if(cls){if(!(e.attrs.class??'').split(/\s+/).includes(cls))return false;continue;}
    const a=e.getAttribute(attr);if(a===null||(op==='='&&a!==value)||(op==='*='&&!a.includes(value))||(op==='^='&&!a.startsWith(value))||(op==='$='&&!a.endsWith(value)))return false;
  }return true;}
class El{
  constructor(tag,text='',attrs={},kids=[]){Object.assign(this,{tagName:tag,own:text,attrs:{...attrs},children:[],parentElement:null,hidden:false,disabled:false,checked:false,labels:[],clicks:0,selectedIndex:0,isConnected:true});this.add(...kids);}
  add(...kids){for(const c of kids){c.parentElement=this;this.children.push(c);}return this;}
  get textContent(){return this.own+this.children.map(c=>c.textContent).join('');}
  getAttribute(k){return Object.hasOwn(this.attrs,k)?this.attrs[k]:null;}
  hasAttribute(k){return Object.hasOwn(this.attrs,k);}
  matches(sel){return sel.split(',').some(s=>matches(this,s.trim()));}
  closest(sel){for(let p=this;p;p=p.parentElement)if(p.matches(sel))return p;return null;}
  querySelectorAll(sel){const out=[],walk=e=>{for(const c of e.children){if(c.matches(sel))out.push(c);walk(c);}};walk(this);return out;}
  querySelector(sel){return this.querySelectorAll(sel)[0]??null;}
  get options(){return this.querySelectorAll('option');}
  get selectedOptions(){return this.options.filter((_,i)=>i===this.selectedIndex);}
  click(){assert.equal(this.disabled,false);assert.equal(this.hidden,false);this.clicks++;this.onClick?.();}
  dispatchEvent(){return true;}
  checkValidity(){return true;}
}
const el=(tag,text='',attrs={},kids=[])=>new El(tag,text,attrs,kids);
function world(main,url){
  const html=el('HTML','',{},[el('BODY','',{},[main])]);
  const fn=vm.runInContext('('+merchantDocument.toString()+')',vm.createContext({document:html,location:{href:url},URL,TextEncoder,crypto:webcrypto,Date,setTimeout,clearTimeout,HTMLInputElement:El,Event:class{constructor(type){this.type=type;}},getComputedStyle:e=>({display:e.hidden?'none':'block',visibility:'visible'})}));
  return {main,url,fn,read:async()=>structuredClone(await fn(plan)),clicks:()=>html.querySelectorAll('button,input').reduce((n,e)=>n+e.clicks,0)};
}
function cart(){
  const label=el('LABEL','数量'),qty=el('SELECT','',{},[el('OPTION','1')]);qty.labels=[label];
  const list=el('OL','',{'data-autom':'bag-items'},[el('LI','',{},[el('H2',TITLE),label,qty,el('BUTTON','移除 '+TITLE)])]);
  const top=el('BUTTON','结账',{'data-autom':'checkout'}),bottom=el('BUTTON','结账',{'data-autom':'checkout'});
  const main=el('DIV','',{role:'main'},[el('H1','你的购物袋'),el('DIV','',{class:'rs-bag-checkoutbutton-header'},[top]),list,el('DIV','',{},[el('DIV','总计'),el('DIV','RMB 9,999')]),el('DIV','',{class:'rs-bag-checkoutbutton-bottom'},[bottom])]);
  return {...world(main,BAG),list,top,bottom};
}
function fulfillment(main,{selected=false,store=false}={}){
  const pickup=el('INPUT','',{type:'radio',name:'fulfillment','aria-label':'我要取货'}),delivery=el('INPUT','',{type:'radio',name:'fulfillment','aria-label':'送货上门'});
  pickup.checked=selected;pickup.onClick=()=>{pickup.checked=true;delivery.checked=false;};
  main.add(pickup,delivery);
  if(store){const s=el('INPUT','',{type:'radio',name:'store','aria-label':'Apple 大连恒隆广场'});s.checked=true;main.add(s);}
  return pickup;
}
function ambiguous(kind){
  const f=cart();
  if(kind==='disabled-bottom')f.bottom.disabled=true;
  else if(kind==='hidden-third'){const clone=el('BUTTON','结账',{'data-autom':'checkout'});clone.hidden=true;f.main.add(clone);}
  else if(kind==='different-checkout')f.main.add(el('BUTTON','安全结账'));
  else throw Error('unknown fixture variant');
  return f;
}
async function send(f,action){const expected=JSON.stringify(await f.read());return structuredClone(await f.fn(plan,{id:'FAKE-c020-command-'+(++serial),taskId:'FAKE-c020-task',authorized:true,structured:true,expected,action}));}
async function run(f){
  const actions=[],rows={},store={async get(k){return structuredClone(rows[k]??null);},async put(k,v){rows[k]=structuredClone(v);}};
  const api={tabs:{async get(){return {url:f.url};}},permissions:{async contains(){return true;}},scripting:{async executeScript({world:which,args}){assert.equal(which,'ISOLATED');if(args[1])actions.push(args[1].action);return [{frameId:0,documentId:'FAKE-c020-doc',result:await f.fn(...args)}];}}};
  const r=await new PurchaseJob({store,port:new ChromePort(api,20,{authorized:true}),hydrationMs:0,maxWaitMs:0}).run(plan,{tabId:20,planDigest:'FAKE-c020-digest'});
  return {r,actions,row:rows[TASK_KEY]};
}

for(const kind of ['disabled-bottom','hidden-third','different-checkout']){
  test('C020 ambiguous anchored cart with pickup decoy is UNKNOWN: '+kind,async()=>{
    const f=ambiguous(kind);fulfillment(f.main);const o=await f.read();
    assert.equal(o.purchase.itemVerified,true,'the synthetic cart still proves exactly one allowed item');
    assert.equal(o.phase,'UNKNOWN');assert.equal(o.verifiedStep,false);assert.equal(f.clicks(),0);
  });
  test('C020 direct selectPickup is untouched on ambiguous anchored cart: '+kind,async()=>{
    const f=ambiguous(kind),pickup=fulfillment(f.main),r=await send(f,'selectPickup');
    assert.equal(r.delivered,false);assert.equal(r.touched,false);assert.equal(pickup.clicks,0);assert.equal(f.clicks(),0);
  });
  test('C020 controller sends no command on ambiguous anchored cart: '+kind,async()=>{
    const f=ambiguous(kind),pickup=fulfillment(f.main),c=await run(f);
    assert.deepEqual(c.actions,[]);assert.equal(pickup.clicks,0);assert.equal(f.clicks(),0);
    assert.equal(c.r.state,'NEEDS_USER');assert.equal(c.r.reason,'unknown');
    assert.equal(c.row.pending,null);assert.equal(c.row.resourceWritten,false);assert.equal(c.row.bagAddStarted,false);
  });
}

test('C020 recognized cart with a pickup decoy retains its one proved checkout action',async()=>{
  const f=cart(),pickup=fulfillment(f.main),o=await f.read();
  assert.equal(o.phase,'BAG');assert.equal(o.purchase.itemVerified,true);assert.equal(o.extras,false);
  assert.deepEqual(await send(f,'checkout'),{delivered:true});assert.equal(f.bottom.clicks,1);assert.equal(f.top.clicks,0);assert.equal(pickup.clicks,0);
});
test('C020 recognized cart controller uses checkout once rather than the pickup decoy',async()=>{
  const f=cart(),pickup=fulfillment(f.main);f.bottom.onClick=()=>f.main.add(el('INPUT','',{type:'password'}));
  const c=await run(f);assert.deepEqual(c.actions,['checkout']);assert.equal(f.bottom.clicks,1);assert.equal(f.top.clicks,0);assert.equal(pickup.clicks,0);
  assert.equal(c.r.state,'NEEDS_USER');assert.equal(c.r.reason,'auth');assert.equal(c.row.pending.action,'checkout');assert.equal(c.row.bagAddStarted,true);
});

for(const kind of ['duplicate','hidden','aria-hidden'])test('C020 invalid purchased-list scope plus pickup remains UNKNOWN: '+kind,async()=>{
  const f=cart();if(kind==='duplicate')f.main.add(el('OL','',{'data-autom':'bag-items'}));else if(kind==='hidden')f.list.hidden=true;else f.list.attrs['aria-hidden']='true';
  fulfillment(f.main);const o=await f.read();assert.equal(o.phase,'UNKNOWN');assert.equal(o.verifiedStep,false);assert.equal(o.purchase.itemVerified,false);
  const c=await run(f);assert.deepEqual(c.actions,[]);assert.equal(f.clicks(),0);assert.equal(c.row.pending,null);
});

for(const stage of ['details','payment','review'])test('C020 ambiguous anchored cart does not claim another checkout stage: '+stage,async()=>{
  const f=ambiguous('hidden-third');
  f.main.add(stage==='payment'?el('INPUT','',{type:'radio','aria-label':'支付宝'}):el('BUTTON',stage==='details'?'继续选择付款方式':'立即下单'));
  const o=await f.read();assert.equal(o.phase,'UNKNOWN');assert.equal(o.verifiedStep,false);
  const c=await run(f);assert.deepEqual(c.actions,[]);assert.equal(f.clicks(),0);assert.equal(c.row.pending,null);
});

for(const gate of ['AUTH','CONSENT','PROCESSING'])test('C020 human/processing gate has priority over cart and decoy: '+gate,async()=>{
  const f=ambiguous('hidden-third');fulfillment(f.main);
  if(gate==='AUTH')f.main.add(el('INPUT','',{type:'password'}));
  else if(gate==='CONSENT')f.main.add(el('P','Apple 和你的数据隐私'));
  else f.main.add(el('DIV','',{'aria-busy':'true'}));
  const o=await f.read();assert.equal(o.phase,gate);assert.equal(o.verifiedStep,false);
  const r=await send(f,'selectPickup');assert.equal(r.delivered,false);assert.equal(r.touched,false);
  const c=await run(f);assert.deepEqual(c.actions,[]);assert.equal(f.clicks(),0);assert.equal(c.row.pending,null);
});

test('C020 positive ordinary no-anchor checkout still selects pickup and proves the plan',async()=>{
  const main=el('DIV','',{role:'main'},[el('H1','取货方式'),el('P',TITLE),el('P','数量：1'),el('P','总计：RMB 9,999')]);
  const pickup=fulfillment(main,{store:true}),f=world(main,CHECKOUT),o=await f.read();
  assert.equal(o.phase,'FULFILLMENT');assert.equal(o.purchase.itemVerified,true);assert.equal(o.fulfillmentChoice,'unselected');
  assert.deepEqual(await send(f,'selectPickup'),{delivered:true});assert.equal(pickup.clicks,1);
  const after=await f.read();assert.equal(after.phase,'FULFILLMENT');assert.equal(after.purchase.verified,true);assert.equal(after.purchase.fulfillment,'pickup');assert.equal(after.purchase.store,plan.stores[0]);
});
test('C020 positive observed cart without decoys still clicks one bottom checkout',async()=>{
  const f=cart(),o=await f.read();assert.equal(o.phase,'BAG');assert.equal(o.purchase.itemVerified,true);assert.equal(o.extras,false);
  assert.deepEqual(await send(f,'checkout'),{delivered:true});assert.equal(f.bottom.clicks,1);assert.equal(f.top.clicks,0);
});
