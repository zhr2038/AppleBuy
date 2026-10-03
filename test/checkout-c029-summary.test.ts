// C029 implementation tests (Claude). FAKE DOM and FAKE Chrome API only. The order-summary dialog follows the sanitized October 3
// observation (docs/reviews/C-029-native-summary-evidence.json): role=dialog/aria-modal DIV outside main, visuallyhidden 订单摘要,
// SPAN.rs-companionbar-items 「1 件商品」 in its observed ancestors, subtotal/shipping/total rows. The close control's accessible
// name 关闭 was observed by Codex's normal use (C029-R1 task/review). SYNTHETIC: every other close label, every count other than
// 「1 件商品」, every money change, other dialog, redraw, clock and event. No browser, account, network, bag, slot, order or
// payment; nothing here proves an Apple quantity contract. Quantity comes only from the current piece-count label; money is
// compared only to detect a changed order.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
import {ChromePort} from '../web/checkout-connector/chrome-port.js';
import {PurchaseJob} from '../web/checkout-connector/job.js';

const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{tradeIn:'none',appleCare:'none'}};
const TITLE='iPhone 18 Pro 256GB 黑色',HREF='https://secure6.www.apple.com.cn/shop/checkout';
class El{
  constructor(tag='DIV',text='',attrs={}){Object.assign(this,{tagName:tag.toUpperCase(),ownText:text,attrs,children:[],parentElement:null,isConnected:true,hidden:false,disabled:false,checked:false,labels:[],clicks:0,selectedIndex:0});}
  append(...nodes){for(const n of nodes){n.parentElement=this;this.children.push(n);}return this;}
  get textContent(){return this.ownText+this.children.map(n=>n.textContent).join('');}
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
  dispatchEvent(){return true;}
  checkValidity(){return true;}
}
function simple(e,s){
  let ok=true;
  s=s.replace(/\[([\w-]+)(?:=["']?([^\]"']*)["']?)?\]/g,(_,k,v)=>{const a=e.getAttribute(k);ok&&=v===undefined?a!==null:a===v;return '';});
  s=s.replace(/\.([\w-]+)/g,(_,c)=>{ok&&=e.classList.contains(c);return '';});
  assert.match(s,/^[\w-]*$/,'unsupported fake CSS selector');return ok&&(!s||e.tagName===s.toUpperCase());
}
const el=(tag,text='',attrs={})=>new El(tag,text,attrs);

