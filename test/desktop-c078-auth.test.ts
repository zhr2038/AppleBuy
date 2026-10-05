// All observations and time are FAKE; this watcher never owns a merchant mutation or authentication credential.
import test from 'node:test';import assert from 'node:assert/strict';import {AuthContinuation} from '../src/desktop/auth-continuation.mjs';
test('C078 auth observation only resumes once from a recognized post-login step',async()=>{
 let phase='AUTH',resumes=0,reads=0;const w=new AuthContinuation({observe:async()=>{reads++;return {phase};},setTimer:()=>1,clearTimer:()=>{}});w.start(async()=>{resumes++;});await w.tick();assert.equal(resumes,0);phase='UNKNOWN';await w.tick();assert.equal(resumes,0);phase='FULFILLMENT';await w.tick();await w.tick();assert.equal(resumes,1);assert.equal(reads,3);
});
test('C078 a late auth observation after Stop cannot resume anything',async()=>{
 let resolve,resumes=0;const w=new AuthContinuation({observe:()=>new Promise(r=>resolve=r),setTimer:()=>1,clearTimer:()=>{}});w.start(async()=>resumes++);const pending=w.tick();w.stop();resolve({phase:'FULFILLMENT'});await pending;assert.equal(resumes,0);
});
test('C078 query failure and expiry stop without calling checkout or claiming login success',async()=>{
 let t=0,resumes=0,why=[];const w=new AuthContinuation({observe:async()=>{throw Error('FAKE query');},now:()=>t,onStopped:r=>why.push(r),setTimer:()=>1,clearTimer:()=>{}});w.start(async()=>resumes++);await w.tick();assert.deepEqual(why,['unconfirmed']);w.start(async()=>resumes++);t=300001;await w.tick();assert.deepEqual(why,['unconfirmed','expired']);assert.equal(resumes,0);
});
