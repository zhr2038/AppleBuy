// C051 implementation tests (Claude). The actual merchantDocument, ChromePort and PurchaseJob run in fresh headless Chrome against an
// owned 127.0.0.1 page. The contact-only step follows the C-051 normal-observation public metadata (labels, types, lengths, required,
// Continue caption, companion-bar total, no product/store/date text). Every value, URL binding, document id, money basis, slot, stored
// task, grant, payment/review/receipt/order page, backend order and timing is FAKE. No Apple request, extension, personal profile, real
// contact data, slot, order or payment.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
import {ChromePort} from '../web/checkout-connector/chrome-port.js';
import {PurchaseJob,TASK_KEY,CONTACT_SLOT_BASIS} from '../web/checkout-connector/job.js';
const {chromium}=createRequire(import.meta.url)(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));

const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{tradeIn:'none',appleCare:'none'}};
const DIGEST='FAKE-c051-digest',CHECKOUT='https://secure8.www.apple.com.cn/shop/checkout',TERMS='https://www.apple.com.cn/shop/open/salespolicies',ORDER='https://www.apple.com.cn/shop/order/FAKE-C051-0001';
// FAKE private values: FAKE names, reserved .invalid mail domain, zero phone and a FAKE suffix. Never real customer data.
const SUFFIX='7351',KEPT={last:'FAKE-姓',first:'FAKE-名',email:'fake-c051@example.invalid',phone:'00000000000'};
const slot={date:'October 4',start:'21:15',end:'21:30',ref:'time:46',generation:1};
const field=(id,label,attrs)=>'<label for="'+id+'">'+label+'</label><input id="'+id+'" '+attrs+'>';
const form=(o={})=>field('last','姓氏','maxlength="20" required value="'+KEPT.last+'"')+field('first','名字','maxlength="14" required value="'+KEPT.first+'"')+
  field('email','电子邮件地址','type="email" maxlength="64" required value="'+KEPT.email+'"')+field('phone','联系人手机号码','type="'+(o.phoneType??'tel')+'" required value="'+KEPT.phone+'"')+
  field('identity','政府颁发的身份证件号码的后四位','maxlength="'+(o.identityMax??4)+'" required')+(o.inputs??'')+
  // Hidden company-invoice inputs exist on the observed page; only visible required inputs may block Continue. Never filled.
  '<div hidden>'+field('company','公司名称','required')+field('bank','开户银行','required')+'</div><button id="toPayment"'+(o.disabled?' disabled':'')+'>继续选择付款方式</button>';
const bar=m=>'<button data-autom="companionbar-button">显示订单摘要： RMB '+m+'</button>';
const proof='<p>iPhone 18 Pro 256GB 黑色</p><p>数量：1</p><p>取货地点：Apple 大连恒隆广场</p><p>店内取货</p>';
const when='<p>取货日期：October 4</p><p>取货时间：21:15 – 21:30</p>';
const order='<p>订单号：FAKE-C051-0001</p><p>待付款</p><p>iPhone 18 Pro 256GB 黑色</p><p>数量：1</p><p>总计：RMB 9,999</p><p>取货地点：Apple 大连恒隆广场</p><p>店内取货</p>'+when;
// Only the contact stage follows observed metadata; the legacy/slots/payment/review/receipt/order stages are INVENTED full-proof pages.
const pages=(o={})=>({start:o.start??'contact',holdDetails:o.holdDetails===true,terms:TERMS,
  contact:'<h1>FAKE 取货人信息</h1>'+bar(o.money??'9,999')+(o.extra??'')+form(o),
  legacy:'<h1>FAKE 取货人信息</h1>'+bar('9,999')+proof+form(o),
  slots:'<h1>FAKE 取货时间</h1>'+bar('9,999')+proof+'<button>继续填写取货详情</button>',
  payment:'<h1>你希望如何付款？</h1>'+bar('9,999')+proof+when+'<input type="radio" name="payment" id="alipay"><label for="alipay">支付宝</label><input type="radio" name="payment" id="wechat"><label for="wechat">微信支付</label><button id="payNext">继续查看订单</button>',
  review:'<h1>检查你的订单</h1>'+bar('9,999')+proof+when+'<input type="radio" name="chosen" id="chosen" checked disabled><label for="chosen">支付宝</label><button id="submit">立即下单</button>',
  receipt:'<h1>感谢你的订购</h1>'+order+'<a href="'+ORDER+'">查看订单详情</a>',
  order:'<h1>订单详情</h1>'+order});
