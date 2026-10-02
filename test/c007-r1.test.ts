// C-007-R1 implementation tests (implementer-owned; the independent reviewer criteria live in review/). Rejected
// inputs, plan mismatch and transient reads; condition and visibility checks; sample issuance; v2 scope migration;
// recovery edge cases; start expectations at the server; next-run copy and narrow-screen rules. All FAKE, offline.
import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LaunchSession, SAMPLE_LIMITS } from '../src/app/launch-session.ts';
import { LaunchMonitor } from '../src/launch.ts';
import { planHash } from '../src/plan.ts';
import { startServer } from '../src/app/server.ts';
import { fromDom, observePage, parseHtml } from '../web/launch/observer.js';
import { replaySample } from '../web/launch/replay-samples.js';
import { advancedStartCopy, nextRunOutcome, renderStart, startLabel } from '../web/render.js';
import { runOutcome, sameOutcome } from '../web/outcome.js';
import { Tab, openApp, waitFor } from './app-helpers.ts';
import { tempDir } from './helpers.ts';

const plan = JSON.parse(readFileSync('examples/plan.launch.fake.json', 'utf8'));
let tick = Date.now();
const FILES = ['launch-monitor.json', 'launch-started.json', 'launch-observations.jsonl', 'launch-commit.json'];
const NONE = [null, null, null, null];
const files = (dir: string) => FILES.map((f) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : null));
function fromSample(sample: any) {
  const o = observePage(parseHtml(sample.html), { observedAt: new Date(++tick).toISOString(), expect: sample.expect });
  if (sample.syntheticComplete) o.listCompleteness = 'synthetic-complete';
  return o;
}
const observe = (s: LaunchSession, id = 'pickup-native', owner: string | null = null) => s.observe(fromSample(s.sample(id, owner)), 'synthetic-sample', owner);
async function withSession(name: string, f: (s: LaunchSession, app: any, dir: string) => void | Promise<void>) {
  const t = tempDir(name), app = await openApp(join(t.dir, 'task'), { initialPlan: plan });
  try { await f(new LaunchSession(app), app, app.store.dir); } finally { await app.close(); t.cleanup(); }
}
const A = 'c-ownera12345', B = 'c-ownerb12345';

// ---------- F1: rejected input, transient reads, plan mismatch ----------
test('R1 F1: rejected inputs name their reason, write nothing and never block a later valid observation', () => withSession('r1-f1', (s, _app, dir) => {
  assert.equal(s.observe({ schema: 'x' }, 'synthetic-sample').code, 'invalid-observation');
  assert.equal(s.observe(fromSample(s.sample('pickup-native')), 'forged-source' as any).code, 'source');
  assert.deepEqual(files(dir), NONE);
  assert.ok(observe(s).ok);
  const saved = files(dir);
  const stale = fromSample(s.sample('pickup-native'));
  stale.observedAt = new Date(Date.parse(stale.observedAt) - 60_000).toISOString();
  assert.equal(s.observe(stale, 'synthetic-sample').code, 'stale-observation');
  const future = fromSample(s.sample('pickup-native'));
  future.observedAt = new Date(Date.now() + 10 * 60_000).toISOString();
  assert.equal(s.observe(future, 'synthetic-sample').code, 'future-observation');
  assert.deepEqual(files(dir), saved);
  assert.equal(s.view().blocked, false);
  assert.ok(observe(s).ok);
  assert.ok(s.fixturePending().ok);
  const pending = files(dir);
  assert.equal(s.fixturePending().code, 'pending-exists');
  assert.deepEqual(files(dir), pending);
  assert.ok(observe(s).ok, 'a later safe observation is still accepted');
  assert.equal(s.view().next.kind, 'reconcile');
  assert.equal(s.view().state?.pending?.status, 'unknown');
}));

test('R1 F1: a transient task-file read failure is shown without sticking, writing or suggesting', () => withSession('r1-transient', (s, app, dir) => {
  assert.ok(observe(s).ok);
  const saved = files(dir), next = fromSample(s.sample('pickup-native'));
  app.state = () => { throw new Error('TaskStateUnavailable: simulated'); };
  const v = s.view();
  assert.equal(v.blocked, true); assert.equal(v.transient, true); assert.equal(v.next.kind, 'wait'); assert.equal(v.next.reason, 'task-state-unavailable');
  delete app.state;
  app.doc = () => { throw new Error('TaskStateUnavailable: simulated'); };
  assert.equal(s.view().transient, true);
  assert.equal(s.observe(next, 'synthetic-sample').code, 'task-state-unavailable');
  assert.equal(s.fixturePending().code, 'task-state-unavailable');
  assert.equal(s.pause(true).code, 'task-state-unavailable');
  delete app.doc;
  assert.deepEqual(files(dir), saved);
  assert.equal(s.view().blocked, false, 'not sticky');
  assert.ok(s.observe(next, 'synthetic-sample').ok, 'the same issued sample is still usable once');
}));

