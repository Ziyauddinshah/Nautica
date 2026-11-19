import http from 'node:http';
import {isIP} from 'node:net';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { initUsers,registerUser,loginUser,authenticateUser,changeUserPassword,userBookings,userBooking,requestPasswordReset,resetUserPassword } from './users.js';
import { passView,bookingView,emailServiceView } from './views.js';
import { notificationsFor } from './email.js';
import { ApiError, availability, createBooking, login, authenticate, adminBookings, digest } from './store.js';

export function createApp(db, { mode = 'seats', production = false, publicOrigin = '', emailService = null, paymentMode = production?'disabled':'demo', payments = null, trustedProxyIPs = [] } = {}) {
  initUsers(db);
  const attempts = new Map(),userAttempts=new Map();
  function clientIP(req){const peer=req.socket.remoteAddress;if(!trustedProxyIPs.includes(peer))return peer;const forwarded=req.headers['x-forwarded-for']?.split(',').at(-1)?.trim();return forwarded&&isIP(forwarded)?forwarded:peer;}
  function userToken(req){return (req.headers.cookie||'').split(';').map(value=>value.trim()).find(value=>value.startsWith('nautica_user='))?.slice(13);}
  function userCookie(value,maxAge=28800){return `nautica_user=${value}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${maxAge}${production?'; Secure':''}`;}
  function throttle(req,category,identifier=''){const now=Date.now();for(const [key,value]of userAttempts)if(value.until<=now)userAttempts.delete(key);if(userAttempts.size>10000)throw new ApiError(429,'Please try again later.');const keys=[category+':ip:'+clientIP(req),...(identifier?[category+':account:'+digest(identifier)]:[])];for(const key of keys){const value=userAttempts.get(key)||{count:0,until:now+900000};if(value.count>= (category==='forgot'?(key.includes(':account:')?3:5):category==='register'?10:15))throw new ApiError(429,'Too many attempts. Try again after 15 minutes.');value.count++;userAttempts.set(key,value);}}
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
        if(req.method==='POST'&&url.pathname==='/api/payments/razorpay/webhook'){const chunks=[];let size=0;for await(const chunk of req){chunks.push(chunk);size+=chunk.length;if(size>131072)throw new ApiError(413,'Request is too large.');}if(!payments)throw new ApiError(503,'Online booking is currently unavailable.');await payments.webhook(Buffer.concat(chunks),req.headers['x-razorpay-signature']);emailService?.kick();return send(200,{ok:true});}
        if (req.method === 'POST') {
          const origin=req.headers.origin;
          const allowed = origin && (origin === publicOrigin || (!production && origin === `http://${req.headers.host}`) || (!production && ['http://localhost:3000','http://127.0.0.1:3000'].includes(origin)));
          if (!allowed || req.headers['x-nautica-request'] !== '1' || !req.headers['content-type']?.startsWith('application/json')) throw new ApiError(403,'Request origin could not be verified.');
        }
        const body = async () => {
          let data='';for await (const chunk of req){data+=chunk;if(Buffer.byteLength(data)>16384)throw new ApiError(413,'Request is too large.');}
          try{return JSON.parse(data);}catch{throw new ApiError(400,'Invalid JSON request.');}
        };
        if(req.method==='GET'&&url.pathname==='/api/health'){db.prepare('SELECT 1').get();return send(200,{ok:true});}
        if(req.method==='GET'&&url.pathname==='/api/payments/config')return send(200,{mode:paymentMode,enabled:paymentMode==='demo'||(paymentMode==='razorpay'&&Boolean(payments?.enabled))});
        if(req.method==='POST'&&['/api/payments/order','/api/payments/verify'].includes(url.pathname)){const user=authenticateUser(db,userToken(req));if(paymentMode!=='razorpay'||!payments?.enabled)throw new ApiError(503,'Online booking is currently unavailable.');throttle(req,'checkout',user.id);const input=await body();if(!input||typeof input!=='object')throw new ApiError(400,'Invalid booking request.');if(url.pathname.endsWith('/order'))return send(201,await payments.order({...input,language},user));const booking=await payments.verify(input,user);emailService?.kick();return send(200,{booking:passView(booking)});}
        if(req.method==='GET'&&url.pathname==='/api/availability')return send(200,{...availability(db,Object.fromEntries(url.searchParams)),mode});
        if(req.method==='POST'&&url.pathname==='/api/bookings'){if(paymentMode!=='demo'||production)throw new ApiError(503,'Online booking is currently unavailable.');const user=authenticateUser(db,userToken(req));const input=await body();if(!input||typeof input!=='object')throw new ApiError(400,'Invalid booking request.');const booking=createBooking(db,{...input,email:user.email,language},mode,user);emailService?.kick();return send(201,{booking:passView(booking)});}
        if(req.method==='POST'&&url.pathname==='/api/user/forgot-password'){
          const input=await body();throttle(req,'forgot',typeof input?.email==='string'?input.email.trim().toLowerCase().slice(0,150):'');
          const settings=emailService?.status();
          const job=requestPasswordReset(db,input,{enabled:settings?.passwordResetEnabled,siteOrigin:settings?.siteOrigin});
          // Return the same response before SMTP completes, regardless of account existence.
          send(200,{message:'If this email is registered with us, you will receive a password reset link shortly. Check your inbox and spam folder.'});
          if(job)emailService.sendPasswordReset({...job,language});
          return;
        }
        if(req.method==='POST'&&url.pathname==='/api/user/reset-password'){
          throttle(req,'password-reset');resetUserPassword(db,await body());
          return send(200,{ok:true,message:'Password updated. Sign in with your new password.'},{'Set-Cookie':userCookie('',0)});
        }
        if(req.method==='POST'&&['/api/user/register','/api/user/login'].includes(url.pathname)){
          const input=await body(),register=url.pathname.endsWith('/register');
          throttle(req,register?'register':'login',typeof input?.email==='string'?input.email.trim().toLowerCase().slice(0,150):'');
          const result=register?registerUser(db,input):loginUser(db,input);
          return send(register?201:200,{user:result.user},{'Set-Cookie':userCookie(result.token)});
        }
        if(url.pathname.startsWith('/api/user/')){
          const user=authenticateUser(db,userToken(req));
          if(req.method==='GET'&&url.pathname==='/api/user/session')return send(200,{user});
          if(req.method==='GET'&&url.pathname==='/api/user/bookings')return send(200,userBookings(db,user.id,Object.fromEntries(url.searchParams)));
          const bookingMatch=url.pathname.match(/^\/api\/user\/bookings\/(NTC-[A-F0-9]{12})$/);
          if(req.method==='GET'&&bookingMatch)return send(200,{booking:userBooking(db,user.id,bookingMatch[1])});
          if(req.method==='POST'&&url.pathname==='/api/user/logout'){db.prepare('DELETE FROM user_sessions WHERE token_hash=?').run(digest(userToken(req)));return send(200,{ok:true},{'Set-Cookie':userCookie('',0)});}
          if(req.method==='POST'&&url.pathname==='/api/user/password'){throttle(req,'password',user.id);changeUserPassword(db,user.id,await body());return send(200,{ok:true},{'Set-Cookie':userCookie('',0)});}
        }
        if(req.method==='POST'&&url.pathname==='/api/admin/login'){
          const key=clientIP(req),now=Date.now();
          for(const [key,value]of attempts)if(now-value.since>900000)attempts.delete(key);
          const attempt=attempts.get(key)||{since:now,count:0};if(attempt.count>=5)throw new ApiError(429,'Too many sign-in attempts. Try again after 15 minutes.');
          const input=await body();
          if(!input||typeof input!=='object'||typeof input.username!=='string'||typeof input.password!=='string'||input.username.length>80||input.password.length>256)throw new ApiError(400,'Invalid sign-in fields.');
          try{const result=login(db,input.username,input.password);attempts.delete(key);return send(200,{username:result.username},{'Set-Cookie':cookie(result.token)});}
          catch(error){attempt.count++;attempts.set(key,attempt);throw error;}
        }
        if(url.pathname.startsWith('/api/admin/')){
          const username=authenticate(db,token(req));
          if(req.method==='GET'&&url.pathname==='/api/admin/payment-attention')return send(200,{payments:payments?.attention()||[]});
          if(req.method==='GET'&&url.pathname==='/api/admin/session')return send(200,{username});
          if(req.method==='GET'&&url.pathname==='/api/admin/bookings'){const data=adminBookings(db,Object.fromEntries(url.searchParams));return send(200,{...data,paymentAttention:payments?.attention()||[],bookings:data.bookings.map(record=>bookingView(record,{admin:true,notifications:notificationsFor(db,record.id)})),emailService:emailServiceView(emailService)});}
          const retryMatch=url.pathname.match(/^\/api\/admin\/bookings\/(NTC-[A-F0-9]{12})\/emails\/retry$/);
          if(req.method==='POST'&&retryMatch){if(!emailService?.status().configured)throw new ApiError(503,'Configure Gmail SMTP on the server before retrying email.');if(!db.prepare('SELECT id FROM bookings WHERE id=?').get(retryMatch[1]))throw new ApiError(404,'Booking not found.');emailService.retry(retryMatch[1]);return send(200,{ok:true});}
          if(req.method==='POST'&&url.pathname==='/api/admin/logout'){db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token(req)));return send(200,{ok:true},{'Set-Cookie':cookie('',0)});}
        }
        throw new ApiError(404,'Endpoint not found.');
      }
      if(!['GET','HEAD'].includes(req.method))throw new ApiError(405,'Method not allowed.');
      const base=resolve('dist'),path=resolve(base,'.'+decodeURIComponent(url.pathname));
      if(path!==base&&!path.startsWith(base+sep))throw new ApiError(404,'Not found.');
      const filename=['/','/admin','/admin/','/account','/account/','/reset-password','/reset-password/'].includes(url.pathname)?resolve(base,'index.html'):path;
      let file;try{file=await readFile(filename);}catch{throw new ApiError(404,'Page not found.');}
      const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff'};
      res.writeHead(200,{'Content-Type':types[extname(filename)]||'application/octet-stream','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Cache-Control':extname(filename)==='.html'?'no-cache':'public, max-age=3600'});res.end(req.method==='HEAD'?undefined:file);
    } catch(error) { if(!res.headersSent)send(error instanceof ApiError?error.status:500,{error:!(error instanceof ApiError)||error.status>=500?'Something went wrong. Please try again later.':error.status===403?'This request could not be completed. Refresh the page and try again.':error.message,...(error instanceof ApiError&&error.status===409&&Array.isArray(error.details.bookedSeats)?{bookedSeats:error.details.bookedSeats.filter(seat=>typeof seat==='string'&&/^\d{2}$/.test(seat))}:{})}); }
  });
  server.requestTimeout=15000;
  return server;
}
