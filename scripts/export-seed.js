import { writeFile } from 'node:fs/promises';
import { seedData } from '../server/src/models/seed.js';
const literal = (value) =>
  value === null
    ? 'NULL'
    : typeof value === 'boolean'
      ? value
        ? 'true'
        : 'false'
      : typeof value === 'number'
        ? String(value)
        : `'${String(value).replaceAll("'", "''")}'`;
const lines = [
  '-- Farmacias Alvarado: datos ficticios de prueba. No ejecutar en producción.',
  '-- Ejecutar después de todas las migraciones, únicamente en una base de pruebas. UUID conocidos.',
  'BEGIN;',
];
const data = seedData();
for (const table of [
  'branches',
  'products',
  'inventory',
  'employees',
  'assets',
  'customers',
  'suppliers',
  'cash_entries',
])
  lines.push(
    `INSERT INTO pharmacy.${table} (${Object.keys(data[table][0]).join(', ')}) VALUES\n${data[table]
      .map(
        (row) =>
          `(${Object.keys(data[table][0])
            .map((key) => literal(row[key]))
            .join(', ')})`,
      )
      .join(',\n')}\nON CONFLICT ${table === 'products' ? '' : '(id) '}DO NOTHING;\n`,
  );
lines.push(`-- Mantener las secuencias por encima de los códigos de la plantilla.
UPDATE pharmacy.article_sequences s SET last_value=greatest(s.last_value,
  coalesce((SELECT max(split_part(p.sku,'-',2)::bigint) FROM pharmacy.products p WHERE p.article_group=s.article_group),0));`);
lines.push('COMMIT;', '');
await writeFile(new URL('../supabase/seed.sql', import.meta.url), lines.join('\n'));
console.log('SQL de datos de prueba guardado en supabase/seed.sql.');
