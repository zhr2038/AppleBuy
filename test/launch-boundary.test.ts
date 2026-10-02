import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LaunchMonitor,validateObservation } from '../src/launch.ts';
import { planHash } from '../src/plan.ts';
import { parseDateLabel,parseHtml,observePage,classifyTransport } from '../web/launch/observer.js';
import { replaySample } from '../web/launch/replay-samples.js';
import { timeRanges } from '../web/launch/samples.js';
const plan=JSON.parse(readFileSync('examples/plan.launch.fake.json','utf8'));
const options={taskId:'task-launchtest',plan,planHash:planHash(plan),relativeDates:3};
let tick=Date.now();
function observation(id:string,edit?:(s:any)=>void) {
  const s=replaySample(id,plan);if(edit)edit(s);
  let o=observePage(parseHtml(s.html),{observedAt:new Date(++tick).toISOString(),expect:s.expect});
  if(s.transport)o={...o,...classifyTransport(s.transport)};
  if(s.syntheticComplete)o.listCompleteness='synthetic-complete';return o;
}
function ingest(m:LaunchMonitor,id:string,edit?:(s:any)=>void,source:any='synthetic-sample') {return m.ingest(observation(id,edit),new Date().toISOString(),source);}
test('maintenance, partial and changed-layout recovery invalidate every old reference',()=>{
  const m=new LaunchMonitor(options),first=ingest(m,'pickup-native');assert.equal(first.kind,'candidates');
  if(first.kind!=='candidates')return;const r={epoch:first.epoch,obsSeq:first.obsSeq,ref:first.offers[0].ref};assert.equal(m.refValid(r),true);
  for(const id of ['maintenance','partial','entry-reordered']){ingest(m,id);assert.equal(m.refValid(r),false);assert.equal(m.mayInitiateFrom(r.epoch),false);}
  const fresh=ingest(m,'pickup-reordered');assert.equal(fresh.kind,'candidates');assert.equal(m.refValid(r),false);assert.deepEqual(m.state.binding?.dates,plan.dates.slice(0,3));
});
test('native radios, changed semantic controls and source ordering yield the same allowed terminal',()=>{
  for(const id of ['pickup-native','pickup-input-radios','pickup-reordered']){const n=ingest(new LaunchMonitor(options),id);assert.equal(n.kind,'candidates');if(n.kind==='candidates')assert.deepEqual(n.offers.map(x=>[x.date,x.start,x.end]),[['2099-01-01','21:45','22:00']]);}
});
test('terminal disappearance before any send never permits an earlier sibling, also after restart',()=>{
  const m=new LaunchMonitor(options);ingest(m,'pickup-native');const restored=LaunchMonitor.restore(m.toJSON(),options);
  const n=ingest(restored,'terminal-removed');assert.equal(n.kind,'candidates');if(n.kind==='candidates')assert.equal(n.offers.length,0);assert.equal(restored.mayInitiateFrom(restored.state.epoch),false);
  const later=ingest(restored,'pickup-native');if(later.kind==='candidates')assert.equal(later.offers.length,1);else assert.fail();
});
test('initial first-three date set survives reordering/restart and never rolls to a fourth',()=>{
  const m=new LaunchMonitor(options);ingest(m,'pickup-reordered');const before=m.state.binding;
  const restored=LaunchMonitor.restore(m.toJSON(),options);assert.deepEqual(restored.state.binding,before);
  assert.equal(ingest(restored,'fourth-date').kind,'wait');assert.deepEqual(restored.state.binding?.dates,plan.dates.slice(0,3));
  // A three-date purchasing plan must not turn the fixture labelled fourth date into its third date.
  const three={...plan,dates:plan.dates.slice(0,3)},m3=new LaunchMonitor({...options,plan:three,planHash:planHash(three)});
  const first=replaySample('pickup-native',three),fourth=replaySample('fourth-date',three);
  const read=(s:any)=>({...observePage(parseHtml(s.html),{observedAt:new Date(++tick).toISOString(),expect:s.expect}),listCompleteness:'synthetic-complete' as const});
  m3.ingest(read(first),new Date().toISOString(),'synthetic-sample');
  const o4=read(fourth);assert.equal(o4.selectedDate,'2099-01-04');
  assert.equal(m3.ingest(o4,new Date().toISOString(),'synthetic-sample').kind,'wait');assert.deepEqual(m3.state.binding?.dates,three.dates);
});
test('list completeness claims from imports cannot create a binding or recommendation',()=>{
  const m=new LaunchMonitor(options);assert.equal(ingest(m,'pickup-native',undefined,'imported-observation').kind,'handoff');assert.equal(m.state.binding,null);
});
test('missing year, unchecked pickup, quantity two and excessive price all stop recommendations',()=>{
  for(const id of ['year-missing','unselected-pickup'])assert.equal(ingest(new LaunchMonitor(options),id).kind,'handoff');
  for(const [a,b] of [['数量: 1','数量: 2'],['RMB 15999','RMB 16999']]){const m=new LaunchMonitor(options);assert.equal(ingest(m,'pickup-native',s=>s.html=s.html.replace(a,b)).kind,'handoff');assert.equal(m.state.binding,null);}
});
test('disabled terminal and inherited disabled select cannot permit earlier offers',()=>{
  const m=new LaunchMonitor(options);const n=ingest(m,'pickup-native',s=>s.html=s.html.replace('<option>21:45','<option disabled>21:45'));if(n.kind==='candidates')assert.equal(n.offers.length,0);else assert.fail();
  const off=ingest(new LaunchMonitor(options),'pickup-native',s=>s.html=s.html.replace('<select aria-label="取货时段"','<select disabled aria-label="取货时段"'));if(off.kind==='candidates')assert.equal(off.offers.length,0);else assert.fail();
});
test('pause survives restart, preserves floor, and resume requires a fresh observation',()=>{
  const m=new LaunchMonitor(options);ingest(m,'pickup-native');m.setPaused(true);const r=LaunchMonitor.restore(m.toJSON(),options);assert.equal(r.state.paused,true);assert.equal(ingest(r,'terminal-removed').kind,'wait');r.setPaused(false);assert.equal(r.next().kind,'wait');const n=ingest(r,'terminal-removed');if(n.kind==='candidates')assert.equal(n.offers.length,0);else assert.fail();
});

