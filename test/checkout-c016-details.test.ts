// C-016 implementation tests (Claude). FAKE serialized-page fixtures only: labels, values, inputs, event effects and clicks are
// synthetic. Nothing here establishes Apple's real details-page contract, field validation, network or server behavior.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
import {ChromePort} from '../web/checkout-connector/chrome-port.js';
import {PurchaseJob,TASK_KEY} from '../web/checkout-connector/job.js';

const intent={schema:'applebuy-intent/v1',product:{model:'iPhone Duo',capacity:'256GB',color:'星光白色'},quantity:1,maxTotalCny:15999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{tradeIn:'none',appleCare:'none'}};
const DATA={firstName:'FAKE-FIRST-C016',lastName:'FAKE-LAST-C016'};
const leaks=x=>Object.values(DATA).some(v=>JSON.stringify(x??null).includes(v));
class El{
  constructor(text,tag='DIV'){Object.assign(this,{textContent:text,tagName:tag,attrs:{},isConnected:true,parentElement:null,hidden:false,disabled:false,checked:false,labels:[],options:[],clicks:0,selectedIndex:0});}
  getAttribute(k){return this.attrs[k]??null;}hasAttribute(k){return Object.hasOwn(this.attrs,k);}closest(){return null;}
  click(){this.clicks++;if(this.tagName==='INPUT')this.checked=true;this.onClick?.();}
  dispatchEvent(e){this.onEvent?.(e);return true;}
  get selectedOptions(){return this.options.filter((_,i)=>i===this.selectedIndex);}checkValidity(){return true;}
}
class Input extends El{
  constructor(label,attrs={}){super('','INPUT');this.attrs={'aria-label':label,...attrs};this.writes=0;this.events=[];}
  set value(v){this._value=v;this.writes++;}get value(){return this._value??'';}
  dispatchEvent(e){this.events.push(e.type);return super.dispatchEvent(e);}checkValidity(){return !this.required||this.value!=='';}
}
// One FAKE checkout document: a SLOTS stage (for the vertical stack) and a DETAILS stage with two labelled inputs.
function page(stage='details'){
  const f={stage,texts:['iPhone Duo 256GB 星光白色','数量：1','总计：RMB 15,999','取货地点：Apple 大连恒隆广场','店内取货'],auth:false,busy:false,clock:1000,location:{href:'https://secure6.www.apple.com.cn/shop/checkout'}};
  f.first=new Input('名字');f.last=new Input('姓氏');f.inputs=[f.first,f.last];f.button=new El('继续选择付款方式','BUTTON');f.slotButton=new El('继续填写取货详情','BUTTON');
  f.radios=[Object.assign(new El('Apple 大连恒隆广场','INPUT'),{checked:true}),Object.assign(new El('10月23日','INPUT'),{checked:true}),new El('10月24日','INPUT')];
  f.time=new El('可选时段','SELECT');f.time.options=['可选时段','09:00 - 09:15','21:15 - 21:30'].map(s=>new El(s,'OPTION'));
  const title=new El('结账','H1'),slots=()=>f.stage==='slots';f.main=new El('');f.current=f.main;
  f.main.querySelector=s=>s==='h1'?title:s.includes('password')&&(f.auth||f.inputs.some(e=>e.attrs.type==='password'||e.attrs.autocomplete==='one-time-code'))?new El(''):s==='[aria-busy="true"]'&&f.busy?new El(''):null;
  f.main.querySelectorAll=s=>s.startsWith('button')?[slots()?f.slotButton:f.button]:s.startsWith('input[type="radio"]')?(slots()?f.radios:[]):s==='select'?(slots()?[f.time]:[]):
    s==='h1,h2,h3,p,span,div'?[title,...f.texts.map(t=>new El(t))]:s==='input'?(slots()?[]:f.inputs):s==='input[required]'?(slots()?[]:f.inputs.filter(e=>e.required)):[];
  const context=vm.createContext({document:{querySelector:()=>f.current,querySelectorAll:()=>[]},location:f.location,URL,TextEncoder,crypto:webcrypto,Date:{now:()=>f.clock},setTimeout,clearTimeout,HTMLInputElement:Input,Event:class{constructor(type){this.type=type;}},getComputedStyle:e=>({display:e.hidden?'none':'block',visibility:'visible'})});
  f.fn=vm.runInContext('('+merchantDocument.toString()+')',context);f.read=()=>f.fn(intent);
  f.command=async(id='FAKE-c016',data=DATA)=>({id,taskId:'FAKE-task',authorized:true,structured:true,expected:JSON.stringify(await f.read()),action:'fillDetails',privatePickupData:data});
  f.send=cmd=>f.fn(intent,cmd);
  return f;
}
const later=(queue,fn)=>queue==='zero-delay-timer'?setTimeout(fn,0):Promise.resolve().then(()=>Promise.resolve().then(fn));
const onFirst=(f,type,fn)=>{let armed=true;f.first.onEvent=e=>{if(e.type===type&&armed){armed=false;fn();}};};

