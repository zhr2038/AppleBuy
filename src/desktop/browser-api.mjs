// Application-owned browser transport. Never attaches to personal Chrome or reads profiles/cookies/storage/auth traffic.
import {merchantDocument} from '../../web/checkout-connector/page-program.js';
import {allowedMerchantUrl} from '../../web/checkout-connector/chrome-port.js';
import {randomUUID} from 'node:crypto';
import {canonicalJson} from '../../web/checkout-connector/job.js';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';

export class DesktopBrowserApi {
  constructor(context,{publicOnly=true}={}){this.context=context;this.publicOnly=publicOnly;this.sessionId=randomUUID();this.pages=new Map();this.documents=new Map();this.executed=new Set();this.nextId=1;this.nextDocument=1;}
  allowed(url){if(!allowedMerchantUrl(url))return false;const u=new URL(url);return !this.publicOnly||u.origin==='https://www.apple.com.cn'&&/^\/shop\/buy-iphone\/iphone-18-pro(?:\/[^/]+\/a)?\/?$/.test(u.pathname);}
  requireUrl(url){if(!this.allowed(url))throw Error('DesktopAddressNotAuthorized');}
  async create(url){this.requireUrl(url);const page=await this.context.newPage(),id=this.nextId++;this.pages.set(id,page);this.documents.set(id,'desktop-document-'+this.nextDocument++);
    // A SPA canonical-address update keeps the same document. Only a real main-document load changes delivery identity.
    page.on('domcontentloaded',()=>this.documents.set(id,'desktop-document-'+this.nextDocument++));
    await page.goto(url,{waitUntil:'load',timeout:20000});await page.waitForSelector('main,[role="main"]',{timeout:10000});return {id,url:page.url(),status:'complete'};
  }
  get tabs(){return {
    create:async({url})=>this.create(url),
    get:async id=>{const p=this.page(id);this.requireUrl(p.url());return {id,url:p.url(),status:'complete'};},
    update:async(id,{url})=>{this.requireUrl(url);const p=this.page(id);await p.goto(url,{waitUntil:'domcontentloaded',timeout:20000});return {id,url:p.url(),status:'complete'};},
    query:async()=>[...this.pages].filter(([,p])=>!p.isClosed()).map(([id,p])=>({id,url:p.url()})),
    remove:async id=>{const p=this.page(id);await p.close();this.pages.delete(id);this.documents.delete(id);}
  };}
  page(id){const p=this.pages.get(id);if(!p||p.isClosed())throw Error('OwnedBrowserPageMissing');return p;}
  get permissions(){return {contains:async({origins})=>Array.isArray(origins)&&origins.every(o=>this.allowed(o.replace(/\/\*$/,'')+(o.startsWith('https://www.apple.com.cn')?'/shop/buy-iphone/iphone-18-pro':'/shop/checkout')))};}
  get scripting(){return {executeScript:async request=>{
    const id=request.target?.tabId,page=this.page(id),documentId=this.documents.get(id);this.requireUrl(page.url());
    if(request.func!==merchantDocument||request.world!=='ISOLATED'||request.target.frameIds&&request.target.frameIds.join(',')!=='0')throw Error('DesktopProgramNotAuthorized');
    if(request.target.documentIds&&!request.target.documentIds.includes(documentId))throw Error('DesktopDocumentChanged');
    const [plan,command]=request.args??[];
    if(this.publicOnly&&command&&!['configureProduct','continueProduct'].includes(command.action))throw Error('DesktopPublicProbeCannotPurchase');
    // Own browser context only. Inputs are the already-reviewed parser/command; no arbitrary code or private browser API is exposed.
    // Construct the fixed call wrapper in Node, not via eval inside the page; never weaken the site's CSP.
    const invoke=new Function('return async function ({args}) { return ('+merchantDocument.toString()+')(...args); }')();
    if(command?.action==='configureProduct'){
      const key=documentId+':'+command.id;if(this.executed.has(key))return [{frameId:0,documentId,result:{delivered:false,touched:true,reason:'OperationAlreadyDelivered'}}];
      const current=await page.evaluate(invoke,{source:merchantDocument.toString(),args:[plan]});
      let same=false;try{same=canonicalJson(current)===canonicalJson(JSON.parse(command.expected));}catch{}
      const choices=[plan.product.model,plan.product.color,plan.product.capacity,'不折抵换购','不加 AppleCare+ 服务计划'];
      if(!same||command.authorized!==true||!command.id||!command.taskId||!choices.includes(command.choice)||current.nextChoice?.choice!==command.choice||current.nextChoice.state!=='enabled')return [{frameId:0,documentId,result:{delivered:false,touched:false,reason:'CurrentChoiceUnconfirmed'}}];
      const esc=t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const name=command.choice===plan.product.model?new RegExp('^'+esc(command.choice)+'(?:\\s+(?!Max\\b)|$)'):command.choice===plan.product.capacity?new RegExp('^'+esc(command.choice)+'(?:\\s|$)'):command.choice;
      const locator=page.getByRole('main').getByRole('radio',{name,exact:typeof name==='string'});
      if(await locator.count()!==1||!await locator.isEnabled())return [{frameId:0,documentId,result:{delivered:false,touched:false,reason:'CurrentChoiceUnconfirmed'}}];
      // Apple's visible choice card is the associated label; the hidden input is covered by that label.
      // Click the normal visible control, never force through an overlay or change disabled state.
      const radioId=await locator.getAttribute('id');
      const labels=radioId?page.getByRole('main').locator('label[for='+JSON.stringify(radioId)+']'):null;
      let clickTarget=locator;
      if(labels&&await labels.count()===1){
        await labels.evaluate(e=>e.scrollIntoView({block:'center',inline:'nearest'}));
        const receiver=await locator.evaluate(e=>{const label=e.labels?.length===1?e.labels[0]:null;if(!label)return 'unknown';const box=label.getBoundingClientRect(),hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);return hit===e?'radio':label.contains(hit)?'label':'blocked';});
        if(!['radio','label'].includes(receiver))return [{frameId:0,documentId,result:{delivered:false,touched:false,reason:'ChoicePointerBlocked'}}];
        clickTarget=receiver==='label'?labels:locator;
      }
      if(this.publicOnly)this.choiceGeometry=await locator.evaluate(e=>({tag:e.tagName,id:e.id,labels:[...(e.labels??[])].map(l=>({tag:l.tagName,for:l.htmlFor,classes:l.className})),parent:{tag:e.parentElement?.tagName,classes:e.parentElement?.className,role:e.parentElement?.getAttribute('role')},ancestor:{tag:e.parentElement?.parentElement?.tagName,classes:e.parentElement?.parentElement?.className,role:e.parentElement?.parentElement?.getAttribute('role')}}));
      this.executed.add(key);try{await clickTarget.evaluate(e=>e.scrollIntoView({block:'center',inline:'nearest'}));await clickTarget.click({timeout:3000});}catch(error){
        this.lastFailure={where:'native-choice-input',kind:/intercepts pointer/.test(error?.message??'')?'pointer-intercepted':/Timeout/.test(error?.message??'')?'choice-timeout':'choice-input-unknown'};
        if(this.publicOnly){const m=(error?.message??'').match(/<([a-z0-9-]+)([^>]*)>[^\n]*intercepts pointer/i);if(m)this.lastFailure.blockingElement={tag:m[1],classes:/class="([^"]*)"/.exec(m[2])?.[1]??null};}
        if(this.publicOnly){const folder=resolve('.local/desktop-probe');await mkdir(folder,{recursive:true});await page.screenshot({path:resolve(folder,'public-choice-block.png')});}
        throw error;
      }return [{frameId:0,documentId,result:{delivered:true}}];
    }
    let result;try{result=await page.evaluate(invoke,{source:merchantDocument.toString(),args:request.args});}catch(error){
      this.lastFailure={where:'program-evaluation',kind:/Execution context was destroyed|Cannot find context/.test(error?.message??'')?'document-navigation':/unsafe-eval|Content Security/.test(error?.message??'')?'csp':'program-error'};throw error;
    }
    if(this.publicOnly&&!command)this.lastPublicRead={phase:result?.phase,nextChoice:result?.nextChoice,configured:result?.configuration?.complete,quotedCny:result?.quotedCny,path:result?.path};
    if(this.documents.get(id)!==documentId&&!command)throw Error('DesktopDocumentChanged');
    return [{frameId:0,documentId,result}];
  }};}
}
