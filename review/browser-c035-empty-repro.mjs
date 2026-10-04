// Codex independent C035 parser reproduction. Real native DOM; owned loopback only.
// The minimal empty block is sanitized observed structure. Every variation, location shim,
// favorite, cart conflict and authority is FAKE. No real Apple request or personal profile.
import assert from 'node:assert/strict';
import http from 'node:http';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {merchantDocument} from '../web/checkout-connector/page-program.js';
const root=resolve(import.meta.dirname,'..'),evidence=JSON.parse(readFileSync(join(root,'docs/reviews/C-035-official-cart-evidence.json'),'utf8'));
const out=join(root,'.local/reviewer/c035-parser-'+new Date().toISOString().replace(/[:.]/g,'-'));mkdirSync(out);
const {chromium}=createRequire(import.meta.url)(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const plan={schema:'applebuy-intent/v1',product:{model:'iPhone Duo',capacity:'256GB',color:'星光白色'},quantity:1,maxTotalCny:15999,city:'大连',fulfillment:'pickup',stores:['Apple 大连恒隆广场'],dateRule:'initial-first-three-terminal',paymentMethod:'支付宝',extras:{tradeIn:'none',appleCare:'none'}};
const block=evidence.empty.sanitizedBlockHtml;
const wrapper=(body,after='')=>'<div role="main"><div class="rs-bag"><div id="bag-content" class="rs-bag-content as-l-container rs-zoom-content"><div role="status"></div><div data-autom="bag-error-message" aria-live="polite"></div>'+body+'</div>'+after+'</div></div>';
const favorites='<div class="rs-savedbyyou"><h2>个人收藏</h2><ul role="list" aria-label="产品"><li><h3>FAKE iPhone Duo 256GB 星光白色</h3><p>RMB 15,999</p><a href="/shop/buy-iphone/iphone-duo">继续</a></li></ul></div>';
const cases=[
 {name:'observed-minimal-empty-cart-is-explicitly-verified',body:wrapper(block),positive:true},
 {name:'empty-cart-with-saved-products-still-explicitly-empty',body:wrapper(block,favorites),positive:true},
 {name:'heading-alone-without-observed-anchor-is-not-empty-proof',body:wrapper('<h1>你的购物袋中没有商品。</h1>'),positive:false},
 {name:'missing-continue-shopping-anchor-is-not-empty-proof',body:wrapper(block.replace(/<a[\s\S]*?<\/a>/,'')),positive:false},
 {name:'processing-with-stale-empty-block-is-not-empty-proof',body:wrapper(block+'<img alt="正在处理"><div role="status">正在处理</div>'),positive:false},
 {name:'contradictory-purchased-list-is-not-empty-proof',body:wrapper(block+'<ol class="rs-bag-items rs-iteminfos"><li><h2>FAKE iPhone 18 Pro 256GB 黑色</h2><select aria-label="数量"><option selected>1</option></select><p>RMB 9,999</p></li></ol>'),positive:false},
 {name:'duplicated-empty-scopes-are-not-empty-proof',body:wrapper(block+block),positive:false},
 {name:'hidden-empty-block-is-not-empty-proof',body:wrapper(block.replace('<div class="rs-bagempty','<div hidden class="rs-bagempty')),positive:false},
 {name:'observed-404-is-not-empty-proof',body:wrapper('<h1 class="section-headline">很抱歉，你要查找的网页找不到。</h1>'),positive:false,path:'/shop/404'}
];
const report={scope:'independent C035 FAKE-loopback current-parser reproduction from sanitized native empty structure',personalProfileUsed:false,actualApplePageVisited:false,actualExtensionInstalledOrGranted:false,realOrderCreated:false,checks:[],network:{allowed:0,blocked:0},cleanup:{contextsClosed:0,browserClosed:false,serverClosed:false,errors:[]}};
let server,browser,origin,body;const contexts=new Set();
try{
 server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"});res.end('<!doctype html><html data-applebuy-selfcheck="fake-empty/v1"><body>'+body+'</body></html>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking']});report.browserVersion=browser.version();
 for(const c of cases){let context;
  try{
   body=c.body;context=await browser.newContext({serviceWorkers:'block'});contexts.add(context);
   await context.route('**/*',async r=>{if(new URL(r.request().url()).origin===origin){report.network.allowed++;await r.continue();}else{report.network.blocked++;await r.abort();}});await context.routeWebSocket('**/*',s=>s.close());
   const page=await context.newPage();await page.goto(origin);
   const result=await page.evaluate(async({source,intent,path})=>{const u=new URL(location.href);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||document.documentElement.dataset.applebuySelfcheck!=='fake-empty/v1')throw Error('OfflineSelfCheckOnly');return await new Function('location','return ('+source+')')({href:'https://www.apple.com.cn'+path})(intent);},{source:merchantDocument.toString(),intent:plan,path:c.path??'/shop/bag'});
   const empty=result.verifiedStep===true&&/EMPTY/.test(result.phase);
   assert.equal(empty,c.positive,'recognized explicit empty phase must match only the observed complete current empty scope');
   report.checks.push({name:c.name,passed:true,phase:result.phase,verifiedStep:result.verifiedStep});console.log('PASS '+c.name);
  }catch(e){report.checks.push({name:c.name,passed:false,error:String(e.message).slice(0,450)});console.log('FAIL '+c.name+' '+e.message);}
  finally{if(context){await context.close();contexts.delete(context);report.cleanup.contextsClosed++;}}
 }
 report.passed=report.checks.length===cases.length&&report.checks.every(c=>c.passed);
}catch(e){report.passed=false;report.error=String(e.stack||e).slice(0,1200);}
finally{
 for(const c of [...contexts])try{await c.close();contexts.delete(c);report.cleanup.contextsClosed++;}catch(e){report.cleanup.errors.push('context: '+e.message);}
 if(server){server.closeAllConnections?.();await new Promise(r=>server.close(e=>{if(e)report.cleanup.errors.push('server: '+e.message);else report.cleanup.serverClosed=true;r();}));}
 if(browser)try{await browser.close();report.cleanup.browserClosed=true;}catch(e){report.cleanup.errors.push('browser: '+e.message);}
 if(contexts.size||report.cleanup.errors.length||!report.cleanup.serverClosed||!report.cleanup.browserClosed)report.passed=false;
 writeFileSync(join(out,'result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,result:join(out,'result.json'),cleanup:report.cleanup}));if(!report.passed)process.exitCode=1;
}