// Page-side FAKE merchant: same-document stage renders; each render is a new FAKE document id. Values stay in this owned page.
function install(p){
  if(location.hostname!=='127.0.0.1'||document.documentElement.dataset.fake!=='c051-impl')throw Error('OwnedFixtureOnly');
  const c=globalThis.c051={doc:0,stage:null,events:[],orders:0,details:null,counts:{}},by=id=>document.getElementById(id),ids=['last','first','email','phone','identity','identity2','company','bank'];
  const main=document.createElement('main'),terms=document.createElement('a');terms.href=p.terms;terms.textContent='销售政策与条款';document.body.replaceChildren(main,terms);
  c.render=stage=>{c.doc++;c.stage=stage;main.innerHTML=p[stage];
    for(const id of ids)if(by(id)){const n=c.counts[id]={input:0,change:0};by(id).addEventListener('input',()=>n.input++);by(id).addEventListener('change',()=>n.change++);}
    if(by('toPayment'))by('toPayment').onclick=()=>{c.events.push('detailsContinue');c.details=Object.fromEntries(ids.filter(by).map(id=>[id,by(id).value]));if(!p.holdDetails)c.render('payment');};
    if(by('payNext'))by('payNext').onclick=()=>{c.events.push('paymentContinue');c.render('review');};
    if(by('submit'))by('submit').onclick=()=>{c.events.push('submit');c.orders++;c.render('receipt');};
  };
  c.render(p.start);
}
let browser,server,origin;
before(async()=>{
  server=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});r.end('<!doctype html><html data-fake="c051-impl"><head><title>FAKE C051</title></head><body></body></html>');});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--disable-background-networking']});
});
after(async()=>{if(browser)await browser.close();if(server){server.closeAllConnections?.();await new Promise(r=>server.close(r));}});
// FAKE Chrome API over one owned page. A command's action is logged (with its contactOnly flag); every page result is kept as text.
async function world(o={}){
  const context=await browser.newContext({serviceWorkers:'block'}),w={context,href:CHECKOUT,commands:[],results:[],navigations:[],blocked:[]};
  await context.route('**/*',r=>{const u=r.request().url();if(new URL(u).origin===origin)return r.continue();w.blocked.push(u);return r.abort('blockedbyclient');});
  await context.routeWebSocket('**/*',s=>s.close());
  const page=w.page=await context.newPage();await page.goto(origin+'/');await page.evaluate(install,pages(o));
  w.state=()=>page.evaluate(()=>{const {render,...rest}=globalThis.c051;return structuredClone(rest);});
  w.render=stage=>page.evaluate(s=>globalThis.c051.render(s),stage);
  w.decode=html=>page.evaluate(async({source,plan,html,href})=>{document.querySelector('main').innerHTML=html;globalThis.c051.doc++;return await new Function('location','return ('+source+')')({href})(plan);},{source:merchantDocument.toString(),plan,html,href:CHECKOUT});
  w.api={tabs:{get:async id=>{assert.equal(id,7);return {id,url:w.href,status:'complete'};},
      update:async(id,{url})=>{assert.equal(id,7);assert.equal(url,ORDER,'FAKE: only the receipt link may be followed');w.navigations.push(url);w.href=url;await w.render('order');return {id,url,status:'complete'};},
      create:async()=>{throw Error('FAKE c051 opens no side tab');},remove:async()=>{throw Error('FAKE c051 opens no side tab');}},
    permissions:{contains:async({origins})=>origins.every(x=>x==='https://www.apple.com.cn/*'||x==='https://secure8.www.apple.com.cn/*')},
    scripting:{executeScript:async q=>{
      assert.equal(q.world,'ISOLATED');const command=q.args[1]??null;if(command)w.commands.push(command.action+(command.contactOnly===true?':contactOnly':''));
      const r=await page.evaluate(async({source,args,href,want})=>{
        if(location.hostname!=='127.0.0.1'||document.documentElement.dataset.fake!=='c051-impl')throw Error('OwnedFixtureOnly');
        const doc='FAKE-c051-doc-'+globalThis.c051.doc;if(want&&!want.includes(doc))return {doc,stale:true};
        return {doc,result:await new Function('location','return ('+source+')')({href})(...args)};
      },{source:q.func.toString(),args:q.args,href:w.href,want:q.target.documentIds??null});
      w.results.push(JSON.stringify(r.result??null));
      return r.stale?[{frameId:0,documentId:r.doc,error:'FAKE stale document'}]:[{frameId:0,documentId:r.doc,result:r.result}];}}};
  return w;
}
const read=async w=>(await w.api.scripting.executeScript({target:{tabId:7,frameIds:[0]},world:'ISOLATED',func:merchantDocument,args:[plan]}))[0].result;
// The C046-like preserved task: chooseSlot sent from SLOTS (its bound floor/cursor date), result unknown, nothing accepted yet.
const pendingSlot=()=>({id:'FAKE-c051-slot',action:'chooseSlot',...slot,documentId:'FAKE-c051-slots-doc',beforePhase:'SLOTS',deadline:Date.now()-1000});
const row=(o={})=>({schema:'applebuy-purchase-job/v1',taskId:'FAKE-c051-task',plan:structuredClone(plan),planDigest:DIGEST,tabId:7,state:'NEEDS_VERIFICATION',reason:'slot-result-unconfirmed; no resubmission',
  lastPhase:'DETAILS',lastDocumentId:'FAKE-c051-before',entryDocumentId:'FAKE-c051-entry',lastRead:10,expiresAt:Date.now()+1800000,initialDates:['October 4','October 5','October 6'],dateCursor:0,
  floors:{'October 4':'21:15'},rejected:[],refusals:0,pending:pendingSlot(),finalIntent:null,orderRefHash:null,bagAddStarted:true,resourceWritten:true,untouchedFailures:0,untouchedStreak:0,
  quotedCny:9999,bagTotalCny:9999,history:[{event:'FAKE-c051-kept'}],...o});
