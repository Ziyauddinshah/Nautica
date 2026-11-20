import { randomBytes,randomUUID,scryptSync,timingSafeEqual } from 'node:crypto';
import { ApiError,digest } from './store.js';
import { localDate } from '../src/domain/booking.js';
import { bookingView } from './views.js';
import { notificationsFor } from './email.js';

export function initUsers(db){
 db.exec(`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE COLLATE NOCASE,name TEXT NOT NULL,phone TEXT NOT NULL,salt TEXT NOT NULL,hash TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS user_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS password_resets(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0);`);
 const columns=db.prepare('PRAGMA table_info(bookings)').all();
 if(!columns.some(column=>column.name==='user_id'))db.exec('ALTER TABLE bookings ADD COLUMN user_id TEXT REFERENCES users(id)');
 db.exec('CREATE INDEX IF NOT EXISTS bookings_owner ON bookings(user_id,created_at)');
}
import {publicUser,profile,passwordValid,passwordMatches} from './domain/accounts.js';
export {publicUser} from './domain/accounts.js';
function newSession(db,user){
 const token=randomBytes(32).toString('hex');
 db.prepare('DELETE FROM user_sessions WHERE expires<=?').run(Date.now());
 db.prepare('INSERT INTO user_sessions VALUES(?,?,?)').run(digest(token),user.id,Date.now()+8*60*60*1000);
 return {token,user:publicUser(user)};
}
export function registerUser(db,input){
 const fields=profile(input);
 if(!passwordValid(input.password))throw new ApiError(400,'Choose a password between 12 and 256 characters.');
 if(db.prepare('SELECT id FROM users WHERE email=?').get(fields.email))throw new ApiError(409,'Unable to create an account with those details. Try signing in instead.');
 const salt=randomBytes(16).toString('hex'),hash=scryptSync(input.password,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024}).toString('hex');
 const user={...fields,id:randomUUID(),salt,hash,created_at:new Date().toISOString()};
 db.exec('BEGIN IMMEDIATE');
 try{db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?)').run(user.id,user.email,user.name,user.phone,user.salt,user.hash,user.created_at);const session=newSession(db,user);db.exec('COMMIT');return session;}
 catch(error){db.exec('ROLLBACK');if(error.errcode===2067)throw new ApiError(409,'Unable to create an account with those details. Try signing in instead.');throw error;}
}
export function loginUser(db,input){
 if(!input||typeof input.email!=='string'||typeof input.password!=='string'||input.email.length>150||input.password.length>256)throw new ApiError(400,'Enter a valid email and password.');
 const user=db.prepare('SELECT * FROM users WHERE email=?').get(input.email.trim().toLowerCase());
 if(!passwordMatches(user,input.password))throw new ApiError(401,'Invalid email or password.');
 return newSession(db,user);
}
export function authenticateUser(db,token){
 if(!token||!/^[a-f0-9]{64}$/.test(token))throw new ApiError(401,'Sign in to access your account and book seats.');
 const row=db.prepare('SELECT users.* FROM users JOIN user_sessions ON users.id=user_sessions.user_id WHERE user_sessions.token_hash=? AND user_sessions.expires>?').get(digest(token),Date.now());
 if(!row)throw new ApiError(401,'Your session has expired. Please sign in again.');
 return publicUser(row);
}
export function changeUserPassword(db,userId,input){
 if(!input||typeof input.currentPassword!=='string'||input.currentPassword.length>256||!passwordValid(input.newPassword))throw new ApiError(400,'Enter your current password and a new password of 12–256 characters.');
 const row=db.prepare('SELECT * FROM users WHERE id=?').get(userId);
 if(!passwordMatches(row,input.currentPassword))throw new ApiError(401,'Current password is incorrect.');
 if(input.currentPassword===input.newPassword)throw new ApiError(400,'Choose a different new password.');
 const salt=randomBytes(16).toString('hex'),hash=scryptSync(input.newPassword,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024}).toString('hex');
 db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE users SET salt=?,hash=? WHERE id=?').run(salt,hash,userId);db.prepare('DELETE FROM user_sessions WHERE user_id=?').run(userId);db.prepare('UPDATE password_resets SET used=1 WHERE user_id=?').run(userId);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
}
export function userBookings(db,userId,query={}){
 const offset=Math.max(0,Math.min(1000000,parseInt(query.offset)||0));
 const total=db.prepare('SELECT count(*) AS n FROM bookings WHERE user_id=?').get(userId).n;
 const upcoming=db.prepare("SELECT count(*) AS n FROM bookings WHERE user_id=? AND date>=?").get(userId,localDate()).n;
 const rows=db.prepare('SELECT record FROM bookings WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET ?').all(userId,offset);
 const payments=db.prepare("SELECT id,amount,'INR' AS currency,CASE WHEN status='refund_required' THEN 'refund_required' ELSE 'pending' END AS status,payment_id AS reference FROM payment_attempts WHERE user_id=? AND status<>'paid' AND (expires>? OR status='refund_required') ORDER BY expires DESC LIMIT 50").all(userId,Date.now());
 return {bookings:rows.map(row=>ownRecord(db,JSON.parse(row.record))),payments,total,upcoming,offset,limit:50};
}
function ownRecord(db,record){
 return bookingView(record,{notifications:notificationsFor(db,record.id)});
}
export function userBooking(db,userId,id){
 const row=db.prepare('SELECT record FROM bookings WHERE id=? AND user_id=?').get(id,userId);
 if(!row)throw new ApiError(404,'Booking not found.');
 return ownRecord(db,JSON.parse(row.record));
}

