import test from 'node:test';import assert from 'node:assert/strict';
import {world} from './fixtures/c121-native-world.mjs';
import {ChromePort} from '../web/checkout-connector/chrome-port.js';
import {PRO_PLAN} from '../src/desktop/browser-session.mjs';
import {BAG} from '../web/checkout-connector/checkout-rpc-contract.js';

function fixture(){
 const f=world(),execute=f.chrome.scripting.executeScript;f.w.phase='FULFILLMENT';let summaryKey=null;
 f.chrome.scripting.executeScript=async q=>{
  if(q.args[1]?.action==='readOrderSummary'){
   const current=f.w.tabs.get(q.target.tabId);if(q.target.documentIds[0]!=='FAKE-doc-'+current.id+'-'+current.version)throw Error('FAKE replaced document');
   assert.equal(q.args[1].documentId,q.target.documentIds[0]);summaryKey=q.args[1].summaryKey;
   return [{frameId:0,documentId:q.target.documentIds[0],result:{delivered:true,summary:{goodsCount:1,totalCny:9999,subtotalCny:9999}}}];
  }
  const rows=await execute(q),page=rows[0].result;page.summaryReadable=true;page.purchase.quantity=summaryKey?1:null;page.purchase.itemVerified=!!summaryKey;page.purchase.verified=!!summaryKey;page.quantitySource=summaryKey?'order-summary':null;page.orderSummary=summaryKey?{state:'current',readBy:summaryKey,goodsCount:1,totalCny:9999,subtotalCny:9999}:{state:'not-read'};return rows;
 };
 return f;
}

test('C145 production native summary command carries the exact current document binding',async()=>{
 const f=fixture(),tab=await f.api.create(BAG),port=new ChromePort(f.api,tab.id,{mode:'purchase',authorized:true,orderSummary:true});
 try{await port.observe(PRO_PLAN);const read=await port.readSummary(PRO_PLAN,'FAKE-summary-task');assert.equal(read.read,true);const observed=await port.observe(PRO_PLAN);assert.equal(observed.purchase.quantity,1);assert.equal(observed.purchase.verified,true);assert.equal(f.w.commands.includes('addBag'),false);assert.equal(f.w.commands.includes('checkout'),false);}
 finally{await f.api.close();}
});

test('C145 readonly port cannot disclose a summary even through the native transport',async()=>{
 const f=fixture(),tab=await f.api.create(BAG),port=new ChromePort(f.api,tab.id,{mode:'observe'});try{await port.observe(PRO_PLAN);await assert.rejects(port.readSummary(PRO_PLAN,'FAKE-task'),/NotAuthorized/);assert.equal(f.w.commands.length,0);}finally{await f.api.close();}
});

test('C145 replaced document cannot lend its prior summary binding',async()=>{
 const f=fixture(),tab=await f.api.create(BAG),port=new ChromePort(f.api,tab.id,{mode:'purchase',authorized:true,orderSummary:true});try{await port.observe(PRO_PLAN);f.w.tabs.get(tab.id).version++;await assert.rejects(port.readSummary(PRO_PLAN,'FAKE-task'));assert.equal(port.summaryDocumentId,null);assert.equal(f.w.commands.length,0);}finally{await f.api.close();}
});
