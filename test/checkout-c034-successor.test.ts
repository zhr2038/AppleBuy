// C034 implementation tests (Claude). Every merchant fact, cart line, Chrome API, storage record and authority here is FAKE.
// No browser, Apple page, credential, real cart, slot or order. They exercise only the actual PurchaseJob and control.js logic.
// The fake bag reports one line as verified and several lines as unverified; an emptied bag is UNKNOWN because the actual page
// program has no observed empty-bag contract. Nothing here proves how the official bag renders.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto,createHash} from 'node:crypto';
import {PurchaseJob,TASK_KEY,VALIDATION_KEY,NO_EXTRAS,retirable,validStored,retiredCartFact} from '../web/checkout-connector/job.js';
import {withPurchaseOwner} from '../web/checkout-connector/owner.js';

const pro={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{...NO_EXTRAS}};
const duo={...pro,product:{model:'iPhone Duo',capacity:'256GB',color:'星光白色'},maxTotalCny:15999};
// Same JSON member order as control.js plan(), so the actual control handler binds the same digest.
const digest=p=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
const price=product=>product.model==='iPhone Duo'?15999:9999;
const DUO_CHOICES=['星光白色','256GB','不折抵换购','不加 AppleCare+ 服务计划'];
const HOLDS='retired-cart-holds-earlier-item; no second addition; open the bag page for a fresh read';
const NOT_THIS='retired-cart-bag-not-exactly-this-plan; nothing removed, bought or added';
// The resolved permanently read-only Pro rehearsal (C030 shape): one executor-added item, verified in the bag.
const oldRow=()=>({schema:'applebuy-purchase-job/v1',taskId:'FAKE-c034-old',plan:structuredClone(pro),planDigest:digest(pro),tabId:7,state:'NEEDS_USER',lastPhase:'BAG',lastDocumentId:'FAKE-old-bag-doc',entryDocumentId:'FAKE-old-entry',reason:'read-only-reconciliation-complete; a rebound tab cannot add purchase authority',pending:null,finalIntent:null,orderRefHash:null,initialDates:null,dateCursor:0,floors:{},rejected:[],refusals:0,lastRead:10,expiresAt:900,bagAddStarted:true,resourceWritten:true,untouchedFailures:0,untouchedStreak:0,quotedCny:9999,bagTotalCny:9999,reconcileOnly:true,mode:'purchase',revokedGrantIds:['FAKE-old-authority'],history:[{event:'human-tab-rebind',fromTabId:6,toTabId:7,at:500}]});

function harness(initial=oldRow()){
  const h={row:structuredClone(initial),acts:[],states:[],cart:[{...pro.product}],phase:'BAG',plan:pro,choices:[],selected:[],seq:10,ids:0};
  const next=()=>{const c=h.choices.find(x=>!h.selected.includes(x));return c?{choice:c,state:'enabled'}:null;};
  h.read=()=>{const base={schema:'applebuy-merchant-read/v1',documentId:'FAKE-c034-doc-'+h.phase,seq:++h.seq,phase:h.phase,verifiedStep:true};
    if(h.phase==='BAG'){const one=h.cart.length===1;return {...base,extras:false,purchase:{...(one?h.cart[0]:h.plan.product),itemVerified:one,verified:false,quantity:one?1:null,totalCny:one?price(h.cart[0]):null,store:null,fulfillment:null}};}
    if(h.phase==='PRELAUNCH')return {...base,prelaunchConfigurable:true,nextChoice:next(),selectedProductChoices:[...h.selected]};
    return {...base,nextChoice:next(),selectedProductChoices:[...h.selected],continueAvailable:true,variantVerified:h.phase==='VARIANT',quotedCny:h.plan.maxTotalCny,extrasConflict:false};};
  h.port={observe:async()=>h.read(),wait:async()=>{},act:async c=>{h.acts.push(c.action);
    if(c.action==='configureProduct')h.selected.push(c.choice);else if(c.action==='continueProduct')h.phase='VARIANT';
    else if(c.action==='addBag'){h.cart.push({...h.plan.product});h.phase='BAG';}else if(c.action==='checkout')h.phase='AUTH';
    return {delivered:true};}};
  h.store={get:async k=>{assert.equal(k,TASK_KEY);return structuredClone(h.row);},put:async(k,v)=>{assert.equal(k,TASK_KEY);h.row=structuredClone(v);}};
  h.job=()=>new PurchaseJob({store:h.store,port:h.port,now:()=>1000,id:()=>'FAKE-c034-new-'+(++h.ids),maxSteps:20,onState:s=>h.states.push(structuredClone(s))});
  h.retire=()=>h.job().retireReadOnlyBag(pro,{tabId:7,planDigest:digest(pro)});
  h.run=(p,phase,opts={})=>{h.plan=p;h.phase=phase;return h.job().run(p,{tabId:7,planDigest:digest(p),...opts});};
  return h;
}