// The observed FULFILLMENT shape (one group/strip/accessible copy, one companion button) with NO quantity in main, plus the
// order-summary dialog outside main, hidden until the companion button is clicked.
function page({count='1 件商品',subtotal='RMB 9,999',total='RMB 9,999',shipping='免费',bar='RMB 9,999',title=TITLE,quantity=null,shows=true,closes=true}={}){
  const clock={offset:0},main=el('MAIN'),barEl=el('BUTTON','显示订单摘要： ',{'data-autom':'companionbar-button'}).append(el('SPAN',bar));
  const pickup=el('INPUT','',{type:'radio',name:'FAKE-fulfillment'}),plabel=el('LABEL','我要取货');pickup.labels=[plabel];
  const delivery=el('INPUT','',{type:'radio',name:'FAKE-fulfillment'}),dlabel=el('LABEL','为我送货');delivery.labels=[dlabel];delivery.checked=true;
  pickup.onClick=()=>{pickup.checked=true;delivery.checked=false;};
  const strip=el('DIV',title,{class:'rs-fulfillment-productstrip-content'}),copy=el('SPAN',title,{class:'visuallyhidden'});
  const header=el('H2','',{class:'rs-fullfillment-selector-header'}).append(copy);
  const fieldset=el('FIELDSET','',{class:'rs-fulfillment-deliveryoptions'}).append(el('LEGEND','',{class:'rs-fulfillment-selector-title'}).append(header),dlabel,delivery,plabel,pickup);
  const group=el('DIV','',{class:'rs-fulfillment-shipmentgroup'}).append(el('P','FAKE shipment heading'),strip,el('DIV','',{class:'rs-fulfillment-shipment'}).append(fieldset));
  main.append(el('H1','你希望如何收到订单商品？'),barEl,group);
  if(quantity!==null)main.append(el('P','数量：'+quantity));
  const item=el('SPAN',count,{class:'column large-6 rs-companionbar-items'}),close=el('BUTTON','',{'aria-label':'关闭'});
  const section=el('DIV','',{class:'rs-companionbar-ordersummary-section'}).append(el('DIV','',{class:'rs-companionbar-ordertotal'}).append(el('DIV','',{class:'rs-order-item-details'}).append(el('P','',{class:'row rs-companionbar-bagitemrow'}).append(item))));
  const dialog=el('DIV','',{role:'dialog','aria-modal':'true'}).append(el('SPAN','订单摘要',{class:'visuallyhidden'}),section,
    el('DIV','小计',{class:'row rs-companionbar-summary-subtotal'}).append(el('SPAN',subtotal)),el('DIV','运费',{class:'row rs-companionbar-summary-shipping'}).append(el('SPAN',shipping)),
    el('DIV','总计',{class:'row rs-companionbar-total-row'}).append(el('SPAN',total)),close);
  dialog.hidden=true;barEl.onClick=()=>{if(shows)dialog.hidden=false;};close.onClick=()=>{if(closes)dialog.hidden=true;};
  const body=el('BODY').append(main,dialog),document=el('HTML').append(body);
  const ctx=vm.createContext({document,location:{href:HREF},URL,TextEncoder,crypto:webcrypto,Date:{now:()=>Date.now()+clock.offset},setTimeout,clearTimeout,HTMLInputElement:El,Event:class{},getComputedStyle:e=>({display:e.hidden?'none':'block',visibility:'visible'})});
  const fn=vm.runInContext('('+merchantDocument.toString()+')',ctx);let n=0;
  const f={main,body,bar:barEl,dialog,section,item,close,pickup,strip,clock,fn};
  f.read=async()=>structuredClone(await fn(plan));
  f.cmd=async(action,extra={})=>({id:'FAKE-c029-command-'+(++n),taskId:'FAKE-c029-task',authorized:true,structured:true,action,expected:JSON.stringify(await f.read()),...extra});
  f.send=async c=>structuredClone(await fn(plan,c));
  f.summary=async(key='FAKE-c029-key')=>f.send(await f.cmd('readOrderSummary',{summaryKey:key}));
  return f;
}
async function pickupUntouched(f){const x=await f.send(await f.cmd('selectPickup'));assert.equal(x.delivered,false);assert.equal(x.touched,false);assert.equal(f.pickup.clicks,0);}
async function quantityUnknown(f){const r=await f.read();assert.equal(r.purchase.quantity,null);assert.equal(r.purchase.itemVerified,false);assert.equal(r.quantitySource,null);await pickupUntouched(f);}
async function failedRead(f,reason){
  const x=await f.summary();assert.deepEqual(x,{delivered:false,touched:true,reason});
  assert.equal((await f.read()).orderSummary.state,'not-read');
}

