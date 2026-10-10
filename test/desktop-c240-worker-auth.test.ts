// Actual worker control flow, fake runtime/input/clock only; no native host, files, Chrome or credentials.
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {EventEmitter} from 'node:events';
import {CheckoutRpcPeer} from '../web/checkout-connector/checkout-rpc-peer.js';
import {DesktopCheckoutRuntime} from '../src/desktop/checkout-runtime.mjs';
import {NativeCheckoutApi} from '../src/desktop/native-checkout-api.mjs';
import {OrderAudit,ORDER_LIST} from '../web/checkout-connector/order-audit.js';
import {CHECKOUT_PLAN} from '../web/checkout-connector/checkout-rpc-contract.js';
import {AuthContinuation} from '../src/desktop/auth-continuation.mjs';
import {preSlotReopenShape} from '../src/desktop/cancelled-order-purchase.mjs';
const source=(await readFile(new URL('../src/desktop/native-purchase-worker.mjs',import.meta.url),'utf8')).replace(/import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];?/g,'');
async function world({failAfterLogin=false,preflightUnknown=false,transportLost=false,orderReadUnknown=false,poisonInAudit=false,orderReadHook=null}={}){
 const events=[],watches=[];let input,advanceCount=0,submitCount=0,closed=false;
 const row=preflightUnknown?{pending:{action:'checkout',beforePhase:'BAG'},expiresAt:Date.now()+60000}:{finalIntent:{sent:true},pending:{action:'submitOrder'},expiresAt:Date.now()+60000};
 class Runtime{constructor(){this.api={};this.paused=false;this.finalDescriptor=null;this.cleanupConfirmed=true;}async open(){return{};}async close(){}async orderAudit(){if(orderReadHook)return {orderCheck:await orderReadHook()};if(poisonInAudit){this.api.poisoned=true;throw Error('NativeCheckoutDeliveryUnknown');}return {orderCheck:{state:orderReadUnknown?'unknown':'clear'}};}async advance(){advanceCount++;if(transportLost){this.api.poisoned=true;throw Error('NativeCheckoutDeliveryUnknown');}if(failAfterLogin)throw Error('FAKE read failed');return preflightUnknown?{phase:'UNKNOWN',orderCheck:{state:'unknown'}}:{phase:'ORDER_DETAIL',pendingAction:'submitOrder',readOnly:true,orderCheck:{state:'detail',status:'cancelled'}};}async submit(){submitCount++;return{phase:'AUTH',pendingAction:'submitOrder',orderCheck:{state:'auth'},readOnly:true};}async reconcile(){return{phase:'AUTH',pendingAction:'submitOrder',orderCheck:{state:'auth'},readOnly:true};}}
 class Watch extends AuthContinuation{constructor(opts){super({...opts,setTimer:()=>1,clearTimer:()=>{}});watches.push(this);}}
 const stdin=new EventEmitter();stdin.destroy=()=>{};
 const deps={preSlotReopenShape,createInterface:()=>{input=new EventEmitter();input.close=()=>{closed=true;input.emit('close');};return input;},join:(...x)=>x.join('/'),DesktopCheckoutRuntime:Runtime,DesktopTaskStore:class{async get(){return row;}},AuthContinuation:Watch,launchNativeCheckout:()=>assert.fail('No Chrome'),safeCheckoutDiagnostic:()=>null,stoppedCheckoutDraftSource:()=>false,TASK_KEY:'FAKE',probeCheckoutHostScope:async()=>({}),expiredPaymentSourceShape:()=>false,expiredReviewSourceShape:()=>false,additionalExpiredReviewSourceShape:()=>false,policyExpiredReviewSourceShape:()=>false,process:{argv:['node','FAKE-worker'],cwd:()=>'/FAKE',stdout:{write:text=>events.push(JSON.parse(text))},stdin}};
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const done=new AsyncFunction(...Object.keys(deps),source)(...Object.values(deps));await new Promise(r=>setImmediate(r));
 return {events,watches,isClosed:()=>closed,send:value=>input.listeners('line')[0](JSON.stringify(value)),counts:()=>({advanceCount,submitCount}),close:async()=>{input.close();await done;}};
}
for(const action of ['submit','reconcile'])test('C240 '+action+' auth lookup automatically resumes with no second final',async()=>{const w=await world();try{await w.send({action,termsAccepted:true,existingOrdersChecked:true,noExtras:true});assert.notEqual(w.watches[1].timer,null);await w.watches[1].tick();assert.ok(w.events.some(e=>e.orderCheck?.status==='cancelled'));assert.equal(w.counts().advanceCount,1);assert.equal(w.counts().submitCount,action==='submit'?1:0);}finally{await w.close();}});
test('C240 failed post-login read emits an actionable stop instead of silently waiting forever',async()=>{const w=await world({failAfterLogin:true});try{await w.send({action:'submit'});await w.watches[1].tick();assert.ok(w.events.some(e=>e.type==='blocked'&&e.message.includes('登录后的订单核对未确认')));assert.equal(w.counts().submitCount,1);}finally{await w.close();}});
test('C240 an unconfirmed account preflight does not arm the late-checkout loop',async()=>{const w=await world({preflightUnknown:true});try{await w.send({action:'advance'});assert.ok(w.watches.every(x=>x.timer===null));assert.equal(w.counts().advanceCount,1);}finally{await w.close();}});

