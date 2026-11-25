import {BoatRegistry} from '../fleet/repository.js';
import {saveBookingPayment} from './payment-records.js';
import {historyView,journeyEndExpression,paymentRow} from '../domain/history.js';
import {setTimeout as delay} from 'node:timers/promises';
import {randomBytes,randomUUID,scryptSync,timingSafeEqual} from 'node:crypto';
import {ApiError,digest} from '../errors.js';
import {tripInfo,validateBooking,buildBookingRecord} from '../domain/booking.js';
import {profile,passwordValid,passwordMatches,publicUser} from '../domain/accounts.js';
import {amounts,seatLayout,localDate} from '../../src/domain/booking.js';
import {bookingView,paymentView} from '../views.js';
import {transactionOptions} from './mongo-connection.js';

const badReset=()=>new ApiError(400,'This reset link is invalid or expired. Request a new one.');
const conflict=booked=>new ApiError(409,'Some seats were just booked. Choose different seats before trying again.',{bookedSeats:booked});
const tripKey=input=>[input.boatId,input.date,input.slot].join('|');
const offsetOf=query=>Math.max(0,Math.min(1000000,parseInt(query.offset)||0));
export class MongoRepository{
 constructor(connection){Object.assign(this,connection);this.kind='mongodb';this.fleet=new BoatRegistry(this);}
 c(name){return this.db.collection(name);}
 async transaction(work){
  const session=this.client.startSession(),deadline=Date.now()+10000;
  try{
   for(let attempt=0;;attempt++){
    session.startTransaction(transactionOptions);
    try{
     const result=await work(session);
     // An uncertain COMMIT must retry only COMMIT, never the business callback.
     for(;;)try{await session.commitTransaction();return result;}catch(error){
      if(error.hasErrorLabel?.('UnknownTransactionCommitResult')&&Date.now()<deadline){await delay(25);continue;}
      throw error;
     }
    }catch(error){
     if(session.inTransaction())await session.abortTransaction().catch(()=>{});
     if(!error.hasErrorLabel?.('UnknownTransactionCommitResult')&&(error.hasErrorLabel?.('TransientTransactionError')||error.code===11000)&&attempt<12&&Date.now()<deadline){await delay(10+Math.random()*30);continue;}
     throw error;
    }
   }
  }finally{await session.endSession();}
 }
 async health(){
  const row=await this.c('metadata').findOne({_id:'schema',state:'ready',version:1},{readConcern:{level:'linearizable'},maxTimeMS:5000});
  if(!row)throw new ApiError(503,'Service is temporarily unavailable.');
 }
 async consumeLimits(category,ip,identifier=''){
  const keys=[{id:category+':ip:'+digest(ip||''),limit:category==='forgot'?5:category==='register'?10:category==='admin-login'?5:15}];
  if(identifier)keys.push({id:category+':account:'+digest(identifier),limit:category==='forgot'?3:category==='register'?10:15});
  for(const {id,limit} of keys){
   const fresh={$lte:[{$ifNull:['$expiresAt',new Date(0)]},'$$NOW']};
   const row=await this.c('limits').findOneAndUpdate({_id:id},[{$set:{
    count:{$cond:[fresh,1,{$min:[{$add:['$count',1]},limit+1]}]},
    expiresAt:{$cond:[fresh,{$dateAdd:{startDate:'$$NOW',unit:'minute',amount:15}},'$expiresAt']},
   }}],{upsert:true,returnDocument:'after'});
   if(row.count>limit)throw new ApiError(429,'Too many attempts. Try again after 15 minutes.');
  }
 }
 async newSession(user,session,role='user'){
  const token=randomBytes(32).toString('hex');
  await this.c('sessions').insertOne({_id:digest(token),role,userId:user.id,version:user.authVersion||0,expiresAt:new Date(Date.now()+28800000)},{session});
  return role==='user'?{token,user:publicUser(user)}:{token,username:user.id};
 }
 async registerUser(input){
  const fields=profile(input);
  if(!passwordValid(input.password))throw new ApiError(400,'Choose a password between 12 and 256 characters.');
  const salt=randomBytes(16).toString('hex'),hash=scryptSync(input.password,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024}).toString('hex');
  const user={_id:randomUUID(),...fields,salt,hash,authVersion:0,created_at:new Date().toISOString()};user.id=user._id;
  try{return await this.transaction(async session=>{await this.c('users').insertOne(user,{session});return this.newSession(user,session);});}
  catch(error){if(error.code===11000)throw new ApiError(409,'Unable to create an account with those details. Try signing in instead.');throw error;}
 }
 async loginUser(input){
  if(!input||typeof input.email!=='string'||typeof input.password!=='string'||input.email.length>150||input.password.length>256)throw new ApiError(400,'Enter a valid email and password.');
  return this.transaction(async session=>{
   const user=await this.c('users').findOne({email:input.email.trim().toLowerCase()},{session});
   if(!passwordMatches(user,input.password))throw new ApiError(401,'Invalid email or password.');
   return this.newSession(user,session);
  });
 }
 async authenticate(token,role){
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw new ApiError(401,role==='user'?'Sign in to access your account and book seats.':'Sign in as an administrator.');
  const options={readConcern:{level:'linearizable'},maxTimeMS:5000};
  const session=await this.c('sessions').findOne({_id:digest(token),role,expiresAt:{$gt:new Date()}},options);
  const user=session&&await this.c(role==='user'?'users':'admins').findOne({_id:session.userId},options);
  if(!user||(user.authVersion||0)!==session.version)throw new ApiError(401,'Your session has expired. Please sign in again.');
  return role==='user'?publicUser(user):user.id;
 }
 authenticateUser(token){return this.authenticate(token,'user');}
 authenticateAdmin(token){return this.authenticate(token,'admin');}
 logoutUser(token){return this.c('sessions').deleteOne({_id:digest(token),role:'user'});}
 logoutAdmin(token){return this.c('sessions').deleteOne({_id:digest(token),role:'admin'});}
 async setAdmin(username,password){
  if(!/^[a-zA-Z0-9_.@-]{3,80}$/.test(username)||!passwordValid(password))throw new Error('Use a valid username and a 12–256 character password.');
  const salt=randomBytes(16).toString('hex'),hash=scryptSync(password,salt,64).toString('hex');
  await this.transaction(async session=>{
   await this.c('admins').updateOne({_id:username},{$set:{id:username,salt,hash},$inc:{authVersion:1}},{upsert:true,session});
   await this.c('sessions').deleteMany({userId:username,role:'admin'},{session});
  });
 }
 async loginAdmin(username,password){
  return this.transaction(async session=>{
   const user=await this.c('admins').findOne({_id:username},{session});
   const candidate=scryptSync(password,user?.salt||'nautica-dummy-salt',64),expected=user?Buffer.from(user.hash,'hex'):Buffer.alloc(64);
   if(!user||!timingSafeEqual(candidate,expected))throw new ApiError(401,'Invalid admin username or password.');
   return this.newSession(user,session,'admin');
  });
 }
 async changeUserPassword(id,input){
  if(!input||typeof input.currentPassword!=='string'||input.currentPassword.length>256||!passwordValid(input.newPassword))throw new ApiError(400,'Enter your current password and a new password of 12–256 characters.');
  if(input.currentPassword===input.newPassword)throw new ApiError(400,'Choose a different new password.');
  await this.transaction(async session=>{
   const user=await this.c('users').findOne({_id:id},{session});
   if(!passwordMatches(user,input.currentPassword))throw new ApiError(401,'Current password is incorrect.');
   await this.updatePassword(id,input.newPassword,session);
  });
 }
 async updatePassword(id,password,session){
  const salt=randomBytes(16).toString('hex'),hash=scryptSync(password,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024}).toString('hex');
  await this.c('users').updateOne({_id:id},{$set:{salt,hash},$inc:{authVersion:1}},{session});
  await this.c('sessions').deleteMany({userId:id,role:'user'},{session});
  await this.c('resets').deleteMany({userId:id},{session});
 }
 async requestPasswordReset(input,{enabled=false,siteOrigin=''}={}){
  const email=typeof input?.email==='string'?input.email.trim().toLowerCase():'';
  if(email.length>150||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))throw new ApiError(400,'Enter a valid email address.');
  if(!enabled||!siteOrigin)return null;
  const user=await this.c('users').findOne({email});if(!user)return null;
  const token=randomBytes(32).toString('hex'),expires=Date.now()+900000;
  await this.c('resets').insertOne({_id:digest(token),userId:user.id,version:user.authVersion||0,expiresAt:new Date(expires)});
  const url=new URL('/reset-password',siteOrigin);url.hash='token='+token;
  return {user:{id:user.id,name:user.name,email:user.email},token,link:url.href,expires};
 }
 async resetUserPassword(input){
  if(!input||typeof input.token!=='string'||!/^[a-f0-9]{64}$/.test(input.token))throw badReset();
  if(!passwordValid(input.newPassword))throw new ApiError(400,'Choose a password between 12 and 256 characters.');
  await this.transaction(async session=>{
   const reset=await this.c('resets').findOne({_id:digest(input.token),expiresAt:{$gt:new Date()}},{session});
   const user=reset&&await this.c('users').findOne({_id:reset.userId},{session});
   if(!user||(user.authVersion||0)!==reset.version)throw badReset();
   await this.updatePassword(user.id,input.newPassword,session);
  });
 }
 occupied(trip,exclude='',now=Date.now()){
  return Object.entries(trip?.occupied||{}).filter(([,value])=>value.bookingId||(value.expires>now&&value.attemptId!==exclude)).map(([id])=>id).sort();
 }
 async lockTrip(input,session){
  return this.c('inventory').findOneAndUpdate({_id:tripKey(input)},{$inc:{version:1},$currentDate:{touchedAt:true},$setOnInsert:{boatId:input.boatId,date:input.date,slot:input.slot,occupied:{}}},{upsert:true,returnDocument:'after',session});
 }
 async availability(input){
  const boat=tripInfo(input,[await this.fleet.bookable(input.boatId,input.date)]),trip=await this.c('inventory').findOne({_id:tripKey(input)},{readConcern:{level:'linearizable'},maxTimeMS:5000}),bookedSeats=this.occupied(trip);
  return {boatId:boat.id,date:input.date,slot:input.slot,bookedSeats,remaining:boat.capacity-bookedSeats.length};
 }
 async createBooking(input,mode='seats',user,receipt=null,session=null){
  if(!session)return this.transaction(tx=>this.createBooking(input,mode,user,receipt,tx));
  const existing=await this.c('bookings').findOne({requestKey:input.requestKey},{session});
  const boat=existing?.boat||await this.fleet.bookable(input.boatId,input.date,session);
  const prepared=validateBooking(input,user,[boat]);
  if(existing){if(existing.userId!==user?.id||existing.requestHash!==prepared.hash)throw new ApiError(409,'This booking request was already used with different details.');return existing.pass;}
  const trip=await this.lockTrip(input,session),booked=this.occupied(trip,receipt?.attemptId,trip.touchedAt.getTime());
  if((mode==='private'&&booked.length)||prepared.seats.some(id=>booked.includes(id)))throw conflict(booked);
  const record=buildBookingRecord(input,mode,user,receipt,[boat]);
  const reserved=mode==='private'?seatLayout(prepared.boat).map(seat=>seat.id):prepared.seats;
  for(const seat of reserved)trip.occupied[seat]={bookingId:record.id};
  await this.c('inventory').updateOne({_id:trip._id},{$set:{occupied:trip.occupied}},{session});
  const storedBooking={_id:record.id,...record,userId:user?.id||null,requestKey:input.requestKey,requestHash:prepared.hash};
  await this.c('bookings').insertOne(storedBooking,{session});
  for(const audience of ['customer','admin'])await this.c('outbox').insertOne({_id:record.id+':'+audience,bookingId:record.id,audience,recipient:audience==='customer'?record.customer.email:null,status:'pending',attempts:0,nextAttemptAt:0,leaseUntil:0,messageId:`<${record.id}.${audience}@nautica.invalid>`},{session});
  if(this.smsEnabled)for(const audience of (this.smsAdminEnabled?['customer','admin']:['customer']))await this.c('sms_outbox').insertOne({_id:record.id+':'+audience,bookingId:record.id,audience,recipient:audience==='customer'?record.customer.phone:null,status:'pending',attempts:0,nextAttemptAt:0,leaseUntil:0,createdAt:record.createdAt},{session});
  if(receipt)await this.c('payments').updateOne({_id:receipt.attemptId},{$set:{status:'paid',bookingId:record.id,paymentId:receipt.paymentId}},{session});
  await saveBookingPayment(this,storedBooking,session,{attemptId:receipt?.attemptId,providerVerified:Boolean(receipt)});
  return record.pass;
 }
 async withPaymentRecords(records,session){
  if(!records.length)return records;
  const receipts=await this.c('payments').find({bookingId:{$in:records.map(record=>record.id)},kind:'booking_payment'},{session}).toArray();
  const byBooking=new Map(receipts.map(receipt=>[receipt.bookingId,receipt]));
  return records.map(record=>{const receipt=byBooking.get(record.id);return receipt&&receipt.userId===(record.userId||null)?{...record,payment:{...record.payment,...paymentView({...receipt.summary,...receipt})}}:record;});
 }
 async smsNotifications(ids,session){
  const jobs=await this.c('sms_outbox').find({bookingId:{$in:ids}},{session,projection:{_id:0,bookingId:1,audience:1,status:1,attempts:1,sentAt:1,deliveredAt:1,acceptedAt:1,batchId:1}}).toArray();
  return jobs.map(job=>({...job,channel:'sms',retryable:job.status==='failed'&&!job.batchId}));
 }
 async notificationsFor(id,session){
  const email=await this.c('outbox').find({bookingId:id},{session,projection:{_id:0,audience:1,status:1,attempts:1,sentAt:1,nextAttemptAt:1}}).sort({audience:1}).toArray();
  return [...email,...await this.smsNotifications([id],session)];
 }
 async hasBooking(id){return Boolean(await this.c('bookings').findOne({_id:id},{projection:{_id:1}}));}
 async userBooking(userId,id){
  return this.transaction(async session=>{
   const record=await this.c('bookings').findOne({_id:id,userId},{session});if(!record)throw new ApiError(404,'Booking not found.');
   const [enriched]=await this.withPaymentRecords([record],session);return bookingView(enriched,{notifications:await this.notificationsFor(id,session)});
  });
 }
 async bookingHistory(userId,query,session){
  const view=historyView(query),offset=offsetOf(query),now=new Date();
  const active={$and:[{$gt:['$__ends',now]},{$eq:['$status','confirmed']}]};
  const match=view==='upcoming'?{$expr:active}:view==='past'?{$expr:{$not:[active]}}:null;
  const sort=view==='upcoming'?{__ends:1,_id:1}:view==='past'?{__ends:-1,_id:-1}:{createdAt:-1,_id:-1};
  const [result]=await this.c('bookings').aggregate([{$match:{userId}},{$set:{__ends:journeyEndExpression()}},{$facet:{counts:[{$group:{_id:null,all:{$sum:1},upcoming:{$sum:{$cond:[active,1,0]}}}}],records:[...(match?[{$match:match}]:[]),{$sort:sort},{$skip:offset},{$limit:50}]}}],{session}).toArray();
  const counts={all:result.counts[0]?.all||0,upcoming:result.counts[0]?.upcoming||0};counts.past=counts.all-counts.upcoming;
  return {now,records:result.records,counts,total:view==='all'?counts.all:counts[view],offset};
 }
 async userBookings(userId,query={}){
  return this.transaction(async session=>{
   const history=await this.bookingHistory(userId,query,session),bookings=[];
   const jobs=history.records.length?await this.c('outbox').find({bookingId:{$in:history.records.map(record=>record.id)}},{session,projection:{_id:0,bookingId:1,audience:1,status:1,sentAt:1}}).toArray():[];
   const sms=await this.smsNotifications(history.records.map(record=>record.id),session);
   for(const record of await this.withPaymentRecords(history.records,session)){const view=bookingView(record,{notifications:[...jobs.filter(job=>job.bookingId===record.id),...sms.filter(job=>job.bookingId===record.id)]});view.journeyState=record.status!=='confirmed'||!record.__ends||record.__ends<=history.now?'previous':record.__ends.getTime()-3600000<=history.now.getTime()?'in_progress':'upcoming';bookings.push(view);}
   const attemptCount=await this.c('payments').countDocuments({userId,kind:{$ne:'booking_payment'},status:{$nin:['paid','demo_paid']}},{session});
   const attempts=await this.c('payments').find({userId,kind:{$ne:'booking_payment'},status:{$nin:['paid','demo_paid']},$or:[{expires:{$gt:history.now.getTime()}},{status:'refund_required'}]},{session,projection:{_id:1,amount:1,status:1,paymentId:1}}).sort({expires:-1}).limit(50).toArray();
   const payments=attempts.map(row=>({id:row._id,amount:row.amount,currency:'INR',status:row.status==='refund_required'?'refund_required':'pending',reference:row.paymentId}));
   return {bookings,payments,counts:history.counts,paymentTotal:history.counts.all+attemptCount,total:history.total,upcoming:history.counts.upcoming,offset:history.offset,limit:50};
  });
 }
 async userPayments(userId,query={}){
  const offset=offsetOf(query),now=new Date(),active={$and:[{$gt:['$__ends',now]},{$eq:['$record.status','confirmed']}]};
  const pipeline=[{$match:{userId}},{$lookup:{from:'payments',localField:'id',foreignField:'bookingId',pipeline:[{$match:{userId,kind:'booking_payment'}},{$project:{_id:0,amount:1,currency:1,status:1,method:1,provider:1,reference:1,paidAt:1}}],as:'__payment'}},{$set:{payment:{$mergeObjects:['$payment',{$ifNull:[{$arrayElemAt:['$__payment',0]},{}]}]}}},{$unset:'__payment'},{$set:{__ends:journeyEndExpression()}},{$project:{source:{$literal:'booking'},record:'$$ROOT',__ends:1,sortDate:{$ifNull:['$payment.paidAt','$createdAt']}}},{$unionWith:{coll:'payments',pipeline:[{$match:{userId,kind:{$ne:'booking_payment'},status:{$nin:['paid','demo_paid']}}},{$project:{source:{$literal:'attempt'},record:'$$ROOT',sortDate:{$dateToString:{date:{$toDate:{$subtract:['$expires',900000]}},format:'%Y-%m-%dT%H:%M:%S.%LZ'}}}}]}},{$facet:{count:[{$count:'total'}],counts:[{$match:{source:'booking'}},{$group:{_id:null,all:{$sum:1},upcoming:{$sum:{$cond:[active,1,0]}}}}],rows:[{$sort:{sortDate:-1,_id:-1}},{$skip:offset},{$limit:50}]}}];
  // Snapshot reads outside a transaction allow unionWith while keeping one read timestamp.
  const [result]=await this.c('bookings').aggregate(pipeline,{readConcern:{level:'snapshot'}}).toArray();
  const counts={all:result.counts[0]?.all||0,upcoming:result.counts[0]?.upcoming||0};counts.past=counts.all-counts.upcoming;
  return {payments:result.rows.map(row=>paymentRow(row.record,row.source)),counts,total:result.count[0]?.total||0,paymentTotal:result.count[0]?.total||0,offset,limit:50};
 }
 async adminBookings(query={}){
  const filter={};for(const [key,column]of [['boatId','boat.id'],['date','trip.date'],['slot','trip.slot']])if(query[key])filter[column]=String(query[key]);
  if(query.q){const term=String(query.q).slice(0,150).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');filter.$or=['id','customer.name','customer.email','customer.phone'].map(key=>({[key]:{$regex:term,$options:'i'}}));}
  return this.transaction(async session=>{const records=await this.c('bookings').find(filter,{session}).sort({createdAt:-1,_id:-1}).skip(offsetOf(query)).limit(50).toArray();return {bookings:await this.withPaymentRecords(records,session),total:await this.c('bookings').countDocuments(filter,{session}),offset:offsetOf(query),limit:50};});
 }
}
