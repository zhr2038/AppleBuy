// Independent Codex C018 regressions: SYNTHETIC JSON transport/storage permutations only.
// Actual human Chrome validation failed, but its native per-action cause and installed bytes are unavailable.
// These tests prove order-sensitive source defects; they do not prove Chrome's native serialization order.
// No browser, credentials, real merchant action, native API or network is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
import {ChromePort} from '../web/checkout-connector/chrome-port.js';
import {PurchaseJob,TASK_KEY,VALIDATION_KEY,normalizeIntent,validStored} from '../web/checkout-connector/job.js';

const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{tradeIn:'none',appleCare:'none'}};
const fakeUrl='https://www.apple.com.cn/shop/buy-iphone/iphone-18-pro';
const noTrade='不折抵换购',noCare='不加 AppleCare+ 服务计划';
function reordered(value){
  if(Array.isArray(value))return value.map(reordered); // Array ordering is intentionally unchanged.
  if(value!==null&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,reordered(value[k])]));
  return value;
}
class El{
  constructor(text,tag='DIV'){Object.assign(this,{textContent:text,tagName:tag,attrs:{},isConnected:true,parentElement:null,hidden:false,disabled:false,checked:false,labels:[],clicks:0});}
  getAttribute(k){return this.attrs[k]??null;} hasAttribute(k){return Object.hasOwn(this.attrs,k);} closest(){return null;}
  click(){assert.equal(this.disabled,false,'disabled fake controls cannot be forced');this.clicks++;if(this.tagName==='INPUT')this.checked=true;this.onClick?.();}
}
function fakePublic(){
  const title=new El('购买 iPhone 18 Pro','H1');
  const model=Object.assign(new El('iPhone 18 Pro 6.3 英寸显示屏 RMB 9,999','INPUT'),{checked:true});
  const color=Object.assign(new El('黑色','INPUT'),{checked:true});
  const capacity=Object.assign(new El('256GB RMB 9,999','INPUT'),{checked:true});
  const trade=new El(noTrade,'INPUT'),care=Object.assign(new El(noCare,'INPUT'),{disabled:true}),bag=Object.assign(new El('添加到购物袋','BUTTON'),{disabled:true});
  trade.onClick=()=>{care.disabled=false;};care.onClick=()=>{bag.disabled=!(trade.checked&&care.checked);};
  const radios=[model,color,capacity,trade,care],main=new El('');
  main.querySelector=s=>s==='h1'?title:null;
  main.querySelectorAll=s=>s.startsWith('button')?[bag]:s.startsWith('input[type="radio"]')?radios:s==='h1,h2,h3,p,span,div'?[title]:[];
  const context=vm.createContext({document:{querySelector:()=>main,querySelectorAll:()=>[]},location:{href:fakeUrl},URL,TextEncoder,crypto:webcrypto,Date,HTMLInputElement:El,Event:class{},getComputedStyle:()=>({display:'block',visibility:'visible'})});
  const fn=vm.runInContext('('+merchantDocument.toString()+')',context);
  return {trade,care,bag,radios,fn:async(...args)=>structuredClone(await fn(...args))};
}
function fakeApi(page,{permute=false,drift=false}={}){
  const actions=[];
  return {actions,api:{tabs:{async get(){return {url:fakeUrl};}},permissions:{async contains(){return true;}},scripting:{async executeScript({world,func,args}){
    assert.equal(world,'ISOLATED');assert.equal(func,merchantDocument);
    if(args[1]){actions.push(args[1].action);if(drift)page.trade.disabled=true;}
    const raw=await page.fn(...args);
    return [{frameId:0,documentId:'FAKE-c018-doc',result:permute?reordered(raw):raw}];
  }}}};
}
function store({permute=false}={}){
  const rows={},gets=[],puts=[];
  return {rows,gets,puts,async get(k){gets.push(k);const v=structuredClone(rows[k]??null);return permute?reordered(v):v;},async put(k,v){puts.push(k);rows[k]=permute?reordered(structuredClone(v)):structuredClone(v);}};
}
function command(expected){return {id:'FAKE-c018-choice',taskId:'FAKE-c018-task',planDigest:'FAKE-c018-digest',documentId:'FAKE-c018-doc',action:'configureProduct',choice:noTrade,plan:normalizeIntent(plan),authorized:true,structured:true,expected:JSON.stringify(expected)};}

