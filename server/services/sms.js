import {noticeSms} from '../aftercare/notices.js';
import {bookingSms} from '../domain/sms.js';
import {smsPhone,SmsError} from './textbee.js';
export function createSmsService(store,gateway){
 let running=null,timer,stopped=false;
 const status=()=>({configured:gateway.enabled});
 async function drain(){
  if(stopped||!gateway.enabled)return;
  for(let index=0;index<20&&!stopped;index++){
   const job=await store.claim();if(!job)break;
   try{
    const record=await store.record(job);
    if(record?.suppress||(!record?.notice&&record?.status==='cancelled')){await store.suppress(job);continue;}
    const recipient=smsPhone(job.audience==='admin'?gateway.config.adminTo:(record?.recipientOverride||job.recipient),gateway.config.countryCode);
    if(!record||!recipient)throw new SmsError('SMS_INVALID_RECIPIENT');
    const result=await gateway.send(recipient,record.notice?noticeSms(record.notice):bookingSms(record,job.audience));
    await store.accepted(job,recipient,result.batchId,gateway.config.deviceId);
   }catch(error){await store.fail(job,error instanceof SmsError?error:new SmsError('SMS_SEND_UNKNOWN',{unknown:true}));}
  }
  for(let index=0;index<20&&!stopped;index++){
   const job=await store.claimPoll();if(!job)break;
   // Never poll the same batch through a different sender device after a config change.
   if(job.deviceId!==gateway.config.deviceId)continue;
   try{const result=await gateway.status(job.batchId,job.recipient);await store.polled(job,result.status);}catch{/* Read-only polling can safely be retried; no SMS is resent. */}
  }
 }
 function kick(){if(running)return running;running=drain().catch(()=>{console.error('SMS worker paused; jobs remain in shared storage.');}).finally(()=>{running=null;});return running;}
 return {status,kick,drain:kick,async retry(id){if(!gateway.enabled)throw new Error('SMS service is unavailable.');await store.retry(id);kick();},start(){stopped=false;kick();timer=setInterval(kick,15000);timer.unref?.();},async stop(){stopped=true;clearInterval(timer);await running;}};
}
