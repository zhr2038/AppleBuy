import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { LaunchSession } from '../src/app/launch-session.ts';
import { startServer } from '../src/app/server.ts';
import { parseHtml,observePage } from '../web/launch/observer.js';
import { Tab,openApp,waitFor } from './app-helpers.ts';
import { tempDir } from './helpers.ts';
const plan=JSON.parse(readFileSync('examples/plan.launch.fake.json','utf8'));let tick=Date.now();
function observe(s:LaunchSession,id='pickup-native',source:any='synthetic-sample') {const sample=s.sample(id),o=observePage(parseHtml(sample.html),{observedAt:new Date(++tick).toISOString(),expect:sample.expect});if(sample.syntheticComplete)o.listCompleteness='synthetic-complete';return s.observe(o,source);}
test('viewing an empty replay permits a future-plan edit; saved observations never rebind silently',async()=>{
  const t=tempDir('launch-plan-edit'),app=await openApp(join(t.dir,'task'),{initialPlan:plan});
  try {
    const s=new LaunchSession(app),initial=s.view();assert.equal(initial.blocked,false);assert.match(initial.status.step,/尚未读取页面/);
    assert.ok(app.editPlan({...plan,label:'FAKE revised before observing'}).ok);
    assert.equal(s.view().blocked,false);assert.notEqual(s.view().planHash,initial.planHash);
    assert.ok(observe(s).ok);const file=join(app.store.dir,'launch-monitor.json'),saved=readFileSync(file,'utf8');
    assert.ok(app.editPlan({...plan,label:'FAKE edited after evidence'}).ok);
    assert.equal(s.view().blocked,true);assert.equal(observe(s).ok,false);assert.equal(readFileSync(file,'utf8'),saved);
  }finally{await app.close();t.cleanup();}
});

