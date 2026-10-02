// C-010 browser motor. Actual DOM actions; deliberately refuses every external or real merchant document.
// A future real adapter requires separate permissions and current verified contracts. Nothing here enables it.
export function assertFakeTarget(doc,url){
  const u=new URL(url);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.pathname!=='/'||doc.querySelector('#merchant')?.dataset.fakeSchema!=='applebuy-merchant-fixture/v1')throw new Error('RealDomActionBlocked');
}
export function validateConditions(actual,plan){
  const p=plan.products[0];return plan.fake===true&&actual.productId===p.id&&actual.model===p.model&&actual.capacity===p.capacity&&actual.color===p.color&&actual.quantity===1&&Number.isFinite(actual.totalCny)&&actual.totalCny<=plan.maxTotalCny&&actual.totalCny>0&&actual.fulfillment==='pickup'&&plan.stores.some(s=>s.label===actual.store);
}
const visible=e=>!!e?.isConnected&&!e.closest('[inert]')&&e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true});
export class DomMotor{
  constructor(doc,url,identity){this.doc=doc;this.url=url;this.identity=identity;this.processed=new Set();this.observationSeq=0;}
  context(){const e=this.doc.querySelector('#condition');if(!visible(e))throw new Error('ConditionsNotVisible');return {productId:e.dataset.productId,model:e.dataset.model,capacity:e.dataset.capacity,color:e.dataset.color,quantity:Number(e.dataset.quantity),totalCny:Number(e.dataset.total),store:e.dataset.store,fulfillment:e.dataset.fulfillment};}
  check(command){assertFakeTarget(this.doc,this.url);const i=this.identity;if(command.scope!=='fake-dom-only'||command.client!==i.client||command.document!==i.document||command.taskId!==i.taskId||!command.id||!command.runId||!command.planHash)throw new Error('DomIdentityMismatch');if(!i.runId||i.runId!==command.runId)throw new Error('DomRunMismatch');if(!i.planHash||i.planHash!==command.planHash)throw new Error('DomPlanMismatch');if(!validateConditions(this.context(),command.expect))throw new Error('DomConditionsMismatch');}
  click(id){const e=this.doc.getElementById(id);if(!visible(e)||e.disabled||e.tagName!=='BUTTON')throw new Error('DomButtonUnavailable');e.click();}
  accepted(){const e=this.doc.getElementById('accepted');if(!visible(e))return null;return {store:e.dataset.store,date:e.dataset.date,start:e.dataset.start,end:e.dataset.end};}
  page(){
    const m=this.doc.getElementById('merchant'),step=m.dataset.step,context=this.context();
    // Every completed read is fresh evidence even when the document revision has not changed.
    // DOM revision remains in the native option ref; do not confuse it with observation ordering.
    const raw={contract:'mock-v0',kind:'page',seq:++this.observationSeq,context:{productId:context.productId,quantity:context.quantity,totalCny:context.totalCny,fulfillment:context.fulfillment}};
    if(step==='review')return {...raw,step:'pre-payment',acceptedSlot:this.accepted()};
    if(['accepted','details','payment'].includes(step))return {...raw,step:'checkout-review',acceptedSlot:this.accepted()};
    if(['unpaid','unknown','orders'].includes(step))return {...raw,step:'processing'};
    if(step!=='slots')return {contract:'mock-v0',kind:'error',error:'status'};
    const slots=[];for(const select of m.querySelectorAll('select[data-date]'))if(visible(select))for(const option of select.options){if(!option.value)continue;slots.push({store:context.store,date:select.dataset.date,start:option.dataset.start,end:option.dataset.end,ref:option.value,selectable:!select.disabled&&!option.disabled});}
    return {...raw,step:'slot-selection',slots};
  }
  async execute(c){
    this.check(c);if(this.processed.has(c.id))throw new Error('DomCommandAlreadyUsed');this.processed.add(c.id); // consume before the DOM event
    const result=(r,extra={})=>({body:{contract:'mock-v0',kind:'result',opId:c.opId,result:r,...extra},simulatedMs:0});
    if(c.method==='prepare'){
      for(let n=0;n<4;n++){this.check(c);const step=this.doc.getElementById('merchant').dataset.step;if(step==='slots')return {body:{prepared:true},simulatedMs:0};
        if(step==='product')this.click('add-bag');else if(step==='bag')this.click('checkout');else if(step==='fulfillment'){const r=this.doc.getElementById('pickup');if(!visible(r)||r.type!=='radio')throw new Error('PickupUnavailable');r.checked=true;r.dispatchEvent(new Event('change',{bubbles:true}));this.click('pickup-next');}else throw new Error('PreparationStageUnknown');}
      throw new Error('PreparationBound');
    }
    if(c.method==='observe')return {body:this.page(),simulatedMs:0};
    if(c.method==='chooseSlot'){
      const m=this.doc.getElementById('merchant');if(m.dataset.step!=='slots')throw new Error('SlotStageChanged');
      const matches=[...m.querySelectorAll('select[data-date]')].flatMap(select=>[...select.options].filter(o=>o.value===c.ref).map(option=>({select,option})));
      if(matches.length!==1)throw new Error('DomRefStale');const{select,option}=matches[0];if(!visible(select)||select.disabled||option.disabled)throw new Error('DomRefUnavailable');
      select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));this.check(c);
      // Re-render after a change invalidates the element: cancel before continuing, never act on detached refs.
      if(!visible(select)||select.selectedOptions[0]!==option)throw new Error('DomRefChanged');
      const b=select.parentElement.querySelector('button[data-date]');if(!visible(b)||b.dataset.date!==select.dataset.date)throw new Error('DomContinueUnavailable');b.click();
      const feedback=this.doc.getElementById('feedback');if(!visible(feedback))return result('unknown');
      if(feedback.dataset.result==='rejected')return result('rejected',{code:'fake-slot-full',slotRefused:true,freshList:this.page()});
      if(feedback.dataset.result==='accepted'&&this.accepted())return result('accepted',{evidence:'FAKE-visible-DOM-acceptance'});return result('unknown');
    }
    if(c.method==='advance'){
      for(let n=0;n<5;n++){this.check(c);const step=this.doc.getElementById('merchant').dataset.step;if(step==='review')return result('accepted',{evidence:'FAKE-visible-review'});
        if(step==='accepted')this.click('details');else if(step==='details'){const input=this.doc.getElementById('fake-suffix');if(!visible(input))throw new Error('FakeDetailsUnknown');input.value='0000';input.dispatchEvent(new Event('input',{bubbles:true}));this.click('details-next');}
        else if(step==='payment'){const p=this.doc.getElementById('alipay');if(!visible(p))throw new Error('FakePaymentUnknown');p.checked=true;p.dispatchEvent(new Event('change',{bubbles:true}));this.click('review-next');}else throw new Error('AdvanceStageUnknown');}
      throw new Error('AdvanceBound');
    }
    if(c.method==='submitOrder'){
      if(this.doc.getElementById('merchant').dataset.step!=='review')throw new Error('SubmitStageUnknown');this.click('place-order');
      // A local selected option/final screen is not independent order proof. Always reconcile via separate lookup.
      return result('unknown');
    }
    if(c.method==='lookupOrder'){
      this.click('lookup-order');this.check(c);const order=this.doc.getElementById('order');
      const accepted=this.accepted();
      const actual=order?{productId:order.dataset.productId,model:order.dataset.model,capacity:order.dataset.capacity,color:order.dataset.color,quantity:Number(order.dataset.quantity),totalCny:Number(order.dataset.total),store:order.dataset.store,fulfillment:order.dataset.fulfillment}:null;
      const matched=visible(order)&&order.dataset.status==='unpaid'&&order.dataset.id.startsWith('FAKE-order-')&&actual&&validateConditions(actual,c.expect)&&accepted&&['store','date','start','end'].every(k=>order.dataset[k]===accepted[k]);
      return {body:{contract:'mock-v0',kind:'lookup',opId:c.opId,order:matched?'confirmed':'unknown',evidence:'FAKE-independent-DOM-unpaid'},simulatedMs:0};
    }
    throw new Error('DomMethodUnknown');
  }
}
