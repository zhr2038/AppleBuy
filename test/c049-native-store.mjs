// Root quota self-check. Native DOM only on owned loopback; all addresses, quantity line, slots and API results FAKE.
import assert from 'node:assert/strict';
import http from 'node:http';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
const {chromium}=createRequire(import.meta.url)(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{tradeIn:'none',appleCare:'none'}};
const nativeLabel='<label class="form-selector-label" for="fake-store"><span>1</span><span class="form-selector-title">Apple 大连恒隆广场</span><span>明天 可取货</span><span>店内取货</span></label>';
const body=(legacy=false)=>`<h1>FAKE自提</h1><button role="radio" aria-checked="true">我要取货</button><button role="radio" aria-checked="false">为我送货</button><p>数量：1</p><button data-autom="companionbar-button">显示订单摘要： RMB 9,999</button><input type="radio" name="store-locator-result" id="fake-store" value="R609" checked>${legacy?'<label for="fake-store">1 Apple 大连恒隆广场 今天 可取货 店内取货</label>':nativeLabel}<ul class="rt-storelocator-store-multipleavailability-list"><li class="rt-storelocator-store-multipleavailability-item"><div class="column large-7">iPhone 18 Pro 256GB 黑色</div></li></ul><fieldset><legend class="rs-pickup-slottitle">为你的 iPhone 18 Pro 选择取货日期：</legend><input type="radio" name="bartPickupDateSelectorButtonGroup" id="date" value="FAKE-date" checked><label for="date">October 5</label><select data-autom="pickup-availablewindow-dropdown"><option selected>21:15–21:30</option></select></fieldset><button>继续填写取货详情</button>`;
let server,browser,origin,serial=0;const results=[],contexts=new Set(),cleanup={contextsClosed:0,browserClosed:false,serverClosed:false,errors:[]};
async function check(name,{legacy=false,mutate=null,allowed=false,path='/shop/checkout',auth=false,choose=false}={}){
 let c;
 try{
  c=await browser.newContext({serviceWorkers:'block'});contexts.add(c);await c.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort('blockedbyclient'));await c.routeWebSocket('**/*',s=>s.close());
  const p=await c.newPage();await p.goto(origin);await p.setContent('<html data-fake="c049"><main>'+body(legacy)+'</main></html>');if(mutate)await p.evaluate(mutate);
  const run=async command=>p.evaluate(async ({source,plan,path,command})=>{if(location.hostname!=='127.0.0.1'||document.documentElement.dataset.fake!=='c049')throw Error('OwnedFixtureOnly');return await(new Function('location',`return (${source});`))({href:'https://secure8.www.apple.com.cn'+path})(plan,command);},{source:merchantDocument.toString(),plan,path,command});
  const r=await run(null);
  if(auth){assert.equal(r.phase,'AUTH');assert.equal(r.verifiedStep,false);}else if(allowed){assert.equal(r.purchase.store,plan.stores[0]);assert.equal(r.purchase.verified,true);assert.equal(r.phase,'SLOTS');}else if(choose){assert.equal(r.phase,'FULFILLMENT');const reply=await run({id:'FAKE-c049-'+(++serial),taskId:'FAKE-task',authorized:true,structured:true,expected:JSON.stringify(r),action:'selectStore',store:plan.stores[0]});assert.equal(reply.delivered,true);assert.equal((await run(null)).purchase.store,plan.stores[0]);}else{assert.equal(r.purchase.verified,false);assert.equal(r.purchase.store,null);}
  results.push({name,pass:true,phase:r.phase,store:r.purchase?.store??null});
 }catch(e){results.push({name,pass:false,error:String(e.message).slice(0,160)});}
 finally{if(c){try{await c.close();contexts.delete(c);cleanup.contextsClosed++;}catch{cleanup.errors.push('context-close');}}}
}
try{
 server=http.createServer((q,r)=>r.end('<!doctype html><title>FAKE C049</title>'));await new Promise(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${server.address().port}`;browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 await check('legacy-spaced-today-control',{legacy:true,allowed:true});
 await check('observed-compact-tomorrow',{allowed:true});
 await check('observed-unchecked-native-choice',{choose:true,mutate:()=>document.querySelector('#fake-store').checked=false});
 await check('wrong-store-id',{mutate:()=>document.querySelector('#fake-store').value='R610'});
 await check('wrong-complete-title',{mutate:()=>document.querySelector('.form-selector-title').textContent='Apple 北京 FAKE'});
 await check('hidden-native-title',{mutate:()=>document.querySelector('.form-selector-title').hidden=true});
 await check('duplicate-native-title',{mutate:()=>{const t=document.querySelector('.form-selector-title');t.after(t.cloneNode(true));}});
 await check('duplicate-associated-label',{mutate:()=>{const l=document.querySelector('label[for="fake-store"]');l.after(l.cloneNode(true));}});
 await check('wrong-current-day-caption',{mutate:()=>document.querySelector('label[for="fake-store"] span:nth-child(3)').textContent='未知状态'});
 await check('plain-official-sign-in-auth',{path:'/shop/signIn',auth:true});
 await check('existing-order-sign-in-auth',{path:'/shop/signIn/orders',auth:true});
}finally{
 for(const c of contexts){try{await c.close();cleanup.contextsClosed++;}catch{cleanup.errors.push('remaining-context-close');}}
 if(browser){try{await browser.close();cleanup.browserClosed=true;}catch{cleanup.errors.push('browser-close');}}
 if(server){await new Promise(r=>server.close(r));cleanup.serverClosed=true;}
}
console.log(JSON.stringify({scope:'FAKE native store/AUTH self-check; explicit quantity line synthetic',personalProfileUsed:false,realAppleVisited:false,realPurchase:false,results,cleanup},null,2));if(results.some(r=>!r.pass)||cleanup.errors.length)process.exitCode=1;
