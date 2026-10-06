// Test-only owned process: no browser, website or personal ledger access.
import {DesktopTaskStore} from '../src/desktop/task-store.mjs';
const store=new DesktopTaskStore(process.argv[2]),lease=await store.acquireOwner();
process.stdout.write(JSON.stringify({owned:lease.owned})+'\n');
process.stdin.resume();
process.stdin.once('data',async()=>{await lease.release();process.stdin.destroy();});