test('R1 F1: a plan change is a named plan mismatch with the saved version, never a rebind; the saved plan continues', () => withSession('r1-plan', (s, app, dir) => {
  assert.ok(observe(s).ok);
  const rev = app.state().plan.rev, saved = files(dir);
  assert.ok(app.editPlan({ ...plan, label: 'FAKE 开售页面回放（修改后的计划）' }).ok);
  const v = s.view();
  assert.equal(v.blocked, true); assert.equal(v.transient, undefined);
  assert.deepEqual(v.planMismatch.savedRevs, [rev]); assert.equal(v.planMismatch.currentRev, rev + 1);
  assert.equal(v.next.reason, 'launch-plan-mismatch'); assert.match(v.status.step, new RegExp(`v${rev}`));
  const r = observe(s);
  assert.equal(r.code, 'launch-plan-mismatch'); assert.match(r.message, new RegExp(`v${rev}`));
  assert.deepEqual(files(dir), saved);
  // A restart under the changed plan reads the same mismatch from disk and writes nothing.
  assert.deepEqual(new LaunchSession(app).view().planMismatch?.savedRevs, [rev]);
  assert.deepEqual(files(dir), saved);
  assert.ok(app.editPlan(plan).ok);
  assert.equal(s.view().blocked, false);
  assert.ok(observe(s).ok);
  assert.deepEqual(s.view().state?.binding?.dates, plan.dates.slice(0, 3));
}));

// ---------- F2: conditions and visibility ----------
function edited(edit: (h: string) => string, expect?: (e: any) => any) {
  const s = replaySample('pickup-native', plan);
  s.html = edit(s.html);
  if (expect) s.expect = expect(s.expect);
  return fromSample(s);
}
test('R1 F2: exact product, one selected planned store and one labelled tax-inclusive total; anything else stops', () => {
  const ok = edited((h) => h).conditions!;
  assert.equal(ok.product.status, 'verified'); assert.equal(ok.store.value, 'FAKE 门店甲'); assert.equal(ok.price.value, 15999);
  const line = 'iPhone Duo 256GB 星光白色', total = '总计（含税） RMB 15999';
  const cases: [string, (h: string) => string, 'product' | 'store' | 'price', ((e: any) => any)?][] = [
    ['model suffix', (h) => h.replaceAll('iPhone Duo', 'iPhone Duo Plus'), 'product'],
    ['colour suffix', (h) => h.replaceAll('星光白色', '星光白色（限定）'), 'product'],
    ['conflicting product line', (h) => h.replace(`<p>${line}</p>`, `<p>${line}</p><p>iPhone Duo 512GB 星光白色</p>`), 'product'],
    ['only product line hidden', (h) => h.replace(`<p>${line}</p>`, `<p style="display:none">${line}</p>`), 'product'],
    ['other store selected', (h) => h.replace('<option selected>FAKE 门店甲</option><option>', '<option>FAKE 门店甲</option><option selected>'), 'store'],
    ['second store control', (h) => h.replace('<p>数量', '<select aria-label="自提门店"><option selected>FAKE 门店甲</option></select><p>数量'), 'store'],
    ['planned store named outside a different selection', (h) => h.replace('<option selected>FAKE 门店甲</option>', '<option selected>FAKE 门店乙</option>').replace('<h2>到店自提</h2>', '<h2>到店自提</h2><p>FAKE 门店甲</p>'), 'store', (e) => ({ ...e, stores: [...e.stores, 'FAKE 门店乙'] })],
    ['selected store hidden', (h) => h.replace('<option selected>FAKE 门店甲</option>', '<option selected hidden>FAKE 门店甲</option>'), 'store'],
    ['selected store disabled', (h) => h.replace('<option selected>FAKE 门店甲</option>', '<option selected disabled>FAKE 门店甲</option>'), 'store'],
    ['store control invisible', (h) => h.replace('<select aria-label="取货门店">', '<select aria-label="取货门店" style="visibility:hidden">'), 'store'],
    ['starting-from price', (h) => h.replace(`${total}</p>`, `${total} 起</p>`), 'price'],
    ['total without tax label', (h) => h.replace(total, '总计 RMB 15999'), 'price'],
    ['second different total', (h) => h.replace('<p>数量', '<p>总计（含税） RMB 14999</p><p>数量'), 'price'],
    ['unlabelled price only', (h) => h.replace(total, 'RMB 15999'), 'price'],
    ['total hidden', (h) => h.replace(`<p>${total}`, `<p hidden>${total}`), 'price'],
    ['total transparent', (h) => h.replace(`<p>${total}`, `<p style="opacity:0">${total}`), 'price'],
    ['total with trailing qualifier', (h) => h.replace(`${total}</p>`, `${total}（不含 AppleCare+）</p>`), 'price'],
  ];
  for (const [name, edit, field, expect] of cases) {
    const o = edited(edit, expect);
    assert.notEqual(o.conditions?.[field]?.status, 'verified', name);
    const m = new LaunchMonitor({ taskId: 'task-r1conditions', plan, planHash: planHash(plan), relativeDates: 3 });
    assert.notEqual(m.ingest(o, new Date().toISOString(), 'synthetic-sample').kind, 'candidates', name);
  }
  // Hidden content is not displayed, so a hidden conflicting product line does not count against the visible one.
  assert.equal(edited((h) => h.replace(`<p>${line}</p>`, `<p>${line}</p><p hidden>iPhone Duo 512GB 星光白色</p>`)).conditions?.product.status, 'verified');
});

