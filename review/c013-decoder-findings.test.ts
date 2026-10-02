// Codex independent decoder faults. All documents/events/commands are FAKE; button.click only increments a counter.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
const plan={product:{model:'iPhone Duo',capacity:'256GB',color:'星光白色'},stores:['Apple 大连恒隆广场'],maxTotalCny:15999};
class El{
  constructor(text,tag='DIV'){Object.assign(this,{textContent:text,tagName:tag,attrs:{},isConnected:true,parentElement:null,hidden:false,disabled:false,checked:false,labels:[],options:[],clicks:0,selectedIndex:0});}
  getAttribute(k){return this.attrs[k]??null;}hasAttribute(k){return Object.hasOwn(this.attrs,k);}closest(){return null;}
  click(){this.clicks++;if(this.tagName==='INPUT')this.checked=true;this.onClick?.();}
  dispatchEvent(e){this.onEvent?.(e);return true;}
  get selectedOptions(){return this.options.filter((_,i)=>i===this.selectedIndex);}checkValidity(){return true;}
}
function fixture(slots=false){
  const f={texts:['iPhone Duo 256GB 星光白色','数量：1','总计：RMB 15,999','取货地点：Apple 大连恒隆广场','店内取货'],button:new El(slots?'继续填写取货详情':'安全结账','BUTTON'),radios:slots?[Object.assign(new El('Apple 大连恒隆广场','INPUT'),{checked:true}),Object.assign(new El('10月23日','INPUT'),{checked:true})]:[],selects:[]};
  f.time=new El('可选时段','SELECT');f.time.options=['可选时段','09:00 - 09:15','21:15 - 21:30'].map(s=>new El(s,'OPTION'));if(slots)f.selects=[f.time];
  const title=new El('结账','H1'),main=new El('');main.querySelector=s=>s==='h1'?title:null;
  main.querySelectorAll=s=>s.startsWith('button')?[f.button]:s.startsWith('input[type="radio"]')?f.radios:s==='select'?f.selects:s==='h1,h2,h3,p,span,div'?[title,...f.texts.map(t=>new El(t))]:[];
  const context=vm.createContext({document:{querySelector:()=>main,querySelectorAll:()=>[]},location:{href:slots?'https://secure6.www.apple.com.cn/shop/checkout':'https://www.apple.com.cn/shop/bag'},URL,TextEncoder,crypto:webcrypto,Date,setTimeout,clearTimeout,HTMLInputElement:El,Event:class{constructor(type){this.type=type;}},getComputedStyle:e=>({display:e.hidden?'none':'block',visibility:'visible'})});
  const fn=vm.runInContext('('+merchantDocument.toString()+')',context);f.read=()=>fn(plan);f.send=cmd=>fn(plan,cmd);
  f.command=async(action,id='FAKE-command')=>({id,taskId:'FAKE-task',authorized:true,structured:true,expected:JSON.stringify(await f.read()),action});
  f.choose=async()=>f.send({...await f.command('chooseSlot'),ref:'time:2',date:'10月23日',start:'21:15',end:'21:30'});return f;
}
test('C013 decoder P3-A: known delivered id remains touched after its click changes expected purchase evidence',async()=>{
  const f=fixture();f.button.onClick=()=>{f.texts[0]='iPhone Duo 512GB 星光白色';};const cmd=await f.command('checkout');
  assert.equal((await f.send(cmd)).delivered,true);const duplicate=await f.send(cmd);
  assert.equal(f.button.clicks,1);assert.equal(duplicate.delivered,false);assert.equal(duplicate.touched,true,'delivery memo cannot be hidden by a later evidence difference');
});
test('C013 decoder positive control: a NEW id with stale evidence is positively untouched and never clicked',async()=>{
  const f=fixture(),cmd=await f.command('checkout');f.texts[0]='iPhone Duo 512GB 星光白色';
  const result=await f.send(cmd);assert.equal(result.delivered,false);assert.equal(result.touched,false);assert.equal(f.button.clicks,0);
});
for(const change of ['selected-time','price'])test(`C013 decoder P3-B: a nested change microtask altering ${change} cannot send Continue`,async()=>{
  const f=fixture(true);f.time.onEvent=()=>{Promise.resolve().then(()=>Promise.resolve().then(()=>{if(change==='selected-time')f.time.selectedIndex=1;else f.texts[2]='总计：RMB 99,999';}));};
  const result=await f.choose();assert.equal(f.button.clicks,0,'the queued change must be observed before continuation');assert.equal(result.delivered,false);assert.equal(result.touched,true);
});
test('C013 decoder P3-B: a queued zero-delay change timer cannot send Continue with a changed time',async()=>{
  const f=fixture(true);let completed;const done=new Promise(r=>completed=r);
  f.time.onEvent=()=>{setTimeout(()=>{f.time.selectedIndex=1;completed();},0);};
  const result=await f.choose();await done;assert.equal(f.button.clicks,0);assert.equal(result.delivered,false);assert.equal(result.touched,true);
});
test('C013 decoder positive control: an unchanged native terminal selection still sends one Continue',async()=>{
  const f=fixture(true),result=await f.choose();assert.equal(result.delivered,true);assert.equal(f.time.selectedIndex,2);assert.equal(f.button.clicks,1);
});
