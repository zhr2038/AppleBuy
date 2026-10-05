// Explicit programme-run public configuration probe. Fresh anonymous application context; stops before Add, never a new buyer.
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {DesktopBrowserApi} from './browser-api.mjs';
import {runDesktopSession} from './browser-session.mjs';
const {chromium}=createRequire(import.meta.url)(join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
let browser,context,api;const records=new Map();let result;
try{
  browser=await chromium.launch({channel:'chrome',headless:false});
  context=await browser.newContext({serviceWorkers:'block'});
  api=new DesktopBrowserApi(context,{publicOnly:true});const tab=await api.create('https://www.apple.com.cn/shop/buy-iphone/iphone-18-pro');
  const store={async get(k){return records.has(k)?structuredClone(records.get(k)):null;},async put(k,v){records.set(k,structuredClone(v));}};
  result=await runDesktopSession({api,tabId:tab.id,store,onState:s=>console.log(JSON.stringify({type:'progress',scope:'public-before-add',...s}))});
}catch{result={state:'NEEDS_VERIFICATION',phase:'UNKNOWN',reason:'desktop-public-probe-unconfirmed',realOrderVerified:false};}
finally{if(context)await context.close();if(browser)await browser.close();}
console.log(JSON.stringify({type:'result',scope:'public-before-add',...result,lastPublicRead:api?.lastPublicRead,transportFailure:api?.lastFailure,choiceGeometry:api?.choiceGeometry,browserClosed:true,personalProfileUsed:false,addSent:false}));
