// C028-R1 implementation tests (Claude). FAKE DOM and FAKE Chrome API only: structural anchors follow the observed shape,
// every extra text, quantity, event and mutation is synthetic. No browser, account, network, real bag/order or permission.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
import {ChromePort} from '../web/checkout-connector/chrome-port.js';
import {PurchaseJob} from '../web/checkout-connector/job.js';

const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{tradeIn:'none',appleCare:'none'}};
const TITLE='iPhone 18 Pro 256GB 黑色';
// A small tree DOM: textContent is the element's own text followed by its children, as a consistent document would be.
class El{
  constructor(tag='DIV',text='',attrs={}){Object.assign(this,{tagName:tag.toUpperCase(),ownText:text,attrs,children:[],parentElement:null,isConnected:true,hidden:false,disabled:false,checked:false,labels:[],clicks:0,selectedIndex:0});}
  append(...nodes){for(const n of nodes){n.parentElement=this;this.children.push(n);}return this;}
  get textContent(){return this.ownText+this.children.map(n=>n.textContent).join('');}
  get innerText(){return this.textContent;}
  get className(){return this.attrs.class??'';}
  get classList(){return {contains:s=>this.className.split(/\s+/).includes(s)};}
  getAttribute(k){return this.attrs[k]??null;}
  hasAttribute(k){return Object.hasOwn(this.attrs,k);}
  matches(s){return s.split(',').some(x=>simple(this,x.trim()));}
  closest(s){for(let p=this;p;p=p.parentElement)if(p.matches(s))return p;return null;}
  querySelectorAll(s){const out=[];const visit=n=>{for(const c of n.children){if(c.matches(s))out.push(c);visit(c);}};visit(this);return out;}
  querySelector(s){return this.querySelectorAll(s)[0]??null;}
  get options(){return this.querySelectorAll('option');}
  get selectedOptions(){return this.options.filter((o,i)=>i===this.selectedIndex);}
  click(){assert.equal(this.disabled,false);assert.equal(this.hidden,false);this.clicks++;this.onClick?.();}
  dispatchEvent(e){this.onEvent?.(e);return true;}
  checkValidity(){return true;}
}
// Simple selectors only (tag, .class, [attr], [attr="v"], combinations); anything else fails loudly.
function simple(e,s){
  if(s==='*')return true;let ok=true;
  s=s.replace(/\[([\w-]+)(?:=["']?([^\]"']*)["']?)?\]/g,(_,k,v)=>{const a=e.getAttribute(k);ok&&=v===undefined?a!==null:a===v;return '';});
  s=s.replace(/\.([\w-]+)/g,(_,c)=>{ok&&=e.classList.contains(c);return '';});
  assert.match(s,/^[\w-]*$/,'unsupported fake CSS selector');return ok&&(!s||e.tagName===s.toUpperCase());
}
const el=(tag,text='',attrs={})=>new El(tag,text,attrs);

// Generic checkout page (no shipment-group anchors) or the observed one-group shape with its accessible title copy and the
// real-DOM wrapper holding the native option labels. Quantity is a synthetic explicit line.
function page({quantity='1',group=true,nested=false}={}){
  const main=el('MAIN'),summary=el('BUTTON','显示订单摘要： ',{'data-autom':'companionbar-button'}).append(el('SPAN','RMB 9,999'));
  const pickup=el('INPUT','',{type:'radio',name:'FAKE-fulfillment'}),plabel=el('LABEL','我要取货');pickup.labels=[plabel];
  const delivery=el('INPUT','',{type:'radio',name:'FAKE-fulfillment'}),dlabel=el('LABEL','为我送货');delivery.labels=[dlabel];delivery.checked=true;
  pickup.onClick=()=>{pickup.checked=true;delivery.checked=false;};
  main.append(el('H1','你希望如何收到订单商品？'),summary);
  const f={main,pickup};
  if(group){
    f.strip=el('DIV',TITLE,{class:'rs-fulfillment-productstrip-content'});f.copy=el('SPAN',TITLE,{class:'visuallyhidden'});
    f.header=el('H2','',{class:'rs-fullfillment-selector-header'}).append(f.copy);
    const fieldset=el('FIELDSET','',{class:'rs-fulfillment-deliveryoptions'}).append(el('LEGEND','',{class:'rs-fulfillment-selector-title'}).append(f.header));
    f.group=el('DIV','',{class:'rs-fulfillment-shipmentgroup'}).append(el('P','FAKE shipment heading'));
    // nested (synthetic, unobserved): the strip's only text is the legend copy, so the two anchors nest and must count once;
    // the option labels then sit outside the strip. The observed shape keeps strip and fieldset as siblings.
    if(nested){f.strip.ownText='';f.strip.append(fieldset);f.wrapper=el('DIV','',{class:'rs-fulfillment-shipment'}).append(dlabel,delivery,plabel,pickup);f.group.append(f.strip,f.wrapper);}
    else{fieldset.append(dlabel,delivery,plabel,pickup);f.wrapper=el('DIV','',{class:'rs-fulfillment-shipment'}).append(fieldset);f.group.append(f.strip,f.wrapper);}
    main.append(f.group);
  }else main.append(el('DIV',TITLE),plabel,pickup,dlabel,delivery);
  if(quantity!==null)main.append(el('P','数量：'+quantity));
  const document=el('HTML').append(el('BODY').append(main));
  const ctx=vm.createContext({document,location:{href:'https://secure6.www.apple.com.cn/shop/checkout'},URL,TextEncoder,crypto:webcrypto,Date,setTimeout,clearTimeout,HTMLInputElement:El,Event:class{},getComputedStyle:e=>({display:e.hidden?'none':'block',visibility:'visible'})});
  const fn=vm.runInContext('('+merchantDocument.toString()+')',ctx);let n=0;
  Object.assign(f,{fn,read:async()=>structuredClone(await fn(plan)),async command(){return {id:'FAKE-c028-command-'+(++n),taskId:'FAKE-c028-task',authorized:true,structured:true,action:'selectPickup',expected:JSON.stringify(await f.read())};},async send(c){return structuredClone(await fn(plan,c));}});
  return f;
}
async function positive(f){
  const r=await f.read();assert.equal(r.phase,'FULFILLMENT');assert.equal(r.purchase.itemVerified,true);assert.equal(r.purchase.quantity,1);
  assert.equal((await f.send(await f.command())).delivered,true);assert.equal(f.pickup.clicks,1);
}
async function untouched(f){
  const r=await f.read();assert.equal(r.purchase.itemVerified,false);assert.equal(r.purchase.model,null);
  const x=await f.send(await f.command());assert.equal(x.delivered,false);assert.equal(x.touched,false);assert.equal(f.pickup.clicks,0);
}