function fakeEl(tag: string, attrs: Record<string, string> = {}, kids: any[] = [], o: { selected?: boolean; style?: any; visible?: boolean } = {}) {
  const e: any = {
    nodeType: 1, tagName: tag.toUpperCase(), childNodes: kids, parentElement: null, isConnected: true, type: attrs.type ?? '', checked: false, labels: [],
    selected: !!o.selected, disabled: 'disabled' in attrs, style: o.style ?? { display: 'block', visibility: 'visible' },
    hasAttribute: (n: string) => Object.hasOwn(attrs, n), getAttribute: (n: string) => attrs[n] ?? null, checkVisibility: () => o.visible !== false,
  };
  e.closest = () => { for (let n = e; n; n = n.parentElement) if (n.hasAttribute('disabled') || n.getAttribute('aria-disabled') === 'true' || n.hasAttribute('inert')) return n; return null; };
  for (const k of kids) if (k.nodeType === 1) k.parentElement = e;
  return e;
}
const textNode = (s: string) => ({ nodeType: 3, nodeValue: s });
test('R1 F2: live DOM visibility comes from computed style and checkVisibility; missing browser APIs fail closed', () => {
  const page = (o: { optionStyle?: any; totalVisible?: boolean } = {}) => fakeEl('div', {}, [
    fakeEl('select', { 'aria-label': '取货门店' }, [fakeEl('option', {}, [textNode('FAKE 门店甲')], { selected: true, style: o.optionStyle }), fakeEl('option', {}, [textNode('FAKE 其他门店（未授权）')])]),
    fakeEl('p', {}, [textNode('iPhone Duo 256GB 星光白色')]),
    fakeEl('p', {}, [textNode('总计（含税） RMB 15999')], { visible: o.totalVisible }),
    fakeEl('div', { inert: '' }, [fakeEl('button', {}, [textNode('继续')])]),
  ]);
  const env = { getComputedStyle: (e: any) => e.style };
  const shown = fromDom(page(), new Map(), '0', env);
  assert.ok(!('hidden' in shown.attrs)); assert.ok(!('hidden' in shown.kids[0].kids[0].attrs)); assert.ok(!('hidden' in shown.kids[2].attrs));
  assert.equal(shown.kids[3].kids[0].inheritedDisabled, true, 'an inert ancestor disables its controls');
  const styled = fromDom(page({ optionStyle: { display: 'none', visibility: 'visible' }, totalVisible: false }), new Map(), '0', env);
  assert.ok('hidden' in styled.kids[0].kids[0].attrs, 'an option hidden by a stylesheet class is not offered');
  assert.ok(!('hidden' in styled.kids[0].kids[1].attrs));
  assert.ok('hidden' in styled.kids[2].attrs, 'checkVisibility false (opacity, visibility, content-visibility) is not displayed');
  const collapsed = fromDom(page({ optionStyle: { display: 'block', visibility: 'collapse' } }), new Map(), '0', env);
  assert.ok('hidden' in collapsed.kids[0].kids[0].attrs);
  assert.ok(fromDom(page(), new Map(), '0', {}).kids[0].kids.every((o: any) => 'hidden' in o.attrs), 'no getComputedStyle: no option is offered');
  const bare = page(); delete bare.checkVisibility;
  assert.ok('hidden' in fromDom(bare, new Map(), '0', env).attrs, 'no checkVisibility: nothing is treated as displayed');
});

