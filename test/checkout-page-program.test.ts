// Minimal synthetic DOM contract. It does not claim current Apple structure compatibility.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
const plan={product:{model:'iPhone Duo',capacity:'256GB',color:'星光白色'},stores:['Apple 大连恒隆广场'],maxTotalCny:15999};
class Element{
  constructor(text,attrs={}){this.textContent=text;this.attrs=attrs;this.isConnected=true;this.parentElement=null;this.hidden=false;this.disabled=false;this.checked=false;this.labels=[];this.clicks=0;this.tagName='DIV';this.options=[];}
  getAttribute(k){return this.attrs[k]??null;}hasAttribute(k){return Object.hasOwn(this.attrs,k);}closest(){return null;}
  click(){this.clicks++;if(this.tagName==='INPUT')this.checked=true;this.onClick?.();}dispatchEvent(e){this.onEvent?.(e);return true;}
  get selectedOptions(){return this.options.filter((o,i)=>o.selected||i===this.selectedIndex);}checkValidity(){return true;}
}
class Input extends Element{set value(v){this._value=v;}get value(){return this._value??'';}}
const el=(text,tag='DIV')=>Object.assign(new Element(text),{tagName:tag});
function fixture({url='https://secure6.www.apple.com.cn/shop/checkout',texts=[],buttons=[],radios=[],selects=[],inputs=[],links=[],title='购买 iPhone Duo',auth=false,busy=false}={}){
  const btn=buttons.map(t=>el(t,'BUTTON')),rs=radios.map(([text,checked])=>Object.assign(el(text,'INPUT'),{checked})),nodes=texts.map(t=>el(t));const h1=el(title,'H1');
  const main=el('');main.querySelector=s=>s==='h1'?h1:s.includes('password')&&auth?el(''):s==='[aria-busy="true"]'&&busy?el(''):null;
  main.querySelectorAll=s=>s.startsWith('button')?btn:s.startsWith('input[type="radio"]')?rs:s==='select'?selects:s==='h1,h2,h3,p,span,div'?[h1,...nodes]:s==='input'?inputs:s==='input[required]'?inputs.filter(i=>i.required):s==='a[href]'?links:[];
  const document={querySelector:()=>main,querySelectorAll:s=>s==='a[href]'?links:[]};
  const context=vm.createContext({location:{href:url},document,URL,TextEncoder,crypto:webcrypto,Date,HTMLInputElement:Input,Event:class{constructor(type){this.type=type;}},getComputedStyle:e=>({display:e.hidden?'none':'block',visibility:'visible'})});
  const fn=vm.runInContext('('+merchantDocument.toString()+')',context);
  let serial=0;return {fn,btn,rs,nodes,async read(){return await fn(plan);},async act(action,extra={}){const out=await fn(plan);return await fn(plan,{id:'action-'+(++serial),taskId:'task',authorized:true,expected:JSON.stringify(out),action,...extra});}};
}
const matching=['iPhone Duo 256GB 星光白色','数量：1','总计：RMB 15,999','取货地点：Apple 大连恒隆广场','店内取货'];
function times(disabled=false){const s=el('可选时段','SELECT');s.options=[el('可选时段','OPTION'),el('09:00 - 09:15','OPTION'),Object.assign(el('21:15 - 21:30','OPTION'),{disabled})];s.selectedIndex=0;return s;}
test('serialization is self-contained; unsupported domain exits before DOM access',async()=>{
  const f=fixture({url:'https://example.org/shop/checkout'});const o=await f.read();assert.equal(o.phase,'UNKNOWN');assert.equal(o.reason,'unsupported-official-url');
  for(const pattern of [/document\.cookie/,/localStorage/,/sessionStorage/,/fetch\(/,/XMLHttpRequest/,/chrome\./])assert.equal(pattern.test(merchantDocument.toString()),false);
});
test('bag is recognized with item proof before selecting pickup; no early store requirement',async()=>{
  const f=fixture({url:'https://www.apple.com.cn/shop/bag',texts:matching.slice(0,3),buttons:['安全结账']});const o=await f.read();assert.equal(o.phase,'BAG');assert.equal(o.purchase.itemVerified,true);assert.equal(o.purchase.verified,false);await f.act('checkout');assert.equal(f.btn[0].clicks,1);
});
test('delivery choice and exact allowed store are normal UI actions, never a shipping continuation',async()=>{
  const f=fixture({texts:matching.slice(0,3),radios:[['我要取货',false],['Apple 大连恒隆广场',false]]});await f.act('selectPickup');assert.equal(f.rs[0].clicks,1);await f.act('selectStore',{store:'Apple 大连恒隆广场'});assert.equal(f.rs[1].clicks,1);
});
test('native full time capture includes disabled terminal; selection is one change and one continuation',async()=>{
  const s=times();const f=fixture({texts:matching,buttons:['继续填写取货详情'],radios:[['10月23日',true],['10月24日',false],['10月25日',false]],selects:[s]});const o=await f.read();assert.equal(o.listComplete,true);assert.equal(o.times[1].start,'21:15');assert.equal(o.feedback,null);
  await f.act('chooseSlot',{ref:'time:2',date:'10月23日',start:'21:15',end:'21:30'});assert.equal(s.selectedIndex,2);assert.equal(f.btn[0].clicks,1);
  const d=times(true);const fd=fixture({texts:matching,buttons:['继续填写取货详情'],radios:[['10月23日',true]],selects:[d]});assert.equal((await fd.read()).times[1].enabled,false);await assert.rejects(fd.act('chooseSlot',{ref:'time:2',date:'10月23日',start:'21:15',end:'21:30'}),/Changed/);
});
test('redrawn time selector stops before continuation; duplicate command and stale expected evidence cannot click',async()=>{
  const s=times();s.onEvent=()=>{s.isConnected=false;};const f=fixture({texts:matching,buttons:['继续填写取货详情'],radios:[['10月23日',true]],selects:[s]});await assert.rejects(f.act('chooseSlot',{ref:'time:2',date:'10月23日',start:'21:15',end:'21:30'}),/Redrawn/);assert.equal(f.btn[0].clicks,0);
  const b=fixture({url:'https://www.apple.com.cn/shop/bag',texts:matching,buttons:['安全结账']});const o=await b.read();await b.act('checkout',{id:'fixed'});await assert.rejects(b.act('checkout',{id:'fixed'}),/AlreadyDelivered/);assert.equal(b.btn[0].clicks,1);
  await assert.rejects(b.fn(plan,{id:'new',taskId:'task',authorized:true,expected:JSON.stringify({...o,phase:'other'}),action:'checkout'}),/Changed/);
});
test('multiple quantity controls, different variant and unlabelled store prose never create full purchase proof',async()=>{
  for(const texts of [[...matching,'iPhone 18 Pro 256GB 黑色'],matching.map(t=>t.startsWith('取货地点')?'附近有 Apple 大连恒隆广场':t),matching.map(t=>t==='数量：1'?'数量：2':t)]){assert.equal((await fixture({texts,buttons:['立即下单']}).read()).purchase.verified,false);}
  const q1=el('数量','SELECT'),q2=el('数量','SELECT');q1.options=[Object.assign(el('1','OPTION'),{selected:true})];q2.options=[Object.assign(el('1','OPTION'),{selected:true})];assert.equal((await fixture({texts:matching,selects:[q1,q2],buttons:['立即下单']}).read()).purchase.verified,false);
});
test('Pro model choice never resolves to Pro Max, even when both are visible',async()=>{
  const p={...plan,product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'}};const f=fixture({url:'https://www.apple.com.cn/shop/buy-iphone/iphone-18-pro',title:'购买 iPhone 18 Pro',radios:[['iPhone 18 Pro',false],['iPhone 18 Pro Max',false],['黑色',true],['256GB RMB 9,999',true]]});const o=await f.fn(p);await f.fn(p,{id:'a',taskId:'t',authorized:true,expected:JSON.stringify(o),action:'configureProduct',choice:'iPhone 18 Pro'});assert.equal(f.rs[0].clicks,1);assert.equal(f.rs[1].clicks,0);
});
test('authentication and processing remain distinct; arbitrary alerts never become verified rejection',async()=>{
  assert.equal((await fixture({auth:true}).read()).phase,'AUTH');assert.equal((await fixture({busy:true}).read()).phase,'PROCESSING');assert.equal((await fixture({texts:['选定时间不可用，请重试'],buttons:['继续填写取货详情']}).read()).feedback,null);
});
test('current public Duo approval/prelaunch text and disabled Continue block actions; footer sales policy is the actual advance-terms link',async()=>{
  const a=el('销售政策','A');a.href='https://www.apple.com.cn/shop/open/salespolicies';const other=el('分期付款条款','A');other.href='https://www.apple.com.cn/shop/browse/finance/terms';
  const f=fixture({url:'https://www.apple.com.cn/shop/buy-iphone/iphone-duo/mk2m4ch/a',texts:['机型将在获得批准后发售'],buttons:['继续'],radios:[['星光白色',true],['256GB RMB 15,999',true]],links:[a,other]});f.btn[0].disabled=true;
  const o=await f.read();assert.equal(o.phase,'PRELAUNCH');assert.deepEqual(Array.from(o.termsLinks),[a.href]);await assert.rejects(f.act('continueProduct'),/NotRecognized/);assert.equal(f.btn[0].clicks,0);
});
test('an unpaid order-list row and list link never masquerade as an independent detail receipt',async()=>{
  const a=el('查看订单详情','A');a.href='https://secure.www.apple.com.cn/shop/order/list/';const f=fixture({url:'https://secure.www.apple.com.cn/shop/order/list',texts:[...matching,'等待付款','订单编号：FIXTURE42'],links:[a]});const o=await f.read();assert.equal(o.phase,'UNKNOWN');assert.equal(o.receiptVerified,false);assert.equal(o.orderDetailLink,null);
});
test('detail values stay out of observation; all labels bind before first write and required invalid fields stop continuation',async()=>{
  const i=new Input('');i.attrs={'aria-label':'身份证件号码最后4位'};const f=fixture({texts:matching,buttons:['继续选择付款方式'],inputs:[i]});await f.act('fillDetails',{privatePickupData:{identitySuffix:'1234'}});assert.equal(i.value,'1234');assert.equal(f.btn[0].clicks,1);assert.equal(JSON.stringify(await f.read()).includes('1234'),false);
  const j=new Input('');j.attrs={'aria-label':'身份证件号码最后4位'};const bad=fixture({texts:matching,buttons:['继续选择付款方式'],inputs:[j]});await assert.rejects(bad.act('fillDetails',{privatePickupData:{identitySuffix:'1234',phone:'13800000000'}}),/ContractUnrecognized/);assert.equal(j.value,'');assert.equal(bad.btn[0].clicks,0);
  const required=new Input('');required.required=true;required.checkValidity=()=>false;const inv=fixture({texts:matching,buttons:['继续选择付款方式'],inputs:[required]});await assert.rejects(inv.act('fillDetails'),/RequireHuman/);assert.equal(inv.btn[0].clicks,0);
});
test('receipt exposes only hashed order identity, independent detail link and current merchant slot fields',async()=>{
  const a=el('查看订单详情','A');a.href='https://secure6.www.apple.com.cn/shop/order/FIXTURE42';const f=fixture({texts:[...matching,'等待付款','订单编号：FIXTURE42','取货日期：10月23日','取货时间：21:15 - 21:30'],links:[a]});const o=await f.read();assert.equal(o.receiptVerified,true);assert.equal(o.orderRefHash.length,64);assert.equal(o.orderRefHash.includes('FIXTURE42'),false);assert.equal(o.slotSummary.date,'10月23日');assert.equal(o.orderDetailLink,a.href);
});
