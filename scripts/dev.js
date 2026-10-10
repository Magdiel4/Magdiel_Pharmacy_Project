import { spawn } from 'node:child_process';
// Usa directamente Node para evitar dependencias de shell y launchers npm globales.
const children=[spawn(process.execPath,['--watch','server/src/index.js'],{stdio:'inherit',env:{...process.env,PUBLIC_ORIGIN:'http://localhost:5173'}}),spawn(process.execPath,['../node_modules/vite/bin/vite.js','--host','127.0.0.1'],{cwd:new URL('../client/',import.meta.url),stdio:'inherit'})];
let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const child of children)child.kill();process.exitCode=code;}
for(const child of children){child.on('error',error=>{console.error(error.message);stop(1);});child.on('exit',code=>stop(code||0));}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
