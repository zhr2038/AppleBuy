// C-015 implementation tests (Claude). FAKE serialized-page fixtures only: order reference, grant, DOM, digest scheduling,
// transport and clicks are synthetic. Nothing here shows that a real Apple action page carries an order reference.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
import {ChromePort} from '../web/checkout-connector/chrome-port.js';

const intent={schema:'applebuy-intent/v1',product:{model:'iPhone Duo',capacity:'256GB',color:'星光白色'},quantity:1,maxTotalCny:15999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{tradeIn:'none',appleCare:'none'}};
const LABEL='FAKEC01542';
class El{
  constructor(text,tag='DIV'){Object.assign(this,{textContent:text,tagName:tag,attrs:{},isConnected:true,parentElement:null,hidden:false,disabled:false,checked:false,labels:[],options:[],clicks:0,selectedIndex:0});}
  getAttribute(k){return this.attrs[k]??null;}hasAttribute(k){return Object.hasOwn(this.attrs,k);}closest(){return null;}
  click(){this.clicks++;}dispatchEvent(e){this.onEvent?.(e);return true;}
  get selectedOptions(){return this.options.filter((_,i)=>i===this.selectedIndex);}checkValidity(){return true;}
}
// FAKE review/payment/bag page with one synthetic order-reference text. `f.mutation` runs inside the awaited digest.
function page(kind='review',{orderLabel=true}={}){
  const f={texts:['iPhone Duo 256GB 星光白色','数量：1','总计：RMB 15,999','取货地点：Apple 大连恒隆广场','店内取货','取货日期：10月23日','取货时间：21:15 - 21:30'],clock:1000,digests:0,mutation:null,mutated:false,busy:false,hasMain:true};
  if(orderLabel)f.texts.push('订单编号：'+LABEL);
  f.location={href:'https://secure6.www.apple.com.cn/shop/checkout'};
  f.pay=Object.assign(new El('支付宝','INPUT'),{checked:true});f.radios=kind==='bag'?[]:[f.pay];
  f.target=new El({review:'立即下单',payment:'继续查看订单',bag:'结账'}[kind],'BUTTON');f.buttons=[f.target];
  f.terms=Object.assign(new El('销售政策','A'),{href:'https://www.apple.com.cn/shop/open/salespolicies'});f.links=[f.terms];
  const title=new El('结账','H1'),main=new El('');
  main.querySelector=s=>s==='h1'?title:s==='[aria-busy="true"]'&&f.busy?new El(''):null;
  main.querySelectorAll=s=>s.startsWith('button')?f.buttons:s.startsWith('input[type="radio"]')?f.radios:s==='h1,h2,h3,p,span,div'?[title,...f.texts.map(t=>new El(t))]:s==='a[href]'?f.links:[];
  const crypto={subtle:{async digest(...a){f.digests++;const m=f.mutation;f.mutation=null;if(m){await Promise.resolve();m(f);f.mutated=true;}return webcrypto.subtle.digest(...a);}}};
  const context=vm.createContext({document:{querySelector:()=>f.hasMain?main:null,querySelectorAll:()=>f.links},location:f.location,URL,TextEncoder,crypto,Date:{now:()=>f.clock},setTimeout,clearTimeout,HTMLInputElement:El,Event:class{},getComputedStyle:()=>({display:'block',visibility:'visible'})});
  f.fn=vm.runInContext('('+merchantDocument.toString()+')',context);f.read=()=>f.fn(intent);f.send=c=>f.fn(intent,c);
  const action={review:'submitOrder',payment:'continuePayment',bag:'checkout'}[kind];
  f.command=async(id='FAKE-'+action)=>({id,taskId:'FAKE-task',planDigest:'FAKE-plan',authorized:true,structured:true,expected:JSON.stringify(await f.read()),action,
    finalGrant:{termsAccepted:true,taskId:'FAKE-task',planDigest:'FAKE-plan',expiry:f.clock+60000,existingOrdersChecked:true,noExtras:true,termsUrl:f.terms.href}});
  return f;
}
const hex=async t=>[...new Uint8Array(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(t)))].map(x=>x.toString(16).padStart(2,'0')).join('');