async function run(w,t,{mode='purchase',grant=null,privatePickupData={identitySuffix:SUFFIX},pauseOn=null}={}){
  const bound={initialSequence:t.row.lastRead,acceptedSlot:t.row.acceptedSlot??null,pending:t.row.pending};
  const port=new ChromePort(w.api,7,mode==='reconcile'?{mode:'observe',...bound}:{authorized:true,...bound,privatePickupData,reviewGrant:grant});
  let job=null;const store={get:async k=>{assert.equal(k,TASK_KEY);return structuredClone(t.row);},put:async(k,v)=>{assert.equal(k,TASK_KEY);t.row=structuredClone(v);if(pauseOn?.(v))job.pause();}};
  job=new PurchaseJob({store,port,maxSteps:40,maxWaitMs:300});
  return await job.run(plan,{tabId:7,planDigest:DIGEST,grant,mode});
}
// Private values never enter a page result or the durable task.
function noEcho(w,t){
  for(const r of w.results)for(const v of [SUFFIX,...Object.values(KEPT)])assert.ok(!r.includes('"'+v+'"'),'a page result carried a contact value');
  if(t){const d=JSON.stringify(t.row);assert.ok(!d.includes('"'+SUFFIX+'"')&&!d.includes('identitySuffix')&&!d.includes('privatePickupData'),'the durable task carried private data');}
}

