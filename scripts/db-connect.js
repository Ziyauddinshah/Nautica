import {connectMongo} from '../server/repositories/mongo-connection.js';
let connection;
try{
 connection=await connectMongo(process.env,{initialize:true});
 await connection.db.command({ping:1});
 const metadata=await connection.db.collection('metadata').findOne({_id:'schema'});
 console.log('MongoDB connection and authentication verified. No data was written.');
 console.log('Database:',connection.config.database);
 console.log('Schema:',metadata?.state||'not initialized');
 if(!metadata)console.log('For existing SQLite records, migrate first. Use db:init only for a deliberately new database.');
}catch(error){
 const message=['ENOTFOUND','EAI_AGAIN'].includes(error.code)?'Atlas DNS lookup failed. Verify the current hostname in Atlas Connect > Drivers and check that the cluster is running.':error.code===18?'Atlas authentication failed. Check the database user and password in private .env.':error.message;
 console.error(message);process.exitCode=1;
}finally{await connection?.close();}
