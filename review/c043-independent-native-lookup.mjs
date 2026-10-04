// C043 independent Root reproduction. Reuses the labelled C040 FAKE native fixture unchanged except
// for one read-only executeScript rejection after the receipt-link navigation. The baseline and
// transient-loss cases must confirm in their FIRST start, one FAKE order, no helper resume.
// All merchant/Chrome/authority data remain FAKE; no Apple/personal profile/extension is touched.
// C040 (Claude): actual PurchaseJob + ChromePort + merchantDocument from a matching one-item bag through native pickup, one FAKE
// slot Continue, FAKE pickup details, Alipay, final review, one simulated submit, receipt and a separately followed order-detail
// lookup. Bag/checkout/pickup shapes reuse the sanitized C035/C036 facts; every later page (details, payment, review, receipt,
// order detail), all Chrome plumbing, permissions, URLs/document IDs, authority, storage, backend orders and timing are FAKE.
// Fresh isolated headless Chrome on owned 127.0.0.1 only: no personal profile/extension/account, Apple request, slot, order or payment.
import assert from 'node:assert/strict';
import http from 'node:http';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve,join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {PurchaseJob,TASK_KEY} from '../web/checkout-connector/job.js';
import {ChromePort} from '../web/checkout-connector/chrome-port.js';

const root=resolve(import.meta.dirname,'..');
const output=join(root,'.local/reviewer/c043-independent-native-order/'+new Date().toISOString().replace(/[:.]/g,'-'));
mkdirSync(output,{recursive:true});
const {chromium}=createRequire(import.meta.url)(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const pickup=JSON.parse(readFileSync(join(root,'docs/reviews/C-036-normal-pickup-evidence.json'),'utf8'));
const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{tradeIn:'none',appleCare:'none'}};
const pro={...plan.product,price:9999};
// Harmless FAKE details: reserved .invalid mail domain, all-zero phone and identity suffix. Never real contact or identity data.
const DETAILS={lastName:'FAKE姓',firstName:'FAKE名',phone:'00000000000',email:'fake-c040@example.invalid',identitySuffix:'0000'};
const TERMS='https://www.apple.com.cn/shop/open/salespolicies',CHECKOUT='https://secure8.www.apple.com.cn/shop/checkout';
const PATH=['checkout','selectPickup','chooseSlot','fillDetails','selectPayment','continuePayment','submitOrder'];
const EXPECTED_ORDER={id:'FAKE-C040-0001',title:'iPhone 18 Pro 256GB 黑色',quantity:1,totalCny:9999,store:'Apple 大连恒隆广场',storeId:'R609',date:'October 4',time:'21:15 – 21:30',payment:'支付宝',state:'unpaid',paid:false};
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const title=p=>p.model+' '+p.capacity+' '+p.color;
const money=n=>'RMB '+n.toLocaleString('en-US');