// ---------- F3: sample issuance and imports ----------
test('R1 F3: synthetic completeness needs an issued, unused sample for the same tab and plan; forged claims change nothing', () => withSession('r1-f3', (s, _app, dir) => {
  assert.equal(s.observe(fromSample(replaySample('pickup-native', plan)), 'synthetic-sample', A).code, 'sample-not-issued', 'built by the client, never issued');
  const issued = fromSample(s.sample('pickup-native', A));
  assert.equal(s.observe(issued, 'synthetic-sample', B).code, 'sample-not-issued', 'another tab');
  assert.equal(s.observe(issued, 'synthetic-sample', null).code, 'sample-not-issued', 'no tab identity');
  const changed = structuredClone(issued); changed.times = changed.times.slice(0, -1);
  assert.equal(s.observe(changed, 'synthetic-sample', A).code, 'sample-mismatch', 'content changed after issue');
  const entry = fromSample(s.sample('entry', A)); entry.listCompleteness = 'synthetic-complete';
  assert.equal(s.observe(entry, 'synthetic-sample', A).code, 'sample-mismatch', 'completeness claimed for an incomplete sample');
  assert.deepEqual(files(dir), NONE);
  assert.ok(s.observe(issued, 'synthetic-sample', A).ok);
  const replayed = s.observe({ ...issued, observedAt: new Date(++tick).toISOString() }, 'synthetic-sample', A);
  assert.equal(replayed.ok, false, 'one use only'); assert.match(replayed.code, /^sample-(not-issued|mismatch)$/);
  const pending = fromSample(s.sample('pickup-native', A));
  s.ownerChanged();
  assert.equal(s.observe(pending, 'synthetic-sample', A).code, 'sample-not-issued', 'issued to the previous controlling document');
}));

test('R1 F3: samples expire, are bounded in number and do not survive a plan change', async () => {
  await withSession('r1-f3-expiry', (s) => {
    const late = fromSample(s.sample('pickup-native', A)), realNow = Date.now;
    let r;
    try { Date.now = () => realNow() + SAMPLE_LIMITS.ttlMs + 1000; r = s.observe(late, 'synthetic-sample', A); } finally { Date.now = realNow; }
    assert.equal(r.code, 'sample-not-issued');
  });
  await withSession('r1-f3-bound', (s) => {
    const first = fromSample(s.sample('entry', A));
    for (let i = 0; i < SAMPLE_LIMITS.outstanding; i++) s.sample('pickup-native', A);
    assert.equal(s.observe(first, 'synthetic-sample', A).code, 'sample-mismatch', 'the oldest outstanding sample was evicted');
  });
  await withSession('r1-f3-plan', (s, app, dir) => {
    const before = fromSample(s.sample('pickup-native', A));
    assert.ok(app.editPlan({ ...plan, label: 'FAKE 签发后修改的计划' }).ok);
    assert.equal(s.observe(before, 'synthetic-sample', A).code, 'sample-not-issued', 'issued under another plan');
    assert.deepEqual(files(dir), NONE);
  });
});

test('R1 F3: imported JSON is previewed in memory only: no file, scope, floor, candidate or timestamp', () => withSession('r1-import', (s, _app, dir) => {
  const forged = fromSample(replaySample('pickup-native', plan)); forged.listCompleteness = 'synthetic-complete';
  const r = s.observe(forged, 'imported-observation', A);
  assert.equal(r.ok, true); assert.equal(r.code, 'imported-preview');
  assert.equal(r.preview.stage, 'SLOT_SELECTION'); assert.notEqual(r.preview.next.kind, 'candidates');
  assert.deepEqual(files(dir), NONE);
  assert.equal(s.view().state?.scope, null); assert.equal(s.view().state?.lastObservedAt, null);
  assert.ok(observe(s).ok);
  const saved = files(dir);
  assert.equal(s.observe({ ...forged, observedAt: new Date(++tick).toISOString() }, 'imported-observation').code, 'imported-preview');
  assert.equal(s.observe({ junk: true }, 'imported-observation').code, 'invalid-observation');
  assert.deepEqual(files(dir), saved);
}));

