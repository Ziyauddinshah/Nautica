import {request,ApiError} from './api.js';
let loading;
function loadCheckout(){
 if(window.Razorpay)return Promise.resolve();
 if(!loading)loading=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://checkout.razorpay.com/v1/checkout.js';script.onload=resolve;script.onerror=()=>{script.remove();loading=null;reject(new Error('Unable to open payment checkout. Please try again.'));};document.head.append(script);});
 return loading;
}
export async function payRazorpay(payload,language){
 await loadCheckout();
 const order=await request('/api/payments/order',{method:'POST',body:payload});
 return new Promise((resolve,reject)=>{
  const checkout=new window.Razorpay({key:order.keyId,amount:order.amount,currency:'INR',order_id:order.orderId,name:'Nautica',description:'Boat seat reservation',prefill:{name:payload.name,email:payload.email,contact:payload.phone},config:{display:{language:language==='hi'?'hi':'en'}},modal:{ondismiss:()=>reject(new ApiError('Checkout closed. Check your booking history before starting another payment.',409))},handler:async result=>{
   try{const response=await request('/api/payments/verify',{method:'POST',body:{attemptId:order.attemptId,orderId:result.razorpay_order_id,paymentId:result.razorpay_payment_id,signature:result.razorpay_signature}});resolve(response.booking);}catch(error){reject(error);}
  }});
  checkout.open();
 });
}
