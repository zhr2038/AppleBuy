// Independent Codex probe. Entire DOM, values, contract, document identity, event effects and clicks are FAKE.
// This does not assert an observed Apple details-page contract or transmit any real contact/account data.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
import {ChromePort} from '../web/checkout-connector/chrome-port.js';

const plan={schema:'applebuy-intent/v1',product:{model:'iPhone Duo',capacity:'256GB',color:'星光白色'},quantity:1,maxTotalCny:15999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{tradeIn:'none',appleCare:'none'}};
const DATA={firstName:'FAKE-FIRST',lastName:'FAKE-LAST'};
class El{
  constructor(text,tag='DIV'){Object.assign(this,{textContent:text,tagName:tag,attrs:{},isConnected:true,parentElement:null,hidden:false,disabled:false,checked:false,labels:[],clicks:0,options:[]});}
  getAttribute(k){return this.attrs[k]??null;}hasAttribute(k){return Object.hasOwn(this.attrs,k);}closest(){return null;}
  click(){this.clicks++;}dispatchEvent(e){this.onEvent?.(e);return true;}checkValidity(){return true;}
}
class Input extends El{
  set value(v){this._value=v;this.writes++;}get value(){return this._value??'';}
  constructor(label){super('','INPUT');this.attrs={'aria-label':label};this.writes=0;}
}
function fixture(){
  const f={texts:['iPhone Duo 256GB 星光白色','数量：1','总计：RMB 15,999','取货地点：Apple 大连恒隆广场','店内取货'],location:{href:'https://secure6.www.apple.com.cn/shop/checkout'}};
  f.first=new Input('名字');f.last=new Input('姓氏');f.inputs=[f.first,f.last];f.button=new El('继续选择付款方式','BUTTON');
  const main=new El(''),title=new El('结账','H1');
  main.querySelector=s=>s==='h1'?title:s.includes('password')&&f.inputs.some(e=>e.attrs.type==='password')?new El(''):null;
  main.querySelectorAll=s=>s.startsWith('button')?[f.button]:s==='h1,h2,h3,p,span,div'?[title,...f.texts.map(t=>new El(t))]:s==='input'?f.inputs:s==='input[required]'?f.inputs.filter(e=>e.required):[];
  const context=vm.createContext({document:{querySelector:()=>main,querySelectorAll:()=>[]},location:f.location,URL,TextEncoder,crypto:webcrypto,Date,setTimeout,clearTimeout,HTMLInputElement:Input,Event:class{constructor(type){this.type=type;}},getComputedStyle:()=>({display:'block',visibility:'visible'})});
  f.fn=vm.runInContext('('+merchantDocument.toString()+')',context);
  f.command=async()=>({id:'FAKE-details',taskId:'FAKE-task',authorized:true,structured:true,expected:JSON.stringify(await f.fn(plan)),action:'fillDetails',privatePickupData:DATA});
  f.arm=mutation=>{let armed=true;f.first.onEvent=e=>{if(e.type==='input'&&armed){armed=false;mutation(f);f.mutated=true;}};};
  return f;
}

for(const [name,mutation] of Object.entries({
  price:f=>{f.texts[2]='总计：RMB 99,999';},
  quantity:f=>{f.texts[1]='数量：2';},
  store:f=>{f.texts[3]='取货地点：Apple 大连百年城';},
  authRoute:f=>{f.location.href='https://secure6.www.apple.com.cn/shop/signIn/orders';},
}))test(`C016 first input event ${name} drift blocks the later details Continue`,async()=>{
  const f=fixture(),cmd=await f.command();f.arm(mutation);const r=await f.fn(plan,cmd);
  assert.equal(f.mutated,true);assert.equal(f.first.writes,1,'one FAKE input was already written');
  assert.equal(f.button.clicks,0,'current changed merchant conditions cannot continue');assert.equal(r.delivered,false);assert.equal(r.touched,true,'unknown after actual input write, not untouched');
});

for(const [name,mutate] of Object.entries({disabled:f=>{f.last.disabled=true;},password:f=>{f.last.attrs={'aria-label':'Apple 账户密码',type:'password'};}})){
test(`C016 a next target changed to ${name} by the first input handler never receives its value`,async()=>{
    const f=fixture(),cmd=await f.command();f.arm(mutate);const r=await f.fn(plan,cmd);
    assert.equal(f.mutated,true);assert.equal(f.first.writes,1);assert.equal(f.last.writes,0,'do not send the second FAKE value into a changed receiver');assert.equal(f.last.value,'');assert.equal(f.button.clicks,0);assert.equal(r.delivered,false);assert.equal(r.touched,true);
});
}

test('C016 a next target disconnected by the first input event never receives a later value',async()=>{
  const f=fixture(),cmd=await f.command();f.arm(g=>{g.last.isConnected=false;g.inputs=[g.first];});const r=await f.fn(plan,cmd);
  assert.equal(f.mutated,true);assert.equal(f.first.writes,1);assert.equal(f.last.writes,0,'even a retained disconnected node cannot receive a new value');assert.equal(f.button.clicks,0);assert.equal(r.delivered,false);assert.equal(r.touched,true);
});

test('C016 stable positive: exact fields filled once and one Continue, values absent from observations, delivered id cannot repeat',async()=>{
  const f=fixture(),cmd=await f.command();assert.equal((await f.fn(plan,cmd)).delivered,true);
  assert.equal(f.first.value,DATA.firstName);assert.equal(f.last.value,DATA.lastName);assert.equal(f.button.clicks,1);
  const observation=JSON.stringify(await f.fn(plan));assert.equal(observation.includes(DATA.firstName),false);assert.equal(observation.includes(DATA.lastName),false);
  const repeat=await f.fn(plan,cmd);assert.equal(repeat.delivered,false);assert.equal(repeat.touched,true);
  assert.equal(f.first.writes,1);assert.equal(f.last.writes,1);assert.equal(f.button.clicks,1);
});

test('C016 untouched positive: an unrecognised second binding before the first write transmits nothing',async()=>{
  const f=fixture();f.last.attrs={'aria-label':'FAKE unsupported label'};const r=await f.fn(plan,await f.command());
  assert.equal(r.delivered,false);assert.equal(r.touched,false);assert.equal(f.first.writes,0);assert.equal(f.last.writes,0);assert.equal(f.button.clicks,0);
});

test('C016 actual ChromePort with FAKE executeScript preserves touched unknown and never repeats details writes',async()=>{
  const f=fixture();const api={tabs:{async get(){return {url:f.location.href};}},permissions:{async contains(){return true;}},scripting:{async executeScript({func,args,world}){assert.equal(func,merchantDocument);assert.equal(world,'ISOLATED');return [{frameId:0,documentId:'FAKE-document',result:structuredClone(await f.fn(...args))}];}}};
  const port=new ChromePort(api,7,{authorized:true,privatePickupData:DATA});await port.observe(plan);f.arm(g=>{g.texts[2]='总计：RMB 99,999';});
  const command={action:'fillDetails',id:'FAKE-details',taskId:'FAKE-task',documentId:'FAKE-document',plan};
  await assert.rejects(port.act(command),/MutationResultUnknown/);assert.equal(f.button.clicks,0);
  await assert.rejects(port.act(command),/MutationResultUnknown/);assert.equal(f.first.writes,1);assert.equal(f.last.writes<=1,true);assert.equal(f.button.clicks,0);
});
