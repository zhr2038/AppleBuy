// Deliberately invented local merchant. Pro contributes native-control shape only, no Apple semantics.
export class FakeMerchant {
  constructor(root){this.root=root;this.state={step:'product',seq:1,refusals:0,bagAdds:0,chooses:0,advances:0,submits:0,lookups:0,orders:[],accepted:null};this.scenario='normal';}
  configure(plan,scenario){if(this.state.step!=='product')throw new Error('FakeAlreadyStarted');this.plan=plan;this.scenario=scenario;this.render();}
  render(){
    const s=this.state,p=this.plan;if(!p)return;const product=p.products[0];
    this.root.replaceChildren();this.root.dataset.step=s.step;this.root.dataset.seq=String(s.seq);
    const add=(tag,text,attributes={})=>{const e=document.createElement(tag);e.textContent=text;for(const[k,v]of Object.entries(attributes))e.setAttribute(k,v);this.root.append(e);return e;};
    add('h2','虚构官网：'+({product:'选择商品',bag:'购物袋',fulfillment:'取货方式',slots:'选择取货时间',accepted:'时段已接受',details:'取货详情',payment:'付款方式',review:'核对订单',unpaid:'等待付款',unknown:'结果不明',orders:'模拟订单详情'}[s.step]??s.step));
    const summary=add('p',`${product.model} ${product.capacity} ${product.color}｜数量 1｜总计（含税） ¥${this.scenario==='wrong-price'?p.maxTotalCny+1:p.maxTotalCny}｜${p.stores[0].label}`,{id:'condition'});
    Object.assign(summary.dataset,{productId:product.id,model:product.model,capacity:product.capacity,color:product.color,quantity:'1',total:String(this.scenario==='wrong-price'?p.maxTotalCny+1:p.maxTotalCny),store:p.stores[0].label,fulfillment:'pickup'});
    const button=(id,label,fn)=>{const b=add('button',label,{id,type:'button'});b.onclick=()=>{fn();s.seq++;this.render();};return b;};
    if(s.step==='product')button('add-bag','添加到购物袋（模拟）',()=>{s.bagAdds++;s.step='bag';});
    if(s.step==='bag'){add('p','购物袋数量：1');button('checkout','安全结账（模拟）',()=>s.step='fulfillment');}
    if(s.step==='fulfillment'){
      const r=add('input','',{type:'radio',id:'pickup',name:'fulfillment'});r.value='pickup';add('label','我要取货',{for:'pickup'});
      button('pickup-next','继续选择取货时间',()=>{if(!r.checked)return;s.step='slots';});
    }
    if(s.step==='slots')for(const[day,date]of p.dates.entries()){
      const group=add('fieldset','',{ 'data-date':date });const legend=document.createElement('legend');legend.textContent=date;group.append(legend);
      const select=document.createElement('select');select.setAttribute('aria-label',date+' 取货时间');select.dataset.date=date;
      const placeholder=document.createElement('option');placeholder.textContent='可选时段';placeholder.disabled=true;placeholder.selected=true;placeholder.value='';select.append(placeholder);
      for(const[i,time]of ['20:30-20:45','20:45-21:00','21:15-21:30'].entries()){
        // Removed/refused terminal is no longer displayed: do not fall back to its earlier sibling.
        if(i===2&&day<s.refusals)continue;
        const opt=document.createElement('option');opt.textContent=time.replace('-','–');opt.value=`r${s.seq}-${day}-${i}`;opt.dataset.start=time.split('-')[0];opt.dataset.end=time.split('-')[1];select.append(opt);
      }group.append(select);
      if(this.scenario==='redraw')select.onchange=()=>{if(!s.redrawn){s.redrawn=true;s.seq++;this.render();}};
      const b=document.createElement('button');b.type='button';b.textContent='继续填写取货详情';b.dataset.date=date;b.onclick=()=>{
        if(!select.value)return;const opt=select.selectedOptions[0];s.chooses++;
        if(day<2&&s.refusals<2){s.refusals++;s.feedback='rejected';s.rejected={store:p.stores[0].label,date,start:opt.dataset.start,end:opt.dataset.end};}
        else{s.feedback='accepted';s.accepted={store:p.stores[0].label,date,start:opt.dataset.start,end:opt.dataset.end};s.step='accepted';}
        s.seq++;this.render();
      };group.append(b);
    }
    if(s.feedback){const feedback=add('p',s.feedback==='rejected'?'所选时段已满，请重新选择':'取货时段已接受',{id:'feedback'});feedback.dataset.result=s.feedback;}
    if(s.accepted){const accepted=add('p',`${s.accepted.date} ${s.accepted.start}–${s.accepted.end}`,{id:'accepted'});Object.assign(accepted.dataset,s.accepted);}
    if(s.step==='accepted')button('details','继续填写取货详情',()=>{s.advances++;s.step='details';});
    if(s.step==='details'){
      add('p','仅使用 FAKE 演练信息，不读取真实姓名、账号、证件或付款资料。');const input=add('input','',{id:'fake-suffix',type:'text',maxlength:'4','aria-label':'虚构证件末四位'});
      button('details-next','继续选择付款方式',()=>{if(input.value==='0000')s.step='payment';});
    }
    if(s.step==='payment'){
      const alipay=add('input','',{id:'alipay',type:'radio',name:'payment'});add('label','支付宝（模拟，不支付）',{for:'alipay'});
      button('review-next','继续核对订单',()=>{if(alipay.checked)s.step='review';});
    }
    if(s.step==='review'){
      add('p','仅虚构下单，无真实商店条款或付款行为。');button('place-order','创建未付款模拟订单',()=>{
        s.submits++;if(!s.orders.length)s.orders.push({id:'FAKE-order-'+crypto.randomUUID().replaceAll('-',''),status:'unpaid',slot:s.accepted,productId:product.id,model:product.model,capacity:product.capacity,color:product.color,quantity:1,total:p.maxTotalCny,store:p.stores[0].label,fulfillment:'pickup'});
        s.step=this.scenario==='unknown'?'unknown':'unpaid';
      });
    }
    if(['unpaid','unknown','orders'].includes(s.step)){
      button('lookup-order','只读查看模拟订单',()=>{s.lookups++;s.step=this.scenario==='unknown'?'unknown':'orders';});
      if(s.step==='orders'){
        const o=s.orders[0],order=add('p','模拟订单：待付款，数量 1；商品和取货门店按订单记录核对',{id:'order'});
        if(o){Object.assign(order.dataset,o,o.slot);delete order.dataset.slot;order.dataset.color=this.scenario==='wrong-order'?'错误颜色':o.color;}
      }
      if(s.step==='unknown')add('p','结果仍不明：停止并保留记录，不能重新下单');
    }
    add('p',`加购 ${s.bagAdds}｜时段选择 ${s.chooses}｜继续 ${s.advances}｜最终提交 ${s.submits}｜只读查单 ${s.lookups}｜模拟订单 ${s.orders.length}`,{id:'merchant-counts'});
  }
}
