import test from 'node:test';import assert from 'node:assert/strict';
import {runDesktopSession,PRO_PLAN,proDigest} from '../src/desktop/browser-session.mjs';import {createPurchaseRecord} from '../web/checkout-connector/job.js';
const retired=()=>({...createPurchaseRecord(PRO_PLAN,{taskId:'FAKE-retired',planDigest:proDigest,tabId:99,now:0,id:()=> 'FAKE'}),state:'RETIRED'});
for(const [name,history] of [['unknown final',[{schema:'applebuy-purchase-job/v1',state:'RETIRED',pending:{action:'submitOrder'},finalIntent:{id:'FAKE-final',sent:true}}]],['nested snapshot',[{schema:'applebuy-purchase-job/v1',state:'RETIRED',desktopHandoff:{originalSnapshot:{finalIntent:{id:'FAKE-final',sent:false}}}}]],['prior reference',[{schema:'applebuy-purchase-job/v1',state:'RETIRED',orderRefHash:'FAKE-ref'}]],['final historical event',[{schema:'applebuy-purchase-job/v1',state:'RETIRED',history:[{event:'final-not-dispatched'}]}]]])test('C074 '+name+' blocks a new buyer before any browser read or record write',async()=>{
 const row={...retired(),retiredHistory:history};let reads=0,writes=0;const store={async acquireOwner(){return {owned:true,release:async()=>{}};},async get(){return structuredClone(row);},async put(){writes++;}};
 const api={sessionId:'FAKE-new',tabs:{async get(){reads++;throw Error('No browser may run');}}};
 await assert.rejects(runDesktopSession({api,tabId:7,store,mode:'purchase',authority:{checkoutApproved:true,legacyOwnershipRevoked:true,newContextConfirmed:true,planDigest:proDigest}}),/LegacyFinalHistoryUnconfirmed/);assert.equal(reads,0);assert.equal(writes,0);
});
test('C074 cyclic history cannot establish absence of an old final',async()=>{
 const row=retired(),history=[];history.push({schema:'applebuy-purchase-job/v1',state:'RETIRED',retiredHistory:history});row.retiredHistory=history;
 const store={async acquireOwner(){return {owned:true,release:async()=>{}};},async get(){return structuredClone(row);},async put(){throw Error('No write allowed');}};
 await assert.rejects(runDesktopSession({api:{sessionId:'FAKE'},tabId:7,store,mode:'purchase',authority:{}}),/LegacyFinalHistoryUnconfirmed/);
});
