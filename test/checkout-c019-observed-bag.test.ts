// C-019 observed-bag tests (Claude). Everything here is a FAKE offline DOM. Structure labels/anchors (OL/LI bag-items, H2 title,
// 数量 select + hidden clone, header/bottom 结账 data-autom=checkout, inline 添加 AppleCare offer, 总计 sibling pair) follow the
// October 3 supported public observation; every action result, navigation, AUTH endpoint, lost reply, offer button label and
// adversarial mutation is synthetic. Nothing here establishes a live Apple checkout, refusal, slot, timing or order contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {PurchaseJob,TASK_KEY,VALIDATION_KEY} from '../web/checkout-connector/job.js';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
import {ChromePort} from '../web/checkout-connector/chrome-port.js';

const pro={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{tradeIn:'none',appleCare:'none'}};
const BAG='https://www.apple.com.cn/shop/bag',AUTH='https://secure8.www.apple.com.cn/shop/signIn',PRO_URL='https://www.apple.com.cn/shop/buy-iphone/iphone-18-pro/mjt74ch/a';
const TITLE='iPhone 18 Pro 256GB 黑色',CARE='添加 适用于 iPhone 18 Pro 的 AppleCare+ 服务计划 (同时加入 iPhone 年年焕新计划) - RMB 1,799';
const terms='https://www.apple.com.cn/shop/open/salespolicies';
let time=5000000,serial=0;

// Minimal tree DOM: textContent concatenates descendants; connected only when reachable from the current HTML root.
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
  click(){if(this.disabled)return;this.clicks++;if(this.tagName==='INPUT')this.checked=true;this.onClick?.();}
  dispatchEvent(){return true;} checkValidity(){return true;}
}
const el=(tag,text,attrs,kids)=>new El(tag,text,attrs,kids);
function bagPage({pair=true,total='RMB 9,999',lineExtra=[],mainExtra=[],offerExtra=[]}={}){
  const qlabel=el('LABEL','数量'),qty=el('SELECT','',{'data-autom':'item-quantity-dropdown'},[el('OPTION','1')]);qty.labels=[qlabel];
  const hiddenQty=Object.assign(el('SELECT','',{class:'rs-quantity-hidden-select'},[el('OPTION','1')]),{hidden:true});
  const offerAdd=el('BUTTON','添加'),offer=el('DIV','',{class:'rs-inline-recommendation rs-iteminfo-child'},[el('H3',CARE),offerAdd,...offerExtra]);
  const line=el('LI','',{role:'listitem','data-autom':'bag-item-1',class:'rs-bag-item rs-iteminfo-wrap'},[el('DIV','',{},[el('H2','',{class:'rs-iteminfo-title'},[el('A',TITLE,{href:'/shop/product/mjt74ch/a'})]),qlabel,qty,hiddenQty,el('SPAN','RMB 9,999'),el('BUTTON','移除 '+TITLE),...lineExtra]),offer]);
  const top=el('BUTTON','结账',{'data-autom':'checkout',id:'shoppingCart.actions.navCheckout'}),bottom=el('BUTTON','结账',{'data-autom':'checkout',id:'shoppingCart.actions.checkout'}),amount=el('DIV',total);
  const main=el('DIV','',{role:'main'},[el('H1','你的购物袋总计 RMB 9,999。'),...(pair?[el('DIV','',{class:'row rs-bag-checkoutbutton-header'},[top])]:[]),
    el('OL','',{role:'list','data-autom':'bag-items',class:'rs-bag-items rs-iteminfos'},[line]),el('DIV','',{},[el('DIV','总计'),amount]),el('DIV','',{class:'row rs-bag-checkoutbutton-bottom'},[bottom]),...mainExtra]);
  return {main,top,bottom,offerAdd,amount,qty};
}
const authMain=()=>el('DIV','',{role:'main'},[el('H1','登录'),el('DIV','以游客身份继续'),el('BUTTON','以游客身份继续')]);
function variantMain(){
  const radio=label=>Object.assign(el('INPUT','',{type:'radio','aria-label':label}),{checked:true}),add=el('BUTTON','添加到购物袋');
  return {add,main:el('DIV','',{role:'main'},[el('H1','购买 iPhone 18 Pro'),...['iPhone 18 Pro','黑色','256GB RMB 9,999','不折抵换购','不加 AppleCare+ 服务计划'].map(radio),add])};
}
// One page "world"; every navigation is a new document (new id, new program globals, new root content).
function go(w,url,main){w.url=url;w.doc='FAKE-c019-doc-'+(++serial);w.html.children=[];w.html.add(el('BODY','',{},[main]));
  w.fn=vm.runInContext('('+merchantDocument.toString()+')',vm.createContext({document:{querySelector:s=>w.html.querySelector(s),querySelectorAll:s=>w.html.querySelectorAll(s)},location:{get href(){return w.url;}},URL,TextEncoder,crypto:webcrypto,Date,setTimeout,clearTimeout,HTMLInputElement:El,Event:class {constructor(t){this.type=t;}},getComputedStyle:e=>({display:e.hidden?'none':'block',visibility:'visible'})}));}
