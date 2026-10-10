// Shared browser/desktop framing. This transfers the same journal, never a new purchase namespace.
import {canonicalJson,validStored} from './job.js';
export const R2_VERSION='applebuy-browser-job/C253-v1';
export const R2_MAX_BYTES=16_000_000,R2_CHUNK_BYTES=30000;
export const R2_OPERATIONS=new Set(['r2Version','r2Begin','r2Chunk','r2Run','r2Poll','r2Ack','r2Pause','r2Finish']);
const MUTABLE=new Set(['state','lastPhase','lastDocumentId','entryDocumentId','reason','pending','finalIntent','orderRefHash','orderDetailLink','initialDates','dateCursor','floors','rejected','refusals','lastRead','bagAddStarted','resourceWritten','untouchedFailures','untouchedStreak','bagTotalCny','quotedCny','acceptedSlot','inheritedIdentity','history','observationCurrent','permissionOrigin','reviewProgress','finalRejections']);
export async function digest(value){const bytes=typeof value==='string'?new TextEncoder().encode(value):value;return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function rowPatch(before,after){
 if(!validStored(before)||!validStored(after))throw Error('R2JournalInvalid');
 const old=before.finalRejections??[],next=after.finalRejections??[];
 if(next.length<old.length||next.length>old.length+1||canonicalJson(next.slice(0,old.length))!==canonicalJson(old))throw Error('R2RejectionHistoryChanged');
 if(next.length>old.length){const r=next.at(-1);if(canonicalJson(r.finalIntent)!==canonicalJson(before.finalIntent)||canonicalJson(r.pending)!==canonicalJson(before.pending)||after.finalIntent!==null||after.pending!==null||after.acceptedSlot!==null||after.dateCursor!==before.dateCursor+1||after.refusals!==before.refusals+1)throw Error('R2RejectionTransitionInvalid');}
 const set={},remove=[];
 for(const key of new Set([...Object.keys(before),...Object.keys(after)])){
  if(canonicalJson(before[key]??null)===canonicalJson(after[key]??null)&&Object.hasOwn(before,key)===Object.hasOwn(after,key))continue;
  if(!MUTABLE.has(key))throw Error('R2HistoricalIdentityChanged');
  if(Object.hasOwn(after,key))set[key]=after[key];else remove.push(key);
 }
 const patch={set,remove};if(new TextEncoder().encode(JSON.stringify(patch)).length>48000)throw Error('R2JournalPatchTooLarge');return patch;
}
export function applyRowPatch(before,patch){
 if(!patch||Object.keys(patch).sort().join(',')!=='remove,set'||!patch.set||typeof patch.set!=='object'||Array.isArray(patch.set)||!Array.isArray(patch.remove)||[...Object.keys(patch.set),...patch.remove].some(k=>typeof k!=='string'||!MUTABLE.has(k))||patch.remove.some(k=>Object.hasOwn(patch.set,k)))throw Error('R2JournalPatchInvalid');
 const next=patch.set.finalIntent,prior=before?.finalIntent;
 // Only the desktop's verified terminal-proof path may mint/change a not-dispatched marker.
 // A fresh final intent may drop the old marker; merely dropping proof adds no authority.
 if(next&&Object.hasOwn(next,'notDispatched')&&(!prior||!Object.hasOwn(prior,'notDispatched')||canonicalJson(next.notDispatched)!==canonicalJson(prior.notDispatched)))throw Error('R2FinalMarkerHostOnly');
 const after=structuredClone(before);for(const key of patch.remove)delete after[key];Object.assign(after,structuredClone(patch.set));rowPatch(before,after);return after;
}