test('C016 drift queued by the first value (nested microtask or zero-delay timer) blocks the next value and Continue as touched',async()=>{
  const faults={
    price:f=>{f.texts[2]='总计：RMB 99,999';},
    busy:f=>{f.busy=true;},
    receiverDisabled:f=>{f.last.disabled=true;},
    receiverReplaced:f=>{f.swapped=new Input('姓氏');f.inputs=[f.first,f.swapped];},
    extraField:f=>{f.inputs=[...f.inputs,new Input('FAKE 验证码')];},
    mainReplaced:f=>{f.current=Object.assign(new El(''),{querySelector:f.main.querySelector,querySelectorAll:f.main.querySelectorAll});},
    continueReplaced:f=>{f.button=new El('继续选择付款方式','BUTTON');},
    continueDisabled:f=>{f.button.disabled=true;},
  };
  for(const [name,fault] of Object.entries(faults))for(const queue of ['nested-microtask','zero-delay-timer']){
    const f=page(),old=f.button,cmd=await f.command();onFirst(f,'input',()=>later(queue,()=>fault(f)));
    const r=await f.send(cmd),at=name+' '+queue;
    assert.deepEqual({...r},{delivered:false,touched:true,reason:'DetailsEvidenceChangedAfterInput'},at);
    assert.equal(f.first.writes,1,at);assert.equal(f.last.writes,0,at);assert.equal(f.swapped?.writes??0,0,at);
    assert.equal(old.clicks+(f.button===old?0:f.button.clicks),0,at);assert.equal(leaks(r),false,at);
  }
});

test('C016 drift queued after the LAST value blocks only Continue; both writes stay touched truth',async()=>{
  for(const queue of ['nested-microtask','zero-delay-timer']){
    const f=page(),cmd=await f.command();f.last.onEvent=e=>{if(e.type==='change')later(queue,()=>{f.texts[1]='数量：2';});};
    const r=await f.send(cmd);assert.deepEqual({...r},{delivered:false,touched:true,reason:'DetailsEvidenceChangedAfterInput'},queue);
    assert.equal(f.first.writes,1);assert.equal(f.last.writes,1);assert.equal(f.button.clicks,0);
  }
});

test('C016 a synchronous input handler that invalidates the current receiver stops before its change event and the next value',async()=>{
  const f=page(),cmd=await f.command();onFirst(f,'input',()=>{f.first.attrs['aria-label']='FAKE 其他';});
  const r=await f.send(cmd);assert.deepEqual({...r},{delivered:false,touched:true,reason:'PrivateFieldReceiverChanged'});
  assert.deepEqual(f.first.events,['input']);assert.equal(f.last.writes,0);assert.equal(f.button.clicks,0);
});

