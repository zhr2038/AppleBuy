// Autonomous offline browser checks. Fresh headless Chrome, no personal profile/account, loopback only.
// The rendered public-shape checks give merchantDocument an explicitly FAKE lexical location, as unit tests do.
// They never navigate to an Apple URL. The complete journey uses the existing strictly loopback FAKE DomMotor.
import assert from 'node:assert/strict';
import http from 'node:http';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
import {startDomDemo,DOM_PLAN} from '../src/app/dom-bridge.ts';

const ROOT=resolve(import.meta.dirname,'..');
const args=process.argv.slice(2),readArg=k=>args.includes(k)?args[args.indexOf(k)+1]:null;
assert.ok(args.every((v,i)=>['--playwright-dir','--output'].includes(v)||i>0&&['--playwright-dir','--output'].includes(args[i-1])),'Unknown self-check option');
const out=resolve(ROOT,readArg('--output')??'.local/reviewer/browser-selfcheck-'+new Date().toISOString().replace(/[:.]/g,'-'));
const localRoot=resolve(ROOT,'.local'),outRel=relative(localRoot,out);
assert.ok(outRel&&!outRel.startsWith('..')&&!isAbsolute(outRel),'Output must be a new directory inside this project .local');
mkdirSync(out,{recursive:false});
const require=createRequire(import.meta.url);
const bundle=readArg('--playwright-dir')??join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const packageMeta=JSON.parse(readFileSync(join(bundle,'package.json'),'utf8'));
assert.equal(packageMeta.name,'playwright');
const {chromium}=require(bundle);
const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{tradeIn:'none',appleCare:'none'}};
const template=readFileSync(join(ROOT,'review/fixtures/current-public-checkout.html'),'utf8');
const allowedOrigins=new Set(),blockedOrigins=new Set(),checks=[],started=performance.now();
let browser,fixture,fixtureOrigin,commandSeq=0;
const contexts=new Set(),demos=new Set();
const network={allowedPageRequests:0,blockedPageRequests:0,webSocketsClosed:0};
const cleanup={contextsClosed:0,demosClosed:0,fixtureClosed:false,browserClosed:false,errors:[]};
const report={scope:'FAKE isolated-headless-browser-only',playwrightVersion:packageMeta.version,personalProfileUsed:false,actualApplePageVisited:false,actualAppleAccountUsed:false,actualExtensionInstalledOrGranted:false,officialQuantityContractProven:false,realOrderCreated:false,checks};
async function newContext(){
  const c=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:900}});contexts.add(c);
  await c.route('**/*',async route=>{const u=new URL(route.request().url());if(u.protocol==='http:'&&u.hostname==='127.0.0.1'&&allowedOrigins.has(u.origin)){network.allowedPageRequests++;await route.continue();}else{network.blockedPageRequests++;blockedOrigins.add(u.origin);await route.abort('blockedbyclient');}});
  await c.routeWebSocket('**/*',socket=>{network.webSocketsClosed++;socket.close();});
  return c;
}
async function closeContext(c){await c.close();contexts.delete(c);cleanup.contextsClosed++;}
async function closeDemo(d){await d.close();demos.delete(d);cleanup.demosClosed++;}
async function check(name,fn){const t=performance.now();try{const result=await fn();checks.push({name,passed:true,durationMs:Math.round((performance.now()-t)*100)/100,...result});console.log('PASS '+name);}catch(e){checks.push({name,passed:false,error:String(e.message).slice(0,400)});console.log('FAIL '+name+' '+e.message);throw e;}}
async function pageAt(url){const c=await newContext(),page=await c.newPage();await page.goto(url);return {c,page};}
async function decode(page,command=null,fakePath='/shop/checkout'){
  return page.evaluate(async ({source,intent,cmd,fakePath})=>{
    const u=new URL(window.location.href);
    if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||document.documentElement.dataset.applebuySelfcheck!=='fake-renderer/v1')throw new Error('OfflineSelfCheckOnly');
    // Explicit unit-test input, not a real URL/merchant contract. Never write or replace window.location.
    const fakeLocation={href:'https://secure6.www.apple.com.cn'+fakePath};
    const fn=new Function('location','return ('+source+')')(fakeLocation);
    return await fn(intent,cmd);
  },{source:merchantDocument.toString(),intent:plan,cmd:command,fakePath});
}
async function command(page){return {id:'FAKE-selfcheck-command-'+(++commandSeq),taskId:'FAKE-selfcheck-task',authorized:true,structured:true,action:'selectPickup',expected:JSON.stringify(await decode(page))};}
async function journey(scenario,{reload=false,restart=false,secondTab=false}={}){
  const taskDir=join(out,'fake-task-'+scenario);mkdirSync(taskDir);
  let demo=await startDomDemo(taskDir,{timeoutMs:1200});demos.add(demo);allowedOrigins.add(new URL(demo.url).origin);
  const {c,page}=await pageAt(demo.url);
  await page.getByRole('heading',{name:'电脑自动结账验证',exact:true}).waitFor();
  await page.waitForFunction(()=>document.getElementById('start')?.disabled===false);
  await page.getByLabel('验证场景').selectOption(scenario);
  await page.getByRole('button',{name:'开始自动模拟下单',exact:true}).click();
  await page.waitForFunction(()=>{try{const s=JSON.parse(document.getElementById('trace').textContent);return ['ORDER_CONFIRMED_MOCK','MANUAL_VERIFICATION'].includes(s.engine?.phase)||document.getElementById('status').textContent.includes('执行停止或结果不明');}catch{return false;}},null,{timeout:15000});
  // Server completion is independent of the rendered success text. Poll only the owned loopback execution.
  for(let i=0;i<200&&demo.snapshot().running;i++)await new Promise(r=>setTimeout(r,10));
  assert.equal(demo.snapshot().running,false);
  const state=demo.snapshot(),counts=await page.locator('#merchant-counts').innerText();
  const finalClicks=Number(counts.match(/最终提交 (\d+)/)?.[1]??-1),orders=Number(counts.match(/模拟订单 (\d+)/)?.[1]??-1),bagAdds=Number(counts.match(/加购 (\d+)/)?.[1]??-1),lookups=Number(counts.match(/只读查单 (\d+)/)?.[1]??-1),chooses=Number(counts.match(/时段选择 (\d+)/)?.[1]??-1);
  const records=state.history?.records??[],slotKey=date=>DOM_PLAN.stores[0].label+'|'+date+'|21:15-21:30';
  const normal=scenario==='normal'||scenario==='lost-reply';
  let orderFields=null;
  if(normal){
    assert.equal(state.engine.phase,'ORDER_CONFIRMED_MOCK');assert.equal(state.engine.refusals,2);assert.equal(finalClicks,1);assert.equal(orders,1);assert.equal(bagAdds,1);assert.equal(chooses,3);assert.ok(lookups>=1);
    assert.deepEqual(records.filter(r=>r.type==='sent'&&r.kind==='chooseSlot').map(r=>r.slotKey),DOM_PLAN.dates.map(slotKey));
    assert.deepEqual(records.filter(r=>r.type==='refusal').map(r=>r.slotKey),DOM_PLAN.dates.slice(0,2).map(slotKey));
    assert.deepEqual(records.filter(r=>r.type==='accepted').map(r=>r.slotKey),[slotKey(DOM_PLAN.dates[2])]);
    assert.equal(records.filter(r=>r.type==='observe-request'&&r.reason==='lookup-order').length,lookups);
    orderFields=await page.locator('#order').evaluate(e=>({status:e.dataset.status,productId:e.dataset.productId,model:e.dataset.model,capacity:e.dataset.capacity,color:e.dataset.color,quantity:Number(e.dataset.quantity),total:Number(e.dataset.total),store:e.dataset.store,fulfillment:e.dataset.fulfillment,date:e.dataset.date,start:e.dataset.start,end:e.dataset.end,fakeId:e.dataset.id.startsWith('FAKE-order-')}));
    assert.deepEqual(orderFields,{status:'unpaid',productId:DOM_PLAN.products[0].id,model:DOM_PLAN.products[0].model,capacity:DOM_PLAN.products[0].capacity,color:DOM_PLAN.products[0].color,quantity:1,total:DOM_PLAN.maxTotalCny,store:DOM_PLAN.stores[0].label,fulfillment:'pickup',date:DOM_PLAN.dates[2],start:'21:15',end:'21:30',fakeId:true});
  }
  else if(scenario==='unknown'||scenario==='wrong-order'){assert.equal(state.engine.phase,'MANUAL_VERIFICATION');assert.equal(finalClicks,1);assert.equal(orders,1);}
  else{assert.equal(finalClicks,0);assert.equal(orders,0);
    if(scenario==='wrong-price'){assert.equal(bagAdds,0);assert.equal(await page.locator('#merchant').getAttribute('data-step'),'product');assert.equal(await page.locator('#condition').getAttribute('data-total'),'10000');assert.equal(records.filter(r=>r.type==='sent').length,0);assert.ok(state.failure);}
    if(scenario==='redraw'){assert.equal(bagAdds,1);assert.equal(chooses,0);assert.equal(state.engine.phase,'MANUAL_VERIFICATION');assert.equal(await page.locator('#merchant').getAttribute('data-step'),'slots');assert.equal(records.filter(r=>r.type==='unknown'&&r.kind==='chooseSlot').length,1);assert.equal(records.filter(r=>r.type==='outcome'&&r.kind==='chooseSlot'&&['REJECTED','ACCEPTED'].includes(r.state)).length,0);}
  }
  const beforeLedger=JSON.stringify(state.ledger);
  if(secondTab){const p2=await c.newPage();await p2.goto(demo.url);await p2.waitForFunction(()=>document.getElementById('status').textContent.includes('本标签页只读'));assert.equal(await p2.locator('#start').isEnabled(),false);assert.equal(JSON.stringify(demo.snapshot().ledger),beforeLedger);await p2.close();}
  await page.screenshot({path:join(out,'fake-'+scenario+'.png'),fullPage:true});
  if(reload){await page.reload();await page.waitForFunction(()=>document.getElementById('start')?.disabled===true&&document.getElementById('status').textContent!=='正在连接');assert.equal(JSON.stringify(demo.snapshot().ledger),beforeLedger);}
  await closeContext(c);await closeDemo(demo);
  if(restart){demo=await startDomDemo(taskDir);demos.add(demo);assert.equal(demo.snapshot().startBlocked,true);assert.equal(demo.snapshot().engine,null);assert.equal(JSON.stringify(demo.snapshot().ledger),beforeLedger);assert.ok(demo.snapshot().history);await closeDemo(demo);}
  return {fakePhase:state.engine.phase,refusals:state.engine.refusals,finalClicks,fakeOrders:orders,bagAdds,chooses,lookups,orderFields,secondTab,reload,restart};
}
try{
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking'],timeout:20000});
  report.browserVersion=browser.version();
  fixture=http.createServer((req,res)=>{const u=new URL(req.url,'http://127.0.0.1');const qty=u.searchParams.get('qty');if(u.pathname!=='/'){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"});res.end(template.replace('__SYNTHETIC_QUANTITY__',qty===null?'':/^\d$/.test(qty)?'<p>数量：'+qty+'</p>':''));});
  await new Promise((yes,no)=>{fixture.once('error',no);fixture.listen(0,'127.0.0.1',yes);});fixtureOrigin='http://127.0.0.1:'+fixture.address().port;allowedOrigins.add(fixtureOrigin);
  await check('current-public-shape-quantity-absent-stops-with-zero-pickup',async()=>{const {c,page}=await pageAt(fixtureOrigin+'/');const o=await decode(page);assert.equal(o.phase,'FULFILLMENT');assert.equal(o.purchase.quantity,null);assert.equal(o.purchase.itemVerified,false);const r=await decode(page,await command(page));assert.equal(r.delivered,false);assert.equal(r.touched,false);assert.equal(await page.locator('#pickup').isChecked(),false);await closeContext(c);return {quantity:null,actions:0,fakeLocation:true};});
  await check('rendered-accessible-title-pair-with-synthetic-explicit1-selects-pickup-once',async()=>{const {c,page}=await pageAt(fixtureOrigin+'/?qty=1');const o=await decode(page);assert.equal(o.purchase.itemVerified,true);assert.equal((await decode(page,await command(page))).delivered,true);assert.equal(await page.locator('#pickup').isChecked(),true);await closeContext(c);return {quantity:1,quantityIsSynthetic:true,fakeLocation:true};});
  await check('rendered-two-product-groups-cannot-pass-one-unit',async()=>{const {c,page}=await pageAt(fixtureOrigin+'/?qty=1');await page.evaluate(()=>{const g=document.querySelector('.rs-fulfillment-shipmentgroup');g.parentElement.append(g.cloneNode(true));});assert.equal((await decode(page)).purchase.itemVerified,false);assert.equal((await decode(page,await command(page))).delivered,false);await closeContext(c);return {actions:0,fakeLocation:true};});
  await check('rendered-quantity2-and-fake-login-gates-stop',async()=>{const {c,page}=await pageAt(fixtureOrigin+'/?qty=2');assert.equal((await decode(page)).purchase.itemVerified,false);assert.equal((await decode(page,await command(page))).delivered,false);await page.evaluate(()=>{const input=document.createElement('input');input.type='password';input.setAttribute('aria-label','FAKE empty authentication field');document.querySelector('[role="main"]').append(input);});assert.equal((await decode(page)).phase,'AUTH');assert.equal((await decode(page,await command(page))).delivered,false);await closeContext(c);return {actions:0,actualCredentialsUsed:false,fakeLocation:true};});
  await check('one-click-full-fake-journey-two-refusals-one-unpaid-order-and-restart-no-repeat',()=>journey('normal',{reload:true,restart:true,secondTab:true}));
  await check('lost-final-reply-reconciles-without-second-submit',()=>journey('lost-reply'));
  await check('unknown-final-result-stops-without-resubmission',()=>journey('unknown',{reload:true,restart:true}));
  await check('wrong-order-colour-cannot-be-confirmed',()=>journey('wrong-order'));
  await check('over-cap-stops-before-add-bag',()=>journey('wrong-price'));
  await check('redrawn-slot-control-stops-before-stale-continue',()=>journey('redraw'));
  await check('fresh-valid-explicit1-authentication-gate-is-independent-of-quantity-and-old-command',async()=>{const {c,page}=await pageAt(fixtureOrigin+'/?qty=1');assert.equal((await decode(page)).purchase.itemVerified,true);await page.evaluate(()=>{const input=document.createElement('input');input.type='password';document.querySelector('[role="main"]').append(input);});const o=await decode(page);assert.equal(o.phase,'AUTH');assert.equal(o.purchase.itemVerified,true);assert.deepEqual(await decode(page,await command(page)),{delivered:false,touched:false,reason:'ActionNotRecognizedForCurrentStage'});await closeContext(c);return {fakeEmptyAuthenticationField:true,actualCredentialsUsed:false};});
  for(const variant of ['bare-header','strong-header','li-main','long-main'])await check('rendered-extra-text-is-unverified-untouched-'+variant,async()=>{const {c,page}=await pageAt(fixtureOrigin+'/?qty=1');await page.evaluate(kind=>{const title='iPhone 18 Pro 256GB 黑色',header=document.querySelector('.rs-fullfillment-selector-header'),main=document.querySelector('[role="main"]');if(kind==='bare-header')header.append(document.createTextNode(title));else{const e=document.createElement(kind==='strong-header'?'strong':kind==='li-main'?'li':'p');e.textContent=(kind==='long-main'?'FAKE filler '.repeat(40):'')+title;(kind==='strong-header'?header:main).append(e);}},variant);assert.equal((await decode(page)).purchase.itemVerified,false);const r=await decode(page,await command(page));assert.equal(r.delivered,false);assert.equal(r.touched,false);assert.equal(await page.locator('#pickup').isChecked(),false);await closeContext(c);return {actions:0,fakeLocation:true};});
  await check('page-network-policy-counters-are-observed',async()=>{assert.ok(network.allowedPageRequests>0);assert.equal(network.blockedPageRequests,0);return {...network};});
  report.passed=checks.length===16&&checks.every(c=>c.passed);
}catch(e){report.passed=false;report.error=String(e.stack||e).slice(0,1600);process.exitCode=1;}
finally{
  for(const c of [...contexts])try{await closeContext(c);}catch(e){cleanup.errors.push('context: '+String(e.message).slice(0,160));}
  for(const d of [...demos])try{await closeDemo(d);}catch(e){cleanup.errors.push('demo: '+String(e.message).slice(0,160));}
  if(fixture){fixture.closeAllConnections?.();await new Promise(r=>fixture.close(e=>{if(e)cleanup.errors.push('fixture: '+String(e.message).slice(0,160));else cleanup.fixtureClosed=true;r();}));}
  if(browser)try{await browser.close();cleanup.browserClosed=true;}catch(e){cleanup.errors.push('browser: '+String(e.message).slice(0,160));}
  report.durationMs=Math.round((performance.now()-started)*100)/100;
  report.blockedExternalOriginCount=blockedOrigins.size;
  report.network={scope:'owned BrowserContext page requests only; not Chrome-internal/browser-process/OS traffic',policy:'owned HTTP127.0.0.1 origins only; other page requests aborted; WebSockets closed',...network,blockedOrigins:[...blockedOrigins]};
  report.cleanup={...cleanup,contextsOpen:contexts.size,demosOpen:demos.size};
  report.allOwnedBrowsersContextsServersClosed=cleanup.errors.length===0&&contexts.size===0&&demos.size===0&&(!fixture||cleanup.fixtureClosed)&&(!browser||cleanup.browserClosed);
  if(!report.allOwnedBrowsersContextsServersClosed){report.passed=false;process.exitCode=1;}
  report.candidateMainSourceSha256=createHash('sha256').update(readFileSync(join(ROOT,'web/checkout-connector/page-program.js'))).digest('hex');
  writeFileSync(join(out,'result.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.passed,cases:checks.length,passedCases:checks.filter(c=>c.passed).length,result:join(out,'result.json'),realOrderCreated:false}));
}
