// Real renderer with the observed public label structure, fictional account/password only.
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {createRequire} from 'node:module';import {homedir} from 'node:os';import {join} from 'node:path';
import {loginForm} from '../web/checkout-connector/apple-login.js';
const {chromium}=createRequire(import.meta.url)(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
let browser,server,origin;
before(async()=>{server=http.createServer((q,r)=>r.end('FAKE C258'));await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--disable-background-networking']});});
after(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
test('C258 real linked-label account input is recognized and normal password submit occurs once',async()=>{
 const ctx=await browser.newContext({serviceWorkers:'block'});await ctx.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());await ctx.routeWebSocket('**/*',s=>s.close());const p=await ctx.newPage();
 try{await p.goto(origin);await p.setContent('<h2>使用你的 Apple 账户登录。</h2><span id="apple_id_field_label"> 电子邮件或电话号码 </span><input id="account_name_text_field" type="text" autocomplete="off" aria-labelledby="apple_id_field_label" value="fake@example.invalid"><span id="pw">密码</span><input type="password" autocomplete="current-password" aria-labelledby="pw"><button aria-label="登录">→</button><input type="checkbox"><input type="hidden">');
 await p.evaluate(()=>{globalThis.clicks=0;document.querySelector('button').addEventListener('click',()=>globalThis.clicks++);});
 const run=command=>p.evaluate(({source,command})=>new Function('location','return ('+source+')')({origin:'https://idmsa.apple.com.cn',pathname:'/appleauth/auth/authorize/signin'})('fake@example.invalid',command),{source:loginForm.toString(),command});
 assert.deepEqual(await run(null),{state:'password'});assert.deepEqual(await run({stage:'password',secret:'FAKE-c258',attempt:'c258'}),{state:'submitted'});assert.equal(await p.evaluate(()=>globalThis.clicks),1);
 assert.deepEqual(await run({stage:'password',secret:'FAKE-c258',attempt:'c258'}),{state:'already-attempted'});
 }finally{await ctx.close();}
});
