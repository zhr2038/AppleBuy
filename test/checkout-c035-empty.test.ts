// C035 implementation tests (Claude). Every merchant page, cart line, Chrome API, clock, storage record and authority here is FAKE.
// No browser, Apple page, credential, real cart, slot or order. They exercise the actual PurchaseJob, ChromePort and control.js
// logic. The FAKE world reports the empty bag as the page program's EMPTY_BAG phase; the parser itself is covered only by the
// native reproduction (review/browser-c035-empty-repro.mjs) over the sanitized observed block, not by these tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto,createHash} from 'node:crypto';
import {PurchaseJob,TASK_KEY,VALIDATION_KEY,NO_EXTRAS,retirable,validStored} from '../web/checkout-connector/job.js';
import {ChromePort} from '../web/checkout-connector/chrome-port.js';
import {withPurchaseOwner} from '../web/checkout-connector/owner.js';

const pro={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{...NO_EXTRAS}};
const duo={...pro,product:{model:'iPhone Duo',capacity:'256GB',color:'星光白色'},maxTotalCny:15999};
const digest=p=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
const price=product=>product.model==='iPhone Duo'?15999:9999;
const CHOICES={'iPhone Duo':['星光白色','256GB','不折抵换购','不加 AppleCare+ 服务计划'],'iPhone 18 Pro':['黑色','256GB','不折抵换购','不加 AppleCare+ 服务计划']};
const PATH={'iPhone Duo':'/shop/buy-iphone/iphone-duo','iPhone 18 Pro':'/shop/buy-iphone/iphone-18-pro'};
const HOLDS='retired-cart-holds-earlier-item; no second addition; open the bag page for a fresh read';
const NOT_THIS='retired-cart-bag-not-exactly-this-plan; nothing removed, bought or added';
const DUO_CHAIN=['openProduct',...CHOICES['iPhone Duo'].map(()=>'configureProduct'),'continueProduct','addBag','viewBag','checkout'];
const EMPTY_PURCHASE={itemVerified:false,verified:false,model:null,capacity:null,color:null,quantity:null,totalCny:null,store:null,fulfillment:null};
// The resolved permanently read-only Pro rehearsal (C030/C034 shape): one executor-added item, verified in the bag.
const oldRow=()=>({schema:'applebuy-purchase-job/v1',taskId:'FAKE-c035-old',plan:structuredClone(pro),planDigest:digest(pro),tabId:7,state:'NEEDS_USER',lastPhase:'BAG',lastDocumentId:'FAKE-old-bag-doc',entryDocumentId:'FAKE-old-entry',reason:'read-only-reconciliation-complete; a rebound tab cannot add purchase authority',pending:null,finalIntent:null,orderRefHash:null,initialDates:null,dateCursor:0,floors:{},rejected:[],refusals:0,lastRead:10,expiresAt:900,bagAddStarted:true,resourceWritten:true,untouchedFailures:0,untouchedStreak:0,quotedCny:9999,bagTotalCny:9999,reconcileOnly:true,mode:'purchase',revokedGrantIds:['FAKE-old-authority'],history:[{event:'human-tab-rebind',fromTabId:6,toTabId:7,at:500}]});