test('C051 the observed contact-only step is a recognized step, never purchase proof, and returns no value',async()=>{
  const w=await world();try{
    const o=await read(w);
    assert.equal(o.phase,'DETAILS');assert.equal(o.verifiedStep,true);assert.deepEqual(o.contactStep,{kind:'contact-only-details',verified:true,totalCny:9999,fields:5});
    assert.deepEqual(o.purchase,{itemVerified:false,verified:false,model:null,capacity:null,color:null,quantity:null,totalCny:9999,store:null,fulfillment:null});
    assert.equal(o.summaryReadable,false);assert.equal(o.acceptedSlot,null);assert.equal(o.slotSummary,null);assert.equal(o.extras,null);noEcho(w);
    // A hidden lookalike input is not part of the visible form; a visible authentication lookalike is AUTH.
    assert.equal((await w.decode(pages({inputs:'<div hidden>'+field('identity2','政府颁发的身份证件号码的后四位','maxlength="4" required')+'</div>'}).contact)).contactStep?.verified,true);
    const auth=await w.decode(pages({inputs:field('pw','联系人手机号码','type="password"')}).contact);assert.equal(auth.phase,'AUTH');assert.equal(auth.contactStep,null);
    const off=await w.decode(pages({disabled:true}).contact);assert.notEqual(off.phase,'DETAILS');assert.equal(off.contactStep,null);
  }finally{await w.context.close();}
});

const notContact=[
  ['a duplicated visible contact field',{inputs:field('last2','姓氏','required')}],
  ['a phone field of another type',{phoneType:'text'}],
  ['an identity field of another length',{identityMax:5}],
  ['a hidden product mention',{extra:'<p hidden>iPhone 18 Pro 256GB 黑色</p>'}],
  ['another product line',{extra:'<p>iPhone 18 Pro 512GB 黑色</p>'}],
  ['a store line, even the planned store',{extra:'<p>取货地点：Apple 大连恒隆广场</p>'}],
  ['an explicit quantity',{extra:'<p>数量：2</p>'}],
  ['a hidden goods count',{extra:'<span hidden>2 件商品</span>'}],
  ['a pickup date line',{extra:'<p>取货日期：October 5</p>'}],
  ['a visible native date control',{extra:'<input type="radio" name="bartPickupDateSelectorButtonGroup" id="d5" value="5"><label for="d5">october5</label>'}],
  ['a delivery choice',{extra:'<input type="radio" name="ship" id="ship"><label for="ship">为我送货</label>'}],
  ['an extras marker',{extra:'<p>AppleCare+ 服务计划</p>'}],
  ['a second money widget',{extra:bar('9,999')}],
  ['a labelled total beside the bar',{extra:'<p>总计 RMB 9,999</p>'}],
  ['no positive current money',{money:'0'}],
  ['a visible dialog',{extra:'<div role="dialog" aria-modal="true">FAKE</div>'}],
  ['an order reference',{extra:'<p>订单号：FAKE-C051-0002</p>'}],
];
test('C051 any current order fact, other money, dialog or unrecognized contact binding is not the contact-only step',async()=>{
  const w=await world();try{
    for(const [name,o] of notContact){const r=await w.decode(pages(o).contact);assert.equal(r.contactStep??null,null,name);assert.equal(r.purchase?.verified??false,false,name);}
  }finally{await w.context.close();}
});

