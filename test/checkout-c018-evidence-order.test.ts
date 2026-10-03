// C-018 implementation tests (Claude): member-order-independent evidence and persisted-plan comparison.
// SYNTHETIC only: fake DOM pages run the real serialized page program in a VM; fake transports and stores deliberately
// REVERSE object members (a different permutation from the protected reviewer's sorted order). This is not Chrome's native
// serialization order, a native API result or Apple evidence. No browser, network, credentials or merchant action is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createHash,webcrypto} from 'node:crypto';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
import {ChromePort} from '../web/checkout-connector/chrome-port.js';
import {PurchaseJob,TASK_KEY,VALIDATION_KEY,canonicalJson,normalizeIntent,validStored} from '../web/checkout-connector/job.js';

const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{tradeIn:'none',appleCare:'none'}};
const P=normalizeIntent(plan);
const noTrade='不折抵换购',noCare='不加 AppleCare+ 服务计划';
const checkoutUrl='https://secure11.www.apple.com.cn/shop/checkout';
const pickupLines=['iPhone 18 Pro 256GB 黑色','数量：1','总计：RMB 9,999','取货地点：Apple 大连恒隆广场','店内取货'];
let serial=0;
// Recursively reversed member order; array order is never changed.
function reversed(v){if(Array.isArray(v))return v.map(reversed);if(v!==null&&typeof v==='object')return Object.fromEntries(Object.keys(v).reverse().map(k=>[k,reversed(v[k])]));return v;}

class El{
  constructor(text='',tag='DIV',extra={}){Object.assign(this,{textContent:text,tagName:tag,attrs:{},isConnected:true,parentElement:null,hidden:false,disabled:false,checked:false,labels:[],options:[],selectedIndex:0,clicks:0},extra);}
  getAttribute(k){return this.attrs[k]??null;} hasAttribute(k){return Object.hasOwn(this.attrs,k);} closest(){return null;}
  get selectedOptions(){return this.options.filter((o,i)=>i===this.selectedIndex);}
  dispatchEvent(){return true;} checkValidity(){return true;}
  click(){assert.equal(this.disabled,false,'a disabled fake control cannot be forced');this.clicks++;if(this.tagName==='INPUT')this.checked=true;this.onClick?.();}
}
// The serialized program runs in a fresh VM realm with no module scope; results cross a structured-clone boundary.
function mount(page){
  const main=new El();
  main.querySelector=s=>s==='h1'?page.title:null;
  main.querySelectorAll=s=>s.startsWith('button')?page.buttons:s.startsWith('input[type="radio"]')?page.radios:s==='select'?page.selects:s==='h1,h2,h3,p,span,div'?[page.title,...page.lines]:[];
  const context=vm.createContext({document:{querySelector:()=>main,querySelectorAll:()=>[]},location:{get href(){return page.url;}},URL,TextEncoder,crypto:webcrypto,Date,setTimeout,HTMLInputElement:El,Event:class{constructor(t){this.type=t;}},getComputedStyle:()=>({display:'block',visibility:'visible'})});
  const fn=vm.runInContext('('+merchantDocument.toString()+')',context);
  page.fn=async(...args)=>structuredClone(await fn(...args));return page;
}
function publicPage(){
  const model=new El('iPhone 18 Pro 6.3 英寸显示屏 RMB 9,999','INPUT',{checked:true}),color=new El('黑色','INPUT',{checked:true}),capacity=new El('256GB RMB 9,999','INPUT',{checked:true});
  const trade=new El(noTrade,'INPUT'),care=new El(noCare,'INPUT',{disabled:true}),bag=new El('添加到购物袋','BUTTON',{disabled:true});
  trade.onClick=()=>{care.disabled=false;};care.onClick=()=>{bag.disabled=!(trade.checked&&care.checked);};
  return mount({url:'https://www.apple.com.cn/shop/buy-iphone/iphone-18-pro',title:new El('购买 iPhone 18 Pro','H1'),lines:[],buttons:[bag],radios:[model,color,capacity,trade,care],selects:[],trade,care,bag});
}
const clicks=p=>p.trade.clicks+p.care.clicks+p.bag.clicks;
const command=(expected,extra={})=>({id:'FAKE-c018-impl-cmd-'+(++serial),taskId:'FAKE-task',planDigest:'FAKE-digest',documentId:'FAKE-doc',action:'configureProduct',choice:noTrade,plan:P,authorized:true,structured:true,expected,...extra});
const changed={delivered:false,touched:false,reason:'OperationEvidenceChanged'};

