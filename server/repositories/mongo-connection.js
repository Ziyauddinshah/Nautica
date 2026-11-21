import {mongoDiagnostics} from '../mongo-diagnostics.js';
import {MongoClient} from 'mongodb';
import {mongoConfig} from '../mongo-config.js';
export const transactionOptions={readConcern:{level:'snapshot'},writeConcern:{w:'majority',j:true,wtimeoutMS:5000},readPreference:'primary',maxCommitTimeMS:5000};
export async function connectMongo(env=process.env,{initialize=false}={}){
 const config=mongoConfig(env);
 let client;
 try{
 client=new MongoClient(config.uri,{
  appName:'nautica',readPreference:'primary',readConcern:{level:'majority'},
  writeConcern:{w:'majority',j:true,wtimeoutMS:5000},retryWrites:true,
  serverSelectionTimeoutMS:5000,connectTimeoutMS:5000,socketTimeoutMS:10000,
  maxPoolSize:30,minPoolSize:0,waitQueueTimeoutMS:5000,
 });
  await client.connect();
  const hello=await client.db('admin').command({hello:1});
  if(hello.maxWireVersion<21)throw Object.assign(new Error('MongoDB 7 or newer is required.'),{setupError:true});
  if(!hello.setName&&hello.msg!=='isdbgrid')throw Object.assign(new Error('MongoDB transactions require a replica set or sharded cluster.'),{setupError:true});
  const db=client.db(config.database);
  const metadata=await db.collection('metadata').findOne({_id:'schema'});
  if(!initialize&&(metadata?.state!=='ready'||metadata?.version!==1))throw Object.assign(new Error('MongoDB database is not initialized or migration is incomplete. Run db:init for a new database or complete the migration.'),{setupError:true});
  return {client,db,config,close:()=>client.close()};
 }catch(error){await client?.close().catch(()=>{});const diagnostics=mongoDiagnostics(error);const failure=new Error(error.setupError?error.message:diagnostics.message);failure.diagnostics=error.setupError?null:diagnostics;throw failure;}
}
export async function createMongoIndexes(db){
 const specs={
  users:[[{email:1},{unique:true}]],
  sessions:[[{expiresAt:1},{expireAfterSeconds:0}],[{userId:1},{}]],
  resets:[[{expiresAt:1},{expireAfterSeconds:0}],[{userId:1},{}]],
  bookings:[[{requestKey:1},{unique:true}],[{userId:1,createdAt:-1},{}],[{'trip.date':1,'boat.id':1,'trip.slot':1},{}]],
  payments:[[{bookingId:1},{unique:true,partialFilterExpression:{bookingId:{$type:'string'}}}],[{requestKey:1},{unique:true}],[{orderId:1},{unique:true,sparse:true}],[{paymentId:1},{unique:true,sparse:true}],[{userId:1,expires:-1},{}]],
  outbox:[[{status:1,nextAttemptAt:1,leaseUntil:1},{}],[{bookingId:1},{}]],
  limits:[[{expiresAt:1},{expireAfterSeconds:0}]],
 };
 for(const [name,indexes] of Object.entries(specs))for(const [keys,options] of indexes)await db.collection(name).createIndex(keys,options);
 // Pre-create collections outside transactions (including ones without secondary indexes).
 for(const name of ['admins','inventory','metadata'])if(!await db.listCollections({name},{nameOnly:true}).hasNext())try{await db.createCollection(name);}catch(error){if(error.code!==48)throw error;}
}
