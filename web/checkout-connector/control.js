import {PurchaseJob,TASK_KEY,VALIDATION_KEY,NO_EXTRAS,retirable} from './job.js';
import {ChromePort,allowedMerchantUrl} from './chrome-port.js';
import {withPurchaseOwner} from './owner.js';
const $=id=>document.getElementById(id);let job=null;
const store={async get(k){return (await chrome.storage.local.get(k))[k]??null;},async put(k,v){await chrome.storage.local.set({[k]:v});}};
const status=s=>{$('state').textContent=s;};
// The fixed user condition is part of the bound intent: no trade-in and no AppleCare+.
const plan=()=>({schema:'applebuy-intent/v1',product:$('product').value==='duo'?{model:'iPhone Duo',capacity:'256GB',color:'星光白色'}:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:$('product').value==='duo'?15999:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{...NO_EXTRAS}});
// Only tabs whose URL Chrome discloses AND that are supported official pages are listed; opaque tabs stay undisclosed.
$('find').onclick=async()=>{const tabs=(await chrome.tabs.query({})).filter(t=>allowedMerchantUrl(t.url));$('tab').replaceChildren(...tabs.map(t=>{const o=document.createElement('option');o.value=t.id;o.textContent=`${new URL(t.url).hostname} · 标签页 ${t.id}`;return o;}));status(tabs.length?'请选择唯一的官网标签页':'没有可读取的官网标签页：首次使用请先点“允许读取和操作官网主机”，在 Chrome 弹窗中允许 www.apple.com.cn 后再读取；或先本人打开官网');};
// C-017: Chrome hides Tab.url until host access exists, so first use cannot start from a selected tab. With no selected
// tab, the click requests ONLY the declared public origin, as its first synchronous call (no await before it keeps
// Chrome's user gesture). It never requests a secure host, tabs or anything else, and only reports the outcome: no
// job, checkbox, storage write, page script, navigation or repeat. A selected readable tab keeps its exact-origin request.
const PUBLIC_ORIGIN='https://www.apple.com.cn/*';
const exactHost=x=>typeof x==='string'&&/^https:\/\/(?:www\.apple\.com\.cn|secure\d*\.www\.apple\.com\.cn)$/.test(x)?x:null;
$('permission').onclick=async()=>{
  // Optional explicit human entry makes an opaque secure-host handoff usable without guessing tab URLs or widening access.
  const entered=$('hostOrigin')?.value?.trim();if(entered){const origin=exactHost(entered);if(!origin){status('仅可输入完整的苹果官网 HTTPS 主机，不含路径或参数；未申请权限');return;}try{const ok=await chrome.permissions.request({origins:[origin+'/*']});status(ok?'该指定官网主机已允许；请读取标签页，再点“登录后核对原任务（只读）”':'指定主机访问未允许；没有执行购买动作');}catch{status('指定主机访问请求未完成；没有执行购买动作');}return;}
  if(!$('tab').value){try{const ok=await chrome.permissions.request({origins:[PUBLIC_ORIGIN]});status(ok?'已允许读取 www.apple.com.cn 官网主机；请再点“读取当前官网标签页”。结账等其他官网主机需选中其标签页后另行允许':'www.apple.com.cn 访问未允许；未执行任何操作，如需可再次点击本按钮');}catch{status('官网主机访问请求未完成；未执行任何操作');}return;}
  try{const t=await chrome.tabs.get(Number($('tab').value));if(!allowedMerchantUrl(t.url))throw new Error();const ok=await chrome.permissions.request({origins:[new URL(t.url).origin+'/*']});status(ok?'该官网主机访问已允许；页面跨主机后需本人另行确认':'访问未允许');}catch{status('当前标签页或权限不可用；可重新读取官网标签页');}
};
let prepared=null;
async function digestPlan(p){const bytes=new TextEncoder().encode(JSON.stringify(p));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');}
// Constrained migration: a preserved task bound before the explicit field keeps its digest only when it is the same
// intent without the field (which already meant no extras). Any other digest stays a binding difference.
async function boundDigest(p,previous){const {extras,...legacy}=p;const digest=await digestPlan(p);return previous&&previous.state!=='RETIRED'&&previous.planDigest===await digestPlan(legacy)?previous.planDigest:digest;}
$('prepare').onclick=async()=>{try{const p=plan(),tabId=Number($('tab').value),previous=await store.get(TASK_KEY),digest=await boundDigest(p,previous),port=new ChromePort(chrome,tabId,{mode:'observe',initialSequence:previous?.lastRead??0});const o=await port.observe(p);if(!o.termsLinks?.length){prepared=null;status('该页面未识别当前商店条款；可推进到官网复核页后再确认');return;}const reuse=previous&&previous.state!=='RETIRED';prepared={taskId:reuse?previous.taskId:crypto.randomUUID(),planDigest:digest,tabId,entryDocumentId:reuse?previous.entryDocumentId??o.documentId:o.documentId,termsUrl:o.termsLinks[0]};$('terms').href=prepared.termsUrl;status('只读预检完成。核对购买条件和条款后可一键开始；尚未提交任何购买动作');}catch{prepared=null;status('预检未完成；请核实当前标签页和主机授权');}};
$('savePrivate').onclick=async()=>{const v={};for(const k of ['firstName','lastName','phone','email','identitySuffix'])if($(k).value)v[k]=$(k).value;if(v.identitySuffix&&!/^\d{4}$/.test(v.identitySuffix)){status('证件后四位格式不正确');return;}await chrome.storage.session.set({applebuyPickupSession:v});status('自提资料已仅保留在本次 Chrome 会话，不进入购买记录或日志');};
const actionName={configureProduct:'选择商品配置',continueProduct:'继续商品配置',addBag:'加入购物袋',viewBag:'查看购物袋',checkout:'结账',selectPickup:'选择自提',selectStore:'选择门店',selectDate:'选择日期',chooseSlot:'选择时段',fillDetails:'取货详情',selectPayment:'选择付款方式',continuePayment:'继续付款方式',submitOrder:'提交订单'};
const onState=s=>{const pending=actionName[s.pendingAction];const host=exactHost(s.permissionOrigin);if(host&&$('hostOrigin'))$('hostOrigin').value=host;const help=host?`当前主机尚未获访问权限：${host}；点击授权按钮并处理 Chrome 提示，再只读核对原任务`:s.reason==='auth'?'官网要求 Apple 账户登录／验证；完成后点“登录后核对原任务（只读）”':'';status(`状态：${s.state}；${s.observationCurrent?'页面':'最近已读页面'}：${s.phase??'尚未读取'}；${pending?`待确认动作：${pending}；请勿重复执行；`:''}${help?help+'；':''}${s.reason??''}`);};
// C-013-R2: Pause/Stop advance a cancellation epoch. Each handler captures the epoch synchronously at its click and
// re-checks it after its awaits; an older handler then creates no job, uses no grant and sends nothing. A running job
// is paused/stopped by the job itself. Durable records are untouched; a later fresh explicit click captures a new epoch.
let epoch=0,cancelKind='pause';
const ticket=()=>{const t=epoch;return ()=>t===epoch;};
const halted=()=>status(`已${cancelKind==='stop'?'停止':'暂停'}：本控制页进行中的准备已取消，未创建执行，未发出新动作；如需继续请重新明确操作`);
// C-013-R1: grants are local to one run. A final grant exists only as the argument of the run started by its explicit
// click, an advance grant only inside an owned start. A denial, gate or exception leaves nothing for a later Resume;
// durable sent/unknown truth stays in the job record.
async function run(starting=false,{rebind=false,finalGrant=null,live=ticket()}={}){
  if(!live()){halted();return;}
  if(!rebind&&!$('approve').checked){status('需要本人明确允许本次结账推进；历史授权不能复用');return;}
  if(!navigator.locks){status('浏览器缺少执行互斥能力，无法安全运行');return;}
  let ownership;
  try{ownership=await withPurchaseOwner(navigator.locks,async()=>{
    try{
      if(!live()){halted();return;}
      const p=plan(),tabId=Number($('tab').value),previous=await store.get(TASK_KEY),digest=await boundDigest(p,previous);
      if(!live()){halted();return;}
      let startGrant=null;
      if(starting&&$('finalReview').checked){if(!prepared||prepared.planDigest!==digest||prepared.tabId!==tabId){status('一键购买前需重新只读预检；当前购买条件已变化或尚未预检');return;}startGrant={...prepared,id:crypto.randomUUID(),start:true,termsAccepted:true,existingOrdersChecked:true,noExtras:true,expiry:Date.now()+1200000};}
      const useGrant=rebind?null:finalGrant??startGrant;
      const privatePickupData=rebind?{}:(await chrome.storage.session.get('applebuyPickupSession')).applebuyPickupSession??{};
      // Last check: no await separates it from job creation, so a later Pause/Stop reaches the job itself.
      if(!live()){halted();return;}
      // A rebound tab is read-only reconciliation: the port is not authorized to act.
      const port=new ChromePort(chrome,tabId,{authorized:!rebind,initialSequence:previous?.lastRead??0,acceptedSlot:previous?.acceptedSlot??null,pending:previous?.pending??null,privatePickupData,reviewGrant:useGrant});
      job=new PurchaseJob({store,port,maxSteps:300,onState});
      const result=await job.run(p,{tabId,planDigest:digest,grant:useGrant,taskId:useGrant?.taskId??null,rebind});$('final').disabled=result.lastPhase!=='REVIEW'||result.finalIntent?.sent===true||!!result.reconcileOnly;if(result.lastPhase==='REVIEW'&&port.last?.raw.termsLinks?.length){$('terms').href=port.last.raw.termsLinks[0];}
    }catch{status('执行已停止，请核实当前任务；已发送的动作不会自动重试');}
    finally{job=null;}
  });}catch{status('执行未能安全开始；记录保持不变，已发送的动作不会自动重试');return;}
  if(!ownership.owned)status('另一控制页正在执行，当前页只读');
}
// Two bounded validation modes. Neither adds to the bag, reserves a slot, creates an order or pays.
$('observe').onclick=async()=>{try{const p=plan(),tabId=Number($('tab').value);const r=await new PurchaseJob({store,port:new ChromePort(chrome,tabId,{mode:'observe'})}).run(p,{tabId,planDigest:'observe-only',mode:'observe'});status(`只读观察：页面 ${r.phase}；待选 ${r.nextChoice?`${r.nextChoice.choice}（${r.nextChoice.state}）`:'无'}；配置完整：${r.variantVerified?'是':'否'}。未执行任何点击`);}catch{status('只读观察未完成；请核实当前标签页和主机授权');}};
// Same-tab reconciliation never reads private session data, creates a missing task or grants any mutation authority.
$('reconcile').onclick=async()=>{
  const live=ticket();if(!navigator.locks){status('浏览器缺少执行互斥能力，不能核对；记录保持不变');return;}
  try{const ownership=await withPurchaseOwner(navigator.locks,async()=>{try{
    if(!live()){halted();return;}const p=plan(),tabId=Number($('tab').value),previous=await store.get(TASK_KEY);if(!live()){halted();return;}
    if(!previous||previous.state==='RETIRED'){status('没有可核对的原任务；未创建新任务，也未点击官网');return;}
    const digest=await boundDigest(p,previous);if(!live()){halted();return;}
    if(previous.tabId!==tabId||previous.planDigest!==digest){status('所选商品或标签页与原任务不同；记录保持不变。改绑必须另行明确确认');return;}
    const port=new ChromePort(chrome,tabId,{authorized:false,mode:'observe',initialSequence:previous.lastRead??0,acceptedSlot:previous.acceptedSlot??null,pending:previous.pending??null});
    job=new PurchaseJob({store,port,maxSteps:20,onState});await job.run(p,{tabId,planDigest:digest,mode:'reconcile'});
  }catch{status('只读核对未完成；原任务和已发送动作保留，请核实标签页、主机权限或任务记录');}finally{job=null;}});if(!ownership.owned)status('另一控制页正在执行；本页没有核对或点击');}
  catch{status('只读核对未能安全开始；记录保持不变');}
};
$('validate').onclick=async()=>{
  const live=ticket();
  if(!navigator.locks){status('浏览器缺少执行互斥能力，无法安全运行');return;}
  const ownership=await withPurchaseOwner(navigator.locks,async()=>{
    const p=plan(),tabId=Number($('tab').value),previous=await store.get(VALIDATION_KEY);
    if(!live()){halted();return;}
    job=new PurchaseJob({store,port:new ChromePort(chrome,tabId,{authorized:true,mode:'public-config',initialSequence:previous?.lastRead??0}),maxSteps:20,onState});
    try{const r=await job.run(p,{tabId,planDigest:await digestPlan(p),mode:'public-config'});status(r.state==='VALIDATED'?'公开配置校验完成：已选不折抵换购、不加 AppleCare+，规格和价格一致；停在加入购物袋之前，未加入购物袋':`公开配置校验停止：${r.state}；${r.reason??''}`);}catch{status('公开配置校验未完成；未执行加入购物袋');}finally{job=null;}
  });
  if(!ownership.owned)status('另一控制页正在执行，当前页只读');
};
// C-013-R1: without Web Locks retirement is a visible gate; a lock or storage error neither mutates nor erases history.
$('retire').onclick=async()=>{
  const live=ticket();
  if(!navigator.locks){status('浏览器缺少执行互斥能力，无法安全退役；记录保持不变');return;}
  try{
    const ownership=await withPurchaseOwner(navigator.locks,async()=>{
      const s=await store.get(TASK_KEY);if(!live()){halted();return;}if(!s){status('没有保留的任务');return;}
      if(!retirable(s)){status('该任务曾写入官网购物动作或记录不可确认，不能退役；只能核对');return;}
      try{await new PurchaseJob({store,port:null}).retire();status('该任务从未写入官网购物动作，已退役并保留记录；可重新预检');}catch{status('退役未完成；记录保持不变');}
    });
    if(!ownership.owned)status('另一控制页正在执行，当前页只读');
  }catch{status('退役未完成；记录保持不变');}
};
$('rebind').onclick=()=>{if(!$('rebindConfirm').checked){status('改绑标签页需本人确认，仅用于只读核对');return;}return run(false,{rebind:true});};
$('start').onclick=()=>run(true);$('resume').onclick=()=>run(false);
// Cancellation reaches both a running job and every older handler still awaiting preparation.
const cancel=kind=>{epoch++;cancelKind=kind;if(job){if(kind==='stop')job.stop();else job.pause();}else halted();};
$('pause').onclick=()=>cancel('pause');$('stop').onclick=()=>cancel('stop');
// The final grant is built per explicit click and handed only to that run; a rejected or cancelled attempt retains nothing.
$('final').onclick=async()=>{
  const live=ticket();
  if(!$('finalReview').checked){status('需要本人核对当前官网并确认这一张订单');return;}
  let finalGrant;
  try{const s=await store.get(TASK_KEY);if(!live()){halted();return;}if(!s||s.lastPhase!=='REVIEW'||s.finalIntent?.sent===true||s.reconcileOnly||s.state==='RETIRED'){status('当前任务不能发出新的最终订单');return;}
    finalGrant={id:crypto.randomUUID(),taskId:s.taskId,planDigest:s.planDigest,documentId:s.lastDocumentId,termsUrl:$('terms').href,termsAccepted:true,existingOrdersChecked:true,noExtras:true,expiry:Date.now()+120000};}
  catch{status('最终确认未完成；未发出订单');return;}
  await run(false,{finalGrant,live});
};
// No delete/reset: completed and unknown purchase history cannot be erased by reopening a control page.
const saved=await store.get(TASK_KEY);if(saved)status(`保留的任务：${saved.state}；重新打开不会清除购买或未知记录`);
