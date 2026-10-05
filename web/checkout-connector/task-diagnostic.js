// C055 Codex genuine-quota takeover: persisted-task inspection only, never current merchant proof.
// Construct a bounded public view. Never stringify a stored record, private contact, ID, hash, URL or history event.
import {calendarDay} from './job.js';
const STATES=new Set(['RUNNING','PAUSED','STOPPED','EXPIRED','RETIRED','CONFIRMED_UNPAID','BLOCKED','NEEDS_USER','NEEDS_VERIFICATION','EXHAUSTED','NOT_READY','NOT_RELEASED']);
const PHASES=new Set(['ENTRY','VARIANT','PRELAUNCH','EMPTY_BAG','BAG','ACCESSORIES','AUTH','CONSENT','CHALLENGE','THROTTLE','FULFILLMENT','SLOTS','DETAILS','DETAILS_UNSUPPORTED','PAYMENT','REVIEW','ORDER_RECEIPT','ORDER_DETAIL','PROCESSING','UNKNOWN']);
const ACTIONS=new Set(['configureProduct','continueProduct','addBag','viewBag','checkout','selectPickup','selectStore','selectDate','chooseSlot','fillDetails','selectPayment','continuePayment','submitOrder','openProduct','openBag']);
const TIME=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const bool=x=>typeof x==='boolean'?x:null;
const date=x=>typeof x==='string'&&x.length<=50&&calendarDay(x)?x:null;
const time=x=>typeof x==='string'&&TIME.test(x)?x:null;
const expired=(x,now)=>Number.isFinite(x)&&Number.isFinite(now)?x<=now:null;
const slot=x=>x&&typeof x==='object'?{date:date(x.date),start:time(x.start),end:time(x.end),verified:bool(x.verified)}:null;
export function taskDiagnostic(s,now){
  if(!s)return {record:'NONE',scope:'persisted-task-only',merchantQueried:false,purchaseAction:false};
  if(typeof s!=='object'||s.schema!=='applebuy-purchase-job/v1')return {record:'UNRECOGNIZED',scope:'persisted-task-only',merchantQueried:false,purchaseAction:false};
  const p=s.plan??{},product=p.product??{},model=['iPhone 18 Pro','iPhone Duo'].includes(product.model)?product.model:null;
  const max=model==='iPhone 18 Pro'?9999:model==='iPhone Duo'?15999:null;
  const basis=s.bagTotalCny??s.quotedCny,pending=s.pending&&typeof s.pending==='object'?s.pending:null;
  const dates=Array.isArray(s.initialDates)?s.initialDates.slice(0,3).map(date):null;
  const floorKeys=s.floors&&typeof s.floors==='object'?Object.keys(s.floors):[];
  const floors=floorKeys.slice(0,12).flatMap(k=>{const d=date(k),v=time(s.floors[k]);return d&&v?[[d,v]]:[];});
  const history=Array.isArray(s.retiredHistory)?s.retiredHistory:[];
  return {record:'PRESENT',scope:'persisted-task-only',merchantQueried:false,purchaseAction:false,
    state:STATES.has(s.state)?s.state:'UNRECOGNIZED',lastReadPhase:PHASES.has(s.lastPhase)?s.lastPhase:'UNRECOGNIZED',
    model,capacity:product.capacity==='256GB'?'256GB':null,color:['黑色','星光白色'].includes(product.color)?product.color:null,
    fixedQuantityOne:p.quantity===1,fixedPriceCapMatches:max!==null&&p.maxTotalCny===max,
    fixedStoreMatches:Array.isArray(p.stores)&&p.stores.length===1&&p.stores[0]==='Apple 大连恒隆广场',pickupOnly:p.fulfillment==='pickup',
    tabId:Number.isSafeInteger(s.tabId)&&s.tabId>0?s.tabId:null,windowExpired:expired(s.expiresAt,now),
    initialDates:dates,initialDatesOverflow:Array.isArray(s.initialDates)&&s.initialDates.length>3,
    dateCursor:Number.isSafeInteger(s.dateCursor)&&s.dateCursor>=0&&s.dateCursor<=3?s.dateCursor:null,
    floors:Object.fromEntries(floors),floorEntriesNotShown:floorKeys.length-floors.length,
    pending:pending?{action:ACTIONS.has(pending.action)?pending.action:'UNRECOGNIZED',beforePhase:PHASES.has(pending.beforePhase)?pending.beforePhase:'UNRECOGNIZED',delivery:pending.dispatched===false?'POSITIVELY_NOT_SENT':'SENT_OR_UNKNOWN',deadlineExpired:expired(pending.deadline,now),slot:pending.action==='chooseSlot'?slot(pending):null}:null,
    acceptedSlot:slot(s.acceptedSlot),finalIntentPresent:s.finalIntent!==null&&s.finalIntent!==undefined,finalSent:bool(s.finalIntent?.sent),
    bagAddStarted:bool(s.bagAddStarted),resourceWritten:bool(s.resourceWritten),reconcileOnly:bool(s.reconcileOnly),
    moneyBasisPresent:Number.isFinite(basis)&&basis>0,moneyBasisMatchesFixedProduct:max!==null&&basis===max,
    refusals:Number.isSafeInteger(s.refusals)&&s.refusals>=0&&s.refusals<=5?s.refusals:null,
    retiredHistoryCount:history.length,retiredHistoryOverflow:history.length>50,
    priorSlotOrFinalPresent:history.slice(0,50).some(r=>!!r&&(r.acceptedSlot!==null&&r.acceptedSlot!==undefined||r.finalIntent!==null&&r.finalIntent!==undefined||['chooseSlot','submitOrder'].includes(r.pending?.action))),
    retainedCartPresent:s.retiredCart!==null&&s.retiredCart!==undefined};
}
