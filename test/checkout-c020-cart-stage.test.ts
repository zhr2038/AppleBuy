// C-020 cart-stage tests (Claude). FAKE offline DOM, location, storage and Chrome API only. The purchased-list anchor
// OL[data-autom="bag-items"], its LI/H2 line, the 数量 select and the header/bottom 结账 controls follow the October 3 supported
// public observation. Every stage decoy on the bag path (fulfillment, store, slot, details, payment, review and navigation
// controls), every malformed cart, gate element, no-anchor checkout page and click result is synthetic: none of these
// combinations was observed on the real merchant page. Nothing here establishes a live Apple bag, fulfillment, refusal or order
// contract, and no browser, cart, slot, order or payment state is read or changed.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {PurchaseJob,TASK_KEY} from '../web/checkout-connector/job.js';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
import {ChromePort} from '../web/checkout-connector/chrome-port.js';

const pro={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{tradeIn:'none',appleCare:'none'}};
const BAG='https://www.apple.com.cn/shop/bag',CHECKOUT='https://secure6.www.apple.com.cn/shop/checkout',TITLE='iPhone 18 Pro 256GB 黑色',STORE='Apple 大连恒隆广场';
const UNTOUCHED={delivered:false,touched:false,reason:'ActionNotRecognizedForCurrentStage'};
let time=9000000,serial=0;

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
  getAttribute(k){return Object.hasOwn(this.attrs,k)?this.attrs[k]:null;} hasAttribute(k){return Object.hasOwn(this.attrs,k);}
  get options(){return this.querySelectorAll('option');} get selectedOptions(){return this.options.filter((o,i)=>i===this.selectedIndex);}
  matches(sel){return sel.split(',').some(s=>one(this,s.trim().split(/\s+|>/).filter(Boolean).at(-1)));}
  closest(sel){for(let p=this;p;p=p.parentElement)if(p.matches(sel))return p;return null;}
  querySelectorAll(sel){const out=[],walk=e=>{for(const c of e.children){if(c.matches(sel))out.push(c);walk(c);}};walk(this);return out;}
  querySelector(sel){return this.querySelectorAll(sel)[0]??null;}
  click(){assert.equal(this.disabled,false,'a disabled control is never forced');this.clicks++;this.onClick?.();}
  dispatchEvent(){return true;} checkValidity(){return true;}
}
const el=(tag,text,attrs,kids)=>new El(tag,text,attrs,kids);
const radio=(label,group,checked=false)=>Object.assign(el('INPUT','',{type:'radio',name:group,'aria-label':label}),{checked});
const hiddenClone=()=>Object.assign(el('BUTTON','结账',{'data-autom':'checkout'}),{hidden:true});
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
  return {html,url,fn,clicks:()=>html.querySelectorAll('button,a,input').reduce((n,b)=>n+b.clicks,0)};
}
const decode=async w=>structuredClone(await w.fn(pro));
// A structured command bound to a fresh decode of the current document, as ChromePort sends it.
const send=async(w,action,extra={},id='c20-cmd-'+(++serial))=>{const expected=JSON.stringify(await decode(w));return structuredClone(await w.fn(pro,{...extra,id,taskId:'t',authorized:true,structured:true,expected,action}));};
async function controller(w){
  const actions=[],rows={},store={async get(k){return structuredClone(rows[k]??null);},async put(k,v){rows[k]=structuredClone(v);}};
  const api={tabs:{async get(){return {url:w.url};}},permissions:{async contains(){return true;}},scripting:{async executeScript({world:iso,func,args}){
    assert.equal(iso,'ISOLATED');assert.equal(func,merchantDocument);if(args[1])actions.push(args[1].action);return [{frameId:0,documentId:'FAKE-c020-doc',result:structuredClone(await w.fn(...args))}];}}};
  const port=new ChromePort(api,9,{authorized:true});port.wait=async n=>{time+=n;};
  const r=await new PurchaseJob({store,port,now:()=>time,id:()=>'c20-'+(++serial),maxSteps:20,hydrationMs:0,maxWaitMs:0}).run(pro,{tabId:9,planDigest:'digest'});
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
  ['visible list, hidden third checkout clone',false,p=>{p.main.add(hiddenClone());}],
  ['visible list, disabled bottom pair member',false,p=>{p.bottom.disabled=true;}],
  ['visible list, disabled single checkout',true,p=>{p.bottom.disabled=true;}],
  ['visible list, 安全结账 beside the pair',false,p=>{p.main.add(el('BUTTON','安全结账'));}],
  ['visible list, second visible 结账 beside the single control',true,p=>{p.main.add(el('BUTTON','结账'));}],
];
const label=(l,single)=>`${l} (${single?'single control':'header/bottom pair'})`;
// Synthetic foreign-stage controls appended to a bag-path document, with the action each one would otherwise authorize.
const decoys=[
  ['unselected pickup choice','selectPickup',{},()=>[radio('我要取货','fulfillment'),radio('送货上门','fulfillment')]],
  ['selected pickup with checked plan store','selectStore',{store:STORE},()=>[radio('我要取货','fulfillment',true),radio('送货上门','fulfillment'),radio(STORE,'store',true)]],
  ['slot Continue with selected pickup and store','selectDate',{date:'10月9日',ref:'date:0'},()=>[radio('我要取货','fulfillment',true),radio(STORE,'store',true),el('BUTTON','继续填写取货详情')]],
  ['details Continue','fillDetails',{},()=>[el('BUTTON','继续选择付款方式')]],
  ['unselected Alipay','selectPayment',{},()=>[radio('支付宝','payment')]],
  ['selected Alipay with Continue','continuePayment',{},()=>[radio('支付宝','payment',true),el('BUTTON','继续查看订单')]],
  ['Place Order','submitOrder',{},()=>[el('BUTTON','立即下单')]],
  ['View Bag','viewBag',{},()=>[el('BUTTON','查看购物袋')]],
  ['Add to Bag','addBag',{},()=>[el('BUTTON','添加到购物袋')]],
];

