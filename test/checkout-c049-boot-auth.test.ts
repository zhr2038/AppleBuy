// C049 Root quota self-check: actual code, FAKE boot storage/DOM and official-route inputs; no personal Chrome/credentials/network.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
import {TASK_KEY} from '../web/checkout-connector/job.js';
const source=readFileSync(new URL('../web/checkout-connector/control.js',import.meta.url),'utf8').replace(/^import .*;\r?$/gm,'');
async function boot({row={state:'NEEDS_USER',plan:{product:{model:'iPhone 18 Pro'}},tabId:7},held=false}={}){
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,textContent:'',disabled:false,href:''});return nodes.get(id);};node('product').value='duo';
 let release,entered;const wait=new Promise(r=>release=r),reached=new Promise(r=>entered=r);const stats={localReads:0,writes:0,privateReads:0,merchant:0};
 const chrome={storage:{local:{get:async k=>{assert.equal(k,TASK_KEY);stats.localReads++;entered();if(held)await wait;return {[k]:structuredClone(row)};},set:async()=>{stats.writes++;}},session:{get:async()=>{stats.privateReads++;},set:async()=>{stats.writes++;}}}};
 const ctx=vm.createContext({document:{getElementById:node},chrome,TASK_KEY});const run=vm.runInContext('(async()=>{'+source+'\n})()',ctx);await reached;
 return {node,run,release,stats};
}
test('C049 active Pro target initializes on reload with no authority/private/task write',async()=>{
 const h=await boot();await h.run;assert.equal(h.node('product').value,'pro');assert.match(h.node('state').textContent,/C049 自提适配已加载/);assert.deepEqual(h.stats,{localReads:1,writes:0,privateReads:0,merchant:0});assert.equal(h.node('approve').checked,false);assert.equal(h.node('finalReview').checked,false);
});
test('C049 retired Pro task does not choose the next product',async()=>{const h=await boot({row:{state:'RETIRED',plan:{product:{model:'iPhone 18 Pro'}},tabId:7}});await h.run;assert.equal(h.node('product').value,'duo');assert.equal(h.stats.writes,0);});
for(const event of ['oninput','onchange','onpointerdown'])test('C049 human '+event+' during boot is not overridden by stored target',async()=>{
 const h=await boot({held:true});h.node('product')[event]();h.release();await h.run;assert.equal(h.node('product').value,'duo');assert.equal(h.stats.writes+h.stats.privateReads+h.stats.merchant,0);
});
for(const path of ['/shop/signIn','/shop/signIn/','/shop/signIn/orders'])test('C049 '+path+' needs AUTH without reading authentication DOM',async()=>{
 let domReads=0;const ctx=vm.createContext({URL,location:{href:'https://secure8.www.apple.com.cn'+path},document:{querySelector(){domReads++;throw Error('Private authentication DOM must not be read');}}});
 const f=vm.runInContext('('+merchantDocument.toString()+')',ctx),r=await f({product:{model:'iPhone 18 Pro'}});assert.equal(r.phase,'AUTH');assert.equal(domReads,0);assert.equal(r.verifiedStep,false);
});
for(const sent of [false,true])test('C049 AUTH preserves '+(sent?'already delivered':'never delivered')+' command truth without click',async()=>{
 const ctx=vm.createContext({URL,location:{href:'https://secure8.www.apple.com.cn/shop/signIn'},__applebuyExecuted:new Set(sent?['FAKE-id']:[]),document:{querySelector(){throw Error('No auth DOM');}}});
 const f=vm.runInContext('('+merchantDocument.toString()+')',ctx),r=await f({},{id:'FAKE-id',structured:true,authorized:true});assert.equal(r.delivered,false);assert.equal(r.touched,sent);assert.equal(r.reason,sent?'OperationAlreadyDelivered':'AuthenticationRequired');
});
