// C-012-R1 checkout implementation tests (Claude).
// SYNTHETIC reproduction of the publicly observed Pro configuration dependency (Codex, October 2): model/color/capacity
// selected, `不折抵换购` enabled and unchecked, no-AppleCare and Add to Bag disabled. The production decoder/actions run
// serialized in a VM over a fake native-like DOM, through the production ChromePort and PurchaseJob. Nothing here
// establishes live Apple checkout, refusal, timing or extension-installation contracts. Labels marked 合成 are test-only.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {PurchaseJob,TASK_KEY,VALIDATION_KEY,normalizeIntent,validIntent,validStored,retirable} from '../web/checkout-connector/job.js';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
import {ChromePort} from '../web/checkout-connector/chrome-port.js';

const pro={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{tradeIn:'none',appleCare:'none'}};
const duo={...pro,product:{model:'iPhone Duo',capacity:'256GB',color:'星光白色'},maxTotalCny:15999};
const NO_TRADE_IN='不折抵换购',NO_APPLECARE='不加 AppleCare+ 服务计划';
const PRO_URL='https://www.apple.com.cn/shop/buy-iphone/iphone-18-pro/mjt74ch/a';
let time=1000000,serial=0;

class El {
  constructor(text,tag='DIV'){Object.assign(this,{textContent:text,tagName:tag,attrs:{},isConnected:true,parentElement:null,hidden:false,disabled:false,checked:false,labels:[],options:[],clicks:0});}
  getAttribute(k){return this.attrs[k]??null;} hasAttribute(k){return Object.hasOwn(this.attrs,k);} closest(){return null;}
  // Native-like: a disabled control ignores clicks; a radio unchecks the rest of its group.
  click(){this.clicks++;if(this.disabled)return;if(this.tagName==='INPUT'){for(const r of this.group??[])r.checked=false;this.checked=true;}this.onClick?.();}
  dispatchEvent(){return true;}
  get selectedOptions(){return this.options.filter((o,i)=>o.selected||i===this.selectedIndex);} checkValidity(){return true;}
}
const radio=(label,{checked=false,disabled=false,name=null}={})=>{const r=Object.assign(new El(label,'INPUT'),{checked,disabled});if(name)r.attrs.name=name;return r;};
const button=(label,disabled=false)=>Object.assign(new El(label,'BUTTON'),{disabled});
function mount(page){
  const main=new El('');
  main.querySelector=s=>s==='h1'?page.title:null;
  main.querySelectorAll=s=>s.startsWith('button')?page.buttons:s.startsWith('input[type="radio"]')?page.radios:s==='select'?(page.selects??[]):s==='h1,h2,h3,p,span,div'?[page.title,...page.texts.map(t=>new El(t))]:[];
  const location={get href(){return page.url;}};
  const context=vm.createContext({document:{querySelector:()=>main,querySelectorAll:()=>[]},location,URL,TextEncoder,crypto:webcrypto,Date,HTMLInputElement:El,Event:class {constructor(t){this.type=t;}},getComputedStyle:e=>({display:e.hidden?'none':'block',visibility:'visible'})});
  const fn=vm.runInContext('('+merchantDocument.toString()+')',context);
  // Codex quota repair: Chrome returns structured-cloned values across the document boundary.
  // Keep strict assertions while removing VM-realm prototype artifacts from the emulated transport.
  return async(...args)=>structuredClone(await fn(...args));
}
// The exact observed initial dependency on the public Pro page.
function publicPage({hydrated=true}={}){
  const model=[radio('iPhone 18 Pro',{checked:true}),radio('iPhone 18 Pro Max')];model.forEach(r=>r.group=model);
  const spec=[...model,radio('黑色',{checked:true}),radio('256GB RMB 9,999',{checked:true})];
  const tradeIn=radio(NO_TRADE_IN),appleCare=radio(NO_APPLECARE,{disabled:true}),bag=button('添加到购物袋',true);
  tradeIn.onClick=()=>{appleCare.disabled=false;};
  appleCare.onClick=()=>{bag.disabled=!(tradeIn.checked&&appleCare.checked);};
  const page={url:PRO_URL,title:new El('购买 iPhone 18 Pro','H1'),texts:[],buttons:[bag],radios:[...spec,...(hydrated?[tradeIn,appleCare]:[])],spec,tradeIn,appleCare,bag};
  page.hydrate=()=>{page.radios.push(tradeIn,appleCare);};
  page.configured=()=>{Object.assign(page,{url:PRO_URL,texts:[],buttons:[bag],radios:[...spec,tradeIn,appleCare]});tradeIn.checked=true;appleCare.disabled=false;appleCare.checked=true;bag.disabled=false;};
  return page;
}
function chromeApi(page,{beforeAct,afterAct}={}){
  const fn=mount(page),log=[];
  const api={tabs:{async get(){return {url:page.url};}},permissions:{async contains(){return true;}},scripting:{async executeScript({world,func,args}){
    assert.equal(world,'ISOLATED');assert.equal(func,merchantDocument);
    const command=args[1]??null;log.push(command?{act:command.action,choice:command.choice??null}:{observe:true});
    if(command)await beforeAct?.(command);
    const result=await fn(...args);if(command)await afterAct?.(command,result);
    return [{frameId:0,documentId:'doc',result}];
  }}};
  return {api,log};
}
function memoryStore(rows={}){const s={rows:structuredClone(rows),puts:[],gets:[],async get(k){s.gets.push(k);return structuredClone(s.rows[k]??null);},async put(k,v){s.puts.push(k);s.rows[k]=structuredClone(v);}};return s;}
function realStack(page,{mode='purchase',store=memoryStore(),hooks={},plan=pro}={}){
  const {api,log}=chromeApi(page,hooks);
  const prior=store.rows[mode==='public-config'?VALIDATION_KEY:TASK_KEY];
  const port=new ChromePort(api,7,{authorized:true,mode,initialSequence:prior?.lastRead??0});
  const x={api,log,port,store,waits:0,onWait:null};
  port.wait=async n=>{time+=n;x.waits++;x.onWait?.(x);};
  x.job=new PurchaseJob({store,port,now:()=>time,id:()=>'r1-'+(++serial),maxSteps:40});
  x.run=(opts={})=>x.job.run(plan,{tabId:7,planDigest:'digest',mode,...opts});
  return x;
}
const acts=log=>log.filter(e=>e.act).map(e=>e.act==='configureProduct'?e.choice:e.act);

