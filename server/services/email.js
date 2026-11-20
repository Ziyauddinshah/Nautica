import nodemailer from 'nodemailer';
import {emailConfig,smtpOptions,confirmationMessage,passwordResetMessage} from '../email.js';
// SMTP is replaceable; a database lease coordinates workers on every application replica.
export function createSharedEmailService(store,{config=emailConfig(),transport}={}){
 const mailer=config.configured?(transport||nodemailer.createTransport(smtpOptions(config))):null;
 let timer,running=null,stopped=false;const resetSends=new Set();
 const status=()=>({passwordResetEnabled:Boolean(config.configured&&config.siteOrigin),siteOrigin:config.siteOrigin,enabled:config.enabled,configured:config.configured,reason:config.reason});
 async function drain(){
  if(stopped||!mailer)return;
  for(let count=0;count<20&&!stopped;count++){
   const job=await store.claim();if(!job)break;
   try{
    const record=await store.record(job);
    const recipient=job.recipient||(job.audience==='admin'?config.adminTo:null);
    if(!record||!recipient)throw new Error('Invalid email job.');
    const result=await mailer.sendMail(confirmationMessage(record,job.audience,config,recipient,job.messageId));
    if(!result.accepted?.some(value=>(typeof value==='string'?value:value.address)?.toLowerCase()===recipient.toLowerCase()))throw new Error('Recipient not accepted.');
    await store.succeed(job);
   }catch(error){
    // Store only a non-sensitive category, never provider responses or message contents.
    await store.fail(job);
   }
  }
 }
 function kick(){if(running)return running;running=drain().catch(()=>{console.error('Email delivery paused; shared jobs remain queued.');}).finally(()=>{running=null;});return running;}
 async function retry(id){if(!config.configured)throw new Error('Email service is unavailable.');await store.retry(id);kick();}
 function sendPasswordReset(job){
  if(!mailer||!config.siteOrigin||stopped)return Promise.resolve(false);
  const pending=Promise.resolve().then(()=>mailer.sendMail(passwordResetMessage(job.user,job.link,config,job.language))).then(result=>Boolean(result.accepted?.some(value=>(typeof value==='string'?value:value.address)?.toLowerCase()===job.user.email.toLowerCase()))).catch(()=>false).finally(()=>resetSends.delete(pending));resetSends.add(pending);return pending;
 }
 return {status,kick,drain:kick,retry,sendPasswordReset,start(){stopped=false;kick();timer=setInterval(kick,15000);timer.unref?.();},async stop(){stopped=true;clearInterval(timer);await running;await Promise.allSettled([...resetSends]);mailer?.close?.();}};
}
