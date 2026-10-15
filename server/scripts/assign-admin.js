import { env } from '../src/config/env.js';
import { postgresRepository } from '../src/models/repository.js';
import { mkdir, writeFile } from 'node:fs/promises';
const db = postgresRepository(env.databaseUrl);
const id = process.argv[2],
  name = process.argv[3] || 'Administrador';
if (!/^[0-9a-f-]{36}$/.test(id || ''))
  throw new Error('Indica el UUID exacto del usuario creado en Authentication.');
try {
  const user = (await db.query('SELECT id,email FROM auth.users WHERE id=$1', [id])).rows[0];
  if (!user) throw new Error('Usuario Auth no encontrado.');
  const row = {
    id: user.id,
    name,
    email: user.email,
    role: 'administrador',
    branch_id: null,
    active: true,
  };
  await db.transaction(async (tx) => {
    const existing = await tx.get('profiles', id);
    if (existing) {
      if (existing.role !== 'administrador')
        throw new Error('El usuario ya tiene otro rol; revísalo desde Usuarios y roles.');
    } else await tx.insert('profiles', row);
  });
  const literal = (v) =>
    v === null
      ? 'NULL'
      : typeof v === 'boolean'
        ? String(v)
        : `'${String(v).replaceAll("'", "''")}'`;
  const sql = `-- Perfil del primer administrador. La cuenta Auth fue creada desde el panel.\nINSERT INTO pharmacy.profiles (${Object.keys(row).join(', ')})\nVALUES (${Object.values(row).map(literal).join(', ')})\nON CONFLICT (id) DO NOTHING;\n`;
  await mkdir(new URL('../../supabase/local/', import.meta.url), { recursive: true });
  await writeFile(new URL('../../supabase/local/bootstrap-admin.sql', import.meta.url), sql);
  console.log(
    'Perfil administrador verificado. SQL guardado en supabase/local/bootstrap-admin.sql (excluido de Git).',
  );
} finally {
  await db.pool.end();
}