test('C016 authentication, non-native, read-only, wrong-type or ambiguous receivers stay positively untouched',async()=>{
  const cases={
    password:f=>{f.last.attrs.type='password';},
    oneTimeCode:f=>{f.last.attrs.autocomplete='one-time-code';},
    currentPassword:f=>{f.last.attrs.autocomplete='current-password';},
    search:f=>{f.last.attrs.type='search';},
    hidden:f=>{f.last.attrs.type='hidden';},
    readOnly:f=>{f.last.readOnly=true;},
    duplicateDisabled:f=>{const d=new Input('姓氏');d.disabled=true;f.inputs=[...f.inputs,d];},
    notNative:f=>{const e=new El('','INPUT');e.attrs={'aria-label':'姓氏'};f.inputs=[f.first,e];},
  };
  for(const [name,arrange] of Object.entries(cases)){
    const f=page();arrange(f);const r=await f.send(await f.command());
    assert.equal(r.delivered,false,name);assert.equal(r.touched,false,name);assert.equal(f.first.writes+f.last.writes,0,name);assert.equal(f.button.clicks,0,name);assert.equal(leaks(r),false,name);
  }
});

test('C016 positive controls: no supplied data with valid pre-filled field, and benign same-value event work, each continue once',async()=>{
  const none=page();none.first.required=true;none.first._value='FAKE-PREFILLED';
  assert.deepEqual({...await none.send(await none.command('FAKE-none',{}))},{delivered:true});assert.equal(none.button.clicks,1);assert.equal(none.first.writes+none.last.writes,0);
  const f=page(),cmd=await f.command();onFirst(f,'input',()=>{Promise.resolve().then(()=>{f.texts[2]='总计：RMB 15,999';});setTimeout(()=>{f.first.attrs['aria-label']='名字';},0);});
  assert.deepEqual({...await f.send(cmd)},{delivered:true});assert.equal(f.button.clicks,1);
  assert.equal(f.first.value,DATA.firstName);assert.equal(f.last.value,DATA.lastName);assert.deepEqual([f.first.events,f.last.events],[['input','change'],['input','change']]);
  assert.equal(leaks(await f.read()),false);
  const repeat=await f.send(cmd);assert.deepEqual({...repeat},{delivered:false,touched:true,reason:'OperationAlreadyDelivered'});assert.equal(f.first.writes+f.last.writes,2);assert.equal(f.button.clicks,1);
});

test('C016 an empty required field after written values requires a human and is touched; Continue is not clicked',async()=>{
  const f=page();f.last.required=true;const r=await f.send(await f.command('FAKE-partial',{firstName:DATA.firstName}));
  assert.deepEqual({...r},{delivered:false,touched:true,reason:'PickupDetailsRequireHuman'});assert.equal(f.first.writes,1);assert.equal(f.last.writes,0);assert.equal(f.button.clicks,0);
});

test('C016 the input boundary is bounded: a value older than the settle limit is not followed by another value',async()=>{
  const slow=page(),cmd=await slow.command();onFirst(slow,'input',()=>setTimeout(()=>{slow.clock+=2001;},0));
  assert.deepEqual({...await slow.send(cmd)},{delivered:false,touched:true,reason:'DetailsEvidenceChangedAfterInput'});assert.equal(slow.last.writes,0);assert.equal(slow.button.clicks,0);
  const within=page(),ok=await within.command();onFirst(within,'input',()=>setTimeout(()=>{within.clock+=2000;},0));
  assert.deepEqual({...await within.send(ok)},{delivered:true});assert.equal(within.button.clicks,1);
});

