import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ChromePort,allowedMerchantUrl} from '../web/checkout-connector/chrome-port.js';
const plan={product:{model:'iPhone Duo',capacity:'256GB',color:'星光白色'},stores:['Apple 大连恒隆广场'],maxTotalCny:15999};
const summary={date:'10月23日',start:'21:15',end:'21:30',verified:true},hash='a'.repeat(64);
function harness(){
  const h={url:'https://www.apple.com.cn/shop/bag',allowed:true,doc:'doc',calls:[],updates:[],raw:{schema:'applebuy-merchant-read/v1',phase:'BAG',purchase:{verified:true},dates:[],times:[]}};
  const api={tabs:{async get(){return {url:h.url};},async update(id,data){h.updates.push(data);h.url=data.url;h.doc='detail';h.raw={...h.raw,phase:'ORDER_DETAIL',slotSummary:summary};}},permissions:{async contains(){return h.allowed;}},scripting:{async executeScript(x){h.calls.push(x);return [{frameId:0,documentId:h.doc,result:x.args.length===1?h.raw:{delivered:true}}];}}};
  return {...h,api,h,port:new ChromePort(api,7,{authorized:true})};
}
test('executor grants are optional, contain no persistent host/content/background/debugger/cookie/network access',()=>{
  const m=JSON.parse(readFileSync(new URL('../web/checkout-connector/manifest.json',import.meta.url),'utf8'));
  assert.deepEqual(m.permissions,['scripting','storage','activeTab']);assert.deepEqual(m.optional_host_permissions,['https://www.apple.com.cn/*','https://*.www.apple.com.cn/*']);
  for(const k of ['host_permissions','background','content_scripts','externally_connectable'])assert.equal(k in m,false);
  assert.match(m.content_security_policy.extension_pages,/connect-src 'none'/);
  const ui=readFileSync(new URL('../web/checkout-connector/control.js',import.meta.url),'utf8');assert.match(ui,/withPurchaseOwner\(navigator\.locks/);assert.match(ui,/storage\.session/);assert.doesNotMatch(ui,/storage\.local\.remove|\.clear\(/);
});
test('only current mainland public/bag/checkout/order routes are eligible; deceptive hosts and unrelated account pages are rejected',()=>{
  for(const u of ['https://www.apple.com.cn/shop/buy-iphone/iphone-duo/mk2m4ch/a','https://secure6.www.apple.com.cn/shop/checkout','https://secure.www.apple.com.cn/shop/order/fixture','https://www.apple.com.cn/shop/order/fixture'])assert.equal(allowedMerchantUrl(u),true);
  for(const u of ['http://www.apple.com.cn/shop/bag','https://www.apple.com.cn.bad.example/shop/bag','https://idmsa.apple.com/','https://www.apple.com.cn/account','https://www.apple.com.cn/shop/buy-iphone/iphone-18-pro-max','https://www.apple.com.cn/shop/payment'])assert.equal(allowedMerchantUrl(u),false);
});
test('no granted current origin means no script injection; authorization defaults false',async()=>{
  const {h,port,api}=harness();h.allowed=false;await assert.rejects(port.observe(plan),/Permission/);assert.equal(h.calls.length,0);h.allowed=true;const p=new ChromePort(api,7);await p.observe(plan);await assert.rejects(p.act({documentId:'doc',plan,action:'checkout'}),/Authorized/);assert.equal(h.calls.length,1);
});
test('commands target exact observed documentId and ISOLATED world; changed reply document means unknown',async()=>{
  const {h,port}=harness();await port.observe(plan);await port.act({documentId:'doc',plan,action:'checkout',id:'action',taskId:'task'});assert.deepEqual(h.calls[1].target,{tabId:7,documentIds:['doc']});assert.equal(h.calls[1].world,'ISOLATED');
  await assert.rejects(port.act({documentId:'old',plan,action:'checkout'}),/Authorized/);h.doc='new';await assert.rejects(port.act({documentId:'doc',plan,action:'checkout'}),/Unknown/);
});
test('resume sequence and accepted slot reconciliation preserve the recorded pending selection',async()=>{
  const {h,api}=harness();h.raw={...h.raw,phase:'DETAILS',verifiedStep:true};const p=new ChromePort(api,7,{initialSequence:12,pending:{action:'chooseSlot',...summary,generation:7}});const o=await p.observe(plan);assert.equal(o.seq,13);assert.equal(o.acceptedSlot.date,summary.date);assert.match(o.acceptedSlot.basis,/not a hold/);
});
test('private pickup data enters only detail action arguments, never observation or other mutation',async()=>{
  const {h,api}=harness();const p=new ChromePort(api,7,{authorized:true,privatePickupData:{identitySuffix:'1234'}});await p.observe(plan);assert.equal(JSON.stringify(h.calls).includes('1234'),false);
  await p.act({documentId:'doc',plan,action:'checkout'});assert.equal(JSON.stringify(h.calls[1]).includes('1234'),false);
  await p.act({documentId:'doc',plan,action:'fillDetails'});assert.equal(h.calls[2].args[1].privatePickupData.identitySuffix,'1234');
});
test('independent unpaid lookup uses receipt-observed official link then requires merchant-displayed slot and exact hash',async()=>{
  const {h,port}=harness();h.raw={...h.raw,phase:'ORDER_RECEIPT',receiptVerified:true,orderRefHash:hash,orderDetailLink:'https://www.apple.com.cn/shop/order/fixture'};port.wait=async()=>{};
  const result=await port.lookupOrder(plan,hash);assert.equal(result.independent,true);assert.deepEqual(result.acceptedSlot,summary);assert.equal(h.updates.length,1);
  h.raw.slotSummary=null;assert.equal((await port.lookupOrder(plan,hash)).independent,false);
  h.raw.slotSummary=summary;assert.equal((await port.lookupOrder(plan,'b'.repeat(64))).independent,false);
});
test('unknown receipt, ungranted detail origin and missing link cannot reconstruct a lookup URL',async()=>{
  const {h,port}=harness();h.raw={...h.raw,phase:'ORDER_RECEIPT',receiptVerified:true,orderRefHash:hash};assert.equal((await port.lookupOrder(plan,hash)).independent,false);assert.equal(h.updates.length,0);
});