const drifts={
  price:[f=>{f.texts[2]='总计：RMB 99,999';},'OperationEvidenceChanged'],
  quantity:[f=>{f.texts[1]='数量：2';},'OperationEvidenceChanged'],
  store:[f=>{f.texts[3]='取货地点：Apple 大连百年城';},'OperationEvidenceChanged'],
  fulfillment:[f=>{f.texts[4]='送货上门';},'OperationEvidenceChanged'],
  extras:[f=>{f.texts.push('AppleCare+ 服务计划');},'OperationEvidenceChanged'],
  payment:[f=>{f.pay.checked=false;},'OperationEvidenceChanged'],
  slotTime:[f=>{f.texts[6]='取货时间：09:00 - 09:15';},'OperationEvidenceChanged'],
  termsLink:[f=>{f.links=[];},'OperationEvidenceChanged'],
  controlDisabled:[f=>{f.target.disabled=true;},'OperationEvidenceChanged'],
  busy:[f=>{f.busy=true;},'OperationEvidenceChanged'],
  authRoute:[f=>{f.location.href='https://secure6.www.apple.com.cn/shop/signIn/orders';},'AuthenticationRequired'],
  unsupportedRoute:[f=>{f.location.href='https://secure6.www.apple.com.cn/shop/unrecognized';},'UnsupportedOfficialUrl'],
  mainRemoved:[f=>{f.hasMain=false;},'MainNotFound'],
  finalGrantExpired:[f=>{f.clock+=60000;},'CurrentFinalGrantMissing'],
};

test('C015 drift branch executes: every purchase/route/control/grant drift inside the digest stops the final click untouched',async()=>{
  for(const [name,[drift,reason]] of Object.entries(drifts)){
    const f=page(),cmd=await f.command();f.digests=0;f.mutation=drift;
    const r=await f.send(cmd);
    assert.equal(f.mutated,true,name+': the FAKE drift really ran inside the awaited digest');assert.equal(f.digests,1,name+': hashed once, then decided without another await');
    assert.deepEqual({...r},{delivered:false,touched:false,reason},name);assert.equal(f.target.clicks,0,name);
  }
});

test('C015 adjacent action paths (payment continuation, bag checkout) decide from the re-entered decode',async()=>{
  for(const kind of ['payment','bag'])for(const name of ['price','quantity','store','authRoute']){
    const f=page(kind),cmd=await f.command();f.mutation=drifts[name][0];
    const r=await f.send(cmd);assert.equal(f.mutated,true);assert.deepEqual({...r},{delivered:false,touched:false,reason:drifts[name][1]},kind+' '+name);assert.equal(f.target.clicks,0,kind+' '+name);
  }
  for(const kind of ['review','payment','bag']){
    const f=page(kind),cmd=await f.command();f.digests=0;const r=await f.send(cmd);
    assert.deepEqual({...r},{delivered:true},kind+' positive control');assert.equal(f.target.clicks,1);assert.equal(f.digests,1);
  }
});

test('C015 an already-delivered id stays touched on auth, unsupported, missing-main, changed-reference and changed-evidence paths',async()=>{
  const cases={...drifts,referenceChanged:[f=>{f.texts[7]='订单编号：FAKEC09999';}]};
  for(const name of ['authRoute','unsupportedRoute','mainRemoved','referenceChanged','price','busy']){
    const f=page(),cmd=await f.command('FAKE-delivered');assert.equal((await f.send(cmd)).delivered,true);assert.equal(f.target.clicks,1);
    f.mutation=cases[name][0];const r=await f.send(cmd);
    assert.equal(f.mutated,true,name);assert.deepEqual({...r},{delivered:false,touched:true,reason:'OperationAlreadyDelivered'},name);assert.equal(f.target.clicks,1,name+': never repeated');
  }
});

test('C015 an order reference that changes while it is hashed is not current evidence for reads or actions',async()=>{
  const f=page(),cmd=await f.command('FAKE-new');f.mutation=g=>{g.texts[7]='订单编号：FAKEC09999';};
  assert.deepEqual({...await f.send(cmd)},{delivered:false,touched:false,reason:'OperationEvidenceChanged'});assert.equal(f.target.clicks,0);
  const g=page();g.mutation=h=>{h.texts[7]='订单编号：FAKEC09999';};
  assert.deepEqual({...await g.read()},{schema:'applebuy-merchant-read/v1',phase:'UNKNOWN',reason:'order-reference-changed'});
});

test('C015 observation returns one coherent current decode after the digest, with the hash of the label it shows',async()=>{
  const f=page();f.mutation=g=>{g.texts[2]='总计：RMB 99,999';};
  const o=await f.read();assert.equal(f.mutated,true);assert.equal(o.purchase.totalCny,99999,'post-digest evidence, not the pre-digest snapshot');
  assert.equal(o.orderRefHash,await hex(LABEL));assert.equal(o.phase,'REVIEW');
  const plain=await page().read();assert.equal(plain.orderRefHash,await hex(LABEL));assert.equal(plain.purchase.totalCny,15999);
  const none=await page('review',{orderLabel:false}).read();assert.equal(none.orderRefHash,null);
});