// Observed (C036): date radios with their serialized initial checked day, the full numbered R609 label (checked after the normal
// pickup choice), the date LEGEND and the native time options. October 4's list is derived from the recorded October 5 texts and
// checked below against the recorded October 4 first/last key and enabled count.
const day4=pickup.dayObservations[0];
const options=pickup.dayObservations[1].options.map(o=>({...o,value:o.value&&'4'+o.value.slice(1)}));
assert.equal(options.filter(o=>!o.disabled).length,day4.enabledSlots);assert.equal(options[1].value,day4.firstKey);assert.equal(options.at(-1).value,day4.lastKey);assert.equal(options.at(-1).text,day4.lastText);
const dates=pickup.dateStructure.map(x=>x.html+'<label for="bartPickupDateSelector'+x.value+'">'+escape(x.label)+'</label>').join('');
const optionHtml=options.map(o=>'<option value="'+escape(o.value)+'"'+(o.disabled?' disabled':'')+(o.selected?' selected':'')+'>'+escape(o.text)+'</option>').join('');
const storeLabel=pickup.currentPickupLayout.selectedStore.label.text;
const pickupBody='<h2>选择取货零售店：</h2><input type="radio" name="store-locator-result" value="R609" id="dalian" checked><label for="dalian">'+escape(storeLabel)+'</label><ul role="list" class="rt-storelocator-store-multipleavailability-list"><li role="listitem" class="row rt-storelocator-store-multipleavailability-item"><div class="column large-7">'+title(pro)+'</div><div>需要签到</div></li></ul><fieldset><legend class="rs-pickup-slottitle">为你的 iPhone 18 Pro 选择取货日期：</legend>'+dates+'<label id="rs-pickup-slottitle">接下来，选择 10月 4 当天的签到时段：</label><select data-autom="pickup-availablewindow-dropdown" aria-labelledby="rs-pickup-slottitle">'+optionHtml+'</select></fieldset><button id="next">继续填写取货详情</button>';
const deliveryBody='<div class="rs-fulfillment-shipmentgroup"><div class="rs-fulfillment-productstrip-content">'+title(pro)+'</div></div>';
const bar='<button data-autom="companionbar-button" id="show">显示订单摘要： <span>RMB 9,999</span></button>';
// Observed C029/C036 summary dialog shape. The explicit 运费 免费 row on later pages is INVENTED (see report).
const summary='<div id="summary" role="dialog" aria-modal="true" hidden><span class="visuallyhidden">订单摘要</span><div class="rs-companionbar-ordersummary-section"><div class="rs-companionbar-ordertotal"><div class="rs-order-item-details"><p class="row rs-companionbar-bagitemrow"><span class="column large-6 rs-companionbar-items">1 件商品</span></p></div></div></div><div class="rs-companionbar-summary-subtotal">小计 <span>RMB 9,999</span></div><div id="shipping" class="rs-companionbar-summary-shipping">运费 <span>免费</span></div><div class="rs-companionbar-total-row">总计 <span>RMB 9,999</span></div><button id="close" aria-label="关闭"></button></div>';
const fields=[['lastName','姓氏','text'],['firstName','名字','text'],['phone','手机号码','tel'],['email','电子邮件地址','email'],['identitySuffix','身份证件号码后四位','text']];
let server,browser,origin;const worlds=new Map(),contexts=new Set(),serverHits=[];
const report={scope:'actual production PurchaseJob/ChromePort/merchantDocument on native rendered DOM; FAKE Chrome/authority/merchant/backend; not personal extension or Apple',actualAppleVisited:false,personalProfileUsed:false,extensionInstalledOrGranted:false,realSlotSubmitted:false,realOrderCreated:false,realPaymentAttempted:false,realSpeedMeasured:false,checks:[],network:{allowed:0,blocked:0,blockedUrls:[]},guard:null,cleanup:{contextsClosed:0,browserClosed:false,serverClosed:false,errors:[]},
  fixtureFacts:{observed:'C035/C036/C029 sanitized bag/pickup/date/time/R609 label/summary shapes',invented:'details/payment/review/receipt/order-detail markup, later-page 运费 免费 row and slot/store prose, single-segment order URL, backend order store, same-document post-slot stage renders (document loads in the read-loss route variant), targeted frame-removal read losses and 35/150 ms timings, all Chrome interfaces/authority/identity/storage'}};