function world(main,url=BAG){const w={html:Object.assign(el('HTML'),{root:true})};go(w,url,main);return w;}
function memoryStore(){const s={rows:{},puts:[],async get(k){return structuredClone(s.rows[k]??null);},async put(k,v){s.puts.push(k);s.rows[k]=structuredClone(v);}};return s;}
function stack(w,{mode='purchase',store=memoryStore(),hooks={}}={}){
  const log=[];
  const api={tabs:{async get(){return {url:w.url};}},permissions:{async contains(){return true;}},scripting:{async executeScript({world:iso,func,args}){
    assert.equal(iso,'ISOLATED');assert.equal(func,merchantDocument);const c=args[1]??null;log.push(c?c.action:'observe');
    if(c)await hooks.beforeAct?.(c,store);const doc=w.doc,result=structuredClone(await w.fn(...args));if(c)await hooks.afterAct?.(c);
    return [{frameId:0,documentId:doc,result}];}}};
  const port=new ChromePort(api,7,{authorized:true,mode,initialSequence:store.rows[mode==='public-config'?VALIDATION_KEY:TASK_KEY]?.lastRead??0});
  port.wait=async n=>{time+=n;};
  const job=new PurchaseJob({store,port,now:()=>time,id:()=>'c19-'+(++serial),maxSteps:40});
  return {store,acts:()=>log.filter(x=>x!=='observe'),run:(o={})=>job.run(pro,{tabId:7,planDigest:'digest',mode,...o})};
}
const startGrant=(taskId)=>({id:'start-'+taskId,start:true,taskId,planDigest:'digest',entryDocumentId:'doc',termsUrl:terms,termsAccepted:true,existingOrdersChecked:true,noExtras:true,expiry:time+1200000});
const decode=async w=>structuredClone(await w.fn(pro));
const checkout=async(w,o)=>structuredClone(await w.fn(pro,{id:'c19-cmd-'+(++serial),taskId:'t',authorized:true,structured:true,expected:JSON.stringify(o),action:'checkout'}));
const writeAhead={beforeAct(c,store){assert.equal(store.rows[TASK_KEY].pending.id,c.id,'write-ahead precedes the send');assert.equal(store.rows[TASK_KEY].pending.action,c.action);}};

test('C019 bag decode: one purchased line, exact item/quantity/total; bag pickup/store prose proves no selected fulfillment',async()=>{
  const p=bagPage({lineExtra:[el('DIV','店内取货'),el('DIV','Apple 大连恒隆广场；今天取货')],mainExtra:[el('DIV','取货地点：Apple 大连恒隆广场')]}),w=world(p.main);
  const o=await decode(w);
  assert.equal(o.phase,'BAG');assert.equal(o.extras,false);
  assert.deepEqual(o.purchase,{itemVerified:true,verified:false,model:'iPhone 18 Pro',capacity:'256GB',color:'黑色',quantity:1,totalCny:9999,store:null,fulfillment:null});
  assert.deepEqual(await checkout(w,o),{delivered:true});assert.equal(p.bottom.clicks,1);assert.equal(p.top.clicks,0);assert.equal(p.offerAdd.clicks,0);
  const single=bagPage({pair:false}),s=world(single.main),so=await decode(s);assert.equal(so.phase,'BAG');
  assert.deepEqual(await checkout(s,so),{delivered:true});assert.equal(single.bottom.clicks,1);
});

