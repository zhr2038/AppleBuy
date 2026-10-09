// Contained real DOM/production parser/port/job. Every merchant, identity and resulting order is FAKE.
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {createRequire} from 'node:module';import {homedir} from 'node:os';import {join} from 'node:path';
import {merchantDocument} from '../web/checkout-connector/page-program.js';import {ChromePort} from '../web/checkout-connector/chrome-port.js';
import {PurchaseJob,createPurchaseRecord,TASK_KEY,CONTACT_SLOT_BASIS} from '../web/checkout-connector/job.js';
import {PRO_PLAN,proDigest} from '../src/desktop/browser-session.mjs';import {currentReviewProgress} from '../web/checkout-connector/review-progress.js';
import {CheckoutRpcPeer} from '../web/checkout-connector/checkout-rpc-peer.js';
import {NativeCheckoutApi} from '../src/desktop/native-checkout-api.mjs';
import {DesktopCheckoutRuntime} from '../src/desktop/checkout-runtime.mjs';
const {chromium}=createRequire(import.meta.url)(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const address='https://secure10.www.apple.com.cn/shop/checkout',terms='https://www.apple.com.cn/shop/browse/open/salespolicies';let server,browser,origin;
before(async()=>{server=http.createServer((q,r)=>r.end('FAKE C209'));await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--disable-background-networking']});});
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

import {reviewCheckCodes,REVIEW_CHECK_CODES} from '../web/checkout-connector/review-diagnostic.js';
import {runInBrowser} from '../src/desktop/r2-browser-run.mjs';
import {R2_VERSION,rowPatch,digest} from '../web/checkout-connector/r2-protocol.js';
import {canonicalJson} from '../web/checkout-connector/job.js';
test('C227 positive originating native progression remains ready without a failure diagnostic',async()=>{const w=await world();try{await reach(w);const o=await w.read();assert.ok(o.reviewProgress);assert.deepEqual(reviewCheckCodes(o.reason),[]);}finally{await w.context.close();}});
for(const [name,change,code]of [
 ['missing',()=>{delete globalThis.__applebuyControlledCheckout;},'trace-missing'],
 ['main replaced',()=>{const m=document.querySelector('[role="main"]');m.replaceWith(m.cloneNode(true));},'document-changed'],
 ['url mismatch',()=>{globalThis.__applebuyControlledCheckout.href+='?FAKE';},'document-changed'],
 ['intervention',()=>{globalThis.__applebuyControlledCheckout.intervened=true;},'interaction-detected'],
 ['payment not recorded',()=>{globalThis.__applebuyControlledCheckout.stage='contact-accepted';},'payment-step-unconfirmed'],
 ['already submitted',()=>{globalThis.__applebuyControlledCheckout.finalSent=true;},'final-already-sent'],
 ['root replaced',()=>{document.querySelector('[role="main"]').id='FAKE-other';},'review-root'],
 ['item changed',()=>{document.querySelector('.rs-review-fulfillment h2:not(.rs-review-shipquote)').textContent='iPhone 18 Pro 512GB 黑色';},'item'],
 ['quantity changed',()=>{document.querySelector('.rs-review-fulfillment p').textContent='数量 2';},'quantity'],
 ['amount changed',()=>{globalThis.__applebuyControlledCheckout.totalCny=9998;},'amount'],
 ['provider changed',()=>{document.querySelector('.rs-review-payment-image').alt='微信';},'payment-method'],
 ['terms absent',()=>{document.querySelector('a').remove();},'terms'],
 ['notice changed',()=>{document.querySelector('.rs-review-shipquote').textContent='FAKE unavailable';},'pickup-notice'],
 ['edit missing',()=>{document.querySelector('[data-autom="changeShippingMethod"]').remove();},'store-edit']
])test('C227 closed diagnostic for '+name+' leaves failed proof and no final',async()=>{const w=await world();try{await reach(w);await w.page.evaluate(change);const o=await w.read();assert.equal(o.reviewProgress,null);assert.ok(reviewCheckCodes(o.reason).includes(code),JSON.stringify({reason:o.reason,phase:o.phase}));assert.equal(await w.page.evaluate(()=>document.documentElement.dataset.fakeFinals||'0'),'0');}finally{await w.context.close();}});
test('C227 absent proof cannot leak private strings through diagnostics',async()=>{const w=await world();try{await reach(w);await w.page.evaluate(()=>{globalThis.__applebuyControlledCheckout.stage='FAKE_PRIVATE';document.querySelector('h1').textContent='FAKE_PRIVATE';});const o=await w.read();assert.ok(reviewCheckCodes(o.reason).length);assert.equal(o.reason.includes('FAKE_PRIVATE'),false);}finally{await w.context.close();}});
test('C227 malformed diagnostic is discarded instead of being reflected in UI',()=>{for(const v of [null,{},'review-check:secret; no automatic repeat','review-check:item,item; no automatic repeat','review-check:; no automatic repeat','review-check:item; no automatic repeatX'])assert.deepEqual(reviewCheckCodes(v),[]);for(const c of REVIEW_CHECK_CODES)assert.deepEqual(reviewCheckCodes('review-check:'+c+'; no automatic repeat'),[c]);});
test('C227 R1 complete runtime exposes the failed current review and preserves pending payment without final',async()=>{
 const w=await world();await reach(w);await w.page.evaluate(()=>{document.querySelector('a').remove();});
 const contextId='FAKE-c227-owned-current-context';let row={...w.row,desktopContext:contextId,state:'NEEDS_VERIFICATION',acceptedSlot:{date:'October 8',start:'21:15',end:'21:30',verified:true,basis:CONTACT_SLOT_BASIS},pending:{id:'FAKE-pending',action:'continuePayment',beforePhase:'PAYMENT',paymentOnly:true,documentId:'FAKE-controlled-document',deadline:Date.now()-1}};
 const pending=structuredClone(row.pending),states=[],actions=[];
 const chrome={tabs:{create:async()=>({id:7,status:'complete'}),get:w.api.tabs.get,remove:async()=>{}},permissions:w.api.permissions,scripting:{executeScript:async q=>{if(q.args[1])actions.push(q.args[1].action);return w.api.scripting.executeScript(q);}}};
 const peer=new CheckoutRpcPeer({api:chrome,contextId,purchaseAllowed:true}),api=new NativeCheckoutApi({contextId,exchange:q=>peer.receive(q)}),store={get:async()=>structuredClone(row),put:async(k,v)=>{row=structuredClone(v);},acquireOwner:async()=>({owned:true,release:async()=>{}})};
 const runtime=new DesktopCheckoutRuntime({store,launch:async()=>({api,close:()=>api.close()}),onState:s=>states.push(s)});
 try{await runtime.open();await runtime.advance({checkoutApproved:true,newContextConfirmed:true});assert.ok(states.some(s=>s.reviewDiagnostic?.includes('terms')));assert.deepEqual(row.pending,pending);assert.equal(row.finalIntent,null);assert.equal(runtime.finalDescriptor,null);assert.deepEqual(actions,[]);}finally{await runtime.close();await w.context.close();}
});
test('C227 R2 committed diagnostic survives checkpoint without creating any mutation intent',async()=>{
 let row={...createPurchaseRecord(PRO_PLAN,{taskId:'FAKE-r2',planDigest:proDigest,tabId:7,now:Date.now(),id:()=>crypto.randomUUID()}),desktopContext:'FAKE-c227-r2',lastPhase:'REVIEW'};
 const original=structuredClone(row),after={...row,state:'NEEDS_VERIFICATION',reason:'review-check:terms; no automatic repeat'},states=[];let polls=0;
 const api={sessionId:row.desktopContext,r2Exchange:async(op,p)=>{
 if(op==='r2Begin')return {version:R2_VERSION};if(op==='r2Chunk')return {sequence:p.sequence};if(op==='r2Run')return {started:true};if(op==='r2Ack')return {committed:true};if(op==='r2Finish')return {finished:true};
 if(op==='r2Poll')return polls++===0?{running:true,checkpoint:{sequence:1,previous:await digest(canonicalJson(original)),sha256:await digest(canonicalJson(after)),patch:rowPatch(original,after)}}:{running:false,result:{state:after.state,phase:'REVIEW',reason:after.reason,realOrderVerified:false}};throw Error(op);}};
 await runInBrowser({api,store:{get:async()=>structuredClone(row),put:async(k,v)=>{row=structuredClone(v);}},record:original,run:{},port:{},proofs:{},onState:s=>states.push(s)});
 assert.deepEqual(reviewCheckCodes(states[0].reason),['terms']);assert.equal(row.pending,null);assert.equal(row.finalIntent,null);
});