test('C018 positive control: unchanged insertion-order evidence configures once and stops before Add to Bag',async()=>{
  const page=fakePublic(),api=fakeApi(page),s=store(),port=new ChromePort(api.api,7,{mode:'public-config',authorized:true});
  const r=await new PurchaseJob({store:s,port}).run(plan,{tabId:7,planDigest:'FAKE-c018-digest',mode:'public-config'});
  assert.equal(r.state,'VALIDATED');assert.equal(page.trade.clicks,1);assert.equal(page.care.clicks,1);assert.equal(page.bag.clicks,0);
  assert.ok(s.puts.every(k=>k===VALIDATION_KEY));assert.equal(s.rows[TASK_KEY],undefined);
});

test('C018 transport: recursively permuted object keys with identical field values must still validate once',async()=>{
  const page=fakePublic(),api=fakeApi(page,{permute:true}),s=store(),port=new ChromePort(api.api,7,{mode:'public-config',authorized:true});
  const r=await new PurchaseJob({store:s,port}).run(plan,{tabId:7,planDigest:'FAKE-c018-digest',mode:'public-config'});
  assert.equal(r.state,'VALIDATED','object key order cannot substitute for a changed merchant fact; '+JSON.stringify({reason:r.reason,untouched:r.untouchedFailures,history:r.history}));
  assert.equal(page.trade.clicks,1);assert.equal(page.care.clicks,1);assert.equal(page.bag.clicks,0);
  assert.deepEqual(api.actions,['configureProduct','configureProduct']);assert.equal(r.untouchedFailures,0);
  assert.ok(s.puts.every(k=>k===VALIDATION_KEY));assert.equal(s.rows[TASK_KEY],undefined);
});

test('C018 stale-control negative control: permuted keys cannot mask a disabled choice; nothing is clicked',async()=>{
  const page=fakePublic(),api=fakeApi(page,{permute:true,drift:true}),s=store(),port=new ChromePort(api.api,7,{mode:'public-config',authorized:true});
  const r=await new PurchaseJob({store:s,port,hydrationMs:0}).run(plan,{tabId:7,planDigest:'FAKE-c018-digest',mode:'public-config'});
  assert.equal(r.state,'NOT_READY');assert.equal(r.untouchedFailures,1);assert.equal(page.trade.clicks+page.care.clicks+page.bag.clicks,0);
  assert.equal(r.history[0].reason,'OperationEvidenceChanged');assert.equal(r.pending,null);
});

for(const [label,mutate] of [
  ['changed phase',x=>{x.phase='VARIANT';}],
  ['changed next-choice state',x=>{x.nextChoice.state='disabled';}],
  ['different array ordering',x=>{x.needsSelection.reverse();}],
  ['null changed to zero',x=>{x.quotedCny=0;}],
  ['boolean changed to number',x=>{x.variantVerified=0;}],
  ['missing field',x=>{delete x.receiptVerified;}],
  ['extra field',x=>{x.FAKE_extraEvidence=true;}]
])test('C018 evidence negative control: '+label+' stays positively untouched',async()=>{
  const page=fakePublic(),observed=await page.fn(plan),expected=reordered(observed);mutate(expected);
  const reply=await page.fn(plan,command(expected));
  assert.equal(reply.delivered,false);assert.equal(reply.touched,false);assert.equal(reply.reason,'OperationEvidenceChanged');
  assert.equal(page.trade.clicks+page.care.clicks+page.bag.clicks,0);
});