test('C051 bound continuation: inherited slot, one approved private value, fresh payment/review, human final, one FAKE unpaid order',async()=>{
  const w=await world({inputs:'<div hidden>'+field('identity2','政府颁发的身份证件号码的后四位','maxlength="4" required')+'</div>'}),t={row:row()},before=structuredClone(t.row);
  try{
    const r=await run(w,t);
    // Review needs the human's current final confirmation; the inherited identity never reaches it.
    assert.equal(r.state,'BLOCKED');assert.equal(r.reason,'final-review-or-existing-order-check-missing');assert.equal(r.lastPhase,'REVIEW');
    assert.deepEqual(w.commands,['fillDetails:contactOnly','selectPayment','continuePayment']);
    assert.deepEqual(r.acceptedSlot,{date:slot.date,start:slot.start,end:slot.end,verified:true,basis:CONTACT_SLOT_BASIS});
    assert.deepEqual(r.inheritedIdentity,{kind:'inherited-task-identity',step:'contact-only-details',fresh:false,source:'purchase-verified-at-slot-send',product:plan.product,quantity:1,stores:plan.stores,fulfillment:'pickup',basisCny:9999,readSequence:11});
    assert.deepEqual(r.history,[...before.history,{event:'slot-continued-to-contact-only-details',readSequence:11,inherited:true}]);
    assert.equal(r.expiresAt,before.expiresAt);assert.equal(r.finalIntent,null);assert.equal(r.pending,null);
    const s=await w.state();
    // Only the approved missing suffix was written, once, to the single visible observed receiver. Prefilled and hidden fields untouched.
    assert.deepEqual(s.details,{last:KEPT.last,first:KEPT.first,email:KEPT.email,phone:KEPT.phone,identity:SUFFIX,identity2:'',company:'',bank:''});
    const none={input:0,change:0};assert.deepEqual(s.counts,{last:none,first:none,email:none,phone:none,identity:{input:1,change:1},identity2:none,company:none,bank:none});
    const grant={id:'FAKE-c051-final-grant',taskId:t.row.taskId,planDigest:DIGEST,documentId:t.row.lastDocumentId,termsUrl:TERMS,termsAccepted:true,existingOrdersChecked:true,noExtras:true,expiry:Date.now()+120000};
    const f=await run(w,t,{grant});
    assert.equal(f.state,'CONFIRMED_UNPAID');assert.equal(f.pending,null);assert.equal(f.finalIntent.sent,true);assert.match(f.orderRefHash,/^[0-9a-f]{64}$/);
    assert.deepEqual(f.acceptedSlot,r.acceptedSlot);assert.deepEqual(f.inheritedIdentity,r.inheritedIdentity);assert.equal(f.expiresAt,before.expiresAt);
    assert.deepEqual(w.commands,['fillDetails:contactOnly','selectPayment','continuePayment','submitOrder']);assert.deepEqual(w.navigations,[ORDER]);
    const e=await w.state();assert.equal(e.orders,1);assert.deepEqual(e.events,['detailsContinue','paymentContinue','submit']);
    noEcho(w,t);
    const guard=await w.page.evaluate(async u=>{try{await fetch(u);return 'reached';}catch{return 'aborted';}},'http://127.0.0.2:'+new URL(origin).port+'/FAKE-c051-guard');
    assert.equal(guard,'aborted');assert.equal(w.blocked.length,1);
  }finally{await w.context.close();}
});

const stops=[
  ['a changed amount',{money:'9,899'},{}],
  ['an amount above the cap',{money:'10,999'},{}],
  ['no recorded one-unit money basis (legacy record)',{},{quotedCny:null,bagTotalCny:null}],
  ['a legacy pending slot without its SLOTS origin',{},{pending:{...pendingSlot(),beforePhase:undefined}}],
  ['a pending slot that is not the frozen cursor date',{},{initialDates:['October 5','October 4']}],
  ['a pending slot that differs from its recorded floor',{},{floors:{'October 4':'21:00'}}],
  ['an already refused slot',{},{rejected:[{date:'October 4',start:'21:15',end:'21:30',generation:0}],refusals:1}],
  ['a recorded final intent',{},{finalIntent:{id:'FAKE-c051-intent',grantId:'FAKE-c051-grant',sent:false}}],
  ['a permanently read-only task',{},{reconcileOnly:true}],
  ['same-tab read-only reconciliation',{},{},'reconcile'],
  ['a changed product',{extra:'<p>iPhone 18 Pro 512GB 黑色</p>'},{}],
  ['a changed store',{extra:'<p>取货地点：Apple FAKE 其他门店</p>'},{}],
  ['a changed date',{extra:'<p>取货日期：October 5</p>'},{}],
  ['two units',{extra:'<p>数量：2</p>'},{}],
  ['a duplicated contact field',{inputs:field('phone2','联系人手机号码','type="tel" required')},{}],
  ['an authentication lookalike',{inputs:field('pw','联系人手机号码','type="password"')},{}],
];
for(const [name,page,stored,mode] of stops)test('C051 '+name+' keeps the sent slot pending and sends nothing',async()=>{
  const w=await world(page),t={row:row(stored)},before=structuredClone(t.row);
  try{
    const r=await run(w,t,{mode});
    assert.equal(r.state,'NEEDS_VERIFICATION');assert.equal(r.reason,'slot-result-unconfirmed; no resubmission');assert.deepEqual(r.pending,before.pending);
    assert.equal(r.acceptedSlot??null,null);assert.equal(r.inheritedIdentity,undefined);assert.equal(r.expiresAt,before.expiresAt);assert.deepEqual(r.history,before.history);
    assert.deepEqual(w.commands,[]);const s=await w.state();assert.deepEqual(s.events,[]);assert.deepEqual(s.counts.identity,{input:0,change:0});noEcho(w,t);
  }finally{await w.context.close();}
});

