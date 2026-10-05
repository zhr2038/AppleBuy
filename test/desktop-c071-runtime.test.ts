// Complete production desktop transport/controller; Chrome, DOM replies, merchant effects and authority below are FAKE.
import test from 'node:test';import assert from 'node:assert/strict';
import {DesktopBrowserApi} from '../src/desktop/browser-api.mjs';
import {runDesktopSession,PRO_PLAN,proDigest} from '../src/desktop/browser-session.mjs';
import {createPurchaseRecord,TASK_KEY} from '../web/checkout-connector/job.js';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
const TERM='https://www.apple.com.cn/shop/open/salespolicies',SKU='https://www.apple.com.cn/shop/buy-iphone/iphone-18-pro/mjt74ch/a';
function world(){
 const w={phase:'VARIANT',commands:[],pages:[],selected:null,payment:null,ref:null,row:null};
 class Page{closed=false;uri=SKU;listeners=[];
  on(n,f){if(n==='domcontentloaded')this.listeners.push(f);}mainFrame(){return this;}isClosed(){return this.closed;}url(){return this.uri;}
  async goto(uri){this.uri=uri;for(const f of this.listeners)f(this);return null;}async waitForSelector(){}async close(){this.closed=true;}
  async evaluate(fn,payload){assert.equal(payload.source,merchantDocument.toString());const [p,c]=payload.args;assert.deepEqual(p,PRO_PLAN);
   if(c){w.commands.push(c.action);if(c.action==='addBag')w.phase='BAG';else if(c.action==='checkout')w.phase='FULFILLMENT';else if(c.action==='selectPickup')w.phase='SLOTS';else if(c.action==='chooseSlot'){w.selected={date:c.date,start:c.start,end:c.end,verified:true};w.phase='DETAILS';}else if(c.action==='fillDetails')w.phase='PAYMENT';else if(c.action==='selectPayment')w.payment='支付宝';else if(c.action==='continuePayment')w.phase='REVIEW';else if(c.action==='submitOrder'){w.ref='b'.repeat(64);w.phase='ORDER_RECEIPT';}else throw Error('Unexpected fake command '+c.action);return {delivered:true};}
   const side=this!==w.pages[0],detail=this.uri.includes('/order/detail/');const phase=side?'EMPTY_BAG':detail?'ORDER_DETAIL':w.phase;
   const purchase={...PRO_PLAN.product,quantity:1,totalCny:9999,itemVerified:true,verified:true,fulfillment:'pickup',store:PRO_PLAN.stores[0],storeVerified:true};
   const out={schema:'applebuy-merchant-read/v1',phase,path:phase==='BAG'||side?'/shop/bag':phase==='VARIANT'?new URL(SKU).pathname:detail?'/shop/order/detail/FAKE/FAKE':'/shop/checkout',verifiedStep:true,purchase,extras:false,variantVerified:true,quotedCny:9999,nextChoice:null,acceptedSlot:w.selected,slotSummary:w.selected,paymentMethod:w.payment,termsLinks:[TERM],receiptVerified:!!w.ref,orderRefHash:w.ref,orderDetailLink:w.ref?'https://www.apple.com.cn/shop/order/detail/FAKE/FAKE':null};
   if(phase==='FULFILLMENT'){out.purchase.fulfillment=null;out.fulfillmentChoice='unselected';}
   if(phase==='SLOTS'){out.listComplete=true;out.dates=[{label:'October 6',ref:'date:0',enabled:true,selected:true},{label:'October 7',ref:'date:1',enabled:true}];out.selectedDate='October 6';out.times=[{start:'09:00',end:'09:15',ref:'time:1',enabled:true},{start:'21:15',end:'21:30',ref:'time:46',enabled:true}];}
   return out;
  }
 }
 const context={async newPage(){const p=new Page();w.pages.push(p);return p;}};
 const store={async acquireOwner(){return {owned:true,release:async()=>{}};},async get(k){return k===TASK_KEY&&w.row?structuredClone(w.row):null;},async put(k,v){if(k===TASK_KEY)w.row=structuredClone(v);}};
 return {w,context,store};
}
test('C071 production desktop adapter reaches REVIEW then one independently confirmed FAKE unpaid order',async()=>{
 const {w,context,store}=world(),api=new DesktopBrowserApi(context,{publicOnly:false}),tab=await api.create(SKU);
 w.row={...createPurchaseRecord(PRO_PLAN,{taskId:'FAKE-retired',planDigest:proDigest,tabId:999,now:Date.now()-1000,id:()=> 'FAKE'}),state:'RETIRED'};
 const authority={checkoutApproved:true,legacyOwnershipRevoked:true,newContextConfirmed:true,planDigest:proDigest};
 const first=await runDesktopSession({api,tabId:tab.id,store,mode:'purchase',authority});assert.equal(first.phase,'REVIEW');assert.equal(first.realOrderVerified,false);assert.equal(w.commands.filter(c=>c==='addBag').length,1);assert.equal(w.commands.includes('submitOrder'),false);
 const a={...authority,finalConsent:{taskId:w.row.taskId,documentId:w.row.lastDocumentId,acceptedAt:Date.now(),termsAccepted:true,noExtras:true,existingOrdersChecked:true,termsUrl:TERM}};
 const done=await runDesktopSession({api,tabId:tab.id,store,mode:'purchase',authority:a});assert.equal(done.state,'CONFIRMED_UNPAID');assert.equal(done.realOrderVerified,true);assert.equal(w.commands.filter(c=>c==='submitOrder').length,1);assert.equal(w.row.acceptedSlot.start,'21:15');
 await runDesktopSession({api,tabId:tab.id,store,mode:'purchase',authority});assert.equal(w.commands.filter(c=>c==='addBag').length,1);assert.equal(w.commands.filter(c=>c==='submitOrder').length,1);assert.equal(w.pages.filter(p=>p.closed).length,1);
});
test('C071 blank or unresolved imported ledger cannot authorize a new desktop buyer',async()=>{
 const {w,context,store}=world(),api=new DesktopBrowserApi(context,{publicOnly:false}),tab=await api.create(SKU),authority={checkoutApproved:true,legacyOwnershipRevoked:true,newContextConfirmed:true,planDigest:proDigest};
 await assert.rejects(runDesktopSession({api,tabId:tab.id,store,mode:'purchase',authority}),/LegacyHandoffRequired/);
 w.row={...createPurchaseRecord(PRO_PLAN,{taskId:'FAKE-old',planDigest:proDigest,tabId:999,now:Date.now(),id:()=> 'FAKE'}),pending:{id:'FAKE-old-add',action:'addBag',documentId:'FAKE-old',deadline:0},bagAddStarted:true,resourceWritten:true};
 await assert.rejects(runDesktopSession({api,tabId:tab.id,store,mode:'purchase',authority}),/LegacyResultStillUnconfirmed/);assert.deepEqual(w.commands,[]);
});
test('C071 public transport cannot Add, Checkout, create a bag context or execute arbitrary functions',async()=>{
 const {context,w}=world(),api=new DesktopBrowserApi(context),tab=await api.create(SKU),doc=api.documents.get(tab.id);
 for(const action of ['addBag','checkout','chooseSlot','submitOrder'])await assert.rejects(api.scripting.executeScript({target:{tabId:tab.id,documentIds:[doc]},world:'ISOLATED',func:merchantDocument,args:[PRO_PLAN,{action}]}),/PublicProbeCannotPurchase/);
 await assert.rejects(api.create('https://www.apple.com.cn/shop/bag'),/AddressNotAuthorized/);
 await assert.rejects(api.scripting.executeScript({target:{tabId:tab.id,documentIds:[doc]},world:'ISOLATED',func:()=>{},args:[PRO_PLAN]}),/ProgramNotAuthorized/);assert.deepEqual(w.commands,[]);
});
test('C071 document replacement and foreign addresses fail before command delivery',async()=>{
 const {context,w}=world(),api=new DesktopBrowserApi(context,{publicOnly:false}),tab=await api.create(SKU),doc=api.documents.get(tab.id);
 await api.tabs.update(tab.id,{url:SKU});await assert.rejects(api.scripting.executeScript({target:{tabId:tab.id,documentIds:[doc]},world:'ISOLATED',func:merchantDocument,args:[PRO_PLAN,{action:'addBag'}]}),/DocumentChanged/);
 await assert.rejects(api.tabs.update(tab.id,{url:'https://example.invalid'}),/AddressNotAuthorized/);assert.deepEqual(w.commands,[]);
});