function jobHarness(s,{phase='AUTH',tabId=7,planValue=plan,failAct=false}={}){
  let sequence=Math.max(0,...Object.values(s.rows).map(x=>x?.lastRead??0)),serial=0;
  const h={observes:0,acts:0,lookups:0};
  const port={async observe(){h.observes++;return {schema:'applebuy-merchant-read/v1',documentId:'FAKE-c018-doc',seq:++sequence,phase,verifiedStep:phase!=='AUTH',variantVerified:phase==='VARIANT',quotedCny:9999,nextChoice:null};},async act(){h.acts++;if(failAct)throw Error('FAKE lost result');return {delivered:true};},async lookupOrder(){h.lookups++;return {state:'unknown',independent:false};}};
  h.job=new PurchaseJob({store:s,port,id:()=>`FAKE-c018-${++serial}`,maxPolls:0});
  h.run=()=>h.job.run(planValue,{tabId,planDigest:'FAKE-c018-digest'});return h;
}

test('C018 persistence: semantically identical recursively reordered plan remains bound to its original task',async()=>{
  const s=store({permute:true}),first=jobHarness(s);assert.equal((await first.run()).state,'NEEDS_USER');
  const before=structuredClone(s.rows[TASK_KEY]);assert.equal(validStored(before),true);
  const again=jobHarness(s),r=await again.run();assert.equal(r.state,'NEEDS_USER');assert.equal(r.reason,'auth');
  assert.equal(again.observes,1);assert.equal(again.acts,0);assert.equal(r.taskId,before.taskId);assert.equal(r.planDigest,before.planDigest);
});

test('C018 persistence: reordered unknown Add to Bag is reconciled without repetition or history reset',async()=>{
  const s=store({permute:true}),first=jobHarness(s,{phase:'VARIANT',failAct:true}),initial=await first.run();
  assert.equal(initial.state,'NEEDS_VERIFICATION');assert.equal(initial.pending.action,'addBag');assert.equal(first.acts,1);
  const pending=structuredClone(initial.pending),again=jobHarness(s,{phase:'VARIANT'}),r=await again.run();
  assert.equal(r.state,'NEEDS_VERIFICATION');assert.match(r.reason,/no automatic repeat/);assert.equal(again.acts,0);
  assert.deepEqual(r.pending,pending);assert.equal(r.bagAddStarted,true);assert.equal(r.resourceWritten,true);assert.equal(r.taskId,initial.taskId);
});

test('C018 persistence: reordered confirmed unpaid history is returned without observation or a second execution',async()=>{
  const s=store({permute:true});await jobHarness(s).run();
  Object.assign(s.rows[TASK_KEY],{state:'CONFIRMED_UNPAID',bagAddStarted:true,resourceWritten:true,finalIntent:{id:'FAKE-c018-final',sent:true},pending:null,orderRefHash:'a'.repeat(64)});
  const old=structuredClone(s.rows[TASK_KEY]);assert.equal(validStored(old),true);
  const again=jobHarness(s),r=await again.run();assert.equal(r.state,'CONFIRMED_UNPAID');
  assert.equal(again.observes+again.acts+again.lookups,0);assert.deepEqual(s.rows[TASK_KEY],old);
});

for(const [label,change] of [
  ['different tab',()=>({tabId:8})],
  ['different valid model',()=>({planValue:{...plan,product:{model:'iPhone Duo',capacity:'256GB',color:'星光白色'},maxTotalCny:15999}})],
  ['different allowed price cap',()=>({planValue:{...plan,maxTotalCny:9998}})]
])test('C018 binding negative control: '+label+' remains blocked and retains unknown history',async()=>{
  const s=store({permute:true}),first=jobHarness(s,{phase:'VARIANT',failAct:true}),initial=await first.run();
  const pending=structuredClone(initial.pending),again=jobHarness(s,change()),r=await again.run();
  assert.equal(r.state,'BLOCKED');assert.equal(r.reason,'existing-task-binding-differs');assert.equal(again.observes+again.acts,0);
  assert.deepEqual(r.pending,pending);assert.equal(r.taskId,initial.taskId);assert.equal(r.resourceWritten,true);
});
