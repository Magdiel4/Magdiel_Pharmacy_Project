import { env } from '../src/config/env.js';
import { postgresRepository } from '../src/models/repository.js';
const db=postgresRepository(env.databaseUrl);
try{
  const result=await db.query("SELECT to_regclass('pharmacy.branches') AS existing_schema");
  console.log('Conexión TLS verificada.',JSON.stringify(result.rows));
  const users=await db.query('SELECT count(*)::int AS total FROM auth.users');
  console.log('Usuarios Auth existentes:',users.rows[0].total);
  if(result.rows[0].existing_schema){const profiles=await db.list('profiles');console.log('Perfiles de aplicación:',profiles.length);}
}catch(e){console.error('Conexión no disponible:',e.code||e.name,e.message.replace(/postgres(?:ql)?:\/\/\S+/g,'[URI oculta]'));process.exitCode=1;}finally{await db.pool.end();}