test('C029 unread summary: quantity stays unknown, pickup untouched, only the readable flag is reported',async()=>{
  const f=page(),r=await f.read();
  assert.equal(r.phase,'FULFILLMENT');assert.equal(r.summaryReadable,true);assert.deepEqual(r.orderSummary,{state:'not-read'});
  await quantityUnknown(f);assert.equal(f.bar.clicks,0);
});
test('C029 observed 1 件商品 summary is opened, read and closed; the next fresh read supplies quantity 1 and pickup proceeds once',async()=>{
  const f=page(),x=await f.summary();
  assert.deepEqual(x,{delivered:true,summary:{goodsCount:1,subtotalCny:9999,totalCny:9999,shipping:'免费'}});
  assert.equal(f.bar.clicks,1);assert.equal(f.close.clicks,1);assert.equal(f.dialog.hidden,true);
  const r=await f.read();
  assert.equal(r.purchase.quantity,1);assert.equal(r.purchase.itemVerified,true);assert.equal(r.quantitySource,'order-summary');
  assert.deepEqual(r.orderSummary,{state:'current',goodsCount:1,subtotalCny:9999,totalCny:9999,shipping:'免费',readBy:'FAKE-c029-key'});
  // Sanitized output only: no summary or page text crosses the boundary.
  assert.doesNotMatch(JSON.stringify(r),/件商品|订单摘要|小计|总计/);
  assert.equal((await f.send(await f.cmd('selectPickup'))).delivered,true);assert.equal(f.pickup.clicks,1);
});
for(const count of ['2 件商品','0 件商品'])test('C029 synthetic summary count '+count+' is read but never one unit',async()=>{
  const f=page({count}),x=await f.summary();assert.equal(x.delivered,true);assert.equal(x.summary.goodsCount,Number(count[0]));
  const r=await f.read();assert.equal(r.purchase.quantity,Number(count[0]));assert.equal(r.purchase.itemVerified,false);await pickupUntouched(f);
});
const unrecognized={
  'count wording without a number':{count:'几件商品'},
  'count split from its unit':{count:'1 件 商品'},
  'shipping that is not free':{shipping:'RMB 50'},
  'summary title missing':f=>{f.dialog.children[0].ownText='FAKE';},
  'second hidden count element':f=>{const x=el('SPAN','1 件商品',{class:'rs-companionbar-items'});x.hidden=true;f.dialog.append(x);},
  'hidden extra count phrase elsewhere in the dialog':f=>{const x=el('SPAN','2 件商品');x.hidden=true;f.dialog.append(x);},
  'count element outside the observed ancestors':f=>{f.section.children[0].children=[];f.dialog.append(f.item);},
};
for(const [name,v] of Object.entries(unrecognized))test('C029 unrecognized summary stops and is closed: '+name,async()=>{
  const f=typeof v==='function'?(()=>{const p=page();v(p);return p;})():page(v);
  await failedRead(f,'OrderSummaryUnrecognized');assert.equal(f.dialog.hidden,true);await quantityUnknown(f);
});
for(const [name,v] of Object.entries({'total above subtotal':{total:'RMB 10,000'},'subtotal below total':{subtotal:'RMB 9,998'},'companion caption differs':{bar:'RMB 9,998'}}))
  test('C029 summary money that does not match stops: '+name,async()=>{const f=page(v);await failedRead(f,'OrderSummaryMoneyDiffers');await quantityUnknown(f);});
for(const [name,v] of Object.entries({'over-cap companion total':{bar:'RMB 10,000',total:'RMB 10,000',subtotal:'RMB 10,000'},'wrong colour title':{title:'iPhone 18 Pro 256GB 银色'},'main already states quantity':{quantity:'1'}}))
  test('C029 no disclosure is attempted when it cannot be the only missing fact: '+name,async()=>{
    const f=page(v);assert.equal((await f.read()).summaryReadable,false);
    assert.deepEqual(await f.summary(),{delivered:false,touched:false,reason:'ActionNotRecognizedForCurrentStage'});assert.equal(f.bar.clicks,0);
  });