export function requestPasswordReset(db,input,{enabled=false,siteOrigin='',now=Date.now()}={}){
 const email=typeof input?.email==='string'?input.email.trim().toLowerCase():'';
 if(email.length>150||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))throw new ApiError(400,'Enter a valid email address.');
 if(!enabled||!siteOrigin)return null;
 const user=db.prepare('SELECT id,email,name FROM users WHERE email=?').get(email);
 if(!user)return null;
 const token=randomBytes(32).toString('hex'),expires=now+15*60*1000;
 db.prepare('DELETE FROM password_resets WHERE expires<=? OR used=1').run(now);
 db.prepare('INSERT INTO password_resets(token_hash,user_id,expires) VALUES(?,?,?)').run(digest(token),user.id,expires);
 const url=new URL('/reset-password',siteOrigin);url.hash='token='+token;
 return {user,token,link:url.href,expires};
}
export function resetUserPassword(db,input,now=Date.now()){
 const invalid=()=>new ApiError(400,'This reset link is invalid or expired. Request a new one.');
 if(!input||typeof input.token!=='string'||!/^[a-f0-9]{64}$/.test(input.token))throw invalid();
 if(!passwordValid(input.newPassword))throw new ApiError(400,'Choose a password between 12 and 256 characters.');
 const tokenHash=digest(input.token);
 const reset=db.prepare('SELECT user_id FROM password_resets WHERE token_hash=? AND used=0 AND expires>?').get(tokenHash,now);
 if(!reset)throw invalid();
 const salt=randomBytes(16).toString('hex'),hash=scryptSync(input.newPassword,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024}).toString('hex');
 db.exec('BEGIN IMMEDIATE');
 try{
  const fresh=db.prepare('SELECT user_id FROM password_resets WHERE token_hash=? AND used=0 AND expires>?').get(tokenHash,Math.max(now,Date.now()));
  if(!fresh)throw invalid();
  db.prepare('UPDATE users SET salt=?,hash=? WHERE id=?').run(salt,hash,fresh.user_id);
  db.prepare('UPDATE password_resets SET used=1 WHERE user_id=?').run(fresh.user_id);
  db.prepare('DELETE FROM user_sessions WHERE user_id=?').run(fresh.user_id);
  db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error;}
}
