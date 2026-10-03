// Codex C031 quota takeover: current public Duo labels/dependency reference, all DOM events/transport are FAKE.
// No real Chrome profile, extension, merchant request, slot, order or payment. Gate does not mean no stock.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
import {ChromePort} from '../web/checkout-connector/chrome-port.js';
import {PurchaseJob} from '../web/checkout-connector/job.js';
const plan={schema:'applebuy-intent/v1',product:{model:'iPhone Duo',capacity:'256GB',color:'星光白色'},quantity:1,maxTotalCny:15999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{tradeIn:'none',appleCare:'none'}};
const base='https://www.apple.com.cn/shop/buy-iphone/iphone-duo',sku=base+'/mk2m4ch/a';
class El{
 constructor(text='',tag='DIV'){Object.assign(this,{textContent:text,tagName:tag,attrs:{},parentElement:null,isConnected:true,hidden:false,disabled:false,checked:false,labels:[],clicks:0});}
 getAttribute(k){return this.attrs[k]??null;}hasAttribute(k){return Object.hasOwn(this.attrs,k);}closest(){return null;}
 click(){assert.equal(this.disabled,false,'a disabled control was clicked');this.clicks++;if(this.tagName==='INPUT')this.checked=true;this.onClick?.();}
 dispatchEvent(){return true;}checkValidity(){return true;}
}
function page({href=base,heading='iPhone Duo',missing=false,configured=false,prelaunch=true}={}){
 const white=new El('','INPUT'),capacity=new El('','INPUT'),noTrade=new El('','INPUT'),noCare=new El('','INPUT');
 [white,capacity,noTrade,noCare].forEach((e,i)=>e.labels=[new El(['星光白色','256GB 脚注 1 RMB 15,999 或 RMB 667/月 (24期) 起','不折抵换购','不加 AppleCare+ 服务计划 你的设备将不能享受意外损坏保障。'][i],'LABEL')]);
 capacity.disabled=noTrade.disabled=noCare.disabled=!configured;
 const continueButton=new El('继续','BUTTON');continueButton.disabled=true;
 const h={href,white,capacity,noTrade,noCare,continueButton,radios:missing?[]:[white,capacity,noTrade,noCare],title:new El(heading,'H1'),texts:prelaunch?['暂未发售','目前暂不提供 Apple Store 零售店取货服务']:[],actions:[],clock:1000};
 white.onClick=()=>capacity.disabled=false;capacity.onClick=()=>{noTrade.disabled=false;h.href=sku;};noTrade.onClick=()=>noCare.disabled=false;
 if(configured)for(const r of h.radios)r.checked=true;
 const main=new El();main.querySelector=s=>s==='h1'?h.title:null;
 main.querySelectorAll=s=>s.startsWith('button')?[continueButton]:s.startsWith('input[type="radio"]')?h.radios:s==='select'?[]:s==='h1,h2,h3,p,span,div'?[h.title,...h.texts.map(t=>new El(t,'SPAN'))]:[];
 const context=vm.createContext({document:{querySelector:()=>main,querySelectorAll:()=>[]},location:{get href(){return h.href;}},URL,TextEncoder,crypto:webcrypto,Date,getComputedStyle:e=>({display:e.hidden?'none':'block',visibility:'visible'}),HTMLInputElement:El,Event:class{}});
 const fn=vm.runInContext('('+merchantDocument.toString()+')',context);
 h.read=async()=>structuredClone(await fn(plan));h.send=async(action,extra={})=>structuredClone(await fn(plan,{id:'FAKE-c031-'+h.actions.length,taskId:'FAKE-c031-task',action,authorized:true,structured:true,expected:JSON.stringify(await h.read()),...extra}));
 h.api={tabs:{get:async()=>({url:h.href})},permissions:{contains:async()=>true},scripting:{executeScript:async x=>{if(x.args[1])h.actions.push(x.args[1].action+':'+(x.args[1].choice??''));return [{frameId:0,documentId:'FAKE-c031-doc',result:structuredClone(await fn(...x.args))}];}}};
 return h;
}
async function run(h,{mode='public-config',initial=null,maxWait=300}={}){
 let stored=initial?structuredClone(initial):null;
 const store={get:async()=>stored?structuredClone(stored):null,put:async(k,v)=>stored=structuredClone(v)};
 const port=new ChromePort(h.api,7,{authorized:true,mode:mode==='public-config'?'public-config':'purchase',initialSequence:initial?.lastRead??0});port.wait=async ms=>h.clock+=ms;
 let serial=0;const result=await new PurchaseJob({store,port,now:()=>h.clock,id:()=> 'FAKE-c031-id-'+(++serial),hydrationMs:maxWait,maxSteps:30}).run(plan,{tabId:7,planDigest:'FAKE-c031-digest',mode});return {result,stored};
}
for(const mode of ['public-config','purchase'])test('C031 '+mode+': normal prelaunch dependency chain prepares all four choices, clears pending and stops before resource actions',async()=>{
 const h=page(),{result,stored}=await run(h,{mode});assert.equal(result.state,'NOT_RELEASED');assert.equal(result.reason,'official-entry-not-released');
 assert.deepEqual(h.actions,['configureProduct:星光白色','configureProduct:256GB','configureProduct:不折抵换购','configureProduct:不加 AppleCare+ 服务计划']);
 for(const r of [h.white,h.capacity,h.noTrade,h.noCare]){assert.equal(r.checked,true);assert.equal(r.clicks,1);}
 assert.equal(h.continueButton.clicks,0);assert.equal(stored.pending,null);assert.equal(stored.resourceWritten,false);assert.equal(stored.bagAddStarted,false);assert.equal(stored.finalIntent,null);
 assert.equal((await h.read()).configuration.complete,true);assert.equal(h.href,sku);
});
test('C031 fully selected public prelaunch needs zero clicks and never interprets disabled Continue as no stock',async()=>{
 const h=page({configured:true,href:sku}),{result}=await run(h);assert.equal(result.state,'NOT_RELEASED');assert.deepEqual(h.actions,[]);assert.equal(h.continueButton.clicks,0);
});
for(const stage of ['colour','capacity'])test('C031 a release gate appearing after '+stage+' reconciles that public choice and finishes remaining preparation without repeat',async()=>{
 const h=page({prelaunch:false}),control=stage==='colour'?h.white:h.capacity,original=control.onClick;
 control.onClick=()=>{original();h.texts=['暂未发售','目前暂不提供 Apple Store 零售店取货服务'];};
 const {result,stored}=await run(h);assert.equal(result.state,'NOT_RELEASED');assert.equal(stored.pending,null);assert.equal(h.actions.length,4);for(const r of h.radios)assert.equal(r.clicks,1);assert.equal(h.continueButton.clicks,0);assert.equal(stored.resourceWritten,false);
});
test('C031 actor permits only the current enabled public choice at the recognized prelaunch document',async()=>{
 const h=page(),o=await h.read();assert.equal(o.phase,'PRELAUNCH');assert.equal(o.prelaunchConfigurable,true);assert.equal(o.nextChoice.choice,'星光白色');assert.equal((await h.send('configureProduct',{choice:'星光白色'})).delivered,true);assert.equal(h.white.clicks,1);
});
test('C031 disabled dependency is never clicked or forced',async()=>{
 const h=page();h.white.checked=true;h.capacity.disabled=true;const {result}=await run(h);assert.equal(result.state,'NOT_READY');assert.match(result.reason,/required-option-disabled/);assert.deepEqual(h.actions,[]);assert.equal(h.capacity.clicks,0);assert.equal(h.continueButton.clicks,0);
});
test('C031 absent public controls remain unknown configuration, not no stock',async()=>{
 const h=page({missing:true}),{result}=await run(h);assert.equal(result.state,'NOT_READY');assert.match(result.reason,/required-option-absent/);assert.deepEqual(h.actions,[]);
});
test('C031 disabled Continue without explicit release notice remains NOT_READY, never NOT_RELEASED',async()=>{
 const h=page({configured:true,prelaunch:false}),{result}=await run(h);assert.equal(result.state,'NOT_READY');assert.equal(result.reason,'official-continue-disabled; availability not established');assert.deepEqual(h.actions,[]);
});
test('C031 an explicit regulatory approval gate is preserved even alongside normal release labels',async()=>{
 const h=page();h.texts.push('机型将在获得批准后发售');assert.equal((await h.read()).prelaunchConfigurable,false);const {result}=await run(h);assert.equal(result.state,'NOT_RELEASED');assert.deepEqual(h.actions,[]);assert.equal(h.white.clicks,0);
});
for(const [name,opts] of Object.entries({'secure checkout':{href:'https://secure6.www.apple.com.cn/shop/checkout'},'wrong model path':{href:'https://www.apple.com.cn/shop/buy-iphone/iphone-18-pro'},'wrong heading':{heading:'iPhone 18 Pro'}}))test('C031 prelaunch text cannot grant public configuration on '+name,async()=>{
 const h=page(opts),o=await h.read();assert.equal(o.phase,'PRELAUNCH');assert.equal(o.prelaunchConfigurable,false);const x=await h.send('configureProduct',{choice:'星光白色'});assert.equal(x.delivered,false);assert.equal(x.touched,false);assert.equal(h.white.clicks,0);const {result}=await run(h,{mode:'purchase'});assert.equal(result.state,'NOT_RELEASED');assert.deepEqual(h.actions,[]);
});
for(const action of ['continueProduct','addBag','checkout','chooseSlot','submitOrder'])test('C031 a prelaunch document cannot deliver '+action,async()=>{
 const h=page({configured:true});const x=await h.send(action);assert.equal(x.delivered,false);assert.equal(x.touched,false);assert.equal(h.continueButton.clicks,0);
});
const oldTask=patch=>({schema:'applebuy-purchase-job/v1',taskId:'FAKE-c031-preserved',plan:structuredClone(plan),planDigest:'FAKE-c031-digest',tabId:7,state:'NEEDS_VERIFICATION',lastPhase:'REVIEW',lastDocumentId:'FAKE-c031-doc',entryDocumentId:'FAKE-c031-doc',reason:null,pending:null,finalIntent:null,orderRefHash:null,initialDates:null,dateCursor:0,floors:{},rejected:[],refusals:0,lastRead:0,expiresAt:100000,bagAddStarted:true,resourceWritten:true,untouchedFailures:0,untouchedStreak:0,quotedCny:15999,mode:'purchase',...patch});
test('C031 unknown final on a public prelaunch page remains lookup-only, never configures or resubmits',async()=>{
 const h=page(),initial=oldTask({expiresAt:500,finalIntent:{id:'FAKE-final',sent:true},pending:{id:'FAKE-final',action:'submitOrder',documentId:'FAKE-c031-doc',beforePhase:'REVIEW',deadline:500}}),{result,stored}=await run(h,{mode:'purchase',initial});
 assert.equal(result.state,'NEEDS_VERIFICATION');assert.equal(result.reason,'final-result-unconfirmed; no resubmission');assert.deepEqual(h.actions,[]);assert.deepEqual(stored.pending,initial.pending);assert.equal(stored.finalIntent.sent,true);
});
test('C031 a previously started bag on return to prelaunch never reconfigures or adds again',async()=>{
 const h=page(),{result}=await run(h,{mode:'purchase',initial:oldTask({lastPhase:'BAG'})});assert.equal(result.state,'NEEDS_VERIFICATION');assert.match(result.reason,/bag-addition-already-started/);assert.deepEqual(h.actions,[]);
});
