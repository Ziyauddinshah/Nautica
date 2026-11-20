import {randomUUID} from 'node:crypto';
import {connectMongo,createMongoIndexes} from '../server/repositories/mongo-connection.js';
const connection=await connectMongo(process.env,{initialize:true});
try{
 const {db}=connection,metadata=await db.collection('metadata').findOne({_id:'schema'});
 if(metadata&&(!['initializing','ready'].includes(metadata.state)||metadata.version!==1))throw new Error('Migration is incomplete or schema version is incompatible. Do not initialize over existing data.');
 if(metadata?.state!=='ready'){
  for(const name of ['users','admins','bookings','payments','inventory','outbox'])if(await db.collection(name).countDocuments({}, {limit:1}))throw new Error('Existing records found. Use a validated migration; initialization does not adopt unknown data.');
  await db.collection('metadata').updateOne({_id:'schema'},{$setOnInsert:{instanceId:randomUUID(),version:1,state:'initializing',createdAt:new Date().toISOString()}},{upsert:true});
 }
 await createMongoIndexes(db);
 const completed=await db.collection('metadata').updateOne({_id:'schema',version:1,state:{$in:['initializing','ready']}},{$set:{state:'ready'}});
 if(!completed.matchedCount)throw new Error('Schema state changed during initialization. Initialization stopped.');
 console.log('MongoDB schema and indexes ready. No existing records were removed.');
}finally{await connection.close();}
