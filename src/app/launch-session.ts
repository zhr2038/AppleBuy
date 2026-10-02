// Uses the existing TaskApp OS owner and browser control lease; no second executor and no outbound site port.
//
// Durable evidence (all in the task directory):
//   launch-commit.json        intent of the save in progress: {record, hash, state, committed:false}, then committed:true
//   launch-started.json       marker: this task has launch evidence bound to one plan
//   launch-observations.jsonl one {record, taskId, planHash, hash} line per save
//   launch-monitor.json       the monitor state whose digest is the last journal hash
// A save writes the intent first, then marker (first save only), journal line, state, and finally marks the intent
// committed. A process that stops between any two of those writes leaves an uncommitted intent that recovery
// finishes exactly (redo; nothing is deleted). Every other inconsistency (rollback, missing artifact, foreign or
// malformed record, concurrent writer) fails closed and keeps the files.
import { appendFileSync, closeSync, existsSync, fsyncSync, openSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { canonicalJson } from '../plan.ts';
import { LaunchInputRejected, LaunchMonitor, STAGE_ZH, validateObservation } from '../launch.ts';
import type { ObservationSource, PageObservation } from '../launch.ts';
import type { TaskApp } from './task-app.ts';
import { isInsideTestRuns } from './task-app.ts';
import type { TaskDoc } from './task-store.ts';
import { atomicWriteJson, currentPlan } from './task-store.ts';
import { replaySample } from '../../web/launch/replay-samples.js';
import { classifyTransport, observePage, parseHtml } from '../../web/launch/observer.js';

const digest = (value:unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
const HEX = /^[0-9a-f]{64}$/, PLAN_HASH = /^[0-9a-f]{16}$/;
const MARKER = 'applebuy-launch-started/v1', COMMIT = 'applebuy-launch-commit/v1';
const obj = (v:unknown):v is Record<string,any> => !!v && typeof v==='object' && !Array.isArray(v);
/** Issued synthetic samples: one use each, bound to the requesting tab and plan, short-lived and bounded. */
export const SAMPLE_LIMITS = { outstanding: 16, ttlMs: 10 * 60_000 };
export type CrashPoint = 'intent'|'marker'|'journal'|'state';

/** The plan the saved evidence is bound to differs from the current plan. Never rebind; not evidence damage. */
class LaunchPlanMismatch extends Error {
  readonly savedHash: string;
  constructor(savedHash:string) { super('LaunchPlanMismatch'); this.savedHash=savedHash; }
}
/** The task file could not be read right now; nothing was read from or written to launch evidence. */
class LaunchTransient extends Error {}

const REJECTED: Record<string,[string,string]> = {
  InvalidObservation: ['invalid-observation','观察内容不符合规定的脱敏格式（多余字段或格式错误）：已拒绝，记录未改变'],
  StaleObservation: ['stale-observation','观察时间不晚于上一条已保存的观察（重复或过期）：已拒绝，记录未改变'],
  FutureObservation: ['future-observation','观察时间晚于本机当前时间：已拒绝，记录未改变'],
  PendingRequiresReconciliation: ['pending-exists','已有结果不明的操作：只能先只读核实，不能再登记新的在途操作；记录未改变'],
  InvalidPause: ['invalid-pause','暂停请求格式错误：记录未改变'],
  NotFake: ['not-fake','当前计划不是 FAKE 演练计划：不能使用合成的结果不明场景；记录未改变'],
  InvalidSource: ['source','未知的观察来源：已拒绝，记录未改变'],
  SampleNotIssued: ['sample-not-issued','这份样本观察没有对应的、由本服务签发给本标签页且尚未使用的样本（可能是重复提交、来自其他标签页、已过期，或控制页面/计划已变化）：已拒绝，记录未改变'],
  SampleMismatch: ['sample-mismatch','样本观察与本服务签发的样本内容或完整性不一致：不能当作合成完整列表；已拒绝，记录未改变'],
};
const STUCK = {ok:false as const,code:'launch-evidence',message:'页面回放记录无法验证，已停止更新并保留原文件；请人工核对，不要删除记录重新开始'};
const TRANSIENT = {ok:false as const,code:'task-state-unavailable',message:'暂时无法读取任务文件：本次没有读取或修改回放记录，可稍后重试'};

/** Semantic content of an observation, without page references, timestamps or completeness claims. */
function projection(o:PageObservation):string {
  return canonicalJson({schema:o.schema,stage:o.stage,detail:o.detail,conditions:o.conditions,continue:o.continue?{enabled:o.continue.enabled}:null,
    dates:o.dates.map(d=>({label:d.label,date:d.date,yearShown:d.yearShown,enabled:d.enabled,selected:d.selected})),selectedDate:o.selectedDate,
    times:o.times.map(t=>({start:t.start,end:t.end,enabled:t.enabled,selected:t.selected})),timePlaceholderSelected:o.timePlaceholderSelected,anchors:o.anchors});
}
/** What the browser replay derives from an issued sample; computed here from the same markup with the AST observer. */
function sampleObservation(s:{html:string;expect:unknown;transport:unknown}):PageObservation {
  const o=observePage(parseHtml(s.html),{observedAt:new Date().toISOString(),expect:s.expect});
  return (s.transport?{...o,...classifyTransport(s.transport)}:o) as PageObservation;
}
type Issued = {owner:string|null; planHash:string; issuedAt:number; complete:boolean; projection:string};

export class LaunchSession {
  #app:TaskApp; #monitor:LaunchMonitor|null=null; #error:string|null=null; #records=0; #issued:Issued[]=[];
  #file:string; #marker:string; #journal:string; #commit:string; #crashAt:CrashPoint|null;
  /** `crashAfter` simulates a process stop after one durable write; honoured only inside .local/test-runs. */
  constructor(app:TaskApp, o:{crashAfter?:CrashPoint}={}) {
    this.#app=app; this.#file=join(app.store.dir,'launch-monitor.json');this.#marker=join(app.store.dir,'launch-started.json');
    this.#journal=join(app.store.dir,'launch-observations.jsonl');this.#commit=join(app.store.dir,'launch-commit.json');
    this.#crashAt=o.crashAfter&&isInsideTestRuns(app.store.dir)?o.crashAfter:null;
  }
  #doc():TaskDoc {
    try {return this.#app.doc();} catch {throw new LaunchTransient();}
  }
  #artifacts() {return [this.#file,this.#marker,this.#journal,this.#commit].some(existsSync);}
  #load(doc:TaskDoc):LaunchMonitor {
    if(this.#error) throw new Error(this.#error);
    const cur=currentPlan(doc),options={taskId:doc.taskId,planHash:cur.planHash,plan:cur.plan,relativeDates:3};
    if(this.#monitor) {
      const saved=this.#monitor.state.planHash;
      if(saved===cur.planHash) return this.#monitor;
      // Viewing an empty replay must not freeze a future plan. Once any evidence exists, it stays bound to its plan.
      if(this.#records===0&&!this.#artifacts()) return this.#monitor=new LaunchMonitor(options);
      throw new LaunchPlanMismatch(saved);
    }
    if(!this.#artifacts()) return this.#monitor=new LaunchMonitor(options);
    const text=this.#recover(options);
    this.#monitor=LaunchMonitor.restore(text,options);
    this.#save(); // persist restart invalidation; references never survive a process restart
    return this.#monitor;
  }
  #journalRecords(taskId:string,planHash:string):{records:any[];tail:string;text:string|null} {
    if(!existsSync(this.#journal)) return {records:[],tail:'',text:null};
    const text=readFileSync(this.#journal,'utf8'),cut=text.lastIndexOf('\n');
    const records=text.slice(0,cut+1).split('\n').slice(0,-1).map(x=>JSON.parse(x));
    if(records.some((x,i)=>!obj(x)||x.record!==i+1||x.taskId!==taskId||x.planHash!==planHash||!HEX.test(x.hash))) throw new Error('LaunchEvidenceMismatch');
    return {records,tail:text.slice(cut+1),text};
  }
  /**
   * Verify durable evidence and finish an interrupted save; returns the committed state text. Fails closed otherwise.
   * Every check, including the full monitor-state validation of an unfinished save, happens before the first write.
   */
  #recover(options:Parameters<typeof LaunchMonitor.restore>[1]):string {
    const {taskId,planHash}=options;
    const intent=existsSync(this.#commit)?JSON.parse(readFileSync(this.#commit,'utf8')):null;
    const marker=existsSync(this.#marker)?JSON.parse(readFileSync(this.#marker,'utf8')):null;
    if(intent!==null&&(!obj(intent)||intent.schema!==COMMIT||!Number.isSafeInteger(intent.record)||intent.record<1||typeof intent.taskId!=='string'||!PLAN_HASH.test(intent.planHash)||!HEX.test(intent.hash)||typeof intent.committed!=='boolean')) throw new Error('LaunchEvidenceMismatch');
    if(marker!==null&&(!obj(marker)||marker.schema!==MARKER||typeof marker.taskId!=='string'||!PLAN_HASH.test(marker.planHash))) throw new Error('LaunchEvidenceMismatch');
    const ids=[intent,marker].filter(Boolean);
    if(!ids.length||ids.some(x=>x.taskId!==taskId)||new Set(ids.map(x=>x.planHash)).size!==1) throw new Error('LaunchIdentityMismatch');
    if(ids[0].planHash!==planHash) throw new LaunchPlanMismatch(ids[0].planHash);
    const {records,tail,text}=this.#journalRecords(taskId,planHash),k=records.length;
    const stateText=existsSync(this.#file)?readFileSync(this.#file,'utf8'):null,stateHash=stateText===null?null:digest(JSON.parse(stateText));
    if(intent===null||intent.committed) {
      // Complete evidence (a store written before intents existed has none): every part present and consistent.
      if(tail!==''||!marker||!k||stateText===null||records[k-1].hash!==stateHash||(intent&&(intent.record!==k||intent.hash!==stateHash))) throw new Error('LaunchEvidenceMismatch');
      this.#records=k;return stateText;
    }
    // Uncommitted intent: the process stopped inside save number n. Finish exactly that save; never drop it.
    const n=intent.record,line=JSON.stringify({record:n,taskId,planHash,hash:intent.hash})+'\n',prev=n===1?null:records[n-2]?.hash;
    if(!obj(intent.state)||digest(intent.state)!==intent.hash) throw new Error('LaunchEvidenceMismatch');
    // A self-consistent hash proves nothing about content: the state to be redone must be a valid current-schema
    // monitor state for this task and plan (dry run, no write) before any marker, journal, state or receipt write.
    if(intent.state.schema!=='applebuy-launch-monitor/v3'||intent.state.taskId!==taskId||intent.state.planHash!==planHash) throw new Error('LaunchEvidenceMismatch');
    try {LaunchMonitor.restore(JSON.stringify(intent.state),options);} catch {throw new Error('LaunchEvidenceMismatch');}
    // Before the journal line: an unfinished (torn) line may only be a prefix of exactly this line.
    const before=k===n-1&&line.startsWith(tail)&&(n===1?stateText===null&&(text===null||text===tail):!!marker&&stateHash===prev);
    const after=k===n&&tail===''&&!!marker&&records[n-1].hash===intent.hash&&(stateHash===intent.hash||stateHash===prev);
    if(!before&&!after) throw new Error('LaunchEvidenceMismatch');
    if(!marker) atomicWriteJson(this.#marker,{schema:MARKER,taskId,planHash});
    if(before) this.#append(line.slice(tail.length));
    if(stateHash!==intent.hash) atomicWriteJson(this.#file,intent.state);
    atomicWriteJson(this.#commit,{schema:COMMIT,record:n,taskId,planHash,hash:intent.hash,committed:true});
    this.#records=n;
    return readFileSync(this.#file,'utf8');
  }
  #append(text:string) {
    appendFileSync(this.#journal,text);
    const fd=openSync(this.#journal,'r+');try{fsyncSync(fd);}finally{closeSync(fd);}
  }
  #crash(point:CrashPoint) {if(this.#crashAt===point) throw new Error('SimulatedLaunchCrash');}
  #save() {
    const state=this.#monitor!.state,n=this.#records+1,hash=digest(state);
    // Another writer (or an external edit) since our last save: never overwrite newer evidence.
    const {records,tail}=this.#journalRecords(state.taskId,state.planHash);
    if(records.length!==this.#records||tail!=='') throw new Error('ConcurrentLaunchWriter');
    if(existsSync(this.#commit)) {
      const last=JSON.parse(readFileSync(this.#commit,'utf8'));
      if(!obj(last)||last.committed!==true||last.record!==this.#records) throw new Error('ConcurrentLaunchWriter');
    }
    const identity={schema:COMMIT,record:n,taskId:state.taskId,planHash:state.planHash,hash};
    atomicWriteJson(this.#commit,{...identity,committed:false,state});this.#crash('intent');
    if(!existsSync(this.#marker)) {atomicWriteJson(this.#marker,{schema:MARKER,taskId:state.taskId,planHash:state.planHash});this.#crash('marker');}
    this.#append(JSON.stringify({record:n,taskId:state.taskId,planHash:state.planHash,hash})+'\n');this.#records=n;this.#crash('journal');
    atomicWriteJson(this.#file,state);this.#crash('state');
    atomicWriteJson(this.#commit,{...identity,committed:true});
  }
  /** Bounded result for a failure: rejected input and plan mismatch change nothing and are not sticky. */
  #failure(e:unknown) {
    if(e instanceof LaunchInputRejected) {const [code,message]=REJECTED[e.code]??REJECTED.InvalidObservation;return {ok:false as const,code,message};}
    if(e instanceof LaunchPlanMismatch) return {ok:false as const,code:'launch-plan-mismatch',message:`${this.#mismatchZh(e)}：没有保存，旧记录不会改绑到新计划`};
    if(e instanceof LaunchTransient) return TRANSIENT;
    this.#error='LaunchEvidenceUnavailable';return STUCK;
  }
  #mismatchZh(e:LaunchPlanMismatch,doc:TaskDoc|null=null) {
    let current='当前计划';
    try {
      const d=doc??this.#app.doc(),cur=currentPlan(d),revs=d.planRevs.filter(r=>r.planHash===e.savedHash).map(r=>`v${r.rev}`);
      current=`当前计划是 v${cur.rev}（哈希 ${cur.planHash.slice(0,12)}）`;
      return `回放记录绑定计划 ${revs.join('/')||'（未在本任务中找到的版本）'}（哈希 ${e.savedHash.slice(0,12)}），${current}`;
    } catch {return `回放记录绑定的计划（哈希 ${e.savedHash.slice(0,12)}）不是${current}`;}
  }
  #change(f:(m:LaunchMonitor)=>void, message='已保存离线观察；没有官网选择、订单或付款动作') {
    let m:LaunchMonitor;
    try {m=this.#load(this.#doc());} catch(e) {return this.#failure(e);}
    try {f(m);} catch(e) {return this.#failure(e);}
    try {this.#save();} catch(e) {this.#error='LaunchEvidenceUnavailable';return STUCK;}
    return {ok:true as const,message};
  }
  ownerChanged() {
    // Samples were issued to the previous controlling document; they can never be used again.
    this.#issued=[];
    try {this.#load(this.#doc());if(this.#records===0)return {ok:true as const,message:'控制页面已更换'};}
    catch(e) {
      // Not loadable now (plan mismatch, transient read): drop the in-memory page so a later load restarts from disk
      // with every old reference invalid.
      if(!this.#error) this.#monitor=null;
      return this.#failure(e);
    }
    return this.#change(m=>m.invalidatePage());
  }
  /**
   * synthetic-sample: must equal a sample this service issued to the same tab under the same plan, used once.
   * Completeness comes from the issued sample, never from the request. imported-observation: analysed in memory only.
   */
  observe(raw:unknown,source:ObservationSource,owner:string|null=null) {
    if(source==='imported-observation') return this.#preview(raw);
    if(source!=='synthetic-sample') return this.#failure(new LaunchInputRejected('InvalidSource'));
    return this.#change(m=>{
      if(!validateObservation(raw)) throw new LaunchInputRejected('InvalidObservation');
      const now=Date.now(),planHash=m.state.planHash,p=projection(raw);
      this.#issued=this.#issued.filter(x=>now-x.issuedAt<SAMPLE_LIMITS.ttlMs);
      const mine=this.#issued.filter(x=>x.owner===owner&&x.planHash===planHash);
      const hit=mine.find(x=>x.projection===p);
      if(!hit) throw new LaunchInputRejected(mine.length?'SampleMismatch':'SampleNotIssued');
      if(raw.listCompleteness==='synthetic-complete'&&!hit.complete) throw new LaunchInputRejected('SampleMismatch');
      m.ingest(raw,new Date(now).toISOString(),'synthetic-sample');
      this.#issued.splice(this.#issued.indexOf(hit),1);
    });
  }
  /** Imported JSON never changes the task: it is checked and classified on a throw-away copy, then discarded. */
  #preview(raw:unknown) {
    let m:LaunchMonitor,doc:TaskDoc;
    try {doc=this.#doc();m=this.#load(doc);} catch(e) {return this.#failure(e);}
    try {
      if(!validateObservation(raw)) throw new LaunchInputRejected('InvalidObservation');
      const cur=currentPlan(doc),probe=LaunchMonitor.restore(m.toJSON(),{taskId:doc.taskId,planHash:cur.planHash,plan:cur.plan,relativeDates:3});
      const next=probe.ingest({...raw,listCompleteness:'unverified'},new Date().toISOString(),'imported-observation'),stage=probe.state.stage;
      return {ok:true as const,code:'imported-preview',message:`导入的观察只在内存中分析：${STAGE_ZH[stage]}。未保存、不会产生候选，也不会发起任何操作`,preview:{stage,detail:probe.state.detail,next}};
    } catch(e) {return this.#failure(e);}
  }
  pause(paused:boolean) {return this.#change(m=>m.setPaused(paused),paused?'已暂停回放建议：不发起新操作':'已恢复观察：需要重新观察当前页面');}
  fixturePending() {return this.#change(m=>{if(!currentPlan(this.#doc()).plan.fake)throw new LaunchInputRejected('NotFake');m.setPending({opId:'synthetic-unknown-submit',kind:'submitOrder',status:'unknown',epoch:m.state.epoch});},'已登记合成的“提交结果不明”：之后只能先只读核实');}
  /** Issue one synthetic sample to `owner` (the requesting tab). Its observation can be saved once, by that tab. */
  sample(id:string,owner:string|null=null) {
    const cur=currentPlan(this.#doc()),s=replaySample(id,cur.plan),now=Date.now();
    this.#issued=this.#issued.filter(x=>now-x.issuedAt<SAMPLE_LIMITS.ttlMs).slice(-(SAMPLE_LIMITS.outstanding-1));
    this.#issued.push({owner,planHash:cur.planHash,issuedAt:now,complete:s.syntheticComplete,projection:projection(sampleObservation(s))});
    return s;
  }
  view() {
    let doc:TaskDoc,core:ReturnType<TaskApp['state']>,owner:ReturnType<TaskApp['ownerStatus']>;
    try {doc=this.#app.doc();core=this.#app.state();owner=this.#app.ownerStatus();}
    catch {return {fake:true,realAdapter:false,blocked:true,transient:true,status:{step:'暂时无法读取任务状态：本次不显示建议',next:'稍后自动重试；不会发起任何操作，也不会改写记录',lastValid:'无法读取',binding:'无法读取'},next:{kind:'wait',reason:'task-state-unavailable'}};}
    try {
      const m=this.#load(doc),state=m.state;
      const externalPending=!!owner.pendingOp||!!core.engine.pendingOp||core.ledger.entries>0||core.engine.needsHuman;
      return {fake:true,realAdapter:false,taskId:state.taskId,planHash:state.planHash,state,status:m.statusZh(),next:externalPending?{kind:'reconcile',reason:'existing-task-result-must-be-reconciled'}:m.next(),externalPending,blocked:false};
    } catch(e) {
      if(e instanceof LaunchPlanMismatch) {
        const cur=currentPlan(doc);
        return {fake:true,realAdapter:false,blocked:true,planMismatch:{savedPlanHash:e.savedHash,savedRevs:doc.planRevs.filter(r=>r.planHash===e.savedHash).map(r=>r.rev),currentRev:cur.rev,currentPlanHash:cur.planHash},
          status:{step:`${this.#mismatchZh(e,doc)}：计划不一致，回放记录不会改绑到新计划`,next:'如要继续这些回放记录，请把计划改回原版本；不会删除或改写已保存的记录',lastValid:'—',binding:'仍绑定原计划版本'},next:{kind:'handoff',reason:'launch-plan-mismatch'}};
      }
      if(e instanceof LaunchTransient) return {fake:true,realAdapter:false,blocked:true,transient:true,status:{step:'暂时无法读取任务状态：本次不显示建议',next:'稍后自动重试；不会发起任何操作，也不会改写记录',lastValid:'无法读取',binding:'无法读取'},next:{kind:'wait',reason:'task-state-unavailable'}};
      this.#error='LaunchEvidenceUnavailable';
      return {fake:true,realAdapter:false,blocked:true,status:{step:'页面回放证据无法核对',next:'请人工核对，保留记录，不删除历史',lastValid:'无法核对',binding:'无法核对'},next:{kind:'handoff',reason:'launch-evidence'}};
    }
  }
}
