// Bounded DOM observation after this task's one checkout. This never logs in or resends checkout.
const AFTER_AUTH=new Set(['FULFILLMENT','SLOTS','DETAILS','PAYMENT','REVIEW']);
export class AuthContinuation {
 constructor({observe,isBusy=()=>false,onStopped=()=>{},now=()=>Date.now(),setTimer=(f)=>setInterval(f,1000),clearTimer=clearInterval}){Object.assign(this,{observe,isBusy,onStopped,now,setTimer,clearTimer});this.epoch=0;this.reading=false;this.timer=null;}
 start(resume,{phases=AFTER_AUTH,deadline=Infinity}={}){this.stop();this.resume=resume;this.phases=new Set(phases);this.transportMisses=0;this.until=Math.min(this.now()+300000,deadline);const epoch=this.epoch;this.timer=this.setTimer(()=>this.tick(epoch));}
 stop(){this.epoch++;if(this.timer!==null)this.clearTimer(this.timer);this.timer=null;this.resume=null;}
 async tick(epoch=this.epoch){
  if(epoch!==this.epoch||this.timer===null||this.reading||this.isBusy())return;
  if(this.now()>this.until){this.stop();this.onStopped('expired');return;}
  this.reading=true;
  try{
   const o=await this.observe();
   this.transportMisses=0;
   if(epoch===this.epoch&&(o?.merchantError||o?.feedback||['CONSENT','CHALLENGE','THROTTLE'].includes(o?.phase))){this.stop();this.onStopped('requires-user');return;}
   if(epoch===this.epoch&&this.phases.has(o?.phase)){const resume=this.resume;this.stop();await resume();}
  }catch(error){if(epoch===this.epoch){if(error?.scriptTransport===true&&this.now()<this.until&&++this.transportMisses<=10)return;this.stop();this.onStopped('unconfirmed');}}
  finally{this.reading=false;}
 }
}
