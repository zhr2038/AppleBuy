// Contained real DOM/production parser/port/job. Every merchant, identity and resulting order is FAKE.
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';import {homedir} from 'node:os';import {join} from 'node:path';
import {merchantDocument} from '../web/checkout-connector/page-program.js';import {ChromePort} from '../web/checkout-connector/chrome-port.js';
import {PurchaseJob,createPurchaseRecord,TASK_KEY,CONTACT_SLOT_BASIS} from '../web/checkout-connector/job.js';
import {PRO_PLAN,proDigest} from '../src/desktop/browser-session.mjs';import {currentReviewProgress} from '../web/checkout-connector/review-progress.js';
import {CheckoutRpcPeer} from '../web/checkout-connector/checkout-rpc-peer.js';
import {NativeCheckoutApi} from '../src/desktop/native-checkout-api.mjs';
import {DesktopCheckoutRuntime} from '../src/desktop/checkout-runtime.mjs';
const {chromium}=createRequire(import.meta.url)(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const address='https://secure10.www.apple.com.cn/shop/checkout',terms='https://www.apple.com.cn/shop/browse/open/salespolicies';let server,browser,origin;
before(async()=>{server=http.createServer(async(q,r)=>{const path=new URL(q.url,'http://127.0.0.1').pathname;if(/^\/web\/checkout-connector\/[a-z0-9-]+\.js$/.test(path)){try{r.setHeader('Content-Type','text/javascript');r.end(await readFile(new URL('..'+path,import.meta.url),'utf8'));}catch{r.writeHead(404);r.end();}}else r.end('FAKE C214');});await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--disable-background-networking']});});
after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));});
const slots='<h1>FAKE pickup</h1><h2>iPhone 18 Pro 256GB 黑色</h2><p>数量 1</p><p>总计 RMB 9,999</p><button role="radio" aria-checked="true">我要取货</button><input type="radio" checked aria-label="Apple 大连恒隆广场"><select aria-label="取货日期"><option>October 8</option></select><select aria-label="取货时间"><option>可选时段</option><option>21:00 – 21:15</option><option>21:15 – 21:30</option></select><button id="next">继续填写取货详情</button>';
const contact='<h1>FAKE contact</h1><button data-autom="companionbar-button">显示订单摘要： RMB 9,999</button>'+[['姓氏','text'],['名字','text'],['电子邮件地址','email'],['联系人手机号码','tel'],['政府颁发的身份证件号码的后四位','text']].map(([n,t],i)=>`<input type="${t}" aria-label="${n}" required value="${i===2?'FAKE@example.invalid':i===3?'12345678901':i===4?'1234':'FAKE'}" ${i===4?'maxlength="4"':''}>`).join('')+'<button id="details">继续选择付款方式</button>';
const providerKeys=['alipay','wechat','credit','installments0001243254','installments0001864343','installments0001321713','installments0000882476','installments0000833448'];
const payment='<h1>你希望如何付款？</h1><button data-autom="companionbar-button">显示订单摘要： RMB 9,999</button>'+providerKeys.map(k=>{const id='checkout.billing.billingoptions.'+k;return `<input type="radio" name="FAKE-provider" id="${id}" aria-labelledby="${id}_label"><label id="${id}_label" for="${id}"><img alt="${k==='alipay'?'支付宝':k}"></label>`;}).join('')+'<button id="payment" data-autom="continue-button-review">检查订单</button>';
const review='<h1 class="rs-review-header">准备下单了吗？<span>请确保以下信息均准确无误。</span></h1><div class="rs-review-fulfillment"><h2 class="rs-review-shipquote">取货日期待付款完成后确定。</h2><button data-autom="changeShippingMethod">更改零售店</button><h2>iPhone 18 Pro 256GB 黑色</h2><p>数量 1</p><p>总计 RMB 9,999</p></div><div class="rs-review-billing"><h2 class="rs-review-title">付款方式</h2><div class="rs-review-billing-details"><div class="rs-review-billing-cards"><h3 class="rs-review-payment-header"><img class="rs-review-payment-image" alt="支付宝"></h3></div></div></div><a href="'+terms+'">条款和条件</a><button id="final">立即下单</button>';
async function world(){
 const context=await browser.newContext({serviceWorkers:'block'});await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort('blockedbyclient'));await context.routeWebSocket('**/*',s=>s.close());const page=await context.newPage();page.setDefaultTimeout(5000);await page.goto(origin,{waitUntil:'domcontentloaded'});await page.setContent('<html data-fake="c209"><body><div role="main" id="checkout-container">'+slots+'</div></body></html>',{waitUntil:'domcontentloaded'});
 await page.evaluate(({contact,payment,review})=>{const main=document.querySelector('[role="main"]');document.getElementById('next').onclick=()=>{main.innerHTML=contact;document.getElementById('details').onclick=()=>{main.innerHTML=payment;document.getElementById('payment').onclick=()=>{main.innerHTML=review;document.getElementById('final').onclick=()=>{document.documentElement.dataset.fakeFinals=String(Number(document.documentElement.dataset.fakeFinals||0)+1);};};};};},{contact,payment,review});
 const read=(cmd=null)=>page.evaluate(async({source,plan,cmd,address})=>{if(location.hostname!=='127.0.0.1'||document.documentElement.dataset.fake!=='c209')throw Error('OwnedFixtureOnly');return new Function('location','return ('+source+')')({href:address})(plan,cmd);},{source:merchantDocument.toString(),plan:PRO_PLAN,cmd,address});
 let counter=0;const api={sessionId:'FAKE-current-controlled-context',controlledReview:true,tabs:{get:async()=>({url:address,status:'complete'})},permissions:{contains:async()=>true},scripting:{executeScript:async q=>[{frameId:0,documentId:'FAKE-controlled-document',result:await read(q.args[1]??null)}]}};
 const row={...createPurchaseRecord(PRO_PLAN,{taskId:'FAKE-c209-task',planDigest:proDigest,tabId:7,now:Date.now(),id:()=>crypto.randomUUID()}),bagAddStarted:true,resourceWritten:true,bagTotalCny:9999,initialDates:['October 8'],dateCursor:0,floors:{'October 8':'21:15'}};
 const action=async(name,extra={})=>{const expected=await read();return read({action:name,id:'FAKE-action-'+(++counter),taskId:row.taskId,planDigest:proDigest,authorized:true,structured:true,expected:JSON.stringify(expected),...extra});};
 return {context,page,api,row,read,action};
}
async function reach(w){const s=await w.read();assert.equal(s.purchase.verified,true);const t=s.times.at(-1);assert.equal((await w.action('chooseSlot',{date:s.selectedDate,start:t.start,end:t.end,ref:t.ref})).delivered,true);assert.equal((await w.read()).contactStep?.verified,true);assert.equal((await w.action('fillDetails',{contactOnly:true})).delivered,true);assert.equal((await w.read()).paymentStep?.verified,true);assert.equal((await w.action('selectPayment',{paymentOnly:true})).delivered,true);assert.equal((await w.action('continuePayment',{paymentOnly:true})).delivered,true);}

