// C-013-R3 implementation tests (Claude). FAKE serialized-page fixtures only: button.click increments a counter and
// changes local fake state. Nothing here establishes Apple's real asynchronous slot validation, refusal or timing.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
import {ChromePort} from '../web/checkout-connector/chrome-port.js';
import {PurchaseJob,TASK_KEY} from '../web/checkout-connector/job.js';

const intent={schema:'applebuy-intent/v1',product:{model:'iPhone Duo',capacity:'256GB',color:'星光白色'},quantity:1,maxTotalCny:15999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{tradeIn:'none',appleCare:'none'}};
class El{
  constructor(text,tag='DIV'){Object.assign(this,{textContent:text,tagName:tag,attrs:{},isConnected:true,parentElement:null,hidden:false,disabled:false,checked:false,labels:[],options:[],clicks:0,selectedIndex:0});}
  getAttribute(k){return this.attrs[k]??null;}hasAttribute(k){return Object.hasOwn(this.attrs,k);}closest(){return null;}
  click(){this.clicks++;if(this.tagName==='INPUT')this.checked=true;this.onClick?.();}
  dispatchEvent(e){this.onEvent?.(e);return true;}
  get selectedOptions(){return this.options.filter((_,i)=>i===this.selectedIndex);}checkValidity(){return true;}
}
// One FAKE SLOTS page: exact item/quote/store, one selected first date, one native time selector with a terminal option.
function slotsPage(){
  const f={texts:['iPhone Duo 256GB 星光白色','数量：1','总计：RMB 15,999','取货地点：Apple 大连恒隆广场','店内取货'],busy:false,auth:false,clock:1000};
  f.button=new El('继续填写取货详情','BUTTON');f.continueClicks=()=>f.button.clicks;
  f.radios=[Object.assign(new El('Apple 大连恒隆广场','INPUT'),{checked:true}),Object.assign(new El('10月23日','INPUT'),{checked:true}),new El('10月24日','INPUT')];
  f.time=new El('可选时段','SELECT');f.time.options=['可选时段','09:00 - 09:15','21:15 - 21:30'].map(s=>new El(s,'OPTION'));f.selects=[f.time];
  const title=new El('结账','H1'),main=new El('');
  main.querySelector=s=>s==='h1'?title:s.includes('password')&&f.auth?new El(''):s==='[aria-busy="true"]'&&f.busy?new El(''):null;
  main.querySelectorAll=s=>s.startsWith('button')?[f.button]:s.startsWith('input[type="radio"]')?f.radios:s==='select'?f.selects:s==='h1,h2,h3,p,span,div'?[title,...f.texts.map(t=>new El(t))]:[];
  const context=vm.createContext({document:{querySelector:()=>main,querySelectorAll:()=>[]},location:{href:'https://secure6.www.apple.com.cn/shop/checkout'},URL,TextEncoder,crypto:webcrypto,Date:{now:()=>f.clock},setTimeout,clearTimeout,HTMLInputElement:El,Event:class{constructor(type){this.type=type;}},getComputedStyle:e=>({display:e.hidden?'none':'block',visibility:'visible'})});
  const fn=vm.runInContext('('+merchantDocument.toString()+')',context);
  f.fn=fn;f.read=()=>fn(intent);
  f.command=async(id='FAKE-choice')=>({id,taskId:'FAKE-task',authorized:true,structured:true,expected:JSON.stringify(await f.read()),action:'chooseSlot',ref:'time:2',date:'10月23日',start:'21:15',end:'21:30'});
  f.send=cmd=>fn(intent,cmd);
  return f;
}
const unknownNoContinue=(f,r)=>{assert.equal(f.continueClicks(),0,'no continuation');assert.equal(r.delivered,false);assert.equal(r.touched,true,'selection was written: unknown, never untouched');};

test('R3 duplicate of an in-flight slot id during the change boundary is touched and never clicks again',async()=>{
  const f=slotsPage(),cmd=await f.command();
  const first=f.send(cmd);const duplicate=await f.send(cmd);
  assert.deepEqual({...duplicate},{delivered:false,touched:true,reason:'OperationAlreadyDelivered'});
  assert.equal((await first).delivered,true);assert.equal(f.continueClicks(),1);assert.equal(f.time.selectedIndex,2);
});

test('R3 a NEW id with stale slot evidence stays positively untouched: no selection write, no continuation',async()=>{
  const f=slotsPage(),cmd=await f.command('FAKE-new');f.texts[2]='总计：RMB 16,999';
  const r=await f.send(cmd);assert.deepEqual({...r},{delivered:false,touched:false,reason:'OperationEvidenceChanged'});
  assert.equal(f.time.selectedIndex,0);assert.equal(f.continueClicks(),0);
});

test('R3 change-boundary work that alters store, date, selector or quantity blocks continuation as unknown',async()=>{
  const faults={
    store:f=>{f.radios[0].textContent='Apple 大连百年城';},
    date:f=>{f.radios[1].checked=false;f.radios[2].checked=true;},
    selector:f=>{const r=new El('可选时段','SELECT');r.options=f.time.options;r.selectedIndex=2;f.selects=[r];},
    quantity:f=>{f.texts[1]='数量：2';},
    terminalDisabled:f=>{f.time.options[2].disabled=true;},
  };
  for(const [name,fault] of Object.entries(faults))for(const queue of ['nested-microtask','zero-delay-timer']){
    const f=slotsPage();
    f.time.onEvent=()=>{if(queue==='zero-delay-timer')setTimeout(()=>fault(f),0);else Promise.resolve().then(()=>Promise.resolve().then(()=>fault(f)));};
    const r=await f.send(await f.command(`FAKE-${name}-${queue}`));unknownNoContinue(f,r);assert.equal(r.reason,'SlotEvidenceChangedAfterSelection',name+' '+queue);
  }
});

