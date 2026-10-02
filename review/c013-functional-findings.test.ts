// Codex independent functional regressions. All DOM/API/merchant data are explicitly synthetic.
// UI tests capture the grant handed to the controller; they do not submit a real or mock merchant order.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
import {PurchaseJob,TASK_KEY,VALIDATION_KEY,NO_EXTRAS,retirable} from '../web/checkout-connector/job.js';
import {withPurchaseOwner} from '../web/checkout-connector/owner.js';
import {merchantDocument} from '../web/checkout-connector/page-program.js';

const plan={schema:'applebuy-intent/v1',product:{model:'iPhone Duo',capacity:'256GB',color:'星光白色'},quantity:1,maxTotalCny:15999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{...NO_EXTRAS}};
const purchase={itemVerified:true,verified:true,...plan.product,quantity:1,totalCny:15999,store:plan.stores[0],fulfillment:'pickup'};
const terms='https://www.apple.com.cn/shop/open/salespolicies';

async function control({approve=true,busy=false,locks=true}={}){
  const nodes=new Map(),calls=[];
  const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,disabled:false,href:'',textContent:''});return nodes.get(id);};
  node('product').value='duo';node('tab').value='7';node('approve').checked=approve;node('finalReview').checked=true;node('terms').href=terms;
  const row={schema:'applebuy-purchase-job/v1',taskId:'FAKE-task',planDigest:createHash('sha256').update(JSON.stringify(plan)).digest('hex'),lastPhase:'REVIEW',lastDocumentId:'FAKE-doc',finalIntent:null,resourceWritten:false,bagAddStarted:false,pending:null};
  const h={nodes,calls,busy,retireCalls:0};
  class JobFacade{
    constructor(){this.port={last:null};}
    async run(p,options){calls.push({plan:structuredClone(p),options:structuredClone(options)});return {state:'NEEDS_USER',lastPhase:'REVIEW',finalIntent:null};}
    async retire(){h.retireCalls++;}
    pause(){} stop(){}
  }
  class PortFacade{constructor(){} }
  const lockApi={async request(name,options,fn){return fn(h.busy?null:{});}};
  const chrome={storage:{local:{async get(){return {[TASK_KEY]:structuredClone(row)};},async set(){}},session:{async get(){return {};},async set(){}}}};
  const context=vm.createContext({document:{getElementById:node},chrome,navigator:{locks:locks?lockApi:null},crypto:webcrypto,TextEncoder,Date,URL,structuredClone,PurchaseJob:JobFacade,ChromePort:PortFacade,allowedMerchantUrl:()=>true,withPurchaseOwner,TASK_KEY,VALIDATION_KEY,NO_EXTRAS,retirable});
  const source=readFileSync(new URL('../web/checkout-connector/control.js',import.meta.url),'utf8').replace(/^import .*;\r?$/gm,'');
  await vm.runInContext('(async()=>{'+source+'\n})()',context);return h;
}

test('C013 P3-1: final click rejected by unchecked advance approval cannot arm a later resume',async()=>{
  const h=await control({approve:false});await h.nodes.get('final').onclick();assert.equal(h.calls.length,0);
  h.nodes.get('approve').checked=true;await h.nodes.get('resume').onclick();
  assert.equal(h.calls.length,1);assert.equal(h.calls[0].options.grant,null,'a denied final click must not supply a grant to Resume');
});
test('C013 P3-1: final click rejected by another owner cannot arm a later resume',async()=>{
  const h=await control({busy:true});await h.nodes.get('final').onclick();assert.equal(h.calls.length,0);
  h.busy=false;await h.nodes.get('resume').onclick();assert.equal(h.calls[0].options.grant,null,'the failed ownership attempt must clear final authorization');
});
test('C013 positive control: a fresh explicit final confirmation with approval and ownership passes one grant',async()=>{
  const h=await control();await h.nodes.get('final').onclick();assert.equal(h.calls.length,1);assert.equal(h.calls[0].options.grant.taskId,'FAKE-task');
  await h.nodes.get('resume').onclick();assert.equal(h.calls[1].options.grant,null,'the completed handler must not retain the prior grant');
});
test('C013 P3-2: absent Web Locks during retirement returns a visible gate without an unhandled rejection',async()=>{
  const h=await control({locks:false});await assert.doesNotReject(h.nodes.get('retire').onclick());assert.equal(h.retireCalls,0);assert.match(h.nodes.get('state').textContent,/互斥/);
});

