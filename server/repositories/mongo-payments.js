import {safeCheckoutPayload} from '../domain/payment-record.js';
import {randomUUID} from 'node:crypto';
import {ApiError} from '../errors.js';
import {validateBooking} from '../domain/booking.js';
import {amounts,seatLayout} from '../../src/domain/booking.js';
const refundMessage='Payment received but seats could not be confirmed. Contact support for a refund.';
export class MongoPaymentStore{
 constructor(repository){this.repo=repository;}
 c(name){return this.repo.c(name);}
 async owned(id,user){if(typeof id!=='string')throw new ApiError(404,'Payment not found.');const row=await this.c('payments').findOne({_id:id,userId:user.id});if(!row)throw new ApiError(404,'Payment not found.');return row;}
 async reserve(input,user,mode){
  const payload=safeCheckoutPayload(input,user.email),prepared=validateBooking(payload,user),id=randomUUID(),repo=this.repo;
  return repo.transaction(async session=>{
   if(await this.c('bookings').findOne({requestKey:input.requestKey},{session}))throw new ApiError(409,'This booking request was already used with different details.');
   const existing=await this.c('payments').findOne({requestKey:input.requestKey},{session});
   if(existing){
    if(existing.userId!==user.id||existing.requestHash!==prepared.hash)throw new ApiError(409,'This booking request was already used with different details.');
    if(existing.orderId&&existing.status==='created'&&existing.expires>Date.now())return {row:existing,existing:true};
    throw new ApiError(409,'This payment attempt has expired. Start a new booking.');
   }
   const trip=await repo.lockTrip(payload,session),booked=repo.occupied(trip,'',trip.touchedAt.getTime()),expires=trip.touchedAt.getTime()+900000;
   if((mode==='private'&&booked.length)||prepared.seats.some(seat=>booked.includes(seat)))throw new ApiError(409,'Some seats were just booked. Choose different seats before trying again.',{bookedSeats:booked});
   const seats=mode==='private'?seatLayout(prepared.boat).map(seat=>seat.id):prepared.seats;
   for(const seat of seats)trip.occupied[seat]={attemptId:id,expires};
   await this.c('inventory').updateOne({_id:trip._id},{$set:{occupied:trip.occupied}},{session});
   const row={_id:id,userId:user.id,requestKey:input.requestKey,requestHash:prepared.hash,payload,amount:amounts(prepared.boat,prepared.extras).total,currency:'INR',provider:'Razorpay',method:'Razorpay',createdAt:trip.touchedAt.toISOString(),updatedAt:trip.touchedAt.toISOString(),status:'creating',expires};
   await this.c('payments').insertOne(row,{session});return {row,existing:false};
  });
 }
 creationUnknown(id){return this.c('payments').updateOne({_id:id,status:'creating'},{$set:{status:'creation_unknown'}});}
 async attachOrder(id,orderId){await this.c('payments').updateOne({_id:id,status:'creating'},{$set:{orderId,status:'created'}});return this.get(id);}
 get(id){return this.c('payments').findOne({_id:id});}
 findOrder(orderId){return this.c('payments').findOne({orderId});}
 async recover(orderId,attemptId){
  const row=await this.c('payments').findOne({_id:attemptId,status:{$in:['creating','creation_unknown']}});if(!row)return null;
  await this.c('payments').updateOne({_id:row._id,orderId:{$exists:false}},{$set:{orderId,status:'created'}});return this.get(row._id);
 }
 async confirm(row,paymentId,mode,provider){
  const repo=this.repo;
  try{return await repo.transaction(async session=>{
   const current=await this.c('payments').findOne({_id:row._id},{session});
   if(current.status==='paid')return (await this.c('bookings').findOne({_id:current.bookingId},{session})).pass;
   if(current.status==='refund_required')throw new ApiError(409,refundMessage);
   const user=await this.c('users').findOne({_id:current.userId},{session});if(!user)throw new ApiError(409,'Booking owner no longer exists.');const prepared=validateBooking(current.payload,user);
   if(amounts(prepared.boat,prepared.extras).total!==current.amount)throw new ApiError(409,'The fare changed before confirmation.');
   return repo.createBooking(current.payload,mode,user,{attemptId:current._id,paymentId,provider},session);
  });}catch(error){
   if(error instanceof ApiError&&[400,409].includes(error.status)){
    const confirmed=await repo.transaction(async session=>{
     const latest=await this.c('payments').findOne({_id:row._id},{session});
     if(latest.status==='paid')return (await this.c('bookings').findOne({_id:latest.bookingId},{session})).pass;
     await this.c('payments').updateOne({_id:row._id,status:{$ne:'paid'}},{$set:{status:'refund_required',paymentId}},{session});return null;
    });
    if(confirmed)return confirmed;throw new ApiError(409,refundMessage);
   }
   throw error; // Unknown commits/outages must not be relabeled as seat conflicts or refunds.
  }
 }
 async attention(){return (await this.c('payments').find({status:'refund_required'}).sort({expires:-1}).limit(100).toArray()).map(row=>({id:row._id,orderId:row.orderId,paymentId:row.paymentId,status:row.status,amount:row.amount,currency:'INR',name:row.payload.name,email:row.payload.email,phone:row.payload.phone}));}
}