test('C034 the successor carries the retired verified cart item, keeps its own markers and history, and never adds (same plan, VARIANT)',async()=>{
  const h=harness(),retired=await h.retire(),r=await h.run(pro,'VARIANT');
  assert.deepEqual(h.acts,[]);assert.deepEqual(h.cart,[{...pro.product}]);assert.equal(r.state,'NEEDS_USER');assert.equal(r.reason,HOLDS);
  assert.deepEqual(r.retiredCart,{kind:'resolved-pre-slot-bag',fromTaskId:'FAKE-c034-old',product:{...pro.product},quantity:1,totalCny:9999,readSequence:retired.readOnlyRetirement.readSequence,retiredAt:1000});
  assert.equal(r.bagAddStarted,false);assert.equal(r.resourceWritten,false);assert.notEqual(r.taskId,retired.taskId);assert.deepEqual(r.retiredHistory,[retired]);
  assert.equal(h.states.at(-1).retiredCart,true);assert.equal(validStored(h.row),true);
});
test('C034 a fresh, valid one-click start authority alone does not authorize the second addition',async()=>{
  const h=harness();await h.retire();
  const grant={id:'FAKE-c034-new-grant',start:true,taskId:'FAKE-c034-successor',planDigest:digest(pro),entryDocumentId:'FAKE-c034-doc-VARIANT',existingOrdersChecked:true,noExtras:true,termsAccepted:true,expiry:1000+600000};
  const r=await h.run(pro,'VARIANT',{grant,taskId:grant.taskId});
  assert.equal(r.taskId,'FAKE-c034-successor');assert.equal(r.reason,HOLDS);assert.deepEqual(h.acts,[]);assert.deepEqual(r.revokedGrantIds,['FAKE-c034-new-grant']);
});
test('C034 restart keeps the cart fact and still cannot add; a later bag read of this plan\'s one item checks out exactly once',async()=>{
  const h=harness();await h.retire();const first=await h.run(pro,'VARIANT');
  const again=await h.run(pro,'ENTRY');
  assert.equal(again.taskId,first.taskId);assert.deepEqual(again.retiredCart,first.retiredCart);assert.equal(again.reason,HOLDS);assert.deepEqual(h.acts,['continueProduct']);
  const bag=await h.run(pro,'BAG');
  assert.deepEqual(h.acts,['continueProduct','checkout']);assert.equal(bag.reason,'auth');assert.equal(bag.taskId,first.taskId);assert.equal(bag.bagAddStarted,true);
  assert.deepEqual(bag.retiredCart,first.retiredCart);assert.deepEqual(h.cart,[{...pro.product}]);
});
test('C034 public preparation stays available: a Duo successor on a configurable pre-release page makes its public choices, then stops NOT_RELEASED; after release it still cannot add',async()=>{
  const h=harness();await h.retire();h.choices=[...DUO_CHOICES];
  const r=await h.run(duo,'PRELAUNCH');
  assert.deepEqual(h.acts,DUO_CHOICES.map(()=>'configureProduct'));assert.deepEqual(h.selected,DUO_CHOICES);
  assert.equal(r.state,'NOT_RELEASED');assert.equal(r.reason,'official-entry-not-released');assert.equal(r.resourceWritten,false);assert.equal(r.retiredCart.fromTaskId,'FAKE-c034-old');
  const later=await h.run(duo,'ENTRY');
  assert.equal(later.reason,HOLDS);assert.equal(later.taskId,r.taskId);assert.deepEqual(h.acts.slice(DUO_CHOICES.length),['continueProduct']);assert.deepEqual(h.cart,[{...pro.product}]);
});
test('C034 a Duo successor on the bag that still holds the Pro neither checks out, removes nor adds',async()=>{
  const h=harness();await h.retire();const r=await h.run(duo,'BAG');
  assert.deepEqual(h.acts,[]);assert.equal(r.state,'BLOCKED');assert.equal(r.reason,NOT_THIS);assert.deepEqual(h.cart,[{...pro.product}]);
});
test('C034 a bag holding more than the recorded item is never checked out by a successor',async()=>{
  const h=harness();await h.retire();h.cart.push({...pro.product});const r=await h.run(pro,'BAG');
  assert.deepEqual(h.acts,[]);assert.equal(r.reason,NOT_THIS);assert.equal(h.cart.length,2);
});
test('C034 when the person leaves only the current plan\'s one item in the bag, the Duo successor continues by Checkout without adding',async()=>{
  const h=harness();await h.retire();h.cart=[{...duo.product}];const r=await h.run(duo,'BAG');
  assert.deepEqual(h.acts,['checkout']);assert.equal(r.reason,'auth');assert.deepEqual(h.cart,[{...duo.product}]);
});
test('C034 an emptied bag is not recognized (no empty-bag contract), so the fact stays and Add to Bag stays blocked',async()=>{
  const h=harness();await h.retire();h.cart=[];
  const unknown=await h.run(duo,'UNKNOWN');assert.equal(unknown.reason,'unknown');assert.deepEqual(h.acts,[]);
  const r=await h.run(duo,'VARIANT');assert.equal(r.reason,HOLDS);assert.deepEqual(h.acts,[]);assert.deepEqual(h.cart,[]);assert.equal(r.retiredCart.fromTaskId,'FAKE-c034-old');
});
test('C034 untouched retirement of a successor that only made public choices passes the fact to the next task, including a changed plan',async()=>{
  const h=harness();await h.retire();h.choices=[...DUO_CHOICES];const duoTask=await h.run(duo,'PRELAUNCH');
  assert.equal(retirable(h.row),true);const untouched=await h.job().retire();assert.equal(untouched.state,'RETIRED');assert.equal(untouched.retiredCart.fromTaskId,'FAKE-c034-old');
  h.choices=[];h.selected=[];const third=await h.run(pro,'VARIANT');
  assert.equal(third.reason,HOLDS);assert.equal(third.retiredCart.fromTaskId,'FAKE-c034-old');assert.deepEqual(third.retiredHistory.map(x=>x.taskId),['FAKE-c034-old',duoTask.taskId]);
  assert.equal(h.acts.includes('addBag'),false);assert.deepEqual(h.cart,[{...pro.product}]);
});
test('C034 a successor saved before this fix (no cart field) derives the fact from its preserved retired history on restart',async()=>{
  const h=harness();await h.retire();await h.run(pro,'VARIANT');delete h.row.retiredCart;assert.equal(validStored(h.row),true);
  const r=await h.run(pro,'VARIANT');assert.equal(r.reason,HOLDS);assert.equal(r.retiredCart.fromTaskId,'FAKE-c034-old');assert.deepEqual(h.acts,[]);
});
test('C034 a retired chain without a read-only cart retirement does not restrict the next task',async()=>{
  const {reconcileOnly,...rest}=oldRow(),never={...rest,taskId:'FAKE-c034-untouched',state:'NOT_READY',lastPhase:'VARIANT',bagAddStarted:false,resourceWritten:false,quotedCny:null,bagTotalCny:null};
  const h=harness(never);await h.job().retire();assert.equal(h.row.state,'RETIRED');h.cart=[];
  const r=await h.run(pro,'VARIANT');assert.equal(r.retiredCart,undefined);assert.deepEqual(h.acts,['addBag','checkout']);assert.deepEqual(h.cart,[{...pro.product}]);
});
test('C034 retiredCartFact: the newest read-only cart retirement or carried fact wins; other history gives none',()=>{
  const ro={...oldRow(),state:'RETIRED',retiredAt:5,readOnlyRetirement:{kind:'resolved-pre-slot-bag',readSequence:11}};
  const carried={...oldRow(),taskId:'FAKE-c034-carrier',state:'RETIRED',reconcileOnly:false,retiredCart:{kind:'resolved-pre-slot-bag',fromTaskId:'FAKE-c034-old'}};
  const newer={...ro,taskId:'FAKE-c034-newer',plan:structuredClone(duo),bagTotalCny:15999,retiredCart:{kind:'resolved-pre-slot-bag',fromTaskId:'FAKE-c034-old'}};
  assert.equal(retiredCartFact(undefined),null);assert.equal(retiredCartFact([]),null);assert.equal(retiredCartFact([{...oldRow(),state:'RETIRED'}]),null);
  assert.equal(retiredCartFact([ro]).fromTaskId,'FAKE-c034-old');assert.deepEqual(retiredCartFact([ro,carried]),carried.retiredCart);
  assert.deepEqual(retiredCartFact([ro,carried,newer]),{kind:'resolved-pre-slot-bag',fromTaskId:'FAKE-c034-newer',product:{...duo.product},quantity:1,totalCny:15999,readSequence:11,retiredAt:5});
});
test('C034 a malformed stored cart fact is corrupt, never silently ignored',async()=>{
  for(const bad of [null,[],'FAKE'])assert.equal(validStored({...oldRow(),retiredCart:bad}),false);
  const h=harness({...oldRow(),retiredCart:null});await assert.rejects(h.run(pro,'VARIANT'),/StoredPurchaseTaskCorrupt/);assert.deepEqual(h.acts,[]);
});