test('C028-R1 the observed one-group accessible title pair with option labels and explicit1 stays usable',async()=>positive(page()));
test('C028-R1 generic single title line with explicit1 stays usable',async()=>positive(page({group:false})));
test('C028-R1 missing quantity still stops on the observed shape',async()=>{
  const f=page({quantity:null}),r=await f.read();assert.equal(r.purchase.quantity,null);assert.equal(r.purchase.itemVerified,false);
  assert.equal((await f.send(await f.command())).delivered,false);assert.equal(f.pickup.clicks,0);
});
const groupExtras={
  'hidden SPAN inside the group':f=>{const x=el('SPAN',TITLE);x.hidden=true;f.group.append(x);},
  'LABEL beside the delivery options':f=>f.wrapper.append(el('LABEL',TITLE)),
  'bare title in the group heading text':f=>{f.group.ownText=TITLE+' ';},
  'bare title in the option wrapper before the fieldset':f=>{f.wrapper.ownText=TITLE;},
  'bare title in the option wrapper after the fieldset':f=>f.wrapper.append(el('DIV','')).children.at(-1).ownText=TITLE,
  'upper-case title in B directly in main':f=>f.main.append(el('B','IPHONE 18 PRO 256GB 黑色')),
  'other model without capacity in EM':f=>f.main.append(el('EM','iPhone 18 Pro Max 黑色')),
  'TD row outside the group':f=>f.main.append(el('TABLE').append(el('TR').append(el('TD',TITLE)))),
};
for(const [name,add] of Object.entries(groupExtras))test('C028-R1 extra product text cannot borrow the strip/copy proof: '+name,async()=>{const f=page();add(f);await untouched(f);});
const genericExtras={
  'LI title':f=>f.main.append(el('LI',TITLE)),
  'long P with filler before the title':f=>f.main.append(el('P','FAKE filler '.repeat(20)+TITLE)),
  'hidden duplicate DIV':f=>{const x=el('DIV',TITLE);x.hidden=true;f.main.append(x);},
  'STRONG inside the single title line wrapper':f=>f.main.children.find(e=>e.ownText===TITLE).append(el('STRONG',' ')),
};
for(const [name,add] of Object.entries(genericExtras))test('C028-R1 generic page extra product text stays unverified: '+name,async()=>{
  const f=page({group:false});add(f);
  if(name.startsWith('STRONG')){await positive(f);return;} // a non-product child inside the one title line is not another mention
  await untouched(f);
});
test('C028-R1 nested strip/copy anchors count once, so one further title is still detected',async()=>{
  await positive(page({nested:true}));
  const f=page({nested:true});f.main.append(el('LI',TITLE));await untouched(f);
});
test('C028-R1 extra text added after the command was prepared makes the prepared pickup stale and untouched',async()=>{
  const f=page(),c=await f.command();f.header.append(el('STRONG',TITLE));
  const r=await f.send(c);assert.equal(r.delivered,false);assert.equal(r.touched,false);assert.equal(f.pickup.clicks,0);
});
test('C028-R1 PurchaseJob over the fake ChromePort stops before any action when extra text borrows the copy ancestor',async()=>{
  const f=page();f.header.ownText=TITLE;const acts=[];let row=null;
  const api={tabs:{async get(){return {url:'https://secure6.www.apple.com.cn/shop/checkout'};}},permissions:{async contains(){return true;}},scripting:{async executeScript({target,args}){
    if(args.length>1){assert.deepEqual(target.documentIds,['FAKE-c028-document']);acts.push(args[1].action);}
    return [{frameId:0,documentId:'FAKE-c028-document',result:structuredClone(await f.fn(...args))}];}}};
  const store={async get(){return row?structuredClone(row):null;},async put(k,s){row=structuredClone(s);}};
  const port=new ChromePort(api,7,{authorized:true,initialSequence:0,pending:null});port.wait=async()=>{};let i=0;
  const r=await new PurchaseJob({store,port,now:()=>100000,id:()=>'FAKE-c028-id-'+(++i),maxSteps:2}).run(plan,{tabId:7,planDigest:'FAKE-c028-digest'});
  assert.equal(r.state,'BLOCKED');assert.equal(r.reason,'pickup-conditions-not-verified');assert.deepEqual(acts,[]);assert.equal(f.pickup.clicks,0);
});
