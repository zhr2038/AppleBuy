// Real NativeCheckoutApi/CheckoutRpcPeer/ChromePort with FAKE Chrome API; no personal browser or merchant.
import test from 'node:test';import assert from 'node:assert/strict';
import {world} from './fixtures/c121-native-world.mjs';import {ChromePort} from '../web/checkout-connector/chrome-port.js';import {PRO_PLAN} from '../src/desktop/browser-session.mjs';
import {BAG,checkoutCommand} from '../web/checkout-connector/checkout-rpc-contract.js';import {CHECKOUT_EXECUTOR_VERSION} from '../web/checkout-connector/page-program.js';
test('C199 read-only executor identity is the loaded module version, with no tab or permission mutation',async()=>{const f=world({purchaseAllowed:false});assert.equal(await f.api.executorVersion(),CHECKOUT_EXECUTOR_VERSION);assert.equal(f.w.tabs.size,0);assert.deepEqual(f.w.commands,[]);await f.api.close();});
test('C199 expiry GET creates only an owned inactive official checkout tab and never sends a Checkout command',async()=>{const f=world();const p=await f.api.createExpiryProbe('https://secure7.www.apple.com.cn/shop/checkout');assert.equal(f.w.tabs.size,1);assert.equal((await f.api.tabs.get(p.id)).url,'https://secure7.www.apple.com.cn/shop/checkout');assert.deepEqual(f.w.commands,[]);await f.api.tabs.remove(p.id);await f.api.close();});
test('C199 readonly connection and arbitrary/query/credential-bearing addresses cannot create expiry probes',async()=>{
 const no=world({purchaseAllowed:false});await assert.rejects(no.api.createExpiryProbe('https://secure7.www.apple.com.cn/shop/checkout'));assert.equal(no.w.tabs.size,0);await no.api.close();
 for(const url of ['https://example.invalid/shop/checkout','https://secure7.www.apple.com.cn/shop/checkout?FAKE=secret','https://FAKE:FAKE@secure7.www.apple.com.cn/shop/checkout','https://secure7.www.apple.com.cn/shop/bag','http://secure7.www.apple.com.cn/shop/checkout']){const f=world();await assert.rejects(f.api.createExpiryProbe(url));assert.equal(f.w.tabs.size,0);assert.deepEqual(f.w.commands,[]);await f.api.close();}
});
test('C199 payment-only read and action cross the actual narrow native allowlists and preserve expected document/one action',async()=>{
 const f=world(),tab=await f.api.create(BAG),execute=f.chrome.scripting.executeScript;f.w.phase='PAYMENT';
 f.chrome.scripting.executeScript=async q=>{const rows=await execute(q);if(!q.args[1]){const o=rows[0].result;o.purchase={model:null,capacity:null,color:null,quantity:null,store:null,fulfillment:null,totalCny:9999,verified:false,itemVerified:false};o.extras=null;o.paymentStep={kind:'native-alipay-payment-only',verified:true,totalCny:9999};}return rows;};
 const port=new ChromePort(f.api,tab.id,{mode:'purchase',authorized:true});const o=await port.observe(PRO_PLAN);assert.equal(o.paymentStep.verified,true);assert.equal(o.purchase.verified,false);
 await port.act({action:'selectPayment',paymentOnly:true,id:'FAKE-payment-command',taskId:'FAKE-current-task',planDigest:'FAKE',documentId:o.documentId,plan:PRO_PLAN});assert.deepEqual(f.w.commands,['selectPayment']);assert.equal(f.w.payment,'支付宝');await f.api.close();
});
test('C199 payment-only flags cannot broaden another action or carry untyped data',()=>{
 const base={id:'FAKE-command',taskId:'FAKE-task',documentId:'FAKE-document',expected:'{}',authorized:true,structured:true};
 for(const [action,paymentOnly]of [['checkout',true],['submitOrder',true],['selectPayment','true'],['continuePayment',1]])assert.throws(()=>checkoutCommand({...base,action,paymentOnly},PRO_PLAN),/NativePaymentStepNotAllowed/);
});
