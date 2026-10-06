// C111: local FAKE demo must choose a browser-allowed port, without disabling Fetch protections.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {startDomDemo} from '../src/app/dom-bridge.ts';
import {tempDir} from './helpers.ts';

test('FAKE demo refuses an explicitly browser-blocked port and releases its task owner',async()=>{
  const {dir,cleanup}=tempDir('c111-demo-port');let demo,forbidden;
  try{
    await assert.rejects(async()=>{forbidden=await startDomDemo(dir,{port:6000});},/DomBrowserPortBlocked/);
    demo=await startDomDemo(dir);
    assert.equal((await fetch(demo.url)).status,200);
    assert.equal(demo.snapshot().scope,'fake-dom-only');
  }finally{if(forbidden)await forbidden.close();if(demo)await demo.close();cleanup();}
});

test('FAKE demo closes an OS-assigned forbidden listener and reallocates before exposing a URL',async()=>{
  const {dir,cleanup}=tempDir('c111-demo-assigned-port');let demo;
  const original=http.createServer;let assignments=0,closed=0;
  try{
    http.createServer=function(...args){const server=Reflect.apply(original,http,args),address=server.address.bind(server),close=server.close.bind(server);
      server.address=()=>{const actual=address();return actual&&typeof actual==='object'&&assignments++===0?{...actual,port:6000}:actual;};
      server.close=function(...args){closed++;return Reflect.apply(close,server,args);};return server;} as typeof original;
    demo=await startDomDemo(dir);
    assert.equal(closed,1);
    assert.equal((await fetch(demo.url)).status,200);
    assert.equal(demo.snapshot().ledger.length,0);
  }finally{http.createServer=original;if(demo)await demo.close();cleanup();}
});

test('FAKE demo bounds repeated forbidden assignments and releases its owner on exhaustion',async()=>{
  const {dir,cleanup}=tempDir('c111-demo-port-exhausted');let demo;
  const original=http.createServer;let closed=0;
  try{
    http.createServer=function(...args){const server=Reflect.apply(original,http,args),address=server.address.bind(server),close=server.close.bind(server);
      server.address=()=>{const actual=address();return actual&&typeof actual==='object'?{...actual,port:6000}:actual;};
      server.close=function(...args){closed++;return Reflect.apply(close,server,args);};return server;} as typeof original;
    await assert.rejects(startDomDemo(dir),/DomBrowserPortUnavailable/);
    assert.equal(closed,8);http.createServer=original;
    demo=await startDomDemo(dir);assert.equal((await fetch(demo.url)).status,200);
  }finally{http.createServer=original;if(demo)await demo.close();cleanup();}
});