test('C019 ambiguous, hidden-clone, disabled or unrecognized checkout controls are not BAG and stay positively untouched',async()=>{
  const cases=[
    ['hidden third clone',{mainExtra:[Object.assign(el('BUTTON','结账',{'data-autom':'checkout'}),{hidden:true})]}],
    ['安全结账 beside pair',{mainExtra:[el('BUTTON','安全结账')]}],
    ['unnamed data-autom=checkout link',{mainExtra:[el('A','继续',{'data-autom':'checkout'})]}],
    ['bottom disabled',{},p=>{p.bottom.disabled=true;}],
    ['header disabled',{},p=>{p.top.disabled=true;}],
  ];
  for(const [label,opts,mutate] of cases){
    const p=bagPage(opts);mutate?.(p);const w=world(p.main),o=await decode(w);
    assert.notEqual(o.phase,'BAG',label);
    const r=await checkout(w,o);assert.equal(r.delivered,false,label);assert.equal(r.touched,false,label);
    assert.equal(w.html.querySelectorAll('button,a').reduce((n,b)=>n+b.clicks,0),0,label);
  }
});

test('C019 purchased extras, unrecognized offers, other product text and outside markers block at page and controller',async()=>{
  const cases=[
    ['offer with removal',{offerExtra:[el('BUTTON','移除')]}],
    ['offer with checked choice',{offerExtra:[Object.assign(el('INPUT','',{type:'checkbox'}),{checked:true})]}],
    ['AppleCare child line',{lineExtra:[el('DIV','',{class:'rs-iteminfo-child'},[el('H3','AppleCare+ 服务计划（合成）'),el('BUTTON','移除 AppleCare+（合成）')])]}],
    ['trade-in in line',{lineExtra:[el('DIV','折抵换购 RMB 1,000（合成）')]}],
    ['AppleCare outside line',{mainExtra:[el('P','AppleCare+ 服务计划（合成说明）')]}],
    ['other product text in line',{lineExtra:[el('H3','iPhone 18 Pro 512GB 黑色')]}],
  ];
  for(const [label,opts] of cases){
    const p=bagPage(opts),w=world(p.main),o=await decode(w);
    assert.equal(o.phase,'BAG',label);assert.equal(o.extras,true,label);
    const r=await checkout(w,o);assert.equal(r.touched,false,label);assert.equal(p.bottom.clicks+p.top.clicks,0,label);
    const x=stack(w),s=await x.run();assert.equal(s.state,'BLOCKED',label);assert.equal(s.reason,'bag-conditions-not-verified',label);assert.deepEqual(x.acts(),[],label);
  }
  const twoLists=bagPage();twoLists.main.add(el('OL','',{'data-autom':'bag-items'},[el('LI','',{},[el('H2',TITLE)])]));
  assert.notEqual((await decode(world(twoLists.main))).phase,'BAG');
  assert.notEqual((await decode(world(bagPage().main,'https://secure6.www.apple.com.cn/shop/checkout'))).phase,'BAG');
});

