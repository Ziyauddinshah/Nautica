import {openStore} from '../server/store.js';
import {databasePath} from '../server/database-path.js';
const filename=databasePath();
if(filename===':memory:')throw new Error('Initialization requires a persistent database file.');
const db=openStore(filename,{mustExist:false});
try{
 console.log('Database initialized; existing records were preserved.');
 console.log('Private database file:',filename);
 console.log('Database identity:',db.prepare('SELECT instance_id FROM database_metadata WHERE id=1').get().instance_id);
 console.log('Use this one backend for every device. A new installation does not import data automatically.');
}finally{db.close();}