test('R1 synthetic observed dependency: one validation start selects no trade-in, re-observes, selects newly enabled no-AppleCare, then stops before Add to Bag',async()=>{
  const page=publicPage();
  const first=await new ChromePort(chromeApi(page).api,7,{mode:'observe'}).observe(normalizeIntent(pro));
  assert.equal(first.phase,'ENTRY');assert.deepEqual(first.nextChoice,{choice:NO_TRADE_IN,state:'enabled'});assert.deepEqual(first.needsSelection,[NO_TRADE_IN,NO_APPLECARE]);assert.equal(first.configuration.addToBag,'disabled');assert.equal(first.variantVerified,false);
  const x=realStack(page,{mode:'public-config'});
  const r=await x.run();
  assert.equal(r.state,'VALIDATED');assert.match(r.reason,/before Add to Bag/);
  assert.deepEqual(acts(x.log),[NO_TRADE_IN,NO_APPLECARE]);
  const at=x.log.map((e,i)=>e.act?i:-1).filter(i=>i>=0);
  for(const i of at)assert.ok(x.log[i-1].observe,'every choice follows a fresh observation');
  assert.ok(at[1]-at[0]>=3,'the newly enabled choice is observed before it is selected');
  assert.equal(page.tradeIn.checked&&page.appleCare.checked,true);assert.equal(page.bag.disabled,false);assert.equal(page.bag.clicks,0);
  assert.ok(x.store.puts.length>0&&x.store.puts.every(k=>k===VALIDATION_KEY),'validation never writes the purchase task key');assert.equal(x.store.rows[TASK_KEY],undefined);
  const row=x.store.rows[VALIDATION_KEY];assert.equal(row.bagAddStarted,false);assert.equal(row.resourceWritten,false);assert.equal(row.pending,null);
});

