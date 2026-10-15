import assert from 'node:assert/strict';
import sharp from 'sharp';
import { env } from '../src/config/env.js';
import { postgresRepository } from '../src/models/repository.js';

// Verifica bytea y las proyecciones reales dentro de una transacción siempre revertida.
const db = postgresRepository(env.databaseUrl);
const rollback = new Error('Revertir prueba de imágenes');
try {
  const bytes = await sharp({
    create: { width: 16, height: 16, channels: 3, background: '#276c50' },
  })
    .webp()
    .toBuffer();
  await db.transaction(async (tx) => {
    for (const table of ['inventory', 'assets']) {
      const [row] = await tx.list(table);
      assert.ok(row, `Se necesita un registro en ${table} para esta verificación.`);
      const updated = await tx.saveImage(table, row.id, bytes);
      assert.equal(updated.has_image, true);
      assert.equal(updated.image_data, undefined);
      assert.deepEqual(await tx.getImage(table, row.id), bytes);
      assert.equal((await tx.get(table, row.id)).has_image, true);
      await tx.saveImage(table, row.id, null);
      assert.equal(await tx.getImage(table, row.id), null);
      console.log(`${table}: escritura/lectura bytea, metadatos y eliminación verificados.`);
    }
    throw rollback;
  });
} catch (error) {
  if (error === rollback)
    console.log('ROLLBACK confirmado: los registros y sus fotografías originales se conservaron.');
  else {
    console.error('No se pudo verificar fotografías:', error.code || error.name);
    process.exitCode = 1;
  }
} finally {
  await db.pool.end();
}
