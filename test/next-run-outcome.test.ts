import test from 'node:test';
import assert from 'node:assert/strict';
import { nextRunOutcome,renderStart,renderApp } from '../web/render.js';
import { openApp } from './app-helpers.ts';
import { tempDir } from './helpers.ts';
import { join } from 'node:path';

test('both primary and advanced outcome copy agree with unarmed, armed, expired and changed-plan gates',async()=>{
  const t=tempDir('outcome-truth'),app=await openApp(join(t.dir,'task'));
  try {
    const defaultState=app.state();assert.equal(nextRunOutcome(defaultState).submits,false);assert.match(renderStart(defaultState),/不提交任何订单/);
    assert.ok(app.armFormal(defaultState.plan.planHash,defaultState.formal.phrase).ok);
    const armed=app.state(),expiry=armed.formal.expiresAt!;
    assert.equal(nextRunOutcome(armed,expiry-1).submits,true);assert.match(renderStart(armed),/开始演练（会提交一单模拟订单）/);
    const expired=structuredClone(armed);expired.formal.expiresAt=Date.now()-1;
    assert.equal(nextRunOutcome(expired).submits,false);assert.match(renderStart(expired),/已过期/);assert.match(renderApp(expired),/已过期/);
    assert.doesNotMatch(renderApp(expired),/下一次运行会向本机模拟官网提交一单/);
    assert.ok(app.editPlan({...armed.plan.plan,label:'FAKE next version'}).ok);
    const edited=app.state();assert.equal(nextRunOutcome(edited).submits,false);assert.match(renderStart(edited),/另一个计划版本/);assert.match(renderApp(edited),/另一个计划版本/);
  } finally {await app.close();t.cleanup();}
});
