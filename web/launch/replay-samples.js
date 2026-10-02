// Explicitly synthetic fixtures, derived from an authorized FAKE plan. This is not an Apple adapter.
import { samples, timeRanges } from './samples.js';
const escape = s => String(s).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
export const REPLAY_IDS=['prelaunch','maintenance','partial','entry','entry-reordered','pickup-native','pickup-input-radios','pickup-reordered','pickup-redrawn','terminal-removed','fourth-date','year-missing','unselected-pickup','wrong-product','sign-in','consent','unknown','rate-limit','restricted','service-unavailable','network-failed'];
export function replaySample(id,plan) {
  if(!REPLAY_IDS.includes(id)||plan.fake!==true) throw new Error('InvalidReplaySample');
  const p=plan.products[0],expect={products:plan.products,stores:plan.stores.map(s=>s.label)};
  const htmlDoc=body=>`<!doctype html><html lang="zh-CN"><body><p>合成样本 SYNTHETIC — 不访问 Apple</p>${body}</body></html>`;
  const line=`${escape(p.model)} ${escape(p.capacity)} ${escape(p.color)}`;
  // SYNTHETIC wording: a labelled tax-inclusive total (the observer never accepts an unlabelled price).
  const prices=`<p>总计（含税） RMB ${plan.maxTotalCny}</p><p>数量: 1</p>`;
  const entry=layout=>htmlDoc(layout?`<div role="button" aria-label="继续">继续 ›</div>${prices}<p>${line}</p><h1>${escape(p.model)}</h1>`:`<h1>${escape(p.model)}</h1><p>${line}</p>${prices}<button>继续</button>`);
  const dates=plan.dates.map(d=>({label:d,enabled:true}));
  // Changing cadence/ordering is a fixture parameter, never an asserted official slot duration.
  const w=plan.windows.at(-1),times=timeRanges(w.start,w.end,15);
  const pickup=(o={})=>samples.pickup({dates,times,product:escape(p.model),capacity:escape(p.capacity),color:escape(p.color),price:plan.maxTotalCny,store:escape(plan.stores[0].label),...o});
  let html,transport=null;
  switch(id) {
    case 'prelaunch':html=htmlDoc(`<h1>${escape(p.model)}</h1><p>${line}</p>${prices}<p>暂未发售</p><button disabled>继续</button>`);break;
    case 'maintenance':html=samples.maintenance();break;
    case 'partial':html=samples.partial();break;
    case 'entry':html=entry(false);break;
    case 'entry-reordered':html=entry(true);break;
    case 'pickup-native':html=pickup();break;
    case 'pickup-input-radios':html=pickup({layout:'input-radios'});break;
    case 'pickup-reordered':html=pickup({layout:'radios',times:[...times].reverse(),dates:[...dates].reverse(),selected:dates.length-1});break;
    case 'pickup-redrawn':html=pickup({times:timeRanges(w.start,w.end,20)});break;
    case 'terminal-removed':html=pickup({times:times.slice(0,-1)});break;
    case 'fourth-date': {
      // This negative fixture must contain a fourth offered date even when the plan permits fewer.
      const offered=[...dates].sort((a,b)=>a.label.localeCompare(b.label));
      while(offered.length<4) {
        const later=new Date(`${offered.at(-1).label}T00:00:00Z`);later.setUTCDate(later.getUTCDate()+1);
        const label=later.toISOString().slice(0,10);
        if(!/^\d{4}-\d{2}-\d{2}$/.test(label))throw new Error('InvalidSyntheticFourthDate');
        offered.push({label,enabled:true});
      }
      html=pickup({dates:offered,selected:3});break;
    }
    case 'year-missing':html=pickup({dates:dates.map(d=>({...d,label:`${Number(d.label.slice(5,7))}月${Number(d.label.slice(8))}日`}))});break;
    case 'unselected-pickup':html=pickup({pickup:false});break;
    case 'wrong-product':html=htmlDoc('<h1>iPhone UNAUTHORIZED</h1><button>继续</button>');break;
    case 'sign-in':html=samples.signIn();break;
    case 'consent':html=samples.consent();break;
    case 'unknown':html=samples.unknown();break;
    case 'rate-limit':transport={status:429};html=htmlDoc('<p>合成限流场景</p>');break;
    case 'restricted':transport={status:403};html=htmlDoc('<p>合成访问限制</p>');break;
    case 'service-unavailable':transport={status:503};html=htmlDoc('<p>合成服务不可用</p>');break;
    case 'network-failed':transport={error:'timeout'};html=htmlDoc('<p>合成网络超时</p>');break;
  }
  return {id,html,expect,transport,syntheticComplete:['pickup-native','pickup-input-radios','pickup-reordered','pickup-redrawn','terminal-removed','fourth-date','year-missing','unselected-pickup'].includes(id)};
}
