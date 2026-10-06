// Production Runtime/Job/Port/Peer, FAKE delayed public controls. No real Chrome or merchant resource.
import test from 'node:test';import assert from 'node:assert/strict';
import {world} from './fixtures/c121-native-world.mjs';

function delayed({forever=false,conflict=false,prelaunch=false,priceChange=false}={}){
 const f=world(),execute=f.chrome.scripting.executeScript;let reads=0;
 f.chrome.scripting.executeScript=async q=>{
  const rows=await execute(q),page=rows[0]?.result;
  if(!q.args[1]&&q.target.tabId===f.w.mainId&&page?.phase==='VARIANT'&&!f.w.commands.includes('addBag')){
   reads++;
   if(forever||reads<=2){page.phase=prelaunch?'PRELAUNCH':'ENTRY';page.continueAvailable=false;page.nextChoice=null;page.configuration={complete:true,addToBag:'absent'};page.variantVerified=false;page.extrasConflict=conflict;page.prelaunchConfigurable=false;}
   else if(priceChange)page.quotedCny=10000;
  }
  return rows;
 };
 return {...f,reads:()=>reads};
}

test('C137 late Add control continues the same approved run to review without a manual resume or duplicate Add',async()=>{
 const f=delayed();try{
  await f.runtime.open();const result=await f.runtime.advance({checkoutApproved:true,newContextConfirmed:true});
  assert.equal(result.phase,'REVIEW');assert.equal(f.w.commands.filter(a=>a==='addBag').length,1);assert.equal(f.w.commands.filter(a=>a==='checkout').length,1);assert.equal(f.w.commands.includes('continueProduct'),false);assert.equal(f.w.commands.includes('submitOrder'),false);assert.ok(f.reads()>2);
 }finally{await f.runtime.close();}
});

test('C137 a control that stays absent is bounded NOT_READY, never stock absence or forced Continue',async()=>{
 const f=delayed({forever:true});try{
  await f.runtime.open();const result=await f.runtime.advance({checkoutApproved:true,newContextConfirmed:true});
  assert.equal(result.state,'NOT_READY');assert.match(result.reason,/availability not established/);assert.equal(f.w.commands.includes('addBag'),false);assert.equal(f.w.commands.includes('continueProduct'),false);assert.ok(f.reads()<80);
 }finally{await f.runtime.close();}
});

for(const [name,options,state] of [['extra-conflict',{conflict:true},'BLOCKED'],['prelaunch',{prelaunch:true},'NOT_RELEASED'],['higher-price-after-hydration',{priceChange:true},'BLOCKED']])test('C137 '+name+' still blocks all Add and checkout',async()=>{
 const f=delayed(options);try{
  await f.runtime.open();const result=await f.runtime.advance({checkoutApproved:true,newContextConfirmed:true});
  assert.equal(result.state,state);assert.equal(f.w.commands.includes('addBag'),false);assert.equal(f.w.commands.includes('checkout'),false);assert.equal(f.w.commands.includes('continueProduct'),false);assert.equal(f.w.commands.includes('submitOrder'),false);
 }finally{await f.runtime.close();}
});
