import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mongoConfig} from './mongo-config.js';
const production={NODE_ENV:'production',MONGODB_URI:'mongodb+srv://test:test@cluster.example.test/',MONGODB_DB:'nautica'};
test('production requires the online database and never falls back to SQLite or a local test replica set',()=>{
 assert.throws(()=>mongoConfig({NODE_ENV:'production',NAUTICA_DB:'/private/local.sqlite'}),/MONGODB_URI/);
 assert.throws(()=>mongoConfig({...production,STORAGE_PROVIDER:'sqlite'}),/fallback/);
 assert.throws(()=>mongoConfig({...production,MONGODB_URI:'mongodb://localhost:27017/?tls=true'}),/online/);
 assert.throws(()=>mongoConfig({...production,MONGODB_URI:'mongodb://cluster.example.test/'}),/TLS/);
 assert.throws(()=>mongoConfig({...production,MONGODB_DB:''}),/MONGODB_DB/);
 assert.equal(mongoConfig(production).database,'nautica');assert.equal(mongoConfig({}).database,'nautica_test');
});
test('TLS bypass options are rejected regardless of case or conflicting duplicate parameters',()=>{
 for(const option of ['tls=false','TLS=false','tls=true&tls=false','tlsInsecure=true','tlsallowinvalidcertificates=true','TLSALLOWINVALIDHOSTNAMES=true','directConnection=true'])assert.throws(()=>mongoConfig({...production,MONGODB_URI:production.MONGODB_URI+'?'+option}),/TLS|replica/);
});

test('connection strings cannot weaken the application consistency settings',()=>{
 for(const option of ['w=0','w=1','j=false','readPreference=secondary','readConcernLevel=local'])assert.throws(()=>mongoConfig({...production,MONGODB_URI:production.MONGODB_URI+'?'+option}),/majority/);
});