test('C019 FAKE integration: observed bag → write-ahead → one checkout → FAKE AUTH; restart, fresh grant, back to bag or product never repeat or add',async()=>{
  const p=bagPage(),w=world(p.main);p.bottom.onClick=()=>go(w,AUTH,authMain());
  const x=stack(w,{hooks:writeAhead}),r=await x.run();
  assert.equal(r.state,'NEEDS_USER');assert.equal(r.reason,'auth');assert.deepEqual(x.acts(),['checkout']);
  assert.equal(p.bottom.clicks,1);assert.equal(p.top.clicks,0);assert.equal(p.offerAdd.clicks,0);
  const row=structuredClone(x.store.rows[TASK_KEY]);assert.equal(row.pending.action,'checkout');assert.equal(row.bagAddStarted,true);assert.equal(row.resourceWritten,true);
  const g=startGrant(row.taskId),y=stack(w,{store:x.store}),again=await y.run({grant:g,taskId:row.taskId});
  // A new start grant presented after the delivered checkout is refused; it neither sends nor clears the unknown history.
  assert.equal(again.state,'BLOCKED');assert.deepEqual(y.acts(),[]);assert.deepEqual(again.pending,row.pending);assert.equal(again.bagAddStarted,true);
  const kept=x.store.rows[TASK_KEY];assert.equal(kept.taskId,row.taskId);assert.deepEqual(kept.pending,row.pending);assert.ok((kept.history??[]).length>=(row.history??[]).length);
  const back=bagPage();go(w,BAG,back.main);const z=stack(w,{store:x.store}),b=await z.run();
  assert.equal(b.state,'NEEDS_VERIFICATION');assert.match(b.reason,/no automatic repeat/);assert.deepEqual(z.acts(),[]);assert.equal(back.bottom.clicks+back.top.clicks,0);
  const v=variantMain();go(w,PRO_URL,v.main);const q=stack(w,{store:x.store}),vr=await q.run();
  assert.deepEqual(q.acts(),[]);assert.equal(v.add.clicks,0);assert.match(vr.reason,/no automatic repeat/);
});

test('C019 FAKE lost checkout reply (after or before the page ran) is never repeated after restart',async()=>{
  const p=bagPage(),w=world(p.main);p.bottom.onClick=()=>go(w,AUTH,authMain());
  const x=stack(w,{hooks:{afterAct(){throw new Error('FAKE reply lost');}}}),r=await x.run();
  assert.equal(r.state,'NEEDS_VERIFICATION');assert.match(r.reason,/mutation-transport-lost/);assert.equal(p.bottom.clicks,1);assert.equal(r.pending.action,'checkout');
  const y=stack(w,{store:x.store});await y.run({grant:startGrant(r.taskId),taskId:r.taskId});assert.deepEqual(y.acts(),[]);
  const back=bagPage();go(w,BAG,back.main);const z=stack(w,{store:x.store});await z.run();assert.deepEqual(z.acts(),[]);assert.equal(back.bottom.clicks+back.top.clicks+p.top.clicks,0);assert.equal(p.bottom.clicks,1);
  const q=bagPage(),u=world(q.main),a=stack(u,{hooks:{beforeAct(){throw new Error('FAKE lost before page');}}});
  assert.equal((await a.run()).state,'NEEDS_VERIFICATION');assert.equal(q.bottom.clicks,0);
  const b=stack(u,{store:a.store}),s=await b.run();assert.match(s.reason,/no automatic repeat/);assert.deepEqual(b.acts(),[]);assert.equal(q.bottom.clicks+q.top.clicks,0);
});

test('C019 untouched checkout after a FAKE total drift blocks; a later configured product page is never added again',async()=>{
  const p=bagPage(),w=world(p.main),x=stack(w,{hooks:{beforeAct(){p.amount.textContent='RMB 10,999';}}}),r=await x.run();
  assert.equal(r.state,'BLOCKED');assert.equal(r.reason,'bag-conditions-not-verified');assert.equal(r.pending,null);assert.equal(r.untouchedFailures,1);
  assert.deepEqual(r.history.map(h=>[h.event,h.action,h.reason]),[['untouched-not-sent','checkout','OperationEvidenceChanged']]);assert.equal(p.bottom.clicks+p.top.clicks,0);
  const v=variantMain();go(w,PRO_URL,v.main);const y=stack(w,{store:x.store}),s=await y.run();
  assert.match(s.reason,/bag-addition-already-started/);assert.deepEqual(y.acts(),[]);assert.equal(v.add.clicks,0);
});

test('C019 public-configuration validation stops at the observed bag without any action or purchase-task write',async()=>{
  const p=bagPage(),w=world(p.main),x=stack(w,{mode:'public-config'}),r=await x.run();
  assert.equal(r.state,'VALIDATION_STOPPED');assert.deepEqual(x.acts(),[]);assert.equal(p.bottom.clicks+p.top.clicks,0);
  assert.ok(x.store.puts.every(k=>k===VALIDATION_KEY));assert.equal(x.store.rows[TASK_KEY],undefined);
});
