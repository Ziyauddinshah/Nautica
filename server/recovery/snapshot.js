import {createCipheriv,createDecipheriv,randomBytes,createHash} from 'node:crypto';
import {BSON} from 'mongodb';
const limit=32*1024*1024;
const header=Buffer.from('NAUTICA-BACKUP-1\n');
function key(value){if(!/^[a-fA-F0-9]{64}$/.test(value||''))throw new Error('Set a private 64-hex BACKUP_ENCRYPTION_KEY.');return Buffer.from(value,'hex');}
export function encryptSnapshot(snapshot,hex){
 const plain=Buffer.from(JSON.stringify(snapshot));if(plain.length>limit)throw new Error('Small-database backup limit exceeded; use managed Atlas snapshots.');
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(hex),iv);cipher.setAAD(header);
 const data=Buffer.concat([cipher.update(plain),cipher.final()]);
 return Buffer.concat([header,iv,cipher.getAuthTag(),data]);
}
export function decryptSnapshot(bytes,hex){
 if(bytes.length>limit+128||!bytes.subarray(0,header.length).equals(header))throw new Error('Invalid backup archive.');
 try{const offset=header.length,decipher=createDecipheriv('aes-256-gcm',key(hex),bytes.subarray(offset,offset+12));decipher.setAAD(header);decipher.setAuthTag(bytes.subarray(offset+12,offset+28));const value=JSON.parse(Buffer.concat([decipher.update(bytes.subarray(offset+28)),decipher.final()]).toString());if(value.version!==1||!Array.isArray(value.collections))throw new Error();return value;}catch{throw new Error('Backup authentication failed or archive is invalid.');}
}
export function fingerprint(documents){return createHash('sha256').update([...documents].sort().join('\n')).digest('hex');}
export async function captureSnapshot(connection){
 // Freeze collection/index migrations during capture; document reads share one snapshot.
 const collections=await connection.db.listCollections({}, {nameOnly:false}).toArray();
 if(collections.some(c=>c.type!=='collection'||Object.keys(c.options||{}).length))throw new Error('Custom collections/views require a managed backup.');
 const indexes=new Map();for(const c of collections)indexes.set(c.name,await connection.db.collection(c.name).listIndexes().toArray());
 const session=connection.client.startSession();let snapshot;
 try{await session.withTransaction(async()=>{
  snapshot={version:1,createdAt:new Date().toISOString(),collections:[]};let size=0;
  for(const c of collections){const documents=[];for await(const document of connection.db.collection(c.name).find({}, {session,promoteValues:false})){const encoded=BSON.serialize(document).toString('base64');size+=encoded.length;if(size>limit-1024*1024)throw new Error('Small-database backup limit exceeded; use managed Atlas snapshots.');documents.push(encoded);}snapshot.collections.push({name:c.name,indexes:indexes.get(c.name),documents,digest:fingerprint(documents)});}
 },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'},readPreference:'primary'});}finally{await session.endSession();}
 if(!snapshot.collections.some(c=>c.name==='metadata'&&c.documents.some(d=>{const row=BSON.deserialize(Buffer.from(d,'base64'));return row._id==='schema'&&row.state==='ready'&&row.version===1;})))throw new Error('Initialized Nautica schema required.');
 return snapshot;
}
export async function restoreAndVerify(db,snapshot){
 if(!/^nautica_restore_[a-f0-9]+$/.test(db.databaseName)||await db.listCollections().hasNext())throw new Error('Restore requires a new isolated drill database.');
 let records=0;
 for(const collection of snapshot.collections){
  if(fingerprint(collection.documents)!==collection.digest)throw new Error('Collection checksum mismatch.');
  await db.createCollection(collection.name);const target=db.collection(collection.name);
  for(let start=0;start<collection.documents.length;start+=100)await target.insertMany(collection.documents.slice(start,start+100).map(d=>BSON.deserialize(Buffer.from(d,'base64'),{promoteValues:false})));
  for(const index of collection.indexes){if(index.name==='_id_')continue;const {v,ns,key,...options}=index;await target.createIndex(key,options);}
  const restored=[];for await(const row of target.find({}, {promoteValues:false}))restored.push(BSON.serialize(row).toString('base64'));
  if(fingerprint(restored)!==collection.digest)throw new Error('Restored records differ from backup.');
  const indexes=await target.listIndexes().toArray();if(indexes.length!==collection.indexes.length||collection.indexes.some(expected=>{const actual=indexes.find(index=>index.name===expected.name);return !actual||Object.entries(expected).some(([key,value])=>!['v','ns'].includes(key)&&JSON.stringify(actual[key])!==JSON.stringify(value));}))throw new Error('Index restoration failed.');records+=restored.length;
 }
 return {collections:snapshot.collections.length,records,checksums:'passed',indexes:'passed'};
}
