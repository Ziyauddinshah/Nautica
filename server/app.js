import {journeyEnd} from './domain/history.js';
import {verificationRequest} from './verification/http.js';
import {fleetRequest} from './fleet/http.js';
import http from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {projectRoot} from './database-path.js';
import {isIP} from 'node:net';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import {createSqliteRepository} from './repositories/sqlite.js';
import {passView,bookingView,emailServiceView} from './views.js';
import {ApiError,digest} from './errors.js';

export function createApp(db, { mode = 'seats', production = false, publicOrigin = '', emailService = null, smsService = null, paymentMode = production?'disabled':'demo', payments = null, trustedProxyIPs = [], proxyToken = '', repository = null, refunds = null, aftercare = null, clock = ()=>Date.now() } = {}) {
  const repo=repository||createSqliteRepository(db);
  const attempts = new Map(),userAttempts=new Map();
  function clientIP(req){const peer=req.socket.remoteAddress,proof=req.headers['x-nautica-proxy-token'];const verified=proxyToken.length>=32&&typeof proof==='string'&&Buffer.byteLength(proof)===Buffer.byteLength(proxyToken)&&timingSafeEqual(Buffer.from(proof),Buffer.from(proxyToken));if(!verified&&!trustedProxyIPs.includes(peer))return peer;const forwarded=req.headers['x-forwarded-for']?.split(',').at(-1)?.trim();return forwarded&&isIP(forwarded)?forwarded:peer;}
  function userToken(req){return (req.headers.cookie||'').split(';').map(value=>value.trim()).find(value=>value.startsWith('nautica_user='))?.slice(13);}
  function userCookie(value,maxAge=28800){return `nautica_user=${value}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${maxAge}${production?'; Secure':''}`;}
  async function throttle(req,category,identifier=''){if(repo.consumeLimits)return repo.consumeLimits(category,clientIP(req),identifier);const now=Date.now();for(const [key,value]of userAttempts)if(value.until<=now)userAttempts.delete(key);if(userAttempts.size>10000)throw new ApiError(429,'Please try again later.');const keys=[category+':ip:'+clientIP(req),...(identifier?[category+':account:'+digest(identifier)]:[])];for(const key of keys){const value=userAttempts.get(key)||{count:0,until:now+900000};if(value.count>= (category==='forgot'?(key.includes(':account:')?3:5):category==='register'?10:15))throw new ApiError(429,'Too many attempts. Try again after 15 minutes.');value.count++;userAttempts.set(key,value);}}
  function token(req) { return (req.headers.cookie || '').split(';').map(v=>v.trim()).find(v=>v.startsWith('nautica_admin='))?.slice(14); }
  function cookie(value, maxAge=28800) {return `nautica_admin=${value}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=${maxAge}${production?'; Secure':''}`;}
  const server = http.createServer(async (req,res) => {
    const language=req.headers['x-nautica-language']==='hi'?'hi':'en';
    const security={'Content-Security-Policy':"default-src 'self'; script-src 'self' https://checkout.razorpay.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.razorpay.com; font-src 'self'; connect-src 'self' https://*.razorpay.com; frame-src https://*.razorpay.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",'Permissions-Policy':'camera=(), microphone=(), geolocation=()','Referrer-Policy':'no-referrer',...(production?{'Strict-Transport-Security':'max-age=31536000'}:{})};
    for(const [key,value] of Object.entries(security))res.setHeader(key,value);
    const send=(status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer',...headers});res.end(JSON.stringify(data));};
    try {
      const url=new URL(req.url,'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        if(req.method==='POST'&&url.pathname==='/api/payments/razorpay/webhook'){const chunks=[];let size=0;for await(const chunk of req){chunks.push(chunk);size+=chunk.length;if(size>131072)throw new ApiError(413,'Request is too large.');}if(!payments)throw new ApiError(503,'Online booking is currently unavailable.');await payments.webhook(Buffer.concat(chunks),req.headers['x-razorpay-signature']);emailService?.kick();smsService?.kick();return send(200,{ok:true});}
        if (req.method === 'POST') {
          const origin=req.headers.origin;
          const allowed = origin && (origin === publicOrigin || (!production && origin === `http://${req.headers.host}`) || (!production && ['http://localhost:3000','http://127.0.0.1:3000'].includes(origin)));
          if (!allowed || req.headers['x-nautica-request'] !== '1' || !req.headers['content-type']?.startsWith('application/json')) throw new ApiError(403,'Request origin could not be verified.');
        }
        const body = async (limit=16384) => {
          let data='';for await (const chunk of req){data+=chunk;if(Buffer.byteLength(data)>limit)throw new ApiError(413,'Request is too large.');}
          try{return JSON.parse(data);}catch{throw new ApiError(400,'Invalid JSON request.');}
        };
        if(req.method==='GET'&&url.pathname==='/api/boats')return send(200,repo.fleet?await repo.fleet.catalog():{boats:[]});
        if(url.pathname.startsWith('/api/owner/verification')){const user=await repo.authenticateUser(userToken(req));return await verificationRequest({req,url,repo,user,body,send,throttle,language});}
        if(url.pathname.startsWith('/api/owner/boats')){const user=await repo.authenticateUser(userToken(req));if(await fleetRequest({req,res,url,repo,actor:{role:'owner',id:user.id},body,send,throttle,language}))return;}
        if(req.method==='GET'&&url.pathname==='/api/health'){await repo.health();return send(200,{ok:true});}
        if(req.method==='GET'&&url.pathname==='/api/payments/config')return send(200,{cancellationPolicy:repo.cancellations?.policy,mode:paymentMode,enabled:paymentMode==='demo'||(paymentMode==='razorpay'&&Boolean(payments?.enabled))});
        if(req.method==='POST'&&['/api/payments/order','/api/payments/verify'].includes(url.pathname)){const user=await repo.authenticateUser(userToken(req));if(paymentMode!=='razorpay'||!payments?.enabled)throw new ApiError(503,'Online booking is currently unavailable.');await throttle(req,'checkout',user.id);const input=await body();if(!input||typeof input!=='object')throw new ApiError(400,'Invalid booking request.');if(url.pathname.endsWith('/order'))return send(201,await payments.order({...input,language},user));const booking=await payments.verify(input,user);emailService?.kick();smsService?.kick();return send(200,{booking:passView(booking)});}
        if(req.method==='GET'&&url.pathname==='/api/availability')return send(200,{...await repo.availability(Object.fromEntries(url.searchParams)),mode});
        if(req.method==='POST'&&url.pathname==='/api/bookings'){if(paymentMode!=='demo'||production)throw new ApiError(503,'Online booking is currently unavailable.');const user=await repo.authenticateUser(userToken(req));const input=await body();if(!input||typeof input!=='object')throw new ApiError(400,'Invalid booking request.');const booking=await repo.createBooking({...input,email:user.email,language},mode,user);emailService?.kick();smsService?.kick();return send(201,{booking:passView(booking)});}
        if(req.method==='POST'&&url.pathname==='/api/user/forgot-password'){
          const input=await body();await throttle(req,'forgot',typeof input?.email==='string'?input.email.trim().toLowerCase().slice(0,150):'');
          const settings=emailService?.status();
          const job=await repo.requestPasswordReset(input,{enabled:settings?.passwordResetEnabled,siteOrigin:settings?.siteOrigin});
          // Return the same response before SMTP completes, regardless of account existence.
          send(200,{message:'If this email is registered with us, you will receive a password reset link shortly. Check your inbox and spam folder.'});
          if(job)emailService.sendPasswordReset({...job,language});
          return;
        }
        if(req.method==='POST'&&url.pathname==='/api/user/reset-password'){
          await throttle(req,'password-reset');await repo.resetUserPassword(await body());
          return send(200,{ok:true,message:'Password updated. Sign in with your new password.'},{'Set-Cookie':userCookie('',0)});
        }
        if(req.method==='POST'&&['/api/user/register','/api/user/login'].includes(url.pathname)){
          const input=await body(),register=url.pathname.endsWith('/register');
          await throttle(req,register?'register':'login',typeof input?.email==='string'?input.email.trim().toLowerCase().slice(0,150):'');
          const result=register?await repo.registerUser(input):await repo.loginUser(input);
          return send(register?201:200,{user:result.user},{'Set-Cookie':userCookie(result.token)});
        }
        if(url.pathname.startsWith('/api/user/')){
          const user=await repo.authenticateUser(userToken(req));
          const cancel=url.pathname.match(/^\/api\/user\/bookings\/(NTC-[A-F0-9]{12})\/cancellation$/);
          if(req.method==='POST'&&cancel){if(!repo.cancellations)throw new ApiError(503,'Cancellation service is unavailable.');await throttle(req,'cancellation',user.id);const input=await body();const result=await repo.cancellations[input?.action==='withdraw'?'withdraw':'request'](cancel[1],user,input);emailService?.kick();smsService?.kick();return send(200,{cancellation:result});}
          if(req.method==='GET'&&url.pathname==='/api/user/session')return send(200,{user});
          if(req.method==='GET'&&url.pathname==='/api/user/payments')return send(200,await repo.userPayments(user.id,Object.fromEntries(url.searchParams)));
          if(req.method==='GET'&&url.pathname==='/api/user/bookings')return send(200,await repo.userBookings(user.id,Object.fromEntries(url.searchParams)));
          const bookingMatch=url.pathname.match(/^\/api\/user\/bookings\/(NTC-[A-F0-9]{12})$/);
          if(req.method==='GET'&&bookingMatch)return send(200,{booking:await repo.userBooking(user.id,bookingMatch[1])});
          if(req.method==='POST'&&url.pathname==='/api/user/logout'){await repo.logoutUser(userToken(req));return send(200,{ok:true},{'Set-Cookie':userCookie('',0)});}
          if(req.method==='POST'&&url.pathname==='/api/user/password'){await throttle(req,'password',user.id);await repo.changeUserPassword(user.id,await body());return send(200,{ok:true},{'Set-Cookie':userCookie('',0)});}
        }
        if(req.method==='POST'&&url.pathname==='/api/admin/login'){
          if(repo.consumeLimits)await repo.consumeLimits('admin-login',clientIP(req));
          const key=clientIP(req),now=Date.now();
          for(const [key,value]of attempts)if(now-value.since>900000)attempts.delete(key);
          const attempt=attempts.get(key)||{since:now,count:0};if(attempt.count>=5)throw new ApiError(429,'Too many sign-in attempts. Try again after 15 minutes.');
          const input=await body();
          if(!input||typeof input!=='object'||typeof input.username!=='string'||typeof input.password!=='string'||input.username.length>80||input.password.length>256)throw new ApiError(400,'Invalid sign-in fields.');
          try{const result=await repo.loginAdmin(input.username,input.password);attempts.delete(key);return send(200,{username:result.username},{'Set-Cookie':cookie(result.token)});}
          catch(error){attempt.count++;attempts.set(key,attempt);throw error;}
        }
        if(url.pathname.startsWith('/api/admin/')){
          const username=await repo.authenticateAdmin(token(req));
          if(url.pathname.startsWith('/api/admin/fleet')&&await fleetRequest({req,res,url,repo,actor:{role:'admin',id:username},body,send,throttle,language}))return;
          const cancel=url.pathname.match(/^\/api\/admin\/bookings\/(NTC-[A-F0-9]{12})\/cancellation$/);
          if(req.method==='POST'&&cancel){if(!repo.cancellations)throw new ApiError(503,'Cancellation service is unavailable.');await throttle(req,'cancellation-admin',username);const result=await repo.cancellations.decide(cancel[1],username,await body());aftercare?.kick();emailService?.kick();smsService?.kick();return send(200,{cancellation:result});}
          if(req.method==='GET'&&url.pathname==='/api/admin/refunds')return send(200,{...await repo.cancellations.listRefunds(Object.fromEntries(url.searchParams)),providerConfigured:refunds?.gateway.enabled===true});
          const refundAudit=url.pathname.match(/^\/api\/admin\/refunds\/(RF-[a-f0-9]{32})\/audit$/);if(req.method==='GET'&&refundAudit)return send(200,await repo.cancellations.auditForRefund(refundAudit[1]));
          const refundAction=url.pathname.match(/^\/api\/admin\/refunds\/(RF-[a-f0-9]{32})\/(reconcile|retry)$/);
          if(req.method==='POST'&&refundAction){if(!refunds)throw new ApiError(503,'Refund service is unavailable.');await throttle(req,'refund-admin',username);const result=await refunds[refundAction[2]](refundAction[1],username,await body());aftercare?.kick();return send(200,{refund:result});}
          const failedPayment=url.pathname.match(/^\/api\/admin\/payments\/([a-zA-Z0-9_-]{1,100})\/refund$/);
          if(req.method==='POST'&&failedPayment){await throttle(req,'refund-admin',username);const result=await repo.cancellations.refundUnbooked(failedPayment[1],username,await body());aftercare?.kick();return send(200,{refund:result});}
          if(req.method==='POST'&&url.pathname==='/api/admin/boarding/verify'){const input=await body(),record=typeof input?.bookingId==='string'?await repo.c('bookings').findOne({_id:input.bookingId}):null;const end=record&&journeyEnd(record),now=clock();let valid=Boolean(end&&now>=+end-5400000&&now<=+end&&record&&record.status==='confirmed'&&record.cancellation?.status!=='requested'&&record.payment.status==='paid'&&record.boat.id===input.boatId&&record.trip.date===input.date&&record.trip.slot===input.slot);if(valid)try{await repo.fleet.bookable(record.boat.id,record.trip.date);}catch{valid=false;}return send(200,{valid,bookingStatus:record?.status||'not_found',seats:valid?record.trip.seats:[]});}
          if(req.method==='GET'&&url.pathname==='/api/admin/payment-attention')return send(200,{payments:(await payments?.attention())||[]});
          if(req.method==='GET'&&url.pathname==='/api/admin/session')return send(200,{username});
          if(req.method==='GET'&&url.pathname==='/api/admin/bookings'){const data=await repo.adminBookings(Object.fromEntries(url.searchParams));return send(200,{...data,paymentAttention:(await payments?.attention())||[],bookings:await Promise.all(data.bookings.map(async record=>bookingView(record,{admin:true,notifications:await repo.notificationsFor(record.id)}))),emailService:emailServiceView(emailService),smsService:{configured:smsService?.status().configured===true}});}
          const smsRetry=url.pathname.match(/^\/api\/admin\/bookings\/(NTC-[A-F0-9]{12})\/sms\/retry$/);
          if(req.method==='POST'&&smsRetry){if(!smsService?.status().configured)throw new ApiError(503,'SMS service is unavailable.');if(!await repo.hasBooking(smsRetry[1]))throw new ApiError(404,'Booking not found.');await smsService.retry(smsRetry[1]);return send(200,{ok:true});}
          const retryMatch=url.pathname.match(/^\/api\/admin\/bookings\/(NTC-[A-F0-9]{12})\/emails\/retry$/);
          if(req.method==='POST'&&retryMatch){if(!emailService?.status().configured)throw new ApiError(503,'Configure Gmail SMTP on the server before retrying email.');if(!await repo.hasBooking(retryMatch[1]))throw new ApiError(404,'Booking not found.');await emailService.retry(retryMatch[1]);return send(200,{ok:true});}
          if(req.method==='POST'&&url.pathname==='/api/admin/logout'){await repo.logoutAdmin(token(req));return send(200,{ok:true},{'Set-Cookie':cookie('',0)});}
        }
        throw new ApiError(404,'Endpoint not found.');
      }
      if(!['GET','HEAD'].includes(req.method))throw new ApiError(405,'Method not allowed.');
      const base=resolve(projectRoot,'dist'),path=resolve(base,'.'+decodeURIComponent(url.pathname));
      if(path!==base&&!path.startsWith(base+sep))throw new ApiError(404,'Not found.');
      const filename=['/owner','/owner/','/admin/fleet','/admin/fleet/','/','/admin','/admin/','/account','/account/','/reset-password','/reset-password/'].includes(url.pathname)?resolve(base,'index.html'):path;
      let file;try{file=await readFile(filename);}catch{throw new ApiError(404,'Page not found.');}
      const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff'};
      res.writeHead(200,{'Content-Type':types[extname(filename)]||'application/octet-stream','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Cache-Control':extname(filename)==='.html'?'no-cache':'public, max-age=3600'});res.end(req.method==='HEAD'?undefined:file);
    } catch(error) { if(!res.headersSent)send(error instanceof ApiError?error.status:repo.kind==='mongodb'&&error.name?.startsWith('Mongo')?503:500,{error:!(error instanceof ApiError)||error.status>=500?'Something went wrong. Please try again later.':error.status===403?'This request could not be completed. Refresh the page and try again.':error.message,...(error instanceof ApiError&&error.status===409&&Array.isArray(error.details.bookedSeats)?{bookedSeats:error.details.bookedSeats.filter(seat=>typeof seat==='string'&&/^\d{2}$/.test(seat))}:{})}); }
  });
  server.requestTimeout=60000;
  return server;
}
