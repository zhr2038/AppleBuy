// Codex independent fault reproductions. All DOM and merchant state below are synthetic.
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
const text=['iPhone Duo 256GB 星光白色','数量：1','总计：RMB 15,999','取货地点：Apple 大连恒隆广场','店内取货'];
function fixture(){
  const f={texts:[...text],radios:[Object.assign(new El('Apple 大连恒隆广场','INPUT'),{checked:true}),Object.assign(new El('10月23日','INPUT'),{checked:true}),new El('10月24日','INPUT')],button:new El('继续填写取货详情','BUTTON')};
  f.time=new El('可选时段','SELECT');f.time.options=['可选时段','09:00 - 09:15','21:15 - 21:30'].map(s=>new El(s,'OPTION'));f.selects=[f.time];
  const title=new El('结账','H1'),main=new El('');main.querySelector=s=>s==='h1'?title:null;
  main.querySelectorAll=s=>s.startsWith('button')?[f.button]:s.startsWith('input[type="radio"]')?f.radios:s==='select'?f.selects:s==='h1,h2,h3,p,span,div'?[title,...f.texts.map(t=>new El(t))]:[];
  const context=vm.createContext({document:{querySelector:()=>main,querySelectorAll:()=>[]},location:{href:'https://secure6.www.apple.com.cn/shop/checkout'},URL,TextEncoder,crypto:webcrypto,Date,setTimeout,clearTimeout,HTMLInputElement:El,Event:class{constructor(type){this.type=type;}},getComputedStyle:e=>({display:e.hidden?'none':'block',visibility:'visible'})});
  const fn=vm.runInContext('('+merchantDocument.toString()+')',context);f.read=()=>fn(plan);
  f.choose=async()=>fn(plan,{id:'review-choice',taskId:'review-task',authorized:true,structured:true,expected:JSON.stringify(await f.read()),action:'chooseSlot',ref:'time:2',date:'10月23日',start:'21:15',end:'21:30'});
  return f;
}
test('C012 F-L: a change handler that resets the selected terminal cannot send Continue',async()=>{
  const f=fixture();f.time.onEvent=()=>{f.time.selectedIndex=1;};
  const r=await f.choose();assert.equal(f.button.clicks,0);assert.equal(r.delivered,false);assert.equal(r.touched,true);
});
test('C012 F-L: post-change disabled choice, date/store/product drift or connected selector replacement blocks continuation',async()=>{
  const faults=[
    f=>{f.time.options[2].disabled=true;},
    f=>{f.radios[1].checked=false;f.radios[2].checked=true;},
    f=>{f.radios[0].textContent='Apple 大连百年城';},
    f=>{f.texts[0]='iPhone Duo 512GB 星光白色';},
    f=>{const replacement=new El('可选时段','SELECT');replacement.options=f.time.options;replacement.selectedIndex=1;f.selects=[replacement];},
  ];
  for(const fault of faults){const f=fixture();f.time.onEvent=()=>fault(f);const r=await f.choose();assert.equal(f.button.clicks,0);assert.equal(r.delivered,false);assert.equal(r.touched,true);}
});
test('C012 F-L positive control: unchanged terminal choice sends exactly one continuation',async()=>{
  const f=fixture();const r=await f.choose();assert.equal(r.delivered,true);assert.equal(f.time.selectedIndex,2);assert.equal(f.button.clicks,1);
});
test('C012 F-L: a queued post-change microtask changing the purchase quote blocks continuation',async()=>{
  const f=fixture();f.time.onEvent=()=>{Promise.resolve().then(()=>{f.texts[2]='总计：RMB 99,999';});};
  const r=await f.choose();assert.equal(f.button.clicks,0);assert.equal(r.delivered,false);assert.equal(r.touched,true);
});
test('C012 F-M: one quantity selector cannot override two item quantity lines or a conflicting line',async()=>{
  for(const quantities of [['数量：1','数量：1'],['数量：2']]){
    const f=fixture(),q=new El('数量','SELECT');q.options=[new El('1','OPTION')];f.selects.push(q);f.texts=[...text.filter(t=>!t.startsWith('数量')),...quantities];
    assert.equal((await f.read()).purchase.itemVerified,false);
  }
});
test('C012 F-A additional: a checked composite store label cannot verify its allowed-store prefix',async()=>{
  const f=fixture();f.radios[0].textContent='Apple 大连恒隆广场 Apple 大连百年城';
  assert.equal((await f.read()).purchase.verified,false);
});
