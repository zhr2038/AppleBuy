// Codex implementation tests for the quota-takeover DOM transport. All network is loopback.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DomMailbox,DOM_PLAN,startDomDemo } from '../src/app/dom-bridge.ts';
import type {DomCommand} from '../src/app/dom-bridge.ts';
import { assertFakeTarget,validateConditions,DomMotor } from '../web/desktop/motor.js';
import { classifyPage } from '../src/observe.ts';
import { tempDir } from './helpers.ts';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {planHash} from '../src/plan.ts';
const command:DomCommand={scope:'fake-dom-only',id:'cmd-testletters',client:'c-clientletters',document:'d-documentletters',taskId:'task-fakeletters',runId:'run-fakeletters',planHash:'0123456789abcdef',method:'observe',expect:DOM_PLAN};
test('DOM transport refuses another tab/document, stale ack and duplicate ack without changing the live request',async()=>{
  const m=new DomMailbox(()=>{},2000),pending=m.request(command),reply={body:{contract:'mock-v0',kind:'page'},simulatedMs:0};
  assert.equal(m.reply('c-otherclient',command.document,command.id,reply),false);
  assert.equal(m.reply(command.client,'d-oldletters',command.id,reply),false);
  assert.equal(m.reply(command.client,command.document,'cmd-oldletters',reply),false);
  await assert.rejects(m.request({...command,id:'cmd-secondletters'}),/AlreadyInFlight/);
  assert.equal(m.reply(command.client,command.document,command.id,reply),true);await pending;
  assert.equal(m.reply(command.client,command.document,command.id,reply),false);
});
test('DOM timeout and disconnect are unknown, do not replay a delivered action',async()=>{
  let sends=0;const m=new DomMailbox(()=>sends++,15);
  await assert.rejects(m.request({...command,method:'submitOrder'}),/ResultUnknown/);assert.equal(sends,1);assert.equal(m.pending,null);
  const next=m.request({...command,id:'cmd-nextletters'});m.disconnect();await assert.rejects(next,/DisconnectedResultUnknown/);assert.equal(sends,2);
});

test('DOM ACK cannot settle a current final command with another operation id',async()=>{
  const m=new DomMailbox(()=>{},2000),pending=m.request({...command,method:'submitOrder',opId:'op-0-1'});
  const reply={body:{contract:'mock-v0',kind:'result',opId:'op-0-2',result:'accepted'},simulatedMs:0};
  assert.equal(m.reply(command.client,command.document,command.id,reply),false);
  assert.equal(m.pending?.opId,'op-0-1');
  assert.equal(m.reply(command.client,command.document,command.id,{body:{...reply.body,opId:'op-0-1',result:'unknown'},simulatedMs:0}),true);
  assert.equal((await pending).body.result,'unknown');
});
test('DOM conditions block wrong variant, excess quantity, price, store or delivery before bootstrap',()=>{
  const p=DOM_PLAN.products[0],actual={productId:p.id,model:p.model,capacity:p.capacity,color:p.color,quantity:1,totalCny:9999,store:DOM_PLAN.stores[0].label,fulfillment:'pickup'};
  assert.equal(validateConditions(actual,DOM_PLAN),true);
  for(const change of [{model:p.model+' Max'},{color:'白色'},{quantity:2},{totalCny:10000},{store:'其他门店'},{fulfillment:'delivery'}])assert.equal(validateConditions({...actual,...change},DOM_PLAN),false);
  assert.equal(validateConditions(actual,{...DOM_PLAN,fake:false}),false);
});
test('DOM action motor structurally rejects external/real documents, including an Apple URL with a fake marker',()=>{
  const doc={querySelector:()=>({dataset:{fakeSchema:'applebuy-merchant-fixture/v1'}})};
  assert.doesNotThrow(()=>assertFakeTarget(doc,'http://127.0.0.1:1234/'));
  for(const url of ['https://www.apple.com.cn/','http://127.0.0.1:1234/checkout','http://127.0.0.1.example.org/','https://127.0.0.1/'])assert.throws(()=>assertFakeTarget(doc,url),/RealDomActionBlocked/);
  assert.throws(()=>assertFakeTarget({querySelector:()=>null},'http://127.0.0.1:1234/'),/RealDomActionBlocked/);
});

