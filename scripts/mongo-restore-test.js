import {readFile,stat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {MongoClient} from 'mongodb';
import {MongoMemoryReplSet} from 'mongodb-memory-server-core';
import {secretBox} from '../server/security/totp.js';
import {decryptSnapshot,restoreAndVerify} from '../server/recovery/snapshot.js';
let cluster,client;
try{
 const filename=process.argv[2];if(!filename||(await stat(filename)).size>32*1024*1024+128)throw new Error();
 const snapshot=decryptSnapshot(await readFile(filename),process.env.BACKUP_ENCRYPTION_KEY);
 cluster=await MongoMemoryReplSet.create({binary:{version:'8.0.16'},instanceOpts:[{args:['--setParameter','ttlMonitorEnabled=false']}],replSet:{count:1}});
 client=new MongoClient(cluster.getUri());await client.connect();
 const db=client.db('nautica_restore_'+randomUUID().replaceAll('-',''));
 const result=await restoreAndVerify(db,snapshot);
 let mfaSecretsVerified=0;for await(const admin of db.collection('admins').find({'mfa.secret':{$exists:true}})){secretBox(process.env.ADMIN_MFA_ENCRYPTION_KEY).open(admin.mfa.secret,admin.id||admin._id);mfaSecretsVerified++;}
 console.log(JSON.stringify({mode:'isolated-restore-drill',...result,mfaSecretsVerified,backupCreatedAt:snapshot.createdAt,liveProvidersUsed:false}));
}catch{console.error('Restore drill failed. Check archive/key, local MongoDB binary availability and private resources. Production was not modified.');process.exitCode=1;}finally{await client?.close();await cluster?.stop();}