// FAKE tab: bag (empty or populated), the plan's product page, accessories, processing and an authentication stop.
function world(initial=oldRow()){
  const w={row:structuredClone(initial),acts:[],states:[],cart:[{...pro.product}],at:'bag',plan:pro,selected:[],continued:false,prelaunch:false,seq:10,doc:0,ids:0,clock:1000,hooks:{},extras:false,total:null};
  w.navigate=at=>{w.at=at;w.doc++;if(at==='product'){w.selected=[];w.continued=false;}};
  w.read=()=>{w.hooks.read?.(w);const base={schema:'applebuy-merchant-read/v1',documentId:'FAKE-c035-doc-'+w.doc,seq:++w.seq,verifiedStep:true};
    if(w.at==='bag'){
      if(!w.cart.length)return {...base,phase:'EMPTY_BAG',path:'/shop/bag',purchase:{...EMPTY_PURCHASE},extras:null};
      const one=w.cart.length===1;
      return {...base,phase:'BAG',path:'/shop/bag',extras:w.extras,purchase:{...(one?w.cart[0]:{model:null,capacity:null,color:null}),itemVerified:one,verified:false,quantity:one?1:null,totalCny:one?(w.total??price(w.cart[0])):null,store:null,fulfillment:null}};
    }
    if(w.at==='product'){
      const c=CHOICES[w.plan.product.model].find(x=>!w.selected.includes(x)),next=c?{choice:c,state:'enabled'}:null,path=PATH[w.plan.product.model];
      if(w.prelaunch)return {...base,phase:'PRELAUNCH',path,prelaunchConfigurable:true,nextChoice:next,selectedProductChoices:[...w.selected],continueAvailable:false,extrasConflict:false};
      const variant=w.continued&&!next;
      return {...base,phase:variant?'VARIANT':'ENTRY',path:variant?path+'/fake01/a':path,nextChoice:next,selectedProductChoices:[...w.selected],continueAvailable:true,variantVerified:variant,quotedCny:variant?w.plan.maxTotalCny:null,extrasConflict:false};
    }
    if(w.at==='accessories')return {...base,phase:'ACCESSORIES',path:'FAKE-accessories'};
    if(w.at==='processing')return {...base,phase:'PROCESSING',path:'/shop/bag',verifiedStep:false};
    return {...base,phase:'AUTH',path:'/shop/checkout',verifiedStep:false};
  };
  w.act=async c=>{w.acts.push(c.action);w.hooks.act?.(w,c);const reply=w.hooks.reply?.(w,c);if(reply)return reply;
    if(c.action==='openProduct')w.navigate('product');
    else if(c.action==='configureProduct')w.selected.push(c.choice);
    else if(c.action==='continueProduct'){w.continued=true;w.doc++;}
    else if(c.action==='addBag'){w.cart.push({...w.plan.product});w.navigate('accessories');}
    else if(c.action==='viewBag'||c.action==='openBag')w.navigate('bag');
    else if(c.action==='checkout')w.navigate('auth');
    return {delivered:true};};
  // C035-R1 Codex quota completion: the chosen transport reads the CURRENT cart in a distinct read-only document at Add.
  // Every clock/API/cart value is still FAKE. This supports the new contract without changing any protected prior tests.
  w.bagReads=0;
  w.port={observe:async()=>w.read(),wait:async()=>{w.clock+=50;},readBag:async()=>{w.bagReads++;w.hooks.bagRead?.(w);const one=w.cart.length===1;return {schema:'applebuy-merchant-read/v1',phase:w.cart.length?'BAG':'EMPTY_BAG',verifiedStep:true,path:'/shop/bag',documentId:'FAKE-c035-side-bag-'+w.bagReads,seq:++w.seq,extras:w.extras,purchase:one?{...w.cart[0],quantity:1,itemVerified:true,totalCny:w.total??price(w.cart[0])}:null};},act:c=>w.act(c)};
  w.store={get:async k=>{assert.equal(k,TASK_KEY);return structuredClone(w.row);},put:async(k,v)=>{assert.equal(k,TASK_KEY);w.row=structuredClone(v);}};
  w.job=(o={})=>new PurchaseJob({store:w.store,port:w.port,now:()=>w.clock,id:()=>'FAKE-c035-id-'+(++w.ids),maxSteps:60,onState:s=>w.states.push(structuredClone(s)),...o});
  w.retire=()=>{w.plan=pro;return w.job().retireReadOnlyBag(pro,{tabId:7,planDigest:digest(pro)});};
  w.run=(p,opts={},jobOpts={})=>{w.plan=p;w.current=w.job(jobOpts);return w.current.run(p,{tabId:7,planDigest:digest(p),...opts});};
  return w;
}
// The person empties the bag after the read-only rehearsal ended; the browser is on the official bag page.
async function emptied(){const w=world();w.retired=await w.retire();w.cart=[];w.at='bag';w.doc++;return w;}
const count=(w,a)=>w.acts.filter(x=>x===a).length;

