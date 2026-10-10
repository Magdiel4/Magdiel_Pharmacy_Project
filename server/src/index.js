import { env, validateEnv } from './config/env.js';
import { fileURLToPath } from 'node:url';
import { DemoRepository, postgresRepository } from './models/repository.js';
import { createApp } from './app.js';
validateEnv();
const db=env.mode==='demo'?await new DemoRepository(fileURLToPath(new URL('../data/demo.json',import.meta.url))).init():postgresRepository(env.databaseUrl);
if(env.mode==='supabase')await db.query('SELECT 1');
const server=createApp(db).listen(env.port,env.production?'0.0.0.0':'127.0.0.1',()=>console.log(`Farmacias Alvarado: http://localhost:${env.port} · modo ${env.mode}`));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(async()=>{if(db.pool)await db.pool.end();process.exit(0);}));