test('R1 purchase start configures both no-extras choices, verifies exact spec/quote, adds once; return to VARIANT or restart cannot add again',async()=>{
  const page=publicPage(),view=button('查看购物袋');
  page.bag.onClick=()=>{page.radios=[];page.buttons=[view];};
  // Synthetic bag page with a test-only extra line: merchant extras evidence is true, so checkout is blocked.
  view.onClick=()=>{Object.assign(page,{url:'https://www.apple.com.cn/shop/bag',buttons:[button('结账')],texts:['iPhone 18 Pro 256GB 黑色','数量：1','总计：RMB 9,999','AppleCare+（合成冲突标签）']});};
  const x=realStack(page);
  const r=await x.run();
  assert.equal(r.state,'BLOCKED');assert.equal(r.reason,'bag-conditions-not-verified');
  assert.deepEqual(acts(x.log),[NO_TRADE_IN,NO_APPLECARE,'addBag','viewBag']);
  assert.equal(page.bag.clicks,1);const row=x.store.rows[TASK_KEY];assert.equal(row.bagAddStarted,true);assert.equal(row.quotedCny,9999);assert.equal(row.resourceWritten,true);assert.equal(row.pending,null);
  page.configured();
  const again=await x.run();assert.match(again.reason,/bag-addition-already-started/);assert.equal(page.bag.clicks,1);
  const restart=realStack(page,{store:x.store});const after=await restart.run();assert.match(after.reason,/bag-addition-already-started/);assert.equal(page.bag.clicks,1);assert.deepEqual(acts(restart.log),[]);
});

test('R1 Duo prelaunch/approval gate stops even with specification radios selected; no extras labels are invented for Duo',async()=>{
  for(const mode of ['purchase','public-config']){
    const page={url:'https://www.apple.com.cn/shop/buy-iphone/iphone-duo',title:new El('购买 iPhone Duo','H1'),texts:['机型将在获得批准后发售'],buttons:[button('继续',true)],radios:[radio('星光白色',{checked:true}),radio('256GB RMB 15,999',{checked:true})]};
    const x=realStack(page,{mode,plan:duo});const r=await x.run();
    assert.equal(r.state,'NOT_RELEASED');assert.deepEqual(acts(x.log),[]);
  }
});

test('R1 delayed hydration waits a bounded time and then selects; never-hydrated or disabled required options are NOT_READY, never no stock',async()=>{
  const late=publicPage({hydrated:false}),x=realStack(late,{mode:'public-config'});x.onWait=s=>{if(s.waits===3)late.hydrate();};
  assert.equal((await x.run()).state,'VALIDATED');assert.equal(late.tradeIn.clicks,1);assert.equal(late.appleCare.clicks,1);
  const never=publicPage({hydrated:false}),y=realStack(never);const r=await y.run();
  assert.equal(r.state,'NOT_READY');assert.match(r.reason,/required-option-absent/);assert.match(r.reason,/availability not established/);assert.doesNotMatch(r.reason,/stock/i);
  assert.ok(y.waits<=61,'hydration wait is elapsed-time bounded');assert.deepEqual(acts(y.log),[]);
  const off=publicPage();off.tradeIn.disabled=true;const z=realStack(off);const d=await z.run();
  assert.equal(d.state,'NOT_READY');assert.match(d.reason,/required-option-disabled/);assert.equal(off.tradeIn.clicks+off.appleCare.clicks+off.bag.clicks,0);
});