test('C013 P3-3: duplicate delivered command on same-document AUTH cannot be reported positively untouched',async()=>{
  // Seed the fake document memo with a prior delivery; AUTH must not erase that uncertainty.
  const source=merchantDocument.toString();
  const context=vm.createContext({location:{href:'https://secure11.www.apple.com.cn/shop/signIn/orders'},URL,document:{querySelector(){throw Error('AUTH must not read DOM');}},__applebuyExecuted:new Set(['FAKE-already-delivered'])});
  const fn=vm.runInContext('('+source+')',context);
  const reply=await fn(plan,{id:'FAKE-already-delivered',taskId:'FAKE-task',authorized:true,structured:true,action:'checkout'});
  assert.equal(reply.delivered,false);assert.equal(reply.touched,true,'preserved delivery evidence must not become untouched at AUTH');
});

test('C013 P3-5: harmless untouched failures separated by verified progress do not exhaust a consecutive retry cap',async()=>{
  const rows={},attempts=new Map(),selected=[];let stage=0,seq=0,serial=0,time=100000;
  const actions=[],store={async get(k){return structuredClone(rows[k]??null);},async put(k,v){rows[k]=structuredClone(v);}};
  const port={async observe(){return {schema:'applebuy-merchant-read/v1',documentId:'FAKE-doc',seq:++seq,phase:stage===4?'VARIANT':'ENTRY',verifiedStep:true,nextChoice:stage===4?null:{choice:'FAKE-choice-'+stage,state:'enabled'},selectedProductChoices:[...selected],variantVerified:stage===4,quotedCny:15999};},async act(c){actions.push(c);const n=attempts.get(stage)??0;attempts.set(stage,n+1);if(n===0)return {delivered:false,touched:false,reason:'FAKEEvidenceChanged'};selected.push(c.choice);stage++;return {delivered:true};},async wait(n){time+=n;}};
  const result=await new PurchaseJob({store,port,now:()=>time,id:()=>`FAKE-${++serial}`,maxSteps:20,maxUntouched:3}).run(plan,{tabId:7,planDigest:'FAKE-digest',mode:'public-config'});
  assert.equal(result.state,'VALIDATED');assert.equal(stage,4);assert.equal(actions.length,8);assert.equal(rows[TASK_KEY],undefined);
});
test('C013 P3-6: verified already-selected allowed store waits for its slot list instead of clicking the store again',async()=>{
  let time=100000,seq=0,serial=0,waits=0,phase='FULFILLMENT';const rows={},actions=[];
  const store={async get(k){return structuredClone(rows[k]??null);},async put(k,v){rows[k]=structuredClone(v);}};
  const port={async observe(){return {schema:'applebuy-merchant-read/v1',documentId:'FAKE-doc',seq:++seq,phase,verifiedStep:true,purchase:structuredClone(purchase),fulfillmentChoice:'pickup',listComplete:true,generation:1,dates:[{label:'10月23日',ref:'date:0',enabled:true}],selectedDate:'10月23日',times:[{ref:'time:0',start:'21:15',end:'21:30',enabled:true}]};},async act(c){actions.push(c);phase='AUTH';return {delivered:true};},async wait(n){time+=n;if(++waits===3)phase='SLOTS';}};
  await new PurchaseJob({store,port,now:()=>time,id:()=>`FAKE-${++serial}`}).run(plan,{tabId:7,planDigest:'FAKE-digest'});
  assert.equal(actions.some(c=>c.action==='selectStore'),false);assert.equal(waits,3);assert.equal(actions.filter(c=>c.action==='chooseSlot').length,1);
});

test('C013 bounded retry negative control: consecutive untouched failures still stop instead of looping',async()=>{
  let seq=0,serial=0,actions=0;const rows={};
  const store={async get(k){return structuredClone(rows[k]??null);},async put(k,v){rows[k]=structuredClone(v);}};
  const port={async observe(){return {schema:'applebuy-merchant-read/v1',documentId:'FAKE-doc',seq:++seq,phase:'ENTRY',verifiedStep:true,nextChoice:{choice:'FAKE-choice',state:'enabled'}};},async act(){actions++;return {delivered:false,touched:false};}};
  const result=await new PurchaseJob({store,port,id:()=>`FAKE-${++serial}`,maxSteps:20,maxUntouched:3}).run(plan,{tabId:7,planDigest:'FAKE-digest',mode:'public-config'});
  assert.equal(result.state,'NEEDS_VERIFICATION');assert.match(result.reason,/untouched/);assert.equal(actions,4);assert.equal(rows[TASK_KEY],undefined);
});
