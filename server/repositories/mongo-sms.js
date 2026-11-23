import {randomUUID} from 'node:crypto';
export class MongoSmsStore{
 constructor(repository){this.repo=repository;this.jobs=repository.c('sms_outbox');}
 async claim(){
  const clock={$toLong:'$$NOW'};
  // No provider idempotency guarantee: an expired send lease is ambiguous, never auto-resend.
  await this.jobs.updateMany({status:'sending',$expr:{$lte:['$leaseUntil',clock]}},{$set:{status:'unknown',lastErrorCode:'SMS_SEND_UNKNOWN'},$unset:{leaseToken:''}});
  return this.jobs.findOneAndUpdate({status:'pending',attempts:{$lt:3},$expr:{$lte:['$nextAttemptAt',clock]}},[{$set:{status:'sending',leaseToken:randomUUID(),leaseUntil:{$add:[clock,120000]},attempts:{$add:['$attempts',1]}}}],{returnDocument:'after',sort:{_id:1}});
 }
 record(job){return this.repo.c('bookings').findOne({_id:job.bookingId});}
 fence(job){return {_id:job._id,status:'sending',leaseToken:job.leaseToken};}
 accepted(job,recipient,batchId,deviceId){return this.jobs.updateOne(this.fence(job),[{$set:{status:'accepted',recipient,batchId,deviceId,acceptedAt:{$dateToString:{date:'$$NOW'}},nextPollAt:{$add:[{$toLong:'$$NOW'},60000]},polls:0}},{$unset:['leaseToken','lastErrorCode']}]);}
 fail(job,error){return this.jobs.updateOne(this.fence(job),[{$set:{status:error.unknown?'unknown':error.retryable&&job.attempts<3?'pending':'failed',lastErrorCode:error.code||'SMS_SEND_UNKNOWN',nextAttemptAt:{$add:[{$toLong:'$$NOW'},60000*job.attempts]}}},{$unset:'leaseToken'}]);}
 async claimPoll(){return this.jobs.findOneAndUpdate({status:{$in:['accepted','dispatched','sent','delivery_unknown']},polls:{$lt:100},$expr:{$lte:['$nextPollAt',{$toLong:'$$NOW'}]}},[{$set:{pollToken:randomUUID(),nextPollAt:{$add:[{$toLong:'$$NOW'},300000]},polls:{$add:['$polls',1]}}}],{sort:{nextPollAt:1},returnDocument:'after'});}
 async polled(job,status){
  const state=status==='pending'?'accepted':status==='unknown'?'delivery_unknown':status;
  return this.jobs.updateOne({_id:job._id,pollToken:job.pollToken},[{$set:{status:state,lastCheckedAt:{$dateToString:{date:'$$NOW'}},...(state==='delivered'?{deliveredAt:{$dateToString:{date:'$$NOW'}}}:{}),...(state==='sent'?{sentAt:{$dateToString:{date:'$$NOW'}}}:{}),nextPollAt:{$add:[{$toLong:'$$NOW'},300000]}}},{$unset:'pollToken'}]);
 }
 async retry(id){
  // Only definite rejections are eligible. Unknown/accepted sends need provider reconciliation.
  return this.jobs.updateMany({bookingId:id,status:'failed',batchId:{$exists:false}},{$set:{status:'pending',attempts:0,nextAttemptAt:0},$unset:{lastErrorCode:''}});
 }
}