test('R1 duplicate labels and externally selected extras are blocked without any click',async()=>{
  const dup=publicPage();dup.radios.push(radio(NO_TRADE_IN));const x=realStack(dup);const r=await x.run();
  assert.equal(r.state,'BLOCKED');assert.equal(r.reason,'required-option-ambiguous');assert.deepEqual(acts(x.log),[]);
  const ext=publicPage();ext.radios.push(radio('AppleCare+（合成冲突标签）',{checked:true}));const y=realStack(ext);const e=await y.run();
  assert.equal(e.state,'BLOCKED');assert.match(e.reason,/applecare-selected-on-page/);assert.deepEqual(acts(y.log),[]);assert.equal(ext.tradeIn.clicks,0);
});

test('R1 control redrawn between observation and action is a positively untouched failure; nothing is clicked and the task recovers',async()=>{
  const page=publicPage();let redrawn=null;
  const x=realStack(page,{hooks:{beforeAct(){if(redrawn)return;page.tradeIn.isConnected=false;redrawn=radio(NO_TRADE_IN,{disabled:true});page.radios[page.radios.indexOf(page.tradeIn)]=redrawn;}}});
  const r=await x.run();
  assert.equal(page.tradeIn.clicks,0);assert.equal(redrawn.clicks,0);
  assert.equal(r.state,'NOT_READY');assert.equal(r.pending,null);assert.equal(r.untouchedFailures,1);
  assert.deepEqual(r.history.map(h=>[h.event,h.action,h.reason]),[['untouched-not-sent','configureProduct','OperationEvidenceChanged']]);
  assert.equal(retirable(r),true,'public choices only: the task never wrote a merchant mutation');
});

test('R1 transport loss: an unknown choice is never repeated; a choice that did apply is reconciled from current evidence',async()=>{
  const page=publicPage(),x=realStack(page,{hooks:{beforeAct(){throw new Error('transport lost before page');}}});
  const lost=await x.run();assert.equal(lost.state,'NEEDS_VERIFICATION');assert.equal(lost.pending.action,'configureProduct');
  const resume=realStack(page,{store:x.store});const r=await resume.run();
  assert.equal(r.state,'NEEDS_VERIFICATION');assert.match(r.reason,/no automatic repeat/);assert.equal(page.tradeIn.clicks,0);assert.deepEqual(acts(resume.log),[]);
  // Validation run whose reply is lost after the click applied: the next validation run reconciles instead of clicking again.
  const applied=publicPage(),v=realStack(applied,{mode:'public-config',hooks:{afterAct(){throw new Error('reply lost');}}});
  assert.equal((await v.run()).state,'NEEDS_VERIFICATION');assert.equal(applied.tradeIn.clicks,1);
  const w=realStack(applied,{mode:'public-config',store:v.store});assert.equal((await w.run()).state,'VALIDATED');
  assert.equal(applied.tradeIn.clicks,1);assert.deepEqual(acts(w.log),[NO_APPLECARE]);
});

test('R1 pause during write-ahead is recorded not dispatched; resume recovers once and a later run never repeats the add',async()=>{
  const page=publicPage();page.bag.onClick=()=>{Object.assign(page,{radios:[],buttons:[],texts:['以游客身份继续']});};
  const x=realStack(page);let paused=false;const put=x.store.put;x.store.put=async(k,v)=>{await put(k,v);if(v.pending&&!paused){paused=true;x.job.pause();}};
  const p=await x.run();assert.equal(p.state,'PAUSED');assert.equal(p.pending.dispatched,false);assert.equal(page.tradeIn.clicks,0);
  x.job.resume();const r=await x.run();
  assert.equal(r.state,'NEEDS_USER');assert.equal(r.reason,'auth');assert.deepEqual(acts(x.log),[NO_TRADE_IN,NO_APPLECARE,'addBag']);assert.equal(r.pending.action,'addBag');
  page.configured();const again=await realStack(page,{store:x.store}).run();assert.equal(again.state,'NEEDS_VERIFICATION');assert.equal(page.bag.clicks,1);
});

