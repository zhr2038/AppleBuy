// Native API diagnosis with FAKE errors only; no permission request, registry, Chrome or private input.
import test from 'node:test';import assert from 'node:assert/strict';
import {createReadonlyConnection,nativeFailureReason,nativeConnectionText} from '../web/checkout-connector/desktop-link.js';
test('C116 permission failure and unavailable API are distinct without creating any native port',async()=>{
 for(const [contains,expected] of [[async()=>false,'PERMISSION_MISSING'],[async()=>{throw Error('FAKE-secret');},'PERMISSION_CHECK_FAILED'],[async()=>true,'API_UNAVAILABLE']] as const){const api={permissions:{contains},runtime:{}};assert.equal((await createReadonlyConnection(api).connect()).reason,expected);}
});
test('C116 startup failures export only allowlisted codes, never raw error values',async()=>{
 for(const [message,reason] of [['Specified native messaging host not found. FAKE-secret','HOST_NOT_FOUND'],['Access to the specified native messaging host is forbidden.','HOST_FORBIDDEN'],['Failed to start native messaging host.','HOST_START_FAILED'],['Native host has exited.','HOST_EXITED'],['FAKE-secret unrecognized','CONNECT_UNCONFIRMED']]){
  const api={permissions:{async contains(){return true;}},runtime:{connectNative(){throw Error(message);}}};const result=await createReadonlyConnection(api).connect();assert.equal(result.reason,reason);assert.equal(nativeConnectionText(reason).includes('FAKE-secret'),false);
 }
});
test('C116 async disconnect consumes lastError, clears one port and returns an allowlisted status',async()=>{
 let disconnect,message,status='',lastErrorRead=0,connects=0;const api={permissions:{async contains(){return true;}},runtime:{get lastError(){lastErrorRead++;return {message:'Native host has exited. FAKE-secret'};},connectNative(){connects++;return {onMessage:{addListener(fn){message=fn;}},onDisconnect:{addListener(fn){disconnect=fn;}}};}}};
 const link=createReadonlyConnection(api,value=>status=value);assert.equal((await link.connect()).connected,true);assert.equal((await link.connect()).connected,true);assert.equal(connects,1);disconnect();assert.equal(lastErrorRead,1);assert.match(status,/HOST_EXITED/);assert.equal(status.includes('FAKE-secret'),false);assert.equal((await link.connect()).connected,true);assert.equal(connects,2);
});
