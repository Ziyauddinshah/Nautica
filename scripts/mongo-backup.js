import {open,realpath} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {connectMongo} from '../server/repositories/mongo-connection.js';
import {captureSnapshot,encryptSnapshot} from '../server/recovery/snapshot.js';
process.umask(0o077);
let connection;
try{
 const destination=process.argv[2];if(!destination)throw new Error('Provide a NEW private backup file path outside the project.');
 const parent=await realpath(resolve(destination,'..')),project=await realpath(resolve(import.meta.dirname,'..')),rel=relative(project,parent);if(rel===''||(!rel.startsWith('../')&&!rel.startsWith('..\\')))throw new Error('Backup storage must be outside the project.');
 connection=await connectMongo();
 const archive=encryptSnapshot(await captureSnapshot(connection),process.env.BACKUP_ENCRYPTION_KEY);
 const file=await open(resolve(destination),'wx',0o600);try{await file.writeFile(archive);await file.sync();}finally{await file.close();}
 console.log('Encrypted MongoDB snapshot created. Run db:restore:test before relying on it.');
}catch{console.error('Backup failed. Check the private destination, encryption key, initialized database, permissions and 32 MiB limit. No existing file is overwritten.');process.exitCode=1;}finally{await connection?.close();}
