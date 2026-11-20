import {DatabaseSync} from 'node:sqlite';
import {existsSync} from 'node:fs';
import {databasePath} from '../server/database-path.js';
const filename=databasePath();
if(filename===':memory:'||!existsSync(filename))throw new Error('Database is missing. Status does not create an empty replacement.');
const db=new DatabaseSync(filename,{readOnly:true});
try{
 console.log('Private database file:',filename);
 const metadata=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='database_metadata'").get();
 console.log('Database identity:',metadata?db.prepare('SELECT instance_id FROM database_metadata WHERE id=1').get()?.instance_id:'Older database; identity will be assigned on the next application startup.');
 console.log('Integrity:',db.prepare('PRAGMA quick_check').get().quick_check);
 for(const table of ['users','bookings','seats'])console.log(table+':',db.prepare('SELECT count(*) AS count FROM '+table).get().count);
}finally{db.close();}