test('C035 a fresh verified empty bag lets the Duo successor open the product page, prepare it, add exactly one and check out the one-item bag once',async()=>{
  const w=await emptied(),r=await w.run(duo);
  assert.deepEqual(w.acts,DUO_CHAIN);assert.deepEqual(w.cart,[{...duo.product}]);assert.equal(r.state,'NEEDS_USER');assert.equal(r.reason,'auth');
  assert.equal(r.retiredCart.fromTaskId,'FAKE-c035-old');assert.deepEqual(r.retiredHistory,[w.retired]);assert.notEqual(r.taskId,'FAKE-c035-old');
  assert.equal(r.bagAddStarted,true);assert.equal(r.resourceWritten,true);assert.equal(r.quotedCny,15999);assert.equal(r.bagTotalCny,15999);
  assert.deepEqual(r.history.map(e=>e.event).filter(e=>/empty/.test(e)),['verified-empty-bag']);assert.equal(w.bagReads,1);assert.equal(r.history.some(e=>e.event==='add-boundary-bag-read'&&e.phase==='EMPTY_BAG'),true);
  assert.equal(JSON.stringify(w.row).includes('emptyProof'),false);assert.equal(validStored(w.row),true);
  assert.equal(w.states.some(s=>s.pendingAction==='openProduct'),true);
});
test('C035 the same-plan Pro successor also completes from a verified empty bag with one addition',async()=>{
  const w=await emptied(),r=await w.run(pro);
  assert.deepEqual(w.acts,['openProduct',...CHOICES['iPhone 18 Pro'].map(()=>'configureProduct'),'continueProduct','addBag','viewBag','checkout']);
  assert.deepEqual(w.cart,[{...pro.product}]);assert.equal(r.reason,'auth');
});
test('C035 navigation alone writes no merchant resource; a task that only opened the product page stays untouched',async()=>{
  const w=await emptied();w.hooks.act=(w,c)=>{if(c.action==='configureProduct')w.current.stop();};
  const r=await w.run(duo);
  assert.equal(r.state,'STOPPED');assert.deepEqual(w.acts,['openProduct','configureProduct']);assert.equal(r.resourceWritten,false);assert.equal(r.bagAddStarted,false);
});
test('C035 pause/restart resumes through a NEW current bag read, without a stored empty clearance or manual addition',async()=>{
  const w=await emptied();w.hooks.act=(w,c)=>{if(c.action==='configureProduct'&&w.selected.length===1)w.current.pause();};
  const paused=await w.run(duo);assert.equal(paused.state,'PAUSED');assert.equal(count(w,'addBag'),0);w.hooks.act=null;
  const resumed=await w.run(duo);assert.equal(resumed.reason,'auth');assert.equal(count(w,'addBag'),1);assert.equal(w.bagReads,1);assert.deepEqual(w.cart,[{...duo.product}]);assert.equal(resumed.taskId,paused.taskId);assert.equal(JSON.stringify(w.row).includes('emptyProof'),false);
});

