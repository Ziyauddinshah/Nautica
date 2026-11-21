import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execFileAsync=promisify(execFile);
async function runCLI(command,args,options){try{const result=await execFileAsync(command,args,options);return {...result,status:0};}catch(error){return {status:error.code,stdout:error.stdout||'',stderr:error.stderr||error.message};}}
import {MongoMemoryReplSet} from 'mongodb-memory-server-core';
import {MongoClient} from 'mongodb';
import {connectMongo,createMongoIndexes} from '../server/repositories/mongo-connection.js';
import {MongoOutboxStore} from '../server/repositories/mongo-outbox.js';
import {MongoPaymentStore} from '../server/repositories/mongo-payments.js';
import {MongoRepository} from '../server/repositories/mongo.js';
import {createPaymentService} from '../server/services/payments.js';
import {createRazorpayGateway} from '../server/services/razorpay.js';
import {createSharedEmailService} from '../server/services/email.js';
import {createApp} from '../server/app.js';
import {openStore,createBooking,setAdmin} from '../server/store.js';
import {initUsers,registerUser} from '../server/users.js';
import {slots,localDate} from '../src/domain/booking.js';
let cluster,uri;
const resources=[];
before(async()=>{
 cluster=await MongoMemoryReplSet.create({binary:{version:'8.0.16',...(process.env.MONGOMS_DOWNLOAD_DIR?{downloadDir:process.env.MONGOMS_DOWNLOAD_DIR}:{})},instanceOpts:[0,1,2].map(()=>({args:['--wiredTigerCacheSizeGB','0.25','--oplogSize','16','--setParameter','enableTestCommands=1']})),replSet:{count:3,storageEngine:'wiredTiger',configSettings:{electionTimeoutMillis:1500,heartbeatIntervalMillis:250}}});
 uri=cluster.getUri();
});
after(async()=>{for(const cleanup of resources.reverse())await cleanup();await cluster?.stop();});
async function fixture(){
 const database='nautica_test_'+randomUUID().replaceAll('-','');
 const env={MONGODB_URI:uri,MONGODB_DB:database};
 const first=await connectMongo(env,{initialize:true});await createMongoIndexes(first.db);await first.db.collection('metadata').insertOne({_id:'schema',version:1,state:'ready',instanceId:randomUUID()});
 const second=await connectMongo(env);const a=new MongoRepository(first),b=new MongoRepository(second);
 resources.push(async()=>{await a.db.dropDatabase();await a.close();await b.close();});return {a,b,env};
}
const account=(email=randomUUID()+'@example.test')=>({name:'Guest Test',email,phone:'+919876543210',password:'strong-test-passphrase'});
const booking=(user,patch={})=>({boatId:'b1',date:localDate(new Date(Date.now()+86400000)),slot:slots[0],guests:1,seats:['01'],name:user.name,email:user.email,phone:user.phone,extras:['safety'],payment:{type:'upi',provider:'GPay'},requestKey:randomUUID(),...patch});
const sign=(message,secret='test-secret')=>createHmac('sha256',secret).update(message).digest('hex');
function gatewayFixture(){
 const orders=new Map();let orderCount=0,captured=true;
 const gateway=createRazorpayGateway({keyId:'rzp_test_public',keySecret:'test-secret',webhookSecret:'test-webhook',transport:async(url,options)=>{
  if(url.endsWith('/orders')){const input=JSON.parse(options.body),id='order_'+(++orderCount);orders.set(id,input);return Response.json({id,...input});}
  const id=url.split('/').at(-1),orderId='order_'+id.split('_')[1],order=orders.get(orderId);
  return Response.json({id,order_id:orderId,amount:order.amount,currency:'INR',status:captured?'captured':'authorized'});
 }});
 return {gateway,orders,setCaptured:value=>{captured=value;},count:()=>orderCount};
}
test('two independent servers share durable sessions, history and atomic seat reservations',async()=>{
 const {a,b}=await fixture(),registered=await a.registerUser(account()),user=registered.user;
 assert.equal((await b.authenticateUser(registered.token)).id,user.id);
 const input=booking(user),results=await Promise.allSettled([a.createBooking(input,'seats',user),b.createBooking({...input,requestKey:randomUUID()},'seats',user)]);
 assert.equal(results.filter(value=>value.status==='fulfilled').length,1);assert.equal(results.find(value=>value.status==='rejected').reason.status,409);
 const pass=results.find(value=>value.status==='fulfilled').value;
 assert.equal((await b.userBookings(user.id)).bookings[0].id,pass.id);assert.deepEqual((await b.availability(input)).bookedSeats,['01']);
 assert.equal(await a.c('outbox').countDocuments({}),2);
 const stranger=(await b.registerUser(account())).user;await assert.rejects(b.userBooking(stranger.id,pass.id),{status:404});
 const reconnected=await connectMongo({MONGODB_URI:uri,MONGODB_DB:a.config.database});const restored=new MongoRepository(reconnected);
 try{assert.equal((await restored.authenticateUser(registered.token)).id,user.id);assert.equal((await restored.userBookings(user.id)).total,1);}finally{await restored.close();}
});
test('simultaneous idempotent requests produce one booking and one pair of email jobs',async()=>{
 const {a,b}=await fixture(),user=(await a.registerUser(account())).user,input=booking(user);
 const passes=await Promise.all([a.createBooking(input,'seats',user),b.createBooking(input,'seats',user),a.createBooking(input,'seats',user)]);
 assert.equal(new Set(passes.map(pass=>pass.id)).size,1);assert.equal(await a.c('bookings').countDocuments({}),1);assert.equal(await a.c('outbox').countDocuments({}),2);
});
test('rate limits are shared across application replicas and cannot reset on failover',async()=>{
 const {a,b}=await fixture();
 for(let count=0;count<5;count++)await(count%2?a:b).consumeLimits('admin-login','one-test-ip');
 await assert.rejects(a.consumeLimits('admin-login','one-test-ip'),{status:429});await assert.rejects(b.consumeLimits('admin-login','one-test-ip'),{status:429});
});
test('password reset is single-use across replicas and revokes every old session',async()=>{
 const {a,b}=await fixture(),input=account(),registered=await a.registerUser(input),other=await b.loginUser(input);
 const job=await a.requestPasswordReset({email:input.email},{enabled:true,siteOrigin:'https://example.test'});
 await b.resetUserPassword({token:job.token,newPassword:'new-secure-passphrase'});
 await assert.rejects(a.authenticateUser(registered.token),{status:401});await assert.rejects(a.authenticateUser(other.token),{status:401});await assert.rejects(a.resetUserPassword({token:job.token,newPassword:'another-passphrase'}),{status:400});
 assert.ok((await a.loginUser({...input,password:'new-secure-passphrase'})).token);
});
test('distributed checkout holds seats; duplicate callbacks and webhooks confirm exactly one booking',async()=>{
 const {a,b}=await fixture(),user=(await a.registerUser(account())).user,{gateway,count,setCaptured}=gatewayFixture(),pa=createPaymentService(new MongoPaymentStore(a),gateway),pb=createPaymentService(new MongoPaymentStore(b),gateway),input=booking(user);
 const order=await pa.order({...input,cvv:'PRIVATE_CVV',cardNumber:'PRIVATE_PAN',upi:'PRIVATE_UPI'},user);assert.ok(!JSON.stringify(await a.c('payments').findOne({_id:order.attemptId})).includes('PRIVATE_'));assert.equal(order.amount,126000);assert.equal(order.currency,'INR');assert.deepEqual((await b.availability(input)).bookedSeats,['01']);
 await assert.rejects(pb.order({...input,requestKey:randomUUID()},user),{status:409});assert.equal((await pb.order(input,user)).orderId,order.orderId);assert.equal(count(),1);
 const verify={attemptId:order.attemptId,orderId:order.orderId,paymentId:'pay_1',signature:sign(order.orderId+'|pay_1')};
 await assert.rejects(pb.verify({...verify,signature:'0'.repeat(64)},user),{status:400});setCaptured(false);await assert.rejects(pa.verify(verify,user),{status:409});assert.equal(await a.c('bookings').countDocuments({}),0);setCaptured(true);
 const raw=JSON.stringify({event:'payment.captured',payload:{payment:{entity:{id:'pay_1',order_id:order.orderId}}}});
 const results=await Promise.all([pa.verify(verify,user),pb.verify(verify,user),pb.webhook(raw,sign(raw,'test-webhook'))]);
 assert.equal(results[0].id,results[1].id);assert.equal(results[0].paymentStatus,'paid');const receiptRecord=await a.c('payments').findOne({bookingId:results[0].id});assert.equal(receiptRecord.kind,'booking_payment');assert.equal(receiptRecord.verification,'provider_verified');assert.equal(receiptRecord.currency,'INR');assert.equal(await a.c('payments').countDocuments({}),1);const ledger=await b.userPayments(user.id,{});assert.equal(ledger.total,1);assert.equal(ledger.payments[0].status,'paid');setCaptured(false);assert.equal((await pb.verify(verify,user)).id,results[0].id);assert.equal(await a.c('bookings').countDocuments({}),1);assert.equal(await a.c('outbox').countDocuments({}),2);
});
test('a late captured payment cannot steal seats already reserved by another booking',async()=>{
 const {a,b}=await fixture(),user=(await a.registerUser(account())).user,{gateway}=gatewayFixture(),pa=createPaymentService(new MongoPaymentStore(a),gateway),pb=createPaymentService(new MongoPaymentStore(b),gateway),input=booking(user),order=await pa.order(input,user);
 const trip=await a.c('inventory').findOne({});await a.c('inventory').updateOne({_id:trip._id},{$set:{'occupied.01.expires':0}});
 await b.createBooking({...input,requestKey:randomUUID()},'seats',user);
 const raw=JSON.stringify({event:'payment.captured',payload:{payment:{entity:{id:'pay_1',order_id:order.orderId}}}});
 await pa.webhook(raw,sign(raw,'test-webhook'));await pb.webhook(raw,sign(raw,'test-webhook'));
 assert.equal(await a.c('bookings').countDocuments({}),1);assert.equal((await pb.attention())[0].status,'refund_required');
});
test('email workers on different replicas claim independent fenced jobs without normal duplicate sends',async()=>{
 const {a,b}=await fixture(),user=(await a.registerUser(account())).user;await a.createBooking(booking(user),'seats',user);
 const sent=[],config={enabled:true,configured:true,user:'sender@gmail.com',adminTo:'admin@example.test',siteOrigin:'https://example.test'},transport={sendMail:async message=>{sent.push(message);return {accepted:[message.to.address]};}};
 const ea=createSharedEmailService(new MongoOutboxStore(a),{config,transport}),eb=createSharedEmailService(new MongoOutboxStore(b),{config,transport});
 await Promise.all([ea.drain(),eb.drain()]);assert.equal(sent.length,2);assert.equal(new Set(sent.map(message=>message.messageId)).size,2);assert.equal(await a.c('outbox').countDocuments({status:'sent'}),2);await ea.stop();await eb.stop();
});
test('HTTP replicas authenticate shared cookies and never expose database configuration',async()=>{
 const {a,b}=await fixture();const servers=[];
 try{
  for(const repository of [a,b]){const server=createApp(null,{repository});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));servers.push(server);}
  const origins=servers.map(server=>'http://127.0.0.1:'+server.address().port),input=account();
  const response=await fetch(origins[0]+'/api/user/register',{method:'POST',headers:{Origin:origins[0],'Content-Type':'application/json','X-Nautica-Request':'1'},body:JSON.stringify(input)}),cookie=response.headers.get('set-cookie').split(';')[0];assert.equal(response.status,201);
  const session=await fetch(origins[1]+'/api/user/session',{headers:{Cookie:cookie}}),body=await session.json();assert.equal(body.user.email,input.email);assert.ok(!JSON.stringify(body).includes('mongodb'));
  const setup=await runCLI(process.execPath,['scripts/admin-create.js'],{env:{...process.env,NODE_ENV:'test',MONGODB_URI:uri,MONGODB_DB:a.config.database,NAUTICA_ADMIN_USER:'admin',NAUTICA_ADMIN_PASSWORD:'admin-test-passphrase'},encoding:'utf8'});assert.equal(setup.status,0,setup.stderr);assert.ok(!setup.stdout.includes('admin-test-passphrase'));
  await a.setAdmin('admin','admin-test-passphrase');const admin=await a.loginAdmin('admin','admin-test-passphrase');assert.equal(await b.authenticateAdmin(admin.token),'admin');
 }finally{for(const server of servers){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
});
test('read-only SQLite migration preserves accounts, hashes, ownership, seats, payment records and the outbox',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'nautica-import-')),filename=join(directory,'source.sqlite'),database='nautica_test_'+randomUUID().replaceAll('-','');
 const db=openStore(filename);initUsers(db);const input=account(),user=registerUser(db,input).user;const pass=createBooking(db,booking(user),'seats',user);setAdmin(db,'admin','admin-test-passphrase');db.close();
 const env={...process.env,NODE_ENV:'test',MONGODB_URI:uri,MONGODB_DB:database};
 try{
  const result=await runCLI(process.execPath,['scripts/migrate-sqlite.js',filename],{env,encoding:'utf8',cwd:resolve('.'),timeout:30000});assert.equal(result.status,0,result.stderr);
  const connection=await connectMongo(env),repo=new MongoRepository(connection);
  try{const importedPayment=await repo.c('payments').findOne({bookingId:pass.id});assert.equal(importedPayment.status,'demo_paid');assert.equal(importedPayment.verification,'demo');assert.equal((await repo.loginUser(input)).user.id,user.id);assert.equal((await repo.userBookings(user.id)).bookings[0].id,pass.id);assert.deepEqual((await repo.availability(booking(user))).bookedSeats,['01']);assert.equal(await repo.c('outbox').countDocuments({}),2);assert.equal((await repo.loginAdmin('admin','admin-test-passphrase')).username,'admin');await repo.db.dropDatabase();}finally{await repo.close();}
 }finally{rmSync(directory,{recursive:true,force:true});}
});
test('an uncertain commit retries the commit without rerunning the business callback',async()=>{
 const {a}=await fixture(),admin=a.client.db('admin');
 await admin.command({configureFailPoint:'failCommand',mode:{times:3},data:{failCommands:['commitTransaction'],writeConcernError:{code:64,errmsg:'test-only unknown commit'},errorLabels:['UnknownTransactionCommitResult']}});
 let executions=0;
 await a.transaction(async session=>{executions++;await a.c('limits').insertOne({_id:'commit-proof',count:1},{session});});
 assert.equal(executions,1);assert.equal(await a.c('limits').countDocuments({_id:'commit-proof'}),1);
});
test('loss of database quorum refuses confirmations and recovery preserves the last committed booking',async()=>{
 const {a,b}=await fixture(),user=(await a.registerUser(account())).user,input=booking(user),pass=await a.createBooking(input,'seats',user);
 const hello=await a.client.db('admin').command({hello:1}),primaryPort=Number(hello.primary.split(':').at(-1)),secondary=cluster.servers.filter(server=>server.instanceInfo.port!==primaryPort);
 const server=createApp(null,{repository:b});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  await Promise.all(secondary.map(member=>member.stop({doCleanup:false})));
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/health');assert.equal(response.status,503);
  await assert.rejects(a.createBooking({...input,seats:['02'],requestKey:randomUUID()},'seats',user));
 }finally{
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  await Promise.all(secondary.map(member=>member.start(true)));
 }
 // Topology discovery waits for a new majority-elected primary.
 await b.health();assert.equal((await b.userBookings(user.id)).bookings[0].id,pass.id);assert.equal(await b.c('bookings').countDocuments({}),1);assert.equal(await b.c('outbox').countDocuments({}),2);
});
test('proxy-authenticated client IPs share limits across replicas while forged headers are ignored',async()=>{
 const {a,b}=await fixture(),token='only-test-proxy-token-'+randomUUID(),servers=[];
 try{
  for(const repository of [a,b]){const server=createApp(null,{repository,proxyToken:token});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));servers.push(server);}
  const call=async(index,ip,proof=token)=>{const origin='http://127.0.0.1:'+servers[index].address().port;return fetch(origin+'/api/user/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Nautica-Request':'1','X-Forwarded-For':ip,'X-Nautica-Proxy-Token':proof},body:JSON.stringify({email:'rate@example.test',password:'incorrect-test-passphrase'})});};
  // The shared account key permits 15 attempts; use a separate email per IP below only when testing transport identity.
  await call(0,'192.0.2.1');await call(1,'192.0.2.1');await call(0,'192.0.2.2');await call(0,'192.0.2.99','forged');
  const {digest}=await import('../server/errors.js');
  assert.equal((await a.c('limits').findOne({_id:'login:ip:'+digest('192.0.2.1')})).count,2);
  assert.equal((await b.c('limits').findOne({_id:'login:ip:'+digest('192.0.2.2')})).count,1);
  assert.equal(await a.c('limits').findOne({_id:'login:ip:'+digest('192.0.2.99')}),null);
 }finally{for(const server of servers){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
});
test('an obsolete email worker cannot acknowledge or fail a newly claimed job',async()=>{
 const {a,b}=await fixture(),user=(await a.registerUser(account())).user;await a.createBooking(booking(user),'seats',user);
 const first=new MongoOutboxStore(a,{now:()=>1000}),second=new MongoOutboxStore(b,{now:()=>122000}),old=await first.claim(),fresh=await second.claim();
 assert.equal(old._id,fresh._id);assert.notEqual(old.leaseToken,fresh.leaseToken);
 assert.equal((await first.succeed(old)).matchedCount,0);assert.equal((await first.fail(old)).matchedCount,0);assert.equal((await second.succeed(fresh)).matchedCount,1);
});
test('history filters and payment pagination operate on all owner records, including migrated payments and unbooked attempts',async()=>{
 const {a,b}=await fixture(),user=(await a.registerUser(account())).user,stranger=(await a.registerUser(account())).user;
 const pass=await a.createBooking(booking(user),'seats',user),original=await a.c('bookings').findOne({_id:pass.id});
 const old=[];for(let index=0;index<55;index++){const id='NTC-HISTORY-'+index;old.push({...original,_id:id,id,requestKey:randomUUID(),trip:{...original.trip,date:'2020-01-01'},createdAt:new Date(Date.UTC(2020,0,1,index)).toISOString()});}
 await a.c('bookings').insertMany(old);
 await a.c('payments').insertMany([{_id:randomUUID(),userId:user.id,requestKey:randomUUID(),payload:booking(user),amount:126000,status:'refund_required',expires:Date.now()+900000,paymentId:'pay_refund'},{_id:randomUUID(),userId:stranger.id,requestKey:randomUUID(),payload:booking(stranger),amount:999999,status:'created',expires:Date.now()+900000}]);
 const upcoming=await b.userBookings(user.id,{view:'upcoming'});assert.equal(upcoming.total,1);assert.equal(upcoming.payments[0].reference,'pay_refund');assert.equal(upcoming.bookings[0].id,pass.id);assert.deepEqual(upcoming.counts,{all:56,upcoming:1,past:55});
 const previous=await b.userBookings(user.id,{view:'past',offset:50});assert.equal(previous.total,55);assert.equal(previous.bookings.length,5);assert.ok(previous.bookings.every(record=>record.trip.date==='2020-01-01'));
 const payments=await b.userPayments(user.id,{});assert.equal(payments.total,57);assert.equal(payments.payments.length,50);assert.equal(payments.payments.find(row=>row.reference==='pay_refund').status,'refund_required');assert.ok(payments.payments.some(row=>row.status==='demo_paid'));assert.ok(payments.payments.every(row=>row.amount!==999999));
 const secondPage=await b.userPayments(user.id,{offset:50});assert.equal(secondPage.payments.length,7);assert.ok(!JSON.stringify(payments).includes('requestHash'));assert.ok(!JSON.stringify(payments).includes(stranger.email));
});
test('new bookings atomically save one linked payment and historical backfill is repeatable across replicas',async()=>{
 const {backfillPaymentRecords}=await import('../server/repositories/payment-records.js');
 const {a,b}=await fixture(),user=(await a.registerUser(account())).user,input=booking(user),pass=await a.createBooking(input,'seats',user);
 const payment=await b.c('payments').findOne({bookingId:pass.id});assert.equal(payment.kind,'booking_payment');assert.equal(payment.status,'demo_paid');assert.equal(payment.amount,126000);assert.equal(payment.userId,user.id);assert.equal(payment.verification,'demo');
 await b.createBooking(input,'seats',user);assert.equal(await a.c('payments').countDocuments({bookingId:pass.id}),1);assert.equal((await b.userPayments(user.id)).total,1);
 // Reproduce a migrated booking whose payment existed only in its booking document.
 await a.c('payments').deleteOne({_id:payment._id});
 const outboxCount=await a.c('outbox').countDocuments({}),seatSnapshot=JSON.stringify(await a.c('inventory').findOne({}));
 await Promise.all([backfillPaymentRecords(a),backfillPaymentRecords(b)]);
 assert.equal(await b.c('payments').countDocuments({bookingId:pass.id}),1);assert.deepEqual(await backfillPaymentRecords(a),{created:0,updated:0,unchanged:1});
 assert.equal(await a.c('outbox').countDocuments({}),outboxCount);assert.equal(JSON.stringify(await a.c('inventory').findOne({})),seatSnapshot);assert.equal((await b.userPayments(user.id)).total,1);
 await a.c('payments').updateOne({bookingId:pass.id},{$set:{status:'refunded'}});await backfillPaymentRecords(b);assert.equal((await b.userPayments(user.id)).payments[0].status,'refunded');assert.equal((await b.userBooking(user.id,pass.id)).payment.status,'refunded');assert.equal((await b.userBookings(user.id)).bookings[0].payment.status,'refunded');assert.equal((await b.adminBookings({})).bookings[0].payment.status,'refunded');
});
