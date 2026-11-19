import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openStore, setAdmin, availability, createBooking } from './store.js';
import { registerUser } from './users.js';
import { createApp } from './app.js';
import * as N from '../src/domain/booking.js';

const date=()=>{const d=new Date();d.setDate(d.getDate()+2);return N.localDate(d);};
const input=(patch={})=>({boatId:'b1',date:date(),slot:N.slots[0],guests:2,seats:['01','02'],name:'Guest One',email:'guest@example.com',phone:'+919876543210',extras:['safety'],payment:{type:'upi',provider:'GPay'},requestKey:randomUUID(),...patch});
const resources=[];
after(()=>{for(const cleanup of resources.reverse())cleanup();});
async function fixture(options={}){
 const db=openStore(':memory:');setAdmin(db,'admin','a-long-test-password');
 const server=createApp(db,options);const customer=registerUser(db,{name:'Guest One',email:'guest@example.com',phone:'+919876543210',password:'customer-test-password'});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 resources.push(()=>{server.closeAllConnections();server.close();db.close();});
 const call=async(path,{method='GET',body,cookie,origin=base}={})=>{
  const response=await fetch(base+path,{method,headers:{...(body?{'Content-Type':'application/json','X-Nautica-Request':'1',Origin:origin}:{}),...{Cookie:cookie||'nautica_user='+customer.token}},body:body?JSON.stringify(body):undefined});
  return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0],headers:response.headers};
 };
 return {db,server,call,base};
}
test('confirmation reserves only chosen seats for the matching boat/date/time',async()=>{
 const {call}=await fixture(),body=input();
 const created=await call('/api/bookings',{method:'POST',body});assert.equal(created.status,201);assert.deepEqual(created.data.booking.seats,['01','02']);assert.equal(created.data.booking.total,126000);assert.equal(created.data.booking.email,undefined);
 const query=new URLSearchParams({boatId:'b1',date:body.date,slot:body.slot});
 const result=await call('/api/availability?'+query);assert.deepEqual(result.data.bookedSeats,['01','02']);assert.equal(result.data.remaining,4);assert.ok(!JSON.stringify(result.data).includes('Guest One'));
 query.set('slot',N.slots[1]);assert.deepEqual((await call('/api/availability?'+query)).data.bookedSeats,[]);
});
test('simultaneous overlapping requests result in one success and one conflict',async()=>{
 const {call}=await fixture();const results=await Promise.all([call('/api/bookings',{method:'POST',body:input()}),call('/api/bookings',{method:'POST',body:input()})]);
 assert.deepEqual(results.map(result=>result.status).sort(),[201,409]);assert.deepEqual(results.find(result=>result.status===409).data.bookedSeats,['01','02']);
});
test('idempotent retry returns same booking; changed payload cannot reuse its key',async()=>{
 const {call}=await fixture(),body=input();
 const a=await call('/api/bookings',{method:'POST',body}),b=await call('/api/bookings',{method:'POST',body});assert.equal(a.data.booking.id,b.data.booking.id);
 const changed=await call('/api/bookings',{method:'POST',body:{...body,name:'Other Guest'}});assert.equal(changed.status,409);
});
test('server recalculates totals and rejects invalid seats, contact details and dates',async()=>{
 const {call}=await fixture();
 for(const body of [input({seats:['01','01']}),input({seats:['01','99']}),input({phone:'12'}),input({date:'2027-02-30'}),input({date:'2020-01-01'})])assert.equal((await call('/api/bookings',{method:'POST',body})).status,400);
 const created=await call('/api/bookings',{method:'POST',body:input({total:1,payment:{type:'card',network:'VISA',last4:'4242',number:'4242424242424242',cvv:'123'}})});assert.equal(created.data.booking.total,126000);assert.equal(created.data.booking.method,'VISA · 4242');
});
test('admin records require authentication; login exposes full summaries without raw card data',async()=>{
 const {call}=await fixture();assert.equal((await call('/api/admin/bookings')).status,401);
 await call('/api/bookings',{method:'POST',body:input({payment:{type:'card',network:'VISA',last4:'4242',number:'4242424242424242',cvv:'123'}})});
 const signed=await call('/api/admin/login',{method:'POST',body:{username:'admin',password:'a-long-test-password'}});assert.equal(signed.status,200);assert.match(signed.headers.get('set-cookie'),/HttpOnly/);assert.match(signed.headers.get('set-cookie'),/SameSite=Strict/);
 const listed=await call('/api/admin/bookings',{cookie:signed.cookie});assert.equal(listed.status,200);assert.equal(listed.data.total,1);const record=listed.data.bookings[0];assert.equal(record.customer.email,'guest@example.com');assert.equal(record.boat.name,'Ganges Dawn');assert.deepEqual(record.trip.seats,['01','02']);assert.equal(record.payment.status,'demo_paid');assert.match(record.payment.reference,/^DEMO-/);assert.ok(!JSON.stringify(record).includes('4242424242424242'));assert.ok(!('cvv'in record.payment));
 assert.equal((await call('/api/admin/bookings?q=unmatched',{cookie:signed.cookie})).data.total,0);
 await call('/api/admin/logout',{method:'POST',body:{},cookie:signed.cookie});assert.equal((await call('/api/admin/session',{cookie:signed.cookie})).status,401);
});
test('cross-origin writes, forged sessions and repeated wrong passwords are rejected',async()=>{
 const {call}=await fixture();assert.equal((await call('/api/bookings',{method:'POST',body:input(),origin:'https://evil.example'})).status,403);
 assert.equal((await call('/api/admin/bookings',{cookie:'nautica_admin=forged'})).status,401);
 for(let i=0;i<5;i++)assert.equal((await call('/api/admin/login',{method:'POST',body:{username:'admin',password:'wrong'}})).status,401);
 assert.equal((await call('/api/admin/login',{method:'POST',body:{username:'admin',password:'a-long-test-password'}})).status,429);
});
test('seat reservations and bookings persist when SQLite is reopened',()=>{
 const directory=mkdtempSync(join(tmpdir(),'nautica-')),path=join(directory,'bookings.sqlite');let db=openStore(path);const body=input();createBooking(db,body);db.close();db=openStore(path);assert.deepEqual(availability(db,body).bookedSeats,['01','02']);db.close();rmSync(directory,{recursive:true,force:true});
});
test('private booking mode atomically blocks the entire boat when configured',()=>{
 const db=openStore(':memory:');const body=input();createBooking(db,body,'private');assert.equal(availability(db,body).bookedSeats.length,6);assert.throws(()=>createBooking(db,input({seats:['03','04']}),'private'),error=>error.status===409);db.close();
});
test('admin setup CLI creates an account without embedding a default credential',async()=>{
 const { execFileSync }=await import('node:child_process');
 const directory=mkdtempSync(join(tmpdir(),'nautica-admin-')),filename=join(directory,'admin.sqlite');
 const password='Test-only-'+randomUUID();
 const output=execFileSync(process.execPath,['scripts/admin-create.js'],{cwd:process.cwd(),env:{...process.env,NAUTICA_DB:filename,NAUTICA_ADMIN_USER:'setup-admin',NAUTICA_ADMIN_PASSWORD:password},encoding:'utf8'});
 assert.match(output,/setup-admin is ready/);assert.ok(!output.includes(password));
 const db=openStore(filename);assert.ok(db.prepare('SELECT username FROM admins WHERE username=?').get('setup-admin'));assert.equal(db.prepare('SELECT hash FROM admins').get().hash.includes(password),false);db.close();rmSync(directory,{recursive:true,force:true});
});