test('C035 long preparation uses a NEW boundary read instead of reusing old empty evidence',async()=>{
  const w=await emptied();w.hooks.act=(w,c)=>{if(c.action==='continueProduct')w.clock+=60001;};
  const r=await w.run(duo);assert.equal(r.reason,'auth');assert.equal(count(w,'addBag'),1);assert.equal(w.bagReads,1);assert.deepEqual(w.cart,[{...duo.product}]);
});
test('C035 an intervening processing read still requires a NEW boundary cart read before Add',async()=>{
  const w=await emptied();let once=false;
  w.hooks.reply=(w,c)=>{if(c.action==='configureProduct'&&!once){once=true;w.at='processing';return {delivered:false,touched:false,reason:'FAKE'};}};
  w.hooks.read=w=>{if(w.at==='processing'&&w.flipped)w.at='product';else if(w.at==='processing')w.flipped=true;};
  const r=await w.run(duo);assert.equal(r.reason,'auth');assert.equal(count(w,'addBag'),1);assert.equal(w.bagReads,1);
});
test('C035 another item appearing in the bag before the bag read is never treated as empty; a Duo plan stops, an exact one-item bag checks out',async()=>{
  const w=world();await w.retire();
  const r=await w.run(duo);assert.equal(r.state,'BLOCKED');assert.equal(r.reason,NOT_THIS);assert.deepEqual(w.acts,[]);assert.deepEqual(w.cart,[{...pro.product}]);
  w.cart=[{...duo.product}];const ok=await w.run(duo);assert.deepEqual(w.acts,['checkout']);assert.equal(ok.reason,'auth');
});
test('C035 an earlier Pro appears during preparation: boundary read rejects before ANY addition, not after two lines',async()=>{
  const w=await emptied();w.hooks.act=(w,c)=>{if(c.action==='continueProduct')w.cart.push({...pro.product});};
  const r=await w.run(duo);assert.equal(r.state,'BLOCKED');assert.equal(r.reason,'current-bag-holds-other-items; nothing added, removed or bought');assert.equal(count(w,'addBag'),0);assert.equal(count(w,'checkout'),0);assert.deepEqual(w.cart,[{...pro.product}]);assert.equal(w.bagReads,1);
  const again=await w.run(duo);assert.equal(again.state,'BLOCKED');assert.equal(count(w,'addBag'),0);assert.equal(count(w,'checkout'),0);assert.equal(w.cart.length,1);
});

