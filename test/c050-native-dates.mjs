// Root quota self-check. Owned loopback/native DOM; explicit quantity, API, dates, slots and outcomes FAKE.
import assert from 'node:assert/strict';
import http from 'node:http';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
import {ChromePort} from '../web/checkout-connector/chrome-port.js';
import {PurchaseJob,TASK_KEY} from '../web/checkout-connector/job.js';
const {chromium}=createRequire(import.meta.url)(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{tradeIn:'none',appleCare:'none'}};
const date=(v,legacy=false)=>`<input type="radio" name="bartPickupDateSelectorButtonGroup" id="d${v}" value="${v}" ${v===5?'checked':''}><label for="d${v}" ${legacy?'':'class="form-selector-label"'}>${legacy?'October '+v:'<span>october</span><span>'+v+'</span>'}</label>`;
const fixture=legacy=>`<html data-fake="c050"><main><h1>FAKE时段</h1><button role="radio" aria-checked="true">我要取货</button><p>数量：1</p><button data-autom="companionbar-button">显示订单摘要： RMB 9,999</button><input type="radio" name="store-locator-result" id="s" value="R609" checked><label for="s">1 Apple 大连恒隆广场 今天 可取货 店内取货</label><ul class="rt-storelocator-store-multipleavailability-list"><li class="rt-storelocator-store-multipleavailability-item"><div class="column large-7">iPhone 18 Pro 256GB 黑色</div></li></ul><fieldset><legend class="rs-pickup-slottitle">为你的 iPhone 18 Pro 选择取货日期：</legend>${date(5,legacy)+date(6,legacy)}<select data-autom="pickup-availablewindow-dropdown"><option disabled selected>可选时段</option><option>20:45–21:00</option><option>21:15–21:30</option></select></fieldset><button id="next">继续填写取货详情</button></main></html>`;
let browser,server,origin;const results=[],contexts=new Set(),cleanup={contextsClosed:0,browserClosed:false,serverClosed:false,errors:[]};
async function check(name,{legacy=false,mutate=null,good=false,pipeline=false}={}){
 let c;
 try{
  c=await browser.newContext({serviceWorkers:'block'});contexts.add(c);await c.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort('blockedbyclient'));await c.routeWebSocket('**/*',s=>s.close());const p=await c.newPage();await p.goto(origin);await p.setContent(fixture(legacy));if(mutate)await p.evaluate(mutate);
  const decode=async cmd=>p.evaluate(async({source,plan,cmd})=>{if(location.hostname!=='127.0.0.1'||document.documentElement.dataset.fake!=='c050')throw Error('OwnedFixtureOnly');return await(new Function('location',`return (${source});`))({href:'https://secure8.www.apple.com.cn/shop/checkout'})(plan,cmd);},{source:merchantDocument.toString(),plan,cmd});
  const o=await decode(null);assert.equal(o.phase,'SLOTS');
  if(good){assert.equal(o.listComplete,true);assert.deepEqual(o.dates.map(d=>d.label),legacy?['October 5','October 6']:['october5','october6']);assert.equal(o.selectedDate,o.dates[0].label);assert.equal(o.times.at(-1).start,'21:15');}else assert.equal(o.listComplete,false);
  const actions=[];
  if(pipeline){
   await p.evaluate(()=>document.querySelector('#next').addEventListener('click',()=>document.querySelector('main').innerHTML='<h1>FAKE unknown after slot</h1>'));
   let stored=null;const store={get:async()=>structuredClone(stored),put:async(k,v)=>{assert.equal(k,TASK_KEY);stored=structuredClone(v);}};
   const api={tabs:{get:async()=>({url:'https://secure8.www.apple.com.cn/shop/checkout'})},permissions:{contains:async()=>true},scripting:{executeScript:async q=>{if(q.args[1])actions.push(q.args[1].action);return [{frameId:0,documentId:'FAKE-c050',result:await decode(q.args[1]??null)}];}}};
   const j=new PurchaseJob({store,port:new ChromePort(api,7,{authorized:true}),maxWaitMs:0});const r=await j.run(plan,{tabId:7,planDigest:'FAKE-digest'});assert.deepEqual(actions,['chooseSlot']);assert.equal(r.pending.action,'chooseSlot');assert.equal(r.pending.start,'21:15');assert.deepEqual(r.initialDates,['october5','october6']);
   await new PurchaseJob({store,port:new ChromePort(api,7,{authorized:true,initialSequence:stored.lastRead,pending:stored.pending}),maxWaitMs:0}).run(plan,{tabId:7,planDigest:'FAKE-digest'});assert.deepEqual(actions,['chooseSlot']);
  }
  results.push({name,pass:true,complete:o.listComplete,dates:o.dates.map(d=>d.label),actions});
 }catch(e){results.push({name,pass:false,error:String(e.message).slice(0,180)});}
 finally{if(c){try{await c.close();contexts.delete(c);cleanup.contextsClosed++;}catch{cleanup.errors.push('context-close');}}}
}
try{
 server=http.createServer((q,r)=>r.end('<!doctype html><title>FAKE C050</title>'));await new Promise(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${server.address().port}`;browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 await check('legacy-spaced-month',{legacy:true,good:true});await check('actual-compact-lowercase-group',{good:true});await check('native-two-date-terminal-job-no-repeat',{good:true,pipeline:true});
 await check('wrong-day-value',{mutate:()=>document.querySelector('#d6').value='7'});
 await check('unknown-month-member',{mutate:()=>document.querySelector('label[for="d6"]').firstElementChild.textContent='unknown'});
 await check('hidden-label-member',{mutate:()=>document.querySelector('label[for="d6"]').hidden=true});
 await check('duplicate-associated-label',{mutate:()=>{const l=document.querySelector('label[for="d6"]');l.after(l.cloneNode(true));}});
 await check('hidden-date-control',{mutate:()=>document.querySelector('#d6').hidden=true});
 await check('duplicate-native-value',{mutate:()=>{const d=document.querySelector('#d6');d.after(d.cloneNode(true));}});
}finally{
 for(const c of contexts){try{await c.close();cleanup.contextsClosed++;}catch{cleanup.errors.push('remaining-context-close');}}
 if(browser){try{await browser.close();cleanup.browserClosed=true;}catch{cleanup.errors.push('browser-close');}}if(server){await new Promise(r=>server.close(r));cleanup.serverClosed=true;}
}
console.log(JSON.stringify({scope:'FAKE native date/controller author self-check; no real slot/order',results,cleanup},null,2));if(results.some(r=>!r.pass)||cleanup.errors.length)process.exitCode=1;
