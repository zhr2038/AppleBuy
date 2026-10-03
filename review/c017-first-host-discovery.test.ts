// Codex independent C017 startup regression. Actual control.js, synthetic DOM/Chrome only.
// The fake Tab.url omission models documented Chrome permissions; this is not native API evidence.
// No real page, permission grant, script injection, navigation, account or merchant action occurs.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {TASK_KEY,VALIDATION_KEY,NO_EXTRAS,retirable} from '../web/checkout-connector/job.js';
import {allowedMerchantUrl} from '../web/checkout-connector/chrome-port.js';
import {withPurchaseOwner} from '../web/checkout-connector/owner.js';

const origin='https://www.apple.com.cn/*';
const proUrl='https://www.apple.com.cn/shop/buy-iphone/iphone-18-pro/mjt74ch/a';

async function control({grant='allow',visibleUrl=null,selected=''}={}){
  const nodes=new Map(),requests=[],queries=[],mutations=[];
  const html=readFileSync(new URL('../web/checkout-connector/control.html',import.meta.url),'utf8');
  const defaults=new Map([...html.matchAll(/<select\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)].map(m=>[m[1],m[2].match(/<option\b[^>]*value="([^"]*)"/)?.[1]??'']));
  const node=id=>{
    if(!nodes.has(id))nodes.set(id,{value:defaults.get(id)??'',checked:false,disabled:id==='final',href:'',textContent:'',children:[],
      replaceChildren(...children){this.children=children;this.value=children.length?String(children[0].value):'';},
      addEventListener(kind,handler){if(kind==='click')this.onclick=handler;}});
    return nodes.get(id);
  };
  for(const m of html.matchAll(/\bid="([^"]+)"/g))node(m[1]);
  node('product').value='pro';node('tab').value=selected;
  const h={nodes,requests,queries,mutations,granted:false,directGesture:false};
  const chrome={
    tabs:{
      async query(q){queries.push(structuredClone(q));return [{id:7,...(visibleUrl||h.granted?{url:visibleUrl??proUrl}:{})},{id:23}];},
      async get(id){if(id!==7)throw Error('FAKE missing selected tab');return {id:7,...(visibleUrl||h.granted?{url:visibleUrl??proUrl}:{})};},
      async create(){mutations.push('navigation');throw Error('FAKE unexpected navigation');},
      async update(){mutations.push('navigation');throw Error('FAKE unexpected navigation');}
    },
    permissions:{
      request(p){requests.push({request:structuredClone(p),directGesture:h.directGesture});if(grant==='error')return Promise.reject(Error('FAKE permission request failure'));h.granted=grant==='allow';return Promise.resolve(h.granted);},
      async contains(p){return h.granted&&p.origins?.every(o=>o===origin);}
    },
    scripting:{async executeScript(){mutations.push('script');throw Error('FAKE unexpected script injection');}},
    storage:{local:{async get(){return {};},async set(){mutations.push('local-write');}},session:{async get(){return {};},async set(){mutations.push('private-write');}}}
  };
  class JobFacade{constructor(){mutations.push('job');}async run(){mutations.push('run');}}
  const context=vm.createContext({document:{getElementById:node,createElement(){return {value:'',textContent:''};}},chrome,navigator:{locks:{async request(name,opts,fn){return fn({});}}},crypto:webcrypto,TextEncoder,Date,URL,structuredClone,PurchaseJob:JobFacade,ChromePort:class{},allowedMerchantUrl,withPurchaseOwner,TASK_KEY,VALIDATION_KEY,NO_EXTRAS,retirable});
  const source=readFileSync(new URL('../web/checkout-connector/control.js',import.meta.url),'utf8').replace(/^import .*;\r?$/gm,'');
  await vm.runInContext('(async()=>{'+source+'\n})()',context);
  h.click=async id=>{h.directGesture=true;let result;try{result=node(id).onclick();}finally{h.directGesture=false;}await result;};
  h.state=()=>node('state').textContent;
  return h;
}
function noExecution(h){assert.deepEqual(h.mutations,[]);assert.equal(h.nodes.get('approve').checked,false);assert.equal(h.nodes.get('finalReview').checked,false);}

test('C017 no host access: Find does not grant access or execute, and opaque tabs stay undisclosed',async()=>{
  const h=await control();await h.click('find');
  assert.equal(h.nodes.get('tab').children.length,0);assert.equal(h.requests.length,0);noExecution(h);
});
test('C017 first host: explicit permission click works with opaque Tab.url and no selected merchant tab',async()=>{
  const h=await control();await h.click('find');await h.click('permission');
  assert.equal(h.requests.length,1,'the first official host must be requestable before its tabs disclose URLs');
  assert.deepEqual(h.requests[0].request,{origins:[origin]},'no tabs permission, wildcard origin or other host');
  assert.equal(h.requests[0].directGesture,true,'bootstrap request is made in the explicit click, not an automatic continuation');
  await h.click('find');
  assert.deepEqual(h.nodes.get('tab').children.map(o=>String(o.value)),['7']);noExecution(h);
});
test('C017 first host denial: one user-requested prompt, visible denial, no execution or automatic repeat',async()=>{
  const h=await control({grant:'deny'});await h.click('find');await h.click('permission');
  assert.equal(h.requests.length,1);assert.deepEqual(h.requests[0].request,{origins:[origin]});
  assert.match(h.state(),/未允许|未授权|未授予|拒绝/);
  await h.click('find');assert.equal(h.requests.length,1);assert.equal(h.nodes.get('tab').children.length,0);noExecution(h);
});
test('C017 first host request error: caught and visible, cannot arm checkout or call the page',async()=>{
  const h=await control({grant:'error'});await h.click('find');await assert.doesNotReject(h.click('permission'));
  assert.equal(h.requests.length,1);assert.deepEqual(h.requests[0].request,{origins:[origin]});assert.match(h.state(),/未完成|不可用|失败/);noExecution(h);
});
test('C017 known selected secure host: only that exact merchant origin is requested; permissions do not execute',async()=>{
  const h=await control({visibleUrl:'https://secure11.www.apple.com.cn/shop/checkout',selected:'7'});await h.click('permission');
  assert.equal(h.requests.length,1);assert.deepEqual(h.requests[0].request,{origins:['https://secure11.www.apple.com.cn/*']});noExecution(h);
});
test('C017 unsupported selected page: never request arbitrary access or execute its content',async()=>{
  const h=await control({visibleUrl:'https://example.invalid/FAKE-private-page',selected:'7'});await h.click('permission');
  assert.equal(h.requests.length,0);noExecution(h);
});
