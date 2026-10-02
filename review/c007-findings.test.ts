// Independent Codex regression criteria for Claude's C-007 cross-review findings.
// These are synthetic fixtures and local files only; no merchant access or resource mutations.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LaunchSession } from '../src/app/launch-session.ts';
import { LaunchMonitor } from '../src/launch.ts';
import { planHash } from '../src/plan.ts';
import { parseHtml, observePage } from '../web/launch/observer.js';
import { replaySample } from '../web/launch/replay-samples.js';
import { openApp } from '../test/app-helpers.ts';
import { tempDir } from '../test/helpers.ts';

const plan = JSON.parse(readFileSync('examples/plan.launch.fake.json', 'utf8'));
let tick = Date.now();
function fromSample(sample:any) {
  const o = observePage(parseHtml(sample.html), { observedAt:new Date(++tick).toISOString(), expect:sample.expect });
  if (sample.syntheticComplete) o.listCompleteness = 'synthetic-complete';
  return o;
}
function validObservation(s:LaunchSession) { return s.observe(fromSample(s.sample('pickup-native')), 'synthetic-sample'); }
async function localSession(name:string, check:(s:LaunchSession, app:any)=>void) {
  const t=tempDir(name), app=await openApp(join(t.dir, 'task'), {initialPlan:plan});
  try {check(new LaunchSession(app), app);} finally {await app.close();t.cleanup();}
}
test('F1 invalid import rejects without writing or poisoning the next valid observation', async()=>{
  await localSession('c007-invalid-then-valid', (s,app)=>{
    assert.ok(validObservation(s).ok);
    const file=join(app.store.dir,'launch-monitor.json'), before=readFileSync(file,'utf8');
    const invalid={...fromSample(s.sample('pickup-native')), unexpected:'synthetic extra field'};
    assert.equal(s.observe(invalid,'imported-observation').ok,false);
    assert.equal(readFileSync(file,'utf8'),before);
    assert.ok(validObservation(s).ok,'a normal rejected input must not corrupt a valid task');
    assert.equal(s.view().blocked,false);
  });
});
test('F1 duplicate stale input rejects without disabling future observations', async()=>{
  await localSession('c007-stale-then-valid', s=>{
    const o=fromSample(s.sample('pickup-native'));
    assert.ok(s.observe(o,'synthetic-sample').ok);
    assert.equal(s.observe(o,'synthetic-sample').ok,false);
    assert.ok(validObservation(s).ok);
  });
});
test('F1 duplicate pending fixture retains unknown truth but accepts later safe observation', async()=>{
  await localSession('c007-double-pending', s=>{
    assert.ok(validObservation(s).ok);
    assert.ok(s.fixturePending().ok);
    assert.equal(s.fixturePending().ok,false);
    assert.ok(validObservation(s).ok);
    assert.equal(s.view().next.kind,'reconcile');
  });
});
test('F1b future timestamp rejects before writing and cannot poison this session', async()=>{
  await localSession('c007-future-timestamp', (s,app)=>{
    assert.ok(validObservation(s).ok);
    const file=join(app.store.dir,'launch-monitor.json'), before=readFileSync(file,'utf8');
    const o={...fromSample(s.sample('pickup-native')),observedAt:'2099-01-01T00:00:00.000Z'};
    assert.equal(s.observe(o,'imported-observation').ok,false,'future observation must not become durable lastObservedAt');
    assert.equal(readFileSync(file,'utf8'),before);
    assert.ok(validObservation(s).ok);
  });
});

const productPlan={...plan,maxTotalCny:9999,products:[{...plan.products[0],model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'}]};
function productObservation(edit:(html:string)=>string) {
  const sample=replaySample('pickup-native',productPlan);
  sample.html=edit(sample.html);
  return fromSample(sample);
}
for (const [name, edit] of [
  ['Pro Max', (h:string)=>h.replaceAll('iPhone 18 Pro','iPhone 18 Pro Max')],
  ['extended colour', (h:string)=>h.replaceAll('黑色','深空黑色')],
] as const) test(`F2 exact product conditions reject ${name} variant`, ()=>{
  assert.notEqual(productObservation(edit).conditions?.product.status,'verified');
});
test('F2 an allowed store mentioned in prose cannot validate a different selected store', ()=>{
  const o=productObservation(h=>h.replace('</body>', '<select aria-label="取货地点"><option selected>FAKE 未授权门店乙</option></select></body>'));
  assert.notEqual(o.conditions?.store.status,'verified');
});
test('F2 monthly installment is not the tax-inclusive total', ()=>{
  const o=productObservation(h=>h.replace(/RMB\s*9999/g,'RMB 416/月'));
  assert.notEqual(o.conditions?.price.status,'verified');
});
test('F4 first complete eligible date scope never rolls forward when it was not bindable', ()=>{
  const m=new LaunchMonitor({taskId:'task-c007firstscope',plan,planHash:planHash(plan),relativeDates:3});
  const first=fromSample(replaySample('pickup-native',plan));
  first.dates=[{...first.dates[0],date:'2098-12-31',label:'2098-12-31',selected:false},...first.dates];
  m.ingest(first,new Date().toISOString(),'synthetic-sample');
  assert.notEqual(m.next().kind,'candidates');
  const later=fromSample(replaySample('fourth-date',plan));
  later.dates=later.dates.filter(d=>d.date!=='2099-01-01');
  m.ingest(later,new Date().toISOString(),'synthetic-sample');
  assert.notEqual(m.next().kind,'candidates','the old fourth date cannot be newly authorized by a refresh');
  const restored=LaunchMonitor.restore(m.toJSON(),{taskId:'task-c007firstscope',plan,planHash:planHash(plan),relativeDates:3});
  const afterRestart={...later,observedAt:new Date(++tick).toISOString()};
  restored.ingest(afterRestart,new Date().toISOString(),'synthetic-sample');
  assert.notEqual(restored.next().kind,'candidates');
});
