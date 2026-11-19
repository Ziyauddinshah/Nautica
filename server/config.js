import {trustedResetOrigin} from './email.js';
export function productionConfig(env=process.env){
 const production=env.NODE_ENV==='production';
 const paymentMode=env.PAYMENT_MODE||(production?'disabled':'demo');
 if(!['demo','disabled','razorpay'].includes(paymentMode))throw new Error('PAYMENT_MODE must be demo, disabled or razorpay.');
 const publicOrigin=trustedResetOrigin(env.PUBLIC_ORIGIN,production)||'';
 if(production&&!publicOrigin)throw new Error('Production requires an HTTPS PUBLIC_ORIGIN without a path.');
 if(production&&paymentMode==='demo')throw new Error('Demo payments are not allowed in production.');
 if(paymentMode==='razorpay'&&(!env.RAZORPAY_KEY_ID||!env.RAZORPAY_KEY_SECRET||!env.RAZORPAY_WEBHOOK_SECRET))throw new Error('Razorpay credentials and webhook secret are required.');
 if(production&&paymentMode==='razorpay'&&!env.RAZORPAY_KEY_ID.startsWith('rzp_live_'))throw new Error('Production requires live Razorpay keys.');
 return {production,paymentMode,publicOrigin};
}
