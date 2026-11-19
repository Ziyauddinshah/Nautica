import {backup} from 'node:sqlite';
import {resolve,dirname} from 'node:path';
import {mkdirSync,chmodSync,existsSync} from 'node:fs';
import {openStore} from '../server/store.js';
process.umask(0o077);
const destination=process.argv[2];
if(!destination||existsSync(destination))throw new Error('Provide a new backup file path outside dist. Existing files are never overwritten.');
const target=resolve(destination),publicDirectory=resolve('dist');
if(target===publicDirectory||target.startsWith(publicDirectory+'/'))throw new Error('Backups must stay outside dist.');
mkdirSync(dirname(target),{recursive:true,mode:0o700});
const db=openStore();
try{await backup(db,target);chmodSync(target,0o600);console.log('Consistent SQLite backup created. Encrypt it and copy it to private backup storage.');}finally{db.close();}
