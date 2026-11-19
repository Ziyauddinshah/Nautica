import { vi } from 'vitest';
import * as N from '../src/domain/booking.js';
export function installApiMock(){
 const bookings=[];
 const user={id:'test-user',name:'Example Guest',email:'guest@example.com',phone:'+919876543210',createdAt:'2026-11-19T00:00:00Z'};
 const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 const mock=vi.fn(async(path,options={})=>{
  const url=new URL(path,'http://localhost:3000');
  if(url.pathname==='/api/user/session')return respond({user});
  if(url.pathname==='/api/user/bookings')return respond({bookings:bookings.map(pass=>({pass})),total:bookings.length});
  if(url.pathname==='/api/availability')return respond({bookedSeats:bookings.filter(b=>b.boatId===url.searchParams.get('boatId')&&b.date===url.searchParams.get('date')&&b.slot===url.searchParams.get('slot')).flatMap(b=>b.seats),mode:'seats'});
  if(url.pathname==='/api/bookings'){
   const body=JSON.parse(options.body),boat=N.boats.find(b=>b.id===body.boatId);
   const pass={id:'NTC-'+crypto.randomUUID().slice(0,8),boatId:body.boatId,date:body.date,slot:body.slot,guests:body.guests,seats:body.seats,name:body.name,extras:body.extras,total:N.amounts(boat,body.extras).total,method:body.payment.type==='card'?body.payment.network+' · '+body.payment.last4:body.payment.type==='bank'?'Net banking · '+body.payment.bank:'UPI · '+body.payment.provider,serverConfirmed:true};
   bookings.push(pass);return respond({booking:pass},201);
  }
  if(url.pathname==='/api/admin/session')return respond({error:'Sign in as an administrator.'},401);
  return respond({error:'Not found'},404);
 });
 vi.stubGlobal('fetch',mock);return {mock,bookings,respond};
}
