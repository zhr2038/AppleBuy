import test from 'node:test';import assert from 'node:assert/strict';
import {validCheckoutRegistration} from '../src/desktop/native-checkout-channel.mjs';
import {DesktopCheckoutRuntime} from '../src/desktop/checkout-runtime.mjs';import {createPurchaseRecord} from '../web/checkout-connector/job.js';import {PRO_PLAN,proDigest} from '../src/desktop/browser-session.mjs';
test('C127 only distinct checkout registration passes, never old readonly scope or wildcard origin',()=>{
 assert.equal(validCheckoutRegistration({hostName:'com.applebuy.checkout',extensionId:'a'.repeat(32)}),true);for(const value of [null,{}, {hostName:'com.applebuy.readonly',extensionId:'a'.repeat(32)},{hostName:'com.applebuy.checkout',extensionId:'*'}])assert.equal(validCheckoutRegistration(value),false);
});
test('C127 launch preflight failure releases the held owner and preserves the entire unknown source without a browser',async()=>{
 const row={...createPurchaseRecord(PRO_PLAN,{taskId:'FAKE-source',planDigest:proDigest,tabId:99,now:0,id:()=> 'FAKE'}),reconcileOnly:true,pending:{action:'addBag',id:'FAKE-unknown',documentId:'FAKE-old',deadline:0}};let releases=0,writes=0;
 const store={async get(){return structuredClone(row);},async put(){writes++;},async acquireOwner(){return {owned:true,release:async()=>releases++};}};
 const runtime=new DesktopCheckoutRuntime({store,launch:async()=>{throw Error('NativeCheckoutRegistrationRequired');}});await assert.rejects(runtime.open(),/RegistrationRequired/);assert.equal(releases,1);assert.equal(writes,0);assert.equal(runtime.cleanupConfirmed,true);assert.deepEqual(await store.get(),row);
});
