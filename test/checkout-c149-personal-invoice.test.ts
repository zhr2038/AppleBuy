// Current public contact/invoice anchors, entirely FAKE data and contained local Chrome. Never personal Chrome or Apple.
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {createRequire} from 'node:module';import {homedir} from 'node:os';import {join} from 'node:path';
import {merchantDocument} from '../web/checkout-connector/page-program.js';import {ChromePort} from '../web/checkout-connector/chrome-port.js';
import {PurchaseJob,TASK_KEY,CONTACT_SLOT_BASIS,createPurchaseRecord} from '../web/checkout-connector/job.js';import {PRO_PLAN,proDigest} from '../src/desktop/browser-session.mjs';
const {chromium}=createRequire(import.meta.url)(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const url='https://secure11.www.apple.com.cn/shop/checkout',group='checkout.pickupContact.eFapiaoSelector.selectFapiao',headerId='checkout.pickupContact.eFapiaoSelector.ePersonalFapiao.invoiceHeader';
const field=(id,label,attrs)=>`<label for="${id}">${label}</label><input id="${id}" ${attrs}>`;
const contacts=field('last','姓氏','type="text" required maxlength="20" value="FAKE"')+field('first','名字','type="text" required maxlength="14" value="TEST"')+field('email','电子邮件地址','type="email" required maxlength="64" value="fake@example.invalid"')+field('phone','联系人手机号码','type="tel" required value="00000000000"')+field('identity','政府颁发的身份证件号码的后四位','type="text" required maxlength="4"');
const opts=[['e_personal_fdf','电子发票 - 个人'],['e_company_fdf','电子发票 - 公司/其他'],['vat_special_fdf','电子发票 - 增值税专用发票']];
function invoice({selected=0,missing=false,wrongLabel=false,wrongName=false,hidden=false,extra=false,duplicateHeader=false}={}){
 const radios=opts.filter((_,i)=>!missing||i!==2).map(([value,label],i)=>`<div class="form-selector"${hidden&&i===2?' hidden':''}><input type="radio" id="${group}-${value}" name="${wrongName&&i===1?'FAKE-other':group}" value="${value}"${selected===i?' checked':''}><label for="${group}-${value}">${wrongLabel&&i===1?'FAKE unknown invoice':label}</label></div>`).join('');
 const h=field(headerId,'发票抬头 (选填)','type="text" name="invoiceHeader"');return radios+h+(duplicateHeader?h:'')+(extra?'<input type="radio" id="FAKE-extra"><label for="FAKE-extra">FAKE option</label>':'');
}
let browser,server,origin;
before(async()=>{server=http.createServer((q,r)=>r.end('<!doctype html><html data-fake="c149"><body></body></html>'));await new Promise(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${server.address().port}`;browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--disable-background-networking']});});
after(async()=>{await browser?.close();server?.closeAllConnections?.();if(server)await new Promise(r=>server.close(r));});
async function world(options={}){
 const context=await browser.newContext({serviceWorkers:'block'});await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort('blockedbyclient'));await context.routeWebSocket('**/*',s=>s.close());
 const page=await context.newPage();await page.goto(origin);await page.setContent(`<html data-fake="c149"><body><div role="main" id="checkout-container"><h1>现在请填写你的取货信息。</h1><button data-autom="companionbar-button">显示订单摘要： RMB 9,999</button>${contacts}${invoice(options)}<button>继续选择付款方式</button></div></body></html>`);
 const read=cmd=>page.evaluate(async({source,plan,cmd,url})=>{if(location.hostname!=='127.0.0.1'||document.documentElement.dataset.fake!=='c149')throw Error('OwnedFixtureOnly');return await new Function('location','return ('+source+')')({href:url})(plan,cmd);},{source:merchantDocument.toString(),plan:PRO_PLAN,cmd,url});
 return {context,page,read};
}
test('C149 current complete default personal invoice remains a contact-only step, not purchase evidence',async()=>{const w=await world();try{const o=await w.read(null);assert.equal(o.phase,'DETAILS');assert.equal(o.contactStep?.verified,true);assert.equal(o.purchase.verified,false);assert.equal(o.purchase.quantity,null);assert.equal(o.purchase.store,null);assert.equal(o.summaryReadable,false);assert.equal(o.extras,null);assert.equal(JSON.stringify(o).includes('fake@example.invalid'),false);}finally{await w.context.close();}});
for(const [name,options] of [['company selected',{selected:1}],['VAT selected',{selected:2}],['missing option',{missing:true}],['wrong label',{wrongLabel:true}],['wrong group name',{wrongName:true}],['hidden option',{hidden:true}],['extra radio',{extra:true}],['duplicate optional header',{duplicateHeader:true}]])test('C149 '+name+' cannot lend contact-step authority',async()=>{const w=await world(options);try{assert.equal((await w.read(null)).contactStep,null);}finally{await w.context.close();}});
for(const readOnly of [false,true])test('C149 bound sent-slot '+(readOnly?'readonly keeps unknown':'continuation never reselects or changes invoice'),async()=>{
 const w=await world();try{
  const actions=[],api={tabs:{get:async()=>({url,status:'complete'})},permissions:{contains:async()=>true},scripting:{executeScript:async q=>[{frameId:0,documentId:'FAKE-c149-contact',result:await w.read(q.args[1]??null)}]}};
  const now=Date.now();let row={...createPurchaseRecord(PRO_PLAN,{taskId:'FAKE-c149-task',planDigest:proDigest,tabId:7,now,id:()=>crypto.randomUUID()}),state:'NEEDS_VERIFICATION',lastPhase:'SLOTS',initialDates:['October 7','October 8','October 9'],dateCursor:0,floors:{'October 7':'21:15'},bagAddStarted:true,resourceWritten:true,bagTotalCny:9999,pending:{id:'FAKE-c149-slot',action:'chooseSlot',beforePhase:'SLOTS',documentId:'FAKE-c149-before',date:'October 7',start:'21:15',end:'21:30',generation:1,ref:'time:46',deadline:now-1},...(readOnly?{reconcileOnly:true}:{})};
  const port=new ChromePort(api,7,{authorized:!readOnly,mode:readOnly?'observe':'purchase',pending:row.pending});port.act=async c=>{actions.push(c.action);return {delivered:false,touched:false,reason:'FAKE-stop-before-private-write'};};
  const store={get:async()=>structuredClone(row),put:async(k,v)=>{assert.equal(k,TASK_KEY);row=structuredClone(v);}};
  const result=await new PurchaseJob({store,port,maxWaitMs:0,maxUntouched:0}).run(PRO_PLAN,{tabId:7,planDigest:proDigest});
  if(readOnly){assert.equal(result.pending.action,'chooseSlot');assert.deepEqual(actions,[]);}else{assert.equal(result.pending,null);assert.equal(result.acceptedSlot.basis,CONTACT_SLOT_BASIS);assert.deepEqual(actions,['fillDetails']);}
  assert.equal(result.finalIntent,null);assert.equal(await w.page.locator('input[type="radio"]:checked').getAttribute('value'),'e_personal_fdf');assert.equal(await w.page.locator('[name="invoiceHeader"]').inputValue(),'');
 }finally{await w.context.close();}
});
test('C151 real contact write preserves invoice state/header and emits no private value',async()=>{
 const w=await world();try{
  const fakeSuffix='5432',fakeHeader='FAKE-PREFILLED-INVOICE-HEADER',results=[],actions=[];
  await w.page.evaluate(headerId=>{const h=document.getElementById(headerId);h.value='FAKE-PREFILLED-INVOICE-HEADER';globalThis.c151={events:{},continued:0};
   for(const e of document.querySelectorAll('input')){globalThis.c151.events[e.id]={input:0,change:0};e.addEventListener('input',()=>globalThis.c151.events[e.id].input++);e.addEventListener('change',()=>globalThis.c151.events[e.id].change++);}
   [...document.querySelectorAll('button')].find(b=>b.textContent==='继续选择付款方式').onclick=()=>globalThis.c151.continued++;
  },headerId);
  const api={tabs:{get:async()=>({url,status:'complete'})},permissions:{contains:async()=>true},scripting:{executeScript:async q=>{if(q.args[1])actions.push(q.args[1].action);const result=await w.read(q.args[1]??null);results.push(JSON.stringify(result));return [{frameId:0,documentId:'FAKE-c151-contact',result}];}}};
  const now=Date.now();let row={...createPurchaseRecord(PRO_PLAN,{taskId:'FAKE-c151-task',planDigest:proDigest,tabId:7,now,id:()=>crypto.randomUUID()}),state:'NEEDS_VERIFICATION',lastPhase:'SLOTS',initialDates:['October 7'],dateCursor:0,floors:{'October 7':'21:15'},bagAddStarted:true,resourceWritten:true,bagTotalCny:9999,pending:{id:'FAKE-c151-slot',action:'chooseSlot',beforePhase:'SLOTS',documentId:'FAKE-c151-before',date:'October 7',start:'21:15',end:'21:30',generation:1,ref:'time:46',deadline:now-1}};
  const port=new ChromePort(api,7,{authorized:true,pending:row.pending,privatePickupData:{identitySuffix:fakeSuffix}}),store={get:async()=>structuredClone(row),put:async(k,v)=>{assert.equal(k,TASK_KEY);row=structuredClone(v);}};
  const outcome=await new PurchaseJob({store,port,maxWaitMs:0}).run(PRO_PLAN,{tabId:7,planDigest:proDigest});assert.equal(outcome.pending.action,'fillDetails');assert.equal(outcome.acceptedSlot.basis,CONTACT_SLOT_BASIS);assert.equal(row.finalIntent,null);
  const state=await w.page.evaluate(headerId=>({events:globalThis.c151.events,continued:globalThis.c151.continued,header:document.getElementById(headerId).value,radios:[...document.querySelectorAll('input[type="radio"]')].map(e=>({value:e.value,checked:e.checked}))}),headerId);
  assert.equal(state.continued,1);assert.equal(state.header,fakeHeader);assert.deepEqual(state.radios,opts.map(([value],i)=>({value,checked:i===0})));
  for(const [id,counts]of Object.entries(state.events))assert.deepEqual(counts,id==='identity'?{input:1,change:1}:{input:0,change:0});
  assert.deepEqual(actions,['fillDetails']);for(const result of results){assert.equal(result.includes(fakeHeader),false);assert.equal(result.includes(fakeSuffix),false);}
  const saved=JSON.stringify(row);assert.equal(saved.includes(fakeHeader),false);assert.equal(saved.includes(JSON.stringify(fakeSuffix)),false);assert.equal(saved.includes('privatePickupData'),false);
 }finally{await w.context.close();}
});