test('C035 wrong model, extras, over-cap total or two lines in the BAG continuation stop without checkout',async()=>{
  const UNCONFIRMED=['NEEDS_VERIFICATION','mutation-result-unconfirmed; no automatic repeat'];
  for(const [change,[state,reason]] of [[w=>{w.cart=[{...pro.product}];},UNCONFIRMED],[w=>{w.extras=true;},['BLOCKED',NOT_THIS]],[w=>{w.total=16000;},UNCONFIRMED],[w=>{w.cart.push({...duo.product});},UNCONFIRMED]]){
    const w=await emptied();w.hooks.act=(x,c)=>{if(c.action==='viewBag')change(x);};
    const r=await w.run(duo);assert.equal(r.state,state);assert.equal(r.reason,reason);assert.equal(count(w,'checkout'),0);assert.equal(count(w,'addBag'),1);
  }
});
test('C035 stale sequence after the empty read stops; the navigation record reconciles later without a stored proof',async()=>{
  const w=await emptied();w.hooks.read=w=>{if(w.at==='product'&&!w.staled){w.staled=true;w.seq=w.row.lastRead-1;}};
  const r=await w.run(duo);assert.equal(r.reason,'invalid-or-stale-observation');assert.equal(r.pending.action,'openProduct');assert.equal(validStored(w.row),true);
  w.hooks.read=null;const later=await w.run(duo);assert.equal(later.pending.action,'checkout');assert.equal(later.reason,'auth');assert.equal(count(w,'addBag'),1);assert.equal(w.bagReads,1);
});
test('C035 product page not reached: lost transport keeps the navigation record; the next run drops it with a note, then a fresh empty read completes',async()=>{
  const w=await emptied();let fail=true;
  w.hooks.reply=(w,c)=>{if(c.action==='openProduct'&&fail){fail=false;throw new Error('FAKE transport lost');}};
  const lost=await w.run(duo);assert.equal(lost.reason,'mutation-transport-lost; reconcile before proceeding');assert.equal(lost.pending.action,'openProduct');assert.equal(lost.resourceWritten,false);
  w.clock+=60000;const dropped=await w.run(duo);
  assert.equal(dropped.reason,'product-page-not-reached; navigation only, nothing added');assert.equal(dropped.pending,null);assert.equal(dropped.history.at(-1).event,'product-page-not-reached');assert.equal(retirable(w.row),true);
  const r=await w.run(duo);assert.equal(r.reason,'auth');assert.equal(count(w,'addBag'),1);assert.deepEqual(w.cart,[{...duo.product}]);
});
test('C035 a positively untouched Add retry performs ANOTHER current cart read before the one delivered addition',async()=>{
  const w=await emptied();let first=true;
  w.hooks.reply=(w,c)=>{if(c.action==='addBag'&&first){first=false;return {delivered:false,touched:false,reason:'FAKE'};}};
  const r=await w.run(duo);assert.equal(count(w,'addBag'),2,JSON.stringify({reason:r.reason,acts:w.acts,bagReads:w.bagReads}));assert.deepEqual(w.cart,[{...duo.product}]);assert.equal(r.reason,'auth');
  assert.equal(w.bagReads,2);assert.equal(r.history.filter(e=>e.event==='add-boundary-bag-read').length,2);
});
test('C035 PRELAUNCH: public preparation then NOT_RELEASED keeps no proof; after release a fresh bag read is needed and then adds once',async()=>{
  const w=await emptied();w.prelaunch=true;
  const waiting=await w.run(duo);
  assert.equal(waiting.state,'NOT_RELEASED');assert.deepEqual(w.acts,['openProduct',...CHOICES['iPhone Duo'].map(()=>'configureProduct')]);assert.equal(waiting.resourceWritten,false);
  w.prelaunch=false;const released=await w.run(duo);assert.equal(released.reason,'auth');assert.equal(count(w,'addBag'),1);assert.equal(w.bagReads,1);assert.deepEqual(w.cart,[{...duo.product}]);
});
test('C035 unknown Add/Checkout/final records and a started addition are never cleared or repeated by an empty bag',async()=>{
  const cases=[
    [{pending:{action:'addBag',id:'FAKE-add',documentId:'FAKE-doc',beforePhase:'VARIANT',deadline:0},bagAddStarted:true,resourceWritten:true},'mutation-result-unconfirmed; no automatic repeat'],
    [{pending:{action:'checkout',id:'FAKE-co',documentId:'FAKE-doc',beforePhase:'BAG',deadline:0},bagAddStarted:true,resourceWritten:true},'mutation-result-unconfirmed; no automatic repeat'],
    [{bagAddStarted:true,resourceWritten:true},'bag-addition-already-started; an empty bag does not authorize a second addition'],
    [{finalIntent:{id:'FAKE-final',grantId:'FAKE-g',sent:true},pending:{action:'submitOrder',id:'FAKE-sub',documentId:'FAKE-doc',beforePhase:'REVIEW',deadline:0},bagAddStarted:true,resourceWritten:true,state:'NEEDS_VERIFICATION'},'final-result-unconfirmed; no resubmission']];
  for(const [patch,reason] of cases){
    // A successor created on the populated bag (BLOCKED, nothing sent), then given the FAKE unknown/started record.
    const w=world();await w.retire();await w.run(duo);assert.deepEqual(w.acts,[]);
    const before={...w.row,...structuredClone(patch)};w.row=structuredClone(before);assert.equal(validStored(w.row),true);w.navigate('bag');w.cart=[];
    w.port.lookupOrder=async()=>({state:'unknown',independent:false});
    const r=await w.run(duo);assert.equal(r.reason,reason);assert.deepEqual(w.acts,[]);assert.deepEqual(r.pending,before.pending);assert.equal(r.bagAddStarted,true);assert.deepEqual(r.finalIntent,before.finalIntent);
  }
});
test('C035 read-only, rebound, reconcile, validation and observe runs never navigate or add from an empty bag',async()=>{
  const ro=world();ro.cart=[];ro.doc++;let r=await ro.run(pro);assert.equal(r.reason,'read-only-reconciliation-complete; a rebound tab cannot add purchase authority');assert.deepEqual(ro.acts,[]);
  r=await ro.run(pro,{mode:'reconcile'});assert.deepEqual(ro.acts,[]);assert.equal(r.reconcileOnly,true);
  const w=await emptied();w.at='product';const reader=w.port.readBag;delete w.port.readBag;await w.run(duo);w.port.readBag=reader;w.navigate('bag');w.cart=[];w.acts=[];
  r=await w.run(duo,{tabId:8,rebind:true});assert.equal(r.reconcileOnly,true);assert.deepEqual(w.acts,[]);
  r=await w.run(duo,{tabId:8});assert.equal(r.reason,'read-only-reconciliation-complete; a rebound tab cannot add purchase authority');assert.deepEqual(w.acts,[]);
  const rows=new Map(),store={get:async k=>rows.get(k)??null,put:async(k,v)=>{rows.set(k,structuredClone(v));}},v=world();v.cart=[];v.doc++;
  const validated=await new PurchaseJob({store,port:v.port,now:()=>1000,id:()=>'FAKE-v'}).run(duo,{tabId:7,planDigest:digest(duo),mode:'public-config'});
  assert.equal(validated.state,'VALIDATION_STOPPED');assert.deepEqual(v.acts,[]);assert.equal(rows.has(TASK_KEY),false);assert.equal(rows.has(VALIDATION_KEY),true);
  const seen=await new PurchaseJob({store,port:v.port}).run(duo,{tabId:7,planDigest:'observe-only',mode:'observe'});assert.equal(seen.phase,'EMPTY_BAG');assert.deepEqual(v.acts,[]);
});
test('C035 a different stored tab or plan binding still blocks before any navigation',async()=>{
  const w=world();await w.retire();await w.run(duo);w.navigate('bag');w.cart=[];
  let r=await w.job().run(duo,{tabId:9,planDigest:digest(duo)});assert.equal(r.reason,'existing-task-binding-differs');assert.deepEqual(w.acts,[]);
  r=await w.run(pro);assert.equal(r.reason,'existing-task-binding-differs');assert.deepEqual(w.acts,[]);
});

