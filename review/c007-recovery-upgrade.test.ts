// Independent reviewer criteria: upgrades cannot enlarge unknown legacy scope; malformed recovery cannot write.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {LaunchMonitor} from '../src/launch.ts';
import {LaunchSession} from '../src/app/launch-session.ts';
import {planHash,canonicalJson} from '../src/plan.ts';
import {parseHtml,observePage} from '../web/launch/observer.js';
import {replaySample} from '../web/launch/replay-samples.js';
import {openApp} from '../test/app-helpers.ts';
import {tempDir} from '../test/helpers.ts';
const plan=JSON.parse(readFileSync('examples/plan.launch.fake.json','utf8'));let tick=Date.now();
function read(sample:any) {const o=observePage(parseHtml(sample.html),{observedAt:new Date(++tick).toISOString(),expect:sample.expect});if(sample.syntheticComplete)o.listCompleteness='synthetic-complete';return o;}
test('R1 upgrade: legacy evidence without a binding cannot authorize a later first-three set',()=>{
  const options={taskId:'task-c007legacy',plan,planHash:planHash(plan),relativeDates:3},m=new LaunchMonitor(options);
  const first=read(replaySample('pickup-native',plan));first.dates=[{...first.dates[0],date:'2098-12-31',label:'2098-12-31',selected:false},...first.dates];
  m.ingest(first,new Date().toISOString(),'synthetic-sample');
  // Exactly the legacy v2 shape: it had observed a complete unbindable list, but did not save a scope.
  const legacy=JSON.parse(m.toJSON());delete legacy.scope;legacy.schema='applebuy-launch-monitor/v2';
  const restored=LaunchMonitor.restore(JSON.stringify(legacy),options);
  const later=read(replaySample('fourth-date',plan));later.dates=later.dates.filter(d=>d.date!=='2099-01-01');
  restored.ingest(later,new Date().toISOString(),'synthetic-sample');
  assert.notEqual(restored.next().kind,'candidates','an upgrade cannot invent permission that legacy evidence cannot establish');
});
test('R1 recovery: a malformed self-consistent intent must block BEFORE writing any evidence',async()=>{
  const t=tempDir('c007-invalid-redo'),dir=join(t.dir,'task');let app=await openApp(dir,{initialPlan:plan});
  try {
    const s=new LaunchSession(app,{crashAfter:'intent'});assert.equal(s.observe(read(s.sample('pickup-native')),'synthetic-sample').ok,false);
    const file=join(dir,'launch-commit.json'),intent=JSON.parse(readFileSync(file,'utf8'));
    intent.state.stage='UNRECOGNIZED_INVALID_STAGE';intent.hash=createHash('sha256').update(canonicalJson(intent.state)).digest('hex');
    writeFileSync(file,JSON.stringify(intent));const before=readFileSync(file,'utf8');
    await app.close();app=await openApp(dir,{initialPlan:plan});const restored=new LaunchSession(app);
    assert.equal(restored.view().blocked,true);
    assert.equal(readFileSync(file,'utf8'),before,'invalid recovery payload must not become a committed receipt');
    for(const name of ['launch-started.json','launch-observations.jsonl','launch-monitor.json'])assert.equal(existsSync(join(dir,name)),false,'invalid recovery payload must not create artifacts');
  }finally{await app.close();t.cleanup();}
});
for(const point of ['intent','marker','journal','state'] as const) test(`R1 ordinary first-save crash after ${point} retains scope and recovers with stale refs invalid`,async()=>{
  const t=tempDir(`c007-crash-${point}`),dir=join(t.dir,'task');let app=await openApp(dir,{initialPlan:plan});
  try {const s=new LaunchSession(app,{crashAfter:point});assert.equal(s.observe(read(s.sample('pickup-native')),'synthetic-sample').ok,false);await app.close();app=await openApp(dir,{initialPlan:plan});const restored=new LaunchSession(app),view=restored.view();assert.equal(view.blocked,false);assert.deepEqual(view.state?.binding?.dates,plan.dates.slice(0,3));assert.equal(view.next.kind,'wait');assert.equal(app.site.view().counts.submitOrder,0);}finally{await app.close();t.cleanup();}
});
for(const point of ['intent','journal','state'] as const) test(`R1 restart-save crash after ${point} preserves unknown submission without action`,async()=>{
  const t=tempDir(`c007-pending-${point}`),dir=join(t.dir,'task');let app=await openApp(dir,{initialPlan:plan});
  try {const s=new LaunchSession(app);assert.ok(s.observe(read(s.sample('pickup-native')),'synthetic-sample').ok);assert.ok(s.fixturePending().ok);await app.close();app=await openApp(dir,{initialPlan:plan});assert.equal(new LaunchSession(app,{crashAfter:point}).view().blocked,true);await app.close();app=await openApp(dir,{initialPlan:plan});const restored=new LaunchSession(app);assert.equal(restored.view().blocked,false);assert.equal(restored.view().next.kind,'reconcile');assert.equal(restored.view().state?.pending?.status,'unknown');assert.equal(app.site.view().counts.submitOrder,0);}finally{await app.close();t.cleanup();}
});
