// Root quota takeover. Isolated native DOM; all Chrome API, store, URLs, permissions and checkout results are FAKE.
// No personal profile, Apple request, extension load, contact, slot or real order.
import assert from 'node:assert/strict';
import http from 'node:http';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
import {ChromePort} from '../web/checkout-connector/chrome-port.js';
import {PurchaseJob,TASK_KEY,NO_EXTRAS} from '../web/checkout-connector/job.js';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const require=createRequire(import.meta.url),{chromium}=require(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{...NO_EXTRAS}};
const title='iPhone 18 Pro 256GB 黑色';
const action=(autom,caption,variant=title)=>`<button data-autom="${autom}"><span>${caption}</span><span class="visuallyhidden">${variant}</span></button>`;
const saved=()=>`<div class="rs-savedbyyou"><h2 class="rs-savedbyyou-title">个人收藏</h2><ul class="rs-savedbyyou-tiles" role="list"><li class="rs-product-list-item" role="listitem" data-autom="product-list-item-FAKE/A"><h3 class="rs-product-list-item-productname">iPhone 18 Pro Max 512GB FAKE橙色</h3><a class="rs-product-list-item-buybtn" data-autom="bag-item-buybtn" href="#fake">继续<span class="visuallyhidden">iPhone 18 Pro Max 512GB FAKE橙色</span></a></li><li class="rs-product-list-emptytile" role="listitem"></li></ul></div>`;
const fixture=({native=false,favorites=false}={})=>`<!doctype html><html data-applebuy-selfcheck="fake-c048/v1"><style>.visuallyhidden{position:absolute;clip:rect(1px,1px,1px,1px)}</style><main><h1>你的购物袋总计 RMB 9,999。</h1><div class="rs-bag-checkoutbutton-header"><button data-autom="checkout">结账</button></div><ol data-autom="bag-items"><li data-autom="bag-item-1"><h2>${title}</h2><label for="qty">数量</label><select id="qty" data-autom="item-quantity-dropdown"><option selected>1</option><option>2</option></select><select aria-hidden="true" style="visibility:hidden"><option selected>1</option><option>2</option></select>${native?action('bag-item-remove-button','移除')+action('bag-item-savelater-button','移入收藏'):`<button>移除 ${title}</button>`}<div class="rs-inline-recommendation">添加 AppleCare+<button>添加</button></div></li></ol><div>总计RMB 9,999</div><div class="rs-bag-checkoutbutton-bottom"><button data-autom="checkout">结账</button></div>${favorites?saved():''}</main></html>`;
const results=[],contexts=new Set();let browser,server,origin,serial=0;
const cleanup={contextsClosed:0,browserClosed:false,serverClosed:false,errors:[]};
async function check(name,options,mutate,expected='safe'){
 let context;
 try{
  context=await browser.newContext({serviceWorkers:'block'});contexts.add(context);
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort('blockedbyclient'));
  await context.routeWebSocket('**/*',socket=>socket.close());
  const page=await context.newPage();await page.goto(origin);await page.setContent(fixture(options));
  if(mutate)await page.evaluate(mutate);
  const evaluate=async cmd=>page.evaluate(async ({source,intent,cmd})=>{if(document.documentElement.dataset.applebuySelfcheck!=='fake-c048/v1'||location.hostname!=='127.0.0.1')throw Error('IsolatedFixtureOnly');const fakeLocation={href:'https://www.apple.com.cn/shop/bag'};return await (new Function('location',`return (${source});`))(fakeLocation)(intent,cmd);},{source:merchantDocument.toString(),intent:plan,cmd});
  const decoded=await evaluate(null),actions=[];
  let current={schema:'applebuy-purchase-job/v1',taskId:'FAKE-c048-old',plan:structuredClone(plan),planDigest:'FAKE-digest',tabId:7,state:'NEEDS_VERIFICATION',lastPhase:'BAG',lastDocumentId:'FAKE-old',entryDocumentId:'FAKE-entry',lastRead:10,expiresAt:1,initialDates:null,dateCursor:0,floors:{},rejected:[],refusals:0,pending:{id:'FAKE-view',action:'viewBag',documentId:'FAKE-old',beforePhase:'ACCESSORIES',deadline:1},finalIntent:null,orderRefHash:null,bagAddStarted:true,resourceWritten:true,untouchedFailures:0,untouchedStreak:0,quotedCny:9999,reconcileOnly:true,history:[{event:'FAKE-preserved'}]};
  const oldPending=structuredClone(current.pending),store={get:async()=>structuredClone(current),put:async(k,v)=>{assert.equal(k,TASK_KEY);current=structuredClone(v);}};
  const api={tabs:{get:async()=>({url:'https://www.apple.com.cn/shop/bag'})},permissions:{contains:async()=>true},scripting:{executeScript:async q=>{assert.equal(q.world,'ISOLATED');assert.equal(q.func,merchantDocument);if(q.args[1])actions.push(q.args[1].action);return [{frameId:0,documentId:'FAKE-c048-doc',result:await evaluate(q.args[1]??null)}];}}};
  const job=new PurchaseJob({store,port:new ChromePort(api,8,{mode:'observe',initialSequence:10}),now:()=>1000});
  const r=await job.run(plan,{tabId:8,planDigest:'FAKE-digest',rebind:true});
  assert.deepEqual(actions,[]);
  if(expected==='safe'){
   assert.equal(decoded.phase,'BAG');assert.equal(decoded.purchase.itemVerified,true);assert.equal(decoded.extras,false);assert.equal(r.pending,null);assert.equal(r.reconcileOnly,true);
   const retired=await job.retireReadOnlyBag(plan,{tabId:8,planDigest:'FAKE-digest'});assert.equal(retired.state,'RETIRED');assert.equal(retired.history[0].event,'FAKE-preserved');
   // On this isolated page only, the fake Checkout changes to an AUTH fixture; no real navigation or resource.
   await page.evaluate(()=>{for(const b of document.querySelectorAll('[data-autom="checkout"]'))b.addEventListener('click',()=>{document.querySelector('main').innerHTML='<h1>登录</h1><input type="password">';});});
   const purchase=new PurchaseJob({store,port:new ChromePort(api,8,{authorized:true,initialSequence:current.lastRead}),id:()=>`FAKE-c048-new-${++serial}`,now:()=>1000});
   const end=await purchase.run(plan,{tabId:8,planDigest:'FAKE-digest'});assert.deepEqual(actions,['checkout']);assert.equal(end.pending.action,'checkout');assert.equal(end.state,'NEEDS_USER');assert.equal(end.reason,'auth');assert.equal(end.retiredHistory.length,1);
  }else{assert.deepEqual(r.pending,oldPending);assert.notEqual(r.state,'CONFIRMED_UNPAID');}
  results.push({name,pass:true,phase:decoded.phase,quantity:decoded.purchase.quantity,itemVerified:decoded.purchase.itemVerified,extras:decoded.extras,actions});
 }catch(e){results.push({name,pass:false,error:String(e.message).slice(0,180)});}
 finally{if(context){try{await context.close();contexts.delete(context);cleanup.contextsClosed++;}catch{cleanup.errors.push('context-close');}}}
}
try{
 server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>FAKE C048</title>');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 await check('legacy-one-bag-baseline',{},null);
 await check('observed-action-captions',{native:true},null);
 await check('observed-actions-and-private-free-favorites',{native:true,favorites:true},null);
  await check('wrong-remove-variant',{native:true},()=>{document.querySelector('[data-autom="bag-item-remove-button"] .visuallyhidden').textContent='iPhone 18 Pro 512GB 黑色';},'blocked');
 await check('wrong-save-later-variant',{native:true},()=>{document.querySelector('[data-autom="bag-item-savelater-button"] .visuallyhidden').textContent='iPhone 18 Pro 512GB 黑色';},'blocked');
 await check('duplicate-native-remove',{native:true},()=>{const b=document.querySelector('[data-autom="bag-item-remove-button"]');b.after(b.cloneNode(true));},'blocked');
 await check('hidden-duplicate-native-save',{native:true},()=>{const b=document.querySelector('[data-autom="bag-item-savelater-button"]'),c=b.cloneNode(true);c.hidden=true;b.after(c);},'blocked');
 await check('unknown-unstructured-adjacent-label',{native:true},()=>{document.querySelector('[data-autom="bag-item-remove-button"]').removeAttribute('data-autom');},'blocked');
 await check('second-purchased-line',{native:true,favorites:true},()=>{const l=document.querySelector('ol[data-autom="bag-items"]');l.append(l.firstElementChild.cloneNode(true));},'blocked');
 await check('two-units',{native:true,favorites:true},()=>{document.querySelector('#qty').selectedIndex=1;},'blocked');
 await check('favorite-with-purchased-control',{native:true,favorites:true},()=>{const q=document.querySelector('#qty').cloneNode(true);document.querySelector('.rs-savedbyyou-tiles li').append(q);},'blocked');
  await check('duplicate-favorite-scope',{native:true,favorites:true},()=>{const s=document.querySelector('.rs-savedbyyou');s.after(s.cloneNode(true));},'blocked');
 await check('favorites-moved-inside-purchased-line',{native:true,favorites:true},()=>{document.querySelector('ol[data-autom="bag-items"] li').append(document.querySelector('.rs-savedbyyou'));},'blocked');
 await check('hidden-favorite-scope',{native:true,favorites:true},()=>{document.querySelector('.rs-savedbyyou').hidden=true;},'blocked');
 await check('duplicate-favorite-heading',{native:true,favorites:true},()=>{const h=document.querySelector('.rs-savedbyyou-title');h.after(h.cloneNode(true));},'blocked');
 await check('unknown-favorite-heading',{native:true,favorites:true},()=>{document.querySelector('.rs-savedbyyou-title').textContent='已购商品';},'blocked');
 await check('unknown-favorite-entry-caption',{native:true,favorites:true},()=>{document.querySelector('[data-autom="bag-item-buybtn"]').firstChild.textContent='结账';},'blocked');
 await check('checked-favorite-input',{native:true,favorites:true},()=>{const c=document.createElement('input');c.type='checkbox';c.checked=true;document.querySelector('.rs-savedbyyou li').append(c);},'blocked');
 await check('unrecognized-extra-product-outside-favorites',{native:true},()=>{const h=document.createElement('h3');h.textContent='iPhone 18 Pro Max 512GB FAKE橙色';document.querySelector('main').append(h);},'blocked');
}finally{
 for(const c of contexts){try{await c.close();cleanup.contextsClosed++;}catch{cleanup.errors.push('remaining-context-close');}}
 if(browser){try{await browser.close();cleanup.browserClosed=true;}catch{cleanup.errors.push('browser-close');}}
 if(server){await new Promise(resolve=>server.close(resolve));cleanup.serverClosed=true;}
}
console.log(JSON.stringify({scope:'FAKE isolated native bag replay; author self-check',realAppleVisited:false,personalProfileUsed:false,realOrderCreated:false,results,cleanup},null,2));
if(results.some(r=>!r.pass)||cleanup.errors.length||!cleanup.browserClosed||!cleanup.serverClosed)process.exitCode=1;
