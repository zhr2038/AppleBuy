// Desktop-only runnable C-010 candidate. Normal Chrome, loopback DOM fixture, no merchant access.
import { resolve } from 'node:path';
import { installNetworkGuard } from './netguard.ts';
import { startDomDemo } from './app/dom-bridge.ts';
const args=process.argv.slice(2);const at=args.indexOf('--task-dir');
const taskDir=resolve(at>=0?args[at+1]:'.local/dom-desktop');
const pa=args.indexOf('--port');const port=pa>=0?Number(args[pa+1]):0;
if(!Number.isInteger(port)||port<0||port>65535)throw new Error('InvalidPort');
const guard=installNetworkGuard();
const demo=await startDomDemo(taskDir,{port});
console.log('FAKE｜真实 DOM 自动执行候选｜不访问苹果、不创建真实订单、不付款');
console.log(`DOM-READY ${JSON.stringify({url:demo.url,pid:process.pid,taskDir})}`);
await new Promise<void>(r=>{process.once('SIGINT',r);process.once('SIGTERM',r);});
await demo.close();guard.uninstall();
if(guard.attempts.length)process.exitCode=1;
