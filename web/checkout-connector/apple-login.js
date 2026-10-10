// Optional, memory-only ordinary form login. No HTTP auth, profile/cookie access or challenge handling.
export const APPLE_AUTH_ORIGIN='https://idmsa.apple.com.cn/*';
export function loginParentDocument(){
 const u=new URL(location.href),frames=[...document.querySelectorAll('iframe#aid-auth-widget-iFrame')];
 if(u.protocol!=='https:'||u.username||u.password||u.port||!(u.hostname==='www.apple.com.cn'||/^secure\d+\.www\.apple\.com\.cn$/.test(u.hostname))||!/^\/shop\/signIn(?:\/orders)?\/?$/.test(u.pathname)||frames.length!==1)return false;
 try{const f=new URL(frames[0].src);return f.origin==='https://idmsa.apple.com.cn'&&/^\/appleauth\/auth\/authorize\/signin\/?$/.test(f.pathname)&&frames[0].getClientRects().length>0;}catch{return false;}
}
export function loginFrameIdentity(){
 return location.origin==='https://idmsa.apple.com.cn'&&/^\/appleauth\/auth\/authorize\/signin\/?$/.test(location.pathname);
}
export function loginForm(account,command=null){
 // Self contained for Chrome's ISOLATED world. A command targets one already identified document.
 const out=state=>({state});
 if(location.origin!=='https://idmsa.apple.com.cn'||!/^\/appleauth\/auth\/authorize\/signin\/?$/.test(location.pathname))return out('unsupported');
 if(typeof account!=='string'||!/^\S+@\S+\.\S+$/.test(account)||account.length>254)return out('unsupported');
 const norm=s=>String(s??'').replace(/\s+/g,' ').trim();
 const visible=e=>!!e?.isConnected&&e.getClientRects().length>0&&!e.closest('[hidden],[inert],[aria-hidden="true"]')&&getComputedStyle(e).visibility==='visible';
 const enabled=e=>visible(e)&&!e.disabled&&e.getAttribute('aria-disabled')!=='true';
 const name=e=>{const ids=(e.getAttribute('aria-labelledby')||'').trim().split(/\s+/).filter(Boolean),linked=ids.map(id=>e.ownerDocument.getElementById(id));
  return norm(ids.length&&linked.every(Boolean)?linked.map(x=>x.textContent).join(' '):e.getAttribute('aria-label')||e.labels?.[0]?.textContent||e.getAttribute('placeholder')||e.textContent);};
 function scan(){
  const inputs=[...document.querySelectorAll('input')].filter(visible);
  const notices=[...document.querySelectorAll('[role="alert"],[role="alertdialog"],dialog')].filter(e=>visible(e)&&norm(e.textContent));
  if(notices.length||inputs.some(e=>e.autocomplete==='one-time-code'||/验证码|安全码|verification code|security code/i.test(name(e)))||[...document.querySelectorAll('h1,h2,h3')].filter(visible).some(e=>/双重认证|验证码|隐私|条款|信任|two.factor|verification|privacy|terms|trust/i.test(e.textContent))||[...document.querySelectorAll('iframe')].some(e=>visible(e)&&/captcha|验证码/i.test(e.title+' '+e.src)))return {state:'manual'};
  const accounts=inputs.filter(e=>e.type==='email'||e.autocomplete==='username'||/^(电子邮件或电话号码|电子邮件|邮箱|Apple 账户|Apple ID|Email or phone number|Email address)$/i.test(name(e)));
  const passwords=inputs.filter(e=>e.type==='password');
  if(accounts.length!==1||passwords.length>1)return {state:'waiting'};
  if(inputs.some(e=>!accounts.includes(e)&&!passwords.includes(e)&&!['checkbox','hidden','submit','button'].includes(e.type)))return {state:'manual'};
  const field=accounts[0],existing=norm(field.value);
  if(existing&&existing.toLowerCase()!==account.toLowerCase())return {state:'account-mismatch'};
  const stage=passwords.length===1?'password':'account',input=stage==='password'?passwords[0]:field;
  if(!enabled(input)||input.readOnly)return {state:'waiting'};
  const buttons=[...document.querySelectorAll('button,input[type="submit"]')].filter(e=>visible(e)&&/^(登录|继续|Sign In|Continue)$/i.test(name(e)||e.value));
  if(buttons.length!==1)return {state:'waiting'};
  return {state:stage,input,button:buttons[0],field};
 }
 let s=scan();if(!command)return out(s.state);
 if(!command||!['account','password'].includes(command.stage)||command.stage!==s.state||typeof command.attempt!=='string'||command.attempt.length>100)return out('changed');
 const done=globalThis.__applebuyLoginAttempts??=new Set();
 if(done.has(command.attempt))return out('already-attempted');
 if(command.stage==='password'&&(typeof command.secret!=='string'||command.secret.length>1024||norm(s.field.value).toLowerCase()!==account.toLowerCase()))return out('changed');
 if(command.stage==='password'&&!command.secret&&!s.input.value)return out('password-needed');
 done.add(command.attempt); // Before input events or any click; an unknown result is never retried.
 const field=s.input,button=s.button,set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
 if(!set)return out('unsupported');
 if(command.stage==='account'||command.secret){set.call(field,command.stage==='password'?command.secret:account);field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));}
 s=scan();if(s.state!==command.stage||s.input!==field||s.button!==button||!enabled(button))return out('changed');
 button.click();return out('submitted');
}
export class AppleLogin {
 constructor({now=Date.now}={}){this.now=now;this.credentials=null;this.until=null;this.attempts=new Set();this.stopped=false;this.last={state:'disabled',step:'none'};}
 configure(value){
  if(value===null){this.clear();return {state:'disabled'};}
  if(!value||Object.keys(value).sort().join(',')!=='account,password'||typeof value.account!=='string'||!/^\S+@\S+\.\S+$/.test(value.account)||value.account.length>254||typeof value.password!=='string'||value.password.length>1024)throw Error('AppleLoginInputInvalid');
  if(this.credentials&&this.credentials.account!==value.account)throw Error('AppleLoginAccountChanged');
  this.credentials={...value};this.until??=this.now()+300000;return {state:'configured'};
 }
 clear(){this.credentials=null;}
 async attempt(api,tabId,live=()=>{}){this.step='permission';const result=await this.attemptOnce(api,tabId,live);this.last={state:result.state,step:this.step};return result;}
 async attemptOnce(api,tabId,live=()=>{}){
  if(!this.credentials||this.stopped)return {state:'disabled'};
  if(this.now()>=this.until){this.clear();return {state:'expired'};}
  const check=()=>{live();if(!this.credentials||this.stopped||this.now()>=this.until)throw Error('AppleLoginStopped');};
  try{
   check();if(!await api.permissions.contains({origins:[APPLE_AUTH_ORIGIN]}))return {state:'permission'};
   check();this.step='parent';const parent=await api.scripting.executeScript({target:{tabId,frameIds:[0]},world:'ISOLATED',func:loginParentDocument,args:[]});
   if(parent?.length!==1||parent[0].frameId!==0||!parent[0].documentId||parent[0].error||parent[0].result!==true)return {state:'unsupported'};
   check();this.step='frame';const frames=await api.scripting.executeScript({target:{tabId,allFrames:true},world:'ISOLATED',func:loginFrameIdentity,args:[]});
   const matches=frames?.filter(f=>f.result===true&&!f.error&&Number.isSafeInteger(f.frameId)&&f.frameId>0&&typeof f.documentId==='string');
   if(matches?.length!==1)return {state:'waiting'};
   const f=matches[0],target={tabId,documentIds:[f.documentId]},account=this.credentials.account;
   const read=async args=>{check();const rows=await api.scripting.executeScript({target,world:'ISOLATED',func:loginForm,args});if(rows?.length!==1||rows[0].documentId!==f.documentId||rows[0].frameId!==f.frameId||rows[0].error)throw Error('AppleLoginResultUnknown');return rows[0].result?.state;};
   this.step='observe';const stage=await read([account]);
   if(['manual','account-mismatch'].includes(stage)){this.clear();this.stopped=true;return {state:stage};}
   if(!['account','password'].includes(stage))return {state:'waiting'};
   const attempt=tabId+':'+stage;if(this.attempts.has(attempt))return {state:'waiting'};
   check();this.attempts.add(attempt);
   this.step='submit-'+stage;const state=await read([account,{stage,attempt,...(stage==='password'?{secret:this.credentials.password}:{})}]);
   if(state==='password-needed'){this.attempts.delete(attempt);return {state};}
   if(state!=='submitted'){this.stopped=true;this.clear();return {state:'unconfirmed'};}
   return {state:'submitted'};
  }catch{this.stopped=true;this.clear();return {state:'unconfirmed'};}
 }
}
