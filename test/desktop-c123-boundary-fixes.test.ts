// Independent reproductions of C122 F1/F2, FAKE Chrome only.
import test from 'node:test';import assert from 'node:assert/strict';
import {CheckoutRpcPeer} from '../web/checkout-connector/checkout-rpc-peer.js';
import {CHECKOUT_PLAN,CHECKOUT_RPC,BAG,ENTRY} from '../web/checkout-connector/checkout-rpc-contract.js';
function fixture(){let actions=0,closed=0;const page={schema:'applebuy-merchant-read/v1',phase:'VARIANT',verifiedStep:true,path:'/shop/buy-iphone/iphone-18-pro',purchase:null};const api={permissions:{async contains(){return true;}},tabs:{async create(){return {id:7,status:'complete'};},async get(){return {id:7,url:ENTRY,status:'complete'};},async remove(){closed++;}},scripting:{async executeScript(q){if(q.args.length===2)actions++;return [{frameId:0,documentId:'FAKE-current',result:q.args.length===2?{delivered:true}:page}];}}};const peer=new CheckoutRpcPeer({api,contextId:'FAKE-C123-native-context',purchaseAllowed:true});let seq=0;const send=(operation,payload)=>peer.receive({schema:CHECKOUT_RPC,kind:'request',contextId:peer.contextId,id:'FAKE-request-'+seq++,operation,payload});return {peer,page,send,get actions(){return actions;},get closed(){return closed;}};}
test('C123 second distinct action cannot reuse a dispatched snapshot, but succeeds after a fresh read',async()=>{
 const f=fixture();await f.send('createTab',{url:BAG});const read=()=>f.send('merchantDocument',{tabId:7,plan:CHECKOUT_PLAN});await read();
 const cmd=id=>f.send('merchantDocument',{tabId:7,documentId:'FAKE-current',plan:CHECKOUT_PLAN,command:{action:'configureProduct',choice:'iPhone 18 Pro',id,taskId:'FAKE-one-task',documentId:'FAKE-current',authorized:true,structured:true,expected:JSON.stringify(f.page),plan:CHECKOUT_PLAN}});
 assert.equal((await cmd('FAKE-a')).ok,true);assert.equal((await cmd('FAKE-b')).ok,false);assert.equal(f.actions,1);await read();assert.equal((await cmd('FAKE-b')).ok,true);assert.equal(f.actions,2);
});
test('C123 a fresh close request remains allowed after 5000 requests, with owned tab cleanup',async()=>{
 const f=fixture();await f.send('createTab',{url:BAG});for(let n=0;n<4999;n++)assert.equal((await f.send('getTab',{tabId:7})).ok,true);assert.equal(f.peer.requests.size,5000);assert.equal((await f.send('getTab',{tabId:7})).ok,false);const close=await f.send('closeSession',{});assert.equal(close.ok,true);assert.equal(close.result.closed,true);assert.equal(f.closed,1);assert.equal(f.peer.tabs.size,0);
});