test('C214 renderer-local production executor traverses real FAKE DOM to source-disclosed review; desktop fsync barrier precedes one final',async()=>{
 const w=await world(),contextId='FAKE-browser-renderer-context';let row={...w.row,desktopContext:contextId};const frames=[],actions=[];
 await w.page.exposeFunction('fakePersistedIntent',async command=>{actions.push(command.action);assert.equal(row.pending?.id,command.id);if(command.action==='submitOrder')assert.equal(row.finalIntent?.sent,true);return true;});
 await w.page.evaluate(async({contextId,address})=>{
  const {CheckoutRpcPeer}=await import('/web/checkout-connector/checkout-rpc-peer.js');const {merchantDocument}=await import('/web/checkout-connector/page-program.js');
  const chrome={locks:navigator.locks,tabs:{create:async()=>({id:7,status:'complete'}),get:async()=>({url:address,status:'complete'}),remove:async()=>{}},permissions:{contains:async()=>true},scripting:{executeScript:async q=>{
   if(q.func!==merchantDocument||q.target.tabId!==7||location.hostname!=='127.0.0.1')throw Error('OwnedFixtureOnly');
   if(q.args[1])await globalThis.fakePersistedIntent(q.args[1]);
   return [{frameId:0,documentId:'FAKE-controlled-document',result:await new Function('location','return ('+merchantDocument.toString()+')')({href:address})(...q.args)}];
  }}};
  globalThis.fakeR2Peer=new CheckoutRpcPeer({api:chrome,contextId,purchaseAllowed:true});
 },{contextId,address});
 const api=new NativeCheckoutApi({contextId,exchange:q=>{frames.push(q.operation);return w.page.evaluate(q=>globalThis.fakeR2Peer.receive(q),q);}});
 const store={get:async()=>structuredClone(row),put:async(k,v)=>{assert.equal(k,TASK_KEY);row=structuredClone(v);},acquireOwner:async()=>({owned:true,release:async()=>{}})};
 const runtime=new DesktopCheckoutRuntime({executor:'browser',store,launch:async()=>({api,close:()=>api.close()})});
 try{
  await runtime.open();const start=frames.length;const result=await runtime.advance({checkoutApproved:true,newContextConfirmed:true});assert.equal(result.phase,'REVIEW');assert.ok(runtime.finalDescriptor?.reviewProgressId);assert.equal(runtime.finalDescriptor.pickupNotice,'取货日期待付款完成后确定。');assert.deepEqual(actions,['chooseSlot','fillDetails','selectPayment','continuePayment']);assert.equal(frames.slice(start).filter(x=>x==='merchantDocument').length,1);
  // The native fake page deliberately has no receipt: the same order stays unknown, never a second final.
  await assert.rejects(runtime.submit({termsAccepted:true,existingOrdersChecked:true,noExtras:true}),/FinalConsent|R2/);assert.equal(row.finalIntent.sent,true);assert.equal(row.pending.action,'submitOrder');assert.notEqual(row.state,'CONFIRMED_UNPAID');assert.equal(actions.filter(x=>x==='submitOrder').length,1);assert.equal(await w.page.evaluate(()=>document.documentElement.dataset.fakeFinals),'1');
  await assert.rejects(runtime.submit({termsAccepted:true,existingOrdersChecked:true,noExtras:true}));assert.equal(actions.filter(x=>x==='submitOrder').length,1);
 }finally{await runtime.close();await w.context.close();}
});
