import test from 'node:test';import assert from 'node:assert/strict';
import {exportDesktopHandoff} from '../web/checkout-connector/desktop-handoff.js';
import {createPurchaseRecord} from '../web/checkout-connector/job.js';
import {PRO_PLAN,proDigest} from '../src/desktop/browser-session.mjs';
test('C072 handoff revokes only local buying and preserves exact unknown Add and prior histories',async()=>{
 let row={...createPurchaseRecord(PRO_PLAN,{taskId:'FAKE-old',planDigest:proDigest,tabId:7,now:0,id:()=> 'FAKE'}),pending:{action:'addBag',id:'FAKE-add',documentId:'FAKE-product',deadline:0},bagAddStarted:true,resourceWritten:true,retiredHistory:[{schema:'applebuy-purchase-job/v1',state:'RETIRED',pending:{action:'chooseSlot'}}]};
 const before=structuredClone(row);let writes=0;const store={async get(){return structuredClone(row);},async put(k,v){row=structuredClone(v);writes++;}};
 const a=await exportDesktopHandoff({store,confirmed:true,id:()=> 'FAKE-handoff',now:()=>10});assert.equal(row.reconcileOnly,true);assert.deepEqual(row.pending,before.pending);assert.deepEqual(row.retiredHistory,before.retiredHistory);assert.deepEqual(row.desktopHandoff.originalSnapshot,before);assert.equal(a.sourceOwnerRevoked,true);
 const b=await exportDesktopHandoff({store,confirmed:true});assert.deepEqual(a,b);assert.equal(writes,1);
});
test('C072 missing confirmation, pause, corrupt state or changed source cannot revoke or export',async()=>{
 let row=createPurchaseRecord(PRO_PLAN,{taskId:'FAKE-old',planDigest:proDigest,tabId:7,now:0,id:()=> 'FAKE'}),writes=0;const store={async get(){return structuredClone(row);},async put(){writes++;}};
 await assert.rejects(exportDesktopHandoff({store,confirmed:false}));await assert.rejects(exportDesktopHandoff({store,confirmed:true,live:()=>false}));row={schema:'FAKE'};await assert.rejects(exportDesktopHandoff({store,confirmed:true}));assert.equal(writes,0);
});
