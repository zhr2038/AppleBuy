// Explicit local-only ownership handoff. Unknown actions and the exact prior snapshot remain; no merchant or auth access.
import {TASK_KEY,validStored,canonicalJson,normalizeIntent} from './job.js';
export async function exportDesktopHandoff({store,confirmed,live=()=>true,now=()=>Date.now(),id=()=>crypto.randomUUID()}){
  if(confirmed!==true||!live())throw Error('DesktopHandoffNotConfirmed');
  const old=await store.get(TASK_KEY);if(!live())throw Error('DesktopHandoffPaused');
  if(!validStored(old)||normalizeIntent(old.plan).product.model!=='iPhone 18 Pro')throw Error('DesktopHandoffTaskUnconfirmed');
  if(old.desktopHandoff?.schema==='applebuy-desktop-handoff/v1'){if(old.reconcileOnly!==true||!validStored(old.desktopHandoff.originalSnapshot))throw Error('DesktopHandoffOwnershipUnconfirmed');return {schema:'applebuy-desktop-handoff/v1',sourceOwnerRevoked:true,record:structuredClone(old)};}
  const current=await store.get(TASK_KEY);if(!live()||canonicalJson(current)!==canonicalJson(old))throw Error('DesktopHandoffRecordChanged');
  const record={...structuredClone(old),reconcileOnly:true,desktopHandoff:{schema:'applebuy-desktop-handoff/v1',id:id(),exportedAt:now(),originalSnapshot:structuredClone(old)}};
  await store.put(TASK_KEY,record);
  return {schema:'applebuy-desktop-handoff/v1',sourceOwnerRevoked:true,record:structuredClone(record)};
}
