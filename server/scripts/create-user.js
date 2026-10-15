import { createInterface } from 'node:readline/promises';
import { createClient } from '@supabase/supabase-js';
import { env } from '../src/config/env.js';
import { postgresRepository } from '../src/models/repository.js';
import { schemas } from '../src/models/schemas.js';
// Envía invitación mediante Supabase Auth; ejecutar solo para correos autorizados.
if (!env.secretKey || !env.databaseUrl)
  throw new Error(
    'Este comando requiere SUPABASE_SECRET_KEY y DATABASE_URL en .env. También puedes crear usuarios desde el panel de Supabase.',
  );
const prompt = createInterface({ input: process.stdin, output: process.stdout });
const email = await prompt.question('Correo de la persona a invitar: '),
  name = await prompt.question('Nombre completo: '),
  role = await prompt.question('Rol (administrador/auditor/gerente/cajero/logistica/rrhh): '),
  selection = (await prompt.question('UUID de sucursales separados por coma, o TODAS: ')).trim(),
  branch_ids =
    selection === 'TODAS'
      ? null
      : selection
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean);
prompt.close();
schemas.users.parse({
  id: '00000000-0000-4000-8000-000000000001',
  email,
  name,
  role,
  branch_ids,
  active: true,
});
const client = createClient(env.supabaseUrl, env.secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data, error } = await client.auth.admin.inviteUserByEmail(email);
if (error) throw error;
const row = schemas.users.parse({ id: data.user.id, email, name, role, branch_ids, active: true });
const db = postgresRepository(env.databaseUrl);
try {
  await db.insert('profiles', row);
  console.log('Invitación enviada y perfil creado.');
} finally {
  await db.pool.end();
}
