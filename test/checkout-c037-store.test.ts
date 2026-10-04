// C037 implementation tests (Claude): choosing the observed numbered native Dalian store radio when it is NOT preselected.
// Every DOM, Chrome API, store, clock and id below is FAKE. Only the structural shapes follow the sanitized C-036 normal pickup
// evidence: the store-locator-result radio with public R609 and its numbered label, the selected-store product row, the
// model-only date LEGEND with native date radios and time select, role=radio fulfillment buttons and the companion-bar caption.
// The explicit 数量：1 line is SYNTHETIC; it stands in for the current order-summary piece count so these cases isolate the store
// choice. Labels and IDs marked FAKE are test-only. The Duo case mirrors the Pro shape only; no Duo checkout layout is observed.
// No browser, account, network, cart, slot, order or payment is touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
import {ChromePort} from '../web/checkout-connector/chrome-port.js';
import {PurchaseJob,TASK_KEY,NO_EXTRAS} from '../web/checkout-connector/job.js';

const pro={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{...NO_EXTRAS}};
const duo={...pro,product:{model:'iPhone Duo',capacity:'256GB',color:'星光白色'},maxTotalCny:15999};
const DALIAN='Apple 大连恒隆广场',LABEL='1\nApple 大连恒隆广场\n今天 可取货\n店内取货',UNTOUCHED={delivered:false,touched:false,reason:'CurrentChoiceUnrecognized'};

