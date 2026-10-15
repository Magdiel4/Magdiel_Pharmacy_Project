import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import pg from 'pg';
pg.types.setTypeParser(1082, (value) => value);
import { tables } from './schemas.js';
import { seedData } from './seed.js';
import { upgradeDemoData } from './legacyDemo.js';
import { articleGroups } from '../../../shared/catalogs.js';
import { assert } from '../utils/errors.js';
import { assertImageTable, recordProjection, withoutImageData } from './images.js';
const safeTable = (name) => {
  assert(tables.includes(name), 'Tabla inválida');
  return `"pharmacy"."${name}"`;
};
const safeKey = (key) => {
  assert(/^[a-z_]+$/.test(key), 'Campo inválido');
  return `"${key}"`;
};
export class DemoRepository {
  constructor(file, initial) {
    this.file = file;
    this.state = upgradeDemoData(initial || seedData());
    this.queue = Promise.resolve();
  }
  async init() {
    if (this.file) {
      try {
        this.state = upgradeDemoData(JSON.parse(await readFile(this.file, 'utf8')));
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
        await this.persist(this.state);
      }
    }
    return this;
  }
  async persist(state) {
    if (!this.file) return;
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(`${this.file}.tmp`, JSON.stringify(state, null, 2));
    await rename(`${this.file}.tmp`, this.file);
  }
  async list(table, filters = {}) {
    safeTable(table);
    return structuredClone(
      this.state[table]
        .filter((row) => Object.entries(filters).every(([k, v]) => row[k] === v))
        .map((row) => withoutImageData(table, row)),
    );
  }
  async get(table, id) {
    return (await this.list(table, { id }))[0];
  }
  async insert(table, row) {
    safeTable(table);
    assert(!this.state[table].some((r) => r.id === row.id), 'Registro duplicado', 409);
    this.state[table].push(structuredClone(row));
    return withoutImageData(table, structuredClone(row));
  }
  async update(table, id, patch) {
    safeTable(table);
    const row = this.state[table].find((r) => r.id === id);
    assert(row, 'Registro no encontrado', 404);
    Object.assign(row, patch);
    return withoutImageData(table, structuredClone(row));
  }
  async getImage(table, id) {
    assertImageTable(table);
    const row = this.state[table].find((r) => r.id === id);
    return row?.image_data ? Buffer.from(row.image_data, 'base64') : null;
  }
  async saveImage(table, id, bytes) {
    assertImageTable(table);
    return this.update(table, id, {
      image_data: bytes?.toString('base64') || null,
      image_updated_at: bytes ? new Date().toISOString() : null,
    });
  }
  async lock() {} // Las transacciones demo se serializan completas.
  async nextArticleCode(group) {
    assert(articleGroups[group], 'Grupo de artículos inválido');
    const next = ++this.state.article_sequences[group];
    return `${articleGroups[group]}-${String(next).padStart(3, '0')}`;
  }
  async transaction(fn) {
    const run = this.queue.then(async () => {
      const tx = new DemoRepository(null, structuredClone(this.state));
      const result = await fn(tx);
      await this.persist(tx.state);
      this.state = tx.state;
      return result;
    });
    this.queue = run.catch(() => {});
    return run;
  }
}
export class PgRepository {
  constructor(pool, client = null) {
    this.pool = pool;
    this.client = client;
  }
  async query(sql, values = []) {
    return (this.client || this.pool).query(sql, values);
  }
  async list(table, filters = {}) {
    const entries = Object.entries(filters);
    const where = entries.length
      ? ' WHERE ' +
        entries.map(([k], i) => `${safeKey(k)} IS NOT DISTINCT FROM $${i + 1}`).join(' AND ')
      : '';
    return (
      await this.query(
        `SELECT ${recordProjection(table)} FROM ${safeTable(table)}${where}`,
        entries.map(([, v]) => v),
      )
    ).rows;
  }
  async get(table, id) {
    return (await this.list(table, { id }))[0];
  }
  async insert(table, row) {
    const keys = Object.keys(row);
    return (
      await this.query(
        `INSERT INTO ${safeTable(table)} (${keys.map(safeKey).join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING ${recordProjection(table)}`,
        Object.values(row),
      )
    ).rows[0];
  }
  async update(table, id, patch) {
    const keys = Object.keys(patch);
    return (
      await this.query(
        `UPDATE ${safeTable(table)} SET ${keys.map((k, i) => `${safeKey(k)}=$${i + 1}`).join(',')} WHERE id=$${keys.length + 1} RETURNING ${recordProjection(table)}`,
        [...Object.values(patch), id],
      )
    ).rows[0];
  }
  async getImage(table, id) {
    assertImageTable(table);
    return (
      (await this.query(`SELECT image_data FROM ${safeTable(table)} WHERE id=$1`, [id])).rows[0]
        ?.image_data || null
    );
  }
  async saveImage(table, id, bytes) {
    assertImageTable(table);
    return this.update(table, id, {
      image_data: bytes,
      image_updated_at: bytes ? new Date().toISOString() : null,
    });
  }
  async lock(key) {
    await this.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [key]);
  }
  async nextArticleCode(group) {
    return (await this.query('SELECT pharmacy.next_article_code($1) AS code', [group])).rows[0]
      .code;
  }
  async transaction(fn) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(new PgRepository(this.pool, client));
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}
export function postgresRepository(url) {
  const caPath =
    process.env.DATABASE_CA_FILE &&
    resolve(fileURLToPath(new URL('../../../', import.meta.url)), process.env.DATABASE_CA_FILE);
  const ssl = { rejectUnauthorized: true, ...(caPath ? { ca: readFileSync(caPath, 'utf8') } : {}) };
  return new PgRepository(
    new pg.Pool({
      connectionString: url,
      ssl,
      max: 10,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      statement_timeout: 15000,
    }),
  );
}
