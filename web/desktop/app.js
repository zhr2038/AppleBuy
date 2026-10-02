import {FakeMerchant} from './fixture.js';
import {DomMotor} from './motor.js';
const $=id=>document.getElementById(id);const token=document.querySelector('meta[name="dom-token"]').content;
const identity={client:'c-'+crypto.randomUUID(),document:'d-'+crypto.randomUUID()};const motor=new DomMotor(document,location.href,identity);
const merchant=new FakeMerchant($('merchant'));let state=null,configured=false,active=false,startedAt=0;
const headers={'content-type':'application/json','x-dom-token':token,'x-dom-client':identity.client,'x-dom-document':identity.document};
async function post(path,body){const response=await fetch(path,{method:'POST',headers,body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw new Error('DomRequestRefused');return result;}
const stream=new EventSource(`/dom/events?token=${token}&client=${identity.client}&document=${identity.document}`);
stream.onmessage=async event=>{
  const data=JSON.parse(event.data);
  if(data.type==='state'){
    state=data.state;active=data.you;
    identity.taskId=state.taskId;identity.runId=state.engine?.runId;identity.planHash=state.plan?.planHash;
    $('start').disabled=!active||state.startBlocked;$('scenario').disabled=state.startBlocked;
    for(const action of ['pause','resume','stop'])$(action).disabled=!active||!state.running;
    if(state.plan&&!configured){merchant.configure(state.plan.plan,$('scenario').value);configured=true;}
    $('target').textContent=state.plan?`虚构计划：${state.plan.plan.products[0].model} ${state.plan.plan.products[0].capacity} ${state.plan.plan.products[0].color}，1 台，上限 ¥${state.plan.plan.maxTotalCny}，每天末档，${state.plan.plan.stores[0].label}`:'';
    $('status').textContent=(active?'':'本标签页只读；')+(state.failure??(state.engine?`程序状态：${state.engine.phase}；明确拒绝 ${state.engine.refusals} 次`:(state.startBlocked?'已有历史或提交记录：不能新建订单，只读保留':'已就绪：本标签页执行')));
    $('merchant').hidden=state.startBlocked&&(!active||!startedAt);
    if(state.engine?.phase==='ORDER_CONFIRMED_MOCK')$('result').textContent=startedAt&&active?`已独立核实一张未付款模拟订单。实际本机 DOM 链路耗时 ${(performance.now()-startedAt).toFixed(0)}ms（单次，本机虚构页面，不代表官网速度）。最终点击 ${merchant.state.submits} 次，订单 ${merchant.state.orders.length} 张。`:'保存的运行已确认一张模拟订单。本页只展示保存的结果，不再次执行。';
    if(!state.engine&&state.history)$('result').textContent='已恢复保存的运行记录；不自动重新执行。虚构商店页面只保存在原标签页中，本页面不能证明当前订单状态。';
    if(state.engine?.phase==='MANUAL_VERIFICATION')$('result').textContent=state.ledger?.some(x=>typeof x==='object')?'提交结果仍不明：已停止，保留唯一提交记录，不再下单。':'动作结果仍不明：已停止，保留运行记录，不再执行新动作。';
    $('trace').textContent=JSON.stringify({engine:state.engine,ledger:state.ledger,history:state.history,scope:state.scope},null,2);return;
  }
  if(data.type==='command'){
    if(!active)return;let reply;try{reply=await motor.execute(data.command);}catch{reply={body:{contract:'mock-v0',kind:'error',error:'network',opId:data.command.opId},simulatedMs:0};}
    // Explicit offline fault injection: final DOM click happened, but its transport reply is lost.
    if(merchant.scenario==='lost-reply'&&data.command.method==='submitOrder')return;
    try{await post('/dom/reply',{id:data.command.id,reply});}catch{$('status').textContent='回复失联或过期：结果可能不明，不能重新操作';}
  }
};
stream.onerror=()=>{active=false;for(const action of ['start','pause','resume','stop'])$(action).disabled=true;$('status').textContent='连接中断：停止新操作，保留记录；不要重建任务或重新下单';};
$('scenario').onchange=()=>{if(!state?.startBlocked)merchant.configure(state.plan.plan,$('scenario').value);};
$('start').onclick=async()=>{$('start').disabled=true;startedAt=performance.now();try{await post('/dom/start',{});}catch{$('status').textContent='开始被拒绝：请核对当前记录，不要重复下单';}};
for(const action of ['pause','resume','stop'])$(action).onclick=()=>post('/dom/control',{action}).catch(()=>{$('status').textContent='控制请求未被接受；请保留当前状态';});
