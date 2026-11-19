import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {openStore,availability,createBooking} from './store.js';
import {initUsers,registerUser} from './users.js';
import {createPayments} from './payments.js';
import {productionConfig} from './config.js';
import {localDate,slots} from '../src/domain/booking.js';
const sign=(text,secret='secret')=>createHmac('sha256',secret).update(text).digest('hex');
function fixture(){
 const db=openStore(':memory:');initUsers(db);
 const user=registerUser(db,{name:'Admin',email:'one@example.test',phone:'+919876543210',password:'a-secure-test-passphrase'}).user;
 const other=registerUser(db,{name:'Two',email:'two@example.test',phone:'+919876543210',password:'another-test-passphrase'}).user;
 const calls=[];let capture=true;
 const payments=createPayments(db,{keyId:'rzp_test_public',keySecret:'secret',webhookSecret:'webhook',transport:async(url,options)=>{
  calls.push({url,options});const body=options.body&&JSON.parse(options.body);
  if(url.endsWith('/orders'))return Response.json({id:'order_'+calls.length,amount:body.amount,currency:body.currency});
  const row=db.prepare('SELECT * FROM payment_attempts WHERE order_id=?').get('order_1');
  return Response.json({id:url.split('/').at(-1),order_id:row.order_id,amount:row.amount,currency:'INR',status:capture?'captured':'authorized'});
 }});
 const input={boatId:'b1',date:localDate(new Date(Date.now()+86400000)),slot:slots[0],guests:1,seats:['01'],name:'Admin',phone:'+919876543210',extras:['safety'],language:'hi',requestKey:randomUUID()};
 return {db,user,other,payments,input,calls,setCapture:value=>{capture=value;}};
}
test('server prices INR orders, holds only selected seats, and confirms a captured payment once',async()=>{
 const f=fixture();try{
  const order=await f.payments.order({...f.input,amount:1},f.user);
  assert.equal(order.amount,126000);assert.equal(order.currency,'INR');assert.ok(!JSON.stringify(order).includes('secret'));
  assert.deepEqual(availability(f.db,f.input).bookedSeats,['01']);
  await assert.rejects(f.payments.order({...f.input,requestKey:randomUUID()},f.other),{status:409});
  assert.deepEqual(await f.payments.order(f.input,f.user),order);assert.equal(f.calls.length,1);
  const verify={attemptId:order.attemptId,orderId:order.orderId,paymentId:'pay_1',signature:sign(order.orderId+'|pay_1')};
  await assert.rejects(f.payments.verify(verify,f.other),{status:404});
  await assert.rejects(f.payments.verify({...verify,signature:'0'.repeat(64)},f.user),{status:400});
  f.setCapture(false);await assert.rejects(f.payments.verify(verify,f.user),{status:409});assert.equal(f.db.prepare('SELECT count(*) n FROM bookings').get().n,0);
  f.setCapture(true);const pass=await f.payments.verify(verify,f.user);assert.equal(pass.paymentStatus,'paid');assert.equal(pass.method,'Razorpay');assert.equal((await f.payments.verify(verify,f.user)).id,pass.id);
  const raw=JSON.stringify({event:'payment.captured',payload:{payment:{entity:{id:'pay_1',order_id:order.orderId}}}});
  await assert.rejects(f.payments.webhook(raw,'0'.repeat(64)),{status:400});
  await f.payments.webhook(raw,sign(raw,'webhook'));assert.equal(f.db.prepare('SELECT count(*) n FROM bookings').get().n,1);assert.equal(f.db.prepare('SELECT count(*) n FROM email_outbox').get().n,2);
 }finally{f.db.close();}
});
test('late captured payments cannot steal seats; refund attention persists across webhook retries',async()=>{
 const f=fixture();try{
  const order=await f.payments.order(f.input,f.user);
  f.db.prepare('UPDATE seat_holds SET expires=0').run();
  createBooking(f.db,{...f.input,email:f.other.email,requestKey:randomUUID(),payment:{type:'upi',provider:'GPay'}},'seats',f.other);
  const raw=JSON.stringify({event:'payment.captured',payload:{payment:{entity:{id:'pay_late',order_id:order.orderId}}}});
  await f.payments.webhook(raw,sign(raw,'webhook'));await f.payments.webhook(raw,sign(raw,'webhook'));
  assert.equal(f.db.prepare('SELECT count(*) n FROM bookings').get().n,1);assert.equal(f.payments.attention()[0].paymentId,'pay_late');assert.equal(f.payments.attention()[0].email,f.user.email);
 }finally{f.db.close();}
});
test('production refuses demo payments, plaintext origins, missing credentials and test keys',()=>{
 assert.throws(()=>productionConfig({NODE_ENV:'production',PUBLIC_ORIGIN:'http://example.com'}));
 assert.throws(()=>productionConfig({NODE_ENV:'production',PUBLIC_ORIGIN:'https://example.com',PAYMENT_MODE:'demo'}));
 assert.throws(()=>productionConfig({PAYMENT_MODE:'razorpay'}));
 assert.equal(productionConfig({NODE_ENV:'production',PUBLIC_ORIGIN:'https://example.com'}).paymentMode,'disabled');
});
test('a failed order request retains an uncertain attempt and cannot generate duplicate remote orders',async()=>{
 const f=fixture();try{
  let calls=0;const payments=createPayments(f.db,{keyId:'test',keySecret:'secret',webhookSecret:'webhook',transport:async()=>{calls++;throw new Error('timeout');}});
  await assert.rejects(payments.order(f.input,f.user),{status:503});
  await assert.rejects(payments.order(f.input,f.user),{status:409});assert.equal(calls,1);
 }finally{f.db.close();}
});
test('a fare change during checkout flags the captured payment instead of issuing a mismatched receipt',async()=>{
 const {boats}=await import('../src/domain/booking.js'),boat=boats[0],original=boat.fare;
 const f=fixture();try{
  const order=await f.payments.order(f.input,f.user);boat.fare+=10000;
  await assert.rejects(f.payments.verify({attemptId:order.attemptId,orderId:order.orderId,paymentId:'pay_changed',signature:sign(order.orderId+'|pay_changed')},f.user),{status:409});
  assert.equal(f.db.prepare('SELECT count(*) n FROM bookings').get().n,0);assert.equal(f.payments.attention()[0].status,'refund_required');
 }finally{boat.fare=original;f.db.close();}
});