// Minimal FAKE tree: comma lists of compound tag/[attr]/[attr="v"]/.class selectors; any other selector throws.
const one=(e,s)=>{const m=/^([a-z0-9]*)((?:\[[\w-]+(?:="[^"]*")?\]|\.[\w-]+)*)$/i.exec(s.trim());if(!m)throw new Error('FAKE selector unsupported: '+s);
  if(m[1]&&e.tagName!==m[1].toUpperCase())return false;
  for(const [,k,v] of m[2].matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g))if(v===undefined?!e.hasAttribute(k):e.getAttribute(k)!==v)return false;
  return [...m[2].replace(/\[[^\]]*\]/g,'').matchAll(/\.([\w-]+)/g)].every(([,c])=>String(e.getAttribute('class')??'').split(/\s+/).includes(c));};
class El{
  constructor(tag,text='',attrs={}){Object.assign(this,{tagName:tag,own:text,attrs,children:[],parentElement:null,hidden:false,disabled:false,checked:false,selected:false,labels:[],clicks:0,value:attrs.value??''});}
  add(...n){for(const c of n){c.parentElement=this;this.children.push(c);}return this;}
  get isConnected(){let p=this;while(p.parentElement)p=p.parentElement;return p.tagName==='HTML';}
  get textContent(){return this.own+this.children.map(c=>c.textContent).join('');}
  set textContent(t){this.own=t;this.children=[];}
  getAttribute(k){return Object.hasOwn(this.attrs,k)?this.attrs[k]:null;}
  hasAttribute(k){return Object.hasOwn(this.attrs,k);}
  querySelectorAll(s){const out=[];const walk=n=>{for(const c of n.children){if(s.split(',').some(x=>one(c,x)))out.push(c);walk(c);}};walk(this);return out;}
  querySelector(s){return this.querySelectorAll(s)[0]??null;}
  closest(s){for(let p=this;p;p=p.parentElement)if(s.split(',').some(x=>one(p,x)))return p;return null;}
  get options(){return this.children.filter(c=>c.tagName==='OPTION');}
  get selectedOptions(){return this.options.filter(o=>o.selected);}
  // Native-like radio: the program must never click a disabled or hidden control; a click checks the radio and clears its group.
  click(){assert.equal(this.disabled,false,'FAKE disabled control clicked');assert.equal(this.hidden,false,'FAKE hidden control clicked');this.clicks++;
    if(this.tagName==='INPUT'&&this.getAttribute('type')==='radio'){let r=this;while(r.parentElement)r=r.parentElement;
      for(const x of r.querySelectorAll('input[type="radio"]'))if(x.getAttribute('name')===this.getAttribute('name'))x.checked=false;this.checked=true;}this.onClick?.();}
  dispatchEvent(){return true;}
}
const el=(tag,text='',attrs={},o={})=>Object.assign(new El(tag,text,attrs),o);
// A store-locator radio and its label, in the observed native shape unless a test changes it.
const native=(text=LABEL,value='R609',o={},type='radio')=>{const r=el('INPUT','',{type,name:'store-locator-result',value},o),l=el('LABEL',text,{},{hidden:!!o.hidden});r.labels=[l];return [r,l];};

let ids=0;
function page({plan=pro,amount='RMB 9,999',unit=true,choice='pickup',store=native(),before=[]}={}){
  const main=el('MAIN'),[dalian,dlabel]=store,variant=`${plan.product.model} ${plan.product.capacity} ${plan.product.color}`;
  const pickup=el('BUTTON','我要取货',{role:'radio','aria-checked':String(choice==='pickup')}),delivery=el('BUTTON','为我送货',{role:'radio','aria-checked':String(choice==='delivery')});
  const row=el('UL','',{role:'list',class:'rt-storelocator-store-multipleavailability-list'}).add(el('LI','',{role:'listitem',class:'row rt-storelocator-store-multipleavailability-item'}).add(el('DIV',variant,{class:'column large-7'}),el('DIV','需要签到')));
  const dates=['4','5','6'].flatMap(d=>{const r=el('INPUT','',{type:'radio',name:'bartPickupDateSelectorButtonGroup',value:d},{checked:d==='6'}),l=el('LABEL','October\n'+d);r.labels=[l];return [r,l];});
  const select=el('SELECT','',{'data-autom':'pickup-availablewindow-dropdown','aria-labelledby':'rs-pickup-slottitle'}).add(el('OPTION','可选时段',{value:''},{disabled:true,selected:true}),...['20:45 – 21:00','21:00 – 21:15','21:15 – 21:30'].map(t=>el('OPTION',t,{value:'6-'+t})));
  const fieldset=el('FIELDSET').add(el('LEGEND','为你的 '+plan.product.model+' 选择取货日期：',{class:'rs-pickup-slottitle typography-body-reduced-tight'}),...dates,select);
  const next=el('BUTTON','继续填写取货详情');
  main.add(el('H1','你希望如何收到订单商品？'),el('BUTTON','显示订单摘要： ',{'data-autom':'companionbar-button'}).add(el('SPAN',amount)),delivery,pickup,el('H2','选择取货零售店：'),...before,dalian,dlabel,row,...(unit?[el('P','数量：1')]:[]),fieldset,next);
  const document=el('HTML').add(el('BODY').add(main)),href='https://secure8.www.apple.com.cn/shop/checkout';
  const ctx=vm.createContext({document,location:{href},URL,TextEncoder,crypto:webcrypto,Date,setTimeout,clearTimeout,HTMLInputElement:El,Event:class{},getComputedStyle:()=>({display:'block',visibility:'visible'})});
  const p={main,dalian,dlabel,pickup,next,select,row,href,plan,fn:vm.runInContext('('+merchantDocument.toString()+')',ctx)};
  p.stores=()=>main.querySelectorAll('input[name="store-locator-result"]');
  p.read=async()=>structuredClone(await p.fn(plan));
  p.send=async(action,more={})=>structuredClone(await p.fn(plan,{id:'FAKE-c037-command-'+(++ids),taskId:'FAKE-c037-task',authorized:true,structured:true,action,expected:JSON.stringify(await p.read()),...more}));
  return p;
}

test('C037 the observed numbered native Dalian radio, not preselected, is chosen once by exact label and R609; the fresh read proves the store and reaches SLOTS without any slot action',async()=>{
  const p=page(),before=await p.read();
  assert.equal(before.phase,'FULFILLMENT');assert.equal(before.fulfillmentChoice,'pickup');assert.equal(before.purchase.itemVerified,true);assert.equal(before.purchase.store,null);assert.equal(before.purchase.verified,false);
  assert.deepEqual(await p.send('selectStore',{store:DALIAN}),{delivered:true});assert.equal(p.dalian.clicks,1);assert.equal(p.dalian.checked,true);
  const after=await p.read();
  assert.equal(after.phase,'SLOTS');assert.equal(after.purchase.store,DALIAN);assert.equal(after.purchase.verified,true);assert.equal(after.purchase.quantity,1);assert.equal(after.purchase.totalCny,9999);
  assert.equal(after.selectedDate,'October 6');assert.equal(after.listComplete,true);
  assert.equal(p.next.clicks,0);assert.deepEqual(p.select.selectedOptions.map(o=>o.textContent),['可选时段']);
});
test('C037 a different merchant default store does not decide the choice: the planned Dalian radio replaces it',async()=>{
  const [other,olabel]=native('2\nApple FAKE 其他门店\n今天 可取货\n店内取货','FAKE-R000',{checked:true});
  const p=page({before:[other,olabel]}),before=await p.read();assert.equal(before.phase,'FULFILLMENT');assert.equal(before.purchase.store,null);
  assert.deepEqual(await p.send('selectStore',{store:DALIAN}),{delivered:true});assert.equal(other.checked,false);assert.equal(other.clicks,0);assert.equal(p.dalian.checked,true);
  const after=await p.read();assert.equal(after.purchase.store,DALIAN);assert.equal(after.phase,'SLOTS');
});
test('C037 the same rule holds under the capped one-unit Duo plan (FAKE mirror of the Pro shape, not Duo evidence)',async()=>{
  const p=page({plan:duo,amount:'RMB 15,999'});assert.equal((await p.read()).purchase.itemVerified,true);
  assert.deepEqual(await p.send('selectStore',{store:DALIAN}),{delivered:true});assert.equal((await p.read()).purchase.store,DALIAN);
});

// Each case keeps the plan, unit, total and pickup choice valid; only the store controls are wrong, unrecognized or ambiguous.
for(const [name,o] of [
  ['a Dalian label with another ID (no name-only trust)',{store:native(LABEL,'FAKE-R000')}],
  ['R609 with another store name (no ID-only trust)',{store:native('1\nApple FAKE 其他门店\n今天 可取货\n店内取货')}],
  ['R609 with an unrelated label',{store:native('1\nFAKE 门店\n今天 可取货\n店内取货')}],
  ['a longer name that merely contains the planned name (no substring match)',{store:native('1\nApple 大连恒隆广场FAKE二店\n今天 可取货\n店内取货')}],
  ['the bare store name without the observed numbered shape',{store:native(DALIAN)}],
  ['unobserved availability wording (fails closed)',{store:native('1\nApple 大连恒隆广场\n明天 可取货\n店内取货')}],
  ['a disabled Dalian radio',{store:native(LABEL,'R609',{disabled:true})}],
  ['a role=radio element that is not a native radio input',{store:(([r,l])=>{r.attrs.role='radio';return [r,l];})(native(LABEL,'R609',{},'button'))}],
  ['a visible duplicate R609 Dalian radio',{before:native()}],
  ['a hidden R609 twin',{before:native(LABEL,'R609',{hidden:true})}],
  ['a disabled R609 twin',{before:native(LABEL,'R609',{disabled:true})}],
  ['a rival input naming Dalian under another ID',{before:native(LABEL,'FAKE-R001')}],
  ['a legacy radio with the exact store name beside the native one',{before:(()=>{const r=el('INPUT','',{type:'radio',name:'FAKE-legacy-store'}),l=el('LABEL',DALIAN);r.labels=[l];return [l,r];})()}],
])test('C037 '+name+' is positively untouched: no store is clicked or proven',async()=>{
  const p=page(o);assert.equal((await p.read()).phase,'FULFILLMENT');
  assert.deepEqual(await p.send('selectStore',{store:DALIAN}),UNTOUCHED);
  assert.ok(p.main.querySelectorAll('input').every(x=>x.clicks===0));assert.equal((await p.read()).purchase.store,null);
});
for(const [name,o,store] of [
  ['a total above the cap',{amount:'RMB 10,000'},DALIAN],
  ['no explicit current unit',{unit:false},DALIAN],
  ['delivery chosen instead of pickup',{choice:'delivery'},DALIAN],
  ['a store outside the plan',{store:native('2\nApple FAKE 其他门店\n今天 可取货\n店内取货','FAKE-R000')},'Apple FAKE 其他门店'],
])test('C037 '+name+' keeps the existing stage gate: nothing is clicked',async()=>{
  const p=page(o);assert.deepEqual(await p.send('selectStore',{store}),{delivered:false,touched:false,reason:'ActionNotRecognizedForCurrentStage'});assert.equal(p.dalian.clicks,0);assert.equal(p.dalian.checked,false);
});
test('C037 currentness: changed evidence, an ID changed after the read, and a repeated command id never click again',async()=>{
  const changed=page(),expected=JSON.stringify(await changed.read());changed.row.querySelector('div.column.large-7').textContent='iPhone 18 Pro Max 256GB 黑色';
  assert.deepEqual(await changed.send('selectStore',{store:DALIAN,expected}),{delivered:false,touched:false,reason:'OperationEvidenceChanged'});assert.equal(changed.dalian.clicks,0);
  // The read-model is identical (store unproven either way), so the command reaches the choice; this pass re-verifies and refuses.
  const swapped=page(),same=JSON.stringify(await swapped.read());swapped.dalian.value=swapped.dalian.attrs.value='FAKE-R000';
  assert.deepEqual(await swapped.send('selectStore',{store:DALIAN,expected:same}),UNTOUCHED);assert.equal(swapped.dalian.clicks,0);
  const once=page(),command={id:'FAKE-c037-once',taskId:'FAKE-c037-task',authorized:true,structured:true,action:'selectStore',store:DALIAN,expected:JSON.stringify(await once.read())};
  assert.deepEqual(structuredClone(await once.fn(pro,command)),{delivered:true});
  assert.deepEqual(structuredClone(await once.fn(pro,command)),{delivered:false,touched:true,reason:'OperationAlreadyDelivered'});assert.equal(once.dalian.clicks,1);
});

// The actual ChromePort and PurchaseJob over a FAKE Chrome API that runs the actual page program on the FAKE document.
test('C037 actual job: FULFILLMENT with the native Dalian radio unselected sends one selectStore and reconciles it from the fresh SLOTS read',async()=>{
  const p=page(),acts=[],replies=[];let row=null;
  const api={tabs:{async get(id){assert.equal(id,7);return {url:p.href};}},permissions:{async contains(){return true;}},
    scripting:{async executeScript({world,func,args}){assert.equal(world,'ISOLATED');assert.equal(func,merchantDocument);const result=structuredClone(await p.fn(...args));
      if(args.length>1){acts.push(args[1].action);replies.push(result);}return [{frameId:0,documentId:'FAKE-c037-doc',result}];}}};
  const store={async get(k){assert.equal(k,TASK_KEY);return row?structuredClone(row):null;},async put(k,s){assert.equal(k,TASK_KEY);row=structuredClone(s);}};
  const port=new ChromePort(api,7,{authorized:true,initialSequence:0,pending:null});port.wait=async()=>{};
  let n=0;const r=await new PurchaseJob({store,port,now:()=>100000,id:()=>'FAKE-c037-id-'+(++n),maxSteps:2}).run(pro,{tabId:7,planDigest:'FAKE-c037-digest'});
  // Step 1 sends the store choice, step 2 reconciles it from fresh evidence; the bound then stops before any slot decision.
  assert.deepEqual(acts,['selectStore']);assert.deepEqual(replies,[{delivered:true}]);assert.equal(p.dalian.clicks,1);assert.equal(p.dalian.checked,true);
  assert.equal(r.pending,null);assert.equal(r.lastPhase,'SLOTS');assert.equal(r.reason,'step-bound-reached');assert.equal(p.next.clicks,0);
});

// Operator text: the matching-bag path is described as the code behaves (automatic bag page and checkout, never an Add).
const read=f=>readFileSync(new URL(f,import.meta.url),'utf8');
test('C037 operator text matches the matching-item behaviour and every bag help entry is reachable',()=>{
  const html=read('../web/checkout-connector/control.html'),control=read('../web/checkout-connector/control.js'),job=read('../web/checkout-connector/job.js'),readme=read('../README.md');
  assert.doesNotMatch(html,/读到任何商品、读取失败或无法确认都不加入，也不移除或结账/);
  assert.match(html,/与当前计划一致的唯一一件商品且无附加项时，程序不加入，自动打开购物袋页重新核对后结账/);
  assert.match(readme,/与当前计划一致的唯一一件商品且无附加项时，程序不加入，自动打开购物袋页重新核对后结账/);
  assert.doesNotMatch(readme,/唯一一件需在购物袋页点“恢复本任务”核对后结账/);assert.doesNotMatch(readme,/C035-R1候选（待Codex复审，未验收）/);
  const keys=[...control.matchAll(/s\.reason\?\.startsWith\('([^']+)'\)/g)].map(m=>m[1]);
  assert.ok(keys.length>=8);for(const k of keys)assert.ok(job.includes(`'${k}`),'control.js help for a reason job.js never emits: '+k);
});