// Actual ChromePort with FAKE Chrome APIs: the empty bag is re-verified in its exact document, then only ordinary tab navigation.
function fakeChrome(read){
  const calls={exec:[],update:[]};let url='https://www.apple.com.cn/shop/bag',reply={delivered:true};
  const api={tabs:{get:async()=>({url,status:'complete'}),update:async(id,u)=>{calls.update.push([id,u.url]);url=u.url;return {};}},permissions:{contains:async()=>true},
    scripting:{executeScript:async o=>{calls.exec.push(o);return [{frameId:0,documentId:'FAKE-port-doc',result:o.args.length===1?structuredClone(read):reply}];}}};
  return {api,calls,setReply:r=>{reply=r;}};
}
const emptyRead={schema:'applebuy-merchant-read/v1',phase:'EMPTY_BAG',verifiedStep:true,path:'/shop/bag',purchase:{...EMPTY_PURCHASE},dates:[],times:[],selectedDate:null};
test('C035 ChromePort: openProduct re-verifies the same empty document, then navigates the bound tab to the fixed public entry only',async()=>{
  for(const [plan,url] of [[duo,'https://www.apple.com.cn/shop/buy-iphone/iphone-duo'],[pro,'https://www.apple.com.cn/shop/buy-iphone/iphone-18-pro']]){
    const f=fakeChrome(emptyRead),port=new ChromePort(f.api,7,{authorized:true});port.wait=async()=>{};
    const o=await port.observe(plan);assert.equal(o.phase,'EMPTY_BAG');
    const r=await port.act({action:'openProduct',id:'FAKE-op',documentId:o.documentId,plan,taskId:'FAKE-t'});
    assert.deepEqual(r,{delivered:true});assert.deepEqual(f.calls.update,[[7,url]]);
    const sent=f.calls.exec[1];assert.deepEqual(sent.target,{tabId:7,documentIds:['FAKE-port-doc']});assert.equal(sent.args[1].action,'openProduct');assert.equal(sent.args[1].structured,true);
    assert.deepEqual(JSON.parse(sent.args[1].expected),emptyRead);
  }
});
test('C035 ChromePort: observe/public-config/unauthorized ports, a non-empty last read or a changed page never navigate',async()=>{
  const attempt=async(opts,read=emptyRead,reply)=>{const f=fakeChrome(read),port=new ChromePort(f.api,7,opts);port.wait=async()=>{};if(reply)f.setReply(reply);const o=await port.observe(duo);
    let r=null,e=null;try{r=await port.act({action:'openProduct',id:'FAKE-op',documentId:o.documentId,plan:duo,taskId:'FAKE-t'});}catch(x){e=x.message;}return {r,e,f};};
  for(const opts of [{mode:'observe',authorized:true},{authorized:false}]){const x=await attempt(opts);assert.equal(x.e,'CurrentOperationNotAuthorized');assert.deepEqual(x.f.calls.update,[]);}
  let x=await attempt({authorized:true,mode:'public-config'});assert.equal(x.e,'ValidationModeCannotMutate');assert.deepEqual(x.f.calls.update,[]);
  x=await attempt({authorized:true},{...emptyRead,phase:'VARIANT'});assert.equal(x.e,'CurrentOperationNotAuthorized');assert.equal(x.f.calls.exec.length,1);assert.deepEqual(x.f.calls.update,[]);
  x=await attempt({authorized:true},emptyRead,{delivered:false,touched:false,reason:'OperationEvidenceChanged'});assert.deepEqual(x.r,{delivered:false,touched:false,reason:'OperationEvidenceChanged'});assert.deepEqual(x.f.calls.update,[]);
});

