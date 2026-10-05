import {PurchaseJob,TASK_KEY,VALIDATION_KEY,NO_EXTRAS,retirable} from './job.js';
import {ChromePort,allowedMerchantUrl} from './chrome-port.js';
import {withPurchaseOwner} from './owner.js';
import {taskDiagnostic} from './task-diagnostic.js';
import {probeClosedCheckout} from './closed-checkout-probe.js';
import {restartExpiredPreFinal} from './pre-final-restart.js';
const $=id=>document.getElementById(id);let job=null;
const store={async get(k){return (await chrome.storage.local.get(k))[k]??null;},async put(k,v){await chrome.storage.local.set({[k]:v});}};
const status=s=>{$('state').textContent=s;};
// C049: restore only the existing active public target at boot, never a grant; preserve a human choice made while awaiting storage.
const bootProduct=$('product').value;let productEdited=false;
$('product').oninput=$('product').onchange=$('product').onpointerdown=()=>{productEdited=true;};
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
$('prepare').onclick=async()=>{try{const p=plan(),tabId=Number($('tab').value),previous=await store.get(TASK_KEY),digest=await boundDigest(p,previous),port=new ChromePort(chrome,tabId,{mode:'observe',initialSequence:previous?.lastRead??0});const o=await port.observe(p);if(!o.termsLinks?.length){prepared=null;status('该页面未识别当前商店条款；可推进到官网复核页后再确认');return;}const reuse=previous&&previous.state!=='RETIRED';prepared={taskId:reuse?previous.taskId:crypto.randomUUID(),planDigest:digest,tabId,entryDocumentId:reuse?previous.entryDocumentId??o.documentId:o.documentId,termsUrl:o.termsLinks[0]};$('terms').href=prepared.termsUrl;const cart=[previous,...(previous?.retiredHistory??[])].some(r=>r?.retiredCart||r?.readOnlyRetirement?.kind==='resolved-pre-slot-bag');status('只读预检完成。核对购买条件和条款后可一键开始；尚未提交任何购买动作'+(cart?'。旧任务结束时购物袋中有一件已核对商品，本任务不会再加入购物袋，需在购物袋页核对后结账：加入前读到与当前计划一致的唯一一件商品且无附加项时，程序自动打开购物袋页重新核对后结账，不再加入。唯一例外：加入购物袋前，程序在后台新标签页打开官网购物袋页当场读取，读完即关闭；只有官网显示“你的购物袋中没有商品。”时才只加入一件，读到任何商品或无法确认都不加入':''));}catch{prepared=null;status('预检未完成；请核实当前标签页和主机授权');}};
$('savePrivate').onclick=async()=>{const v={};for(const k of ['firstName','lastName','phone','email','identitySuffix'])if($(k).value)v[k]=$(k).value;if(v.identitySuffix&&!/^\d{4}$/.test(v.identitySuffix)){status('证件后四位格式不正确');return;}await chrome.storage.session.set({applebuyPickupSession:v});status('自提资料已仅保留在本次 Chrome 会话，不进入购买记录或日志');};
const actionName={configureProduct:'选择商品配置',continueProduct:'继续商品配置',addBag:'加入购物袋',viewBag:'查看购物袋',checkout:'结账',selectPickup:'选择自提',selectStore:'选择门店',selectDate:'选择日期',chooseSlot:'选择时段',fillDetails:'取货详情',selectPayment:'选择付款方式',continuePayment:'继续付款方式',submitOrder:'提交订单',openProduct:'从空购物袋打开商品页',openBag:'核对已有商品并打开购物袋'};
// Only fixed public models and safe tab numbers are shown, never arbitrary persisted strings or private customer fields.
const bindingSummary=s=>{const model=['iPhone Duo','iPhone 18 Pro'].includes(s?.plan?.product?.model)?s.plan.product.model:'型号记录无法确认';const tab=Number.isSafeInteger(s?.tabId)&&s.tabId>0?s.tabId:'标签页记录无法确认';return `${model} · 标签页 ${tab}`;};
// C047 Codex genuine-quota takeover: diagnostic only. The job's binding checks and saved task stay unchanged.
// Only fixed labels/booleans are rendered; unknown record fields, digests and private values are never echoed.
const diagnosticJson=v=>JSON.stringify(v,(k,x)=>x!==null&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(n=>[n,x[n]])):x);
const diagnosticPlan=v=>{if(!v||typeof v!=='object'||Array.isArray(v))return null;const {extras,...rest}=v;return {...rest,extras:{...NO_EXTRAS}};};
function bindingDiagnostic(previous,p,tabId,digest){
  let same=null,fields=[];
  try{
    const old=previous?.plan,oldExtras=old?.extras===undefined?{...NO_EXTRAS}:old.extras;
    same=diagnosticJson(diagnosticPlan(old))===diagnosticJson(diagnosticPlan(p))&&diagnosticJson(oldExtras)===diagnosticJson(p.extras);
    const checks=[['机型',old?.product?.model,p.product.model],['容量',old?.product?.capacity,p.product.capacity],['颜色',old?.product?.color,p.product.color],['数量',old?.quantity,p.quantity],['总价上限',old?.maxTotalCny,p.maxTotalCny],['城市',old?.city,p.city],['收货方式',old?.fulfillment,p.fulfillment],['门店',old?.stores,p.stores],['日期时段规则',old?.dateRule,p.dateRule],['付款方式',old?.paymentMethod,p.paymentMethod],['附加项',oldExtras,p.extras]];
    fields=checks.filter(([,a,b])=>diagnosticJson(a)!==diagnosticJson(b)).map(([label])=>label);
    if(same===false&&fields.length===0)fields=['其他记录字段'];
  }catch{same=null;fields=['记录无法确认'];}
  const yes=v=>v===null?'无法确认':v?'是':'否';
  return `程序诊断 C047；标签页一致：${yes(previous?.tabId===tabId)}；购买摘要一致：${yes(previous?.planDigest===digest)}；条件记录一致：${yes(same)}；差异项：${fields.length?fields.join('、'):'无'}；原任务：${bindingSummary(previous)}；当前：${bindingSummary({plan:p,tabId})}`;
}
// C034 (Claude): ending a read-only cart task never empties the official bag; later tasks say so and never add to it.
// C035-R1 (Claude): only a current empty-bag read taken right before Add to Bag lets the program add the one planned item.
// C037 (Claude): a matching one-item read there is opened in the bag and checked out automatically without Add (no help entry needed).
const cartHelp=s=>s.reason?.startsWith('retired-cart-holds-earlier-item')?'旧任务结束时已核对购物袋中有一件商品，程序不会把它当作已清空，也不会再加入购物袋；请本人打开官网购物袋页后点“恢复本任务”，只有重新读到与当前计划一致的唯一一件商品且无附加项时才继续结账；若官网当场显示“你的购物袋中没有商品。”，程序会自动打开商品页、按计划配置，加入前再次读取购物袋，仍为空才只加入一件，无需手动加入'
  :s.reason?.startsWith('current-bag-not-verified-before-add')?'加入购物袋前未能当场确认官网购物袋为空（读取失败、超时或无法识别），未加入任何商品；可点“恢复本任务”重新读取'
  :s.reason?.startsWith('current-bag-holds-other-items')?'加入购物袋前读到购物袋中已有其他或多件商品，未加入，也不会移除或结账；请本人整理购物袋后，在购物袋页点“恢复本任务”重新读取'
  :s.reason?.startsWith('control-changed-during-bag-read')?'读取购物袋期间已暂停或停止，未加入购物袋；恢复后会重新读取'
  :s.reason?.startsWith('retired-cart-bag-not-exactly-this-plan')?'购物袋内容不是当前计划的唯一一件商品；程序不会移除、结账或再加入任何商品，改选型号也不授权处理旧商品。当前读到的不是空购物袋，程序无法确认购物袋已清空；本人整理购物袋后，在购物袋页点“恢复本任务”重新读取'
  :s.reason?.startsWith('bag-page-not-reached')?'打开官网购物袋未确认到达，未加入或结账；恢复后只读核对当前页面'
  :s.reason?.startsWith('product-page-not-reached')?'从空购物袋打开商品页未确认到达，未加入购物袋；请在购物袋页点“恢复本任务”重新读取'
  :s.reason?.startsWith('bag-addition-already-started; an empty bag')?'本任务已开始过加入购物袋，现在读到空购物袋也不会再次加入；结果需本人核对'
  :s.retiredCart?'注意：旧任务结束时购物袋中有一件已核对商品，本任务不会再加入购物袋，除非加入前当场读到官网空购物袋':'';
