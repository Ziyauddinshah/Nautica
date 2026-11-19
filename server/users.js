import { randomBytes,randomUUID,scryptSync,timingSafeEqual } from 'node:crypto';
import { ApiError,digest } from './store.js';
import { localDate } from '../src/domain/booking.js';
import { notificationsFor } from './email.js';

export function initUsers(db){
 db.exec(`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE COLLATE NOCASE,name TEXT NOT NULL,phone TEXT NOT NULL,salt TEXT NOT NULL,hash TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS user_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);`);
 const columns=db.prepare('PRAGMA table_info(bookings)').all();
 if(!columns.some(column=>column.name==='user_id'))db.exec('ALTER TABLE bookings ADD COLUMN user_id TEXT REFERENCES users(id)');
 db.exec('CREATE INDEX IF NOT EXISTS bookings_owner ON bookings(user_id,created_at)');
}
export function publicUser(row){return {id:row.id,name:row.name,email:row.email,phone:row.phone,createdAt:row.created_at};}
function profile(input){
 if(!input||typeof input!=='object')throw new ApiError(400,'Enter valid account details.');
 const name=typeof input.name==='string'?input.name.trim():'';
 const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';
 const phone=typeof input.phone==='string'?input.phone.trim():'';
 if(name.length<2||name.length>80||email.length>150||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)||!/^\+?[\d ()-]{7,25}$/.test(phone)||phone.replace(/\D/g,'').length<7||phone.replace(/\D/g,'').length>15)throw new ApiError(400,'Enter a valid name, email and phone number.');
 return {name,email,phone};
}
function passwordValid(password){return typeof password==='string'&&password.length>=12&&password.length<=256;}
function passwordMatches(row,password){
 const candidate=scryptSync(password,row?.salt||'nautica-user-dummy-salt',64,{N:32768,r:8,p:3,maxmem:64*1024*1024});
 return !!row&&timingSafeEqual(candidate,Buffer.from(row.hash,'hex'));
}
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
 db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE users SET salt=?,hash=? WHERE id=?').run(salt,hash,userId);db.prepare('DELETE FROM user_sessions WHERE user_id=?').run(userId);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
}
export function userBookings(db,userId,query={}){
 const offset=Math.max(0,Math.min(1000000,parseInt(query.offset)||0));
 const total=db.prepare('SELECT count(*) AS n FROM bookings WHERE user_id=?').get(userId).n;
 const upcoming=db.prepare("SELECT count(*) AS n FROM bookings WHERE user_id=? AND date>=?").get(userId,localDate()).n;
 const rows=db.prepare('SELECT record FROM bookings WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET ?').all(userId,offset);
 return {bookings:rows.map(row=>ownRecord(db,JSON.parse(row.record))),total,upcoming,offset,limit:50};
}
function ownRecord(db,record){
 return {id:record.id,status:record.status,createdAt:record.createdAt,customer:{...record.customer},boat:record.boat,trip:record.trip,extras:record.extras,pricing:record.pricing,payment:record.payment,pass:record.pass,notifications:notificationsFor(db,record.id).filter(job=>job.audience==='customer')};
}
export function userBooking(db,userId,id){
 const row=db.prepare('SELECT record FROM bookings WHERE id=? AND user_id=?').get(id,userId);
 if(!row)throw new ApiError(404,'Booking not found.');
 return ownRecord(db,JSON.parse(row.record));
}