// Actual control.js with a FAKE DOM, Chrome storage/session, lock and port. Status text is the user-facing Chinese guidance.
async function control(){
  const w=world(),nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,disabled:false,textContent:'',href:''});return nodes.get(id);};
  node('product').value='pro';node('tab').value='7';node('approve').checked=true;
  const chrome={storage:{local:{get:async k=>({[k]:await w.store.get(k)}),set:async v=>{for(const [k,s] of Object.entries(v))await w.store.put(k,s);}},session:{get:async()=>({})}}};
  class FakePort{constructor(api,tabId,opts){this.opts=opts;}async observe(p){w.plan=p;return {...w.read(),termsLinks:['https://www.apple.com.cn/shop/open/salespolicies']};}async wait(){}async readBag(){if(this.opts.authorized!==true||['observe','public-config'].includes(this.opts.mode))throw Error('FAKE read-only bag');return w.port.readBag();}async act(c){if(this.opts.mode==='observe'||this.opts.authorized!==true)throw Error('FAKE read-only port');return w.act(c);}}
  const context=vm.createContext({document:{getElementById:node},chrome,navigator:{locks:{request:async(name,opts,fn)=>fn({})}},crypto:webcrypto,TextEncoder,Date,URL,structuredClone,PurchaseJob,ChromePort:FakePort,allowedMerchantUrl:()=>true,withPurchaseOwner,TASK_KEY,VALIDATION_KEY,NO_EXTRAS,retirable});
  const code=readFileSync(new URL('../web/checkout-connector/control.js',import.meta.url),'utf8').replace(/^import .*;\r?$/gm,'');await vm.runInContext('(async()=>{'+code+'\n})()',context);
  w.nodes=nodes;w.click=id=>nodes.get(id).onclick();w.status=()=>nodes.get('state').textContent;return w;
}
test('C035 control: after the person empties the bag, one Resume on the bag page adds the Duo once without manual addition; the guidance names the empty-bag path',async()=>{
  const w=await control();await w.click('retire');assert.equal(w.row.state,'RETIRED');assert.match(w.status(),/读到官网空购物袋时，才自动打开商品页.*加入前再次确认购物袋仍为空/);
  w.nodes.get('product').value='duo';w.at='product';w.doc++;w.cart=[];await w.click('prepare');assert.match(w.status(),/唯一例外：加入购物袋前.*当场读取/);
  w.nodes.get('approve').checked=true;await w.click('resume');
  assert.deepEqual(w.acts,DUO_CHAIN.slice(1));assert.equal(w.bagReads,1);assert.deepEqual(w.cart,[{...duo.product}]);assert.equal(w.row.reason,'auth');assert.match(w.status(),/官网要求 Apple 账户登录／验证/);
});