test('a replacement browser document invalidates references but preserves date scope, terminal floors and pending truth',()=>{
  const m=new LaunchMonitor(options),n=ingest(m,'pickup-native');assert.equal(n.kind,'candidates');if(n.kind!=='candidates')return;
  const before=m.state,ref={epoch:n.epoch,obsSeq:n.obsSeq,ref:n.offers[0].ref};
  m.invalidatePage();assert.equal(m.refValid(ref),false);assert.equal(m.next().kind,'wait');assert.deepEqual(m.state.binding,before.binding);assert.deepEqual(m.state.floors,before.floors);
  assert.equal(ingest(m,'pickup-native').kind,'candidates');m.setPending({opId:'op-document-unknown',kind:'submitOrder',status:'unknown',epoch:m.state.epoch});
  m.invalidatePage();assert.equal(m.next().kind,'reconcile');assert.equal(m.state.pending?.status,'unknown');
});
test('pending/unknown final submission survives maintenance, old feedback and restart without resubmit permission',()=>{
  const m=new LaunchMonitor(options);ingest(m,'pickup-native');const old=m.state.epoch;m.setPending({opId:'op-unknown',kind:'submitOrder',status:'unknown',epoch:old});
  for(const id of ['maintenance','entry','pickup-native'])assert.equal(ingest(m,id).kind,'reconcile');
  assert.equal(m.mayInitiateFrom(old),false);const r=LaunchMonitor.restore(m.toJSON(),options);assert.equal(r.next().kind,'reconcile');assert.throws(()=>r.setPending(null as any));assert.equal(ingest(r,'pickup-native').kind,'reconcile');
});
test('malformed/corrupt identity, state, binding, pending or floor cannot restore',()=>{
  const m=new LaunchMonitor(options);ingest(m,'pickup-native');const original=JSON.parse(m.toJSON());
  for(const change of [(x:any)=>x.taskId='task-other',(x:any)=>x.planHash='bad',(x:any)=>x.epoch=null,(x:any)=>x.stage='BUY_NOW',(x:any)=>x.binding.realBindingVerified=true,(x:any)=>x.binding.dates.push('2099-01-04'),(x:any)=>x.pending={opId:'op-bad',kind:'submitOrder',status:'done',epoch:1},(x:any)=>x.floors[0].start='25:00',(x:any)=>x.cookies='private']){const s=structuredClone(original);change(s);assert.throws(()=>LaunchMonitor.restore(JSON.stringify(s),options));}
});
test('strict import schema rejects private/unexpected fields and malformed control evidence',()=>{
  const o=observation('pickup-native');assert.equal(validateObservation(o),true);
  for(const edit of [(x:any)=>x.cookies='not-accepted',(x:any)=>x.conditions.product.secret='not-accepted',(x:any)=>x.conditions.price.value={private:'not-accepted'},(x:any)=>x.detail='arbitrary-private-text',(x:any)=>x.dates[0].date='2099-02-31',(x:any)=>x.times[0].start='24:00',(x:any)=>x.times[0].ref='https://untrusted.invalid']){const x=structuredClone(o);edit(x);assert.equal(validateObservation(x),false);}
});
test('old or duplicate observations cannot regress state; returned state is immutable by callers',()=>{
  const m=new LaunchMonitor(options),o=observation('pickup-native');m.ingest(o,new Date().toISOString(),'synthetic-sample');const state=m.state;(state.floors[0] as any).start='00:00';assert.equal(m.state.floors[0].start,'21:45');assert.throws(()=>m.ingest(o,new Date().toISOString(),'synthetic-sample'),/StaleObservation/);
});
test('bounded partial rendering leads to explicit manual handoff, not an infinite wait',()=>{
  const m=new LaunchMonitor(options);for(let i=0;i<6;i++)ingest(m,'partial');assert.equal(m.state.stage,'UNKNOWN_STRUCTURE');assert.equal(m.next().kind,'handoff');
});
test('transport failure, 503, 429 and auth are distinct; a 200 is not availability',()=>{
  assert.equal(classifyTransport({status:200}),null);assert.equal(classifyTransport({status:503}).stage,'SERVICE_UNAVAILABLE');assert.equal(classifyTransport({status:429}).stage,'RATE_LIMITED');assert.equal(classifyTransport({status:403}).stage,'ACCESS_RESTRICTED');assert.equal(classifyTransport({status:401}).stage,'SIGN_IN_REQUIRED');assert.equal(classifyTransport({error:'timeout'}).stage,'TRANSPORT_FAILED');
});
test('unverified year and impossible calendar/time values are never guessed into a valid date/list',()=>{
  assert.deepEqual(parseDateLabel('October 2'),{date:null,yearShown:false});assert.equal(parseDateLabel('2026-02-30'),null);assert.equal(parseDateLabel('2026年13月2日'),null);assert.equal(parseDateLabel('10月2日')?.date,null);
  assert.equal(observation('pickup-native',s=>s.html=s.html.replace('20:00–20:15','24:00–24:15')).stage,'UNKNOWN_STRUCTURE');assert.throws(()=>timeRanges('20:00','22:00',0));
});
