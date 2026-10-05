// Codex independent reproduction of C077 N1. Every record, API and merchant result is FAKE.
import test from 'node:test';import assert from 'node:assert/strict';
import {PurchaseJob,TASK_KEY,VALIDATION_KEY,NO_EXTRAS,retirable,createPurchaseRecord} from '../web/checkout-connector/job.js';
import {PRO_PLAN,proDigest} from '../src/desktop/browser-session.mjs';
import {exportDesktopHandoff} from '../web/checkout-connector/desktop-handoff.js';
import {restartExpiredPreFinal} from '../web/checkout-connector/pre-final-restart.js';
import vm from 'node:vm';import {readFileSync} from 'node:fs';import {webcrypto} from 'node:crypto';
import {ChromePort,allowedMerchantUrl} from '../web/checkout-connector/chrome-port.js';import {withPurchaseOwner} from '../web/checkout-connector/owner.js';import {taskDiagnostic} from '../web/checkout-connector/task-diagnostic.js';import {probeClosedCheckout} from '../web/checkout-connector/closed-checkout-probe.js';
const base=()=>createPurchaseRecord(PRO_PLAN,{taskId:'FAKE-original',planDigest:proDigest,tabId:7,now:Date.now(),id:()=> 'FAKE'});
const marker={schema:'applebuy-desktop-handoff/v1',id:'FAKE-export'};
function fixture(row){let reads=0,writes=0,actions=0;const initial=structuredClone(row);return {initial,get row(){return row;},get counts(){return {reads,writes,actions};},store:{async get(){return structuredClone(row);},async put(k,v){assert.equal(k,TASK_KEY);writes++;row=structuredClone(v);}},port:{async observe(){reads++;return {schema:'applebuy-merchant-read/v1',phase:'BAG',verifiedStep:true,documentId:'FAKE-bag',seq:20,purchase:{...PRO_PLAN.product,quantity:1,totalCny:9999,itemVerified:true,verified:true,fulfillment:'pickup',store:PRO_PLAN.stores[0]},extras:false};},async act(){actions++;return {delivered:true};}}};}

test('C078 N1 exported resolved bag cannot retire; no merchant read or record write',async()=>{
 const f=fixture({...base(),reconcileOnly:true,lastPhase:'BAG',resourceWritten:true,bagAddStarted:true,orderRefHash:null,desktopHandoff:marker});
 await assert.rejects(new PurchaseJob({store:f.store,port:f.port}).retireReadOnlyBag(PRO_PLAN,{tabId:7,planDigest:proDigest}));
 assert.deepEqual(f.counts,{reads:0,writes:0,actions:0});assert.deepEqual(f.row,f.initial);
});
for(const placement of ['top','retiredHistory'])test('C078 N1 exported RETIRED '+placement+' cannot create a fresh source buyer',async()=>{
 const archived={...base(),state:'RETIRED',desktopHandoff:marker};const row={...base(),state:'RETIRED',...(placement==='top'?{desktopHandoff:marker}:{retiredHistory:[archived]})};const f=fixture(row);
 await assert.rejects(new PurchaseJob({store:f.store,port:f.port,maxSteps:1}).run(PRO_PLAN,{tabId:7,planDigest:proDigest,taskId:'FAKE-successor'}));
 assert.deepEqual(f.counts,{reads:0,writes:0,actions:0});assert.deepEqual(f.row,f.initial);
});
test('C078 N1 already-retired task cannot be exported as an active ownership handoff',async()=>{
 const f=fixture({...base(),state:'RETIRED'});await assert.rejects(exportDesktopHandoff({store:f.store,confirmed:true}));assert.deepEqual(f.counts,{reads:0,writes:0,actions:0});assert.deepEqual(f.row,f.initial);
});
test('C078 N1 nested export also blocks expired pre-final source restart before bag read',async()=>{
 const f=fixture({...base(),tabId:9,state:'NEEDS_VERIFICATION',expiresAt:0,initialDates:['October 5'],dateCursor:0,floors:{'October 5':'21:15'},bagAddStarted:true,resourceWritten:true,pending:{id:'FAKE-slot',action:'chooseSlot',beforePhase:'SLOTS',documentId:'FAKE-old',deadline:0,date:'October 5',start:'21:15',end:'21:30'},retiredHistory:[{...base(),state:'RETIRED',desktopHandoff:marker}]});
 const r=await restartExpiredPreFinal({store:f.store,api:{tabs:{async query(){return [{id:7,url:'https://www.apple.com.cn/shop/bag'}];}}},port:f.port,plan:PRO_PLAN,planDigest:proDigest,tabId:7,enabled:true,dateWindowConfirmed:true});
 assert.equal(r.created,false);assert.deepEqual(f.counts,{reads:0,writes:0,actions:0});assert.deepEqual(f.row,f.initial);
});
test('C078 N1 pre-fix active successor carrying exported history cannot keep purchasing',async()=>{
 const f=fixture({...base(),retiredHistory:[{...base(),state:'RETIRED',desktopHandoff:marker}]});
 await assert.rejects(new PurchaseJob({store:f.store,port:f.port,maxSteps:1}).run(PRO_PLAN,{tabId:7,planDigest:proDigest}));
 assert.deepEqual(f.counts,{reads:0,writes:0,actions:0});assert.deepEqual(f.row,f.initial);
});
test('C078 actual source UI export -> retire -> prepare -> start never restores a buyer',async()=>{
 let row={...base(),reconcileOnly:true,lastPhase:'BAG',resourceWritten:true,bagAddStarted:true,orderRefHash:null},writes=0,reads=0,privateReads=0;
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,disabled:false,href:'',textContent:'',replaceChildren(){}});return nodes.get(id);};node('product').value='pro';node('tab').value='7';node('handoffConfirm').checked=true;node('approve').checked=true;
 class FakeURL extends URL{static createObjectURL(){return 'blob:FAKE';}static revokeObjectURL(){}}
 const chrome={storage:{local:{async get(k){return {[k]:structuredClone(row)};},async set(v){row=structuredClone(v[TASK_KEY]);writes++;}},session:{async get(){privateReads++;return {};}}},permissions:{async contains(){return true;}},tabs:{async get(){return {id:7,url:'https://www.apple.com.cn/shop/bag'};}},scripting:{async executeScript(){reads++;throw Error('Source may not read merchant after handoff');}}};
 const context=vm.createContext({document:{getElementById:node,createElement(){return {click(){}};}},chrome,navigator:{locks:{async request(name,o,fn){return fn({});}}},crypto:webcrypto,TextEncoder,URL:FakeURL,Blob,Date,structuredClone,setTimeout:fn=>fn(),PurchaseJob,ChromePort,allowedMerchantUrl,withPurchaseOwner,taskDiagnostic,probeClosedCheckout,restartExpiredPreFinal,exportDesktopHandoff,TASK_KEY,VALIDATION_KEY,NO_EXTRAS,retirable});
 const source=readFileSync(new URL('../web/checkout-connector/control.js',import.meta.url),'utf8').replace(/^import .*;\r?$/gm,'');await vm.runInContext('(async()=>{'+source+'\n})()',context);
 await node('exportDesktop').onclick();assert.equal(row.reconcileOnly,true);assert.equal(row.desktopHandoff.schema,'applebuy-desktop-handoff/v1');const exported=structuredClone(row);writes=0;
 await node('retire').onclick();await node('prepare').onclick();await node('start').onclick();assert.equal(writes,0);assert.equal(reads,0);assert.equal(privateReads,0);assert.deepEqual(row,exported);assert.match(node('state').textContent,/原插件购买权限已停止/);
});
