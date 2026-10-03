// C-017 implementation tests (Claude): first-use public-host request and post-grant discovery.
// Actual control.js/control.html/manifest.json with a synthetic DOM and fake Chrome only. Tab.url omission without host
// access models the documented Chrome behavior; it is not native API, real grant or installed-permission evidence.
// No real page, permission, script injection, navigation, account or merchant action occurs.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {TASK_KEY,VALIDATION_KEY,NO_EXTRAS,retirable} from '../web/checkout-connector/job.js';
import {allowedMerchantUrl} from '../web/checkout-connector/chrome-port.js';
import {withPurchaseOwner} from '../web/checkout-connector/owner.js';

const PUBLIC='https://www.apple.com.cn/*';
const pro='https://www.apple.com.cn/shop/buy-iphone/iphone-18-pro/mjt74ch/a';
const secure='https://secure11.www.apple.com.cn/shop/checkout';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const html=read('../web/checkout-connector/control.html');
const manifest=JSON.parse(read('../web/checkout-connector/manifest.json'));

// tabs: {id,url,visible}. A URL is disclosed only when `visible` (e.g. another grant) or after the public-host grant for
// www.apple.com.cn; otherwise the fake returns the tab without url, like Chrome without host/tabs access.
async function control({grants=['allow'],tabs=[{id:7,url:pro},{id:23}],selected=''}={}){
  const nodes=new Map(),requests=[],calls=[],mutations=[];
  const defaults=new Map([...html.matchAll(/<select\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)].map(m=>[m[1],m[2].match(/<option\b[^>]*value="([^"]*)"/)?.[1]??'']));
  const node=id=>{
    if(!nodes.has(id))nodes.set(id,{value:defaults.get(id)??'',checked:false,disabled:id==='final',href:'',textContent:'',children:[],
      replaceChildren(...children){this.children=children;this.value=children.length?String(children[0].value):'';},
      addEventListener(kind,handler){if(kind==='click')this.onclick=handler;}});
    return nodes.get(id);
  };
  for(const m of html.matchAll(/\bid="([^"]+)"/g))node(m[1]);
  node('product').value='pro';node('tab').value=selected;
  const h={nodes,requests,calls,mutations,granted:false,directGesture:false};
  const shown=t=>t.url&&(t.visible||(h.granted&&new URL(t.url).hostname==='www.apple.com.cn'))?{id:t.id,url:t.url}:{id:t.id};
  const chrome={
    tabs:{
      async query(q){calls.push('query');return tabs.map(shown);},
      async get(id){calls.push('get');const t=tabs.find(x=>x.id===id);if(!t)throw Error('FAKE missing selected tab');return shown(t);},
      async create(){mutations.push('navigation');throw Error('FAKE unexpected navigation');},
      async update(){mutations.push('navigation');throw Error('FAKE unexpected navigation');}
    },
    permissions:{
      request(p){calls.push('request');requests.push({request:structuredClone(p),directGesture:h.directGesture});const g=grants[requests.length-1]??'deny';
        if(g==='throw')throw Error('FAKE synchronous request failure');if(g==='error')return Promise.reject(Error('FAKE permission request failure'));
        if(g==='allow'&&p.origins?.includes(PUBLIC))h.granted=true;return Promise.resolve(g==='allow');},
      async contains(p){calls.push('contains');return h.granted&&p.origins?.every(o=>o===PUBLIC);}
    },
    scripting:{async executeScript(){mutations.push('script');throw Error('FAKE unexpected script injection');}},
    storage:{local:{async get(){return {};},async set(){mutations.push('local-write');},async remove(){mutations.push('local-remove');}},
      session:{async get(){return {};},async set(){mutations.push('private-write');}}}
  };
  class JobFacade{constructor(){mutations.push('job');}async run(){mutations.push('run');}}
  const context=vm.createContext({document:{getElementById:node,createElement(){return {value:'',textContent:''};}},chrome,navigator:{locks:{async request(name,opts,fn){mutations.push('lock');return fn({});}}},crypto:webcrypto,TextEncoder,Date,URL,structuredClone,PurchaseJob:JobFacade,ChromePort:class{constructor(){mutations.push('port');}},allowedMerchantUrl,withPurchaseOwner,TASK_KEY,VALIDATION_KEY,NO_EXTRAS,retirable});
  const source=read('../web/checkout-connector/control.js').replace(/^import .*;\r?$/gm,'');
  await vm.runInContext('(async()=>{'+source+'\n})()',context);
  // Gesture is true only during the synchronous part of the handler, as with a real click activation.
  h.click=async id=>{h.directGesture=true;let result;try{result=node(id).onclick();}finally{h.directGesture=false;}await result;};
  h.settle=()=>new Promise(r=>setTimeout(r,5));
  h.state=()=>node('state').textContent;
  h.options=()=>node('tab').children.map(o=>String(o.value));
  return h;
}
function noExecution(h){
  assert.deepEqual(h.mutations,[],'no job, run, lock, port, storage write, page script or navigation');
  assert.equal(h.nodes.get('approve').checked,false);assert.equal(h.nodes.get('finalReview').checked,false);assert.equal(h.nodes.get('final').disabled,true);
}

test('C017 impl: opening the control page and Find never request permission',async()=>{
  const h=await control();assert.deepEqual(h.calls,[],'page load makes no Chrome tab/permission call');
  await h.click('find');await h.click('find');await h.settle();
  assert.equal(h.requests.length,0);assert.deepEqual(h.options(),[]);assert.match(h.state(),/允许读取和操作官网主机/,'empty discovery points to the explicit permission button');noExecution(h);
});

test('C017 impl: first-use request is the first synchronous call of the click and asks only the declared public origin',async()=>{
  const h=await control();await h.click('permission');
  assert.deepEqual(h.calls,['request'],'no tabs.get/query or other await precedes the request');
  assert.deepEqual(h.requests,[{request:{origins:[PUBLIC]},directGesture:true}]);
  assert.ok(manifest.optional_host_permissions.includes(PUBLIC),'requested origin is declared');
  assert.deepEqual(manifest.permissions,['scripting','storage','activeTab'],'declarations unchanged; no tabs permission');
  assert.match(h.state(),/已允许/);assert.match(h.state(),/读取当前官网标签页/);assert.doesNotMatch(h.state(),/开始购买|已开始/);noExecution(h);
});

test('C017 impl: after allowance only supported official tabs are listed; opaque, unrelated and unsupported tabs stay hidden',async()=>{
  const unsupported='https://www.apple.com.cn/shop/account/home';assert.equal(allowedMerchantUrl(unsupported),false);
  const h=await control({tabs:[{id:7,url:pro},{id:8,url:unsupported},{id:9,url:'https://example.invalid/FAKE-private-page',visible:true},{id:11,url:secure},{id:23}]});
  await h.click('find');assert.deepEqual(h.options(),[]);
  await h.click('permission');await h.click('find');
  assert.deepEqual(h.options(),['7'],'secure tab stays opaque because no secure host was requested');
  assert.equal(h.nodes.get('tab').children[0].textContent,'www.apple.com.cn · 标签页 7','option shows host and tab id only, no path');
  assert.equal(h.requests.length,1);noExecution(h);
});

test('C017 impl: the public-host grant never triggers a secure-host request; a selected readable secure tab asks only its exact origin',async()=>{
  const h=await control({tabs:[{id:7,url:pro},{id:11,url:secure,visible:true}],grants:['allow','allow']});
  await h.click('permission');await h.click('find');await h.settle();
  assert.deepEqual(h.requests.map(r=>r.request),[{origins:[PUBLIC]}],'no secure host requested because the public host was consented');
  h.nodes.get('tab').value='11';await h.click('permission');
  assert.deepEqual(h.requests.map(r=>r.request),[{origins:[PUBLIC]},{origins:['https://secure11.www.apple.com.cn/*']}]);noExecution(h);
});

test('C017 impl: a selected readable www tab keeps the existing exact-origin path',async()=>{
  const h=await control({tabs:[{id:7,url:pro,visible:true}],selected:'7'});await h.click('permission');
  assert.deepEqual(h.calls,['get','request']);assert.deepEqual(h.requests.map(r=>r.request),[{origins:[PUBLIC]}]);noExecution(h);
});

test('C017 impl: denial is visible, never repeats by itself, and only another explicit click asks again',async()=>{
  const h=await control({grants:['deny','deny']});await h.click('permission');await h.settle();
  assert.match(h.state(),/未允许/);assert.match(h.state(),/未执行任何操作/);
  await h.click('find');await h.settle();assert.equal(h.requests.length,1);assert.deepEqual(h.options(),[]);
  await h.click('permission');
  assert.deepEqual(h.requests,[{request:{origins:[PUBLIC]},directGesture:true},{request:{origins:[PUBLIC]},directGesture:true}]);noExecution(h);
});

test('C017 impl: synchronous and asynchronous request failures are caught, visible and bounded',async()=>{
  for(const g of ['throw','error']){
    const h=await control({grants:[g]});await assert.doesNotReject(h.click('permission'));await h.settle();
    assert.equal(h.requests.length,1);assert.deepEqual(h.requests[0].request,{origins:[PUBLIC]});assert.match(h.state(),/未完成/);noExecution(h);
  }
});

test('C017 impl: a vanished or unsupported selected tab requests nothing',async()=>{
  for(const [tabs,selected] of [[[],'7'],[[{id:7,url:'https://www.apple.com.cn/shop/account/home',visible:true}],'7']]){
    const h=await control({tabs,selected});await assert.doesNotReject(h.click('permission'));
    assert.equal(h.requests.length,0);assert.match(h.state(),/不可用/);noExecution(h);
  }
});

test('C017 impl: control.html keeps every existing control id exactly once',()=>{
  const ids=['product','find','tab','permission','prepare','firstName','lastName','phone','email','identitySuffix','savePrivate','approve','terms','finalReview','start','pause','resume','stop','final','observe','validate','retire','rebindConfirm','rebind','state'];
  const found=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual([...found].sort(),[...ids].sort());assert.match(html,/<button id="final" disabled>/);
});