test('R3 Continue replaced, disabled or merchant busy after the change: no click on any continuation control',async()=>{
  const replaced=slotsPage(),old=replaced.button;replaced.time.onEvent=()=>{setTimeout(()=>{replaced.button=new El('继续填写取货详情','BUTTON');},0);};
  const r1=await replaced.send(await replaced.command());assert.equal(old.clicks+replaced.button.clicks,0);assert.equal(r1.touched,true);assert.equal(r1.delivered,false);
  const off=slotsPage();off.time.onEvent=()=>{Promise.resolve().then(()=>Promise.resolve().then(()=>{off.button.disabled=true;}));};
  unknownNoContinue(off,await off.send(await off.command()));
  const busy=slotsPage();busy.time.onEvent=()=>{setTimeout(()=>{busy.busy=true;},0);};
  unknownNoContinue(busy,await busy.send(await busy.command()));
});

test('R3 the change boundary is bounded: a selection older than the settle limit is not continued',async()=>{
  const slow=slotsPage();slow.time.onEvent=()=>{setTimeout(()=>{slow.clock+=2001;},0);};
  unknownNoContinue(slow,await slow.send(await slow.command()));
  const within=slotsPage();within.time.onEvent=()=>{setTimeout(()=>{within.clock+=2000;},0);};
  const r=await within.send(await within.command());assert.equal(r.delivered,true);assert.equal(within.continueClicks(),1,'positive control at the limit');
});

test('R3 a benign same-value change event (no DOM drift) still continues exactly once',async()=>{
  const f=slotsPage();f.time.onEvent=()=>{Promise.resolve().then(()=>{f.time.selectedIndex=2;});setTimeout(()=>{f.texts[2]='总计：RMB 15,999';},0);};
  const r=await f.send(await f.command());assert.equal(r.delivered,true);assert.equal(f.continueClicks(),1);assert.equal(f.time.selectedIndex,2);
});

// Production PurchaseJob -> ChromePort -> serialized page program, with a FAKE Chrome transport.
function stack(f){
  const rows={},calls=[];let serial=0,time=500000;
  const store={async get(k){return structuredClone(rows[k]??null);},async put(k,v){rows[k]=structuredClone(v);}};
  const api={tabs:{async get(){return {url:'https://secure6.www.apple.com.cn/shop/checkout'};}},permissions:{async contains(){return true;}},
    scripting:{async executeScript({func,args,world}){assert.equal(func,merchantDocument);assert.equal(world,'ISOLATED');if(args[1])calls.push(args[1].action);return [{frameId:0,documentId:'FAKE-doc',result:structuredClone(await f.fn(...args))}];}}};
  const make=()=>{const port=new ChromePort(api,7,{authorized:true,pending:rows[TASK_KEY]?.pending??null});port.wait=async n=>{time+=n;};return new PurchaseJob({store,port,now:()=>time,id:()=>'FAKE-'+(++serial),maxSteps:30});};
  return {rows,calls,run:()=>make().run(intent,{tabId:7,planDigest:'FAKE-digest'})};
}

test('R3 vertical: a nested post-change reset becomes a preserved unknown chooseSlot; restart never repeats or continues',async()=>{
  const f=slotsPage();f.time.onEvent=()=>{Promise.resolve().then(()=>Promise.resolve().then(()=>{f.time.selectedIndex=1;}));};
  const x=stack(f),r=await x.run();
  assert.equal(r.state,'NEEDS_VERIFICATION');assert.equal(r.pending.action,'chooseSlot');assert.equal(r.acceptedSlot??null,null);
  assert.deepEqual(x.calls,['chooseSlot']);assert.equal(f.continueClicks(),0);
  const again=await x.run();assert.equal(again.state,'NEEDS_VERIFICATION');assert.deepEqual(x.calls,['chooseSlot']);assert.equal(f.continueClicks(),0);
});

test('R3 vertical positive control: an unchanged native terminal continues once and is reconciled only from the next step',async()=>{
  // FAKE progression: Continue shows a details step; its own continuation then shows a human authentication gate.
  const f=slotsPage(),slotContinue=f.button;let detailsContinue=null;
  slotContinue.onClick=()=>{detailsContinue=new El('继续选择付款方式','BUTTON');detailsContinue.onClick=()=>{f.auth=true;};f.button=detailsContinue;};
  const x=stack(f),r=await x.run();
  assert.deepEqual(x.calls,['chooseSlot','fillDetails']);assert.equal(slotContinue.clicks,1);assert.equal(detailsContinue.clicks,1);assert.equal(f.time.selectedIndex,2);
  assert.deepEqual([r.acceptedSlot.date,r.acceptedSlot.start,r.acceptedSlot.end],['10月23日','21:15','21:30']);assert.match(r.acceptedSlot.basis,/not a hold/);
  assert.equal(r.state,'NEEDS_USER');assert.equal(r.reason,'auth');
});
