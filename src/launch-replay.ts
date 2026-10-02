import { TaskApp } from './app/task-app.ts';
import { LaunchSession } from './app/launch-session.ts';
import { installNetworkGuard } from './netguard.ts';
import type { Plan } from './plan.ts';
import { parseHtml,observePage,classifyTransport } from '../web/launch/observer.js';

/** Offline supported CLI. AST results are labelled separately from Codex's actual local DOM browser checks. */
export async function runLaunchReplay(plan:Plan,taskDir:string) {
  const guard=installNetworkGuard();let app:TaskApp|null=null;
  try {
    const opened=await TaskApp.open({taskDir,initialPlan:plan,latencyMs:0});
    if(!opened.ok)throw new Error('LaunchOwnerUnavailable');app=opened.app;
    const session=new LaunchSession(app),before=session.view();
    if(before.blocked||before.state?.pending)throw new Error('LaunchNeedsManualReconciliation');
    const order=['prelaunch','maintenance','partial','entry','entry-reordered','pickup-native','pickup-input-radios','pickup-reordered','terminal-removed','fourth-date','year-missing','unselected-pickup','wrong-product','sign-in','consent','unknown','rate-limit','restricted','service-unavailable','network-failed'];
    const expected=['PRELAUNCH','MAINTENANCE','RENDERING_INCOMPLETE','ENTRY_AVAILABLE','ENTRY_AVAILABLE','SLOT_SELECTION','SLOT_SELECTION','SLOT_SELECTION','SLOT_SELECTION','SLOT_SELECTION','SLOT_SELECTION','SLOT_SELECTION','PLAN_MISMATCH','SIGN_IN_REQUIRED','CONSENT_REQUIRED','UNKNOWN_STRUCTURE','RATE_LIMITED','ACCESS_RESTRICTED','SERVICE_UNAVAILABLE','TRANSPORT_FAILED'];
    const results=[];let tick=Date.now();
    for(const [i,id] of order.entries()) {
      const sample=session.sample(id),observedAt=new Date(++tick).toISOString();
      let obs=observePage(parseHtml(sample.html),{observedAt,expect:sample.expect});
      if(sample.transport)obs={...obs,...classifyTransport(sample.transport)};
      if(sample.syntheticComplete)obs.listCompleteness='synthetic-complete';
      const saved=session.observe(obs,'synthetic-sample'),view=session.view();
      results.push({id,stage:view.state?.stage,next:view.next.kind,candidates:view.next.kind==='candidates'?view.next.offers.length:0,passed:saved.ok&&view.state?.stage===expected[i]});
    }
    session.fixturePending();const unknown=session.view();
    return {schema:'applebuy-launch-replay-report/v1',scope:'SYNTHETIC offline AST replay, not browser/Apple acceptance',results,unknownPreserved:unknown.next.kind==='reconcile',binding:unknown.state?.binding,realRequests:guard.attempts.length,realActions:0,passed:results.every(r=>r.passed)&&unknown.next.kind==='reconcile'&&guard.attempts.length===0};
  } finally {if(app)await app.close();guard.uninstall();}
}
