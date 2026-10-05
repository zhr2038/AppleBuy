// Current observed Pro form shape; every DOM response, location, timing and Add effect below is FAKE. No Apple/person profile.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
import {PurchaseJob,TASK_KEY} from '../web/checkout-connector/job.js';
const {chromium}=createRequire(import.meta.url)(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{tradeIn:'none',appleCare:'none'}};
const BASE='/shop/buy-iphone/iphone-18-pro',SKU=BASE+'/mjt74ch/a',ORIGIN='https://www.apple.com.cn';
const html=action=>`<html data-fixture="FAKE-c069"><head><title>FAKE Pro form</title></head><body><div role="main"><h1>购买 iPhone 18 Pro</h1><form method="get" action="${action}"><input type="radio" id="model" name="model" checked><label for="model">iPhone 18 Pro</label><input type="radio" id="color" name="color" checked><label for="color">黑色</label><input type="radio" id="capacity" name="capacity" checked><label for="capacity">256GB RMB 9,999</label><input type="radio" id="trade" name="trade" checked><label for="trade">不折抵换购</label><input type="radio" id="care" name="care" checked><label for="care">不加 AppleCare+ 服务计划</label><span class="add-to-cart "><button type="submit" value="add-to-cart">添加到购物袋</button></span></form></div></body></html>`;
let browser;const contexts=new Set();const summary={checks:[],actualAppleVisited:false,personalProfileUsed:false,realAdd:false,cleanup:{contextsClosed:0,browserClosed:false,errors:[]}};
async function setup(action){const context=await browser.newContext({serviceWorkers:'block'});contexts.add(context);await context.route('**/*',r=>r.abort());await context.routeWebSocket('**/*',s=>s.close());const page=await context.newPage();await page.setContent(html(action));await page.evaluate(()=>{globalThis.fakeAdds=0;document.querySelector('button').onclick=e=>{e.preventDefault();globalThis.fakeAdds++;};});return {context,page};}
const read=(page,path,command=null)=>page.evaluate(async({source,path,command,plan})=>{if(document.documentElement.dataset.fixture!=='FAKE-c069')throw Error('OwnedFixtureOnly');return new Function('location','return ('+source+')')({href:'https://www.apple.com.cn'+path})(plan,command);},{source:merchantDocument.toString(),path,command,plan});
async function check(name,fn){let w;try{w=await fn();summary.checks.push({name,passed:true});console.log('PASS '+name);}catch(e){summary.checks.push({name,passed:false,error:String(e.message)});console.log('FAIL '+name+' '+e.message);}finally{for(const c of [...contexts]){await c.close();contexts.delete(c);summary.cleanup.contextsClosed++;}}}
try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking']});
 for(const [name,path,target,ready,loading] of [['base-before-SKU',BASE,BASE,false,true],['canonical-SKU',SKU,SKU,true,false],['wrong-form-target',SKU,BASE+'/FAKE-wrong/a',false,false],['foreign-form-target',SKU,'https://example.invalid'+SKU,false,false]])await check(name,async()=>{
  const w=await setup(target),o=await read(w.page,path);assert.equal(o.variantVerified,ready);assert.equal(o.productFormLoading===true,loading);
  const r=await read(w.page,path,{action:'addBag',id:'FAKE-'+name,taskId:'FAKE-task',authorized:true,structured:true,expected:JSON.stringify(o)});
  assert.equal(r.delivered,ready);assert.equal(await w.page.evaluate(()=>globalThis.fakeAdds),ready?1:0);return w;
 });
 await check('target-changes-before-click',async()=>{const w=await setup(SKU),o=await read(w.page,SKU);await w.page.evaluate(()=>document.querySelector('form').setAttribute('action','/shop/buy-iphone/iphone-18-pro/FAKE-wrong/a'));const r=await read(w.page,SKU,{action:'addBag',id:'FAKE-changed',taskId:'FAKE-task',authorized:true,structured:true,expected:JSON.stringify(o)});assert.equal(r.delivered,false);assert.equal(r.touched,false);assert.equal(await w.page.evaluate(()=>globalThis.fakeAdds),0);return w;});
 await check('button-associated-foreign-form-blocks',async()=>{const w=await setup(SKU);await w.page.evaluate(()=>{const f=document.createElement('form');f.id='FAKE-other-form';f.method='get';f.action='https://example.invalid/FAKE';document.body.appendChild(f);document.querySelector('button').setAttribute('form',f.id);});const o=await read(w.page,SKU);assert.equal(o.variantVerified,false);const r=await read(w.page,SKU,{action:'addBag',id:'FAKE-associated',taskId:'FAKE-task',authorized:true,structured:true,expected:JSON.stringify(o)});assert.equal(r.delivered,false);assert.equal(await w.page.evaluate(()=>globalThis.fakeAdds),0);return w;});
 await check('job-waits-for-canonical-before-one-Add',async()=>{
  const w=await setup(BASE);let clock=0,seq=0,row=null,added=false;const calls=[];
  const store={async get(){return row&&structuredClone(row);},async put(k,v){assert.equal(k,TASK_KEY);row=structuredClone(v);}};
  const port={async observe(){if(added)return {schema:'applebuy-merchant-read/v1',phase:'AUTH',verifiedStep:false,documentId:'FAKE-auth',seq:++seq};const path=clock>=100?SKU:BASE;await w.page.evaluate(path=>document.querySelector('form').setAttribute('action',path),path);return {...await read(w.page,path),documentId:'FAKE-product',seq:++seq,generation:1};},async wait(ms){clock+=ms;},async act(c){calls.push(c.action);assert.ok(clock>=100);assert.equal(c.action,'addBag');added=true;return {delivered:true};}};
  const result=await new PurchaseJob({store,port,now:()=>clock,hydrationMs:500,maxSteps:5}).run(plan,{tabId:7,planDigest:'FAKE-digest'});assert.deepEqual(calls,['addBag']);assert.equal(result.pending.action,'addBag');assert.equal(result.state,'NEEDS_USER');return w;
 });
}finally{for(const c of contexts)await c.close();if(browser){await browser.close();summary.cleanup.browserClosed=true;}}
summary.passed=summary.checks.length===7&&summary.checks.every(c=>c.passed);console.log(JSON.stringify(summary));if(!summary.passed)process.exitCode=1;
