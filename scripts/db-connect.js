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
 if(error.diagnostics){console.error('Connection check: '+error.diagnostics.category);console.error(error.diagnostics.message);console.error(error.diagnostics.hint);}else console.error(error.message);process.exitCode=1;
}finally{await connection?.close();}
