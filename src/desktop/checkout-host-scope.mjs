// Read the existing Chrome grant only. This does not request or expand any permission.
import {SHOP_HOST_SCOPE} from './ended-draft.mjs';

export async function probeCheckoutHostScope(api){
 try{
  const granted=await api.permissions.contains({origins:[SHOP_HOST_SCOPE]});
  if(typeof granted==='boolean')return {shopHostScopeVerified:true,shopHostScopeGranted:granted};
 }catch{}
 return {shopHostScopeVerified:false,shopHostScopeGranted:null};
}
