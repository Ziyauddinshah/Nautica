import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { initUsers,registerUser,loginUser,authenticateUser,changeUserPassword,userBookings,userBooking } from './users.js';
import { notificationsFor } from './email.js';
import { ApiError, availability, createBooking, login, authenticate, adminBookings, digest } from './store.js';

export function createApp(db, { mode = 'seats', production = false, publicOrigin = '', emailService = null } = {}) {
  initUsers(db);
  const attempts = new Map(),userAttempts=new Map();
  function userToken(req){return (req.headers.cookie||'').split(';').map(value=>value.trim()).find(value=>value.startsWith('nautica_user='))?.slice(13);}
  function userCookie(value,maxAge=28800){return `nautica_user=${value}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${maxAge}${production?'; Secure':''}`;}
  function throttle(req,category,identifier=''){const now=Date.now();for(const [key,value]of userAttempts)if(value.until<=now)userAttempts.delete(key);if(userAttempts.size>10000)throw new ApiError(429,'Please try again later.');const keys=[category+':ip:'+req.socket.remoteAddress,...(identifier?[category+':account:'+digest(identifier)]:[])];for(const key of keys){const value=userAttempts.get(key)||{count:0,until:now+900000};if(value.count>= (category==='register'?10:15))throw new ApiError(429,'Too many attempts. Try again after 15 minutes.');value.count++;userAttempts.set(key,value);}}
  function token(req) { return (req.headers.cookie || '').split(';').map(v=>v.trim()).find(v=>v.startsWith('nautica_admin='))?.slice(14); }
  function cookie(value, maxAge=28800) {return `nautica_admin=${value}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=${maxAge}${production?'; Secure':''}`;}
  const server = http.createServer(async (req,res) => {
    const send=(status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'same-origin',...headers});res.end(JSON.stringify(data));};
    try {
      const url=new URL(req.url,'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        if (req.method === 'POST') {
          const origin=req.headers.origin;
          const allowed = origin && (origin === publicOrigin || origin === `http://${req.headers.host}` || (production && origin === `https://${req.headers.host}`) || (!production && ['http://localhost:3000','http://127.0.0.1:3000'].includes(origin)));
          if (!allowed || req.headers['x-nautica-request'] !== '1' || !req.headers['content-type']?.startsWith('application/json')) throw new ApiError(403,'Request origin could not be verified.');
        }
        const body = async () => {
          let data='';for await (const chunk of req){data+=chunk;if(Buffer.byteLength(data)>16384)throw new ApiError(413,'Request is too large.');}
          try{return JSON.parse(data);}catch{throw new ApiError(400,'Invalid JSON request.');}
        };
        if(req.method==='GET'&&url.pathname==='/api/health')return send(200,{ok:true});
        if(req.method==='GET'&&url.pathname==='/api/availability')return send(200,{...availability(db,Object.fromEntries(url.searchParams)),mode});
        if(req.method==='POST'&&url.pathname==='/api/bookings'){const user=authenticateUser(db,userToken(req));const input=await body();if(!input||typeof input!=='object')throw new ApiError(400,'Invalid booking request.');const booking=createBooking(db,{...input,email:user.email},mode,user);emailService?.kick();return send(201,{booking});}
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
          const key=req.socket.remoteAddress,now=Date.now();
          for(const [key,value]of attempts)if(now-value.since>900000)attempts.delete(key);
          const attempt=attempts.get(key)||{since:now,count:0};if(attempt.count>=5)throw new ApiError(429,'Too many sign-in attempts. Try again after 15 minutes.');
          const input=await body();
          if(!input||typeof input!=='object'||typeof input.username!=='string'||typeof input.password!=='string'||input.username.length>80||input.password.length>256)throw new ApiError(400,'Invalid sign-in fields.');
          try{const result=login(db,input.username,input.password);attempts.delete(key);return send(200,{username:result.username},{'Set-Cookie':cookie(result.token)});}
          catch(error){attempt.count++;attempts.set(key,attempt);throw error;}
        }
        if(url.pathname.startsWith('/api/admin/')){
          const username=authenticate(db,token(req));
          if(req.method==='GET'&&url.pathname==='/api/admin/session')return send(200,{username});
          if(req.method==='GET'&&url.pathname==='/api/admin/bookings'){const data=adminBookings(db,Object.fromEntries(url.searchParams));return send(200,{...data,bookings:data.bookings.map(record=>({...record,notifications:notificationsFor(db,record.id)})),emailService:emailService?.status()||{configured:false,reason:'Gmail SMTP is not configured.'}});}
          const retryMatch=url.pathname.match(/^\/api\/admin\/bookings\/(NTC-[A-F0-9]{12})\/emails\/retry$/);
          if(req.method==='POST'&&retryMatch){if(!emailService?.status().configured)throw new ApiError(503,'Configure Gmail SMTP on the server before retrying email.');if(!db.prepare('SELECT id FROM bookings WHERE id=?').get(retryMatch[1]))throw new ApiError(404,'Booking not found.');emailService.retry(retryMatch[1]);return send(200,{ok:true});}
          if(req.method==='POST'&&url.pathname==='/api/admin/logout'){db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token(req)));return send(200,{ok:true},{'Set-Cookie':cookie('',0)});}
        }
        throw new ApiError(404,'Endpoint not found.');
      }
      if(!['GET','HEAD'].includes(req.method))throw new ApiError(405,'Method not allowed.');
      const base=resolve('dist'),path=resolve(base,'.'+decodeURIComponent(url.pathname));
      if(path!==base&&!path.startsWith(base+sep))throw new ApiError(404,'Not found.');
      const filename=['/','/admin','/admin/','/account','/account/'].includes(url.pathname)?resolve(base,'index.html'):path;
      let file;try{file=await readFile(filename);}catch{throw new ApiError(404,'Run npm run build to serve the frontend.');}
      const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
      res.writeHead(200,{'Content-Type':types[extname(filename)]||'application/octet-stream','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'same-origin','Cache-Control':extname(filename)==='.html'?'no-cache':'public, max-age=3600'});res.end(req.method==='HEAD'?undefined:file);
    } catch(error) { if(!res.headersSent)send(error instanceof ApiError?error.status:500,{error:error instanceof ApiError?error.message:'The server could not complete this request.',...(error instanceof ApiError?error.details:{})}); }
  });
  server.requestTimeout=15000;
  return server;
}