test('durable replay restart keeps task, initial date set, paused state and terminal evidence',async()=>{
  const t=tempDir('launch-durable'),dir=join(t.dir,'task');let app=await openApp(dir,{initialPlan:plan});
  try {const s=new LaunchSession(app);assert.ok(observe(s).ok);s.pause(true);const old=s.view().state!;await app.close();app=await openApp(dir,{initialPlan:plan});const restored=new LaunchSession(app);assert.equal(restored.view().state?.taskId,old.taskId);assert.deepEqual(restored.view().state?.binding,old.binding);assert.equal(restored.view().state?.paused,true);assert.deepEqual(restored.view().state?.floors,old.floors);assert.ok(observe(restored,'terminal-removed').ok);assert.equal(restored.view().next.kind,'wait');restored.pause(false);assert.ok(observe(restored,'terminal-removed').ok);const n=restored.view().next;if(n.kind==='candidates')assert.equal(n.offers.length,0);else assert.fail();}finally{await app.close();t.cleanup();}
});
test('state rollback, missing evidence and corrupt journal fail closed without overwriting artifacts',async()=>{
  for(const fault of ['rollback','missing','journal']) {
    const t=tempDir(`launch-${fault}`),dir=join(t.dir,'task');let app=await openApp(dir,{initialPlan:plan});
    try {const s=new LaunchSession(app);observe(s);const file=join(dir,'launch-monitor.json'),first=readFileSync(file,'utf8');observe(s,'terminal-removed');await app.close();
      if(fault==='rollback')writeFileSync(file,first);if(fault==='missing')unlinkSync(join(dir,'launch-started.json'));if(fault==='journal')writeFileSync(join(dir,'launch-observations.jsonl'),'malformed');
      const before=readFileSync(file,'utf8');app=await openApp(dir,{initialPlan:plan});const r=new LaunchSession(app);assert.equal(r.view().blocked,true);assert.equal(observe(r).ok,false);assert.equal(readFileSync(file,'utf8'),before);
    }finally{await app.close();t.cleanup();}
  }
});
test('unknown synthetic submission persists after process owner release and never grants candidates',async()=>{
  const t=tempDir('launch-unknown'),dir=join(t.dir,'task');let app=await openApp(dir,{initialPlan:plan});
  try {const s=new LaunchSession(app);observe(s);assert.ok(s.fixturePending().ok);await app.close();app=await openApp(dir,{initialPlan:plan});const r=new LaunchSession(app);assert.equal(r.view().next.kind,'reconcile');assert.ok(observe(r).ok);assert.equal(r.view().next.kind,'reconcile');assert.equal(app.site.view().counts.submitOrder,0);}finally{await app.close();t.cleanup();}
});
test('two service objects cannot silently overwrite a newer observation or terminal floor',async()=>{
  const t=tempDir('launch-writers'),app=await openApp(join(t.dir,'task'),{initialPlan:plan});
  try {const a=new LaunchSession(app);assert.ok(observe(a).ok);const b=new LaunchSession(app);assert.equal(b.view().blocked,false);const file=join(app.store.dir,'launch-monitor.json'),before=readFileSync(file,'utf8');assert.equal(observe(a,'terminal-removed').ok,false);assert.equal(readFileSync(file,'utf8'),before);assert.equal(b.view().state?.floors[0].start,'21:45');}finally{await app.close();t.cleanup();}
});
test('page suggestions cannot bypass the actual existing engine in-flight result',async()=>{
  const t=tempDir('launch-engine-pending'),app=await openApp(join(t.dir,'task'),{hold:['chooseSlot']});
  try {app.start();await waitFor(()=>app.site.heldCount===1,'existing engine mutation held');const s=new LaunchSession(app);assert.ok(observe(s).ok);assert.equal(s.view().externalPending,true);assert.equal(s.view().next.kind,'reconcile');assert.equal(app.site.view().counts.chooseSlot,1);assert.equal(app.site.view().counts.submitOrder,0);app.control('pause');app.site.setHold([]);app.site.releaseHeld();await waitFor(()=>app.state().engine.refusals===1,'late result recorded while paused');assert.equal(app.site.view().counts.chooseSlot,1);}finally{await app.close();t.cleanup();}
});
test('two observer clients retain one controller and token/origin guards; read-only client cannot mutate',async()=>{
  const t=tempDir('launch-browser-lease'),app=await openApp(join(t.dir,'task'),{initialPlan:plan}),server=await startServer(app);
  const a=new Tab(server.port,'c-launchowner123'),b=new Tab(server.port,'c-launchreader123');
  try {await a.load();await a.connect();await b.load();await b.connect();assert.equal((await a.post('/api/claim')).status,200);assert.equal((await b.post('/api/claim')).status,409);const s=new LaunchSession(app),sample=s.sample('pickup-native');const o=observePage(parseHtml(sample.html),{observedAt:new Date(++tick).toISOString(),expect:sample.expect});o.listCompleteness='synthetic-complete';
    assert.equal((await b.post('/api/launch/observe',{source:'synthetic-sample',observation:o})).status,409);assert.equal((await a.post('/api/launch/observe',{source:'synthetic-sample',observation:o},{origin:'https://untrusted.invalid'})).status,403);assert.equal((await a.post('/api/launch/observe',{source:'synthetic-sample',observation:o})).status,200);const state=await b.state();assert.equal(state.control.you,false);assert.equal(state.launch.state.binding.realBindingVerified,false);assert.equal(state.site.counts.submitOrder,0);
    a.disconnect();await waitFor(()=>server.controller()===null,'old document released');assert.equal((await b.post('/api/claim')).status,200);
    const replacement=await b.state();assert.equal(replacement.launch.next.kind,'wait');assert.ok(replacement.launch.state.epoch>state.launch.state.epoch);assert.deepEqual(replacement.launch.state.binding,state.launch.state.binding);assert.deepEqual(replacement.launch.state.floors,state.launch.state.floors);
  }finally{a.disconnect();b.disconnect();await server.close();await app.close();t.cleanup();}
});
