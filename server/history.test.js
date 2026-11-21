import {test} from 'node:test';
import assert from 'node:assert/strict';
import {journeyEnd,activeJourney,paymentRow,historyView} from './domain/history.js';
import {slots} from '../src/domain/booking.js';
test('journey boundaries use pier time zones and include a trip until its one-hour journey ends',()=>{
 const record={status:'confirmed',boat:{pier:'Assi Ghat'},trip:{date:'2026-11-21',slot:slots[0]}};
 assert.equal(journeyEnd(record).toISOString(),'2026-11-21T01:00:00.000Z');assert.equal(activeJourney(record,new Date('2026-11-21T00:30:00Z')),true);assert.equal(activeJourney(record,new Date('2026-11-21T01:00:00Z')),false);
 assert.equal(journeyEnd({...record,boat:{pier:'Marina Bay'}}).toISOString(),'2026-11-20T22:30:00.000Z');
 assert.equal(journeyEnd({...record,boat:{pier:'Lake Como'},trip:{date:'2026-07-21',slot:slots[2]}}).toISOString(),'2026-07-21T16:00:00.000Z');
 assert.equal(activeJourney({...record,status:'cancelled'},new Date('2020-01-01')),false);assert.equal(journeyEnd({...record,trip:{date:'2026-02-31',slot:slots[0]}}),null);assert.throws(()=>historyView({view:'invalid'}),{status:400});
});
test('migrated booking payments are visible without separate payment-attempt documents and exclude private fields',()=>{
 const row=paymentRow({id:'booking-1',boat:{id:'b1',name:'Boat',pier:'Assi Ghat',private:'secret'},trip:{date:'2026-11-21',slot:slots[0],seats:['01']},payment:{amount:126000,status:'demo_paid',method:'UPI',reference:'DEMO-1',secret:'PRIVATE'},customer:{email:'PRIVATE_EMAIL'},requestHash:'PRIVATE_HASH'});
 assert.equal(row.amount,126000);assert.equal(row.status,'demo_paid');assert.equal(row.reference,'DEMO-1');assert.ok(!JSON.stringify(row).includes('PRIVATE'));assert.ok(!JSON.stringify(row).includes('secret'));
});