test('R1 F3: over HTTP a sample belongs to the tab that fetched it; after control moves its observation is refused', async () => {
  const t = tempDir('r1-f3-http'), app = await openApp(join(t.dir, 'task'), { initialPlan: plan }), srv = await startServer(app);
  const a = new Tab(srv.port, 'c-samplea12345'), b = new Tab(srv.port, 'c-sampleb12345');
  const get = async (tab: Tab) => (await fetch(`${tab.base}/api/launch/sample?id=pickup-native`, { headers: { 'x-session-token': tab.token, 'x-client-id': tab.id } })).json();
  try {
    await a.load(); await a.connect(); await b.load(); await b.connect();
    assert.equal((await a.post('/api/claim')).status, 200);
    const fromA = fromSample(await get(a));
    a.disconnect();
    await waitFor(() => srv.controller() === null, 'old document released');
    assert.equal((await b.post('/api/claim')).status, 200);
    const refused = await b.post('/api/launch/observe', { source: 'synthetic-sample', observation: fromA });
    assert.equal(refused.status, 409); assert.equal(refused.body.code, 'sample-not-issued');
    assert.deepEqual(files(app.store.dir), NONE);
    const own = fromSample(await get(b));
    assert.equal((await b.post('/api/launch/observe', { source: 'synthetic-sample', observation: own })).status, 200);
    assert.equal((await b.post('/api/launch/observe', { source: 'synthetic-sample', observation: { ...own, observedAt: new Date(++tick).toISOString() } })).body.code, 'sample-not-issued');
    const imported = await b.post('/api/launch/observe', { source: 'imported-observation', observation: { ...own, observedAt: new Date(++tick).toISOString() } });
    assert.equal(imported.status, 200); assert.equal(imported.body.code, 'imported-preview');
    assert.equal((await b.post('/api/launch/observe', { source: 'trusted', observation: own })).status, 400);
  } finally { a.disconnect(); b.disconnect(); await srv.close(); await app.close(); t.cleanup(); }
});

