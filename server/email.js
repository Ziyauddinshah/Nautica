import nodemailer from 'nodemailer';
import { randomUUID } from 'node:crypto';
import { extras, money } from '../src/domain/booking.js';

const address = value => typeof value === 'string' && value.length <= 254 && /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(value);
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const MAX_ATTEMPTS = 5;
const RETRY_DELAYS = [60000,300000,900000,3600000,21600000];

export function emailConfig(env = process.env) {
  if(env.SMTP_ENABLED !== 'true')return {enabled:false,configured:false,reason:'Email sending is disabled. Configure Gmail SMTP and set SMTP_ENABLED=true.'};
  const user=(env.SMTP_USER||'').trim(),adminTo=(env.SMTP_ADMIN_TO||'').trim();
  const host=(env.SMTP_HOST||'smtp.gmail.com').trim(),port=Number(env.SMTP_PORT||465);
  const pass=(env.SMTP_PASS||'').replace(/\s/g,'');
  if(!address(user)||!address(adminTo)||!pass||!['smtp.gmail.com'].includes(host)||![465,587].includes(port))return {enabled:true,configured:false,reason:'Gmail SMTP configuration is incomplete or invalid. Check the server .env file.'};
  return {enabled:true,configured:true,reason:'Gmail SMTP is configured.',user,adminTo,host,port,pass,adminUrl:env.PUBLIC_ORIGIN?adminLink(env.PUBLIC_ORIGIN):null,siteOrigin:trustedResetOrigin(env.PUBLIC_ORIGIN,env.NODE_ENV==='production')};
}
export function trustedResetOrigin(value,production=false){
 try{const url=new URL(value);if(url.username||url.password||url.pathname!=='/'||url.search||url.hash)return null;
 if(url.protocol==='https:')return url.origin;
 if(!production&&url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))return url.origin;
 }catch{}return null;
}
export function passwordResetMessage(user,link,config){
 const text=`Hello ${user.name},\n\nUse this link to reset your Nautica password:\n${link}\n\nThis link expires in 15 minutes and can be used once. Resetting your password signs out all devices. If you did not request this, ignore this message; your password has not changed. Never share this link.`;
 return {from:{name:'Nautica',address:config.user},to:{address:user.email},subject:'Reset your Nautica password',text,
 html:`<!doctype html><html lang="en"><body style="font-family:Arial,sans-serif;color:#0a192f;padding:24px"><h1 style="font-size:24px">Reset your Nautica password</h1><p>Hello ${escape(user.name)},</p><p><a href="${escape(link)}">Choose a new password</a></p><p>This single-use link expires in 15 minutes. Resetting your password signs out all devices.</p><p>If you did not request this, ignore this email; your password has not changed. Never share this link.</p></body></html>`,disableFileAccess:true,disableUrlAccess:true};
}
function adminLink(origin){try{const url=new URL('/admin',origin);return ['https:','http:'].includes(url.protocol)?url.href:null;}catch{return null;}}
export function smtpOptions(config) {
  return {host:config.host,port:config.port,secure:config.port===465,requireTLS:config.port===587,
    auth:{user:config.user,pass:config.pass},tls:{minVersion:'TLSv1.2',rejectUnauthorized:true},
    connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000,
    disableFileAccess:true,disableUrlAccess:true};
}
export function confirmationMessage(record,audience,config,recipient,messageId){
  const admin=audience==='admin';
  const fields=[['Booking reference',record.id],['Booking status',record.status],['Lead passenger',record.customer.name],
    ['Vessel',record.boat.name],['Boat type',record.boat.type],['Boarding pier',record.boat.pier],
    ['Date',record.trip.date],['Time slot',record.trip.slot],['Guests',record.trip.guests],['Seat numbers',record.trip.seats.join(', ')],
    ['Add-ons',extras.filter(extra=>record.extras.includes(extra.id)).map(extra=>extra.name).join(', ')||'None'],
    ['Base group fare',money(record.pricing.base,'INR')],['Add-ons amount',money(record.pricing.addons,'INR')],
    ['Port and pier fee (5%)',money(record.pricing.fee,'INR')],['Total',money(record.payment.amount,'INR')],
    ['Payment method',record.payment.method],['Payment status','SIMULATED — no real money charged'],['Demo payment reference',record.payment.reference]];
  if(admin)fields.push(['Passenger email',record.customer.email],['Passenger phone',record.customer.phone],['Boat capacity',record.boat.capacity],['Booking created',record.createdAt]);
  const heading=admin?'New Nautica booking confirmed':'Your Nautica booking is confirmed';
  const intro=admin?'A new booking has reserved the following seats.':`Hello ${record.customer.name}, your selected seats are reserved. Please arrive 15 minutes before departure.`;
  const note='This is a demonstration booking. Payment is simulated and this email is not a valid ticket for real travel. Dates and time slots are displayed as entered in the booking app.';
  const text=[heading,intro,'',...fields.map(([label,value])=>`${label}: ${value}`),'',...(admin&&config.adminUrl?[`Admin dashboard: ${config.adminUrl}`]:[]),note].join('\n');
  const html=`<!doctype html><html lang="en"><body style="margin:0;padding:24px;background:#f4f7f9;color:#0a192f;font-family:Arial,sans-serif"><div style="max-width:640px;margin:auto;background:white;padding:28px;border-radius:16px"><p style="color:#008080;letter-spacing:2px;font-weight:bold">NAUTICA</p><h1 style="font-size:25px">${escape(heading)}</h1><p style="line-height:1.7">${escape(intro)}</p><table style="border-collapse:collapse;width:100%">${fields.map(([label,value])=>`<tr><th scope="row" style="padding:10px 8px;text-align:left;border-bottom:1px solid #e1e8eb;font-size:12px;vertical-align:top">${escape(label)}</th><td style="padding:10px 8px;border-bottom:1px solid #e1e8eb;font-size:13px;word-break:break-word">${escape(value)}</td></tr>`).join('')}</table>${admin&&config.adminUrl?`<p><a href="${escape(config.adminUrl)}" style="color:#008080">Open admin dashboard</a></p>`:''}<p style="font-size:11px;color:#65737e;line-height:1.7">${escape(note)}</p></div></body></html>`;
  return {from:{name:'Nautica',address:config.user},to:{address:recipient},subject:`${admin?'[Admin] New booking':'Booking confirmation'} — ${record.id}`,messageId,text,html,disableFileAccess:true,disableUrlAccess:true};
}
export function notificationsFor(db,bookingId){
  return db.prepare('SELECT audience,status,attempts,last_error_code AS errorCode,sent_at AS sentAt,next_attempt_at AS nextAttemptAt FROM email_outbox WHERE booking_id=? ORDER BY audience').all(bookingId);
}
function safeError(error){
  if(error?.code==='EAUTH')return 'SMTP_AUTH_FAILED';
  if(['ECONNECTION','ECONNREFUSED','ETIMEDOUT','ESOCKET','EDNS'].includes(error?.code))return 'SMTP_CONNECTION_FAILED';
  if(['EENVELOPE','EMESSAGE'].includes(error?.code))return 'SMTP_RECIPIENT_OR_MESSAGE_REJECTED';
  return 'SMTP_SEND_FAILED';
}
export function createEmailService(db,{config=emailConfig(),transport,now=()=>Date.now()}={}){
  const mailer=config.configured?(transport||nodemailer.createTransport(smtpOptions(config))):null;
  let timer,busy=false,stopped=false,running=Promise.resolve();
  const resetSends=new Set();
  function status(){return {passwordResetEnabled:!!(config.configured&&config.siteOrigin),siteOrigin:config.siteOrigin||null,enabled:config.enabled,configured:config.configured,reason:config.reason,sender:config.configured?config.user:null,adminRecipient:config.configured?config.adminTo:null};}
  function claim(){
    db.exec('BEGIN IMMEDIATE');
    try{
      const time=now();
      db.prepare("UPDATE email_outbox SET status='failed',lease_until=0,last_error_code='SMTP_DELIVERY_UNKNOWN' WHERE status='sending' AND lease_until<=? AND attempts>=?").run(time,MAX_ATTEMPTS);
      const job=db.prepare(`SELECT * FROM email_outbox WHERE attempts<? AND ((status IN ('pending','failed') AND next_attempt_at<=?) OR (status='sending' AND lease_until<=?)) ORDER BY id LIMIT 1`).get(MAX_ATTEMPTS,time,time);
      if(!job){db.exec('COMMIT');return null;}
      const recipient=job.recipient||(job.audience==='admin'?config.adminTo:null);
      if(!recipient||!address(recipient))throw new Error('Invalid notification destination.');
      const messageId=job.message_id||`<${randomUUID()}@${config.user.split('@')[1]}>`;
      db.prepare("UPDATE email_outbox SET status='sending',attempts=attempts+1,lease_until=?,recipient=?,message_id=? WHERE id=?").run(time+120000,recipient,messageId,job.id);
      db.exec('COMMIT');return {...job,attempts:job.attempts+1,recipient,message_id:messageId};
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  async function drain(){
    if(stopped||busy||!mailer)return;
    busy=true;
    try{
      // Bound each pass so a growing queue yields back to the application.
      for(let count=0;count<20&&!stopped;count++){
        const job=claim();if(!job)break;
        try{
          const row=db.prepare('SELECT record FROM bookings WHERE id=?').get(job.booking_id);
          const message=confirmationMessage(JSON.parse(row.record),job.audience,config,job.recipient,job.message_id);
          const result=await mailer.sendMail(message);
          if(!result.accepted?.some(value=>(typeof value==='string'?value:value.address)?.toLowerCase()===job.recipient.toLowerCase()))throw Object.assign(new Error('SMTP did not accept recipient.'),{code:'EENVELOPE'});
          db.prepare("UPDATE email_outbox SET status='sent',sent_at=?,lease_until=0,last_error_code=NULL WHERE id=?").run(new Date(now()).toISOString(),job.id);
        }catch(error){
          db.prepare("UPDATE email_outbox SET status='failed',lease_until=0,last_error_code=?,next_attempt_at=? WHERE id=?").run(safeError(error),now()+RETRY_DELAYS[Math.min(job.attempts-1,RETRY_DELAYS.length-1)],job.id);
        }
      }
    }finally{busy=false;}
  }
  function kick(){
    if(busy)return running;
    // This always handles rejection: SMTP/worker failures must not reject a booking request.
    running=drain().catch(()=>{console.error('Email queue processing failed; queued notifications remain in the database.');});return running;
  }
  function retry(bookingId){
    if(!config.configured)throw new Error('Configure Gmail SMTP on the server before retrying email.');
    db.prepare("UPDATE email_outbox SET status='pending',attempts=0,next_attempt_at=0,lease_until=0,last_error_code=NULL WHERE booking_id=? AND status='failed'").run(bookingId);
    kick();
  }
  function sendPasswordReset(job){
    if(!mailer||!config.siteOrigin||stopped)return Promise.resolve(false);
    // No token or message body is persisted or logged. Reset requests may be repeated after a process restart.
    const pending=Promise.resolve().then(()=>mailer.sendMail(passwordResetMessage(job.user,job.link,config))).then(result=>{
      if(!result.accepted?.some(value=>(typeof value==='string'?value:value.address)?.toLowerCase()===job.user.email.toLowerCase()))throw new Error('Recipient not accepted.');
      return true;
    }).catch(()=>{console.error('Password reset email could not be sent. Check Gmail SMTP settings.');return false;}).finally(()=>resetSends.delete(pending));
    resetSends.add(pending);return pending;
  }
  return {status,kick,drain,retry,sendPasswordReset,start(){stopped=false;kick();timer=setInterval(kick,15000);timer.unref?.();},async stop(){stopped=true;clearInterval(timer);await running;await Promise.allSettled([...resetSends]);mailer?.close?.();}};
}
