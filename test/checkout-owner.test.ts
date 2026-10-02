import test from 'node:test';
import assert from 'node:assert/strict';
import {withPurchaseOwner} from '../web/checkout-connector/owner.js';
test('two control pages contending through the real Web Locks API cannot advance concurrently',async()=>{
  let release,started;const ready=new Promise(r=>{started=r;}),hold=new Promise(r=>{release=r;});let sends=0;
  const first=withPurchaseOwner(navigator.locks,async()=>{sends++;started();await hold;return 'first';});await ready;
  const second=await withPurchaseOwner(navigator.locks,async()=>{sends++;return 'second';});assert.equal(second.owned,false);assert.equal(sends,1);
  release();assert.deepEqual(await first,{owned:true,result:'first'});assert.equal((await withPurchaseOwner(navigator.locks,async()=> 'next')).owned,true);
});
test('missing exclusive owner is a blocker, never a fallback to unlocked execution',async()=>{let sent=false;await assert.rejects(withPurchaseOwner(null,async()=>{sent=true;}),/Unavailable/);assert.equal(sent,false);});