const onState=s=>{const pending=actionName[s.pendingAction];const host=exactHost(s.permissionOrigin);if(host&&$('hostOrigin'))$('hostOrigin').value=host;const help=[host?`当前主机尚未获访问权限：${host}；点击授权按钮并处理 Chrome 提示，再只读核对原任务`:s.reason==='auth'?'官网要求 Apple 账户登录／验证；完成后点“登录后核对原任务（只读）”':s.state==='NOT_RELEASED'?'官网明确显示尚未发售；已选公开配置保留，未发购买动作，开放后需重新明确开始':'',cartHelp(s)].filter(Boolean).join('；');status(`状态：${s.state}；${s.observationCurrent?'页面':'最近已读页面'}：${s.phase??'尚未读取'}；${pending?`待确认动作：${pending}；请勿重复执行；`:''}${help?help+'；':''}${s.reason??''}`);};
// C-013-R2: Pause/Stop advance a cancellation epoch. Each handler captures the epoch synchronously at its click and
// re-checks it after its awaits; an older handler then creates no job, uses no grant and sends nothing. A running job
// is paused/stopped by the job itself. Durable records are untouched; a later fresh explicit click captures a new epoch.
let epoch=0,cancelKind='pause',probeActive=false,restartActive=false;
const ticket=()=>{const t=epoch;return ()=>t===epoch;};
const halted=()=>status(`已${cancelKind==='stop'?'停止':'暂停'}：本控制页进行中的准备已取消，未创建执行，未发出新动作；如需继续请重新明确操作`);
// C055 quota takeover: no website, private-session read, job creation or record/grant mutation.
if($('inspectTask'))$('inspectTask').onclick=async()=>{
  const live=ticket();
  if(!navigator.locks){status('只读诊断未执行：缺少执行互斥能力；记录保持不变');return;}
  try{
    const ownership=await withPurchaseOwner(navigator.locks,async()=>{
      const s=await store.get(TASK_KEY);if(!live()){halted();return;}
      status('程序诊断 C055；仅为保留记录，不是当前官网结果；未查询官网、未执行购买动作。\n'+JSON.stringify(taskDiagnostic(s,Date.now()),null,2));
    });
    if(!ownership.owned)status('另一控制页正在执行；本页未读取记录或发出动作');
  }catch{status('只读诊断未完成；记录保持不变，未发出购买动作');}
};
// C056 quota takeover: temporary one-checkout recovery probe, not purchase authority or a slot replay.
if($('probeClosed'))$('probeClosed').onclick=async()=>{
  const live=ticket();if(!$('approve').checked){status('重新核对结账需本次结账推进已勾选；不会选择时段或下单');return;}
  if(!navigator.locks){status('重新核对结账未执行：缺少执行互斥能力');return;}
  try{
    const ownership=await withPurchaseOwner(navigator.locks,async()=>{
      const p=plan(),tabId=Number($('tab').value),s=await store.get(TASK_KEY),digest=await boundDigest(p,s);if(!live()){halted();return;}
      probeActive=true;
      const port=new ChromePort(chrome,tabId,{authorized:true});
      const r=await probeClosedCheckout({store,api:chrome,port,plan:p,tabId,planDigest:digest,enabled:true,live});
      if(!live()){status('恢复探查已暂停；如已发送结账可能仍完成，原记录保留，不重复执行');return;}
      status(`程序恢复探查 C056；状态：${r.state}；页面：${r.phase??'未核实'}；${r.reason}；旧时段结果仍未知，未重选、未下单`+(r.permissionOrigin?`；当前需本人允许官网主机 ${r.permissionOrigin}`:''));
    });
    if(!ownership.owned)status('另一控制页正在执行；本页未读取或执行恢复探查');
  }catch{status('恢复探查未完成；原记录保留；如已发出结账，不自动重复');}finally{probeActive=false;}
};
// C060 quota takeover: a current explicit Pro restart creates one successor, retaining the entire abandoned old attempt.
if($('restartPreFinal'))$('restartPreFinal').onclick=async()=>{
  const epochLive=ticket();if(!$('approve').checked||!$('restartConfirm').checked){status('需勾选本次结账推进及重新开始确认；未改变任务或点击官网');return;}
  if(!navigator.locks){status('缺少执行互斥能力；不能重新开始');return;}
  const p=plan(),tabId=Number($('tab').value);
  const live=()=>epochLive()&&$('approve').checked&&$('restartConfirm').checked&&Number($('tab').value)===tabId&&diagnosticJson(plan())===diagnosticJson(p);
  try{
    const ownership=await withPurchaseOwner(navigator.locks,async()=>{
      restartActive=true;const previous=await store.get(TASK_KEY),digest=await boundDigest(p,previous);if(!live()){status('恢复准备已暂停；未发官网动作');return;}
      const r=await restartExpiredPreFinal({store,api:chrome,port:new ChromePort(chrome,tabId,{mode:'observe'}),plan:p,planDigest:digest,tabId,enabled:true,dateWindowConfirmed:true,live});
      if(!r.created){status(`未重新开始：${r.reason}；旧记录保持，未发官网动作`);return;}
      prepared=null;$('finalReview').checked=false;$('final').disabled=true;
      if(!live()){status('新任务已保留但已暂停；旧时段仍未知，未发官网动作');return;}
      const privatePickupData=(await chrome.storage.session.get('applebuyPickupSession')).applebuyPickupSession??{};
      if(!live()){status('新任务已保留但已暂停；旧时段仍未知，未发官网动作');return;}
      job=new PurchaseJob({store,port:new ChromePort(chrome,tabId,{authorized:true,privatePickupData,orderSummary:true}),maxSteps:300,onState});
      const result=await job.run(p,{tabId,planDigest:digest,taskId:r.taskId});
      $('final').disabled=result.lastPhase!=='REVIEW'||result.finalIntent?.sent===true||!!result.reconcileOnly;
      if(result.lastPhase==='REVIEW'&&job.port.last?.raw.termsLinks?.length)$('terms').href=job.port.last.raw.termsLinks[0];
    });if(!ownership.owned)status('另一控制页正在执行；本页未重新开始');
  }catch{status('恢复准备或执行结果未确认；保留全部记录，已发送动作不自动重试，请只读核对当前任务');}
  finally{restartActive=false;job=null;}
};
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
      // C029: the purchase run may read the ordinary order-summary disclosure for its quantity; a rebound read-only tab may not.
      const port=new ChromePort(chrome,tabId,{authorized:!rebind,initialSequence:previous?.lastRead??0,acceptedSlot:previous?.acceptedSlot??null,pending:previous?.pending??null,privatePickupData,reviewGrant:useGrant,orderSummary:!rebind});
      job=new PurchaseJob({store,port,maxSteps:300,onState});
      const result=await job.run(p,{tabId,planDigest:digest,grant:useGrant,taskId:useGrant?.taskId??null,rebind});$('final').disabled=result.lastPhase!=='REVIEW'||result.finalIntent?.sent===true||!!result.reconcileOnly;if(result.lastPhase==='REVIEW'&&port.last?.raw.termsLinks?.length){$('terms').href=port.last.raw.termsLinks[0];}if(live()&&result.reason==='existing-task-binding-differs')status($('state').textContent+'；'+bindingDiagnostic(previous,p,tabId,digest));
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
    if(previous.planDigest!==digest){status(`购买条件与原任务不同；原任务：${bindingSummary(previous)}；当前：${bindingSummary({plan:p,tabId})}。记录保持不变；只读核对需使用原任务条件，改绑标签页不能改变商品；${bindingDiagnostic(previous,p,tabId,digest)}`);return;}
    if(previous.tabId!==tabId){status(`标签页与原任务不同；原任务：${bindingSummary(previous)}；当前：${bindingSummary({plan:p,tabId})}。记录保持不变；原标签页仍在时应选回原页；原页已关闭时，另行明确确认改绑仅只读，旧任务不能因此恢复购买；${bindingDiagnostic(previous,p,tabId,digest)}`);return;}
    const port=new ChromePort(chrome,tabId,{authorized:false,mode:'observe',initialSequence:previous.lastRead??0,acceptedSlot:previous.acceptedSlot??null,pending:previous.pending??null});
    job=new PurchaseJob({store,port,maxSteps:20,onState});const result=await job.run(p,{tabId,planDigest:digest,mode:'reconcile'});if(live()&&result.reason==='existing-task-binding-differs')status($('state').textContent+'；'+bindingDiagnostic(previous,p,tabId,digest));
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
      if(s.reconcileOnly===true){await finishReadOnlyBag(s,live);return;}
      if(!retirable(s)){status('该任务曾写入官网购物动作或记录不可确认，不能退役；只能核对');return;}
      try{await new PurchaseJob({store,port:null}).retire();status('该任务从未写入官网购物动作，已退役并保留记录；可重新预检');}catch{status('退役未完成；记录保持不变');}
    });
    if(!ownership.owned)status('另一控制页正在执行，当前页只读');
  }catch{status('退役未完成；记录保持不变');}
};
$('rebind').onclick=()=>{if(!$('rebindConfirm').checked){status('改绑标签页需本人确认，仅用于只读核对');return;}return run(false,{rebind:true});};
// C030 Codex quota takeover: an explicit local task transition, with a read-only port and existing exclusive owner.
// It creates no purchase and clears every control-page authorization; only a new preflight can prepare the next task.
async function finishReadOnlyBag(previous,live){
  try{
    const p=plan(),tabId=Number($('tab').value),digest=await boundDigest(p,previous);if(!live()){halted();return;}
    job=new PurchaseJob({store,port:new ChromePort(chrome,tabId,{mode:'observe',initialSequence:previous?.lastRead??0}),onState});
    await job.retireReadOnlyBag(p,{tabId,planDigest:digest,live});
    prepared=null;$('approve').checked=false;$('finalReview').checked=false;$('final').disabled=true;
    status('已结束核对完成的只读购物袋任务，全部记录保留；那一件商品仍留在官网购物袋中，程序不会当作已清空。未点击官网或发出购买动作。新的购买需重新预检和确认：在购物袋页读到与当前计划一致的唯一一件商品时直接结账，不再加入；读到官网空购物袋时，才自动打开商品页、按计划配置，并在加入前再次确认购物袋仍为空后只加入一件');
  }catch{status(live()?'旧任务未能确认结束；请读取保留记录核对结果，未发购买动作':'已暂停或停止，未发购买动作；任务管理结果请读取保留记录核对');}finally{job=null;}
}
$('start').onclick=()=>run(true);$('resume').onclick=()=>run(false);
// Cancellation reaches both a running job and every older handler still awaiting preparation.
const cancel=kind=>{epoch++;cancelKind=kind;if(job){if(kind==='stop')job.stop();else job.pause();}else if(probeActive)status('已暂停或停止恢复探查；如已发送结账可能仍完成，原记录保留，不重复执行');else if(restartActive)status('恢复准备已暂停；如已写入新任务会保留，未发官网动作');else halted();};
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
status('AppleBuy C047 绑定诊断已加载；C049 自提适配已加载；C050 日期适配已加载；保留全部旧任务记录');
const saved=await store.get(TASK_KEY);
if(saved&&saved.state!=='RETIRED'&&!productEdited&&$('product').value===bootProduct&&['iPhone Duo','iPhone 18 Pro'].includes(saved.plan?.product?.model))$('product').value=saved.plan.product.model==='iPhone 18 Pro'?'pro':'duo';
if(saved)status(`AppleBuy C047 绑定诊断已加载；C049 自提适配已加载；C050 日期适配已加载；保留的任务：${saved.state}；原绑定：${bindingSummary(saved)}；重新打开不会清除购买或未知记录`);
