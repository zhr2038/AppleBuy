// One extension-origin Web Lock owns the ENTIRE advancing task, not individual clicks.
export async function withPurchaseOwner(locks,operation){
  if(!locks||typeof locks.request!=='function')throw new Error('ExclusiveOwnerUnavailable');
  return await locks.request('applebuy-single-purchase-owner',{ifAvailable:true},async lock=>lock?{owned:true,result:await operation()}:{owned:false});
}
