// Codex independent review regressions. Synthetic merchant evidence, no Apple traffic.
// Claude must not edit this file to obtain acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {PurchaseJob,TASK_KEY} from '../web/checkout-connector/job.js';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
import {ChromePort} from '../web/checkout-connector/chrome-port.js';

const plan={schema:'applebuy-intent/v1',product:{model:'iPhone Duo',capacity:'256GB',color:'星光白色'},quantity:1,maxTotalCny:15999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝'};
const purchase={...plan.product,quantity:1,totalCny:15999,store:plan.stores[0],fulfillment:'pickup',itemVerified:true,verified:true};
const slot={date:'10月23日',start:'21:15',end:'21:30',verified:true};
const terms='https://www.apple.com.cn/shop/open/salespolicies',hash='a'.repeat(64);
function observation(phase,extra={}){return {schema:'applebuy-merchant-read/v1',phase,documentId:'doc',verifiedStep:true,purchase:structuredClone(purchase),continueAvailable:true,...extra};}
function slots(extra={}){return observation('SLOTS',{listComplete:true,generation:1,dates:['10月23日','10月24日','10月25日'].map((label,i)=>({label,ref:'date:'+i,enabled:true})),selectedDate:'10月23日',times:[{ref:'time:1',start:'21:15',end:'21:30',enabled:true}],...extra});}
function harness(initial,handler=()=>({delivered:true}),seed=null){
  let time=100000,seq=seed?.lastRead??0,serial=0;
  const h={current:initial,actions:[],lookups:0,order:null};
  const store={row:seed,async get(k){assert.equal(k,TASK_KEY);return structuredClone(this.row);},async put(k,v){assert.equal(k,TASK_KEY);this.row=structuredClone(v);}};
  const port={async observe(){return {...structuredClone(h.current),seq:++seq};},async act(c){h.actions.push(structuredClone(c));return handler(c,h);},async lookupOrder(){h.lookups++;return h.order??{state:'unknown',independent:false};},async wait(n){time+=n;}};
  const job=new PurchaseJob({store,port,now:()=>time,id:()=>`review-${++serial}`,maxSteps:100});
  Object.assign(h,{store,port,job,advance:n=>{time+=n;},run:grant=>job.run(plan,{tabId:7,planDigest:'review-digest',grant})});return h;
}
class Element {
  constructor(text,tag='DIV'){Object.assign(this,{textContent:text,tagName:tag,attrs:{},isConnected:true,parentElement:null,hidden:false,disabled:false,checked:false,labels:[],options:[],clicks:0});}
  getAttribute(k){return this.attrs[k]??null;} hasAttribute(k){return Object.hasOwn(this.attrs,k);} closest(){return null;}
  click(){this.clicks++;if(this.tagName==='INPUT')this.checked=true;this.onClick?.();}
  dispatchEvent(e){this.onEvent?.(e);return true;}
  get selectedOptions(){return this.options.filter((o,i)=>o.selected||i===this.selectedIndex);} checkValidity(){return true;}
}
function dom({texts,radios=[],buttons=['继续填写取货详情'],title='购买 iPhone Duo',publicPro=false}={}){
  const nodes=texts.map(t=>new Element(t)),rs=radios.map(([t,checked])=>Object.assign(new Element(t,'INPUT'),{checked})),btn=buttons.map(t=>new Element(t,'BUTTON'));
  const h1=new Element(title,'H1'),select=new Element('可选时段','SELECT');select.options=[new Element('可选时段','OPTION'),new Element('21:15 - 21:30','OPTION')];select.selectedIndex=0;
  const main=new Element('');main.querySelector=s=>s==='h1'?h1:null;
  main.querySelectorAll=s=>s.startsWith('button')?btn:s.startsWith('input[type="radio"]')?rs:s==='select'?(publicPro?[]:[select]):s==='h1,h2,h3,p,span,div'?[h1,...nodes]:[];
  const document={querySelector:()=>main,querySelectorAll:()=>[]};
  const context=vm.createContext({document,location:{href:publicPro?'https://www.apple.com.cn/shop/buy-iphone/iphone-18-pro/mjt74ch/a':'https://secure6.www.apple.com.cn/shop/checkout'},URL,TextEncoder,crypto:webcrypto,Date,HTMLInputElement:Element,Event:class {constructor(type){this.type=type;}},getComputedStyle:e=>({display:e.hidden?'none':'block',visibility:'visible'})});
  const fn=vm.runInContext('('+merchantDocument.toString()+')',context);
  return {read:p=>fn(p??plan),rs,btn,select};
}
const matching=['iPhone Duo 256GB 星光白色','数量：1','总计：RMB 15,999','取货地点：Apple 大连恒隆广场','店内取货'];

test('C012 F-A: container listing two stores cannot verify the unchecked allowed store',async()=>{
  const f=dom({texts:[...matching.slice(0,3),'取货门店 Apple 大连百年城 Apple 大连恒隆广场','店内取货'],radios:[['Apple 大连百年城',true],['Apple 大连恒隆广场',false],['10月23日',true]]});
  const o=await f.read();assert.equal(o.purchase.verified,false);assert.equal(o.purchase.store,null);
});
test('C012 F-A: conflicting checked store overrides otherwise matching labelled prose',async()=>{
  const f=dom({texts:matching,radios:[['Apple 大连百年城',true],['Apple 大连恒隆广场',false],['10月23日',true]]});
  assert.equal((await f.read()).purchase.verified,false);
});
function advanceToReview(c,h){
  if(c.action==='addBag')h.current=observation('ACCESSORIES');
  if(c.action==='viewBag')h.current=observation('BAG');
  if(c.action==='checkout')h.current=slots();
  if(c.action==='chooseSlot')h.current=observation('DETAILS',{acceptedSlot:slot});
  if(c.action==='fillDetails')h.current=observation('PAYMENT',{paymentMethod:'支付宝'});
  if(c.action==='continuePayment')h.current=observation('REVIEW',{paymentMethod:'支付宝',extras:false,existingOrdersChecked:true,slotSummary:slot,termsLinks:[terms]});
  return {delivered:true};
}
test('C012 F-B: return to VARIANT after final-review human gate cannot add again',async()=>{
  const h=harness(observation('VARIANT',{variantVerified:true,quotedCny:15999}),advanceToReview);
  await h.run();assert.equal(h.store.row.lastPhase,'REVIEW');assert.equal(h.store.row.pending,null);assert.equal(h.actions.filter(c=>c.action==='addBag').length,1);
  h.current=observation('VARIANT',{variantVerified:true,quotedCny:15999});await h.run();assert.equal(h.actions.filter(c=>c.action==='addBag').length,1);
});
test('C012 F-B: restart on VARIANT after final-review human gate cannot add again',async()=>{
  const h=harness(observation('VARIANT',{variantVerified:true,quotedCny:15999}),advanceToReview);await h.run();assert.equal(h.store.row.pending,null);
  const r=harness(observation('VARIANT',{variantVerified:true,quotedCny:15999}),advanceToReview,h.store.row);await r.run();assert.equal(r.actions.filter(c=>c.action==='addBag').length,0);
});
test('C012 F-C: expired unknown final still performs read-only reconciliation with no send',async()=>{
  const seed=harness(slots(),()=>{throw Error('transport unknown');});await seed.run();
  const r=harness(observation('REVIEW',{paymentMethod:'支付宝',extras:false,existingOrdersChecked:true,slotSummary:slot,termsLinks:[terms]}),(c,h)=>{h.current=observation('ORDER_RECEIPT',{receiptVerified:true,orderRefHash:hash});throw Error('lost final reply');},seed.store.row);
  r.store.row.pending=null;r.store.row.acceptedSlot=slot;
  const grant={id:'grant',taskId:r.store.row.taskId,planDigest:'review-digest',documentId:'doc',termsUrl:terms,termsAccepted:true,existingOrdersChecked:true,noExtras:true,expiry:120000};
  await r.run(grant);assert.equal(r.actions.filter(c=>c.action==='submitOrder').length,1);r.advance(1800001);
  const before=r.actions.length;await r.run();assert.ok(r.lookups>=1,'expiry must not suppress read-only final reconciliation');assert.equal(r.actions.length,before);
});
test('C012 F-D: disabled initial date is excluded from first three genuinely offered dates',async()=>{
  const dates=['10月22日','10月23日','10月24日','10月25日'].map((label,i)=>({label,ref:'date:'+i,enabled:i!==0}));
  const h=harness(slots({dates}),(c,h)=>{h.current=observation('AUTH');return {delivered:true};});await h.run();assert.deepEqual(h.store.row.initialDates,['10月23日','10月24日','10月25日']);
});
test('C012 F-E: positively known untouched response clears pending instead of permanent unknown',async()=>{
  const h=harness(slots(),(c,h)=>{h.current=observation('AUTH');return {delivered:false,touched:false,reason:'OperationEvidenceChanged'};});await h.run();assert.equal(h.store.row.pending,null);
});
test('C012 F-H: pause after final write-ahead reports no dispatch when act was never called',async()=>{
  const seed=harness(slots(),()=>{throw Error('unknown');});await seed.run();
  const h=harness(observation('REVIEW',{paymentMethod:'支付宝',extras:false,existingOrdersChecked:true,slotSummary:slot,termsLinks:[terms]}),()=>({delivered:true}),seed.store.row);
  h.store.row.pending=null;h.store.row.acceptedSlot=slot;
  const put=h.store.put.bind(h.store);h.store.put=async(k,v)=>{await put(k,v);if(v.pending?.action==='submitOrder')h.job.pause();};
  await h.run({id:'grant',taskId:h.store.row.taskId,planDigest:'review-digest',documentId:'doc',termsUrl:terms,termsAccepted:true,existingOrdersChecked:true,noExtras:true,expiry:120000});
  assert.equal(h.actions.length,0);assert.notEqual(h.store.row.finalIntent?.sent,true,'known pre-send pause cannot claim sent');
});
test('C012 F-I: human no-extras grant cannot replace missing merchant no-extras evidence',async()=>{
  const raw={schema:'applebuy-merchant-read/v1',phase:'REVIEW',purchase,extras:null,termsLinks:[terms],dates:[],times:[]};
  const api={tabs:{async get(){return {url:'https://secure6.www.apple.com.cn/shop/checkout'};}},permissions:{async contains(){return true;}},scripting:{async executeScript(){return [{frameId:0,documentId:'doc',result:raw}];}}};
  const p=new ChromePort(api,7,{reviewGrant:{documentId:'doc',expiry:Date.now()+120000,noExtras:true,existingOrdersChecked:true}});assert.notEqual((await p.observe(plan)).extras,false);
});
test('C012 F-J: two distinct identical quantity lines cannot collapse into single-item proof',async()=>{
  const o=await dom({texts:[...matching,'数量：1'],buttons:['安全结账']}).read();assert.equal(o.purchase.itemVerified,false);
});
test('C012 F-K: explicit unselected pickup and checked shipping cannot be overridden by generic pickup prose',async()=>{
  const o=await dom({texts:matching,radios:[['我要取货',false],['送货上门',true],['Apple 大连恒隆广场',true],['10月23日',true]]}).read();
  assert.equal(o.purchase.verified,false);assert.notEqual(o.purchase.fulfillment,'pickup');
});