// ---------- F4: v2 scope migration ----------
const monitorOptions = { taskId: 'task-r1migration', plan, planHash: planHash(plan), relativeDates: 3 };
const asV2 = (m: LaunchMonitor) => { const s = JSON.parse(m.toJSON()); delete s.scope; s.schema = 'applebuy-launch-monitor/v2'; return JSON.stringify(s); };
const now = () => new Date().toISOString();
test('R1 F4: v2 migration keeps a known binding and floors, keeps never-observed open, and stops unknown or unbound legacy scope', () => {
  // Bound: the v2 binding is its frozen scope; floors carry over; candidates stay possible inside it.
  const bound = new LaunchMonitor(monitorOptions);
  bound.ingest(fromSample(replaySample('pickup-native', plan)), now(), 'synthetic-sample');
  const b = LaunchMonitor.restore(asV2(bound), monitorOptions);
  assert.deepEqual(b.state.scope, { dates: bound.state.binding!.dates, frozenAt: bound.state.binding!.boundAt, bindable: true });
  assert.deepEqual(b.state.floors, bound.state.floors); assert.ok(b.state.floors.length > 0);
  assert.equal(b.ingest(fromSample(replaySample('pickup-native', plan)), now(), 'synthetic-sample').kind, 'candidates');

  // Unbound: v2 had seen an unbindable first list; the upgrade cannot show it, so no later list may freeze.
  const unbound = new LaunchMonitor(monitorOptions), first = fromSample(replaySample('pickup-native', plan));
  first.dates = [{ ...first.dates[0], date: '2098-12-31', label: '2098-12-31', selected: false }, ...first.dates];
  unbound.ingest(first, now(), 'synthetic-sample');
  const u = LaunchMonitor.restore(asV2(unbound), monitorOptions);
  assert.equal(u.state.scope?.origin, 'legacy-unknown'); assert.equal(u.state.binding, null);
  assert.deepEqual(u.next(), { kind: 'handoff', reason: 'legacy-date-scope-unknown' });
  for (const id of ['pickup-native', 'fourth-date']) assert.notEqual(u.ingest(fromSample(replaySample(id, plan)), now(), 'synthetic-sample').kind, 'candidates', id);
  assert.equal(u.state.scope?.origin, 'legacy-unknown'); assert.equal(u.state.binding, null);
  assert.equal(LaunchMonitor.restore(u.toJSON(), monitorOptions).state.scope?.origin, 'legacy-unknown', 'kept across later restarts');
  assert.match(u.statusZh().binding, /旧版回放记录/);

  // Unknown: observed pages (here only prelaunch) but no binding; pending truth is preserved and comes first.
  const unknown = new LaunchMonitor(monitorOptions);
  unknown.ingest(fromSample(replaySample('prelaunch', plan)), now(), 'synthetic-sample');
  unknown.setPending({ opId: 'legacy-op', kind: 'submitOrder', status: 'unknown', epoch: unknown.state.epoch });
  const k = LaunchMonitor.restore(asV2(unknown), monitorOptions);
  assert.equal(k.state.scope?.origin, 'legacy-unknown'); assert.equal(k.state.pending?.status, 'unknown'); assert.equal(k.next().kind, 'reconcile');

  // Empty: never observed (no timestamp, no valid stage, no history) is the only unbound state that stays open.
  const empty = new LaunchMonitor(monitorOptions); empty.setPaused(true);
  const e = LaunchMonitor.restore(asV2(empty), monitorOptions);
  assert.equal(e.state.scope, null); assert.equal(e.state.paused, true);
  e.setPaused(false);
  assert.equal(e.ingest(fromSample(replaySample('pickup-native', plan)), now(), 'synthetic-sample').kind, 'candidates');
  assert.deepEqual(e.state.binding?.dates, plan.dates.slice(0, 3));

  // A legacy-unknown marker cannot be hand-edited into a scope with dates or a binding.
  const v3 = JSON.parse(u.toJSON());
  for (const scope of [{ ...v3.scope, dates: ['2099-01-01'] }, { ...v3.scope, bindable: true }, { ...v3.scope, origin: 'other' }]) {
    assert.throws(() => LaunchMonitor.restore(JSON.stringify({ ...v3, scope }), monitorOptions), /LaunchStateMismatch/);
  }
});

// ---------- F5: recovery edge cases (ordinary boundaries are covered by the reviewer suite) ----------
test('R1 F5: a torn tail of the unfinished journal line is completed; another tail or a tampered intent fails closed unchanged', async () => {
  for (const variant of ['torn', 'garbage', 'tampered'] as const) {
    const t = tempDir(`r1-tail-${variant}`), app = await openApp(join(t.dir, 'task'), { initialPlan: plan }), dir = app.store.dir;
    try {
      assert.ok(observe(new LaunchSession(app)).ok);
      assert.equal(new LaunchSession(app, { crashAfter: 'intent' }).view().blocked, true, 'the restart save stops after its intent');
      const intent = JSON.parse(readFileSync(join(dir, 'launch-commit.json'), 'utf8'));
      assert.equal(intent.committed, false); assert.equal(intent.record, 2);
      const line = JSON.stringify({ record: 2, taskId: intent.taskId, planHash: intent.planHash, hash: intent.hash }) + '\n';
      if (variant === 'torn') appendFileSync(join(dir, 'launch-observations.jsonl'), line.slice(0, 20));
      if (variant === 'garbage') appendFileSync(join(dir, 'launch-observations.jsonl'), '{"record":2,"garbage');
      if (variant === 'tampered') { intent.state.paused = !intent.state.paused; writeFileSync(join(dir, 'launch-commit.json'), JSON.stringify(intent)); }
      const before = files(dir), v = new LaunchSession(app).view();
      if (variant === 'torn') {
        assert.equal(v.blocked, false); assert.equal(v.next.kind, 'wait'); assert.ok(v.state!.epoch > intent.state.epoch, 'old references invalid');
        const lines = readFileSync(join(dir, 'launch-observations.jsonl'), 'utf8').split('\n');
        assert.equal(`${lines[1]}\n`, line); assert.equal(lines.at(-1), '');
      } else {
        assert.equal(v.blocked, true, variant); assert.deepEqual(files(dir), before, variant);
      }
      assert.equal(app.site.view().counts.chooseSlot, 0); assert.equal(app.site.view().counts.submitOrder, 0);
    } finally { await app.close(); t.cleanup(); }
  }
});

