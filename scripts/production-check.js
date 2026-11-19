import {productionConfig} from '../server/config.js';
import {emailConfig} from '../server/email.js';
try{
 const config=productionConfig({...process.env,NODE_ENV:'production'});
 console.log('HTTPS origin and production payment configuration: valid.');
 console.log(config.paymentMode==='razorpay'?'Razorpay credentials present (not verified with provider).':'Online payments disabled.');
 const email=emailConfig({...process.env,NODE_ENV:'production'});
 if(!email.configured)throw new Error('Configure Gmail SMTP before accepting customer bookings.');
 console.log('SMTP settings present. Use npm run email:verify to check connectivity.');
 console.log('Before launch, complete COMMERCIAL_LAUNCH.md, including real boat inventory, policies, webhook delivery and restore drill.');
}catch(error){console.error(error.message);process.exitCode=1;}