test('C015 transport: drift during the digest is a positively untouched ChromePort report; a delivered id becomes unknown',async()=>{
  const transport=f=>{const api={tabs:{async get(){return {url:f.location.href};}},permissions:{async contains(){return true;}},
    scripting:{async executeScript({func,args,world}){assert.equal(func,merchantDocument);assert.equal(world,'ISOLATED');return [{frameId:0,documentId:'FAKE-doc',result:structuredClone(await f.fn(...args))}];}}};
    return new ChromePort(api,7,{authorized:true});};
  const grant=f=>({termsAccepted:true,taskId:'FAKE-task',planDigest:'FAKE-plan',expiry:f.clock+60000,existingOrdersChecked:true,noExtras:true,termsUrl:f.terms.href});
  const command=f=>({action:'submitOrder',id:'FAKE-final',taskId:'FAKE-task',planDigest:'FAKE-plan',documentId:'FAKE-doc',plan:intent,finalGrant:grant(f)});
  const f=page(),port=transport(f);await port.observe(intent);f.mutation=drifts.price[0];
  assert.deepEqual(await port.act(command(f)),{delivered:false,touched:false,reason:'OperationEvidenceChanged'});assert.equal(f.target.clicks,0);
  const g=page(),p2=transport(g);await p2.observe(intent);assert.deepEqual(await p2.act(command(g)),{delivered:true});assert.equal(g.target.clicks,1);
  g.mutation=drifts.authRoute[0];await assert.rejects(p2.act(command(g)),/MutationResultUnknown/);assert.equal(g.target.clicks,1);
});

// FAKE SLOTS page (as in the C-013-R3 tests) with a hook that fires while the program scans visible text.
function slotsPage(){
  const f={texts:['iPhone Duo 256GB 星光白色','数量：1','总计：RMB 15,999','取货地点：Apple 大连恒隆广场','店内取货'],onScan:null};
  f.button=new El('继续填写取货详情','BUTTON');
  f.radios=[Object.assign(new El('Apple 大连恒隆广场','INPUT'),{checked:true}),Object.assign(new El('10月23日','INPUT'),{checked:true}),new El('10月24日','INPUT')];
  f.time=new El('可选时段','SELECT');f.time.options=['可选时段','09:00 - 09:15','21:15 - 21:30'].map(s=>new El(s,'OPTION'));
  const title=new El('结账','H1'),main=new El('');
  main.querySelector=s=>s==='h1'?title:null;
  main.querySelectorAll=s=>s.startsWith('button')?[f.button]:s.startsWith('input[type="radio"]')?f.radios:s==='select'?[f.time]:s==='h1,h2,h3,p,span,div'?(f.onScan?.(),[title,...f.texts.map(t=>new El(t))]):[];
  const context=vm.createContext({document:{querySelector:()=>main,querySelectorAll:()=>[]},location:{href:'https://secure6.www.apple.com.cn/shop/checkout'},URL,TextEncoder,crypto:webcrypto,Date,setTimeout,clearTimeout,HTMLInputElement:El,Event:class{constructor(t){this.type=t;}},getComputedStyle:()=>({display:'block',visibility:'visible'})});
  f.fn=vm.runInContext('('+merchantDocument.toString()+')',context);
  f.command=async()=>({id:'FAKE-choice',taskId:'FAKE-task',authorized:true,structured:true,expected:JSON.stringify(await f.fn(intent)),action:'chooseSlot',ref:'time:2',date:'10月23日',start:'21:15',end:'21:30'});
  return f;
}

test('C015 slot continuation: page work queued while the current document is decoded cannot run between decode and decision',async()=>{
  // The change handler sets a wrong price (fingerprinted), an earlier zero-delay timer restores it, and a microtask queued
  // during the post-boundary scan would set the wrong price back. The gate must judge the state it decoded, not a later one.
  const f=slotsPage();let scanned=false;
  f.time.onEvent=()=>{f.texts[2]='总计：RMB 99,999';setTimeout(()=>{f.texts[2]='总计：RMB 15,999';f.onScan=()=>{f.onScan=null;scanned=true;Promise.resolve().then(()=>{f.texts[2]='总计：RMB 99,999';});};},0);};
  const r=await f.fn(intent,await f.command());
  assert.equal(scanned,true);assert.equal(f.texts[2],'总计：RMB 99,999','the queued microtask did run, after the decision');
  assert.deepEqual({...r},{delivered:false,touched:true,reason:'SlotEvidenceChangedAfterSelection'});assert.equal(f.button.clicks,0);
  const ok=slotsPage(),r2=await ok.fn(intent,await ok.command());assert.deepEqual({...r2},{delivered:true});assert.equal(ok.button.clicks,1);assert.equal(ok.time.selectedIndex,2);
});
