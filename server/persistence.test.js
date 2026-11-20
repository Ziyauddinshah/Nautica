import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {backup} from 'node:sqlite';
import {spawnSync} from 'node:child_process';
import {openStore,setAdmin} from './store.js';
import {databasePath,projectRoot} from './database-path.js';
import {createApp} from './app.js';
import {productionConfig} from './config.js';
import {localDate,slots} from '../src/domain/booking.js';

test('database path stays anchored to the application across working directories and rejects transient production storage',()=>{
 const original=process.cwd(),directory=mkdtempSync(join(tmpdir(),'nautica-cwd-'));
 try{
  const before=databasePath({});process.chdir(directory);
  assert.equal(databasePath({}),before);assert.equal(databasePath({NAUTICA_DB:'data/example.sqlite'}),resolve(projectRoot,'data/example.sqlite'));
  for(const value of [undefined,':memory:','data/relative.sqlite'])assert.throws(()=>databasePath({NODE_ENV:'production',NAUTICA_DB:value}),/persistent|absolute/);
  assert.throws(()=>productionConfig({NODE_ENV:'production',PUBLIC_ORIGIN:'https://example.test'}),/MONGODB_URI/);
 }finally{process.chdir(original);rmSync(directory,{recursive:true,force:true});}
});
test('a missing production database stops startup instead of creating empty user data; initialization is explicit and repeatable',()=>{
 const directory=mkdtempSync(join(tmpdir(),'nautica-init-')),filename=join(directory,'data.sqlite');
 try{
  assert.throws(()=>openStore(filename,{mustExist:true}),/Persistent database is missing/);assert.equal(existsSync(filename),false);
  writeFileSync(filename,'');assert.throws(()=>openStore(filename,{mustExist:true}),/not initialized/);rmSync(filename);
  const env={...process.env,NODE_ENV:'production',NAUTICA_DB:filename,PUBLIC_ORIGIN:'https://example.test',PAYMENT_MODE:'disabled'};
  const refused=spawnSync(process.execPath,[resolve(projectRoot,'server/index.js')],{env,encoding:'utf8',timeout:5000});assert.notEqual(refused.status,0);assert.match(refused.stderr,/MONGODB_URI/);assert.equal(existsSync(filename),false);
  const first=openStore(filename,{mustExist:false}),identity=first.prepare('SELECT instance_id FROM database_metadata').get().instance_id;first.close();
  const second=openStore(filename,{mustExist:true});assert.equal(second.prepare('SELECT instance_id FROM database_metadata').get().instance_id,identity);second.close();
 }finally{rmSync(directory,{recursive:true,force:true});}
});
test('independent device sessions share accounts and seats, survive restart and restore from a consistent backup',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'nautica-shared-')),filename=join(directory,'data.sqlite'),snapshot=join(directory,'backup.sqlite');
 let db,server;
 async function start(){db=openStore(filename,{mustExist:existsSync(filename)});server=createApp(db);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return 'http://127.0.0.1:'+server.address().port;}
 async function stop(){if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));server=null;}if(db){db.close();db=null;}}
 try{
  let origin=await start();
  async function call(path,body,cookie){const response=await fetch(origin+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json','X-Nautica-Request':'1',Origin:origin}:{}),...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};}
  const account={email:'shared@example.test',name:'Shared Customer',phone:'+919876543210',password:'persistent-test-passphrase'};
  const deviceA=await call('/api/user/register',account),deviceB=await call('/api/user/login',account);assert.equal(deviceA.status,201);assert.equal(deviceB.status,200);assert.notEqual(deviceA.cookie,deviceB.cookie);
  setAdmin(db,'admin','persistent-admin-password');
  const administrator=await call('/api/admin/login',{username:'admin',password:'persistent-admin-password'});
  const input={boatId:'b1',date:localDate(new Date(Date.now()+86400000)),slot:slots[0],guests:1,seats:['01'],name:account.name,phone:account.phone,extras:['safety'],payment:{type:'upi',provider:'GPay'},requestKey:randomUUID()};
  const competing=await Promise.all([call('/api/bookings',input,deviceA.cookie),call('/api/bookings',{...input,requestKey:randomUUID()},deviceB.cookie)]);assert.deepEqual(competing.map(result=>result.status).sort(),[201,409]);
  const booking=competing.find(result=>result.status===201).body.booking;
  for(const device of [deviceA,deviceB]){const history=await call('/api/user/bookings',null,device.cookie);assert.equal(history.body.total,1);assert.equal(history.body.bookings[0].id,booking.id);assert.equal(history.body.bookings[0].payment.amount,126000);}
  const identity=db.prepare('SELECT instance_id FROM database_metadata').get().instance_id;
  assert.equal(db.prepare('PRAGMA synchronous').get().synchronous,2);
  await backup(db,snapshot);
  const imported=join(directory,'imported.sqlite'),env={...process.env,NODE_ENV:'production',NAUTICA_DB:imported};
  const restore=()=>spawnSync(process.execPath,[resolve(projectRoot,'scripts/db-restore.js'),snapshot],{env,encoding:'utf8'});
  const restored=restore();assert.equal(restored.status,0,restored.stderr);assert.notEqual(restore().status,0);
  const importedDB=openStore(imported,{mustExist:true});assert.equal(importedDB.prepare('SELECT instance_id FROM database_metadata').get().instance_id,identity);assert.equal(importedDB.prepare('SELECT count(*) n FROM bookings').get().n,1);importedDB.close();
  await stop();origin=await start();
  assert.equal(db.prepare('SELECT instance_id FROM database_metadata').get().instance_id,identity);
  assert.equal((await call('/api/user/bookings',null,deviceB.cookie)).body.bookings[0].id,booking.id);
  assert.equal((await call('/api/admin/bookings',null,administrator.cookie)).body.bookings[0].id,booking.id);
  const availability=await call('/api/availability?'+new URLSearchParams({boatId:input.boatId,date:input.date,slot:input.slot}));assert.deepEqual(availability.body.bookedSeats,['01']);
  await stop();db=openStore(snapshot,{mustExist:true});assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(db.prepare('SELECT instance_id FROM database_metadata').get().instance_id,identity);assert.equal(db.prepare('SELECT count(*) n FROM users').get().n,1);assert.equal(db.prepare('SELECT count(*) n FROM email_outbox').get().n,2);assert.equal(db.prepare('SELECT count(*) n FROM seats').get().n,1);
 }finally{await stop();rmSync(directory,{recursive:true,force:true});}
});