test('native DOM checkout stages satisfy the existing engine observation contract',()=>{
  const context={productId:DOM_PLAN.products[0].id,quantity:1,totalCny:9999,fulfillment:'pickup'};
  const acceptedSlot={store:DOM_PLAN.stores[0].label,date:DOM_PLAN.dates[2],start:'21:15',end:'21:30'};
  for(const [step,state] of [['accepted','CHECKOUT_REVIEW'],['details','CHECKOUT_REVIEW'],['payment','CHECKOUT_REVIEW'],['review','PRE_PAYMENT']]){
    const receiver={doc:{getElementById:()=>({dataset:{step,seq:'10'}})},context:()=>context,accepted:()=>acceptedSlot,observationSeq:0};
    assert.equal(classifyPage(DomMotor.prototype.page.call(receiver)).state,state);
    const another=DomMotor.prototype.page.call(receiver);assert.equal(another.seq,2);
  }
});
test('DOM bridge rejects foreign origins and tokens; only one tab owns it; recorded start survives restart',async()=>{
  const {dir,cleanup}=tempDir('dom-bridge-protocol');let demo:any;
  try{
    demo=await startDomDemo(dir,{timeoutMs:100});
    const ctl=new AbortController(),client='c-controllerletters',document='d-documentletters';
    const stream=await fetch(`${demo.url}dom/events?token=${demo.token}&client=${client}&document=${document}`,{signal:ctl.signal});
    const reader=stream.body!.getReader();await reader.read();
    const headers={'content-type':'application/json','origin':demo.url.slice(0,-1),'x-dom-token':demo.token,'x-dom-client':client,'x-dom-document':document};
    const request=(h:Record<string,string>)=>fetch(`${demo.url}dom/start`,{method:'POST',headers:h,body:'{}'});
    assert.equal((await request({...headers,origin:'https://www.apple.com.cn'})).status,403);
    assert.equal((await request({...headers,'x-dom-token':'wrong'})).status,403);
    assert.equal((await request({...headers,'x-dom-client':'c-secondaryletters'})).status,409);
    assert.equal((await request(headers)).status,200);
    assert.equal((await request(headers)).status,409);
    ctl.abort();await reader.cancel().catch(()=>{});await demo.close();demo=null;
    demo=await startDomDemo(dir);assert.equal(demo.snapshot().startBlocked,true);assert.equal(demo.snapshot().history.runId.startsWith('run-'),true);
    assert.equal(demo.snapshot().ledger.length,0); // bootstrap stopped, no final action; old run still blocks new start
  }finally{if(demo)await demo.close();cleanup();}
});

for(const corruption of ['journal','plan'] as const)test(`DOM bridge stops after bootstrap when ${corruption} evidence changes, before another delivered command`,async()=>{
  const {dir,cleanup}=tempDir('dom-boundary-'+corruption);let demo:any;const ctl=new AbortController();let reader:any;
  try{
    demo=await startDomDemo(dir,{timeoutMs:2000});const client='c-controllerletters',document='d-documentletters';
    const stream=await fetch(`${demo.url}dom/events?token=${demo.token}&client=${client}&document=${document}`,{signal:ctl.signal});reader=stream.body!.getReader();await reader.read();
    const headers={'content-type':'application/json','origin':demo.url.slice(0,-1),'x-dom-token':demo.token,'x-dom-client':client,'x-dom-document':document};
    const post=(path:string,body:any)=>fetch(demo.url+path,{method:'POST',headers,body:JSON.stringify(body)});
    assert.equal((await post('dom/start',{})).status,200);
    const pending=demo.mailbox.pending;assert.equal(pending.method,'prepare');
    const task=JSON.parse(readFileSync(join(dir,'task.json'),'utf8')),run=task.runs[0];
    if(corruption==='journal')writeFileSync(join(dir,'runs',run.runId,'journal.jsonl'),'corrupt\n');
    else{
      const plan={...DOM_PLAN,label:'FAKE changed plan'};task.planRevs.push({rev:2,planHash:planHash(plan),plan,savedAt:Date.now()});task.currentRev=2;
      writeFileSync(join(dir,'task.json'),JSON.stringify(task));
    }
    assert.equal((await post('dom/reply',{id:pending.id,reply:{body:{prepared:true},simulatedMs:0}})).status,200);
    for(let i=0;i<100&&demo.snapshot().running;i++)await new Promise<void>(r=>setImmediate(r));
    assert.equal(demo.snapshot().running,false);assert.ok(demo.snapshot().failure);assert.equal(demo.snapshot().startBlocked,true);assert.equal(demo.mailbox.pending,null);
    if(corruption==='journal')assert.equal(readFileSync(join(dir,'runs',run.runId,'journal.jsonl'),'utf8'),'corrupt\n');
    else assert.equal(demo.snapshot().ledger.length,0);
  }finally{ctl.abort();if(reader)await reader.cancel().catch(()=>{});if(demo)await demo.close();cleanup();}
});

test('DOM bridge keeps one task process owner and refuses a real plan before exposing a motor',async()=>{
  const one=tempDir('dom-single-owner'),real=tempDir('dom-real-plan');let demo:any;
  try{
    demo=await startDomDemo(one.dir);await assert.rejects(startDomDemo(one.dir),/DomOwnerUnavailable/);
    await assert.rejects(startDomDemo(real.dir,{plan:{...DOM_PLAN,fake:false}}),/RealActionBlocked/);
  }finally{if(demo)await demo.close();one.cleanup();real.cleanup();}
});
