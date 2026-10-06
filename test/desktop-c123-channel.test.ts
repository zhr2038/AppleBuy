import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {PassThrough} from 'node:stream';
import {launchNativeCheckout} from '../src/desktop/native-checkout-channel.mjs';import {BAG} from '../web/checkout-connector/checkout-rpc-contract.js';
test('C123 prepared worker stdio channel correlates a reply and confirmed close with owned child end',async()=>{
 let frames=0,ended=0;const child=new EventEmitter() as any;child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin={on(){},write(text,cb){const q=JSON.parse(text);frames++;setImmediate(()=>child.stdout.write(JSON.stringify({schema:q.schema,kind:'reply',contextId:q.contextId,id:q.id,ok:true,result:q.operation==='closeSession'?{closed:true}:{id:7,url:BAG,status:'complete'}})+'\n'));cb?.();},end(){ended++;setImmediate(()=>child.emit('close',0));}};child.kill=()=>child.emit('close',1);
 const owned=launchNativeCheckout({spawnProcess:()=>child,contextId:'FAKE-C123-native-context'});assert.equal((await owned.api.create(BAG)).id,7);await owned.close();assert.equal(frames,2);assert.equal(ended,1);
});