test('C051 pause after the inherited continuation; a stale slot list gets no second slot; restart continues once',async()=>{
  const w=await world(),t={row:row()};try{
    const p=await run(w,t,{pauseOn:v=>!!v.acceptedSlot});
    assert.equal(p.state,'PAUSED');assert.equal(p.pending,null);assert.equal(p.acceptedSlot.basis,CONTACT_SLOT_BASIS);assert.deepEqual(w.commands,[]);
    await w.render('slots');const s=await run(w,t);
    assert.equal(s.state,'NEEDS_VERIFICATION');assert.equal(s.reason,'slot-already-continued; no second slot');assert.deepEqual(w.commands,[]);
    await w.render('contact');const r=await run(w,t);
    assert.equal(r.reason,'final-review-or-existing-order-check-missing');assert.deepEqual(w.commands,['fillDetails:contactOnly','selectPayment','continuePayment']);
    assert.equal(r.inheritedIdentity.source,'purchase-verified-at-slot-send');const e=await w.state();assert.deepEqual(e.counts.identity,{input:1,change:1});noEcho(w,t);
  }finally{await w.context.close();}
});

test('C051 a late details result is reconciled without repeating the private write or Continue',async()=>{
  const w=await world({holdDetails:true}),t={row:row()};try{
    const a=await run(w,t);
    assert.equal(a.state,'NEEDS_VERIFICATION');assert.equal(a.reason,'mutation-result-unconfirmed; no automatic repeat');assert.equal(a.pending.action,'fillDetails');assert.equal(a.pending.contactOnly,true);
    const b=await run(w,t);assert.equal(b.reason,'mutation-result-unconfirmed; no automatic repeat');assert.deepEqual(w.commands,['fillDetails:contactOnly']);
    await w.render('payment');const c=await run(w,t);
    assert.equal(c.reason,'final-review-or-existing-order-check-missing');assert.deepEqual(w.commands,['fillDetails:contactOnly','selectPayment','continuePayment']);
    const e=await w.state();assert.deepEqual(e.counts.identity,{input:1,change:1});assert.deepEqual(e.events,['detailsContinue','paymentContinue']);noEcho(w,t);
  }finally{await w.context.close();}
});

test('C051 a missing approved identity suffix is never written, guessed or treated as refusal',async()=>{
  const w=await world(),t={row:row()};try{
    const r=await run(w,t,{privatePickupData:{}});
    assert.equal(r.state,'NEEDS_VERIFICATION');assert.equal(r.reason,'repeated-untouched-failures; human check required');assert.equal(r.pending,null);assert.equal(r.acceptedSlot.basis,CONTACT_SLOT_BASIS);
    assert.deepEqual(w.commands,Array(4).fill('fillDetails:contactOnly'));assert.equal(r.history.at(-1).reason,'PickupDetailsRequireHuman');
    const e=await w.state();assert.deepEqual(e.events,[]);assert.deepEqual(e.counts.identity,{input:0,change:0});noEcho(w,t);
  }finally{await w.context.close();}
});

test('C051 a page that repeats the full purchase keeps the fresh-evidence path, with no inherited label',async()=>{
  const w=await world({start:'legacy'}),t={row:row()};try{
    const r=await run(w,t);
    assert.equal(r.reason,'final-review-or-existing-order-check-missing');assert.deepEqual(w.commands,['fillDetails','selectPayment','continuePayment']);
    assert.equal(r.acceptedSlot.basis,'normal-checkout-progression; not a hold guarantee');assert.equal(r.inheritedIdentity,undefined);noEcho(w,t);
  }finally{await w.context.close();}
});
