// C047 Codex quota takeover. Real control.js + PurchaseJob, FAKE DOM/storage/locks/merchant observation only.
// No personal Chrome, extension storage, Apple, credentials, network, slot or order.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
import {PurchaseJob,TASK_KEY,VALIDATION_KEY,NO_EXTRAS,retirable} from '../web/checkout-connector/job.js';
import {withPurchaseOwner} from '../web/checkout-connector/owner.js';
const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{...NO_EXTRAS}};
const digest=p=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
const row=()=>({schema:'applebuy-purchase-job/v1',taskId:'FAKE-private-task',plan:structuredClone(plan),planDigest:digest(plan),tabId:7,state:'BLOCKED',lastPhase:'BAG',lastDocumentId:'FAKE-old',entryDocumentId:'FAKE-entry',lastRead:10,expiresAt:1,initialDates:null,dateCursor:0,floors:{},rejected:[],refusals:0,pending:{id:'FAKE-private-action',action:'viewBag',documentId:'FAKE-old',beforePhase:'ACCESSORIES',deadline:1},finalIntent:null,orderRefHash:null,bagAddStarted:true,resourceWritten:true,untouchedFailures:0,untouchedStreak:0,quotedCny:9999,reconcileOnly:true,history:[{event:'FAKE-preserved'}],revokedGrantIds:['FAKE-private-grant']});
async function harness(patch={}){
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,disabled:false,href:'',textContent:'',replaceChildren(){}});return nodes.get(id);};
 node('product').value='pro';node('tab').value='8';node('rebindConfirm').checked=true;
 const h={row:{...row(),...patch},writes:0,reads:0,sessionReads:0,actions:[],observations:0,permissionRequests:0,busy:false,barrier:null};
 const chrome={storage:{local:{async get(k){h.reads++;await h.barrier?.();return {[k]:structuredClone(h.row)};},async set(v){h.writes++;h.row=structuredClone(v[TASK_KEY]);}},session:{async get(){h.sessionReads++;throw Error('Private session is forbidden in diagnostic');},async set(){throw Error('No private data write');}}},permissions:{request(){h.permissionRequests++;throw Error('No permission request');}}};
 class FakePort{
  constructor(api,tabId,options){assert.equal(options.mode==='observe'||options.authorized===false,true);this.seq=options.initialSequence??0;}
  async observe(){h.observations++;return {schema:'applebuy-merchant-read/v1',phase:'BAG',documentId:'FAKE-fresh-bag',seq:++this.seq,verifiedStep:true,extras:false,purchase:{...plan.product,itemVerified:true,verified:false,quantity:1,totalCny:9999}};}
  async act(c){h.actions.push(c);throw Error('No merchant action in this test');}
 }
 const context=vm.createContext({document:{getElementById:node},chrome,navigator:{locks:{async request(name,opts,fn){return fn(h.busy?null:{});}}},crypto:webcrypto,TextEncoder,Date,URL,structuredClone,PurchaseJob,ChromePort:FakePort,allowedMerchantUrl:()=>true,withPurchaseOwner,TASK_KEY,VALIDATION_KEY,NO_EXTRAS,retirable});
 const source=readFileSync(new URL('../web/checkout-connector/control.js',import.meta.url),'utf8').replace(/^import .*;\r?$/gm,'');
 await vm.runInContext('(async()=>{'+source+'\n})()',context);
 h.click=id=>node(id).onclick();h.status=()=>node('state').textContent;h.node=node;return h;
}
const noMerchant=h=>assert.equal(h.actions.length+h.observations+h.sessionReads+h.permissionRequests,0);
test('C047 controller revision stays visible after the existing boot read without claiming full installed byte identity',async()=>{
 const h=await harness();assert.match(h.status(),/C047 绑定诊断已加载/);assert.equal(h.reads,1);assert.equal(h.writes,0);noMerchant(h);assert.doesNotMatch(h.status(),/已验收|已核对全部源码|购买成功/);
});
test('C047 tab-only mismatch shows all three binding facts and preserves the unknown viewBag',async()=>{
 const h=await harness(),before=structuredClone(h.row);await h.click('reconcile');
 assert.match(h.status(),/标签页一致：否；购买摘要一致：是；条件记录一致：是；差异项：无/);assert.match(h.status(),/原任务：iPhone 18 Pro · 标签页 7/);assert.match(h.status(),/当前：iPhone 18 Pro · 标签页 8/);assert.deepEqual(h.row,before);assert.equal(h.writes,0);noMerchant(h);
});
for(const [label,change] of [
 ['总价上限',p=>p.maxTotalCny=9000],['数量',p=>p.quantity=2],['门店',p=>p.stores=['FAKE-private-store']],['日期时段规则',p=>p.dateRule='FAKE-private-rule'],['付款方式',p=>p.paymentMethod='FAKE-private-payment'],['附加项',p=>p.extras.appleCare='FAKE-private-extra']
])test('C047 digest match does not conceal differing saved '+label,async()=>{
 const h=await harness();change(h.row.plan);const before=structuredClone(h.row);await h.click('reconcile');
 assert.match(h.status(),/购买摘要一致：是；条件记录一致：否/);assert.ok(h.status().includes('差异项：'+label));assert.doesNotMatch(h.status(),/FAKE-private/);assert.deepEqual(h.row,before);assert.equal(h.writes,0);noMerchant(h);
});
test('C047 an inconsistent saved plan blocks an actual read-only rebind without clearing pending/history/grants',async()=>{
 const h=await harness();h.row.plan.maxTotalCny=9000;const before=structuredClone(h.row);await h.click('rebind');
 assert.match(h.status(),/状态：BLOCKED/);assert.match(h.status(),/待确认动作：查看购物袋/);assert.match(h.status(),/购买摘要一致：是；条件记录一致：否；差异项：总价上限/);assert.deepEqual(h.row.pending,before.pending);assert.deepEqual(h.row.history,before.history);assert.deepEqual(h.row.revokedGrantIds,before.revokedGrantIds);assert.equal(h.row.tabId,7);noMerchant(h);
});
test('C047 the same-tab guard also explains a normalized record mismatch without observing or purchasing',async()=>{
 const h=await harness();h.node('tab').value='7';h.row.plan.maxTotalCny=9000;await h.click('reconcile');
 assert.match(h.status(),/状态：BLOCKED/);assert.match(h.status(),/标签页一致：是；购买摘要一致：是；条件记录一致：否/);assert.equal(h.row.pending.action,'viewBag');noMerchant(h);
});
test('C047 safe diagnosis never echoes extra unknown record keys/values, digest, task, action or grant ids',async()=>{
 const h=await harness();h.row.plan['FAKE-private-key']='FAKE-private-value';h.row.planDigest='FAKE-private-digest';await h.click('reconcile');
 assert.match(h.status(),/条件记录一致：否；差异项：其他记录字段/);assert.doesNotMatch(h.status(),/FAKE-private/);assert.equal(h.writes,0);noMerchant(h);
});
for(const kind of ['legacy-no-extras','object-member-order'])test('C047 compatible stored '+kind+' is not diagnosed as different',async()=>{
 const h=await harness();if(kind==='legacy-no-extras'){delete h.row.plan.extras;h.row.planDigest=digest(h.row.plan);}else h.row.plan=Object.fromEntries(Object.entries(h.row.plan).reverse());
 await h.click('reconcile');assert.match(h.status(),/购买摘要一致：是；条件记录一致：是；差异项：无/);assert.equal(h.row.pending.action,'viewBag');noMerchant(h);
});
test('C047 matching read-only rebind clears only the verified viewBag, retains permanent read-only authority and history',async()=>{
 const h=await harness(),before=structuredClone(h.row);await h.click('rebind');
 assert.match(h.status(),/read-only-reconciliation-complete/);assert.equal(h.row.pending,null);assert.equal(h.row.tabId,8);assert.equal(h.row.reconcileOnly,true);assert.equal(h.row.bagAddStarted,true);assert.equal(h.row.resourceWritten,true);assert.deepEqual(h.row.revokedGrantIds,before.revokedGrantIds);assert.deepEqual(h.row.history[0],before.history[0]);assert.equal(h.actions.length+h.sessionReads+h.permissionRequests,0);assert.equal(h.observations,2);
});
test('C047 busy owner does not read a task, diagnose private state, or steal execution',async()=>{
 const h=await harness(),beforeReads=h.reads;h.busy=true;await h.click('reconcile');assert.match(h.status(),/另一控制页正在执行/);assert.equal(h.reads,beforeReads);assert.equal(h.writes,0);noMerchant(h);
});
test('C047 pause during stored-task read cancels before any binding diagnosis or page read',async()=>{
 const h=await harness(),before=structuredClone(h.row);let enter,release;const reached=new Promise(r=>enter=r),blocked=new Promise(r=>release=r);h.barrier=async()=>{enter();await blocked;};
 const running=h.click('reconcile');await reached;h.click('pause');release();await running;assert.match(h.status(),/进行中的准备已取消/);assert.doesNotMatch(h.status(),/程序诊断 C047/);assert.deepEqual(h.row,before);assert.equal(h.writes,0);noMerchant(h);
});