test('C018 impl: canonicalJson ignores object-member order only',()=>{
  const a={x:1,n:{p:null,q:[{b:true,a:'1'},2]},s:'v'};
  assert.equal(canonicalJson(reversed(a)),canonicalJson(a));
  const samples=[{...a,x:'1'},{...a,x:2},{...a,n:{...a.n,p:0}},{...a,n:{...a.n,q:[2,{b:true,a:'1'}]}},{...a,n:{...a.n,q:[{b:1,a:'1'},2]}},(({s,...r})=>r)(a),{...a,extra:false},{...a,n:{...a.n,q:[{b:true,a:'1'},2,null]}}];
  for(const c of samples){
    assert.notEqual(canonicalJson(c),canonicalJson(a),JSON.stringify(c));
    assert.notEqual(canonicalJson(reversed(c)),canonicalJson(a),'a reordered changed value is still changed');
  }
});

test('C018 impl: the serialized page accepts transported evidence exactly when only member order differs',async()=>{
  const variants=[
    ['same order',x=>x,true],
    ['all members reversed',reversed,true],
    ['only the nested purchase reversed',x=>({...x,purchase:reversed(x.purchase)}),true],
    ['nested total changed',x=>({...x,purchase:{...x.purchase,totalCny:1}}),false],
    ['next-choice state changed',x=>({...x,nextChoice:{...x.nextChoice,state:'disabled'}}),false],
    ['array order changed',x=>({...x,needsSelection:[...x.needsSelection].reverse()}),false],
    ['boolean became a string',x=>({...x,variantVerified:'false'}),false],
    ['member removed',x=>{const {termsLinks,...r}=x;return r;},false],
    ['reversed and one nested value changed',x=>reversed({...x,configuration:{...x.configuration,complete:true}}),false]
  ];
  for(const [label,mutate,ok] of variants){
    const page=publicPage(),seen=await page.fn(P),expected=mutate(structuredClone(seen));
    assert.equal(canonicalJson(expected)===canonicalJson(seen),ok,label+': fixture expectation');
    const reply=await page.fn(P,command(JSON.stringify(expected)));
    if(ok){assert.deepEqual(reply,{delivered:true},label);assert.equal(page.trade.clicks,1,label);assert.equal(page.bag.clicks,0,label);}
    else{assert.deepEqual(reply,changed,label);assert.equal(clicks(page),0,label);}
  }
});

test('C018 impl: malformed or non-string expected evidence is positively untouched and does not consume the command id',async()=>{
  const page=publicPage(),seen=await page.fn(P),id='FAKE-c018-impl-malformed';
  for(const expected of ['not json','{"phase":',undefined,42,JSON.stringify(null),JSON.stringify([seen])]){
    assert.deepEqual(await page.fn(P,command(expected,{id})),changed,String(expected).slice(0,20));
  }
  assert.equal(clicks(page),0);
  // Nothing was delivered under this id, so the same id with current evidence is still deliverable exactly once.
  assert.deepEqual(await page.fn(P,command(JSON.stringify(reversed(seen)),{id})),{delivered:true});assert.equal(page.trade.clicks,1);
});

test('C018 impl: delivery memo still wins over reordered evidence; the same id is never clicked twice',async()=>{
  const page=publicPage(),seen=await page.fn(P),cmd=command(JSON.stringify(reversed(seen)));
  assert.deepEqual(await page.fn(P,cmd),{delivered:true});
  const now=await page.fn(P);
  assert.deepEqual(await page.fn(P,{...cmd,expected:JSON.stringify(reversed(now))}),{delivered:false,touched:true,reason:'OperationAlreadyDelivered'});
  assert.equal(page.trade.clicks,1);assert.equal(page.care.clicks,0);
});

test('C018 impl: order-reference hash re-entry still compares the final decode member-order-independently',async()=>{
  const ref='W0FAKE18',page=mount({url:checkoutUrl,title:new El('谢谢','H1'),lines:[...pickupLines,'待付款','订单号：'+ref].map(t=>new El(t)),buttons:[],radios:[],selects:[]});
  const seen=await page.fn(P);
  assert.equal(seen.phase,'ORDER_RECEIPT');assert.equal(seen.orderRefHash,createHash('sha256').update(ref).digest('hex'),'the hash was produced by the re-entered decode');
  // Evidence equal: the comparison passes after re-entry and the stage itself refuses the action without touching anything.
  assert.deepEqual(await page.fn(P,command(JSON.stringify(reversed(seen)))),{delivered:false,touched:false,reason:'ActionNotRecognizedForCurrentStage'});
  assert.deepEqual(await page.fn(P,command(JSON.stringify(reversed({...seen,orderRefHash:'b'.repeat(64)})))),changed);
});

