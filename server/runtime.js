import {connectMongo,createMongoIndexes} from './repositories/mongo-connection.js';
import {MongoRepository} from './repositories/mongo.js';
export async function openRepository(env=process.env,options={}){
 const connection=await connectMongo(env,options);
 try{await createMongoIndexes(connection.db);return new MongoRepository(connection);}catch{await connection.close();throw new Error('MongoDB schema/index initialization failed. Check server-side migration status.');}
}
