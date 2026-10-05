// C060 Root quota self-check: explicit pre-final successor + production native empty-bag pipeline; fixture helpers reused from C039.
// Codex C039 quota work. Actual PurchaseJob + ChromePort + merchantDocument, native rendered DOM.
// All Chrome plumbing, permissions, URLs/document IDs, authority, storage, merchant responses and dynamics are FAKE.
// Ordinary test-owned artifact. Never writes the denied review path or uses that rejected input.
// Fresh isolated Chrome, owned loopback only: no personal profile/extension/account, Apple request, slot/hold/order/payment.
import assert from 'node:assert/strict';
import http from 'node:http';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve,join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {PurchaseJob,TASK_KEY} from '../web/checkout-connector/job.js';
import {ChromePort} from '../web/checkout-connector/chrome-port.js';
import {restartExpiredPreFinal} from '../web/checkout-connector/pre-final-restart.js';

const root=resolve(import.meta.dirname,'..');
const output=join(root,'.local/reviewer/c060-native-'+new Date().toISOString().replace(/[:.]/g,'-'));
mkdirSync(output,{recursive:false});
const {chromium}=createRequire(import.meta.url)(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const empty=JSON.parse(readFileSync(join(root,'docs/reviews/C-035-official-cart-evidence.json'),'utf8'));
const pickup=JSON.parse(readFileSync(join(root,'docs/reviews/C-036-normal-pickup-evidence.json'),'utf8'));
const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{tradeIn:'none',appleCare:'none'}};
const pro={...plan.product,price:9999};
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const title=p=>p.model+' '+p.capacity+' '+p.color;
const dates=pickup.dateStructure.map(x=>x.html+'<label for="bartPickupDateSelector'+x.value+'">'+escape(x.label)+'</label>').join('');
const optionHtml=pickup.dayObservations[2].options.map(o=>'<option value="'+escape(o.value)+'"'+(o.disabled?' disabled':'')+(o.selected?' selected':'')+'>'+escape(o.text)+'</option>').join('');
const pickupBody='<h2>选择取货零售店：</h2><input type="radio" name="store-locator-result" value="R609" id="dalian"><label for="dalian">1 Apple 大连恒隆广场 今天 可取货 店内取货</label><ul role="list" class="rt-storelocator-store-multipleavailability-list"><li role="listitem" class="row rt-storelocator-store-multipleavailability-item"><div class="column large-7">'+title(pro)+'</div><div>需要签到</div></li></ul><fieldset><legend class="rs-pickup-slottitle">为你的 iPhone 18 Pro 选择取货日期：</legend>'+dates+'<label id="rs-pickup-slottitle">接下来，选择 10月 6 当天的签到时段：</label><select data-autom="pickup-availablewindow-dropdown" aria-labelledby="rs-pickup-slottitle">'+optionHtml+'</select></fieldset><button id="next">继续填写取货详情</button>';
const deliveryBody='<div class="rs-fulfillment-shipmentgroup"><div class="rs-fulfillment-productstrip-content">'+title(pro)+'</div></div>';
const summary='<div id="summary" role="dialog" aria-modal="true" hidden><span class="visuallyhidden">订单摘要</span><div class="rs-companionbar-ordersummary-section"><div class="rs-companionbar-ordertotal"><div class="rs-order-item-details"><p class="row rs-companionbar-bagitemrow"><span class="column large-6 rs-companionbar-items">1 件商品</span></p></div></div></div><div class="rs-companionbar-summary-subtotal">小计 <span>RMB 9,999</span></div><div id="shipping" class="rs-companionbar-summary-shipping">运费 <span>免费</span></div><div class="rs-companionbar-total-row">总计 <span>RMB 9,999</span></div><button id="close" aria-label="关闭"></button></div>';
let server,browser,origin;const worlds=new Map(),contexts=new Set();
const report={scope:'actual current production modules composed on native DOM; FAKE Chrome/authority/merchant, not personal extension or Apple',actualAppleVisited:false,personalProfileUsed:false,extensionInstalledOrGranted:false,realSlotSubmitted:false,realOrderCreated:false,realSpeedMeasured:false,checks:[],network:{allowed:0,blocked:0},cleanup:{contextsClosed:0,browserClosed:false,serverClosed:false,errors:[]},fixtureFacts:{observed:'sanitized empty block; explicit bag anchors; native pickup R609 label/date LEGEND/options and current piece summary',invented:'product markup, ordinary owned-page transitions/timing, delivery-to-pickup rendering, initially unselected store, local endpoint, all Chrome interfaces/authority/identity/storage/merchant events'}};

