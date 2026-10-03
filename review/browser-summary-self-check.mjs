// Codex independent C029 checks: rendered, isolated fresh Chrome; FAKE loopback only.
// No personal browser/profile/extension, actual merchant, credentials, slot, order or payment.
import assert from 'node:assert/strict';
import http from 'node:http';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
import {ChromePort} from '../web/checkout-connector/chrome-port.js';
import {PurchaseJob,TASK_KEY} from '../web/checkout-connector/job.js';
const root=resolve(import.meta.dirname,'..'),out=join(root,'.local/reviewer/c029-rendered-'+new Date().toISOString().replace(/[:.]/g,'-'));
mkdirSync(out);
const require=createRequire(import.meta.url),bundle=join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {chromium}=require(bundle);
const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{tradeIn:'none',appleCare:'none'}};
const template=readFileSync(join(root,'review/fixtures/current-public-checkout.html'),'utf8').replace('__SYNTHETIC_QUANTITY__','');
const summary=`<div id="fake-summary" role="dialog" aria-modal="true" hidden>
<span class="visuallyhidden">订单摘要</span>
<div class="rs-companionbar-ordersummary-section"><div class="rs-companionbar-ordertotal"><div class="rs-order-item-details"><p class="row rs-companionbar-bagitemrow"><span class="column large-6 rs-companionbar-items">1 件商品</span></p></div></div></div>
<div class="row rs-companionbar-summary-subtotal">小计 <span>RMB 9,999</span></div>
<div class="row rs-companionbar-summary-shipping">运费 <span>免费</span></div>
<div class="row rs-companionbar-total-row">总计 <span>RMB 9,999</span></div>
<button id="fake-close" aria-label="关闭"></button></div>`;
const html=template.replace('<div role="main">','<section id="fake-main-wrap"><div role="main">').replace('</div></body>','</div></section>'+summary+'</body>');
const report={scope:'FAKE isolated rendered C029 summary integration',personalProfileUsed:false,actualApplePageVisited:false,actualExtensionInstalledOrGranted:false,officialQuantityContractProven:false,realOrderCreated:false,checks:[],network:{allowedPageRequests:0,blockedPageRequests:0},cleanup:{contextsClosed:0,browserClosed:false,serverClosed:false,errors:[]}};
const contexts=new Set();let browser,server,origin,seq=0;
async function check(name,fn){try{const data=await fn();report.checks.push({name,passed:true,...data});console.log('PASS '+name);}catch(e){report.checks.push({name,passed:false,error:String(e.message).slice(0,500)});console.log('FAIL '+name+' '+e.message);}}
async function fixture(){const context=await browser.newContext({serviceWorkers:'block'});contexts.add(context);
  await context.route('**/*',async r=>{if(new URL(r.request().url()).origin===origin){report.network.allowedPageRequests++;await r.continue();}else{report.network.blockedPageRequests++;await r.abort();}});
  await context.routeWebSocket('**/*',s=>s.close());
  const page=await context.newPage();await page.goto(origin);
  await page.evaluate(()=>{const wrap=document.querySelector('#fake-main-wrap'),dialog=document.querySelector('#fake-summary');globalThis.fakeCounts={open:0,close:0,pickup:0};
    document.querySelector('[data-autom="companionbar-button"]').addEventListener('click',()=>{fakeCounts.open++;wrap.inert=true;wrap.setAttribute('aria-hidden','true');dialog.hidden=false;});
    document.querySelector('#fake-close').addEventListener('click',()=>{fakeCounts.close++;dialog.hidden=true;wrap.inert=false;wrap.removeAttribute('aria-hidden');});
    document.querySelector('#pickup').addEventListener('click',()=>fakeCounts.pickup++);});
  return {page,context};
}
async function decode(page,command=null){return page.evaluate(async({source,intent,cmd})=>{const u=new URL(location.href);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||document.documentElement.dataset.applebuySelfcheck!=='fake-renderer/v1')throw Error('OfflineSelfCheckOnly');
  return await new Function('location','return ('+source+')')({href:'https://secure6.www.apple.com.cn/shop/checkout'})(intent,cmd);
},{source:merchantDocument.toString(),intent:plan,cmd:command});}
async function cmd(page,action,extra={}){return {id:'FAKE-c029-rendered-'+(++seq),taskId:'FAKE-c029-task',authorized:true,structured:true,action,expected:JSON.stringify(await decode(page)),...extra};}
const read=async p=>decode(p,await cmd(p,'readOrderSummary',{summaryKey:'FAKE-rendered-key'}));
const counts=p=>p.evaluate(()=>fakeCounts);
async function close(c){await c.close();contexts.delete(c);report.cleanup.contextsClosed++;}
function api(page,acts){return {tabs:{get:async()=>({url:'https://secure6.www.apple.com.cn/shop/checkout'})},permissions:{contains:async()=>true},scripting:{executeScript:async x=>{const command=x.args[1];if(command)acts.push(command.action);return [{frameId:0,documentId:'FAKE-c029-rendered-doc',result:await decode(page,command)}];}}};}
try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking']});report.browserVersion=browser.version();
 server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"});res.end(html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 await check('real-renderer-open-read-close-one-piece-summary-then-pickup-once',async()=>{const {page,context}=await fixture();const before=await decode(page);assert.equal(before.purchase.quantity,null);assert.equal(before.summaryReadable,true);
   assert.deepEqual(await read(page),{delivered:true,summary:{goodsCount:1,subtotalCny:9999,totalCny:9999,shipping:'免费'}});const o=await decode(page);assert.equal(o.quantitySource,'order-summary');assert.equal(o.purchase.quantity,1);assert.equal(o.purchase.itemVerified,true);
   assert.equal(await page.locator('#fake-main-wrap').getAttribute('aria-hidden'),null);assert.equal(await page.locator('#fake-summary').isVisible(),false);assert.equal((await decode(page,await cmd(page,'selectPickup'))).delivered,true);assert.deepEqual(await counts(page),{open:1,close:1,pickup:1});await close(context);return {fakeChromeApi:false,quantitySource:'explicit-piece-label'};});
 await check('synthetic-two-pieces-never-inferred-one-from-same-money',async()=>{const {page,context}=await fixture();await page.locator('.rs-companionbar-items').evaluate(e=>e.textContent='2 件商品');assert.equal((await read(page)).delivered,true);const o=await decode(page);assert.equal(o.purchase.quantity,2);assert.equal(o.purchase.itemVerified,false);const r=await decode(page,await cmd(page,'selectPickup'));assert.equal(r.delivered,false);assert.equal(r.touched,false);assert.equal((await counts(page)).pickup,0);await close(context);return {twoPieceLabelAndSamePriceSynthetic:true};});
 await check('auth-challenge-prevents-summary-and-pickup',async()=>{const {page,context}=await fixture();await page.evaluate(()=>{const e=document.createElement('input');e.type='password';document.querySelector('[role="main"]').append(e);});assert.equal((await decode(page)).phase,'AUTH');assert.equal((await read(page)).touched,false);assert.deepEqual(await counts(page),{open:0,close:0,pickup:0});await close(context);return {authenticationFieldEmptySynthetic:true};});
 await check('summary-closing-control-must-be-exact-observed-close-not-close-order',async()=>{const {page,context}=await fixture();await page.locator('#fake-close').evaluate(e=>e.setAttribute('aria-label','关闭订单'));const r=await read(page);assert.equal(r.delivered,false);assert.equal(r.reason,'OrderSummaryCloseUnrecognized');assert.equal((await counts(page)).close,0);assert.equal((await counts(page)).pickup,0);await close(context);return {nonObservedCloseOrderLabelSynthetic:true};});
 await check('current-order-change-between-read-and-pickup-prevents-action',async()=>{const {page,context}=await fixture();assert.equal((await read(page)).delivered,true);const c=await cmd(page,'selectPickup');await page.locator('.rs-fulfillment-productstrip-content').evaluate(e=>e.textContent='iPhone 18 Pro 256GB 白色');const r=await decode(page,c);assert.equal(r.delivered,false);assert.equal(r.touched,false);assert.equal((await counts(page)).pickup,0);await close(context);return {colourChangeSynthetic:true};});
 await check('fresh-port-masks-previous-port-summary-until-its-own-current-read',async()=>{const {page,context}=await fixture(),acts=[],a=new ChromePort(api(page,acts),7,{authorized:true,orderSummary:true});await a.observe(plan);await a.readSummary(plan,'FAKE-c029-task');assert.equal((await a.observe(plan)).purchase.quantity,1);const b=new ChromePort(api(page,acts),7,{authorized:true,orderSummary:true});const o=await b.observe(plan);assert.equal(o.purchase.quantity,null);await assert.rejects(b.act({action:'selectPickup',documentId:o.documentId,plan}),/CurrentOperationNotAuthorized/);await b.readSummary(plan,'FAKE-c029-task');assert.equal((await b.observe(plan)).purchase.quantity,1);assert.deepEqual(await counts(page),{open:2,close:2,pickup:0});await close(context);return {ChromeApiAndDocumentIdSynthetic:true};});
 await check('pending-checkout-reconciles-and-next-pickup-one-no-checkout-repeat',async()=>{const {page,context}=await fixture(),acts=[],port=new ChromePort(api(page,acts),7,{authorized:true,orderSummary:true}),rows=new Map(),store={get:async k=>structuredClone(rows.get(k)),put:async(k,v)=>rows.set(k,structuredClone(v))};
   const job=new PurchaseJob({store,port,maxSteps:4,now:()=>1000,id:()=> 'FAKE-c029-task'}),pending={id:'FAKE-checkout-sent',action:'checkout',documentId:'FAKE-earlier-bag-doc',beforePhase:'BAG',deadline:10000};
   const record={schema:'applebuy-purchase-job/v1',taskId:'FAKE-c029-task',plan:structuredClone(plan),planDigest:'FAKE-c029-digest',tabId:7,state:'NEEDS_VERIFICATION',lastPhase:'BAG',lastDocumentId:null,entryDocumentId:null,reason:null,pending,finalIntent:null,orderRefHash:null,initialDates:null,dateCursor:0,floors:{},rejected:[],refusals:0,lastRead:0,expiresAt:100000,bagAddStarted:true,resourceWritten:true,untouchedFailures:0,untouchedStreak:0,quotedCny:null,bagTotalCny:9999,mode:'purchase'};await store.put(TASK_KEY,record);
   const r=await job.run(plan,{tabId:7,planDigest:'FAKE-c029-digest'});assert.equal(r.state,'NEEDS_VERIFICATION');assert.equal(r.reason,'step-bound-reached');assert.deepEqual(acts,['readOrderSummary','selectPickup']);assert.equal((await store.get(TASK_KEY)).pending,null);assert.deepEqual(await counts(page),{open:1,close:1,pickup:1});await close(context);return {ChromeApiStorageAuthoritySynthetic:true};});
 await check('read-only-port-has-zero-disclosure-and-pickup',async()=>{const {page,context}=await fixture(),acts=[],port=new ChromePort(api(page,acts),7,{mode:'observe',orderSummary:true});await port.observe(plan);await assert.rejects(port.readSummary(plan,'FAKE-task'),/SummaryDisclosureNotAuthorized/);assert.deepEqual(acts,[]);assert.deepEqual(await counts(page),{open:0,close:0,pickup:0});await close(context);return {ChromeApiSynthetic:true};});
 report.passed=report.checks.length===8&&report.checks.every(x=>x.passed);
}catch(e){report.passed=false;report.error=String(e.stack||e).slice(0,1200);}
finally{for(const c of [...contexts])try{await close(c);}catch(e){report.cleanup.errors.push('context: '+e.message);}if(server){server.closeAllConnections?.();await new Promise(r=>server.close(e=>{if(e)report.cleanup.errors.push('server: '+e.message);else report.cleanup.serverClosed=true;r();}));}if(browser)try{await browser.close();report.cleanup.browserClosed=true;}catch(e){report.cleanup.errors.push('browser: '+e.message);}if(contexts.size||report.cleanup.errors.length||!report.cleanup.serverClosed||!report.cleanup.browserClosed)report.passed=false;writeFileSync(join(out,'result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,result:join(out,'result.json'),cleanup:report.cleanup}));if(!report.passed)process.exitCode=1;}
