import {PurchaseJob,TASK_KEY} from './job.js';
import {ChromePort,allowedMerchantUrl} from './chrome-port.js';
import {withPurchaseOwner} from './owner.js';
const $=id=>document.getElementById(id);let job=null;
const store={async get(k){return (await chrome.storage.local.get(k))[k]??null;},async put(k,v){await chrome.storage.local.set({[k]:v});}};
const status=s=>{$('state').textContent=s;};
const plan=()=>({schema:'applebuy-intent/v1',product:$('product').value==='duo'?{model:'iPhone Duo',capacity:'256GB',color:'星光白色'}:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:$('product').value==='duo'?15999:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝'});
$('find').onclick=async()=>{const tabs=(await chrome.tabs.query({})).filter(t=>allowedMerchantUrl(t.url));$('tab').replaceChildren(...tabs.map(t=>{const o=document.createElement('option');o.value=t.id;o.textContent=`${new URL(t.url).hostname} · 标签页 ${t.id}`;return o;}));status(tabs.length?'请选择唯一的官网标签页':'没有可访问的官网标签页；先本人打开官网');};
$('permission').onclick=async()=>{try{const t=await chrome.tabs.get(Number($('tab').value));if(!allowedMerchantUrl(t.url))throw new Error();const ok=await chrome.permissions.request({origins:[new URL(t.url).origin+'/*']});status(ok?'该官网主机访问已允许；页面跨主机后需本人另行确认':'访问未允许');}catch{status('当前标签页或权限不可用');}};
let finalGrant=null,activeGrant=null,prepared=null;
async function digestPlan(p){const bytes=new TextEncoder().encode(JSON.stringify(p));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');}
$('prepare').onclick=async()=>{try{const p=plan(),tabId=Number($('tab').value),digest=await digestPlan(p),previous=await store.get(TASK_KEY),port=new ChromePort(chrome,tabId,{initialSequence:previous?.lastRead??0});const o=await port.observe(p);if(!o.termsLinks?.length){prepared=null;status('该页面未识别当前商店条款；可推进到官网复核页后再确认');return;}prepared={taskId:previous?.taskId??crypto.randomUUID(),planDigest:digest,tabId,entryDocumentId:previous?.entryDocumentId??o.documentId,termsUrl:o.termsLinks[0]};$('terms').href=prepared.termsUrl;status('只读预检完成。核对购买条件和条款后可一键开始；尚未提交任何购买动作');}catch{prepared=null;status('预检未完成；请核实当前标签页和主机授权');}};
$('savePrivate').onclick=async()=>{const v={};for(const k of ['firstName','lastName','phone','email','identitySuffix'])if($(k).value)v[k]=$(k).value;if(v.identitySuffix&&!/^\d{4}$/.test(v.identitySuffix)){status('证件后四位格式不正确');return;}await chrome.storage.session.set({applebuyPickupSession:v});status('自提资料已仅保留在本次 Chrome 会话，不进入购买记录或日志');};
async function run(starting=false){
  if(!$('approve').checked){status('需要本人明确允许本次结账推进；历史授权不能复用');return;}
  if(!navigator.locks){status('浏览器缺少执行互斥能力，无法安全运行');return;}
  const ownership=await withPurchaseOwner(navigator.locks,async()=>{
    const p=plan(),tabId=Number($('tab').value),digest=await digestPlan(p);
    if(starting){activeGrant=null;if($('finalReview').checked){if(!prepared||prepared.planDigest!==digest||prepared.tabId!==tabId){status('一键购买前需重新只读预检；当前购买条件已变化或尚未预检');return;}activeGrant={...prepared,id:crypto.randomUUID(),start:true,termsAccepted:true,existingOrdersChecked:true,noExtras:true,expiry:Date.now()+1200000};}}
    const useGrant=finalGrant??activeGrant;
    const previous=await store.get(TASK_KEY),privatePickupData=(await chrome.storage.session.get('applebuyPickupSession')).applebuyPickupSession??{};
    const port=new ChromePort(chrome,tabId,{authorized:true,initialSequence:previous?.lastRead??0,acceptedSlot:previous?.acceptedSlot??null,pending:previous?.pending??null,privatePickupData,reviewGrant:useGrant});
    job=new PurchaseJob({store,port,maxSteps:300,onState:s=>status(`状态：${s.state}；页面：${s.phase??'尚未读取'}；${s.reason??''}`)});
    try{const result=await job.run(p,{tabId,planDigest:digest,grant:useGrant,taskId:useGrant?.taskId??null});$('final').disabled=result.lastPhase!=='REVIEW'||result.finalIntent!==null;if(result.lastPhase==='REVIEW'&&port.last?.raw.termsLinks?.length){$('terms').href=port.last.raw.termsLinks[0];}}catch{status('执行已停止，请核实当前任务；已发送的动作不会自动重试');}finally{job=null;finalGrant=null;}
  });
  if(!ownership.owned)status('另一控制页正在执行，当前页只读');
}
$('start').onclick=()=>run(true);$('resume').onclick=()=>run(false);$('pause').onclick=()=>job?.pause();$('stop').onclick=()=>{activeGrant=null;job?.stop();};
$('final').onclick=async()=>{if(!$('finalReview').checked){status('需要本人核对当前官网并确认这一张订单');return;}const s=await store.get(TASK_KEY);if(!s||s.lastPhase!=='REVIEW'||s.finalIntent){status('当前任务不能发出新的最终订单');return;}finalGrant={id:crypto.randomUUID(),taskId:s.taskId,planDigest:s.planDigest,documentId:s.lastDocumentId,termsUrl:$('terms').href,termsAccepted:true,existingOrdersChecked:true,noExtras:true,expiry:Date.now()+120000};await run();};
// No delete/reset: completed and unknown purchase history cannot be erased by reopening a control page.
const saved=await store.get(TASK_KEY);if(saved)status(`保留的任务：${saved.state}；重新打开不会清除购买或未知记录`);