test('R1 observation-only mode touches no task storage and its ChromePort can never act',async()=>{
  const page=publicPage(),{api,log}=chromeApi(page),store=memoryStore();
  const port=new ChromePort(api,7,{authorized:true,mode:'observe'});
  const r=await new PurchaseJob({store,port}).run(pro,{tabId:7,planDigest:'x',mode:'observe'});
  assert.equal(r.state,'OBSERVED');assert.deepEqual(r.nextChoice,{choice:NO_TRADE_IN,state:'enabled'});assert.equal(store.gets.length+store.puts.length,0);
  await assert.rejects(port.act({documentId:'doc',plan:pro,action:'configureProduct',choice:NO_TRADE_IN,id:'a',taskId:'t'}),/NotAuthorized/);
  assert.ok(log.every(e=>e.observe));assert.equal(page.tradeIn.clicks,0);
});

test('R1 public-config ChromePort refuses Add to Bag and later actions before script injection',async()=>{
  const page=publicPage();page.configured();const {api,log}=chromeApi(page);const port=new ChromePort(api,7,{authorized:true,mode:'public-config'});
  const o=await port.observe(normalizeIntent(pro));assert.equal(o.phase,'VARIANT');assert.equal(o.variantVerified,true);assert.equal(o.quotedCny,9999);
  for(const action of ['addBag','checkout','chooseSlot','submitOrder'])await assert.rejects(port.act({documentId:'doc',plan:pro,action,id:'v-'+action,taskId:'t'}),/ValidationModeCannotMutate/);
  assert.ok(log.every(e=>e.observe));assert.equal(page.bag.clicks,0);
});

// Controller-only rules below use synthetic observations; they do not stand in for the decoder.
const purchase={itemVerified:true,verified:true,...pro.product,quantity:1,totalCny:9999,store:pro.stores[0],fulfillment:'pickup'};
const read=(phase,extra={})=>({schema:'applebuy-merchant-read/v1',documentId:'doc',phase,verifiedStep:true,continueAvailable:true,purchase:structuredClone(purchase),...extra});
const slot={date:'10月23日',start:'21:15',end:'21:30',verified:true},terms='https://www.apple.com.cn/shop/open/salespolicies';
const slots=(extra={})=>read('SLOTS',{listComplete:true,generation:1,dates:['10月23日','10月24日','10月25日'].map((label,i)=>({label,ref:'date:'+i,enabled:true})),selectedDate:'10月23日',times:[{ref:'time:1',start:'21:15',end:'21:30',enabled:true}],...extra});
function synthetic(initial,handler=()=>({delivered:true}),rows={}){
  let seq=Math.max(0,...Object.values(rows).map(r=>r?.lastRead??0));
  const h={current:initial,actions:[],lookups:0,waits:0,store:memoryStore(rows),order:null,onWait:null};
  h.port={async observe(){return {...structuredClone(h.current),seq:++seq};},async act(c){h.actions.push(structuredClone(c));return handler(c,h);},async lookupOrder(){h.lookups++;return h.order??{state:'unknown',independent:false};},async wait(n){time+=n;h.waits++;h.onWait?.(h);}};
  h.job=new PurchaseJob({store:h.store,port:h.port,now:()=>time,id:()=>'s-'+(++serial),maxSteps:60});
  h.run=(opts={})=>h.job.run(pro,{tabId:7,planDigest:'digest',...opts});
  return h;
}
const startGrant=(taskId,extra={})=>({id:'start-'+taskId,start:true,taskId,planDigest:'digest',entryDocumentId:'doc',termsUrl:terms,termsAccepted:true,existingOrdersChecked:true,noExtras:true,expiry:time+1200000,...extra});
const review=(extra={})=>read('REVIEW',{paymentMethod:'支付宝',extras:false,existingOrdersChecked:true,slotSummary:slot,termsLinks:[terms],...extra});
function toReview(final){return (c,h)=>{if(c.action==='addBag')h.current=read('ACCESSORIES');if(c.action==='viewBag')h.current=read('BAG');if(c.action==='checkout')h.current=slots();if(c.action==='chooseSlot')h.current=read('DETAILS',{acceptedSlot:slot});if(c.action==='fillDetails')h.current=read('PAYMENT',{paymentMethod:'支付宝'});if(c.action==='continuePayment')h.current=final;if(c.action==='submitOrder')h.current=read('ORDER_RECEIPT');return {delivered:true};};}