for(const [d,action,extra,make] of decoys)test('C020 anchored unknown cart plus '+d+': UNKNOWN, direct commands untouched, controller zero commands',async()=>{
  for(const [l,single,mutate] of anchoredUnknown){
    const name=label(l,single),p=cart({single});mutate(p);p.main.add(...make());
    const w=world(p.main),o=await decode(w);
    assert.equal(o.phase,'UNKNOWN',name);assert.equal(o.verifiedStep,false,name);
    assert.deepEqual(await send(w,action,extra),UNTOUCHED,name+' / '+action);
    assert.deepEqual(await send(w,'checkout'),UNTOUCHED,name+' / checkout');assert.equal(w.clicks(),0,name);
    const c=await controller(w);
    assert.equal(c.r.state,'NEEDS_USER',name);assert.equal(c.r.reason,'unknown',name);assert.deepEqual(c.actions,[],name);assert.equal(w.clicks(),0,name);
    assert.equal(c.row.pending,null,name);assert.equal(c.row.resourceWritten,false,name);assert.equal(c.row.bagAddStarted,false,name);
  }
});

test('C020 recognized cart keeps BAG beside every foreign-stage decoy; the decoy action is untouched and checkout clicks the proved control once',async()=>{
  for(const single of [true,false])for(const [d,action,extra,make] of decoys){
    const name=`${d} (${single?'single control':'header/bottom pair'})`,p=cart({single}),added=make();p.main.add(...added);
    const w=world(p.main),o=await decode(w);
    assert.equal(o.phase,'BAG',name);assert.equal(o.verifiedStep,true,name);assert.equal(o.purchase.itemVerified,true,name);assert.equal(o.extras,false,name);
    // Bag-path controls never become store, fulfillment or full purchase proof.
    assert.equal(o.purchase.store,null,name);assert.equal(o.purchase.fulfillment,null,name);assert.equal(o.purchase.verified,false,name);
    assert.deepEqual(await send(w,action,extra),UNTOUCHED,name);assert.equal(w.clicks(),0,name);
    assert.deepEqual(await send(w,'checkout'),{delivered:true},name);
    assert.equal(p.bottom.clicks,1,name);assert.equal(p.top.clicks,0,name);assert.equal(added.reduce((n,e)=>n+e.clicks,0),0,name);
  }
});