function slotPage(){
  const option=t=>new El(t,'OPTION');
  const time=new El('','SELECT',{options:[option('可选时段'),option('21:00 - 21:15'),option('21:15 - 21:30')]});time.attrs['aria-label']='取货时间';
  const next=new El('继续填写取货详情','BUTTON');
  return mount({url:checkoutUrl,title:new El('结账','H1'),lines:pickupLines.map(t=>new El(t)),buttons:[next],radios:[new El('10月23日','INPUT',{checked:true}),new El('10月24日','INPUT')],selects:[time],time,next});
}
test('C018 impl: slot choice with reordered evidence crosses its change-task re-entry and continues exactly once',async()=>{
  const page=slotPage(),seen=await page.fn(P);
  assert.equal(seen.phase,'SLOTS');assert.equal(seen.listComplete,true);assert.equal(seen.purchase.verified,true);
  const slot={action:'chooseSlot',date:'10月23日',start:'21:15',end:'21:30',ref:'time:2'};
  const stale=reversed({...seen,times:seen.times.map(t=>({...t,enabled:t.ref!=='time:2'}))});
  assert.deepEqual(await page.fn(P,command(JSON.stringify(stale),slot)),changed);assert.equal(page.time.selectedIndex,0);assert.equal(page.next.clicks,0);
  const cmd=command(JSON.stringify(reversed(seen)),slot);
  assert.deepEqual(await page.fn(P,cmd),{delivered:true});assert.equal(page.time.selectedIndex,2);assert.equal(page.next.clicks,1);
  assert.equal((await page.fn(P,cmd)).reason,'OperationAlreadyDelivered');assert.equal(page.next.clicks,1);
});

test('C018 impl: ChromePort list generation ignores member order but advances on every date/time change',async()=>{
  const base={schema:'applebuy-merchant-read/v1',phase:'SLOTS',selectedDate:'10月23日',dates:[{label:'10月23日',ref:'date:0',enabled:true,selected:true},{label:'10月24日',ref:'date:1',enabled:true,selected:false}],times:[{start:'21:15',end:'21:30',ref:'time:1',enabled:true}]};
  const queue=[];
  const api={tabs:{async get(){return {url:checkoutUrl};}},permissions:{async contains(){return true;}},scripting:{async executeScript({world,func,args}){assert.equal(world,'ISOLATED');assert.equal(func,merchantDocument);assert.equal(args.length,1,'observation only');return [{frameId:0,documentId:'FAKE-doc',result:queue.shift()}];}}};
  const port=new ChromePort(api,7,{mode:'observe'});
  const off={...structuredClone(base),times:[{...base.times[0],enabled:false}]};
  const flipped={...structuredClone(off),dates:[...off.dates].reverse()};
  const extra={...structuredClone(flipped),dates:flipped.dates.map((d,i)=>i?d:{...d,FAKE_extra:true})};
  const steps=[[base,1],[reversed(base),1],[off,2],[reversed(off),2],[flipped,3],[reversed(flipped),3],[extra,4],[{...structuredClone(extra),selectedDate:'10月24日'},5]];
  for(const [raw,generation] of steps){queue.push(structuredClone(raw));assert.equal((await port.observe(P)).generation,generation,JSON.stringify(raw).slice(0,60));}
});

function permutedStore(){const rows={},puts=[];return {rows,puts,async get(k){return reversed(structuredClone(rows[k]??null));},async put(k,v){puts.push(k);rows[k]=reversed(structuredClone(v));}};}
function jobs(s,{phase='AUTH',tabId=7,planValue=plan,digest='FAKE-c018-digest',failAct=false}={}){
  let seq=Math.max(0,...Object.values(s.rows).map(x=>x?.lastRead??0));
  const h={observes:0,acts:0};
  const port={async observe(){h.observes++;return {schema:'applebuy-merchant-read/v1',documentId:'FAKE-doc',seq:++seq,phase,verifiedStep:phase!=='AUTH',variantVerified:phase==='VARIANT',quotedCny:9999,nextChoice:null};},async act(){h.acts++;if(failAct)throw Error('FAKE lost reply');return {delivered:true};},async lookupOrder(){return {state:'unknown',independent:false};}};
  h.job=new PurchaseJob({store:s,port,id:()=>'FAKE-c018-impl-id-'+(++serial),maxPolls:0});
  h.run=()=>h.job.run(planValue,{tabId,planDigest:digest});return h;
}