test('R1 advance start grant is cleared at any human gate and cannot be reused after intervention',async()=>{
  const h=synthetic(read('AUTH'));const g=startGrant('t1');
  const first=await h.run({grant:g,taskId:'t1'});assert.equal(first.state,'NEEDS_USER');assert.deepEqual(first.revokedGrantIds,[g.id]);
  h.current=read('VARIANT',{variantVerified:true,quotedCny:9999});
  const again=await h.run({grant:g,taskId:'t1'});assert.equal(again.state,'BLOCKED');assert.match(again.reason,/human-intervention/);assert.equal(h.actions.length,0);
});

test('R1 neither the price cap nor a human grant substitutes for merchant no-extras proof at final review',async()=>{
  const cheaper=synthetic(read('VARIANT',{variantVerified:true,quotedCny:9999}),toReview(review({purchase:{...purchase,totalCny:9998}})));
  const blocked=await cheaper.run({grant:startGrant('q1'),taskId:'q1'});
  assert.equal(blocked.state,'BLOCKED');assert.equal(blocked.reason,'final-review-or-existing-order-check-missing');assert.equal(cheaper.actions.filter(c=>c.action==='submitOrder').length,0);
  const unknown=synthetic(read('VARIANT',{variantVerified:true,quotedCny:9999}),toReview(review({extras:null})));
  assert.equal((await unknown.run({grant:startGrant('q2'),taskId:'q2'})).state,'BLOCKED');assert.equal(unknown.actions.filter(c=>c.action==='submitOrder').length,0);
  const exact=synthetic(read('VARIANT',{variantVerified:true,quotedCny:9999}),toReview(review()));
  await exact.run({grant:startGrant('q3'),taskId:'q3'});assert.equal(exact.actions.filter(c=>c.action==='submitOrder').length,1,'positive control');
});

test('R1 retirement only for a task that never wrote a merchant mutation; history is preserved, legacy records are not retirable',async()=>{
  const h=synthetic(read('ENTRY',{needsSelection:['黑色']}),(c,h)=>{h.current=read('ENTRY',{needsSelection:[],selectedProductChoices:[c.choice],continueAvailable:false});return {delivered:true};});
  const r=await h.run();assert.equal(r.state,'NOT_READY');assert.equal(retirable(r),true);
  const retired=await h.job.retire();assert.equal(retired.state,'RETIRED');assert.equal(retired.taskId,r.taskId);
  h.current=read('AUTH');const next=await h.run();assert.notEqual(next.taskId,r.taskId);assert.equal(next.retiredHistory.length,1);assert.equal(next.retiredHistory[0].taskId,r.taskId);assert.equal(validStored(next),true);
  const m=synthetic(slots(),()=>{throw new Error('lost');});await m.run();const before=structuredClone(m.store.rows[TASK_KEY]);
  await assert.rejects(m.job.retire(),/TaskHasMerchantMutationHistory/);assert.deepEqual(m.store.rows[TASK_KEY],before);
  const legacy=structuredClone(r);for(const k of ['bagAddStarted','resourceWritten'])delete legacy[k];assert.equal(retirable(legacy),false);
  const l=synthetic(read('AUTH'),undefined,{[TASK_KEY]:legacy});await assert.rejects(l.job.retire(),/TaskHasMerchantMutationHistory/);
});