test('C020 recognized cart controller sends exactly one checkout beside every foreign-stage decoy',async()=>{
  for(const single of [true,false])for(const [d,,,make] of decoys){
    const name=`${d} (${single?'single control':'header/bottom pair'})`,p=cart({single}),added=make();p.main.add(...added);
    // Synthetic next document: an authentication gate, so the run stops after the one delivered checkout.
    p.bottom.onClick=()=>{p.main.add(el('INPUT','',{type:'password'}));};
    const c=await controller(world(p.main));
    assert.deepEqual(c.actions,['checkout'],name);assert.equal(p.bottom.clicks,1,name);assert.equal(p.top.clicks,0,name);assert.equal(added.reduce((n,e)=>n+e.clicks,0),0,name);
    assert.equal(c.r.state,'NEEDS_USER',name);assert.equal(c.r.reason,'auth',name);
    assert.equal(c.row.pending.action,'checkout',name);assert.equal(c.row.bagAddStarted,true,name);assert.equal(c.row.resourceWritten,true,name);
  }
});

test('C020 human/processing gates keep priority over recognized and ambiguous carts with a pickup decoy',async()=>{
  const gates=[['AUTH','NEEDS_USER','auth',()=>el('INPUT','',{type:'password'})],['AUTH','NEEDS_USER','auth',()=>el('INPUT','',{autocomplete:'one-time-code'})],
    ['AUTH','NEEDS_USER','auth',()=>el('P','以游客身份继续')],['CONSENT','NEEDS_USER','consent',()=>el('P','Apple 和你的数据隐私')],
    ['PROCESSING','NEEDS_VERIFICATION','merchant-processing-time-bound-reached',()=>el('DIV','',{'aria-busy':'true'})]];
  for(const unknownCart of [false,true])for(const [phase,state,reason,make] of gates){
    const name=`${phase}/${reason} (${unknownCart?'ambiguous':'recognized'} cart)`,p=cart();if(unknownCart)p.main.add(hiddenClone());
    const pickup=radio('我要取货','fulfillment');p.main.add(pickup,radio('送货上门','fulfillment'),make());
    const w=world(p.main),o=await decode(w);assert.equal(o.phase,phase,name);assert.equal(o.verifiedStep,false,name);
    for(const a of ['checkout','selectPickup'])assert.deepEqual(await send(w,a),UNTOUCHED,name+' / '+a);
    const c=await controller(w);assert.equal(c.r.state,state,name);assert.equal(c.r.reason,reason,name);assert.deepEqual(c.actions,[],name);
    assert.equal(w.clicks(),0,name);assert.equal(pickup.clicks,0,name);assert.equal(c.row.pending,null,name);assert.equal(c.row.resourceWritten,false,name);
  }
});

test('C020 an order-state label on the bag path stays UNKNOWN even beside a recognized cart',async()=>{
  const p=cart();p.main.add(el('P','待付款'));const w=world(p.main),o=await decode(w);
  assert.equal(o.phase,'UNKNOWN');assert.equal(o.verifiedStep,false);assert.deepEqual(await send(w,'checkout'),UNTOUCHED);
  const c=await controller(w);assert.equal(c.r.reason,'unknown');assert.deepEqual(c.actions,[]);assert.equal(w.clicks(),0);assert.equal(c.row.pending,null);
});

test('C020 a delivered checkout followed by an anchored cart with a pickup decoy is neither progress nor repeated',async()=>{
  // The cart turns ambiguous and gains a pickup radio: UNKNOWN stops reconciliation; the pending checkout stays recorded.
  const p=cart(),pickup=radio('我要取货','fulfillment');p.bottom.onClick=()=>{p.main.add(hiddenClone(),pickup,radio('送货上门','fulfillment'));};
  const c=await controller(world(p.main));
  assert.deepEqual(c.actions,['checkout']);assert.equal(p.bottom.clicks,1);assert.equal(pickup.clicks,0);
  assert.equal(c.r.state,'NEEDS_USER');assert.equal(c.r.reason,'unknown');assert.equal(c.row.pending.action,'checkout');assert.equal(c.row.bagAddStarted,true);
  // The recognized cart stays and only gains the decoy: BAG is not a checkout result, so nothing is sent again.
  const q=cart(),decoy=radio('我要取货','fulfillment');q.bottom.onClick=()=>{q.main.add(decoy,radio('送货上门','fulfillment'));};
  const d=await controller(world(q.main));
  assert.deepEqual(d.actions,['checkout']);assert.equal(q.bottom.clicks,1);assert.equal(decoy.clicks,0);
  assert.equal(d.r.state,'NEEDS_VERIFICATION');assert.equal(d.r.reason,'mutation-result-unconfirmed; no automatic repeat');assert.equal(d.row.pending.action,'checkout');
});

