// Uses the existing TaskApp OS owner and browser control lease; no second executor and no outbound site port.
import { appendFileSync, closeSync, existsSync, fsyncSync, openSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { canonicalJson } from '../plan.ts';
import { LaunchMonitor } from '../launch.ts';
import type { ObservationSource } from '../launch.ts';
import type { TaskApp } from './task-app.ts';
import { atomicWriteJson, currentPlan } from './task-store.ts';
import { replaySample } from '../../web/launch/replay-samples.js';

const digest = (value:unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
export class LaunchSession {
  #app:TaskApp; #monitor:LaunchMonitor|null=null; #error:string|null=null; #records=0;
  #file:string; #marker:string; #journal:string;
  constructor(app:TaskApp) {
    this.#app=app; this.#file=join(app.store.dir,'launch-monitor.json');this.#marker=join(app.store.dir,'launch-started.json');this.#journal=join(app.store.dir,'launch-observations.jsonl');
  }
  #load() {
    if(this.#error) throw new Error(this.#error);
    const doc=this.#app.doc(),cur=currentPlan(doc),options={taskId:doc.taskId,planHash:cur.planHash,plan:cur.plan,relativeDates:3};
    if(this.#monitor) {
      if(this.#monitor.state.planHash!==cur.planHash) {
        // Viewing an empty replay must not freeze a future plan. Once any evidence exists, keep its binding.
        const s=this.#monitor.state;
        if(this.#records===0 && s.obsSeq===0 && !s.pending && !s.binding && !s.floors.length && ![this.#file,this.#marker,this.#journal].some(existsSync)) this.#monitor=new LaunchMonitor(options);
        else throw new Error('LaunchPlanChanged');
      }
      return this.#monitor;
    }
    const artifacts=[this.#file,this.#marker,this.#journal].map(existsSync);
    if(artifacts.some(Boolean)&&!artifacts.every(Boolean)) throw new Error('LaunchEvidenceMissing');
    if(artifacts.every(Boolean)) {
      const text=readFileSync(this.#file,'utf8');
      const marker=JSON.parse(readFileSync(this.#marker,'utf8'));
      if(marker.schema!=='applebuy-launch-started/v1'||marker.taskId!==doc.taskId||marker.planHash!==cur.planHash) throw new Error('LaunchIdentityMismatch');
      const lines=readFileSync(this.#journal,'utf8').trim().split('\n').map(x=>JSON.parse(x));
      if(!lines.length||lines.some((x,i)=>x.record!==i+1||x.taskId!==doc.taskId||x.planHash!==cur.planHash||typeof x.hash!=='string'||!/^[0-9a-f]{64}$/.test(x.hash))||lines.at(-1).hash!==digest(JSON.parse(text))) throw new Error('LaunchEvidenceMismatch');
      this.#records=lines.length;
      this.#monitor=LaunchMonitor.restore(text,options);
      this.#save(); // persist restart invalidation; references never survive a process restart
    } else this.#monitor=new LaunchMonitor(options);
    return this.#monitor;
  }
  #save() {
    const state=this.#monitor!.state;
    if(existsSync(this.#journal)) {
      const records=readFileSync(this.#journal,'utf8').trim().split('\n').map(x=>JSON.parse(x));
      if(records.length!==this.#records||records.at(-1)?.record!==this.#records) throw new Error('ConcurrentLaunchWriter');
    } else if(this.#records!==0) throw new Error('LaunchJournalMissing');
    if(!existsSync(this.#marker)) atomicWriteJson(this.#marker,{schema:'applebuy-launch-started/v1',taskId:state.taskId,planHash:state.planHash});
    const record={record:++this.#records,taskId:state.taskId,planHash:state.planHash,hash:digest(state)};
    appendFileSync(this.#journal,JSON.stringify(record)+'\n');
    const fd=openSync(this.#journal,'r+');try{fsyncSync(fd);}finally{closeSync(fd);}
    atomicWriteJson(this.#file,state);
  }
  #change(f:(m:LaunchMonitor)=>void) {
    try {const m=this.#load();f(m);this.#save();return {ok:true,message:'已保存离线观察；没有官网选择、订单或付款动作'};}
    catch {this.#error='LaunchEvidenceUnavailable';return {ok:false,code:'launch-evidence',message:'页面回放记录无法验证，已停止更新并保留原文件；请人工核对，不要删除记录重新开始'};}
  }
  ownerChanged() {
    try {this.#load();if(this.#records===0)return {ok:true};}
    catch {this.#error='LaunchEvidenceUnavailable';return {ok:false};}
    return this.#change(m=>m.invalidatePage());
  }
  observe(raw:unknown,source:ObservationSource) {return this.#change(m=>m.ingest(raw,new Date().toISOString(),source));}
  pause(paused:boolean) {return this.#change(m=>m.setPaused(paused));}
  fixturePending() {return this.#change(m=>{if(!currentPlan(this.#app.doc()).plan.fake)throw new Error('NotFake');m.setPending({opId:'synthetic-unknown-submit',kind:'submitOrder',status:'unknown',epoch:m.state.epoch});});}
  sample(id:string) {return replaySample(id,currentPlan(this.#app.doc()).plan);}
  view() {
    try {
      const m=this.#load(),state=m.state;
      const owner=this.#app.ownerStatus(),core=this.#app.state();
      const externalPending=!!owner.pendingOp||!!core.engine.pendingOp||core.ledger.entries>0||core.engine.needsHuman;
      return {fake:true,realAdapter:false,taskId:state.taskId,planHash:state.planHash,state,status:m.statusZh(),next:externalPending?{kind:'reconcile',reason:'existing-task-result-must-be-reconciled'}:m.next(),externalPending,blocked:false};
    } catch {this.#error='LaunchEvidenceUnavailable';return {fake:true,realAdapter:false,blocked:true,status:{step:'页面回放证据或计划绑定无法核对',next:'请人工核对，保留记录，不删除历史',lastValid:'无法核对',binding:'无法核对'},next:{kind:'handoff',reason:'launch-evidence'}};}
  }
}
