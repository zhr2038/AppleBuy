// Controlled model: an order-list authentication can invalidate an active checkout.
// This reproduces unnecessary lookups in actual Runtime code, NOT a claim about Apple's cookie implementation.
import assert from 'node:assert/strict';
import {cancelledWorld} from './fixtures/c250-cancelled-world.mjs';
import {DesktopCheckoutRuntime} from '../src/desktop/checkout-runtime.mjs';
const f=await cancelledWorld();let queries=0,checkoutStarted=false;
const execute=f.api.scripting.executeScript,get=f.api.tabs.get;
f.api.auditOrders=async()=>{queries++;if(checkoutStarted){f.w.phase='UNKNOWN';f.w.invalidated=true;}return {state:'clear',authenticated:true,accountHash:'b'.repeat(64),matchingCount:2};};
f.api.tabs.get=async id=>f.w.invalidated&&id===7?{id,status:'complete',url:'https://www.apple.com.cn/shop/sorry/session_expired'}:get(id);
f.api.scripting.executeScript=async q=>{const rows=await execute(q);if(q.args[1]?.action==='checkout'){checkoutStarted=true;f.w.phase='AUTH';}if(!q.args[1]&&f.w.invalidated)Object.assign(rows[0].result,{phase:'UNKNOWN',verifiedStep:false,path:'/shop/sorry/session_expired',merchantError:'session-expired'});return rows;};
f.api.tabs.remove=async()=>{};
const runtime=new DesktopCheckoutRuntime({store:f.store,ordersEnabled:true,launch:async()=>({api:f.api,close:async()=>{}})});
try{
 await runtime.open();const first=await runtime.newPurchase({approved:true,originalOrderAssociated:true,expectedRefHash:'a'.repeat(64)});assert.equal(first.phase,'AUTH');
 f.w.phase='FULFILLMENT';const after=await runtime.advance({checkoutApproved:true,newContextConfirmed:true});
 console.log(JSON.stringify({fixture:'FAKE-auth-interaction',phase:after.phase,accountLookups:queries,checkouts:f.w.commands.filter(x=>x==='checkout').length,finals:f.w.commands.filter(x=>x==='submitOrder').length}));
 assert.equal(after.phase,'REVIEW');assert.equal(queries,1);assert.equal(f.w.commands.filter(x=>x==='checkout').length,1);assert.equal(f.w.commands.filter(x=>x==='submitOrder').length,0);
}finally{await runtime.close();}