test('C029 a pre-rendered hidden summary that the click does not show is never read',async()=>{
  const f=page({shows:false});await failedRead(f,'OrderSummaryNotShown');await quantityUnknown(f);
});
test('C029 another dialog: already visible blocks the read; appearing with the summary is ambiguous; appearing later invalidates',async()=>{
  const a=page();a.body.append(el('DIV','FAKE sign-in',{role:'alertdialog'}));assert.equal((await a.read()).summaryReadable,false);
  assert.equal((await a.summary()).touched,false);assert.equal(a.bar.clicks,0);
  const b=page();b.bar.onClick=()=>{b.dialog.hidden=false;b.body.append(el('DIV','FAKE notice',{role:'dialog'}));};await failedRead(b,'OrderSummaryNotShown');
  const c=page();assert.equal((await c.summary()).delivered,true);c.body.append(el('DIV','FAKE notice',{role:'dialog'}));
  const r=await c.read();assert.equal(r.orderSummary.state,'not-current');assert.equal(r.purchase.quantity,null);
});
test('C029 a summary that does not close leaves no proof and blocks later reads',async()=>{
  const f=page({closes:false});await failedRead(f,'OrderSummaryNotClosed');
  const r=await f.read();assert.equal(r.summaryReadable,false);assert.equal(r.purchase.quantity,null);
});
// C029-R1 F1: only the single observed exact close name 关闭 may be clicked. Every label/control below is SYNTHETIC. The summary
// was already opened, so the report is truthfully touched; no record, quantity or pickup may follow, and nothing else is clicked.
const notTheObservedClose={
  'close-order label 关闭订单':f=>{f.close.attrs['aria-label']='关闭订单';},
  'English Close label':f=>{f.close.attrs['aria-label']='Close';},
  'other 关闭-prefixed label 关闭摘要':f=>{f.close.attrs['aria-label']='关闭摘要';},
  'visible text 关闭订单 without aria-label':f=>{delete f.close.attrs['aria-label'];f.close.ownText='关闭订单';},
  'exact 关闭 beside a second close-like control':f=>{f.dialog.append(el('BUTTON','',{'aria-label':'关闭订单'}));},
  'two exact 关闭 controls':f=>{f.dialog.append(el('BUTTON','',{'aria-label':'关闭'}));},
  'exact 关闭 that is disabled':f=>{f.close.disabled=true;},
  'exact 关闭 on a non-BUTTON role=button control':f=>{f.close.tagName='A';f.close.attrs.role='button';},
  'hidden exact 关闭 with a visible different label':f=>{f.close.hidden=true;f.dialog.append(el('BUTTON','',{'aria-label':'关闭订单'}));},
};
for(const [label,change] of Object.entries(notTheObservedClose))test('C029-R1 F1 a close control that is not the single exact observed 关闭 is never clicked: '+label,async()=>{
  const f=page();change(f);const controls=f.dialog.querySelectorAll('button,[role="button"]');
  assert.deepEqual(await f.summary(),{delivered:false,touched:true,reason:'OrderSummaryCloseUnrecognized'});
  assert.equal(f.bar.clicks,1);assert.deepEqual(controls.map(b=>b.clicks),controls.map(()=>0));assert.equal(f.dialog.hidden,false);
  const r=await f.read();assert.equal(r.orderSummary.state,'not-read');assert.equal(r.summaryReadable,false);assert.equal(r.purchase.quantity,null);assert.equal(r.purchase.itemVerified,false);
  await pickupUntouched(f);
});
test('C029-R1 the exact 关闭 name is still used when given as visible text, and a non-close button in the dialog is not ambiguity',async()=>{
  const a=page();delete a.close.attrs['aria-label'];a.close.ownText='关闭';
  assert.equal((await a.summary()).delivered,true);assert.equal(a.close.clicks,1);assert.equal((await a.read()).purchase.quantity,1);
  const b=page(),other=el('BUTTON','FAKE 了解更多');b.dialog.append(other);
  assert.equal((await b.summary()).delivered,true);assert.equal(b.close.clicks,1);assert.equal(other.clicks,0);assert.equal((await b.read()).purchase.quantity,1);
});
test('C029 a change in main between open and close discards the read',async()=>{
  const f=page();f.close.onClick=()=>{f.dialog.hidden=true;f.main.append(el('P','FAKE late notice'));};
  await failedRead(f,'OrderSummaryContextChanged');await quantityUnknown(f);
});
const staleAfterRead={
  'companion total changes':f=>{f.bar.children[0].ownText='RMB 19,998';},
  'product title changes':f=>{f.strip.ownText='iPhone 18 Pro 256GB 银色';},
  'main is redrawn':f=>{const m=el('MAIN');m.append(...f.main.children);f.body.children[0]=m;m.parentElement=f.body;},
  'record is older than its bound':f=>{f.clock.offset+=15001;},
  'URL changes':f=>{f.fn=vm.runInContext('('+merchantDocument.toString()+')',vm.createContext({}));},
};
for(const [name,change] of Object.entries(staleAfterRead))test('C029 stale summary record gives no quantity: '+name,async()=>{
  const f=page();assert.equal((await f.summary()).delivered,true);
  if(name==='URL changes'){
    // Navigation is a new document with a new isolated world: a fresh page instance has no record at all.
    const g=page();assert.deepEqual((await g.read()).orderSummary,{state:'not-read'});await quantityUnknown(g);return;
  }
  change(f);const r=await f.read();assert.equal(r.orderSummary.state,'not-current');assert.equal(r.purchase.quantity,null);assert.equal(r.purchase.itemVerified,false);
});
test('C029 main quantity evidence added after the read governs; a disagreeing summary never supplies quantity',async()=>{
  const f=page();await f.summary();f.main.append(el('P','数量：2'));
  const r=await f.read();assert.equal(r.orderSummary.state,'not-current');assert.equal(r.purchase.quantity,2);assert.equal(r.quantitySource,'main');await pickupUntouched(f);
});
test('C029 a change between the summary-backed observation and the action leaves pickup untouched',async()=>{
  const f=page();await f.summary();const c=await f.cmd('selectPickup');f.bar.children[0].ownText='RMB 9,998';
  const x=await f.send(c);assert.equal(x.delivered,false);assert.equal(x.touched,false);assert.equal(f.pickup.clicks,0);
});

