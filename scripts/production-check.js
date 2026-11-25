import {identityProvider} from '../server/verification/provider.js';
import {textbeeConfig} from '../server/services/textbee.js';
import {openRepository} from '../server/runtime.js';
import {productionConfig} from '../server/config.js';
import {emailConfig} from '../server/email.js';
try{
 if(!process.env.CLAMAV_HOST)throw new Error('Configure a private ClamAV scanner (CLAMAV_HOST) before enabling boat document uploads.');
 if((process.env.MOBILE_OTP_SECRET||'').length<32||!textbeeConfig().configured)throw new Error('Configure the private shared MOBILE_OTP_SECRET and TextBee for owner mobile verification.');
 if(!identityProvider().enabled)throw new Error('Configure an authorized identity verification bridge before accepting boat registrations.');
 const config=productionConfig({...process.env,NODE_ENV:'production'});
 const db=await openRepository({...process.env,NODE_ENV:'production'});try{await db.health();}finally{await db.close();}
 console.log('Shared MongoDB cluster and initialized schema are reachable. Verify your backup plan before launch.');
 console.log('HTTPS origin and production payment configuration: valid.');
 console.log(config.paymentMode==='razorpay'?'Razorpay credentials present (not verified with provider).':'Online payments disabled.');
 const email=emailConfig({...process.env,NODE_ENV:'production'});
 if(!email.configured)throw new Error('Configure Gmail SMTP before accepting customer bookings.');
 console.log('SMTP settings present. Use npm run email:verify to check connectivity.');
 console.log('Before launch, complete COMMERCIAL_LAUNCH.md, including real boat inventory, policies, webhook delivery and restore drill.');
}catch(error){console.error(error.message);process.exitCode=1;}
