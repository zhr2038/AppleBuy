import test from 'node:test';import assert from 'node:assert/strict';
import {createReadonlyConnection} from '../web/checkout-connector/desktop-link.js';
import {createDesktopBridge} from '../web/checkout-connector/desktop-bridge.js';
test('C118 overlapping connects share one attempt before the first await',async()=>{
 let connects=0,permissionCalls=0;const fake={permissions:{async contains(){permissionCalls++;await Promise.resolve();return true;}},runtime:{connectNative(){connects++;return {onMessage:{addListener(){}},onDisconnect:{addListener(){}}};}}};
 const link=createReadonlyConnection(fake),results=await Promise.all([link.connect(),link.connect(),link.connect()]);assert.equal(connects,1);assert.equal(permissionCalls,1);assert.ok(results.every(r=>r.connected===true));
});
test('C118 trusted bridge double-click requests permission and creates only one port',async()=>{
 let requests=0,connects=0,status='';const button={disabled:false};let allow;
 const api={permissions:{request(){requests++;return new Promise(r=>allow=r);},async contains(){return true;}},runtime:{getURL(){return 'chrome-extension://FAKE/desktop-bridge.html';},connectNative(){connects++;return {onMessage:{addListener(){}},onDisconnect:{addListener(){}}};}}};
 const click=createDesktopBridge(api,{button,setStatus:v=>status=v,currentUrl:()=>api.runtime.getURL()});
 const first=click({isTrusted:true}),second=click({isTrusted:true});assert.equal(button.disabled,true);assert.equal(requests,1);allow(true);await Promise.all([first,second]);assert.equal(connects,1);assert.equal(button.disabled,false);assert.match(status,/本机连接已申请/);
});
test('C118 untrusted or wrong-page click has no permission effect; request failure is a specific safe code',async()=>{
 let requests=0,status='';const button={disabled:false};const api={permissions:{async request(){requests++;throw Error('FAKE-private');}},runtime:{getURL(){return 'chrome-extension://FAKE/desktop-bridge.html';}}};
 const click=createDesktopBridge(api,{button,setStatus:v=>status=v,currentUrl:()=>api.runtime.getURL()});await click({isTrusted:false});assert.equal(requests,0);await click({isTrusted:true});assert.match(status,/PERMISSION_REQUEST_FAILED/);assert.equal(status.includes('FAKE-private'),false);assert.equal(button.disabled,false);
 const wrong=createDesktopBridge(api,{button,setStatus:v=>status=v,currentUrl:()=> 'https://FAKE.invalid/'});await wrong({isTrusted:true});assert.equal(requests,1);
});
test('C118 stale disconnect consumes lastError without overwriting a replacement connection status',async()=>{
 let callbacks=[],reads=0,status='';const api={permissions:{async contains(){return true;}},runtime:{get lastError(){reads++;return {message:'Native host has exited.'};},connectNative(){return {onMessage:{addListener(){}},onDisconnect:{addListener(fn){callbacks.push(fn);}}};}}};
 const link=createReadonlyConnection(api,v=>status=v);await link.connect();callbacks[0]();assert.match(status,/可能已完成/);await link.connect();const current=status;callbacks[0]();assert.equal(reads,2);assert.equal(status,current);
});
test('C118 disconnect during an issued read blocks reconnect until cleanup and never publishes a stale reply',async()=>{
 let handler,disconnect,release,entered,connects=0,posts=0,removed=0;const gate=new Promise(r=>release=r),seenRead=new Promise(r=>entered=r);
 const row=[{frameId:0,documentId:'FAKE-current',result:{schema:'applebuy-merchant-read/v1',phase:'EMPTY_BAG',verifiedStep:true}}];
 const api={permissions:{async contains(){return true;}},tabs:{async create(){return {id:7};},async get(){return {url:'https://www.apple.com.cn/shop/bag',status:'complete'};},async remove(id){assert.equal(id,7);removed++;}},scripting:{async executeScript(){entered();await gate;return row;}},runtime:{lastError:{message:'Native host has exited.'},connectNative(){connects++;return {onMessage:{addListener(fn){handler=fn;}},onDisconnect:{addListener(fn){disconnect=fn;}},postMessage(){posts++;}};}}};
 const link=createReadonlyConnection(api);await link.connect();const reading=handler({schema:'applebuy-chrome-readonly/v1',operation:'observe-bag',nonce:'a'.repeat(32)});await seenRead;disconnect();assert.equal((await link.connect()).reason,'READ_IN_FLIGHT');assert.equal(connects,1);release();await reading;assert.equal(removed,1);assert.equal(posts,0);await link.connect();assert.equal(connects,2);
});
