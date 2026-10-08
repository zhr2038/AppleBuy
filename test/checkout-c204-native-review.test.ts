// C204 actual public review structure; every browser, customer and merchant effect below is FAKE.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
import {ChromePort} from '../web/checkout-connector/chrome-port.js';
import {PurchaseJob,createPurchaseRecord,CONTACT_SLOT_BASIS,TASK_KEY} from '../web/checkout-connector/job.js';
import {PRO_PLAN,proDigest} from '../src/desktop/browser-session.mjs';
const {chromium}=createRequire(import.meta.url)(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const CHECKOUT_URL='https://secure10.www.apple.com.cn/shop/checkout',TERMS='https://www.apple.com.cn/shop/browse/open/salespolicies';
let server,browser,origin;
before(async()=>{server=http.createServer((q,r)=>r.end('FAKE C204 native review'));await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--disable-background-networking']});});
after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));});
function markup({model='iPhone 18 Pro 256GB 黑色',qty=1,total=9999,logo='支付宝',terms=TERMS,extra='',hiddenLogo=false}={}){
 const money=total.toLocaleString('en-US');
 return `<html data-fake="c204"><body><div role="main" id="checkout-container"><h1 class="rs-review-header">准备下单了吗？<span>请确保以下信息均准确无误。</span></h1>
 <div class="rs-review-fulfillment"><h2 class="rs-review-shipquote"><span>取货日期待付款完成后确定。</span></h2><button data-autom="changeShippingMethod">更改零售店</button>
 <ol data-autom="bag-items" class="rs-bag-items rs-iteminfos"><li data-autom="bag-item-1" class="rs-bag-item rs-iteminfo-wrap"><div class="rs-iteminfo-title-wrapper"><h2 class="rs-iteminfo-title">${model}</h2></div><div class="rs-iteminfo-quantity"><div class="rs-quantity"><div class="rs-quantity-text">数量 ${qty}</div></div></div><div class="rs-iteminfo-pricedetails"><div data-autom="Monthly_price" class="rs-iteminfo-price">RMB ${money}</div></div></li></ol></div>
 <div class="row rs-review-details"><h2 class="rs-review-title">取货联系人</h2><p>FAKE PERSON</p></div>
 <div class="row rs-review-details rs-review-billing"><h2 class="rs-review-title">付款方式</h2><button data-autom="billing-changeLink">更改</button><div class="rs-review-billing-details"><div class="rs-review-billing-cards"><h3 class="rs-review-payment-header"><img class="rs-review-payment-image" alt="${logo}" ${hiddenLogo?'hidden':''}></h3></div></div></div>
 <div class="rs-summary-content rs-summary-subtotal"><div class="rs-summary-labelandvaluecontainer"><div>小计</div><div data-autom="bagrs-summary-subtotalvalue">RMB ${money}</div></div></div>
 <div class="rs-summary-labelandvaluecontainer rs-summary-total"><div>总计</div><div data-autom="bagtotalvalue">RMB ${money}</div></div>
 <a href="${terms}">条款和条件</a><button data-autom="continue-button-placeOrder">立即下单</button>${extra}</div></body></html>`;
}
async function world(options={}){
 const context=await browser.newContext({serviceWorkers:'block'});
 await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort('blockedbyclient'));await context.routeWebSocket('**/*',s=>s.close());
 const page=await context.newPage();page.setDefaultTimeout(5000);await page.goto(origin,{waitUntil:'domcontentloaded'});await page.setContent(markup(options),{waitUntil:'domcontentloaded'});
 const read=cmd=>page.evaluate(async({source,plan,cmd,url})=>{if(location.hostname!=='127.0.0.1'||document.documentElement.dataset.fake!=='c204')throw Error('OwnedFixtureOnly');return new Function('location','return ('+source+')')({href:url})(plan,cmd);},{source:merchantDocument.toString(),plan:PRO_PLAN,cmd:cmd??null,url:CHECKOUT_URL});
 return {context,page,read};
}
test('C204 exact review row supplies SKU, explicit quantity, money and native Alipay, while missing store/slot remain missing',async()=>{
 const w=await world();try{const o=await w.read();assert.equal(o.phase,'REVIEW');assert.equal(o.purchase.itemVerified,true);assert.equal(o.purchase.quantity,1);assert.equal(o.purchase.totalCny,9999);assert.equal(o.paymentMethod,'支付宝');assert.equal(o.purchase.verified,false);assert.equal(o.purchase.store,null);assert.equal(o.slotSummary,null);assert.deepEqual(o.termsLinks,[TERMS]);assert.equal(o.extras,false);}finally{await w.context.close();}
});
for(const [label,options]of [['wrong SKU',{model:'iPhone 18 Pro Max 256GB 黑色'}],['hidden other product',{extra:'<p hidden>iPhone Duo 256GB 星光白色</p>'}],['unrelated extra product',{extra:'<p>iPhone Duo 256GB 星光白色</p>'}]])test('C204 '+label+' cannot prove the planned purchased item',async()=>{const w=await world(options);try{assert.equal((await w.read()).purchase.itemVerified,false);}finally{await w.context.close();}});
test('C204 native count two remains two, never inferred from the one row or total',async()=>{const w=await world({qty:2});try{const o=await w.read();assert.equal(o.purchase.quantity,2);assert.equal(o.purchase.itemVerified,false);}finally{await w.context.close();}});
for(const [label,change]of [['duplicate list',()=>{const e=document.querySelector('[data-autom="bag-items"]');e.after(e.cloneNode(true));}],['second native item',()=>{const e=document.querySelector('li');e.after(e.cloneNode(true));}],['hidden purchased list',()=>document.querySelector('ol').hidden=true]])test('C204 '+label+' is not a singleton purchased scope',async()=>{const w=await world();try{await w.page.evaluate(change);assert.equal((await w.read()).purchase.itemVerified,false);}finally{await w.context.close();}});
for(const [label,options]of [['wrong logo',{logo:'微信支付'}],['hidden logo',{hiddenLogo:true}]])test('C204 '+label+' is not Alipay proof',async()=>{const w=await world(options);try{assert.notEqual((await w.read()).paymentMethod,'支付宝');}finally{await w.context.close();}});
test('C204 duplicate provider artwork is ambiguous',async()=>{const w=await world();try{await w.page.evaluate(()=>{const e=document.querySelector('.rs-review-payment-image');e.after(e.cloneNode(true));});assert.notEqual((await w.read()).paymentMethod,'支付宝');}finally{await w.context.close();}});
test('C204 similar foreign terms link is not accepted',async()=>{const w=await world({terms:'https://example.invalid/shop/browse/open/salespolicies'});try{assert.deepEqual((await w.read()).termsLinks,[]);}finally{await w.context.close();}});
test('C204 actual partial review cannot acknowledge unknown payment continuation or authorize final submission',async()=>{
 const w=await world(),actions=[],now=Date.now();let row={...createPurchaseRecord(PRO_PLAN,{taskId:'FAKE-c204',planDigest:proDigest,tabId:7,now,id:()=>crypto.randomUUID()}),state:'NEEDS_VERIFICATION',lastPhase:'PAYMENT',bagAddStarted:true,resourceWritten:true,bagTotalCny:9999,initialDates:['october8'],dateCursor:0,floors:{october8:'21:15'},acceptedSlot:{date:'october8',start:'21:15',end:'21:30',verified:true,basis:CONTACT_SLOT_BASIS},pending:{id:'FAKE-payment',action:'continuePayment',beforePhase:'PAYMENT',paymentOnly:true,documentId:'FAKE-before',deadline:now-1}};
 const api={tabs:{get:async()=>({url:CHECKOUT_URL,status:'complete'})},permissions:{contains:async()=>true},scripting:{executeScript:async q=>{if(q.args[1])actions.push(q.args[1].action);return [{frameId:0,documentId:'FAKE-review',result:await w.read(q.args[1])}];}}};
 const store={get:async()=>structuredClone(row),put:async(k,v)=>{assert.equal(k,TASK_KEY);row=structuredClone(v);}},port=new ChromePort(api,7,{authorized:true,acceptedSlot:row.acceptedSlot,pending:row.pending});
 try{await new PurchaseJob({store,port,maxWaitMs:0}).run(PRO_PLAN,{tabId:7,planDigest:proDigest});assert.equal(row.pending.action,'continuePayment');assert.equal(row.finalIntent,null);assert.deepEqual(actions,[]);}finally{await w.context.close();}
});