// ---- FAKE Chrome API, ChromePort and PurchaseJob ----
const DOC='FAKE-c029-document';
function api(f,acts){return {tabs:{async get(){return {url:HREF};}},permissions:{async contains(){return true;}},scripting:{async executeScript({target,args}){
  if(args.length>1){assert.deepEqual(target.documentIds,[DOC]);acts.push(args[1].action);}
  return [{frameId:0,documentId:DOC,result:structuredClone(await f.fn(...args))}];}}};}
function memoryStore(initial=null){let row=initial?structuredClone(initial):null;return {async get(){return row?structuredClone(row):null;},async put(k,s){row=structuredClone(s);},get row(){return row;}};}
const task=(extra={})=>({schema:'applebuy-purchase-job/v1',taskId:'FAKE-c029-task',plan:structuredClone(plan),planDigest:'FAKE-c029-digest',tabId:7,state:'RUNNING',lastPhase:'BAG',lastDocumentId:null,entryDocumentId:null,reason:null,pending:null,finalIntent:null,orderRefHash:null,initialDates:null,dateCursor:0,floors:{},rejected:[],refusals:0,lastRead:0,expiresAt:10**12,bagAddStarted:true,resourceWritten:true,untouchedFailures:0,untouchedStreak:0,quotedCny:9999,mode:'purchase',...extra});
async function runJob(f,{record=task(),orderSummary=true,maxSteps=4,mode}={}){
  // Like control.js, a new run's port continues the stored read sequence.
  const acts=[],store=memoryStore(record),port=new ChromePort(api(f,acts),7,{authorized:mode!=='reconcile',mode:mode==='reconcile'?'observe':'purchase',orderSummary,initialSequence:record.lastRead??0});port.wait=async()=>{};let i=0;
  const r=await new PurchaseJob({store,port,now:()=>100000,id:()=>'FAKE-c029-id-'+(++i),maxSteps}).run(plan,{tabId:7,planDigest:'FAKE-c029-digest',...(mode?{mode}:{})});
  return {r,acts,row:store.row};
}

test('C029 only an authorized purchase port with the summary capability may disclose; observe/default ports cannot',async()=>{
  const f=page(),acts=[];
  for(const port of [new ChromePort(api(f,acts),7,{mode:'observe',orderSummary:true}),new ChromePort(api(f,acts),7,{authorized:true}),new ChromePort(api(f,acts),7,{authorized:true,mode:'public-config',orderSummary:true})]){
    await port.observe(plan);await assert.rejects(port.readSummary(plan,'FAKE-c029-task'),/SummaryDisclosureNotAuthorized/);
  }
  assert.deepEqual(acts,[]);assert.equal(f.bar.clicks,0);
});
test('C029 a summary record read by another port (restart or second page) is unverified and cannot be acted on',async()=>{
  const f=page(),acts=[],a=new ChromePort(api(f,acts),7,{authorized:true,orderSummary:true});
  await a.observe(plan);assert.deepEqual(await a.readSummary(plan,'FAKE-c029-task'),{read:true,goodsCount:1,subtotalCny:9999,totalCny:9999});
  const own=await a.observe(plan);assert.equal(own.purchase.quantity,1);assert.equal(own.quantitySource,'order-summary');
  const b=new ChromePort(api(f,acts),7,{authorized:true,orderSummary:true}),o=await b.observe(plan);
  assert.equal(o.purchase.quantity,null);assert.equal(o.purchase.itemVerified,false);assert.equal(o.quantitySource,null);assert.deepEqual(o.orderSummary,{state:'not-current'});
  await assert.rejects(b.act({action:'selectPickup',documentId:o.documentId,plan,id:'FAKE-c029-act',taskId:'FAKE-c029-task'}),/CurrentOperationNotAuthorized/);
  assert.deepEqual(acts,['readOrderSummary']);assert.equal(f.pickup.clicks,0);
});
test('C029 vertical FAKE chain: pending checkout reconciled through the 1 件商品 label (order money unchanged since checkout), then pickup once and no repeat',async()=>{
  const f=page(),{r,acts,row}=await runJob(f,{record:task({quotedCny:null,bagTotalCny:9999,pending:{action:'checkout',id:'FAKE-c029-pending',documentId:'FAKE-c029-bag-document',beforePhase:'BAG',deadline:200000}})});
  assert.deepEqual(acts,['readOrderSummary','selectPickup']);assert.equal(f.bar.clicks,1);assert.equal(f.close.clicks,1);assert.equal(f.pickup.clicks,1);
  assert.equal(r.state,'NEEDS_VERIFICATION');assert.equal(r.reason,'step-bound-reached');assert.equal(row.pending,null);
  assert.deepEqual(row.history.filter(h=>h.event==='order-summary-read'),[{event:'order-summary-read',read:true,goodsCount:1,totalCny:9999,reason:null}]);
});
test('C029 job: synthetic count 2 is read and stops before pickup',async()=>{
  const f=page({count:'2 件商品'}),{r,acts}=await runJob(f);
  assert.equal(r.state,'BLOCKED');assert.equal(r.reason,'pickup-conditions-not-verified');assert.deepEqual(acts,['readOrderSummary']);assert.equal(f.pickup.clicks,0);
});
// Order-change detector only: these stops never turn money into quantity (the label already said 1 件商品 here).
for(const [name,record] of Object.entries({'no recorded checkout money to compare':task({quotedCny:null}),'order money changed since checkout':task({quotedCny:null,bagTotalCny:9000})}))
  test('C029 job: a label-sourced quantity still stops when the order cannot be shown unchanged: '+name,async()=>{
    const f=page(),{r,acts}=await runJob(f,{record});
    assert.equal(r.state,'BLOCKED');assert.equal(r.reason,'order-summary-money-differs-from-explicit-one-unit-basis');assert.deepEqual(acts,['readOrderSummary']);assert.equal(f.pickup.clicks,0);
  });
