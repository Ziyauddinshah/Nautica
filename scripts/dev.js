import { spawn } from 'node:child_process';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
console.log('Development uses the configured MongoDB replica set. Use a separate test database; never mix test and production records.');
const children=[spawn(process.execPath,['--env-file-if-exists=.env','server/index.js'],{stdio:'inherit'}),spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','3000','--strictPort'],{stdio:'inherit'})];
let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const child of children)child.kill();process.exitCode=code;}
for(const child of children){child.on('error',error=>{console.error(error.message);stop(1);});child.on('exit',code=>stop(code||0));}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
