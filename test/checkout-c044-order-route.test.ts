// C044 (Claude): the observed official order-detail address and the authoritative native item status in the sent final's lookup. The
// actual merchantDocument decodes FAKE DOM trees in node:vm; the actual ChromePort and PurchaseJob run over FAKE Chrome tabs/permissions/
// scripting, store and clock. Observed (C-044 normal Chrome evidence, historical Pro records only): the address shape
// /shop/order/detail/<ref>/<ref> on secure8, a DIV role=main titled 你的订单详情。, span.rs-od-itemstatus inside h2.rs-od-itemtitle reading
// 取货已取消 (or a picked-up text whose wording is not recorded) and the .rs-od-itemsummary-canceled item marker. Everything else is FAKE:
// refs, receipt and its links, pending/unpaid prose, quantity, slot, the picked-up wording, documents and timing. Nothing here shows that
// Apple renders such a receipt link or an unpaid detail page in this form. No browser, network, account, slot, order or payment.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
import {PurchaseJob,TASK_KEY} from '../web/checkout-connector/job.js';
import {ChromePort} from '../web/checkout-connector/chrome-port.js';

const plan={schema:'applebuy-intent/v1',product:{model:'iPhone 18 Pro',capacity:'256GB',color:'黑色'},quantity:1,maxTotalCny:9999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{tradeIn:'none',appleCare:'none'}};
const digest='FAKE-c044-digest',start=1_000_000,REF='FAKE-C044-0001',TERMS='https://www.apple.com.cn/shop/open/salespolicies';
const slot={date:'October 4',start:'21:15',end:'21:30',verified:true};
const CHECKOUT='https://secure8.www.apple.com.cn/shop/checkout',DEEP='https://secure8.www.apple.com.cn/shop/order/detail/FAKE-ORDER/FAKE-LOOKUP',ALIAS='https://www.apple.com.cn/shop/order/'+REF;
// The recorded evidence names the picked-up state, not its text: this wording (also used by Root's protected repro) is FAKE.
const CANCELLED='取货已取消',PICKED_UP='已取货 9月 17';
const hex=async t=>[...new Uint8Array(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(t)))].map(x=>x.toString(16).padStart(2,'0')).join('');

