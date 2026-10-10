import { writeFile } from 'node:fs/promises';
import { seedData } from '../server/src/models/seed.js';
const literal=value=>value===null?'NULL':typeof value==='boolean'?(value?'true':'false'):typeof value==='number'?String(value):`'${String(value).replaceAll("'","''")}'`;
const lines=['-- Farmacias Alvarado: datos ficticios de prueba. No ejecutar en producción.','-- Ejecutar después de 001_initial.sql. UUID conocidos; no sobrescribe registros existentes.','BEGIN;'];
const data=seedData();
for(const table of ['branches','products','inventory','employees','assets','cash_entries'])lines.push(`INSERT INTO pharmacy.${table} (${Object.keys(data[table][0]).join(', ')}) VALUES\n${data[table].map(row=>`(${Object.values(row).map(literal).join(', ')})`).join(',\n')}\nON CONFLICT (id) DO NOTHING;\n`);
lines.push('COMMIT;','');await writeFile(new URL('../supabase/seed.sql',import.meta.url),lines.join('\n'));console.log('SQL de datos de prueba guardado en supabase/seed.sql.');
