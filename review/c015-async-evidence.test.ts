// Codex independent action/evidence race. Everything is FAKE, including order reference, grant and DOM.
// A fake digest microtask changes public purchase evidence after decoding and before a delayed command resumes.
// No Apple page, credentials, real grant, network request or real click is involved.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {merchantDocument} from '../web/checkout-connector/page-program.js';

const plan={product:{model:'iPhone Duo',capacity:'256GB',color:'星光白色'},stores:['Apple 大连恒隆广场'],maxTotalCny:15999};
class El{
  constructor(text,tag='DIV'){Object.assign(this,{textContent:text,tagName:tag,attrs:{},isConnected:true,parentElement:null,hidden:false,disabled:false,checked:false,labels:[],options:[],clicks:0});}
  getAttribute(k){return this.attrs[k]??null;}hasAttribute(k){return Object.hasOwn(this.attrs,k);}closest(){return null;}
  click(){this.clicks++;}dispatchEvent(){throw new Error('FAKE fixture does not expect input writes');}
}
function fixture(orderLabel=true){
  const f={texts:['iPhone Duo 256GB 星光白色','数量：1','总计：RMB 15,999','取货地点：Apple 大连恒隆广场','店内取货','取货日期：10月23日','取货时间：21:15 - 21:30'],armed:false,mutated:false,mutation:null};
  if(orderLabel)f.texts.push('订单编号：FAKEC01542');
  f.location={href:'https://secure6.www.apple.com.cn/shop/checkout'};
  f.submit=new El('立即下单','BUTTON');const title=new El('结账','H1'),pay=new El('支付宝','INPUT');pay.checked=true;
  const terms=new El('销售政策','A');terms.href='https://www.apple.com.cn/shop/open/salespolicies';
  const main=new El('');main.querySelector=s=>s==='h1'?title:null;
  main.querySelectorAll=s=>s.startsWith('button')?[f.submit]:s.startsWith('input[type="radio"]')?[pay]:s==='h1,h2,h3,p,span,div'?[title,...f.texts.map(t=>new El(t))]:s==='a[href]'?[terms]:[];
  const crypto={subtle:{async digest(...args){if(f.armed){f.armed=false;await Promise.resolve();f.mutated=true;f.mutation?.();}return webcrypto.subtle.digest(...args);}}};
  const context=vm.createContext({document:{querySelector:()=>main,querySelectorAll:()=>[terms]},location:f.location,URL,TextEncoder,crypto,Date,setTimeout,clearTimeout,HTMLInputElement:El,Event:class{},getComputedStyle:()=>({display:'block',visibility:'visible'})});
  f.fn=vm.runInContext('('+merchantDocument.toString()+')',context);f.read=()=>f.fn(plan);
  f.command=async()=>({id:'FAKE-final',taskId:'FAKE-task',planDigest:'FAKE-plan',authorized:true,structured:true,expected:JSON.stringify(await f.read()),action:'submitOrder',finalGrant:{termsAccepted:true,taskId:'FAKE-task',planDigest:'FAKE-plan',expiry:Date.now()+60000,existingOrdersChecked:true,noExtras:true,termsUrl:terms.href}});
  return f;
}

for(const [name,change] of Object.entries({
  price:f=>{f.texts[2]='总计：RMB 99,999';},
  quantity:f=>{f.texts[1]='数量：2';},
  store:f=>{f.texts[3]='取货地点：Apple 大连百年城';},
  route:f=>{f.location.href='https://secure6.www.apple.com.cn/shop/signIn/orders';},
}))test(`C015: ${name} drift during an awaited order digest cannot cause final submission from stale evidence`,async()=>{
  const f=fixture(),cmd=await f.command();f.mutation=()=>change(f);f.armed=true;
  const r=await f.fn(plan,cmd);
  if(f.mutated){
    assert.equal(f.submit.clicks,0,'the FAKE drift actually occurred before a delayed decision');
    assert.equal(r.delivered,false);assert.equal(r.touched,false,'no write preceded this decoding gap');
  }else{
    // A valid repair may remove the action-path asynchronous digest entirely. No mutation occurred in that case;
    // either a synchronous current decision or a safe unsupported decision is acceptable. Do not call it a drift test.
    assert.ok(f.submit.clicks<=1);assert.equal(f.submit.clicks,r.delivered===true?1:0);
  }
});

test('C015 positive control: unchanged verified review without an order reference still submits exactly once',async()=>{
  const f=fixture(false),r=await f.fn(plan,await f.command());assert.equal(r.delivered,true);assert.equal(f.submit.clicks,1);
});
test('C015 positive stale-evidence control: a changed price before command decoding never submits',async()=>{
  const f=fixture(),cmd=await f.command();f.texts[2]='总计：RMB 99,999';
  const r=await f.fn(plan,cmd);assert.equal(r.delivered,false);assert.equal(r.touched,false);assert.equal(f.submit.clicks,0);
});
