import test from 'node:test';import assert from 'node:assert/strict';
import {startServer} from '../src/app/server.ts';import {TaskApp} from '../src/app/task-app.ts';import {FAST_PLAN} from './app-helpers.ts';import {tempDir} from './helpers.ts';
test('C129 loopback app refuses an explicit Fetch-forbidden port instead of exposing unusable recovery control',async()=>{
 const {dir,cleanup}=tempDir('c129-port');let app,server;
 try{const opened=await TaskApp.open({taskDir:dir,initialPlan:FAST_PLAN});assert.equal(opened.ok,true);app=opened.app;
  await assert.rejects(async()=>{server=await startServer(app,{port:6000});},/BrowserPortBlocked/);
  server=await startServer(app);assert.equal((await fetch(server.url)).status,200);
 }finally{if(server)await server.close();if(app)await app.close();cleanup();}
});
