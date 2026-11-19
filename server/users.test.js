import { test,after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openStore,createBooking,setAdmin } from './store.js';
import { createApp } from './app.js';
import * as N from '../src/domain/booking.js';
const resources=[];after(()=>{for(const close of resources.reverse())close();});
const account=(email='one@example.test')=>({email,name:'Customer One',phone:'+919876543210',password:'unique-test-passphrase'});
const booking=(patch={})=>{const d=new Date();d.setDate(d.getDate()+1);return {boatId:'b1',date:N.localDate(d),slot:N.slots[0],guests:1,seats:['01'],name:'Lead Guest',email:'spoofed@example.test',phone:'+919876543210',extras:['safety'],payment:{type:'upi',provider:'GPay'},requestKey:randomUUID(),...patch};};
async function setup(options={}){
 const db=openStore(':memory:'),server=createApp(db,options);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 resources.push(()=>{server.closeAllConnections();server.close();db.close();});
 const call=async(path,{body,cookie,method=body?'POST':'GET',origin=base}={})=>{const res=await fetch(base+path,{method,headers:{...(body?{'Content-Type':'application/json','X-Nautica-Request':'1',Origin:origin}:{}),...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0],headers:res.headers};};return {db,call};
}
test('registration hashes passwords and issues an HttpOnly user session without exposing credential data',async()=>{
 const {db,call}=await setup();const registered=await call('/api/user/register',{body:account()});assert.equal(registered.status,201);assert.equal(registered.data.user.email,'one@example.test');assert.match(registered.headers.get('set-cookie'),/HttpOnly/);assert.match(registered.headers.get('set-cookie'),/SameSite=Strict/);assert.ok(!JSON.stringify(registered.data).includes('hash'));assert.ok(!JSON.stringify(registered.data).includes(account().password));const row=db.prepare('SELECT * FROM users').get();assert.notEqual(row.hash,account().password);assert.equal(row.salt.length,32);assert.ok(!db.prepare('SELECT token_hash FROM user_sessions').get().token_hash.includes(registered.cookie.split('=')[1]));assert.equal((await call('/api/user/session',{cookie:registered.cookie})).status,200);
});
test('guest booking and private history require login',async()=>{
 const {call}=await setup();assert.equal((await call('/api/bookings',{body:booking()})).status,401);assert.equal((await call('/api/user/bookings')).status,401);assert.equal((await call('/api/user/session')).status,401);
});
test('customers see only their own booking and payment histories; another booking id returns 404',async()=>{
 const {call}=await setup();const one=await call('/api/user/register',{body:account()}),two=await call('/api/user/register',{body:account('two@example.test')});
 const first=await call('/api/bookings',{body:booking(),cookie:one.cookie}),second=await call('/api/bookings',{body:booking({seats:['02']}),cookie:two.cookie});
 assert.equal(first.status,201);assert.equal(second.status,201);
 const own=await call('/api/user/bookings',{cookie:one.cookie});assert.equal(own.data.total,1);assert.equal(own.data.bookings[0].id,first.data.booking.id);assert.equal(own.data.bookings[0].customer.email,'one@example.test');assert.equal(own.data.bookings[0].payment.status,'demo_paid');assert.equal(own.data.bookings[0].notifications.length,1);assert.equal(own.data.bookings[0].notifications[0].audience,'customer');assert.ok(!JSON.stringify(own.data).includes('two@example.test'));
 assert.equal((await call('/api/user/bookings/'+second.data.booking.id,{cookie:one.cookie})).status,404);
 assert.equal((await call('/api/user/bookings/'+first.data.booking.id,{cookie:one.cookie})).status,200);
 const forged=await call('/api/user/bookings?userId='+two.data.user.id,{cookie:one.cookie});assert.equal(forged.data.bookings[0].id,first.data.booking.id);
});
test('body owner/email impersonation and cross-account idempotency reuse cannot expose or take a booking',async()=>{
 const {db,call}=await setup();const one=await call('/api/user/register',{body:account()}),two=await call('/api/user/register',{body:account('two@example.test')}),body=booking({userId:two.data.user.id});
 const created=await call('/api/bookings',{body,cookie:one.cookie});assert.equal(db.prepare('SELECT user_id FROM bookings').get().user_id,one.data.user.id);
 assert.equal((await call('/api/bookings',{body,cookie:two.cookie})).status,409);assert.equal((await call('/api/user/bookings',{cookie:two.cookie})).data.total,0);
 assert.equal((await call('/api/bookings',{body,cookie:one.cookie})).data.booking.id,created.data.booking.id);
});
test('registration never grants access to historical guest bookings with matching email',async()=>{
 const {db,call}=await setup();createBooking(db,booking({email:'one@example.test'}));const customer=await call('/api/user/register',{body:account()});assert.equal((await call('/api/user/bookings',{cookie:customer.cookie})).data.total,0);
});
test('logout revokes tokens, expired sessions fail, and admin and user roles remain separate',async()=>{
 const {db,call}=await setup(),user=await call('/api/user/register',{body:account()});setAdmin(db,'admin','admin-test-password');
 assert.equal((await call('/api/admin/bookings',{cookie:user.cookie})).status,401);
 const admin=await call('/api/admin/login',{body:{username:'admin',password:'admin-test-password'}});assert.equal((await call('/api/user/bookings',{cookie:admin.cookie})).status,401);
 await call('/api/user/logout',{body:{},cookie:user.cookie});assert.equal((await call('/api/user/session',{cookie:user.cookie})).status,401);
 const again=await call('/api/user/login',{body:{email:account().email,password:account().password}});db.prepare('UPDATE user_sessions SET expires=1').run();assert.equal((await call('/api/user/bookings',{cookie:again.cookie})).status,401);
});
test('password change checks the old password and revokes every device session',async()=>{
 const {call}=await setup(),first=await call('/api/user/register',{body:account()}),second=await call('/api/user/login',{body:account()});
 assert.equal((await call('/api/user/password',{body:{currentPassword:'wrong',newPassword:'new-test-passphrase'},cookie:first.cookie})).status,401);
 const changed=await call('/api/user/password',{body:{currentPassword:account().password,newPassword:'new-test-passphrase'},cookie:first.cookie});assert.equal(changed.status,200);assert.match(changed.headers.get('set-cookie'),/Max-Age=0/);
 assert.equal((await call('/api/user/session',{cookie:first.cookie})).status,401);assert.equal((await call('/api/user/session',{cookie:second.cookie})).status,401);
 assert.equal((await call('/api/user/login',{body:account()})).status,401);assert.equal((await call('/api/user/login',{body:{email:account().email,password:'new-test-passphrase'}})).status,200);
});
test('weak passwords, duplicate emails, cross-site auth writes and brute force are rejected',async()=>{
 const {call}=await setup();assert.equal((await call('/api/user/register',{body:{...account(),password:'short'}})).status,400);
 assert.equal((await call('/api/user/register',{body:account(),origin:'https://evil.example'})).status,403);
 await call('/api/user/register',{body:account()});assert.equal((await call('/api/user/register',{body:account()})).status,409);
 for(let i=0;i<15;i++)assert.equal((await call('/api/user/login',{body:{email:account().email,password:'wrong'}})).status,401);
 assert.equal((await call('/api/user/login',{body:account()})).status,429);
});
test('production customer cookies require HTTPS',async()=>{
 const {call}=await setup({production:true});const registered=await call('/api/user/register',{body:account()});assert.match(registered.headers.get('set-cookie'),/; Secure/);
});
test('upgrading the older booking schema preserves reservations without assigning ownership by email',async()=>{
 const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {DatabaseSync}=await import('node:sqlite');
 const folder=mkdtempSync(join(tmpdir(),'nautica-user-upgrade-')),filename=join(folder,'legacy.sqlite');
 const source=openStore(':memory:'),body=booking({email:'one@example.test'});createBooking(source,body);const legacy=source.prepare('SELECT id,request_key,request_hash,boat_id,date,slot,created_at,record FROM bookings').get();source.close();
 let db=new DatabaseSync(filename);db.exec('CREATE TABLE bookings(id TEXT PRIMARY KEY,request_key TEXT UNIQUE NOT NULL,request_hash TEXT NOT NULL,boat_id TEXT NOT NULL,date TEXT NOT NULL,slot TEXT NOT NULL,created_at TEXT NOT NULL,record TEXT NOT NULL)');db.prepare('INSERT INTO bookings VALUES(?,?,?,?,?,?,?,?)').run(...Object.values(legacy));db.close();
 db=openStore(filename);const {initUsers,registerUser,userBookings}=await import('./users.js');initUsers(db);const registered=registerUser(db,account());assert.equal(db.prepare('SELECT record FROM bookings').get().record,legacy.record);assert.equal(db.prepare('SELECT user_id FROM bookings').get().user_id,null);assert.equal(userBookings(db,registered.user.id).total,0);db.close();rmSync(folder,{recursive:true,force:true});
});