// ---------- F7: start expectation at the server ----------
test('R1 F7: the server checks the displayed outcome before claiming the arm, even before any SSE update', async () => {
  const t = tempDir('r1-start'), app = await openApp(join(t.dir, 'task'), { latencyMs: 5 }), srv = await startServer(app), a = new Tab(srv.port, 'c-startowner12');
  try {
    await a.load(); await a.connect();
    assert.equal((await a.post('/api/claim')).status, 200);
    const s0 = app.state();
    assert.equal((await a.post('/api/start', { expect: { kind: 'bogus', armId: null } })).body.code, 'outcome-changed');
    assert.ok((await a.post('/api/formal', { planHash: s0.plan.planHash, phrase: s0.formal.phrase })).body.ok);
    const armId = app.state().formal.armId;
    assert.equal(typeof armId, 'string');
    // The page still shows the unarmed copy (no event delivered yet): nothing starts and the arm is not claimed.
    for (const expect of [undefined, { kind: 'default', armId: null }, { kind: 'submits', armId: 'arm-forged' }, { kind: 'submits' }]) {
      const r = await a.post('/api/start', expect === undefined ? {} : { expect });
      assert.equal(r.status, 409); assert.equal(r.body.code, 'outcome-changed'); assert.match(r.body.message, /没有领取授权/);
    }
    assert.equal(app.state().formal.used, null); assert.equal(app.state().running, false);
    // Idle expiry: a page that still shows "submits" is refused once the arm has expired.
    const expiry = app.state().formal.expiresAt, realNow = Date.now;
    let late;
    try { Date.now = () => expiry + 1; late = app.start('refuse-then-accept', { kind: 'submits', armId }); } finally { Date.now = realNow; }
    assert.equal(late.code, 'outcome-changed'); assert.equal(app.state().formal.used, null);
    assert.equal(nextRunOutcome(app.state(), expiry + 1).kind, 'expired');
    // Plan edited after arming: "submits" is stale; the arm stays unclaimed.
    assert.ok((await a.post('/api/plan', { plan: { ...s0.plan.plan, label: 'FAKE 启用后修改的计划' } })).body.ok);
    assert.equal(nextRunOutcome(app.state()).kind, 'plan-mismatch');
    assert.equal((await a.post('/api/start', { expect: { kind: 'submits', armId } })).body.code, 'outcome-changed');
    assert.equal(app.state().formal.used, null);
    // Back on the reviewed plan, two racing starts with the displayed outcome start exactly one run.
    assert.ok((await a.post('/api/plan', { plan: s0.plan.plan })).body.ok);
    const shown = { expect: { kind: 'submits', armId } };
    const [r1, r2] = await Promise.all([a.post('/api/start', shown), a.post('/api/start', shown)]);
    assert.deepEqual([r1.status, r2.status].sort(), [200, 409]);
    await waitFor(() => !app.state().running, 'run ended', 15000);
    const after = app.state();
    assert.equal(typeof after.formal.used, 'string'); assert.equal(nextRunOutcome(after).kind, 'used');
    assert.equal(app.site.view().counts.submitOrder, 1, 'one mock final submission to the local mock site, not a merchant order');
    // Used arm with a final-submit record: start is refused by the ledger blocker before the expectation check.
    const again = await a.post('/api/start', shown);
    assert.equal(again.status, 409); assert.equal(again.body.code, 'start-blocked');
    assert.equal(app.state().formal.used, after.formal.used); assert.equal(app.site.view().counts.submitOrder, 1);
    assert.match(renderStart({ ...after, control: { you: true } }), /不能开始新演练/);
  } finally { a.disconnect(); await srv.close(); await app.close(); t.cleanup(); }
});

test('R1 F7: an armed, unused capability with an unverifiable ledger is shown as blocked; start is refused and claims nothing', async () => {
  const t = tempDir('r1-ledger'), app = await openApp(join(t.dir, 'task'));
  try {
    const s0 = app.state();
    assert.ok(app.armFormal(s0.plan.planHash, s0.formal.phrase).ok);
    unlinkSync(join(app.store.dir, 'purchase-ledger.json'));
    const s = app.state();
    assert.equal(s.formal.used, null); assert.ok(s.ledger.entries > 0);
    const o = nextRunOutcome(s);
    assert.equal(o.kind, 'ledger'); assert.match(o.text, /不能开始新的运行/); assert.match(o.text, /不会被领取/);
    for (const expect of [{ kind: 'ledger', armId: null }, { kind: 'submits', armId: s.formal.armId }]) {
      const r = app.start('refuse-then-accept', expect);
      assert.equal(r.ok, false); assert.equal(r.code, 'start-blocked', 'the ledger blocker precedes the expectation check');
    }
    assert.equal(app.state().formal.used, null, 'the unused arm was not claimed');
    assert.equal(app.site.view().counts.submitOrder, 0);
  } finally { await app.close(); t.cleanup(); }
});

