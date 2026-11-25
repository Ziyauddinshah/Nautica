import {refundView} from './refund-view.js';
import {slots,boats} from '../../src/domain/booking.js';
import {ApiError} from '../errors.js';
export const slotTimes=Object.fromEntries(slots.map((slot,index)=>[slot,['05:30','09:00','17:00','19:30'][index]]));
export const pierZones={'Assi Ghat':'Asia/Kolkata','Dashashwamedh Ghat':'Asia/Kolkata','Marina Bay':'Asia/Singapore','Lake Como':'Europe/Rome'};
export const historyView=query=>{const view=query.view||'all';if(!['all','upcoming','past'].includes(view))throw new ApiError(400,'Choose a valid booking history view.');return view;};
export const boatZone=boat=>pierZones[boat?.pier]||'Asia/Kolkata';
export function journeyEnd(record){
 const time=slotTimes[record.trip?.slot];if(!time||!/^\d{4}-\d{2}-\d{2}$/.test(record.trip?.date||''))return null;
 const desired=Date.parse(record.trip.date+'T'+time+':00Z');if(!Number.isFinite(desired)||new Date(desired).toISOString().slice(0,10)!==record.trip.date)return null;
 let instant=desired;const format=new Intl.DateTimeFormat('en-GB',{timeZone:boatZone(record.boat),year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 for(let index=0;index<3;index++){const parts=Object.fromEntries(format.formatToParts(instant).map(part=>[part.type,part.value]));const local=Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute,+parts.second);instant+=desired-local;}
 return new Date(instant+3600000);
}
export const activeJourney=(record,now=new Date())=>record.status==='confirmed'&&journeyEnd(record)?.getTime()>now.getTime();
export function journeyEndExpression(){
 const zone={$switch:{branches:Object.entries(pierZones).map(([pier,timeZone])=>({case:{$eq:['$boat.pier',pier]},then:timeZone})),default:'Asia/Kolkata'}};
 const time={$switch:{branches:Object.entries(slotTimes).map(([slot,start])=>({case:{$eq:['$trip.slot',slot]},then:start})),default:null}};
 return {$dateAdd:{startDate:{$dateFromString:{dateString:{$concat:['$trip.date','T',time,':00']},timezone:zone,onError:null,onNull:null}},unit:'hour',amount:1}};
}
export function historyCounts(records,now=new Date()){
 const upcoming=records.filter(record=>activeJourney(record,now)).length;return {all:records.length,upcoming,past:records.length-upcoming};
}
export function paymentRow(record,source='booking'){
 if(source==='booking')return {id:record.id,bookingId:record.id,source,boat:record.boat?{id:record.boat.id,name:record.boat.name,pier:record.boat.pier}:null,trip:record.trip?{date:record.trip.date,slot:record.trip.slot,seats:record.trip.seats}:null,amount:record.payment?.amount??record.pricing?.total??record.pass?.total??0,currency:'INR',...((record.refund||record.payment?.refund)?{refund:refundView(record.refund||record.payment.refund)}:{}),status:record.payment?.status||'unknown',method:record.payment?.method||'Status unavailable',reference:record.payment?.reference||null,createdAt:record.payment?.paidAt||record.createdAt};
 const boat=record.boat||boats.find(boat=>boat.id===record.payload?.boatId);
 return {id:record._id||record.id,bookingId:null,source,boat:boat?{id:boat.id,name:boat.name,pier:boat.pier}:null,trip:record.payload?{date:record.payload.date,slot:record.payload.slot,seats:record.payload.seats}:null,amount:record.amount,currency:'INR',...(record.refund?{refund:refundView(record.refund)}:{}),status:['refund_pending','refunded','demo_refunded','refund_failed','refund_attention'].includes(record.status)?record.status:record.status==='refund_required'?'refund_required':record.status==='failed'?'failed':'pending',method:'Razorpay',reference:record.paymentId||null,createdAt:new Date(record.expires-900000).toISOString()};
}
