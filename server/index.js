import { openStore } from './store.js';
import { createApp } from './app.js';
const db=openStore();
const mode=process.env.NAUTICA_BOOKING_MODE||'seats';
if(!['seats','private'].includes(mode))throw new Error('NAUTICA_BOOKING_MODE must be seats or private.');
const port=Number(process.env.PORT||3001),host=process.env.HOST||'127.0.0.1';
const server=createApp(db,{mode,production:process.env.NODE_ENV==='production',publicOrigin:process.env.PUBLIC_ORIGIN||''});
server.listen(port,host,()=>console.log(`Nautica server: http://${host}:${port} (${mode} bookings)`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
