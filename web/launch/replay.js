import { fromDom, observePage, classifyTransport } from './observer.js';
const $=id=>document.getElementById(id);
const token=document.querySelector('meta[name="session-token"]').content;
const client=`c-${crypto.randomUUID().replaceAll('-','').slice(0,20)}`;
const nativeRadioOption=document.createElement('option');nativeRadioOption.value='pickup-input-radios';nativeRadioOption.textContent='原生日期单选与时段选择';$('scenario').append(nativeRadioOption);
const headers={'content-type':'application/json','x-session-token':token,'x-client-id':client};
let current=null,first=true,busy=false;
async function post(path,body){const r=await fetch(path,{method:'POST',headers,body:JSON.stringify(body)});const data=await r.json();$('message').textContent=data.message??'操作已完成';return data;}
const events=new EventSource(`/api/events?client=${client}&token=${token}`);
function render(s){
  current=s;const l=s.launch;
  $('control').textContent=s.control.you?'本标签页可更新回放记录':'本标签页只读；另一个标签页持有控制权';
  $('step').textContent=l.status.step;$('next').textContent=l.externalPending?'现有任务有待核实结果，先核对，不发起新动作':l.status.next;
  $('binding').textContent=l.status.binding;$('last').textContent=`最后有效观察：${l.status.lastValid}`;
  $('candidates').textContent=l.next.kind==='candidates'?l.next.offers.length?`离线候选：${l.next.offers.map(x=>`${x.store} ${x.date} ${x.start}–${x.end}`).join('；')}`:'没有符合末档限制的候选':'尚未产生可用候选';
  $('technical').textContent=JSON.stringify({epoch:l.state?.epoch,obsSeq:l.state?.obsSeq,next:l.next,pending:l.state?.pending,floors:l.state?.floors,realAdapter:false},null,2);
  for(const id of ['observe','resume','import','pending'])$(id).disabled=!s.control.you||l.blocked||busy;
  $('claim').disabled=s.control.you;
}
events.onmessage=async e=>{const s=JSON.parse(e.data);render(s);if(first){first=false;if(!s.control.held)await post('/api/claim',{});}};
events.onerror=()=>{$('control').textContent='连接中断；不会发起新操作。请保留记录并核对服务状态';for(const id of ['observe','resume','import','pending'])$(id).disabled=true;};
$('claim').onclick=()=>post('/api/claim',{});
$('pause').onclick=()=>post('/api/launch/pause',{paused:true});
$('resume').onclick=()=>post('/api/launch/pause',{paused:false});
$('pending').onclick=()=>post('/api/launch/pending-fixture',{});
$('import').onclick=async()=>{try{await post('/api/launch/observe',{source:'imported-observation',observation:JSON.parse($('observation').value)});}catch{$('message').textContent='观察 JSON 无法解析；没有更新记录';}};
$('observe').onclick=async()=>{
  if(busy||!current?.control.you)return;busy=true;render(current);
  try {
    const r=await fetch(`/api/launch/sample?id=${encodeURIComponent($('scenario').value)}`,{headers});
    const sample=await r.json();if(!r.ok)throw new Error('SampleUnavailable');
    const parsed=new DOMParser().parseFromString(sample.html,'text/html');
    // The HTML is generated only by our checked fixture builder, never accepted from the import input.
    $('sample').replaceChildren(...[...parsed.body.childNodes].map(n=>document.importNode(n,true)));
    const observedAt=new Date().toISOString();
    let obs=observePage(fromDom($('sample')),{observedAt,expect:sample.expect});
    const transport=sample.transport?classifyTransport(sample.transport):null;
    if(transport)obs={...obs,...transport};
    if(sample.syntheticComplete)obs.listCompleteness='synthetic-complete';
    await post('/api/launch/observe',{source:'synthetic-sample',observation:obs});
  } catch {$('message').textContent='观察失败；不能判断有货或无货，没有发起购买动作';}
  finally{busy=false;if(current)render(current);}
};