test('R1 explicit human tab rebind is read-only reconciliation, works after expiry and cannot add purchase authority',async()=>{
  const h=synthetic(slots(),()=>{throw new Error('lost');});await h.run();
  assert.equal((await h.job.run(pro,{tabId:8,planDigest:'digest'})).state,'BLOCKED');
  time+=1800001;h.current=read('DETAILS',{acceptedSlot:slot});
  const r=await h.job.run(pro,{tabId:8,planDigest:'digest',rebind:true,grant:startGrant(h.store.rows[TASK_KEY].taskId)});
  assert.equal(r.reconcileOnly,true);assert.equal(r.tabId,8);assert.equal(r.pending,null);assert.deepEqual(r.acceptedSlot,slot);assert.match(r.reason,/read-only/);assert.equal(h.actions.length,1);
  assert.equal(r.history.at(-1).event,'human-tab-rebind');assert.equal(r.history.at(-1).fromTabId,7);
  const later=await h.job.run(pro,{tabId:8,planDigest:'digest'});assert.match(later.reason,/read-only/);assert.equal(h.actions.length,1);
  await assert.rejects(synthetic(read('AUTH')).job.run(pro,{tabId:8,planDigest:'digest',rebind:true}),/NoPreservedTaskToRebind/);
});

test('R1 processing waits are elapsed-time and poll-count bounded and do not consume the semantic step budget',async()=>{
  const h=synthetic(read('PROCESSING'));h.job.maxSteps=3;
  const r=await h.run();assert.equal(r.reason,'merchant-processing-time-bound-reached');assert.ok(h.waits>=590&&h.waits<=601,String(h.waits));
  const p=synthetic(read('PROCESSING'));p.job.maxSteps=3;p.onWait=x=>{if(x.waits===200)x.current=read('AUTH');};
  assert.equal((await p.run()).reason,'auth');
  const stuck=synthetic(read('PROCESSING'));stuck.job.maxPolls=100;stuck.port.wait=async()=>{stuck.waits++;};
  assert.equal((await stuck.run()).reason,'merchant-processing-time-bound-reached');assert.equal(stuck.waits,100);
});

test('R1 enabled-date freeze waits for an offered date and repeated untouched failures are bounded',async()=>{
  const none=synthetic(slots({dates:['10月23日','10月24日'].map((label,i)=>({label,ref:'date:'+i,enabled:false}))}));
  const n=await none.run();assert.equal(n.state,'NOT_READY');assert.equal(n.initialDates,null);assert.equal(none.actions.length,0);
  const h=synthetic(slots(),()=>({delivered:false,touched:false,reason:'CurrentControlUnrecognized'}));
  const r=await h.run();assert.equal(r.reason,'repeated-untouched-failures; human check required');assert.equal(h.actions.length,4);assert.equal(r.pending,null);assert.equal(r.untouchedFailures,4);
});

test('R1 fixed no-extras intent: legacy intent normalizes to the same condition, different extras are invalid, legacy records cannot re-add',async()=>{
  const legacy=structuredClone(pro);delete legacy.extras;
  assert.equal(validIntent(legacy),true);assert.deepEqual(normalizeIntent(legacy),pro);
  for(const extras of [{tradeIn:'apple',appleCare:'none'},{tradeIn:'none',appleCare:'monthly'},{tradeIn:'none'},null,{tradeIn:'none',appleCare:'none',accessory:'case'}])assert.equal(validIntent({...pro,extras}),false);
  await assert.rejects(synthetic(read('ENTRY')).job.run({...pro,extras:{tradeIn:'apple',appleCare:'none'}},{tabId:7,planDigest:'digest'}),/InvalidPurchaseConfiguration/);
  const seed=synthetic(read('AUTH'));await seed.job.run(legacy,{tabId:7,planDigest:'digest'});const row=seed.store.rows[TASK_KEY];
  row.plan=legacy;for(const k of ['bagAddStarted','resourceWritten','untouchedFailures','quotedCny','mode'])delete row[k];assert.equal(validStored(row),true);
  const r=synthetic(read('VARIANT',{variantVerified:true,quotedCny:9999}),undefined,{[TASK_KEY]:row});const out=await r.run();
  assert.match(out.reason,/bag-addition-already-started/);assert.equal(r.actions.length,0);assert.deepEqual(r.store.rows[TASK_KEY].plan.extras,{tradeIn:'none',appleCare:'none'});
});