// ---------- F8: next-run copy and layout guard ----------
test('R1 F8: used, ledger and advanced copy come from the same outcome and never describe a real merchant action', () => {
  const base = { plan: { planHash: 'p1' }, ledger: { entries: 0 }, formal: { armed: true, used: null, armId: 'arm-1', armedPlanHash: 'p1', expiresAt: Date.now() + 60_000 } };
  const consume = ['开始演练（会用掉模拟授权，但不会提交）', '用当前计划开始此场景（会用掉模拟授权，但不会提交）'];
  const cases: [any, string, string | null, string[]][] = [
    [{ ...base, formal: { ...base.formal, armed: false, armId: null } }, 'default', null, ['开始演练', '用当前计划开始此场景']],
    [{ ...base, formal: { ...base.formal, used: 'run-abc' } }, 'used', null, ['开始演练', '用当前计划开始此场景']],
    [{ ...base, ledger: { entries: 1 } }, 'ledger', null, ['开始演练', '用当前计划开始此场景']],
    [{ ...base, plan: { planHash: 'p2' } }, 'plan-mismatch', 'arm-1', consume],
    [{ ...base, formal: { ...base.formal, expiresAt: Date.now() - 1 } }, 'expired', 'arm-1', consume],
    [base, 'submits', 'arm-1', ['开始演练（会提交一单模拟订单）', '用当前计划开始此场景（会提交一单模拟订单）']],
  ];
  for (const [s, kind, armId, [primary, advanced]] of cases) {
    const o = nextRunOutcome(s), adv = advancedStartCopy(s);
    assert.deepEqual(runOutcome(s), { kind, armId }, kind);
    assert.equal(o.kind, kind); assert.equal(startLabel(o), primary, kind);
    assert.equal(adv.label, advanced, kind); assert.equal(adv.text, o.text, kind); assert.deepEqual(adv.expect, { kind, armId });
    assert.ok(sameOutcome(adv.expect, runOutcome(s)));
    assert.doesNotMatch(o.text, /向 ?Apple|Apple Store 订单|已付款|真实下单/, kind);
  }
  assert.match(nextRunOutcome(cases[1][0]).text, /已被运行 run-abc 使用/); assert.match(nextRunOutcome(cases[1][0]).text, /不提交任何订单/);
  assert.match(nextRunOutcome(cases[2][0]).text, /不能开始新的运行/); assert.match(nextRunOutcome(cases[2][0]).text, /不会被领取/);
  assert.match(nextRunOutcome(base).text, /模拟订单（不是真实订单/);
  for (const bad of [null, {}, { kind: 'submits' }, { kind: 'submits', armId: 'arm-2' }, { kind: 'other', armId: null }]) assert.equal(sameOutcome(bad, runOutcome(base)), false);
});

test('R1 F6/F8: the runbook keeps /launch in the controlling tab; narrow-screen rules exist (browser evidence is separate)', () => {
  const runbook = readFileSync('docs/launch-replay-runbook.md', 'utf8');
  assert.match(runbook, /在同一个标签页/); assert.doesNotMatch(runbook, /再打开同一地址的 `\/launch`/);
  const css = readFileSync('web/style.css', 'utf8'), narrow = css.slice(css.indexOf('@media (max-width: 480px)'));
  assert.match(css, /#technical\s*\{[^}]*white-space:\s*pre-wrap[^}]*max-width:\s*100%/);
  assert.match(css, /#sample\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(css, /#phraseInput\s*\{[^}]*max-width:\s*100%/);
  assert.match(narrow, /\.row > button\s*\{[^}]*flex:\s*1 1 100%/);
  for (const page of ['web/index.html', 'web/launch/index.html']) assert.match(readFileSync(page, 'utf8'), /name="viewport" content="width=device-width, ?initial-scale=1"/);
});