// Actual control.js with a FAKE DOM, Chrome storage/session, lock and port. Status text is the user-facing Chinese guidance.
async function control(){
  const h=harness(),nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,disabled:false,textContent:'',href:''});return nodes.get(id);};
  node('product').value='pro';node('tab').value='7';node('approve').checked=true;
  const chrome={storage:{local:{get:async k=>({[k]:await h.store.get(k)}),set:async v=>{for(const [k,s] of Object.entries(v))await h.store.put(k,s);}},session:{get:async()=>({})}}};
  class FakePort{constructor(api,tabId,opts){this.opts=opts;}async observe(){return {...h.read(),termsLinks:['https://www.apple.com.cn/shop/open/salespolicies']};}async act(c){if(this.opts.mode==='observe'||this.opts.authorized!==true)throw Error('FAKE read-only port');return h.port.act(c);}}
  const context=vm.createContext({document:{getElementById:node},chrome,navigator:{locks:{request:async(name,opts,fn)=>fn({})}},crypto:webcrypto,TextEncoder,Date,URL,structuredClone,PurchaseJob,ChromePort:FakePort,allowedMerchantUrl:()=>true,withPurchaseOwner,TASK_KEY,VALIDATION_KEY,NO_EXTRAS,retirable});
  const code=readFileSync(new URL('../web/checkout-connector/control.js',import.meta.url),'utf8').replace(/^import .*;\r?$/gm,'');await vm.runInContext('(async()=>{'+code+'\n})()',context);
  h.nodes=nodes;h.click=id=>nodes.get(id).onclick();h.status=()=>nodes.get('state').textContent;return h;
}
test('C034 control: ending the rehearsal says the item stays in the bag; preflight and the stop explain no addition and the bag-page next step',async()=>{
  const h=await control();await h.click('retire');
  assert.equal(h.row.state,'RETIRED');assert.match(h.status(),/全部记录保留/);assert.match(h.status(),/那一件商品仍留在官网购物袋中，程序不会当作已清空/);assert.deepEqual(h.acts,[]);
  h.phase='VARIANT';await h.click('prepare');assert.match(h.status(),/只读预检完成/);assert.match(h.status(),/本任务不会再加入购物袋，需在购物袋页核对后结账/);
  h.nodes.get('approve').checked=true;await h.click('resume');
  assert.deepEqual(h.acts,[]);assert.equal(h.row.reason,HOLDS);assert.match(h.status(),/不会把它当作已清空，也不会再加入购物袋/);assert.match(h.status(),/打开官网购物袋页后点“恢复本任务”/);
  h.phase='BAG';h.cart.push({...pro.product});await h.click('resume');
  assert.deepEqual(h.acts,[]);assert.equal(h.row.reason,NOT_THIS);assert.match(h.status(),/程序不会移除、结账或再加入任何商品，改选型号也不授权处理旧商品/);assert.match(h.status(),/无法确认购物袋已清空/);
});
