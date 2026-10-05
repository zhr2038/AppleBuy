// C062 quota takeover regression. Real production record/job/control; merchant, Chrome and storage are FAKE.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto,createHash} from 'node:crypto';
import {createPurchaseRecord,PurchaseJob,TASK_KEY,VALIDATION_KEY,NO_EXTRAS,retirable,validStored} from '../web/checkout-connector/job.js';
import {restartExpiredPreFinal} from '../web/checkout-connector/pre-final-restart.js';
import {ChromePort,allowedMerchantUrl} from '../web/checkout-connector/chrome-port.js';
import {withPurchaseOwner} from '../web/checkout-connector/owner.js';
import {taskDiagnostic} from '../web/checkout-connector/task-diagnostic.js';
import {probeClosedCheckout} from '../web/checkout-connector/closed-checkout-probe.js';

const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{...NO_EXTRAS}};
const digest=createHash('sha256').update(JSON.stringify(plan)).digest('hex'),NOW=2000000;
const record=(taskId='FAKE-c062-old')=>createPurchaseRecord(plan,{taskId,planDigest:digest,tabId:6,now:0,id:()=> 'FAKE-id'});
const retired=taskId=>({...record(taskId),state:'RETIRED',reconcileOnly:true});
function oldAttempt(){return {...record(),state:'NEEDS_VERIFICATION',lastPhase:'UNKNOWN',lastRead:2,initialDates:['october5','october6'],floors:{october5:'21:15'},pending:{id:'FAKE-choice',action:'chooseSlot',documentId:'FAKE-slots',beforePhase:'SLOTS',deadline:8000,date:'october5',start:'21:15',end:'21:30'},bagAddStarted:true,resourceWritten:true};}
function harness(row=oldAttempt()){
  const h={row:structuredClone(row),before:structuredClone(row),writes:0,reads:0};
  const store={async get(){return structuredClone(h.row);},async put(k,v){assert.equal(k,TASK_KEY);h.row=structuredClone(v);h.writes++;}};
  const api={tabs:{async query(){return [{id:7,url:'https://www.apple.com.cn/shop/bag'}];}}};
  const port={async observe(){h.reads++;return {schema:'applebuy-merchant-read/v1',phase:'EMPTY_BAG',verifiedStep:true,path:'/shop/bag',documentId:'FAKE-empty',seq:1};},async act(){throw Error('Restart cannot send a merchant command');}};
  return {h,store,run:()=>restartExpiredPreFinal({store,api,port,plan,planDigest:digest,tabId:7,enabled:true,dateWindowConfirmed:true,now:()=>NOW,id:()=> 'FAKE-c062-new'})};
}
function preserved(w){assert.equal(w.h.writes,0);assert.deepEqual(w.h.row,w.h.before);}
test('C062 factory omission is legal and creates one successor without rewriting the old snapshot',async()=>{
  const w=harness();assert.equal(validStored(w.h.row),true);assert.equal(Object.hasOwn(w.h.row,'acceptedSlot'),false);assert.equal(taskDiagnostic(w.h.row,NOW).acceptedSlot,null);
  assert.equal((await w.run()).created,true);const old=w.h.row.retiredHistory.at(-1);assert.deepEqual(old.abandonedPreFinal.originalSnapshot,w.h.before);assert.equal(Object.hasOwn(old,'acceptedSlot'),false);assert.equal(Object.hasOwn(old.abandonedPreFinal.originalSnapshot,'acceptedSlot'),false);
  assert.equal((await w.run()).created,false);assert.equal(w.h.writes,1);
});
test('C062 two normal retired factory records also omit acceptedSlot and retain their exact bytes',async()=>{
  const row={...oldAttempt(),retiredHistory:[retired('FAKE-history-1'),retired('FAKE-history-2')]},w=harness(row);
  assert.equal(taskDiagnostic(row,NOW).priorSlotOrFinalPresent,false);assert.equal((await w.run()).created,true);assert.deepEqual(w.h.row.retiredHistory.slice(0,2),row.retiredHistory);assert.deepEqual(w.h.row.retiredHistory.at(-1).abandonedPreFinal.originalSnapshot,row);
});
test('C062 actual PurchaseJob unknown choice is recoverable after expiry without replaying that choice',async()=>{
  const w=harness({...record(),bagAddStarted:true,resourceWritten:true}),calls=[];let phase='SLOTS',seq=0;
  const purchase={...plan.product,quantity:1,totalCny:9999,itemVerified:true,verified:true,fulfillment:'pickup',store:plan.stores[0],storeVerified:true};
  const port={async observe(){return {schema:'applebuy-merchant-read/v1',phase,verifiedStep:true,documentId:'FAKE-'+phase,seq:++seq,generation:1,path:'/shop/checkout',purchase,extras:false,listComplete:true,selectedDate:'october5',dates:[{label:'october5',ref:'date:0',enabled:true,selected:true},{label:'october6',ref:'date:1',enabled:true}],times:[{start:'21:15',end:'21:30',ref:'time:46',enabled:true}]};},async act(c){calls.push(c.action);assert.equal(c.action,'chooseSlot');phase='UNKNOWN';return {delivered:true};}};
  const result=await new PurchaseJob({store:w.store,port,now:()=>0,maxSteps:8}).run(plan,{tabId:6,planDigest:digest});assert.equal(result.pending.action,'chooseSlot');assert.equal(result.state,'NEEDS_VERIFICATION');assert.equal(Object.hasOwn(result,'acceptedSlot'),false);assert.deepEqual(calls,['chooseSlot']);
  w.h.before=structuredClone(result);assert.equal((await w.run()).created,true);assert.deepEqual(w.h.row.retiredHistory.at(-1).abandonedPreFinal.originalSnapshot,result);assert.deepEqual(calls,['chooseSlot']);
});
for(const [name,value] of [['verified',{date:'october5',start:'21:15',end:'21:30',verified:true}],['malformed object',{}],['false',false],['string','FAKE-unknown']])test('C062 recorded '+name+' acceptance still blocks both current and historical replacement',async()=>{
  for(const row of [{...oldAttempt(),acceptedSlot:value},{...oldAttempt(),retiredHistory:[{...retired('FAKE-history'),acceptedSlot:value}]}]){const w=harness(row);assert.equal((await w.run()).created,false);preserved(w);}
});
test('C062 omitted optional acceptance never repairs missing required final/pending/history fields',async()=>{
  const noFinal=oldAttempt();delete noFinal.finalIntent;const noPending=oldAttempt();delete noPending.pending;
  const partialHistory={...oldAttempt(),retiredHistory:[{schema:'applebuy-purchase-job/v1',state:'RETIRED',pending:null}]};
  for(const row of [noFinal,noPending,partialHistory]){const w=harness(row);assert.equal((await w.run()).created,false);preserved(w);}
});
test('C062 final intent/order references and nested accepted history block with optional fields omitted',async()=>{
  for(const delta of [{finalIntent:{id:'FAKE-final',sent:false}},{orderRefHash:'FAKE-ref'},{orderDetailLink:'FAKE-detail'},{retiredHistory:[{...retired('FAKE-history'),retiredHistory:[{...retired('FAKE-nested'),acceptedSlot:{verified:true}}]}]}]){const w=harness({...oldAttempt(),...delta});assert.equal((await w.run()).created,false);preserved(w);}
});
test('C062 actual control handler accepts a factory-shaped old record and clears stale final consent',async()=>{
  const w=harness({...oldAttempt(),retiredHistory:[retired('FAKE-history-1'),retired('FAKE-history-2')]}),nodes=new Map(),commands=[];let uri='https://www.apple.com.cn/shop/bag';
  const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,disabled:false,textContent:'',href:'',replaceChildren(){}});return nodes.get(id);};
  node('product').value='pro';node('tab').value='7';node('approve').checked=true;node('restartConfirm').checked=true;node('finalReview').checked=true;
  const chrome={storage:{local:{async get(k){return {[k]:await w.store.get(k)};},async set(v){await w.store.put(TASK_KEY,v[TASK_KEY]);}},session:{async get(){return {};}}},tabs:{async query(){return [{id:7,url:uri}];},async get(){return {id:7,url:uri,status:'complete'};},async update(id,{url}){uri=url;return {id,url,status:'complete'};}},permissions:{async contains(){return true;}},scripting:{async executeScript(q){if(q.args.length>1){commands.push(q.args[1].action);return [{frameId:0,documentId:q.target.documentIds[0],result:{delivered:true}}];}const bag=uri.endsWith('/bag');return [{frameId:0,documentId:bag?'FAKE-empty':'FAKE-product',result:{schema:'applebuy-merchant-read/v1',phase:bag?'EMPTY_BAG':'PRELAUNCH',path:bag?'/shop/bag':'/shop/buy-iphone/iphone-18-pro',verifiedStep:true,prelaunchConfigurable:false}}];}}};
  const ctx=vm.createContext({document:{getElementById:node},chrome,navigator:{locks:{async request(name,opt,fn){return fn({});}}},crypto:webcrypto,TextEncoder,URL,structuredClone,Date:class extends Date{static now(){return NOW;}},PurchaseJob,ChromePort,allowedMerchantUrl,withPurchaseOwner,taskDiagnostic,probeClosedCheckout,restartExpiredPreFinal,TASK_KEY,VALIDATION_KEY,NO_EXTRAS,retirable});
  const source=readFileSync(new URL('../web/checkout-connector/control.js',import.meta.url),'utf8').replace(/^import .*;\r?$/gm,'');await vm.runInContext('(async()=>{'+source+'\n})()',ctx);await node('restartPreFinal').onclick();
  assert.notEqual(w.h.row.taskId,w.h.before.taskId);assert.deepEqual(w.h.row.retiredHistory.at(-1).abandonedPreFinal.originalSnapshot,w.h.before);assert.equal(node('finalReview').checked,false);assert.equal(w.h.row.finalIntent,null);assert.deepEqual(commands,['openProduct']);
  await node('restartPreFinal').onclick();assert.deepEqual(commands,['openProduct']);
});