test('R1 F-K: current fulfillment controls outrank prose; conflicting, multiple, disabled or unselected choices never prove pickup',async()=>{
  const texts=['iPhone 18 Pro 256GB 黑色','数量：1','总计：RMB 9,999','取货地点：Apple 大连恒隆广场','店内取货'];
  const read1=async(radios,extra=[])=>{const page={url:'https://secure6.www.apple.com.cn/shop/checkout',title:new El('结账','H1'),texts:[...texts,...extra],buttons:[button('继续填写取货详情')],radios};return {page,fn:mount(page),o:await mount(page)(pro)};};
  const cases=[
    [[radio('我要取货',{checked:true}),radio('送货上门',{checked:true})],'conflict'],
    [[radio('我要取货',{checked:true}),radio('我要取货')],'ambiguous'],
    [[radio('我要取货',{checked:true,disabled:true})],'disabled'],
    [[radio('我要取货')],'unselected'],
    [[radio('我要取货',{name:'fulfillment'}),radio('其他方式（合成未知选项）',{name:'fulfillment',checked:true})],'delivery'],
  ];
  for(const [radios,state] of cases){const {o}=await read1(radios);assert.equal(o.fulfillmentChoice,state);assert.equal(o.purchase.verified,false);assert.notEqual(o.purchase.fulfillment,'pickup');assert.notEqual(o.phase,'SLOTS');}
  const ok=(await read1([radio('我要取货',{checked:true})])).o;assert.equal(ok.fulfillmentChoice,'pickup');assert.equal(ok.purchase.verified,true);
  const prose=(await read1([])).o;assert.equal(prose.fulfillmentChoice,null);assert.equal(prose.purchase.verified,true);assert.equal(prose.phase,'SLOTS');
  assert.equal((await read1([],['送货地址：合成'])).o.purchase.verified,false);
  const c=await read1([radio('我要取货',{checked:true}),radio('送货上门',{checked:true})]);
  const reply=await c.fn(pro,{id:'fk-1',taskId:'t',authorized:true,structured:true,expected:JSON.stringify(c.o),action:'selectPickup'});
  assert.deepEqual(reply,{delivered:false,touched:false,reason:'ActionNotRecognizedForCurrentStage'});assert.equal(c.page.radios[0].clicks+c.page.radios[1].clicks,0);
  const h=synthetic(read('FULFILLMENT',{fulfillmentChoice:'conflict',purchase:{...purchase,verified:false,fulfillment:null,store:null}}));
  assert.equal((await h.run()).state,'BLOCKED');assert.equal(h.actions.length,0);
});

test('R1 ChromePort passes through only a positively untouched page report; touched or malformed replies are unknown',async()=>{
  const reply={value:null};
  const api={tabs:{async get(){return {url:'https://secure6.www.apple.com.cn/shop/checkout'};}},permissions:{async contains(){return true;}},scripting:{async executeScript({args}){return [{frameId:0,documentId:'doc',result:args[1]?reply.value:{schema:'applebuy-merchant-read/v1',phase:'SLOTS',dates:[],times:[]}}];}}};
  const p=new ChromePort(api,7,{authorized:true});await p.observe(pro);
  reply.value={delivered:false,touched:false,reason:'SlotEvidenceChanged'};
  assert.deepEqual(await p.act({documentId:'doc',plan:pro,action:'chooseSlot',date:'10月23日',start:'21:15',end:'21:30',id:'c1',taskId:'t'}),{delivered:false,touched:false,reason:'SlotEvidenceChanged'});assert.equal(p.lastChoice,null);
  for(const value of [{delivered:false,touched:true,reason:'SlotControlRedrawn'},{delivered:false},null]){reply.value=value;await assert.rejects(p.act({documentId:'doc',plan:pro,action:'checkout',id:'c2',taskId:'t'}),/MutationResultUnknown/);}
});