test('C018 impl: a reordered legacy record without extras keeps its exact digest binding; a different digest stays blocked',async()=>{
  const s=permutedStore();await jobs(s).run();
  const row=structuredClone(s.rows[TASK_KEY]);delete row.plan.extras;s.rows[TASK_KEY]=reversed(row);assert.equal(validStored(s.rows[TASK_KEY]),true);
  const taskId=row.taskId,other=jobs(s,{digest:'FAKE-c018-other-digest'}),blocked=await other.run();
  assert.equal(blocked.state,'BLOCKED');assert.equal(blocked.reason,'existing-task-binding-differs');assert.equal(other.observes+other.acts,0);assert.equal(blocked.taskId,taskId);
  const same=jobs(s),r=await same.run();
  assert.equal(r.state,'NEEDS_USER');assert.equal(r.reason,'auth');assert.equal(same.observes,1);assert.equal(r.taskId,taskId);assert.equal(r.planDigest,'FAKE-c018-digest');
  assert.deepEqual(r.plan.extras,{tradeIn:'none',appleCare:'none'});
});

test('C018 impl: array content still binds; an extra duplicate store entry is a binding difference with unknown history intact',async()=>{
  const s=permutedStore(),initial=await jobs(s,{phase:'VARIANT',failAct:true}).run();
  assert.equal(initial.state,'NEEDS_VERIFICATION');assert.equal(initial.pending.action,'addBag');
  const again=jobs(s,{planValue:{...plan,stores:['Apple 大连恒隆广场','Apple 大连恒隆广场']}}),r=await again.run();
  assert.equal(r.state,'BLOCKED');assert.equal(r.reason,'existing-task-binding-differs');assert.equal(again.observes+again.acts,0);
  assert.deepEqual(r.pending,initial.pending);assert.equal(r.bagAddStarted,true);assert.equal(r.resourceWritten,true);assert.equal(r.taskId,initial.taskId);
});

test('C018 impl: reordered public validation keeps separate storage, leaves the purchase task intact and never resets untouched counts',async()=>{
  const s=permutedStore();await jobs(s,{phase:'VARIANT',failAct:true}).run();
  const task=structuredClone(s.rows[TASK_KEY]);s.puts.length=0;
  const page=publicPage(),drift={on:true};
  const api={tabs:{async get(){return {url:page.url};}},permissions:{async contains(){return true;}},scripting:{async executeScript({args}){
    if(args[1]&&drift.on)page.trade.disabled=true;
    return [{frameId:0,documentId:'FAKE-doc',result:reversed(await page.fn(...args))}];
  }}};
  const validate=async()=>{const prior=await s.get(VALIDATION_KEY);const port=new ChromePort(api,7,{authorized:true,mode:'public-config',initialSequence:prior?.lastRead??0});
    return new PurchaseJob({store:s,port,hydrationMs:0}).run(plan,{tabId:7,planDigest:'FAKE-c018-digest',mode:'public-config'});};
  const first=await validate();
  assert.equal(first.state,'NOT_READY');assert.equal(first.untouchedFailures,1);assert.equal(first.history[0].reason,'OperationEvidenceChanged');assert.equal(clicks(page),0);
  const second=await validate();assert.equal(second.state,'NOT_READY');assert.equal(second.untouchedFailures,1,'a restart does not reset the count');assert.equal(clicks(page),0);
  page.trade.disabled=false;drift.on=false;
  const third=await validate();
  assert.equal(third.state,'VALIDATED');assert.equal(third.untouchedFailures,1);assert.equal(third.untouchedStreak,0);
  assert.equal(page.trade.clicks,1);assert.equal(page.care.clicks,1);assert.equal(page.bag.clicks,0);
  assert.ok(s.puts.length>0&&s.puts.every(k=>k===VALIDATION_KEY));assert.deepEqual(s.rows[TASK_KEY],task,'the purchase task row is not rewritten');
});