test('C016 actual ChromePort: changed receiver is unknown without values in errors; a stable page is delivered once',async()=>{
  const transport=f=>({tabs:{async get(){return {url:f.location.href};}},permissions:{async contains(){return true;}},scripting:{async executeScript({func,args,world}){assert.equal(func,merchantDocument);assert.equal(world,'ISOLATED');return [{frameId:0,documentId:'FAKE-document',result:structuredClone(await f.fn(...args))}];}}});
  const command={action:'fillDetails',id:'FAKE-port',taskId:'FAKE-task',documentId:'FAKE-document',plan:intent};
  const f=page(),port=new ChromePort(transport(f),7,{authorized:true,privatePickupData:DATA});assert.equal(leaks(await port.observe(intent)),false);
  onFirst(f,'change',()=>setTimeout(()=>{f.swapped=new Input('姓氏');f.inputs=[f.first,f.swapped];},0));
  for(let n=0;n<2;n++){const e=await port.act(command).then(()=>null,x=>x);assert.match(e?.message,/^MutationResultUnknown$/);assert.equal(leaks(e.message),false);}
  assert.equal(f.first.writes,1);assert.equal(f.last.writes+f.swapped.writes,0);assert.equal(f.button.clicks,0);
  const g=page(),stable=new ChromePort(transport(g),7,{authorized:true,privatePickupData:DATA});await stable.observe(intent);
  assert.deepEqual({...await stable.act(command)},{delivered:true});assert.equal(g.button.clicks,1);
});

// Production PurchaseJob -> ChromePort -> serialized page program, with a FAKE Chrome transport and FAKE private data.
function stack(f){
  const rows={},calls=[];let serial=0,time=500000;
  const store={async get(k){return structuredClone(rows[k]??null);},async put(k,v){rows[k]=structuredClone(v);}};
  const api={tabs:{async get(){return {url:f.location.href};}},permissions:{async contains(){return true;}},
    scripting:{async executeScript({func,args,world}){assert.equal(func,merchantDocument);assert.equal(world,'ISOLATED');if(args[1])calls.push(args[1].action);return [{frameId:0,documentId:'FAKE-doc',result:structuredClone(await f.fn(...args))}];}}};
  const make=()=>{const port=new ChromePort(api,7,{authorized:true,privatePickupData:DATA,pending:rows[TASK_KEY]?.pending??null});port.wait=async n=>{time+=n;};return new PurchaseJob({store,port,now:()=>time,id:()=>'FAKE-'+(++serial),maxSteps:30});};
  return {rows,calls,run:()=>make().run(intent,{tabId:7,planDigest:'FAKE-digest'})};
}
function slotsThenDetails(){const f=page('slots');f.slotButton.onClick=()=>{f.stage='details';};f.button.onClick=()=>{f.auth=true;};return f;}

test('C016 vertical: drift during details event work is a preserved unknown fillDetails; restart never re-fills or continues',async()=>{
  const f=slotsThenDetails();onFirst(f,'input',()=>later('zero-delay-timer',()=>{f.texts[2]='总计：RMB 99,999';}));
  const x=stack(f),r=await x.run();
  assert.equal(r.state,'NEEDS_VERIFICATION');assert.equal(r.pending.action,'fillDetails');assert.deepEqual(x.calls,['chooseSlot','fillDetails']);
  assert.equal(f.first.writes,1);assert.equal(f.last.writes,0);assert.equal(f.button.clicks,0);
  const again=await x.run();assert.equal(again.state,'NEEDS_VERIFICATION');assert.deepEqual(x.calls,['chooseSlot','fillDetails']);
  assert.equal(f.first.writes,1);assert.equal(f.button.clicks,0);assert.equal(leaks(x.rows),false);
});

test('C016 vertical positive control: accepted slot, both FAKE values once, one details Continue, no values in durable rows',async()=>{
  const f=slotsThenDetails(),x=stack(f),r=await x.run();
  assert.deepEqual(x.calls,['chooseSlot','fillDetails']);assert.equal(f.slotButton.clicks,1);assert.equal(f.button.clicks,1);
  assert.deepEqual([f.first.value,f.last.value,f.first.writes,f.last.writes],[DATA.firstName,DATA.lastName,1,1]);
  assert.equal(r.state,'NEEDS_USER');assert.equal(r.reason,'auth');assert.equal(leaks(x.rows),false);assert.equal(leaks(r),false);
});