test('C029 job: an unrecognized summary stops for verification without any purchase action',async()=>{
  const f=page({count:'几件商品'}),{r,acts}=await runJob(f);
  assert.equal(r.state,'NEEDS_VERIFICATION');assert.equal(r.reason,'order-summary-not-verified; no purchase action');assert.deepEqual(acts,['readOrderSummary']);assert.equal(f.pickup.clicks,0);
});
test('C029-R1 F1 job: a different close label stops after the opened summary with zero close and pickup clicks; a restarted run neither rereads nor acts',async()=>{
  const f=page();f.close.attrs['aria-label']='关闭订单';
  const first=await runJob(f);
  assert.equal(first.r.state,'NEEDS_VERIFICATION');assert.equal(first.r.reason,'order-summary-not-verified; no purchase action');assert.deepEqual(first.acts,['readOrderSummary']);
  assert.deepEqual(first.row.history.filter(h=>h.event==='order-summary-read'),[{event:'order-summary-read',read:false,goodsCount:null,totalCny:null,reason:'OrderSummaryCloseUnrecognized'}]);
  const again=await runJob(f,{record:first.row});
  assert.deepEqual(again.acts,[]);assert.equal(again.r.state,'BLOCKED');assert.equal(again.r.reason,'pickup-conditions-not-verified');
  assert.equal(f.bar.clicks,1);assert.equal(f.close.clicks,0);assert.equal(f.pickup.clicks,0);
});
test('C029 job: without the summary capability (older composition) the C028 stop is unchanged',async()=>{
  const f=page(),{r,acts}=await runJob(f,{orderSummary:false});
  assert.equal(r.state,'BLOCKED');assert.equal(r.reason,'pickup-conditions-not-verified');assert.deepEqual(acts,[]);assert.equal(f.bar.clicks,0);
});
test('C029 job: read-only reconciliation never discloses the summary',async()=>{
  const f=page(),{r,acts}=await runJob(f,{mode:'reconcile'});
  assert.equal(r.state,'NEEDS_USER');assert.deepEqual(acts,[]);assert.equal(f.bar.clicks,0);
});
test('C029 job: an unknown final order is only looked up, never followed by a summary read or any action',async()=>{
  const f=page(),{r,acts}=await runJob(f,{record:task({finalIntent:{id:'FAKE-c029-final',sent:true,grantId:'FAKE-c029-grant'},pending:{action:'submitOrder',id:'FAKE-c029-submit',documentId:DOC,beforePhase:'REVIEW',deadline:200000}})});
  assert.equal(r.state,'NEEDS_VERIFICATION');assert.equal(r.reason,'final-result-unconfirmed; no resubmission');assert.deepEqual(acts,[]);assert.equal(f.bar.clicks,0);
});