test('C242 irrecoverably poisoned transport ends the worker so the GUI can reopen only after owned cleanup',async()=>{const w=await world({transportLost:true});try{await w.send({action:'advance'});assert.equal(w.isClosed(),true);assert.ok(w.events.some(e=>e.type==='blocked'));assert.equal(w.counts().submitCount,0);}finally{await w.close();}});

test('C242 closed or unknown login query stops the watcher without reopening or advancing automatically',async()=>{const w=await world({orderReadUnknown:true});try{await w.send({action:'submit'});await w.watches[1].tick();assert.equal(w.counts().advanceCount,0);assert.equal(w.watches[1].timer,null);assert.ok(w.events.some(e=>e.type==='blocked'));}finally{await w.close();}});
test('C242 poisoned transport during automatic login observation ends the worker without a second final',async()=>{const w=await world({poisonInAudit:true});try{await w.send({action:'submit'});await w.watches[1].tick();assert.equal(w.isClosed(),true);assert.equal(w.counts().submitCount,1);assert.equal(w.counts().advanceCount,0);}finally{await w.close();}});

test('C244 real peer/audit automatic observer respects tab closure between polls; explicit query can reopen',async()=>{
 const removed=new Set();let created=0,focus=0;const raw={permissions:{contains:async()=>true},tabs:{onRemoved:{addListener:f=>removed.add(f),removeListener:f=>removed.delete(f)},create:async()=>({id:6+(++created)}),get:async()=>({url:ORDER_LIST,status:'complete'}),update:async()=>focus++,remove:async()=>{}}};
 const peer=new CheckoutRpcPeer({api:raw,contextId:'FAKE-C244-event-observer'});peer.orderAudit=new OrderAudit(peer,{wait:async()=>{}});peer.orderAudit.read=async()=>({state:'auth'});
 const api=new NativeCheckoutApi({contextId:peer.contextId,exchange:q=>peer.receive(q)});
 const reference='a'.repeat(64);await api.auditOrders(CHECKOUT_PLAN,reference);
 const actualRuntime=new DesktopCheckoutRuntime({ordersEnabled:true,store:{get:async()=>({finalIntent:{sent:true},orderRefHash:reference,pending:{action:'submitOrder'}})},launch:async()=>{throw Error('No launch');}});Object.assign(actualRuntime,{opened:true,api,lease:{owned:true}});
 const w=await world({orderReadHook:async()=>(await actualRuntime.orderAudit()).orderCheck});
 try{await w.send({action:'submit'});for(const f of removed)f(7);await w.watches[1].tick();assert.equal(created,1);assert.equal(focus,1);assert.equal(w.watches[1].timer,null);assert.equal(w.counts().advanceCount,0);assert.equal(w.counts().submitCount,1);assert.equal((await api.auditOrders(CHECKOUT_PLAN,reference,{automatic:false})).state,'auth');assert.equal(created,2);assert.equal(focus,2);}finally{await w.close();peer.dispose();}
});