// Minimal FAKE element tree: comma lists of tag/.class/[attr]/[attr="v"] selectors, document-order descendants, parents, textContent.
class El{
  constructor(tag,attrs,children){Object.assign(this,{tagName:tag.toUpperCase(),attrs,children:[],parentElement:null,isConnected:true,hidden:'hidden' in attrs,labels:[]});
    if('href' in attrs)this.href=attrs.href;for(const c of children){if(typeof c!=='string')c.parentElement=this;this.children.push(c);}}
  get textContent(){return this.children.map(c=>typeof c==='string'?c:c.textContent).join('');}
  getAttribute(k){return Object.hasOwn(this.attrs,k)?String(this.attrs[k]):null;}
  hasAttribute(k){return Object.hasOwn(this.attrs,k);}
  matches(selectors){return selectors.split(',').some(s=>{const m=/^([a-z0-9]*)((?:\.[\w-]+)*)((?:\[[\w-]+(?:="[^"]*")?\])*)$/.exec(s.trim());if(!m)throw new Error('FAKE selector unsupported: '+s);
    const classes=String(this.attrs.class??'').split(/\s+/);
    return (!m[1]||this.tagName===m[1].toUpperCase())&&m[2].split('.').slice(1).every(c=>classes.includes(c))&&[...m[3].matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].every(([,k,v])=>v===undefined?this.hasAttribute(k):this.getAttribute(k)===v);});}
  querySelectorAll(s){const all=e=>e.children.flatMap(c=>typeof c==='string'?[]:[c,...all(c)]);return all(this).filter(e=>e.matches(s));}
  querySelector(s){return this.querySelectorAll(s)[0]??null;}
  closest(s){for(let e=this;e;e=e.parentElement)if(e.matches(s))return e;return null;}
}
const h=(tag,attrs={},...children)=>new El(tag,attrs,children);
// The given program source runs as a page script would: one document at one address, read-only (no command).
async function decode(href,main,source=merchantDocument){
  const root=h('html',{},h('body',{},main,h('a',{href:TERMS},'销售政策与条款')));
  const context=vm.createContext({document:{querySelector:s=>root.querySelector(s),querySelectorAll:s=>root.querySelectorAll(s)},location:{href},URL,TextEncoder,crypto:webcrypto,Date,setTimeout,clearTimeout,
    HTMLInputElement:class{},Event:class{},getComputedStyle:()=>({display:'block',visibility:'visible'})});
  return structuredClone(await vm.runInContext('('+source.toString()+')',context)(plan));
}
// FAKE order facts in the C040 receipt/detail prose form; `false` omits one.
function facts({ref=REF,pending='待付款',title='iPhone 18 Pro 256GB 黑色',quantity='数量：1',total='总计：RMB 9,999',store='取货地点：Apple 大连恒隆广场',date='取货日期：October 4',time='取货时间：21:15 – 21:30'}={}){
  return [ref&&'订单号：'+ref,pending,title,quantity,total,store,'店内取货',date,time].filter(Boolean).map(t=>h('p',{},t));
}
const link=(href,text='查看订单详情',attrs={})=>h('a',{href,...attrs},text);
const receipt=({links=[link(DEEP)],before=[],...o}={})=>h('main',{},h('h1',{},'感谢你的订购'),...before,...facts(o),...links);
// Observed native detail frame and title; `items` are native item rows placed before the FAKE facts.
const detail=({items=[],...o}={})=>h('div',{role:'main',class:'as-l-fullwidth rs-od-container'},h('h1',{class:'rs-od-title'},'你的订单详情。'),...items,...facts(o));
// Observed native item title/status structure; `model` reproduces the observed h2 text (model, then status).
const status=(text,{model=false,hidden=false}={})=>h('h2',{class:'rs-od-itemtitle'},...(model?['iPhone 18 Pro ']:[]),h('span',{class:'rs-od-itemstatus',...(hidden?{hidden:''}:{})},text));
const cancelledMarker=()=>h('div',{class:'rs-od-itemsummary-start column large-4 small-12 small-pull-0 rs-od-itemsummary-canceled'},h('div',{class:'rs-od-actions'},'已取消'));

test('C044 a verified FAKE receipt keeps its one detail link of the observed deep address shape or the old single-segment alias',async()=>{
  for(const href of [DEEP,'https://www.apple.com.cn/shop/order/detail/FAKE-ORDER/FAKE-LOOKUP','https://secure.www.apple.com.cn/shop/order/detail/FAKE-ORDER/FAKE-LOOKUP/',ALIAS]){
    const o=await decode(CHECKOUT,receipt({links:[link(href)]}));
    assert.equal(o.phase,'ORDER_RECEIPT',href);assert.equal(o.receiptVerified,true,href);assert.equal(o.orderDetailLink,href,href);
  }
  // The same observed address shown twice is one link.
  assert.equal((await decode(CHECKOUT,receipt({links:[link(DEEP),link(DEEP)]}))).orderDetailLink,DEEP);
});
for(const [name,href] of [
  ['plain http','http://secure8.www.apple.com.cn/shop/order/detail/FAKE-ORDER/FAKE-LOOKUP'],
  ['a non-mainland Apple host','https://secure8.www.apple.com/shop/order/detail/FAKE-ORDER/FAKE-LOOKUP'],
  ['a look-alike host suffix','https://secure8.www.apple.com.cn.example.invalid/shop/order/detail/FAKE-ORDER/FAKE-LOOKUP'],
  ['a non-Apple host','https://example.invalid/shop/order/detail/FAKE-ORDER/FAKE-LOOKUP'],
  ['the order list','https://secure8.www.apple.com.cn/shop/order/list'],
  ['a page under the order list','https://secure8.www.apple.com.cn/shop/order/list/FAKE-ORDER'],
  ['an account page','https://secure8.www.apple.com.cn/shop/account/home'],
  ['the order sign-in','https://secure8.www.apple.com.cn/shop/signIn/orders'],
  ['a bare order/detail','https://secure8.www.apple.com.cn/shop/order/detail'],
  ['order/detail with one segment','https://secure8.www.apple.com.cn/shop/order/detail/FAKE-ORDER'],
  ['order/detail with three segments','https://secure8.www.apple.com.cn/shop/order/detail/FAKE-ORDER/FAKE-LOOKUP/FAKE-MORE'],
  ['order/detail with an empty segment','https://secure8.www.apple.com.cn/shop/order/detail//FAKE-LOOKUP'],
  ['two segments without detail','https://secure8.www.apple.com.cn/shop/order/FAKE-ORDER/FAKE-LOOKUP'],
  ['another keyword','https://secure8.www.apple.com.cn/shop/order/details/FAKE-ORDER/FAKE-LOOKUP'],
  ['another letter case','https://secure8.www.apple.com.cn/shop/order/Detail/FAKE-ORDER/FAKE-LOOKUP'],
  ['a plural orders path','https://secure8.www.apple.com.cn/shop/orders/detail/FAKE-ORDER/FAKE-LOOKUP'],
])
  test('C044 a verified FAKE receipt keeps no detail link for '+name,async()=>{
    const o=await decode(CHECKOUT,receipt({links:[link(href)]}));
    assert.equal(o.phase,'ORDER_RECEIPT');assert.equal(o.receiptVerified,true);assert.equal(o.orderDetailLink,null);
  });
for(const [name,links] of [
  ['another link text',[link(DEEP,'订单帮助')]],
  ['a hidden detail link',[link(DEEP,'查看订单详情',{hidden:''})]],
  ['a deep link and an alias link',[link(DEEP),link(ALIAS)]],
  ['two different deep links',[link(DEEP),link('https://secure8.www.apple.com.cn/shop/order/detail/FAKE-ORDER/FAKE-OTHER')]],
])
  test('C044 a verified FAKE receipt with '+name+' keeps no detail link',async()=>{
    assert.equal((await decode(CHECKOUT,receipt({links}))).orderDetailLink,null);
  });
test('C044 a read FAKE detail page is ORDER_DETAIL only at the observed deep address shape or the old alias',async()=>{
  for(const href of [DEEP,'https://www.apple.com.cn/shop/order/detail/FAKE-ORDER/FAKE-LOOKUP/',ALIAS]){
    const o=await decode(href,detail());
    assert.equal(o.phase,'ORDER_DETAIL',href);assert.equal(o.purchase.verified,true,href);assert.deepEqual(o.slotSummary,slot,href);assert.equal(o.orderRefHash,await hex(REF),href);
  }
  for(const path of ['/shop/order/list','/shop/order/detail','/shop/order/detail/FAKE-ORDER','/shop/order/detail/FAKE-ORDER/FAKE-LOOKUP/FAKE-MORE','/shop/order/FAKE-ORDER/FAKE-LOOKUP','/shop/order/details/FAKE-ORDER/FAKE-LOOKUP','/shop/account/home','/shop/signIn/orders'])
    assert.notEqual((await decode('https://secure8.www.apple.com.cn'+path,detail())).phase,'ORDER_DETAIL',path);
  for(const href of ['https://example.invalid/shop/order/detail/FAKE-ORDER/FAKE-LOOKUP','http://secure8.www.apple.com.cn/shop/order/detail/FAKE-ORDER/FAKE-LOOKUP'])
    assert.equal((await decode(href,detail())).phase,'UNKNOWN',href);
});
for(const [name,items] of [
  ['the observed cancelled native status',[status(CANCELLED)]],
  ['a picked-up native status (FAKE wording)',[status(PICKED_UP)]],
  ['the observed model title with its cancelled status',[status(CANCELLED,{model:true})]],
  ['a hidden cancelled native status',[status(CANCELLED,{hidden:true})]],
  ['an empty native status',[status('')]],
  ['a pending and a cancelled native status',[status('待付款'),status(CANCELLED)]],
  ['the observed cancelled item marker alone',[cancelledMarker()]],
  ['a cancelled native status and FAKE pending help text',[status(CANCELLED),h('p',{},'请完成付款'),h('p',{},'如何取消订单？')]],
])
  test('C044 '+name+' beside FAKE pending prose never makes a detail page ORDER_DETAIL, at either address',async()=>{
    for(const href of [DEEP,ALIAS])assert.equal((await decode(href,detail({items}))).phase,'UNKNOWN',href);
  });
test('C044 a native cancelled status on a FAKE receipt makes it no verified receipt',async()=>{
  const o=await decode(CHECKOUT,receipt({before:[status(CANCELLED)]}));
  assert.equal(o.phase,'UNKNOWN');assert.equal(o.receiptVerified,false);
});
test('C044 rule boundary (FAKE): a native status that is itself a pending word does not block, and other facts still decide',async()=>{
  // No unpaid native status has been observed; this only shows the guard blocks non-pending native states, not every native status.
  assert.equal((await decode(DEEP,detail({items:[status('待付款')]}))).phase,'ORDER_DETAIL');
  const o=await decode(DEEP,detail({items:[status('待付款',{model:true})]}));
  assert.equal(o.phase,'ORDER_DETAIL');assert.equal(o.purchase.verified,false,'an extra model mention still leaves product identity unproven');
});

// FAKE Chrome over FAKE pages keyed by address. Every read runs the source the port sends (the actual merchantDocument); a command
// injection is counted and refused. Following a link shows the page stored for that address; any other address has no page.
function chromeApi(pages){
  const c={url:CHECKOUT,navigations:[],reads:[],commands:0};
  c.api={tabs:{async get(id){assert.equal(id,7);return {id,url:c.url,status:'complete'};},async update(id,{url}){assert.equal(id,7);c.navigations.push(url);c.url=url;return {id,url,status:'complete'};}},
    permissions:{async contains({origins}){return origins.every(o=>o==='https://www.apple.com.cn/*'||o==='https://secure8.www.apple.com.cn/*');}},
    scripting:{async executeScript(q){assert.equal(q.world,'ISOLATED');if(q.args.length>1){c.commands++;throw new Error('FAKE c044 accepts no command');}
      c.reads.push(c.url);const page=pages[c.url];if(!page)return [{frameId:0,documentId:'FAKE-c044-none',error:'FAKE no page at this address'}];
      return [{frameId:0,documentId:'FAKE-c044-'+c.url,result:await decode(c.url,page(),q.func)}];}}};
  return c;
}
// The task after its one FAKE final was sent with an unknown result (write-ahead deadline 7900 ms after the FAKE clock start).
const finalRow=()=>({schema:'applebuy-purchase-job/v1',taskId:'FAKE-c044-task',plan:structuredClone(plan),planDigest:digest,tabId:7,state:'RUNNING',reason:null,lastRead:4,lastPhase:'REVIEW',lastDocumentId:'FAKE-c044-review',entryDocumentId:'FAKE-c044-entry',expiresAt:start+600000,initialDates:[slot.date],dateCursor:0,floors:{},rejected:[],refusals:0,pending:{id:'FAKE-c044-submit',action:'submitOrder',intentId:'FAKE-c044-intent',documentId:'FAKE-c044-review',beforePhase:'REVIEW',deadline:start+7900},finalIntent:{id:'FAKE-c044-intent',grantId:'FAKE-c044-final-grant',sent:true},orderRefHash:null,acceptedSlot:{...slot},bagAddStarted:true,resourceWritten:true,untouchedFailures:0,untouchedStreak:0,quotedCny:9999,history:[{event:'FAKE-c044-kept'}],observationCurrent:false});
function job(c,{stored=finalRow(),readOnly=false,grant=null}={}){
  const t={row:structuredClone(stored),waits:0,time:start};
  const store={async get(k){assert.equal(k,TASK_KEY);return structuredClone(t.row);},async put(k,s){assert.equal(k,TASK_KEY);t.row=structuredClone(s);}};
  const port=new ChromePort(c.api,7,readOnly?{mode:'observe',initialSequence:stored.lastRead}:{authorized:true,initialSequence:stored.lastRead,pending:stored.pending,acceptedSlot:stored.acceptedSlot});
  port.wait=async()=>{t.waits++;t.time+=50;};
  t.run=()=>new PurchaseJob({store,port,now:()=>t.time}).run(plan,{tabId:7,planDigest:digest,...(readOnly?{mode:'reconcile'}:{}),...(grant?{grant}:{})});
  return t;
}
const kept=(s,before)=>{assert.deepEqual(s.finalIntent,before.finalIntent);assert.equal(s.expiresAt,before.expiresAt);assert.deepEqual(s.history,before.history);assert.deepEqual(s.acceptedSlot,before.acceptedSlot);};
const unconfirmed=(s,c,before,navigations)=>{
  assert.equal(s.state,'NEEDS_VERIFICATION');assert.equal(s.reason,'final-result-unconfirmed; no resubmission');assert.deepEqual(s.pending,before.pending);kept(s,before);
  assert.equal(c.commands,0);assert.deepEqual(c.navigations,navigations);
};

for(const [name,href] of [['observed deep address shape',DEEP],['old single-segment alias',ALIAS]])
  test('C044 one '+name+' link on a verified FAKE receipt is followed once and its FAKE exact unpaid detail confirms the sent final',async()=>{
    const c=chromeApi({[CHECKOUT]:()=>receipt({links:[link(href)]}),[href]:()=>detail()}),before=finalRow(),t=job(c,{stored:before}),s=await t.run();
    assert.equal(s.state,'CONFIRMED_UNPAID');assert.equal(s.reason,null);assert.equal(s.pending,null);assert.equal(s.orderRefHash,await hex(REF));kept(s,before);
    assert.deepEqual(c.navigations,[href]);assert.deepEqual(c.reads,[CHECKOUT,CHECKOUT,href]);assert.equal(c.commands,0);assert.equal(t.waits,1);
  });
for(const [name,page] of [
  ['the observed cancelled native status beside FAKE pending prose',()=>detail({items:[status(CANCELLED)]})],
  ['a picked-up native status (FAKE wording) beside FAKE pending prose',()=>detail({items:[status(PICKED_UP)]})],
  ['the observed cancelled title/status beside FAKE pending prose and help text',()=>detail({items:[status(CANCELLED,{model:true}),h('p',{},'请完成付款')]})],
  ['the observed cancelled item marker beside FAKE pending prose',()=>detail({items:[cancelledMarker()]})],
  ['no pending state (address, title and facts only)',()=>detail({pending:false})],
  ['no order identity',()=>detail({ref:false})],
  ['another order identity',()=>detail({ref:'FAKE-C044-0002'})],
  ['money but no quantity',()=>detail({quantity:false})],
  ['two units',()=>detail({quantity:'数量：2'})],
  ['another store',()=>detail({store:'取货地点：Apple FAKE 其他门店'})],
  ['no pickup time',()=>detail({time:false})],
  ['another pickup slot',()=>detail({time:'取货时间：21:00 – 21:15'})],
])
  test('C044 the followed deep detail page with '+name+' is read separately once and never confirms the sent final',async()=>{
    const c=chromeApi({[CHECKOUT]:()=>receipt(),[DEEP]:page}),before=finalRow(),t=job(c,{stored:before}),s=await t.run();
    unconfirmed(s,c,before,[DEEP]);assert.deepEqual(c.reads,[CHECKOUT,CHECKOUT,DEEP]);
  });
for(const [name,page] of [
  ['a deep link and an alias link',()=>receipt({links:[link(DEEP),link(ALIAS)]})],
  ['only an order-list link',()=>receipt({links:[link('https://secure8.www.apple.com.cn/shop/order/list')]})],
  ['a malformed deep link',()=>receipt({links:[link('https://secure8.www.apple.com.cn/shop/order/detail/FAKE-ORDER')]})],
  ['a non-Apple deep link',()=>receipt({links:[link('https://example.invalid/shop/order/detail/FAKE-ORDER/FAKE-LOOKUP')]})],
  ['a native cancelled status',()=>receipt({before:[status(CANCELLED)]})],
  ['no order identity',()=>receipt({ref:false})],
])
  test('C044 a FAKE receipt with '+name+' is never followed and the sent final stays unconfirmed',async()=>{
    const c=chromeApi({[CHECKOUT]:page,[DEEP]:()=>detail(),[ALIAS]:()=>detail()}),before=finalRow(),t=job(c,{stored:before}),s=await t.run();
    unconfirmed(s,c,before,[]);assert.equal(t.waits,0);assert.ok(c.reads.every(u=>u===CHECKOUT));
  });
test('C044 a cancelled detail cannot clear the sent final, revive its start grant or let read-only reconciliation navigate again',async()=>{
  const c=chromeApi({[CHECKOUT]:()=>receipt(),[DEEP]:()=>detail({items:[status(CANCELLED,{model:true})]})}),before=finalRow();
  const grant={id:'FAKE-c044-start-grant',start:true,entryDocumentId:'FAKE-c044-entry',taskId:'FAKE-c044-task',planDigest:digest,existingOrdersChecked:true,noExtras:true,termsAccepted:true,termsUrl:TERMS,expiry:start+600000};
  const first=job(c,{stored:before,grant}),s=await first.run();
  unconfirmed(s,c,before,[DEEP]);assert.deepEqual(s.revokedGrantIds,[grant.id]);
  const again=await job(c,{stored:first.row,grant}).run();
  assert.equal(again.state,'BLOCKED');assert.equal(again.reason,'advance-authorization-cleared-by-human-intervention');assert.deepEqual(again.pending,before.pending);kept(again,before);
  const reads=c.reads.length,ro=await job(c,{stored:first.row,readOnly:true}).run();
  assert.equal(ro.state,'NEEDS_VERIFICATION');assert.equal(ro.reason,'final-result-unconfirmed; no resubmission');assert.deepEqual(ro.pending,before.pending);kept(ro,before);
  assert.equal(c.reads.length,reads+1);assert.deepEqual(c.navigations,[DEEP]);assert.equal(c.commands,0);
});
