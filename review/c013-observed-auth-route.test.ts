// Codex independent regression for the official order-login route observed on October 3.
// DOM/Chrome transport below are synthetic; no credentials, real account or network access.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
import {allowedMerchantUrl,ChromePort} from '../web/checkout-connector/chrome-port.js';
const url='https://secure11.www.apple.com.cn/shop/signIn/orders';
const plan={product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},stores:['Apple 大连恒隆广场'],maxTotalCny:9999};
function page(){
  const context=vm.createContext({location:{href:url},URL,document:{querySelector(){return null;}}});
  return vm.runInContext('('+merchantDocument.toString()+')',context);
}
test('C013 observed official order-login path is allowed; suffixes and lookalike origins stay outside scope',()=>{
  assert.equal(allowedMerchantUrl(url),true);
  for(const wrong of [url+'/extra',url.replace('apple.com.cn','apple.com.cn.example.org'),url.replace('https:','http:'),url.replace('signIn/orders','account/home')])assert.equal(allowedMerchantUrl(wrong),false);
});
test('C013 no-main embedded order-login shape reports AUTH and cannot deliver any mutation',async()=>{
  const fn=page(),o=await fn(plan);assert.equal(o.phase,'AUTH');assert.equal(o.verifiedStep,false);assert.match(o.reason,/sign-in-required/);
  const r=await fn(plan,{id:'fake-op',taskId:'fake-task',authorized:true,structured:true,action:'checkout'});
  assert.equal(r.delivered,false);assert.equal(r.touched,false);assert.equal(r.reason,'AuthenticationRequired');
});
test('C013 ChromePort preserves the observed auth gate and positively untouched action result',async()=>{
  const fn=page(),api={tabs:{async get(){return {url};}},permissions:{async contains(){return true;}},scripting:{async executeScript({args}){return [{frameId:0,documentId:'auth-doc',result:await fn(...args)}];}}};
  const port=new ChromePort(api,7,{authorized:true}),o=await port.observe(plan);assert.equal(o.phase,'AUTH');
  const r=await port.act({documentId:'auth-doc',plan,action:'checkout',id:'fake-op',taskId:'fake-task'});
  assert.deepEqual(r,{delivered:false,touched:false,reason:'AuthenticationRequired'});
});
