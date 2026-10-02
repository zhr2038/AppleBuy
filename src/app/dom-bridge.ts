// C-010 Codex quota takeover: actual local DOM transport. Only our loopback FAKE document can execute.
// The original engine/runner mock-only guards are retained. This is NOT an Apple adapter.
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { Engine, createMockFormalCapability } from '../engine.ts';
import { FileJournal, readJournal } from '../journal.ts';
import { runEngine } from '../runner.ts';
import type { CheckoutPort, PortReply } from '../runner.ts';
import { TaskStore, currentPlan, latestRun, letterId } from './task-store.ts';
import { acquireOwnership } from './owner-lock.ts';
import type { Plan } from '../plan.ts';

export const DOM_SCOPE='fake-dom-only';
export const DOM_PLAN:Plan={schema:'pickup-plan/v1',fake:true,label:'FAKE Pro 原生控件自动下单演练',timezone:'Asia/Shanghai',fulfillment:'pickup',quantity:1,maxTotalCny:9999,
  products:[{id:'FAKE-PRO-256-BLACK',model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'}],stores:[{label:'FAKE 大连直营店',role:'primary'}],
  dates:['2099-01-01','2099-01-02','2099-01-03'],windows:[{start:'10:00',end:'22:00'}],arrival:{earliest:'10:00',latest:'22:00'},priority:['date','store','window'],slotSelection:'last-offered-per-store-date',
  bounds:{maxRefusals:5,maxRefreshes:5,maxAttemptsPerSlot:2,minRefreshIntervalMs:50,maxQueryFailures:2,maxReconcileAttempts:2},paymentMethodLabel:'支付宝'};

export type DomCommand={scope:typeof DOM_SCOPE;id:string;client:string;document:string;taskId:string;runId:string;planHash:string;method:string;opId?:string;ref?:string;expect:Plan};
/** A delivered command is never replayed on connection changes or timeout. */
export class DomMailbox {
  readonly timeoutMs:number; #pending:{command:DomCommand;resolve:(r:PortReply)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}|null=null;
  send:(command:DomCommand)=>void;
  constructor(send:(command:DomCommand)=>void,timeoutMs=8000){this.send=send;this.timeoutMs=timeoutMs;}
  request(command:DomCommand):Promise<PortReply>{
    if(this.#pending) return Promise.reject(new Error('DomMutationAlreadyInFlight'));
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{if(this.#pending?.command.id===command.id){this.#pending=null;reject(new Error('DomResultUnknown'));}},this.timeoutMs);
      this.#pending={command,resolve,reject,timer};
      try{this.send(command);}catch{this.disconnect();}
    });
  }
  reply(client:string,document:string,id:string,reply:unknown):boolean{
    const p=this.#pending;
    if(!p||p.command.client!==client||p.command.document!==document||p.command.id!==id)return false;
    if(!reply||typeof reply!=='object'||Array.isArray(reply)||!('body' in reply)||Object.keys(reply).some(k=>!['body','simulatedMs'].includes(k)))return false;
    const body=(reply as any).body;
    if(p.command.opId&&body&&typeof body==='object'&&body.opId!==undefined&&body.opId!==p.command.opId)return false;
    // Browser only sends bounded semantic fake contract fields. Runner classifiers validate business data.
    if(JSON.stringify(reply).length>64000)return false;
    this.#pending=null;clearTimeout(p.timer);p.resolve({body:(reply as any).body,simulatedMs:0});return true;
  }
  disconnect(){const p=this.#pending;this.#pending=null;if(p){clearTimeout(p.timer);p.reject(new Error('DomDisconnectedResultUnknown'));}}
  get pending(){return this.#pending?.command??null;}
}

const ASSETS:Record<string,[string,string]>={'/':['desktop/index.html','text/html; charset=utf-8'],'/desktop/app.js':['desktop/app.js','text/javascript'],'/desktop/motor.js':['desktop/motor.js','text/javascript'],'/desktop/fixture.js':['desktop/fixture.js','text/javascript'],'/style.css':['style.css','text/css']};
const ROOT=resolve(import.meta.dirname,'../..');
const CLIENT=/^c-[a-z0-9-]{8,64}$/;const DOCUMENT=/^d-[a-z0-9-]{8,64}$/;
const CSP="default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
type Client={res:http.ServerResponse;document:string};

export async function startDomDemo(taskDir:string,o:{port?:number;timeoutMs?:number;plan?:Plan}={}){
  const store=new TaskStore(taskDir);let engine:Engine|null=null,loop:Promise<unknown>|null=null;let failure:string|null=null,closed=false,controller:string|null=null,document:string|null=null;
  const clients=new Map<string,Client>();const controls:any[]=[];let signal=()=>{};let gate=new Promise<void>(r=>signal=r);
  const wake=()=>{signal();gate=new Promise<void>(r=>signal=r);};
  const token=randomBytes(24).toString('hex');
  const own=await acquireOwnership(store.dir,letterId('owner'),()=>({scope:DOM_SCOPE,phase:engine?.phase??'idle',running:!!loop}));
  if(!own.ok)throw new Error('DomOwnerUnavailable');
  const loaded=store.load(o.plan??DOM_PLAN,Date.now(),own.previous.kind!=='none');
  if(!loaded.ok){await own.lock.release();throw new Error('DomTaskEvidenceUnavailable');}
  const load=()=>{const r=store.load(null,Date.now());if(!r.ok)throw new Error('DomTaskEvidenceUnavailable');return r.doc;};
  const plan=currentPlan(loaded.doc).plan;
  if(!plan.fake){await own.lock.release();throw new Error('RealActionBlocked');}
  const readHistory=()=>{const d=load(),last=latestRun(d);if(!last)return null;const r=readJournal(store.journalPath(last.runId),last.planHash);return r.ok?{runId:last.runId,records:r.records}:null;};
  let history=readHistory();
  const snap=()=>{
    const d=load(),ev=store.ledger.evidence();
    return {scope:DOM_SCOPE,taskId:d.taskId,plan:currentPlan(d),engine:engine?.snapshot()??null,running:!!loop,failure,history,
      startBlocked:closed||!!loop||d.runs.length>0||!ev.ok||ev.entries.length>0,ledger:ev.ok?ev.entries.map(x=>({status:x.status,runId:x.runId})):['unverifiable'],controller,document};
  };
  const push=()=>{let state;try{state=snap();}catch{state={scope:DOM_SCOPE,startBlocked:true,failure:'持久记录无法验证，停止操作'};}
    for(const [client,x]of clients)x.res.write(`data: ${JSON.stringify({type:'state',you:controller===client,state})}\n\n`);
  };
  const mailbox=new DomMailbox(command=>{const c=clients.get(command.client);if(!c||controller!==command.client||document!==command.document)throw new Error('DomNoController');c.res.write(`data: ${JSON.stringify({type:'command',command})}\n\n`);},o.timeoutMs);
  const start=(client:string,doc:string)=>{
    if(controller!==client||document!==doc||snap().startBlocked)throw new Error('DomStartBlocked');
    const d=load(),cur=currentPlan(d),runId=letterId('run');
    const run={runId,rev:cur.rev,planHash:cur.planHash,startedAt:Date.now(),siteScenario:'fake-dom-chrome',capability:null};
    d.runs.push(run);store.save(d); // one run recorded before bootstrap or any DOM action; restart never creates another
    const journal=new FileJournal(store.journalPath(runId));
    engine=new Engine({plan:cur.plan,planHash:cur.planHash,runId,journal,ledger:store.ledger,now:Date.now,portKind:'mock',capability:createMockFormalCapability(cur.planHash,runId,Date.now()+120000)});
    const request=(method:string,opId?:string,ref?:string)=>{
      const current=load();
      if(closed||controller!==client||document!==doc||current.taskId!==d.taskId||currentPlan(current).planHash!==cur.planHash||latestRun(current)?.runId!==runId||!store.ledger.evidence().ok)throw new Error('DomEvidenceOrBindingChanged');
      return mailbox.request({scope:DOM_SCOPE,id:letterId('cmd'),client,document:doc,taskId:d.taskId,runId,planHash:cur.planHash,method,opId,ref,expect:cur.plan});
    };
    const port:CheckoutPort={kind:'mock',label:'FAKE 本机 Chrome DOM',observe:()=>request('observe'),chooseSlot:(id,ref)=>request('chooseSlot',id,ref),advance:id=>request('advance',id),submitOrder:(id,cap)=>{
      if(cap.scope!=='mock-only')throw new Error('RealActionBlocked');return request('submitOrder',id);},lookupOrder:id=>request('lookupOrder',id)};
    const boundEngine=engine;
    push(); // bind the browser motor to the task/run/plan before the first command is delivered
    loop=(async()=>{
      journal.append('dom-bootstrap',{runId,planHash:cur.planHash,kind:'intent',t:Date.now()});
      const prepared=await request('prepare');
      if((prepared.body as any)?.prepared!==true)throw new Error('DomPreparationStopped');
      const afterPrepare=load();
      if(currentPlan(afterPrepare).planHash!==cur.planHash||latestRun(afterPrepare)?.runId!==runId||!store.ledger.evidence().ok)throw new Error('DomPreparationEvidenceChanged');
      journal.append('dom-bootstrap',{runId,planHash:cur.planHash,kind:'completed',t:Date.now()});
      await runEngine(boundEngine,port,{now:Date.now,advance(){},advanceTo(){}},{maxSteps:200,hooks:{
        takeControls:()=>controls.splice(0),controlSignal:()=>gate,closing:()=>closed||controller!==client||document!==doc,
        sleepUntil:t=>new Promise<void>(r=>setTimeout(r,Math.max(0,t-Date.now()))),
        beforeSend:()=>{load();if(!store.ledger.evidence().ok)throw new Error('DomEvidenceStopped');},onChange:push}});
    })().catch(()=>{failure='执行停止或结果不明：保留记录，不重新下单；请只读核实';}).finally(()=>{loop=null;try{history=readHistory();}catch{failure='历史无法验证，停止操作';}push();});
    push();
  };
  let origin='';
  const server=http.createServer(async(req,res)=>{
    try{
      if(req.headers.host!==new URL(origin).host){res.writeHead(403);res.end();return;}
      const url=new URL(req.url??'/',origin);
      if(req.method==='GET'&&ASSETS[url.pathname]){
        const [name,type]=ASSETS[url.pathname];let bytes=readFileSync(join(ROOT,'web',name));
        if(url.pathname==='/')bytes=Buffer.from(bytes.toString().replace('__TOKEN__',token));
        res.writeHead(200,{'content-type':type,'cache-control':'no-store','content-security-policy':CSP,'x-content-type-options':'nosniff'});res.end(bytes);return;
      }
      if(req.method==='GET'&&url.pathname==='/dom/events'){
        const c=url.searchParams.get('client')??'',doc=url.searchParams.get('document')??'';
        if(url.searchParams.get('token')!==token||!CLIENT.test(c)||!DOCUMENT.test(doc)||clients.has(c)){res.writeHead(403);res.end();return;}
        res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-store'});clients.set(c,{res,document:doc});
        if(!controller&&!loop){controller=c;document=doc;}push();
        req.on('close',()=>{clients.delete(c);if(controller===c){controller=null;document=null;mailbox.disconnect();wake();}push();});return;
      }
      if(req.method!=='POST'||req.headers.origin!==origin||req.headers['content-type']!=='application/json'||req.headers['x-dom-token']!==token){res.writeHead(403);res.end();return;}
      const client=String(req.headers['x-dom-client']??''),doc=String(req.headers['x-dom-document']??'');
      if(!CLIENT.test(client)||!DOCUMENT.test(doc)||controller!==client||document!==doc){res.writeHead(409);res.end(JSON.stringify({ok:false}));return;}
      let text='';for await(const bytes of req){text+=bytes;if(text.length>65000)throw new Error('BoundedInput');}
      const body=JSON.parse(text);let ok=false;
      if(url.pathname==='/dom/start'){if(Object.keys(body).length)throw new Error('StartInput');start(client,doc);ok=true;}
      else if(url.pathname==='/dom/reply')ok=mailbox.reply(client,doc,body.id,body.reply);
      else if(url.pathname==='/dom/control'&&['pause','resume','stop'].includes(body.action)&&loop){controls.push(body.action);wake();ok=true;}
      res.writeHead(ok?200:409,{'content-type':'application/json'});res.end(JSON.stringify({ok}));
    }catch{res.writeHead(409,{'content-type':'application/json'});res.end(JSON.stringify({ok:false,message:'已拒绝操作；请核对当前状态和记录'}));}
  });
  try{await new Promise<void>((yes,no)=>{server.once('error',no);server.listen(o.port??0,'127.0.0.1',yes);});}
  catch(e){await own.lock.release();throw e;}
  const port=(server.address()as any).port;origin=`http://127.0.0.1:${port}`;
  return {url:origin+'/',port,token,taskDir:store.dir,snapshot:snap,mailbox,close:async()=>{closed=true;mailbox.disconnect();wake();for(const x of clients.values())x.res.end();clients.clear();await loop;await new Promise<void>(r=>server.close(()=>r()));await own.lock.release();}};
}
