// The actual extension is uninstalled: these checks cover its bounded source and collector, not Chrome permission.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectPublicEntry} from '../web/chrome-connector/read-entry.js';

test('Chrome public connector requests temporary user-activated access only; no persistent merchant or private-data grants',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../web/chrome-connector/manifest.json',import.meta.url),'utf8'));
  assert.equal(manifest.manifest_version,3);assert.deepEqual(manifest.permissions,['activeTab','scripting']);
  for(const key of ['host_permissions','optional_host_permissions','content_scripts','externally_connectable','background'])assert.equal(key in manifest,false);
  assert.match(manifest.content_security_policy.extension_pages,/connect-src 'none'/);
});

test('Chrome collector refuses account, checkout, another merchant and deceptive host BEFORE DOM access',()=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'location');
  try{
    for(const url of ['https://secure6.www.apple.com.cn/shop/checkout','https://www.apple.com.cn/shop/order/list','https://www.apple.com.cn.example.org/shop/buy-iphone/iphone-duo','http://www.apple.com.cn/shop/buy-iphone/iphone-duo','https://example.org/']){
      Object.defineProperty(globalThis,'location',{configurable:true,value:{href:url}});
      assert.equal(inspectPublicEntry().state,'blocked');assert.equal(inspectPublicEntry().canPurchase,false);
    }
  }finally{if(original)Object.defineProperty(globalThis,'location',original);else delete (globalThis as any).location;}
});

test('Chrome collector serializes without closure dependencies and contains no mutation or private input API',()=>{
  const source=inspectPublicEntry.toString();const fn=(0,eval)(`(${source})`);assert.equal(typeof fn,'function');
  for(const forbidden of [/\.value\b/,/\.cookie\b/,/localStorage/,/sessionStorage/,/\.click\s*\(/,/dispatchEvent/,/fetch\s*\(/,/XMLHttpRequest/,/MutationObserver/])assert.equal(forbidden.test(source),false);
});