function proof(w){return '<p>'+title(pro)+'</p><p>取货地点：Apple 大连恒隆广场</p><p>店内取货</p><p>取货日期：October '+w.sel.date+'</p>'+(w.sel.time?'<p>取货时间：'+escape(w.sel.time)+'</p>':'');}
function orderProof(o){return '<p>订单号：'+o.id+'</p><p>待付款</p><p>'+escape(o.title)+'</p><p>数量：'+o.quantity+'</p><p>总计：'+money(o.totalCny)+'</p><p>取货地点：'+escape(o.store)+'</p><p>店内取货</p><p>取货日期：'+escape(o.date)+'</p>'+(o.time?'<p>取货时间：'+escape(o.time)+'</p>':'');}
function html(w,stage){
  let main='',dialog=false;const o=w.orders[0];
  if(stage==='bag')main='<h1>购物袋</h1><ol data-autom="bag-items">'+w.cart.map(p=>'<li><h2>'+escape(title(p))+'</h2><label>数量 <select aria-label="数量"><option selected>1</option><option>2</option></select></label><button>移除</button></li>').join('')+'</ol><p>总计 '+money(w.cart.reduce((a,p)=>a+p.price,0))+'</p><button data-autom="checkout" id="checkout">结账</button>';
  if(stage==='checkout'){dialog=true;main='<h1>你希望如何收到订单商品？</h1>'+bar+'<button role="radio" aria-checked="true" id="delivery">为我送货</button><button role="radio" aria-checked="false" id="pickup">我要取货</button><div id="fulfillment">'+deliveryBody+'</div>';}
  if(stage==='details'){dialog=true;main='<h1>谁来取货？</h1>'+bar+proof(w)+fields.map(([id,label,type])=>'<label for="'+id+'">'+label+'</label><input id="'+id+'" type="'+type+'" required>').join('')+'<button id="detailsNext">继续选择付款方式</button>';}
  if(stage==='payment'){dialog=true;main='<h1>你希望如何付款？</h1>'+bar+proof(w)+[['alipay','支付宝'],['wechat','微信支付'],['card','信用卡或借记卡']].map(([id,label])=>'<input type="radio" name="payment" id="'+id+'" value="'+label+'"><label for="'+id+'">'+label+'</label>').join('')+'<button id="payNext">继续查看订单</button>';}
  if(stage==='review'){dialog=true;main='<h1>检查你的订单</h1>'+bar+proof(w)+'<input type="radio" name="chosen" id="chosen" checked disabled><label for="chosen">'+escape(w.sel.payment??'')+'</label><button id="submit">立即下单</button>';}
  if(stage==='receipt'&&o)main='<h1>感谢你的订购</h1>'+orderProof(o)+'<a id="detail" href="https://www.apple.com.cn/shop/order/'+o.id+'">查看订单详情</a>';
  // The order detail renders the backend record, optionally altered only on this page (wrong/missing detail proof scenarios).
  if(stage==='order'&&o)main='<h1>订单详情</h1>'+orderProof({...o,...w.spec.detail});
  return '<html data-selfcheck="FAKE-c040-current-executor"><body><main id="merchant">'+main+'</main>'+(dialog?summary:'')+'<a href="'+TERMS+'">销售政策与条款</a></body></html>';
}
const stageOf=e=>new URL(e.page.url()).pathname.split('/').at(-1);
const hrefsFor=w=>({bag:'https://www.apple.com.cn/shop/bag',checkout:CHECKOUT,details:CHECKOUT,payment:CHECKOUT,review:CHECKOUT,receipt:CHECKOUT,...(w.orders[0]?{order:'https://www.apple.com.cn/shop/order/'+w.orders[0].id}:{})});
// Page-side FAKE merchant dynamics; installed per document and re-run by the page itself after a same-document stage render.
function pageBind({pickupBody,base,spa}){
    if(location.hostname!=='127.0.0.1'||document.documentElement.dataset.selfcheck!=='FAKE-c040-current-executor')throw Error('OwnedFixtureOnly');
    const by=id=>document.getElementById(id),send=(name,data={})=>globalThis.c040FakeEvent(name,data);
    // INVENTED: post-slot checkout stages render in the same /shop/checkout document (one task: URL, body, handlers), like the
    // observed in-page pickup render; the 'document' variant instead loads each stage as a new document (read-loss route scenario).
    const render=async path=>{const doc=new DOMParser().parseFromString(await (await fetch(base+'/'+path)).text(),'text/html');history.pushState(null,'',base+'/'+path);document.body.replaceWith(document.adoptNode(doc.body));globalThis.c040Rebind();};
    // The FAKE backend acknowledges the native event first; the owned page then moves to the next stage.
    const go=(name,path,data,delay=35)=>send(name,data).then(()=>setTimeout(()=>spa&&path!=='checkout'?render(path):location.assign(base+'/'+path),delay));
    if(by('checkout'))by('checkout').onclick=()=>go('checkout','checkout');
    if(by('show'))by('show').onclick=()=>{send('summaryOpen');by('summary').hidden=false;};
    if(by('close'))by('close').onclick=()=>{send('summaryClose');by('summary').hidden=true;};
    if(by('pickup'))by('pickup').onclick=()=>{
      by('pickup').setAttribute('aria-checked','true');by('delivery').setAttribute('aria-checked','false');by('fulfillment').innerHTML=pickupBody;by('shipping').remove();send('pickup');
      by('dalian').onchange=()=>send('store',{value:by('dalian').value});
      for(const r of document.querySelectorAll('input[name="bartPickupDateSelectorButtonGroup"]'))r.onchange=()=>{const s=document.querySelector('[data-autom="pickup-availablewindow-dropdown"]');s.selectedIndex=0;for(const o of [...s.options].slice(1))o.value=r.value+'-'+o.textContent.replace(/\s*[–—]\s*/g,'-');by('rs-pickup-slottitle').textContent='接下来，选择 10月 '+r.value+' 当天的签到时段：';send('date',{value:r.value});};
      const s=document.querySelector('[data-autom="pickup-availablewindow-dropdown"]');s.onchange=()=>send('time',{text:s.selectedOptions[0]?.textContent});
      by('next').onclick=()=>go('slotContinue','details');
    };
    if(by('detailsNext')){
      const ids=['lastName','firstName','phone','email','identitySuffix'],counts=Object.fromEntries(ids.map(id=>[id,{input:0,change:0}]));
      for(const id of ids){by(id).addEventListener('input',()=>counts[id].input++);by(id).addEventListener('change',()=>counts[id].change++);}
      by('detailsNext').onclick=()=>go('detailsContinue','payment',{values:Object.fromEntries(ids.map(id=>[id,by(id).value])),counts});
    }
    for(const id of ['alipay','wechat','card'])if(by(id))by(id).onchange=()=>send('payment',{value:by(id).value});
    if(by('payNext'))by('payNext').onclick=()=>go('paymentContinue','review');
    // FAKE merchant processing: the order exists before the receipt is shown 150 ms later; the review page stays meanwhile.
    if(by('submit'))by('submit').onclick=()=>go('submit','receipt',{},150);
}
async function bind(e,w){
  await e.page.evaluate(({source,arg})=>{globalThis.c040Rebind=()=>new Function('return ('+source+')')()(arg);globalThis.c040Rebind();},{source:pageBind.toString(),arg:{pickupBody,base:'/'+w.key,spa:w.spec.transition!=='document'}});
}
async function pageFor(w,stage){
  const page=await w.context.newPage(),e={page,boundToken:null};w.tabs.set(++w.tabId,e);e.id=w.tabId;
  await page.addInitScript(()=>{globalThis.c040FakeDocument=crypto.randomUUID();});
  await page.exposeFunction('c040FakeEvent',async(name,data)=>{
    w.effects[name]=(w.effects[name]??0)+1;
    if(name==='store')w.sel.store=data.value;if(name==='date')w.sel.date=data.value;if(name==='time')w.sel.time=data.text;if(name==='payment')w.sel.payment=data.value;
    if(name==='detailsContinue')w.details=data;
    if(name==='submit'){const item=w.cart[0];w.orders.push({id:'FAKE-C040-'+String(w.orders.length+1).padStart(4,'0'),title:title(item),quantity:w.cart.length,totalCny:w.cart.reduce((a,p)=>a+p.price,0),store:w.sel.store==='R609'?'Apple 大连恒隆广场':'FAKE-unknown-store',storeId:w.sel.store,date:'October '+w.sel.date,time:w.sel.time,payment:w.sel.payment,state:'unpaid',paid:false});}
    w.events.push(name);
  });
  await page.goto(origin+'/'+w.key+'/'+stage);await ready(e,w);return e;
}
async function ready(e,w){await e.page.waitForLoadState('domcontentloaded');const token=await e.page.evaluate(()=>globalThis.c040FakeDocument);assert.equal(typeof token,'string');if(e.boundToken!==token){await bind(e,w);e.boundToken=token;}return token;}
function apiFor(w){const prefix=e=>w.key+'-tab'+e.id+'-';return {
  permissions:{contains:async({origins})=>origins.every(o=>o==='https://www.apple.com.cn/*'||o==='https://secure8.www.apple.com.cn/*')},
  // Like chrome.tabs.get, the FAKE never touches the document (so it cannot fail during a navigation).
  tabs:{get:async id=>{const e=w.tabs.get(id);if(!e||e.page.isClosed())throw Error('FAKE missing owned tab');return {id,url:hrefsFor(w)[stageOf(e)],status:'complete'};},
    update:async(id,{url})=>{const e=w.tabs.get(id);assert.ok(e);const p=new URL(url).pathname,s=p==='/shop/bag'?'bag':w.orders[0]&&p==='/shop/order/'+w.orders[0].id?'order':null;
      assert.ok(s,'FAKE unexpected navigation');w.navigations.push(url);await e.page.goto(origin+'/'+w.key+'/'+s);await ready(e,w);return {id,url:hrefsFor(w)[s],status:'complete'};},
    create:async()=>{throw Error('FAKE c040 opens no side tab');},remove:async()=>{throw Error('FAKE c040 opens no side tab');}},
  scripting:{executeScript:async x=>{
    const e=w.tabs.get(x.target.tabId);assert.ok(e&&!e.page.isClosed());const command=x.args?.[1];
    if(!command&&w.spec.lookupReadLoss&&w.navigations.at(-1)?.endsWith('/FAKE-C040-0001')&&!w.lookupReadLossInjected){w.lookupReadLossInjected=true;throw Error('Frame with ID 0 was removed during the FAKE lookup navigation.');}
    // Targeted loss (C040 RED, C040-R1 recovery): the first read after each named action straddles the commit of its normal document
    // change, as a Chrome injection into a frame that navigates away rejects. Transport only: no decode or observation is altered.
    const sent=w.commands.at(-1),loss=command?null:w.spec.frameRemovedAfter?.[sent];
    if(loss&&!w.frameRemoved.includes(sent)){w.frameRemoved.push(sent);await e.page.waitForURL(new RegExp('/'+loss+'$'));throw Error('Frame with ID 0 was removed.');}
    await ready(e,w);if(command)w.commands.push(command.action);
    const want=x.target.documentIds?.map(d=>d.startsWith(prefix(e))?d.slice(prefix(e).length):null)??null;
    // Document identity, fake URL and the production decode are taken in ONE evaluation of the actual native document.
    const r=await e.page.evaluate(async({source,args,hrefs,want})=>{
      if(location.hostname!=='127.0.0.1'||document.documentElement.dataset.selfcheck!=='FAKE-c040-current-executor')throw Error('OfflineOnly');
      const token=globalThis.c040FakeDocument,stage=location.pathname.split('/').at(-1);if(want&&!want.includes(token))return {token,stage,stale:true};
      return {token,stage,result:await new Function('location','return ('+source+')')({href:hrefs[stage]})(...args)};
    },{source:x.func.toString(),args:x.args,hrefs:hrefsFor(w),want});
    w.readStages[r.stage]=(w.readStages[r.stage]??0)+1;
    if(r.stale)return [{frameId:0,documentId:prefix(e)+r.token,error:'FAKE document changed'}];
    if(command?.action==='submitOrder'&&w.spec.loseSubmitResult){w.lostSubmitResults++;throw Error('FAKE submit result lost after delivery');}
    return [{frameId:0,documentId:prefix(e)+r.token,result:r.result}];
  }}
};}
const brief=r=>({state:r.state,reason:r.reason,phase:r.lastPhase,pending:r.pending?.action??null});
const actions=w=>w.commands.filter(a=>a!=='readOrderSummary');
async function scenario(spec){
  const t=performance.now(),context=await browser.newContext({serviceWorkers:'block'});contexts.add(context);
  const w={key:'FAKE-c040-'+spec.name,spec:{detail:{},...spec},context,cart:[{...pro}],sel:{store:'R609',date:'4',time:null,payment:null},orders:[],details:null,tabs:new Map(),tabId:0,effects:{},events:[],commands:[],navigations:[],readStages:{},lostSubmitResults:0,frameRemoved:[],row:null,runs:[]};worlds.set(w.key,w);
  await context.route('**/*',async route=>{const u=route.request().url();if(new URL(u).origin===origin){report.network.allowed++;await route.continue();}else{report.network.blocked++;report.network.blockedUrls.push(u.slice(0,80));await route.abort();}});await context.routeWebSocket('**/*',s=>s.close());
  try{
    const main=await pageFor(w,'bag'),api=apiFor(w),entry=await new ChromePort(api,main.id,{mode:'observe'}).observe(plan);
    const store={get:async k=>{assert.equal(k,TASK_KEY);return structuredClone(w.row);},put:async(k,v)=>{assert.equal(k,TASK_KEY);w.row=structuredClone(v);}};
    const taskId='FAKE-c040-task-'+spec.name,digest='FAKE-c040-digest';
    const grant={id:'FAKE-c040-grant-'+spec.name,start:true,entryDocumentId:entry.documentId,taskId,planDigest:digest,existingOrdersChecked:true,noExtras:true,termsAccepted:true,termsUrl:TERMS,expiry:Date.now()+600000};
    const purchasePort=extra=>new ChromePort(api,main.id,{authorized:true,orderSummary:true,privatePickupData:DETAILS,reviewGrant:grant,...extra});
    const resume=async()=>{const r=await new PurchaseJob({store,port:new ChromePort(api,main.id,{authorized:true,pending:w.row.pending,initialSequence:w.row.lastRead}),maxSteps:15}).run(plan,{tabId:main.id,planDigest:digest});w.runs.push({kind:'resume',...brief(r)});return r;};
    let r=await new PurchaseJob({store,port:purchasePort({initialSequence:entry.seq}),maxSteps:80}).run(plan,{tabId:main.id,planDigest:digest,taskId,grant});w.runs.push({kind:'start',...brief(r)});
    if(spec.frameRemovedAfter){
      // C040-R1 (formerly RED): every targeted read across a sent step's own new document was rejected once by script transport; the
      // initial run re-read within that step's deadline, sent nothing again and continued (the common checks below count each once).
      assert.deepEqual(w.frameRemoved,Object.keys(spec.frameRemovedAfter));assert.equal(w.effects.slotContinue,1);assert.equal(r.state,'CONFIRMED_UNPAID',
        'after one successful native Continue, a transient read loss during the normal document change stopped the journey ('+r.reason+', pending '+r.pending?.action+')');}
    // Common completion-path facts: every native action exactly once, one native final click, one backend order, details sent once.
    assert.deepEqual(actions(w),PATH);assert.equal(w.effects.submit,1);assert.equal(w.orders.length,1);assert.deepEqual(w.orders[0],EXPECTED_ORDER);
    assert.equal(w.effects.checkout,1);assert.equal(w.effects.pickup,1);assert.equal(w.effects.time,1);assert.equal(w.effects.slotContinue,1);assert.equal(w.effects.detailsContinue,1);assert.equal(w.effects.payment,1);assert.equal(w.effects.paymentContinue,1);
    assert.equal(w.effects.store??0,0);assert.equal(w.effects.date??0,0);assert.ok(w.effects.summaryOpen>=5);assert.equal(w.effects.summaryOpen,w.effects.summaryClose);
    assert.deepEqual(w.details.values,DETAILS);for(const c of Object.values(w.details.counts))assert.deepEqual(c,{input:1,change:1});
    assert.equal(r.finalIntent?.sent,true);assert.deepEqual([r.acceptedSlot?.date,r.acceptedSlot?.start,r.acceptedSlot?.end],['October 4','21:15','21:30']);
    await main.page.waitForURL(new RegExp('/'+w.key+'/(?:receipt|order)$'));await ready(main,w);
    if(spec.loseSubmitResult){
      assert.equal(w.lostSubmitResults,1);assert.equal(r.state,'NEEDS_VERIFICATION');assert.equal(r.reason,'mutation-transport-lost; reconcile before proceeding');assert.equal(r.pending?.action,'submitOrder');
      // Same-tab read-only reconciliation reads only: no lookup navigation, no command, final intent kept.
      const ro=await new PurchaseJob({store,port:new ChromePort(api,main.id,{mode:'observe',initialSequence:w.row.lastRead})}).run(plan,{tabId:main.id,planDigest:digest,mode:'reconcile'});w.runs.push({kind:'readonly',...brief(ro)});
      assert.equal(ro.state,'NEEDS_VERIFICATION');assert.equal(ro.reason,'final-result-unconfirmed; no resubmission');assert.equal(ro.pending?.action,'submitOrder');assert.deepEqual(w.navigations,[]);assert.deepEqual(actions(w),PATH);
      // The start grant was revoked by the first stop: presenting it again cannot revive buying.
      const again=await new PurchaseJob({store,port:purchasePort({pending:w.row.pending,initialSequence:w.row.lastRead})}).run(plan,{tabId:main.id,planDigest:digest,taskId,grant});w.runs.push({kind:'revoked-grant',...brief(again)});
      assert.equal(again.state,'BLOCKED');assert.equal(again.reason,'advance-authorization-cleared-by-human-intervention');assert.deepEqual(actions(w),PATH);
    }
    // C040-R1: only the deliberately lost submit result may need a later run. Every other scenario decides in its initial run: success
    // through merchant processing, receipt and lookup; a wrong or missing detail proof as unconfirmed (checked below), without resume.
    if(spec.loseSubmitResult)r=await resume();
    else{assert.equal(w.runs.length,1);if(spec.success)assert.equal(r.state,'CONFIRMED_UNPAID','the normal final processing must be reconciled in the initial run ('+r.reason+')');}
    assert.deepEqual(actions(w),PATH);assert.equal(w.effects.submit,1);assert.equal(w.orders.length,1);assert.deepEqual(w.orders[0],EXPECTED_ORDER);
    assert.deepEqual(w.navigations,['https://www.apple.com.cn/shop/order/FAKE-C040-0001']);assert.ok(w.readStages.receipt>=1);assert.ok(w.readStages.order>=1);
    if(spec.success){
      assert.equal(r.state,'CONFIRMED_UNPAID');assert.equal(r.pending,null);assert.equal(r.orderRefHash,createHash('sha256').update(EXPECTED_ORDER.id).digest('hex'));
      // A confirmed task with its consumed start grant only reports; nothing is read for a purchase or sent.
      const reused=await new PurchaseJob({store,port:purchasePort({initialSequence:w.row.lastRead})}).run(plan,{tabId:main.id,planDigest:digest,taskId,grant});w.runs.push({kind:'consumed-grant',...brief(reused)});
      assert.equal(reused.state,'CONFIRMED_UNPAID');assert.deepEqual(actions(w),PATH);assert.equal(w.orders.length,1);
    }else{
      assert.equal(r.state,'NEEDS_VERIFICATION');assert.equal(r.reason,'final-result-unconfirmed; no resubmission');assert.equal(r.pending?.action,'submitOrder');assert.equal(r.finalIntent?.sent,true);
    }
    const durable=JSON.stringify(w.row);assert.ok(Object.values(DETAILS).every(v=>!durable.includes(v)),'FAKE details must not enter the durable task');
    if(spec.guard){
      // One deliberate alternate LOOPBACK origin request; the context route must abort it before any connection.
      const before=report.network.blocked,url='http://127.0.0.2:'+new URL(origin).port+'/FAKE-c040-guard';
      const outcome=await main.page.evaluate(async u=>{try{await fetch(u);return 'reached';}catch{return 'aborted';}},url);
      report.guard={url,outcome,blockedDelta:report.network.blocked-before,serverHits:serverHits.filter(p=>p.includes('FAKE-c040-guard')).length};
      assert.equal(outcome,'aborted');assert.equal(report.guard.blockedDelta,1);assert.equal(report.guard.serverHits,0);
    }
    return {name:spec.name,passed:true,durationMs:Math.round(performance.now()-t),runs:w.runs,final:brief(r),actions:actions(w),summaryReads:w.commands.length-actions(w).length,effects:w.effects,orders:w.orders.length,orderRecordExact:true,detailsWrittenOnceByNativeEvents:true,detailsAbsentFromDurableTask:true,navigations:w.navigations,readStages:w.readStages,lostSubmitResults:w.lostSubmitResults,frameRemoved:w.frameRemoved,lookupReadLossInjected:w.lookupReadLossInjected===true,detailOverride:Object.keys(w.spec.detail),realAcceptanceClaimed:false};
  }catch(error){return {name:spec.name,passed:false,durationMs:Math.round(performance.now()-t),error:String(error.stack||error).slice(0,2200),runs:w.runs,actions:actions(w),effects:w.effects,orders:w.orders.length,navigations:w.navigations,readStages:w.readStages,lookupReadLossInjected:w.lookupReadLossInjected===true};}
  finally{try{await context.close();contexts.delete(context);report.cleanup.contextsClosed++;}catch(e){report.cleanup.errors.push('context '+spec.name+': '+e.message);}worlds.delete(w.key);}
}
try{
  server=http.createServer((req,res)=>{const path=new URL(req.url,'http://127.0.0.1').pathname;serverHits.push(path);const parts=path.split('/'),w=worlds.get(parts[1]);if(!w){res.writeHead(404);res.end('FAKE unknown owned fixture');return;}res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(html(w,parts[2]));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking']});report.browserVersion=browser.version();
  for(const spec of [
    {name:'baseline-first-start-confirmation',success:true,guard:true},
    {name:'lookup-one-transient-read-loss-first-start',lookupReadLoss:true,success:true},
  ]){const x=await scenario(spec);report.checks.push(x);console.log((x.passed?'PASS ':'FAIL ')+x.name+' '+x.durationMs+'ms'+(x.passed?' '+JSON.stringify({runs:x.runs.map(r=>r.kind+':'+r.state),summaryReads:x.summaryReads,effects:x.effects,orders:x.orders,navigations:x.navigations,readStages:x.readStages,frameRemoved:x.frameRemoved}):' runs='+JSON.stringify(x.runs)+' actions='+x.actions.join(',')+' '+x.error.split('\n')[0]));}
  // Both independent scenarios must pass, with the alternate-loopback guard aborted.
  report.completionPassed=report.checks.length===2&&report.checks.every(x=>x.passed)&&report.guard?.outcome==='aborted';
  report.passed=report.completionPassed;
}catch(error){report.passed=false;report.error=String(error.stack||error).slice(0,1800);}
finally{
  for(const c of [...contexts])try{await c.close();contexts.delete(c);report.cleanup.contextsClosed++;}catch(e){report.cleanup.errors.push(e.message);}
  if(browser)try{await browser.close();report.cleanup.browserClosed=true;}catch(e){report.cleanup.errors.push('browser: '+e.message);}
  if(server){server.closeAllConnections?.();await new Promise(r=>server.close(e=>{if(e)report.cleanup.errors.push('server: '+e.message);else report.cleanup.serverClosed=true;r();}));}
  if(contexts.size||report.cleanup.errors.length)report.passed=false;
  writeFileSync(join(output,'result.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.passed,completionPassed:report.completionPassed,checks:report.checks.length,guard:report.guard,network:{allowed:report.network.allowed,blocked:report.network.blocked,blockedUrls:report.network.blockedUrls},cleanup:report.cleanup,result:join(output,'result.json')}));
  if(!report.passed)process.exitCode=1;
}
