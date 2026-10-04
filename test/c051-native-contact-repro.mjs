// Codex C051 independent pre-fix reproduction. Owned native fixture; every plan binding/API/value/result/identity is FAKE.
// Does not visit Apple, load the extension, use personal data, choose a real slot, make an order or pay.
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
const slot={date:'october5',start:'21:15',end:'21:30',ref:'time:46',generation:1};
const form='<label for="last">姓氏</label><input id="last" required value="FAKE"><label for="first">名字</label><input id="first" required value="TEST"><label for="email">电子邮件地址</label><input id="email" type="email" required value="fake@example.invalid"><label for="phone">联系人手机号码</label><input id="phone" type="tel" required value="00000000000"><label for="identity">政府颁发的身份证件号码的后四位</label><input id="identity" maxlength="4" required><button id="continue">继续选择付款方式</button>';
const full='<h2>iPhone 18 Pro 256GB 黑色</h2><p>数量：1</p><p>总计 RMB 9,999</p><p>店内取货</p><p>取货地点：Apple 大连恒隆广场</p>';
const pageHtml=legacy=>'<html data-fake="c051"><main><h1>FAKE取货资料</h1><button data-autom="companionbar-button">显示订单摘要： RMB 9,999</button>'+(legacy?full:'')+form+'</main></html>';
let browser,server,origin;const contexts=new Set(),results=[],cleanup={contextsClosed:0,browserClosed:false,serverClosed:false,errors:[]};
async function check(name,legacy,expectContinuation){let c;try{
 c=await browser.newContext({serviceWorkers:'block'});contexts.add(c);await c.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort('blockedbyclient'));await c.routeWebSocket('**/*',s=>s.close());const p=await c.newPage();await p.goto(origin);await p.setContent(pageHtml(legacy));
 const read=async cmd=>p.evaluate(async({source,plan,cmd})=>{if(location.hostname!=='127.0.0.1'||document.documentElement.dataset.fake!=='c051')throw Error('OwnedFixtureOnly');return await(new Function('location',`return (${source});`))({href:'https://secure8.www.apple.com.cn/shop/checkout'})(plan,cmd);},{source:merchantDocument.toString(),plan,cmd});
 const o=await read(null);assert.equal(o.phase,'DETAILS');const actions=[];
 let stored={schema:'applebuy-purchase-job/v1',taskId:'FAKE-c051',plan:structuredClone(plan),planDigest:'FAKE-digest',tabId:7,state:'NEEDS_VERIFICATION',lastPhase:'SLOTS',lastDocumentId:'FAKE-before',entryDocumentId:'FAKE-entry',lastRead:10,expiresAt:100000,initialDates:['october5','october6'],dateCursor:0,floors:{october5:'21:15'},rejected:[],refusals:0,pending:{id:'FAKE-slot',action:'chooseSlot',documentId:'FAKE-before',beforePhase:'SLOTS',deadline:900,...slot},finalIntent:null,orderRefHash:null,bagAddStarted:true,resourceWritten:true,untouchedFailures:0,untouchedStreak:0,quotedCny:9999,bagTotalCny:9999};
 if(!expectContinuation)stored.reconcileOnly=true;
 const api={tabs:{get:async()=>({url:'https://secure8.www.apple.com.cn/shop/checkout'})},permissions:{contains:async()=>true},scripting:{executeScript:async q=>{if(q.args[1])actions.push(q.args[1].action);return [{frameId:0,documentId:'FAKE-contact',result:await read(q.args[1]??null)}];}}};
 const port=new ChromePort(api,7,{authorized:true,initialSequence:10,pending:stored.pending});port.act=async cmd=>{actions.push(cmd.action);return {delivered:false,touched:false,reason:'FAKE-stop-before-private-write'};};
 const store={get:async()=>structuredClone(stored),put:async(k,v)=>{assert.equal(k,TASK_KEY);stored=structuredClone(v);}};const r=await new PurchaseJob({store,port,now:()=>1000,maxWaitMs:0,maxUntouched:0}).run(plan,{tabId:7,planDigest:'FAKE-digest'});
 assert.ok(!actions.includes('chooseSlot')&&!actions.includes('submitOrder'));
 if(expectContinuation){assert.notEqual(r.pending?.action,'chooseSlot');assert.deepEqual(r.acceptedSlot?.date,slot.date);assert.deepEqual(actions,['fillDetails']);}else{assert.equal(r.pending.action,'chooseSlot');assert.equal(actions.length,0);}
 results.push({name,pass:true,phase:o.phase,currentPurchaseVerified:o.purchase.verified,summaryReadable:o.summaryReadable,pending:r.pending?.action??null,actions});
 }catch(e){results.push({name,pass:false,error:String(e.message).slice(0,180)});}finally{if(c){try{await c.close();contexts.delete(c);cleanup.contextsClosed++;}catch{cleanup.errors.push('context-close');}}}}
try{server=http.createServer((q,r)=>r.end('<!doctype html><title>FAKE C051</title>'));await new Promise(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${server.address().port}`;browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});await check('legacy-full-purchase-contact-baseline',true,true);await check('current-contact-only-cannot-continue',false,true);await check('current-contact-only-permanent-readonly-preserves-sent-slot',false,false);}finally{for(const c of contexts){try{await c.close();cleanup.contextsClosed++;}catch{cleanup.errors.push('remaining-context');}}if(browser){await browser.close();cleanup.browserClosed=true;}if(server){await new Promise(r=>server.close(r));cleanup.serverClosed=true;}}
console.log(JSON.stringify({scope:'FAKE independent pre-fix contact-only reproduction; private write stubbed untouched',results,cleanup},null,2));if(results.some(r=>!r.pass)||cleanup.errors.length)process.exitCode=1;