test('email retry requires admin authentication and never resets already-sent messages',async()=>{
 let kicked=0;
 const emailService={status:()=>({configured:true,adminRecipient:'admin@example.test'}),kick:()=>{kicked++;},retry:()=>{kicked++;}};
 const {call,db}=await fixture({emailService});const created=await call('/api/bookings',{method:'POST',body:input()});assert.equal(kicked,1);
 const endpoint=`/api/admin/bookings/${created.data.booking.id}/emails/retry`;
 assert.equal((await call(endpoint,{method:'POST',body:{}})).status,401);
 const signed=await call('/api/admin/login',{method:'POST',body:{username:'admin',password:'a-long-test-password'}});
 assert.equal((await call(endpoint,{method:'POST',body:{},cookie:signed.cookie})).status,200);assert.equal(kicked,2);
 const listed=await call('/api/admin/bookings',{cookie:signed.cookie});assert.equal(listed.data.bookings[0].notifications.length,2);assert.equal(listed.data.emailService.configured,true);
});
test('production requires the configured HTTPS origin and disables demo bookings',async()=>{
 const {call,base}=await fixture({production:true,publicOrigin:'https://nautica.example.test'});
 assert.equal((await call('/api/user/register',{method:'POST',body:{},origin:base})).status,403);
 assert.equal((await call('/api/bookings',{method:'POST',body:input(),origin:'https://nautica.example.test'})).status,503);
 const config=await call('/api/payments/config');assert.deepEqual(config.data,{mode:'disabled',enabled:false});
 const health=await call('/api/health');assert.equal(health.status,200);assert.match(health.headers.get('content-security-policy'),/object-src 'none'/);assert.equal(health.headers.get('strict-transport-security'),'max-age=31536000');assert.equal(health.headers.get('referrer-policy'),'no-referrer');
});
