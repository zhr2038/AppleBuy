// FAKE Chrome APIs, no browser/extension installation/account/network.
import test from 'node:test';import assert from 'node:assert/strict';
import {createReadonlyConnection} from '../web/checkout-connector/desktop-link.js';
import {observeExistingChromeBag,readonlyRequest,readonlyUrl} from '../web/checkout-connector/desktop-readonly.js';
const request={schema:'applebuy-chrome-readonly/v1',operation:'observe-bag',nonce:'a'.repeat(32)};
function fixture({phase='EMPTY_BAG',url='https://www.apple.com.cn/shop/bag',permission=true,close=true,changing=false}={}){
 const calls=[],state={reads:0};const api={permissions:{async contains(){return permission;}},tabs:{async create(arg){calls.push(['create',arg]);return {id:7};},async get(){return {url,status:'complete'};},async remove(id){calls.push(['remove',id]);if(!close)throw Error('FAKE close unknown');}},scripting:{async executeScript(q){calls.push(['read',q.args.length]);state.reads++;assert.equal(q.world,'ISOLATED');assert.deepEqual(q.target.frameIds,[0]);assert.equal(q.args.length,1);return [{frameId:0,documentId:changing?'FAKE-'+state.reads:'FAKE-current',result:{schema:'applebuy-merchant-read/v1',phase,verifiedStep:true,purchase:null,extras:null,rawPrivate:'FAKE-secret-not-exported'}}];}}};return {calls,api,state};
}
test('C111 native transport structurally refuses mutation/code/profile/extra arguments before any tab creation',async()=>{
 for(const bad of [{...request,operation:'submitOrder'},{...request,args:['FAKE-code']},{...request,cookies:'FAKE-private'},{...request,nonce:'wrong'}]){const f=fixture();await assert.rejects(observeExistingChromeBag(f.api,bad,{wait:async()=>{}}),/NotAllowed/);assert.deepEqual(f.calls,[]);}
});
test('C111 actual normal-profile tab API reads a settled bag twice, closes only that owned tab, exports no raw payload',async()=>{
 const f=fixture(),out=await observeExistingChromeBag(f.api,request,{wait:async()=>{}});assert.equal(out.phase,'EMPTY_BAG');assert.equal(out.tabClosed,true);assert.equal(out.mutationCount,0);assert.equal(f.state.reads,2);assert.deepEqual(f.calls[0],['create',{url:'https://www.apple.com.cn/shop/bag',active:false}]);assert.deepEqual(f.calls.at(-1),['remove',7]);assert.equal(JSON.stringify(out).includes('FAKE-secret'),false);
});
test('C111 absent host permission does not ask permission or create a tab',async()=>{
 const f=fixture({permission:false}),out=await observeExistingChromeBag(f.api,request,{wait:async()=>{}});assert.equal(out.phase,'UNKNOWN');assert.deepEqual(f.calls,[]);
});
test('C111 auth remains AUTH and a lost close makes any empty response UNKNOWN',async()=>{
 const f=fixture({phase:'AUTH'});assert.equal((await observeExistingChromeBag(f.api,request,{wait:async()=>{}})).phase,'AUTH');const bad=fixture({close:false});const result=await observeExistingChromeBag(bad.api,request,{wait:async()=>{}});assert.equal(result.phase,'UNKNOWN');assert.equal(result.tabClosed,false);
});
test('C111 replaced documents cannot constitute a stable bag proof',async()=>{
 const f=fixture({changing:true});const result=await observeExistingChromeBag(f.api,request,{wait:async()=>{}});assert.equal(result.phase,'UNKNOWN');assert.equal(f.state.reads,30);assert.equal(result.tabClosed,true);
});
test('C111 an unverified empty-bag label cannot be reported as an empty account bag',async()=>{
 const f=fixture(),read=f.api.scripting.executeScript;f.api.scripting.executeScript=async q=>{const rows=await read(q);rows[0].result.verifiedStep=false;return rows;};const result=await observeExistingChromeBag(f.api,request,{wait:async()=>{}});assert.equal(result.phase,'UNKNOWN');assert.equal(result.tabClosed,true);
});
test('C111 current unsupported page is not injected, and credentials/internals/non-HTTPS URLs are forbidden',async()=>{
 for(const url of ['chrome-extension://FAKE/control.html','https://www.apple.com.cn/shop/checkout','https://www.apple.com.cn.evil.invalid/shop/bag','https://FAKE:FAKE@www.apple.com.cn/shop/bag','http://www.apple.com.cn/shop/bag'])assert.equal(readonlyUrl(url),false);
 const f=fixture({url:'https://www.apple.com.cn/shop/checkout'});const result=await observeExistingChromeBag(f.api,request,{wait:async()=>{}});assert.equal(result.phase,'UNKNOWN');assert.equal(f.state.reads,0);
});
test('C111 native connection requires optional permission and does not create a second port',async()=>{
 let allowed=false,connects=0;const fake={runtime:{connectNative(){connects++;return {onMessage:{addListener(){}},onDisconnect:{addListener(){}}};}},permissions:{async contains(){return allowed;}}};
 const link=createReadonlyConnection(fake);assert.equal((await link.connect()).connected,false);assert.equal(connects,0);allowed=true;assert.equal((await link.connect()).connected,true);assert.equal((await link.connect()).connected,true);assert.equal(connects,1);
});
