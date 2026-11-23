// HTTP response allowlists: persistence objects and service configuration must not be serialized wholesale.
const pick=(object,keys)=>Object.fromEntries(keys.filter(key=>object?.[key]!==undefined).map(key=>[key,object[key]]));
export const passView=pass=>pick(pass,['id','boatId','date','slot','guests','seats','name','extras','total','currencyBase','method','createdAt','serverConfirmed','emailStatus','paymentStatus']);
export function notificationView(job,admin=false){return pick(job,admin?['audience','channel','status','attempts','sentAt','nextAttemptAt','acceptedAt','deliveredAt','retryable']:['audience','channel','status','sentAt','acceptedAt','deliveredAt']);}
export const paymentView=payment=>pick(payment,['type','provider','bank','network','last4','method','status','reference','paidAt','amount','currency']);
export function bookingView(record,{admin=false,notifications=[]}={}){
 return {
  ...pick(record,['id','status','createdAt',...(admin?['bookingMode']:[])]),
  customer:pick(record.customer,['name','email','phone']),
  boat:pick(record.boat,['id','name','pier','type','capacity']),
  trip:pick(record.trip,['date','slot','guests','seats']),
  extras:Array.isArray(record.extras)?record.extras:[],
  pricing:pick(record.pricing,['base','addons','fee','total']),
  payment:paymentView(record.payment),
  pass:passView(record.pass),
  notifications:notifications.filter(job=>admin||job.audience==='customer').map(job=>notificationView(job,admin)),
 };
}
export function emailServiceView(service){const status=service?.status();return {configured:status?.configured===true,passwordResetEnabled:status?.passwordResetEnabled===true};}
