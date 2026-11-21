import {MongoRepository} from '../server/repositories/mongo.js';
import {backfillPaymentRecords} from '../server/repositories/payment-records.js';
import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {connectMongo,createMongoIndexes} from '../server/repositories/mongo-connection.js';
const filename=process.argv[2]&&resolve(process.argv[2]);
if(!filename||!existsSync(filename))throw new Error('Provide a private, consistent SQLite backup file. The source will stay read-only.');
const source=new DatabaseSync(filename,{readOnly:true});
let connection;
try{
 source.exec('BEGIN');
 const integrity=source.prepare('PRAGMA integrity_check').all();if(integrity.length!==1||integrity[0].integrity_check!=='ok')throw new Error('SQLite backup integrity check failed.');
 const table=name=>Boolean(source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name));
 for(const name of ['users','bookings','seats','admins'])if(!table(name))throw new Error('Source is not a recognized Nautica account database.');
 connection=await connectMongo(process.env,{initialize:true});const {db}=connection;
 if(await db.collection('metadata').findOne({_id:'schema'}))throw new Error('Destination already initialized or import previously started. Use a NEW, empty staging database; no overwrite or merge is supported.');
 for(const name of ['users','admins','bookings','payments','inventory','outbox'])if(await db.collection(name).countDocuments({},{limit:1}))throw new Error('Destination must be empty.');
 const legacy=table('database_metadata')&&source.prepare('SELECT instance_id FROM database_metadata').get();
 await db.collection('metadata').insertOne({_id:'schema',version:1,state:'migrating',instanceId:legacy?.instance_id||randomUUID(),createdAt:new Date().toISOString()});
 await createMongoIndexes(db);
 async function copy(name,sql,map){let batch=[],count=0;for(const row of source.prepare(sql).iterate()){batch.push(map(row));if(batch.length===250){await db.collection(name).insertMany(batch);count+=batch.length;batch=[];}}if(batch.length){await db.collection(name).insertMany(batch);count+=batch.length;}return count;}
 const users=await copy('users','SELECT * FROM users',row=>({...row,_id:row.id,email:row.email.toLowerCase(),authVersion:0}));
 await copy('admins','SELECT * FROM admins',row=>({_id:row.username,id:row.username,salt:row.salt,hash:row.hash,authVersion:0}));
 const bookings=await copy('bookings','SELECT * FROM bookings',row=>({_id:row.id,...JSON.parse(row.record),userId:row.user_id||null,requestKey:row.request_key,requestHash:row.request_hash}));
 const inventory=new Map();
 const trip=row=>{const id=[row.boat_id,row.date,row.slot].join('|');if(!inventory.has(id))inventory.set(id,{_id:id,boatId:row.boat_id,date:row.date,slot:row.slot,version:0,occupied:{}});return inventory.get(id);};
 for(const row of source.prepare('SELECT * FROM seats').iterate())trip(row).occupied[row.seat]={bookingId:row.booking_id};
 if(table('seat_holds'))for(const row of source.prepare('SELECT * FROM seat_holds WHERE expires>?').iterate(Date.now()))if(!trip(row).occupied[row.seat])trip(row).occupied[row.seat]={attemptId:row.attempt_id,expires:row.expires};
 for(const row of inventory.values())await db.collection('inventory').insertOne(row);
 if(table('payment_attempts'))await copy('payments','SELECT * FROM payment_attempts',row=>({_id:row.id,userId:row.user_id,requestKey:row.request_key,requestHash:row.request_hash,payload:JSON.parse(row.payload),amount:row.amount,status:row.status,expires:row.expires,...(row.order_id?{orderId:row.order_id}:{}),...(row.payment_id?{paymentId:row.payment_id}:{}),...(row.booking_id?{bookingId:row.booking_id}:{})}));
 if(table('email_outbox'))await copy('outbox','SELECT * FROM email_outbox',row=>({_id:row.booking_id+':'+row.audience,bookingId:row.booking_id,audience:row.audience,recipient:row.recipient,status:row.status==='sending'?(row.attempts>=5?'failed':'pending'):row.status,attempts:row.attempts,nextAttemptAt:row.next_attempt_at,leaseUntil:0,messageId:row.message_id||`<${row.booking_id}.${row.audience}@nautica.invalid>`,sentAt:row.sent_at}));
 if(await db.collection('users').countDocuments({})!==users||await db.collection('bookings').countDocuments({})!==bookings)throw new Error('Import counts do not match. Database stays unavailable.');
 const seats=[...inventory.values()].reduce((total,row)=>total+Object.values(row.occupied).filter(value=>value.bookingId).length,0);
 if(seats!==source.prepare('SELECT count(*) n FROM seats').get().n)throw new Error('Seat counts do not match. Database stays unavailable.');
 await backfillPaymentRecords(new MongoRepository(connection));
 await db.collection('metadata').updateOne({_id:'schema',state:'migrating'},{$set:{state:'ready',migratedAt:new Date().toISOString()}});
 console.log(`Migration verified: ${users} users, ${bookings} bookings, ${seats} reserved seats. Source unchanged; sessions/reset links were not imported. Reconcile payment/email activity before reopening traffic.`);
}catch(error){console.error('Migration stopped. Source unchanged; any partially imported MongoDB namespace must stay offline.');throw error;}
finally{source.close();await connection?.close();}
