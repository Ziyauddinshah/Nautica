import {ApiError} from '../errors.js';
import {validSignature} from '../domain/signature.js';
export function createRazorpayGateway({keyId,keySecret,webhookSecret,transport=fetch}={}){
 const enabled=Boolean(keyId&&keySecret&&webhookSecret);
 async function request(path,body){
  let response;try{response=await transport('https://api.razorpay.com/v1/'+path,{method:body?'POST':'GET',headers:{Authorization:'Basic '+Buffer.from(keyId+':'+keySecret).toString('base64'),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});}catch{throw new ApiError(503,'Payment service is unavailable. Please try again.');}
  if(!response.ok)throw new ApiError(503,'Payment service is unavailable. Please try again.');
  try{return await response.json();}catch{throw new ApiError(503,'Payment service is unavailable. Please try again.');}
 }
 function readWebhook(raw,signature){
  if(!enabled||!validSignature(signature,raw,webhookSecret))throw new ApiError(400,'Invalid payment notification.');
  let event;try{event=JSON.parse(raw);}catch{throw new ApiError(400,'Invalid payment notification.');}
  if(!event||typeof event!=='object'||Array.isArray(event))throw new ApiError(400,'Invalid payment notification.');
  if(!['payment.captured','order.paid'].includes(event.event))return null;
  const payment=event.payload?.payment?.entity;
  if(typeof payment?.id!=='string'||typeof payment?.order_id!=='string')return null;
  return {paymentId:payment.id,orderId:payment.order_id,attemptId:typeof payment.notes?.attempt_id==='string'?payment.notes.attempt_id:null};
 }
 return {name:'Razorpay',enabled,keyId,createOrder:body=>request('orders',body),getPayment:async id=>{const payment=await request('payments/'+encodeURIComponent(id));return {id:payment.id,orderId:payment.order_id,amount:payment.amount,currency:payment.currency,status:payment.status};},verifyCallback:(orderId,paymentId,signature)=>validSignature(signature,orderId+'|'+paymentId,keySecret),readWebhook};
}
