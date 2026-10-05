import {readFile} from 'node:fs/promises';import {resolve} from 'node:path';
import {DesktopTaskStore} from './task-store.mjs';
const file=process.argv[2];if(!file)throw Error('HandoffFileRequired');
try{const raw=await readFile(resolve(file),'utf8');if(raw.length>2_000_000)throw Error('HandoffTooLarge');const store=new DesktopTaskStore(resolve('.local/desktop/task.json'));const result=await store.importHandoff(JSON.parse(raw));console.log(JSON.stringify({imported:result.imported,pendingAction:result.pendingAction,readOnly:true,unknownPreserved:true}));}
catch{console.log(JSON.stringify({imported:false,reason:'desktop-handoff-unconfirmed; old record unchanged'}));process.exitCode=1;}
