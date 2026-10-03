// C-024 implementation tests (Claude): checkout summary money evidence and the FULFILLMENT decisions built on it. Every DOM,
// Chrome API, store, clock and id below is FAKE. Only the companion-bar button/caption and the missing checkout quantity come
// from the October 3 supported read-only observation; explicit quantities, conflicts, dialogues and variants are synthetic.
// No browser, account, network, cart, slot, order or payment is touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
import {ChromePort} from '../web/checkout-connector/chrome-port.js';
import {PurchaseJob,TASK_KEY,NO_EXTRAS} from '../web/checkout-connector/job.js';

const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{...NO_EXTRAS}};
const BAR='companionbar-button';

// Minimal FAKE tree: comma lists of compound tag/[attr]/[attr="v"]/.class selectors; any other selector throws.
const one=(e,s)=>{const m=/^([a-z0-9]*)((?:\[[\w-]+(?:="[^"]*")?\]|\.[\w-]+)*)$/i.exec(s.trim());if(!m)throw new Error('FAKE selector unsupported: '+s);
  if(m[1]&&e.tagName!==m[1].toUpperCase())return false;
  for(const [,k,v] of m[2].matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g))if(v===undefined?!e.hasAttribute(k):e.getAttribute(k)!==v)return false;
  return [...m[2].replace(/\[[^\]]*\]/g,'').matchAll(/\.([\w-]+)/g)].every(([,c])=>String(e.getAttribute('class')??'').split(/\s+/).includes(c));};
class El{
  constructor(tag,text='',attrs={}){Object.assign(this,{tagName:tag,own:text,attrs,children:[],parentElement:null,hidden:false,disabled:false,checked:false,labels:[],clicks:0});}
  add(...n){for(const c of n){c.parentElement=this;this.children.push(c);}return this;}
  get isConnected(){let p=this;while(p.parentElement)p=p.parentElement;return p.tagName==='HTML';}
  get textContent(){return this.own+this.children.map(c=>c.textContent).join('');}
  set textContent(t){this.own=t;this.children=[];}
  getAttribute(k){return Object.hasOwn(this.attrs,k)?this.attrs[k]:null;}
  hasAttribute(k){return Object.hasOwn(this.attrs,k);}
  querySelectorAll(s){const out=[];const walk=n=>{for(const c of n.children){if(s.split(',').some(x=>one(c,x)))out.push(c);walk(c);}};walk(this);return out;}
  querySelector(s){return this.querySelectorAll(s)[0]??null;}
  closest(s){for(let p=this;p;p=p.parentElement)if(s.split(',').some(x=>one(p,x)))return p;return null;}
  click(){assert.equal(this.disabled,false);assert.equal(this.hidden,false);this.clicks++;this.onClick?.();}
  dispatchEvent(){return true;}
}
const el=(tag,text='',attrs={},o={})=>Object.assign(new El(tag,text,attrs),o);
// Synthetic additions to the observed layout.
const qty=t=>({main})=>main.add(el('P','数量：'+t));
const put=(tag,text,attrs={},o={})=>({main})=>main.add(el(tag,text,attrs,o));
const store=(label,checked)=>({main})=>{const r=el('INPUT','',{type:'radio',name:'FAKE-c024-store'},{checked}),l=el('LABEL',label);r.labels=[l];main.add(l,r);return r;};
const pickupChecked=({pickup,delivery})=>{pickup.checked=true;delivery.checked=false;};

// The observed FULFILLMENT layout: heading, one product strip without any quantity, one companion-bar summary button, and the
// native pickup/delivery choice with delivery checked.
let ids=0;
function page({host='secure6.www.apple.com.cn',path='/shop/checkout',caption='显示订单摘要： ',amount='RMB 9,999',bar=true,product='iPhone 18 Pro 256GB 黑色',extra=[]}={}){
  const main=el('MAIN'),summary=el('BUTTON',caption,{'data-autom':BAR}).add(el('SPAN',amount));
  const pickup=el('INPUT','',{type:'radio',name:'FAKE-c024-fulfillment'}),plabel=el('LABEL','我要取货');pickup.labels=[plabel];
  const delivery=el('INPUT','',{type:'radio',name:'FAKE-c024-fulfillment'},{checked:true}),dlabel=el('LABEL','为我送货');delivery.labels=[dlabel];
  pickup.onClick=()=>{pickup.checked=true;delivery.checked=false;};
  main.add(el('H1','你希望如何收到订单商品？'),el('DIV',product),...(bar?[summary]:[]),plabel,pickup,dlabel,delivery);
  const body=el('BODY').add(main),document=el('HTML').add(body),href='https://'+host+path;
  const p={main,body,summary,pickup,delivery,href,made:[]};for(const f of extra)p.made.push(f(p));
  const ctx=vm.createContext({document,location:{href},URL,TextEncoder,crypto:webcrypto,Date,setTimeout,clearTimeout,HTMLInputElement:El,Event:class{},getComputedStyle:()=>({display:'block',visibility:'visible'})});
  p.fn=vm.runInContext('('+merchantDocument.toString()+')',ctx);
  p.read=async()=>structuredClone(await p.fn(plan));
  p.send=async(action,more={})=>structuredClone(await p.fn(plan,{id:'FAKE-c024-command-'+(++ids),taskId:'FAKE-c024-task',authorized:true,structured:true,action,...more,expected:JSON.stringify(await p.read())}));
  return p;
}
const total=async o=>(await page(o).read()).purchase.totalCny;

test('C024 the summary button is money evidence only on the secure official checkout route; elsewhere labelled totals behave as before',async()=>{
  assert.equal(await total({host:'www.apple.com.cn',extra:[qty('1')]}),null);
  assert.equal(await total({host:'www.apple.com.cn',amount:'RMB 10,999',extra:[put('DIV','总计：RMB 9,999')]}),9999);
  assert.equal(await total({path:'/shop/checkout/',extra:[qty('1')]}),9999);
  // No widget on the checkout route: the labelled total alone keeps its old meaning.
  assert.equal(await total({bar:false,extra:[put('DIV','总计：RMB 9,999')]}),9999);
  assert.equal(await total({bar:false}),null);
});
for(const [name,o] of [
  ['a hidden twin widget',{extra:[put('BUTTON','显示订单摘要： RMB 9,999',{'data-autom':BAR},{hidden:true})]}],
  ['a widget only outside main (never read)',{bar:false,extra:[({body})=>body.add(el('BUTTON','显示订单摘要： RMB 9,999',{'data-autom':BAR}))]}],
  ['a non-control widget (never read)',{bar:false,extra:[put('DIV','显示订单摘要： RMB 9,999',{'data-autom':BAR})]}],
  ['a widget inside a hidden ancestor',{bar:false,extra:[({main})=>main.add(el('DIV','',{},{hidden:true}).add(el('BUTTON','显示订单摘要： RMB 9,999',{'data-autom':BAR})))]}],
  ['two labelled totals that disagree with each other',{extra:[put('DIV','总计：RMB 9,999'),put('DIV','合计：RMB 8,999')]}],
])test('C024 '+name+' leaves the checkout total unknown and pickup unavailable',async()=>{
  const p=page({...o,extra:[qty('1'),...o.extra]}),r=await p.read();assert.equal(r.purchase.totalCny,null);assert.equal(r.purchase.itemVerified,false);
  assert.deepEqual(await p.send('selectPickup'),{delivered:false,touched:false,reason:'ActionNotRecognizedForCurrentStage'});assert.equal(p.pickup.clicks,0);
});
test('C024 only the observed caption form with RMB and a well-formed positive amount is read',async()=>{
  for(const amount of ['¥9,999','RMB 99,99','RMB 9,999 起','RMB 9,999.5','RMB -9,999','RMB 0.00'])assert.equal(await total({amount}),null,amount);
  for(const caption of ['订单摘要： ','显示订单摘要 小计： ','隐藏订单摘要： '])assert.equal(await total({caption}),null,caption);
  assert.equal(await total({amount:'RMB9,999'}),9999);assert.equal(await total({amount:'RMB 9,999.00'}),9999);assert.equal(await total({amount:'RMB 9999'}),9999);
});
test('C024 the summary dialogue split values are never borrowed as a total',async()=>{
  const dialogue=({main})=>main.add(el('DIV','',{role:'dialog'},{hidden:true}).add(el('DIV').add(el('SPAN','小计'),el('SPAN','RMB 9,999')),el('DIV').add(el('SPAN','总计'),el('SPAN','RMB 9,999',{'data-autom':'orderTotalValue'}))));
  assert.equal(await total({bar:false,extra:[qty('1'),dialogue]}),null);
});
for(const [name,extra] of [['a hidden quantity line',[put('P','数量：1',{},{hidden:true})]],['an unrecognized quantity',[qty('1件')]],['a quantity only in prose',[put('P','共 1 件商品')]],['two quantity lines',[qty('1'),qty('1')]]])
  test('C024 '+name+' never proves one unit, even with the current total',async()=>{
    const p=page({extra}),r=await p.read();assert.equal(r.purchase.totalCny,9999);assert.equal(r.purchase.quantity,null);assert.equal(r.purchase.itemVerified,false);
    assert.equal((await p.send('selectPickup')).delivered,false);assert.equal(p.pickup.clicks,0);
  });
test('C024 a specification conflict stops pickup despite an explicit unit and the current total',async()=>{
  const p=page({product:'iPhone 18 Pro Max 256GB 黑色',extra:[qty('1')]});assert.equal((await p.read()).purchase.itemVerified,false);assert.equal((await p.send('selectPickup')).delivered,false);assert.equal(p.pickup.clicks,0);
});
test('C024 a conflicting checked store blocks choosing pickup; the bound store does not',async()=>{
  const bad=page({extra:[qty('1'),store('Apple FAKE 其他门店',true)]});
  assert.deepEqual(await bad.send('selectPickup'),{delivered:false,touched:false,reason:'ActionNotRecognizedForCurrentStage'});assert.equal(bad.pickup.clicks,0);
  const good=page({extra:[qty('1'),store('Apple 大连恒隆广场',true)]});assert.deepEqual(await good.send('selectPickup'),{delivered:true});assert.equal(good.pickup.clicks,1);
});
test('C024 store selection also needs the fresh total within the cap',async()=>{
  const over=page({amount:'RMB 10,000',extra:[qty('1'),pickupChecked,store('Apple 大连恒隆广场',false)]});
  assert.equal((await over.read()).purchase.itemVerified,true);assert.deepEqual(await over.send('selectStore',{store:'Apple 大连恒隆广场'}),{delivered:false,touched:false,reason:'ActionNotRecognizedForCurrentStage'});assert.equal(over.made[2].clicks,0);
  const ok=page({extra:[qty('1'),pickupChecked,store('Apple 大连恒隆广场',false)]});assert.deepEqual(await ok.send('selectStore',{store:'Apple 大连恒隆广场'}),{delivered:true});assert.equal(ok.made[2].clicks,1);
});

// The actual ChromePort and PurchaseJob over a FAKE Chrome API that runs the actual page program on the FAKE document.
function job(p,stored=null,maxSteps=100){
  const t={row:stored,states:[],acts:[],replies:[]};
  const api={tabs:{async get(id){assert.equal(id,7);return {url:p.href};}},permissions:{async contains(){return true;}},
    scripting:{async executeScript({target,world,func,args}){assert.equal(world,'ISOLATED');assert.equal(func,merchantDocument);if(args.length>1){assert.deepEqual(target.documentIds,['FAKE-c024-doc']);t.acts.push(args[1].action);}
      const result=structuredClone(await p.fn(...args));if(args.length>1)t.replies.push(result);return [{frameId:0,documentId:'FAKE-c024-doc',result}];}}};
  const store={async get(k){assert.equal(k,TASK_KEY);return t.row?structuredClone(t.row):null;},async put(k,s){assert.equal(k,TASK_KEY);t.row=structuredClone(s);}};
  const port=new ChromePort(api,7,{authorized:true,initialSequence:stored?.lastRead??0,pending:stored?.pending??null});port.wait=async()=>{};
  let n=0;t.job=new PurchaseJob({store,port,now:()=>100000,id:()=>'FAKE-c024-id-'+(++n),maxSteps,onState:s=>t.states.push(s)});
  t.run=()=>t.job.run(plan,{tabId:7,planDigest:'FAKE-c024-digest'});return t;
}
// A preserved task whose checkout click was sent from a proved one-unit bag, with that bag's quote and history.
const afterCheckout=()=>({schema:'applebuy-purchase-job/v1',taskId:'FAKE-c024-task',plan:structuredClone(plan),planDigest:'FAKE-c024-digest',tabId:7,state:'NEEDS_VERIFICATION',reason:'mutation-transport-lost; reconcile before proceeding',lastRead:3,lastPhase:'BAG',lastDocumentId:'FAKE-c024-bag',entryDocumentId:'FAKE-c024-entry',expiresAt:900000,initialDates:null,dateCursor:0,floors:{},rejected:[],refusals:0,pending:{id:'FAKE-c024-checkout',action:'checkout',documentId:'FAKE-c024-bag',beforePhase:'BAG',deadline:99000},finalIntent:null,orderRefHash:null,acceptedSlot:null,bagAddStarted:true,resourceWritten:true,untouchedFailures:0,untouchedStreak:0,quotedCny:9999,history:[{event:'FAKE-c024-bag-proved-one-unit'}]});
// No emitted status is an order confirmation, an exhaustion or any stock conclusion.
const noVerdict=t=>assert.ok(t.states.every(s=>!['CONFIRMED_UNPAID','EXHAUSTED','NOT_READY'].includes(s.state)&&!/stock|exhaust|availability/i.test(s.reason??'')),JSON.stringify(t.states));

for(const [name,o] of [['the observed layout without quantity',{}],['an explicit two',{extra:[qty('2')]}],['an explicit zero',{extra:[qty('0')]}],['a total above the cap',{amount:'RMB 10,000',extra:[qty('1')]}],['a zero total',{amount:'RMB 0',extra:[qty('1')]}],['another model',{product:'iPhone 18 Pro Max 256GB 黑色',extra:[qty('1')]}]])
  test('C024 job at FULFILLMENT with '+name+' stops before any pickup/store/slot/order command and claims no stock result',async()=>{
    const p=page(o),t=job(p),r=await t.run();
    assert.equal(r.state,'BLOCKED');assert.equal(r.reason,'pickup-conditions-not-verified');assert.equal(r.lastPhase,'FULFILLMENT');assert.equal(r.pending,null);
    assert.deepEqual(t.acts,[]);assert.equal(p.pickup.clicks,0);noVerdict(t);
  });
for(const [name,o] of [['the observed layout without quantity',{}],['an explicit unit but no current total (only the old bag quote)',{bar:false,extra:[qty('1')]}]])
  test('C024 a sent checkout reaching FULFILLMENT with '+name+' stays unconfirmed; the old bag proof is never borrowed',async()=>{
    const p=page(o),before=afterCheckout(),t=job(p,before),r=await t.run();
    assert.equal(r.state,'NEEDS_VERIFICATION');assert.equal(r.reason,'mutation-result-unconfirmed; no automatic repeat');assert.deepEqual(r.pending,before.pending);
    assert.equal(r.quotedCny,9999);assert.deepEqual(r.history,before.history);assert.deepEqual(t.acts,[]);assert.equal(p.pickup.clicks,0);noVerdict(t);
  });
test('C024 interface positive: an explicit synthetic unit with the current total reconciles the checkout and sends one pickup choice',async()=>{
  const p=page({extra:[qty('1')]}),t=job(p,afterCheckout(),3),r=await t.run();
  assert.deepEqual(t.acts,['selectPickup']);assert.deepEqual(t.replies,[{delivered:true}]);assert.equal(p.pickup.clicks,1);assert.equal(p.pickup.checked,true);
  // Step 1 reconciles the checkout, step 2 sends pickup, step 3 reconciles pickup from fresh evidence; the bound then stops.
  assert.equal(r.pending,null);assert.equal(r.state,'NEEDS_VERIFICATION');assert.equal(r.reason,'step-bound-reached');assert.equal(r.lastPhase,'FULFILLMENT');noVerdict(t);
});
test('C024 a conflicting checked store makes every pickup attempt positively untouched until the bounded human stop',async()=>{
  const p=page({extra:[qty('1'),store('Apple FAKE 其他门店',true)]}),t=job(p),r=await t.run();
  assert.deepEqual(t.acts,['selectPickup','selectPickup','selectPickup','selectPickup']);assert.ok(t.replies.every(x=>x.delivered===false&&x.touched===false));
  assert.equal(p.pickup.clicks,0);assert.equal(r.state,'NEEDS_VERIFICATION');assert.equal(r.reason,'repeated-untouched-failures; human check required');assert.equal(r.pending,null);noVerdict(t);
});
