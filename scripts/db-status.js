import {openRepository} from '../server/runtime.js';
const repository=await openRepository();
try{
 await repository.health();console.log('MongoDB primary/majority access: ready.');
 console.log('Database identity:',(await repository.c('metadata').findOne({_id:'schema'})).instanceId);
 for(const name of ['users','bookings','payments','outbox','sms_outbox'])console.log(name+':',await repository.c(name).countDocuments({}));
 console.log('booking payment records:',await repository.c('payments').countDocuments({kind:'booking_payment'}));
 console.log('verified paid records:',await repository.c('payments').countDocuments({kind:'booking_payment',status:'paid',verification:'provider_verified'}));
 console.log('demo payment records:',await repository.c('payments').countDocuments({kind:'booking_payment',status:'demo_paid'}));
}finally{await repository.close();}