test('C020 memo: a delivered checkout id stays touched after its cart turns unknown; a new pickup id is untouched',async()=>{
  const p=cart(),pickup=radio('我要取货','fulfillment');p.bottom.onClick=()=>{p.main.add(hiddenClone(),pickup,radio('送货上门','fulfillment'));};
  const w=world(p.main);
  assert.deepEqual(await send(w,'checkout',{},'c20-same-id'),{delivered:true});assert.equal((await decode(w)).phase,'UNKNOWN');
  assert.deepEqual(await send(w,'checkout',{},'c20-same-id'),{delivered:false,touched:true,reason:'OperationAlreadyDelivered'});
  assert.deepEqual(await send(w,'selectPickup'),UNTOUCHED);assert.equal(p.bottom.clicks,1);assert.equal(pickup.clicks,0);
});

test('C020 positives: the anchor rule is bag-path only; no-anchor checkout stages and the legacy bag are unchanged',async()=>{
  const page=(...extra)=>el('DIV','',{role:'main'},[el('H1','FAKE 结账步骤'),el('P',TITLE),el('P','数量：1'),el('P','总计：RMB 9,999'),...extra]);
  // Ordinary checkout fulfillment, with and without a purchased-list-like OL on the checkout path, still selects pickup once.
  for(const anchor of [false,true]){
    const pick=radio('我要取货','fulfillment'),del=radio('送货上门','fulfillment');pick.onClick=()=>{pick.checked=true;del.checked=false;};
    const ol=anchor?[el('OL','',{'data-autom':'bag-items'},[el('LI','',{},[el('SPAN','FAKE 非购物袋路径列表')])])]:[];
    const w=world(page(...ol,pick,del,radio(STORE,'store',true)),CHECKOUT),o=await decode(w),name='checkout-path anchor '+anchor;
    assert.equal(o.phase,'FULFILLMENT',name);assert.equal(o.verifiedStep,true,name);assert.equal(o.purchase.itemVerified,true,name);assert.equal(o.fulfillmentChoice,'unselected',name);
    assert.deepEqual(await send(w,'selectPickup'),{delivered:true},name);assert.equal(pick.clicks,1,name);
    const after=await decode(w);assert.equal(after.phase,'FULFILLMENT',name);assert.equal(after.purchase.verified,true,name);assert.equal(after.purchase.fulfillment,'pickup',name);assert.equal(after.purchase.store,STORE,name);
  }
  // Later no-anchor checkout stages still decode with full purchase proof.
  for(const [phase,make] of [['DETAILS',()=>el('BUTTON','继续选择付款方式')],['PAYMENT',()=>radio('支付宝','payment')],['REVIEW',()=>el('BUTTON','立即下单')]]){
    const o=await decode(world(page(el('P','店内取货'),el('P','取货地点：'+STORE),make()),CHECKOUT));
    assert.equal(o.phase,phase);assert.equal(o.verifiedStep,true,phase);assert.equal(o.purchase.verified,true,phase);assert.equal(o.purchase.store,STORE,phase);
  }
  // The legacy no-anchor bag still takes its single generic checkout.
  const b=el('BUTTON','结账'),w=world(page(b),BAG),o=await decode(w);
  assert.equal(o.phase,'BAG');assert.equal(o.verifiedStep,true);assert.equal(o.purchase.itemVerified,true);
  assert.deepEqual(await send(w,'checkout'),{delivered:true});assert.equal(b.clicks,1);
});
