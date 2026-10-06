// Browser/parser responses below are FAKE, with no account, browser launch or external network.
import test from 'node:test';import assert from 'node:assert/strict';
import {browserChoice,launchOptions,safeFailure,watchFailures,browserConfig,ownProfile,createOwnedBrowser} from '../src/desktop/browser-choice.mjs';
test('C107 browser selection keeps Chrome default and selects installed Edge without profile or security overrides',()=>{
 assert.equal(browserChoice([]),'chrome');assert.equal(browserChoice(['--browser=msedge']),'msedge');assert.deepEqual(launchOptions('msedge'),{channel:'msedge',headless:false});
 for(const value of [['--browser=firefox'],['--browser=msedge','--browser=chrome'],['--ignore-certificate-errors'],['--browser=msedge --proxy-server=FAKE']])assert.throws(()=>browserChoice(value),/Unconfirmed/);
 assert.throws(()=>launchOptions('FAKE'),/Unconfirmed/);
});
test('C107 failure diagnostics emit only allowlisted hostname and status, never raw auth URL or payload',()=>{
 const secret='FAKE-private-secret';let privateReads=0;const r={status:()=>541,url:()=>`https://secure11.www.apple.com.cn/shop/signIn/idms/authx?private_session=${secret}`,request:()=>{privateReads++;throw Error('No request access');},text:()=>{privateReads++;throw Error('No body access');},headers:()=>{privateReads++;throw Error('No headers access');}};
 const value=safeFailure(r);assert.deepEqual(value,{host:'secure11.www.apple.com.cn',status:541});assert.equal(JSON.stringify(value).includes(secret),false);assert.equal(privateReads,0);
});
test('C107 successful, untrusted, plaintext and malformed responses do not create misleading diagnostics',()=>{
 for(const [url,status] of [['https://secure11.www.apple.com.cn/',200],['https://secure11.www.apple.com.cn.evil.invalid/',541],['http://idmsa.apple.com.cn/',541],['https://FAKE:FAKE@idmsa.apple.com.cn/',541],['https://www.apple.com.cn/',999],['not a URL',541]])assert.equal(safeFailure({url:()=>url,status:()=>status}),null);
 assert.equal(safeFailure({status(){throw Error('Closed');}}),null);
});
test('C107 diagnostics are bounded, deduplicated and detached on owned context close',()=>{
 let handler,detached;const rows=[];const context={on(name,fn){assert.equal(name,'response');handler=fn;},off(name,fn){assert.equal(name,'response');detached=fn;}};const stop=watchFailures(context,v=>rows.push(v));
 for(let n=0;n<30;n++){const status=400+n;handler({url:()=>`https://idmsa.apple.com.cn/FAKE?token=FAKE-${n}`,status:()=>status});handler({url:()=>`https://idmsa.apple.com.cn/OTHER`,status:()=>status});}
 assert.equal(rows.length,16);stop();assert.equal(detached,handler);handler({url:()=>`https://www.apple.com.cn/`,status:()=>541});assert.equal(rows.length,16);
});

test('C107 retained session is explicit, fixed to own workspace and cannot name a personal profile or add browser flags',()=>{
 assert.deepEqual(browserConfig(['--browser=chrome']),{channel:'chrome',keepSession:false});assert.deepEqual(browserConfig(['--browser=msedge','--keep-session']),{channel:'msedge',keepSession:true});
 for(const args of [['--keep-session','--keep-session'],['--browser=chrome','--user-data-dir=FAKE'],['--browser=chrome','--disable-blink-features=AutomationControlled']])assert.throws(()=>browserConfig(args),/Unconfirmed/);
 assert.match(ownProfile('chrome').replaceAll('\\','/'),/\/\.local\/desktop\/browser-profiles\/chrome$/);assert.throws(()=>ownProfile('../../FAKE'),/Unconfirmed/);
});
test('C107 temporary launch uses normal default context without blocking service workers or preserving authentication',async()=>{
 const events=[],context={on(){},off(){},async close(){events.push('context-close');}},browser={async newContext(...args){events.push(['new-context',args]);return context;},async close(){events.push('browser-close');}};
 const own=await createOwnedBrowser({async launch(options){events.push(['launch',options]);return browser;},async launchPersistentContext(){throw Error('Not approved');}},{channel:'chrome',keepSession:false},()=>{});
 assert.deepEqual(events,[['launch',{channel:'chrome',headless:false}],['new-context',[]]]);await own.close();assert.deepEqual(events.slice(-2),['context-close','browser-close']);
});
test('C107 approved own persistent context retains only its private programme profile and closes normally',async()=>{
 const calls=[],context={on(){},off(){},async close(){calls.push('close');}};
 const own=await createOwnedBrowser({async launchPersistentContext(path,options){calls.push({path,options});return context;},async launch(){throw Error('No fallback');}},{channel:'msedge',keepSession:true},()=>{});
 assert.equal(calls[0].path,ownProfile('msedge'));assert.deepEqual(calls[0].options,{channel:'msedge',headless:false});await own.close();assert.equal(calls.at(-1),'close');
 await assert.rejects(createOwnedBrowser({},{channel:'chrome',keepSession:'yes'},()=>{}),/Unconfirmed/);
});
test('C107 context startup failure cleans its own browser and does not fall back to another browser',async()=>{
 let closes=0,launches=0;
 await assert.rejects(createOwnedBrowser({async launch(){launches++;return {async newContext(){throw Error('FAKE context failed');},async close(){closes++;}};}},{channel:'msedge',keepSession:false},()=>{}),/context failed/);
 assert.equal(closes,1);assert.equal(launches,1);
});