function html(w,stage){
  let main='';
  if(stage==='bag')main=w.cart.length?'<h1>购物袋</h1><ol data-autom="bag-items">'+w.cart.map(p=>'<li><h2>'+escape(title(p))+'</h2><label>数量 <select aria-label="数量"><option selected>1</option><option>2</option></select></label><button>移除</button></li>').join('')+'</ol><p>总计 RMB '+w.cart.reduce((a,p)=>a+p.price,0).toLocaleString('en-US')+'</p><button data-autom="checkout" id="checkout">结账</button>':'<div id="bag-content">'+empty.empty.sanitizedBlockHtml+'</div>';
  if(stage==='product')main='<h1>购买 iPhone 18 Pro</h1><input type="radio" name="color" id="black"><label for="black">黑色</label><input type="radio" name="capacity" id="capacity"><label for="capacity">256GB RMB 9,999</label><input type="radio" name="trade" id="trade"><label for="trade">不折抵换购</label><input type="radio" name="care" id="care" disabled><label for="care">不加 AppleCare+ 服务计划</label><button id="add" disabled>添加到购物袋</button>';
  if(stage==='accessories')main='<h1>FAKE配件页</h1><button id="view">查看购物袋</button>';
  if(stage==='checkout')main='<h1>你希望如何收到订单商品？</h1><button data-autom="companionbar-button" id="show">显示订单摘要： <span>RMB 9,999</span></button><button role="radio" aria-checked="true" id="delivery">为我送货</button><button role="radio" aria-checked="false" id="pickup">我要取货</button><div id="fulfillment">'+deliveryBody+'</div>';
  if(stage==='endpoint')main='<h1>FAKE演练终点</h1><p>未验证后续商户契约；没有模拟或真实订单</p>';
  return '<html data-selfcheck="FAKE-c039-current-executor"><body><main id="merchant">'+main+'</main>'+(stage==='checkout'?summary:'')+'<a href="https://www.apple.com.cn/shop/open/salespolicies">销售政策与条款</a></body></html>';
}
function stageOf(e){return new URL(e.page.url()).pathname.split('/').at(-1);}
function fakeUrl(e){const s=stageOf(e);return s==='bag'?'https://www.apple.com.cn/shop/bag':s==='product'?'https://www.apple.com.cn/shop/buy-iphone/iphone-18-pro':s==='accessories'?'https://www.apple.com.cn/shop/buy-iphone/iphone-18-pro/FAKE-c039/a':'https://secure8.www.apple.com.cn/shop/checkout';}
async function bind(e,w){
  await e.page.evaluate(({pickupBody,base})=>{
    if(location.hostname!=='127.0.0.1'||document.documentElement.dataset.selfcheck!=='FAKE-c039-current-executor')throw Error('OwnedFixtureOnly');
    const by=id=>document.getElementById(id),send=(name,data={})=>globalThis.c039FakeEvent(name,data),go=(name,path)=>{send(name);setTimeout(()=>location.assign(base+'/'+path),35);};
    if(by('trade'))by('trade').onchange=()=>{by('care').disabled=false;send('noTrade');};
    if(by('care'))by('care').onchange=()=>{by('add').disabled=false;send('noCare');};
    if(by('add'))by('add').onclick=()=>go('addBag','accessories');
    if(by('view'))by('view').onclick=()=>go('viewBag','bag');
    if(by('checkout'))by('checkout').onclick=()=>go('checkout','checkout');
    if(by('show'))by('show').onclick=()=>{send('summaryOpen');by('merchant').inert=true;by('summary').hidden=false;};
    if(by('close'))by('close').onclick=()=>{send('summaryClose');by('summary').hidden=true;by('merchant').inert=false;};
    if(by('pickup'))by('pickup').onclick=()=>{
      by('pickup').setAttribute('aria-checked','true');by('delivery').setAttribute('aria-checked','false');by('fulfillment').innerHTML=pickupBody;by('shipping').remove();send('pickup');
      // FAKE initial state uses the normally observed third-day property, not a preselected target/terminal.
      const rs=[...document.querySelectorAll('input[name="bartPickupDateSelectorButtonGroup"]')];for(const r of rs)r.checked=r.value==='6';
      by('dalian').onchange=()=>send('store',{value:by('dalian').value,label:document.querySelector('label[for="dalian"]').textContent});
      for(const r of rs)r.onchange=()=>{const s=document.querySelector('[data-autom="pickup-availablewindow-dropdown"]');s.selectedIndex=0;for(const o of [...s.options].slice(1))o.value=r.value+'-'+o.textContent.replace(/\s*[–—]\s*/g,'-');by('rs-pickup-slottitle').textContent='接下来，选择 10月 '+r.value+' 当天的签到时段：';send('date',{value:r.value});};
      const s=document.querySelector('[data-autom="pickup-availablewindow-dropdown"]');s.onchange=()=>send('time',{value:s.value,text:s.selectedOptions[0]?.textContent});
      by('next').onclick=()=>go('slotContinue','endpoint');
    };
  },{pickupBody,base:'/'+w.key});
}
async function pageFor(w,stage,{side=false}={}){
  const page=await w.context.newPage(),e={page,side,boundToken:null};w.tabs.set(++w.tabId,e);e.id=w.tabId;
  // FAKE Chrome document identity changes with the actual native document, never with an observer's guess about load events.
  await page.addInitScript(()=>{globalThis.c039FakeDocument=crypto.randomUUID();});
  await page.exposeFunction('c039FakeEvent',async(name,data)=>{w.effects[name]=(w.effects[name]??0)+1;w.events.push({name,...data});if(name==='addBag')w.cart.push({...pro});});
  await page.goto(origin+'/'+w.key+'/'+stage);await ready(e,w);return e;
}
async function ready(e,w){await e.page.waitForLoadState('domcontentloaded');const token=await e.page.evaluate(()=>globalThis.c039FakeDocument);assert.equal(typeof token,'string');if(e.boundToken!==token){await bind(e,w);e.boundToken=token;}return token;}
function apiFor(w){return {
  permissions:{contains:async({origins})=>!w.spec.missingHost||!origins.some(x=>x.includes('secure8'))},
  tabs:{get:async id=>{const e=w.tabs.get(id);if(!e||e.page.isClosed())throw Error('FAKE missing owned tab');await ready(e,w);return {id,url:fakeUrl(e),status:'complete'};},
    update:async(id,{url})=>{const e=w.tabs.get(id);assert.ok(e&&!e.side);const s=url.endsWith('/bag')?'bag':'product';w.navigations.push(s);await e.page.goto(origin+'/'+w.key+'/'+s);await ready(e,w);return {id,url:fakeUrl(e),status:'complete'};},
    create:async options=>{assert.deepEqual(options,{url:'https://www.apple.com.cn/shop/bag',active:false});w.sideCreated++;const e=await pageFor(w,'bag',{side:true});return {id:e.id};},
    remove:async id=>{const e=w.tabs.get(id);assert.ok(e?.side);await e.page.close();w.tabs.delete(id);w.sideClosed++;}},
  scripting:{executeScript:async x=>{
    const e=w.tabs.get(x.target.tabId);assert.ok(e&&!e.page.isClosed());const token=await ready(e,w),doc='FAKE-c039-'+w.key+'-'+e.id+'-'+token;
    if(x.target.documentIds&&!x.target.documentIds.includes(doc))return [{frameId:0,documentId:doc,error:'FAKE document changed'}];
    const command=x.args?.[1];if(command)w.commands.push(command.action);
    if(e.side&&w.spec.sideFailure){w.sideFailures++;throw Error('FAKE side read lost');}
    if(!e.side&&!command&&w.spec.lossAfter&&!w.lossInjected&&(w.effects[w.spec.lossAfter]??0)>0){w.lossInjected=true;throw Error('FAKE execution context destroyed during normal navigation');}
    // Executes the actual production function against the native DOM. No canned phase, schema, price, quantity or feedback.
    const result=await e.page.evaluate(async({source,args,fakeHref})=>{if(location.hostname!=='127.0.0.1'||document.documentElement.dataset.selfcheck!=='FAKE-c039-current-executor')throw Error('OfflineOnly');return new Function('location','return ('+source+')')({href:fakeHref})(...args);},{source:x.func.toString(),args:x.args,fakeHref:fakeUrl(e)});
    if(e.side){w.sideReads++;w.sideDecoded.push({phase:result.phase,quantity:result.purchase?.quantity,verified:result.purchase?.itemVerified,extras:result.extras});}
    return [{frameId:0,documentId:doc,result}];
  }}
};}
async function scenario(spec){
  const t=performance.now(),context=await browser.newContext({serviceWorkers:'block'});contexts.add(context);
  const w={key:'FAKE-c039-'+spec.name,spec,context,cart:structuredClone(spec.cart??[]),tabs:new Map(),tabId:0,effects:{},events:[],commands:[],navigations:[],sideCreated:0,sideClosed:0,sideReads:0,sideFailures:0,sideDecoded:[],lossInjected:false,row:null,states:[]};worlds.set(w.key,w);
  await context.route('**/*',async route=>{if(new URL(route.request().url()).origin===origin){report.network.allowed++;await route.continue();}else{report.network.blocked++;await route.abort();}});await context.routeWebSocket('**/*',s=>s.close());
  let result;
  try{
    const main=await pageFor(w,spec.start??'bag'),api=apiFor(w),prepare=new ChromePort(api,main.id,{mode:'observe'}),entry=await prepare.observe(plan);
    const store={get:async k=>{assert.equal(k,TASK_KEY);return structuredClone(w.row);},put:async(k,v)=>{assert.equal(k,TASK_KEY);w.row=structuredClone(v);}};
    const taskId='FAKE-c039-task-'+spec.name,digest='FAKE-c039-digest';
    const previous={schema:'applebuy-purchase-job/v1',taskId:'FAKE-c060-old-'+spec.name,plan:structuredClone(plan),planDigest:digest,tabId:9001,state:'NEEDS_VERIFICATION',lastRead:4,lastPhase:'UNKNOWN',lastDocumentId:'FAKE-c060-old-slots',expiresAt:Date.now()-1000,initialDates:['october5','october6'],dateCursor:0,floors:{october5:'21:15'},rejected:[],refusals:0,pending:{id:'FAKE-c060-old-choice',action:'chooseSlot',beforePhase:'SLOTS',documentId:'FAKE-c060-old-slots',deadline:Date.now()-1000,date:'october5',start:'21:15',end:'21:30'},acceptedSlot:null,finalIntent:null,bagAddStarted:true,resourceWritten:true,history:[],retiredHistory:[],retiredCart:{quantity:1,totalCny:9999}};
    w.row=structuredClone(previous);api.tabs.query=async()=>[...w.tabs].map(([id,e])=>({id,url:fakeUrl(e)}));
    const restart=await restartExpiredPreFinal({store,api,port:prepare,plan,planDigest:digest,tabId:main.id,enabled:true,dateWindowConfirmed:true,id:()=>taskId});
    assert.equal(restart.created,true);assert.deepEqual(w.row.retiredHistory.at(-1).abandonedPreFinal.originalSnapshot,previous);
    assert.equal((await restartExpiredPreFinal({store,api,port:prepare,plan,planDigest:digest,tabId:main.id,enabled:true,dateWindowConfirmed:true,id:()=>taskId+'-duplicate'})).created,false);

    const grant={id:'FAKE-c039-grant-'+spec.name,start:true,entryDocumentId:entry.documentId,taskId,planDigest:digest,existingOrdersChecked:true,noExtras:true,termsAccepted:true,termsUrl:'https://www.apple.com.cn/shop/open/salespolicies',expiry:Date.now()+120000};
    const port=new ChromePort(api,main.id,{authorized:true,orderSummary:true,initialSequence:entry.seq}),job=new PurchaseJob({store,port,maxSteps:60,onState:s=>w.states.push(s)});
    result=await job.run(plan,{tabId:main.id,planDigest:digest,taskId,grant});
    if(spec.success){
      assert.equal(w.effects.addBag??0,spec.existing?0:1);assert.equal(w.effects.checkout,1);assert.equal(w.effects.pickup,1);assert.equal(w.effects.store,1);assert.equal(w.effects.date,1);assert.equal(w.effects.time,1);assert.equal(w.effects.slotContinue,1);
      assert.ok(w.effects.summaryOpen>=2);assert.equal(w.effects.summaryOpen,w.effects.summaryClose);
      assert.equal(result.state,'NEEDS_VERIFICATION');assert.equal(result.pending?.action,'chooseSlot');assert.ok(['slot-result-unconfirmed; no resubmission','observation-transport-failed'].includes(result.reason));
      assert.deepEqual(result.initialDates,['October 4','October 5','October 6']);assert.equal(w.events.find(x=>x.name==='date')?.value,'4');assert.equal(w.events.find(x=>x.name==='time')?.text,'21:15 – 21:30');
      assert.equal(w.sideCreated,1);assert.equal(w.sideClosed,1);assert.equal(w.sideReads,2);assert.ok(w.commands.includes(spec.existing?'openBag':'openProduct'));
      assert.ok(w.sideDecoded.every(x=>x.phase===(spec.existing?'BAG':'EMPTY_BAG')));if(spec.existing)assert.ok(w.sideDecoded.every(x=>x.quantity===1&&x.verified===true&&x.extras===false));
      if(spec.lossAfter)assert.equal(w.lossInjected,true);
    }else{
      assert.equal(w.effects.addBag??0,spec.missingHost?1:0);assert.equal(w.effects.slotContinue??0,0);assert.equal(w.effects.store??0,0);
      if(spec.missingHost){assert.equal(result.state,'NEEDS_USER');assert.equal(result.reason,'current-host-permission-missing; no automatic action');}
      else{assert.equal(result.state,spec.sideFailure?'NEEDS_VERIFICATION':'BLOCKED');assert.equal(w.effects.checkout??0,0);assert.equal(w.sideCreated,1);assert.equal(w.sideClosed,1);}
      if(spec.sideFailure){assert.equal(w.sideFailures,150);assert.equal(w.sideReads,0);assert.equal(result.reason,'current-bag-not-verified-before-add; nothing added');}
    }
    if(spec.restart){
      await main.page.waitForURL(origin+'/'+w.key+'/endpoint');await ready(main,w);const before=structuredClone(w.effects),pending=result.pending;
      const resumedPort=new ChromePort(api,main.id,{authorized:true,orderSummary:true,pending,initialSequence:result.lastRead});
      const again=await new PurchaseJob({store,port:resumedPort,maxSteps:15}).run(plan,{tabId:main.id,planDigest:digest});
      assert.deepEqual(w.effects,before);assert.equal(again.pending?.action,'chooseSlot');assert.equal(again.state,'NEEDS_VERIFICATION');
      result=again;
    }
    return {name:spec.name,passed:true,durationMs:Math.round(performance.now()-t),state:result.state,phase:result.lastPhase,reason:result.reason,pendingAction:result.pending?.action,effects:w.effects,commands:w.commands,navigations:w.navigations,sideCreated:w.sideCreated,sideClosed:w.sideClosed,sideReads:w.sideReads,sideFailures:w.sideFailures,sideDecoded:w.sideDecoded,lossInjected:w.lossInjected,initialDates:result.initialDates,restart:!!spec.restart,realAcceptanceClaimed:false};
  }catch(error){return {name:spec.name,passed:false,error:String(error.stack||error).slice(0,2200),effects:w.effects,commands:w.commands,navigations:w.navigations,states:w.states,result:result?{state:result.state,phase:result.lastPhase,reason:result.reason,pending:result.pending?.action}:null};}
  finally{
    try{await context.close();contexts.delete(context);report.cleanup.contextsClosed++;}catch(e){report.cleanup.errors.push('context '+spec.name+': '+e.message);}worlds.delete(w.key);
  }
}
try{
  server=http.createServer((req,res)=>{const parts=new URL(req.url,'http://127.0.0.1').pathname.split('/'),w=worlds.get(parts[1]);if(!w){res.writeHead(404);res.end('FAKE unknown owned fixture');return;}res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(html(w,parts[2]));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking']});report.browserVersion=browser.version();
  for(const spec of [
    {name:'explicit-successor-native-prefix',success:true},
    {name:'explicit-successor-native-restart-no-repeat',lossAfter:'slotContinue',restart:true,success:true},
  ]){const x=await scenario(spec);report.checks.push(x);console.log((x.passed?'PASS ':'FAIL ')+x.name+(x.passed?'':' '+x.error));}
  report.passed=report.checks.length===2&&report.checks.every(x=>x.passed);
}catch(error){report.passed=false;report.error=String(error.stack||error).slice(0,1800);}
finally{
  for(const c of [...contexts])try{await c.close();contexts.delete(c);report.cleanup.contextsClosed++;}catch(e){report.cleanup.errors.push(e.message);}
  if(browser)try{await browser.close();report.cleanup.browserClosed=true;}catch(e){report.cleanup.errors.push('browser: '+e.message);}
  if(server){server.closeAllConnections?.();await new Promise(r=>server.close(e=>{if(e)report.cleanup.errors.push('server: '+e.message);else report.cleanup.serverClosed=true;r();}));}
  if(contexts.size||report.cleanup.errors.length)report.passed=false;
  writeFileSync(join(output,'result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,result:join(output,'result.json'),cleanup:report.cleanup}));if(!report.passed)process.exitCode=1;
}
