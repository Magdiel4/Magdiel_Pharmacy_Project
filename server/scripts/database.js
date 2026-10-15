import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { env } from '../src/config/env.js';
import { postgresRepository } from '../src/models/repository.js';
if (!env.databaseUrl) throw new Error('Configura DATABASE_URL en el archivo .env de la raíz.');
const db = postgresRepository(env.databaseUrl);
try {
  if (process.argv[2] === 'migrate') {
    const dir = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url));
    for (const name of (await readdir(dir)).filter((n) => n.endsWith('.sql')).sort()) {
      await db.transaction(async (tx) => {
        await tx.lock('pharmacy:migrations');
        const exists = await tx.query("SELECT to_regclass('pharmacy.schema_migrations') AS t");
        if (exists.rows[0].t) {
          const done = await tx.query('SELECT 1 FROM pharmacy.schema_migrations WHERE name=$1', [
            name,
          ]);
          if (done.rowCount) {
            console.log(`Ya aplicada: ${name}`);
            return;
          }
        }
        await tx.query(await readFile(`${dir}/${name}`, 'utf8'));
        await tx.query('INSERT INTO pharmacy.schema_migrations(name) VALUES ($1)', [name]);
        console.log(`Aplicada: ${name}`);
      });
    }
  } else if (process.argv[2] === 'seed') {
    await db.query(await readFile(new URL('../../supabase/seed.sql', import.meta.url), 'utf8'));
    console.log(
      'Datos ficticios de prueba cargados desde supabase/seed.sql. No se crearon usuarios Auth.',
    );
  } else throw new Error('Usa migrate o seed.');
} catch (e) {
  console.error(
    `Error de base de datos (${e.code || 'sin código'}): ${e.message.replace(/postgres(?:ql)?:\/\/\S+/g, '[URI oculta]')}`,
  );
  process.exitCode = 1;
} finally {
  await db.pool.end();
}
