import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import sharp from 'sharp';
import { DemoRepository } from '../src/models/repository.js';
import { Operations } from '../src/services/operations.js';
import { ImagesService, MAX_UPLOAD_BYTES } from '../src/services/images.js';
import { createApp } from '../src/app.js';

const fixture = (color = '#267558') =>
  sharp({
    create: { width: 1800, height: 1000, channels: 3, background: color },
  })
    .png()
    .toBuffer();

function setup() {
  const db = new DemoRepository(null);
  const operations = new Operations(db);
  return {
    db,
    operations,
    service: new ImagesService(db, operations),
    admin: db.state.profiles[0],
  };
}

for (const entity of ['inventory', 'assets']) {
  test(`${entity}: fotografía persistente, reemplazo y eliminación sin alterar datos ni exponer bytes en listados`, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), 'farma-images-test-'));
    t.after(() => {
      const target = resolve(directory);
      assert.equal(dirname(target), resolve(tmpdir()));
      assert.ok(basename(target).startsWith('farma-images-test-'));
      return rm(target, { recursive: true, force: true });
    });
    const { db, operations, service, admin } = setup();
    db.file = join(directory, 'demo.json');
    const row = await db.get(entity, db.state[entity][0].id);
    const saved = await service.save(admin, entity, row.id, await fixture());
    assert.equal(saved.has_image, true);
    const bytes = await service.read(admin, entity, row.id);
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, 1600);
    assert.equal(metadata.exif, undefined);
    const reopened = await new DemoRepository(db.file).init();
    assert.deepEqual(await reopened.getImage(entity, row.id), bytes);
    const updated = await db.get(entity, row.id);
    assert.equal(updated.image_data, undefined);
    assert.equal(updated.name || updated.lot, row.name || row.lot);
    const snapshot = await operations.snapshot(admin);
    assert.equal(JSON.stringify(snapshot).includes('image_data'), false);
    assert.equal(snapshot.data[entity].find((r) => r.id === row.id).has_image, true);
    assert.equal(db.state.audit_log.at(-1).details.size_bytes, bytes.length);
    await service.save(admin, entity, row.id, await fixture('#cc6543'));
    assert.notDeepEqual(await service.read(admin, entity, row.id), bytes);
    await service.remove(admin, entity, row.id);
    assert.equal((await db.get(entity, row.id)).has_image, false);
    assert.equal((await db.get(entity, row.id)).image_updated_at, null);
    await assert.rejects(service.read(admin, entity, row.id), (error) => error.status === 404);
  });
}

test('fotografías: rechaza archivos falsos, SVG, exceso de bytes y dimensiones', async () => {
  const { db, service, admin } = setup();
  const id = db.state.inventory[0].id;
  for (const bytes of [
    Buffer.from('no es una imagen'),
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'),
    Buffer.alloc(MAX_UPLOAD_BYTES + 1),
    await sharp({ create: { width: 6000, height: 5000, channels: 3, background: '#fff' } })
      .png()
      .toBuffer(),
  ]) {
    await assert.rejects(service.save(admin, 'inventory', id, bytes), (error) =>
      [400, 413].includes(error.status),
    );
  }
  assert.equal((await db.get('inventory', id)).has_image, false);
  assert.equal(db.state.audit_log.length, 0);
});

test('fotografías: aplica permisos de lectura/escritura y alcance de sucursales', async () => {
  const { db, service, admin } = setup();
  const row = db.state.inventory[0];
  const bytes = await fixture();
  await service.save(admin, 'inventory', row.id, bytes);
  const auditor = { ...admin, role: 'auditor' };
  const cashier = { ...admin, role: 'cajero' };
  assert.ok(await service.read(auditor, 'inventory', row.id));
  assert.ok(await service.read(cashier, 'inventory', row.id));
  for (const actor of [
    auditor,
    cashier,
    { ...admin, role: 'rrhh' },
    { ...admin, active: false },
    { ...admin, branch_ids: [crypto.randomUUID()] },
  ]) {
    await assert.rejects(
      service.save(actor, 'inventory', row.id, bytes),
      (error) => error.status === 403,
    );
    await assert.rejects(
      service.remove(actor, 'inventory', row.id),
      (error) => error.status === 403,
    );
  }
  await assert.rejects(
    service.read({ ...admin, branch_ids: [crypto.randomUUID()] }, 'inventory', row.id),
    (error) => error.status === 403,
  );
  await assert.rejects(service.read(admin, 'profiles', admin.id), (error) => error.status === 404);
  await assert.rejects(
    service.read(admin, 'assets', crypto.randomUUID()),
    (error) => error.status === 404,
  );
  assert.equal(
    (
      await service.save(
        { ...admin, role: 'gerente', branch_ids: [row.branch_id] },
        'inventory',
        row.id,
        bytes,
      )
    ).has_image,
    true,
  );
});

test('fotografías: la imagen se revierte si falla la auditoría', async () => {
  const { db, service, operations, admin } = setup();
  const id = db.state.assets[0].id;
  operations.audit = async () => {
    throw new Error('Fallo de auditoría');
  };
  await assert.rejects(service.save(admin, 'assets', id, await fixture()), /Fallo de auditoría/);
  assert.equal((await db.get('assets', id)).has_image, false);
});

test('API de imágenes: sesión, subida binaria, descarga privada, validación y eliminación', async (t) => {
  const { db } = setup();
  const server = createApp(db).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const path = `${base}/images/assets/${db.state.assets[0].id}`;
  assert.equal((await fetch(path)).status, 401);
  const login = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'administrador@farmaalvar.demo', password: 'FarmaDemo2026!' }),
  });
  const headers = {
    Cookie: login.headers.get('set-cookie').split(';')[0],
    Origin: 'http://localhost:5173',
  };
  assert.equal(
    (
      await fetch(path, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'text/plain' },
        body: 'invalid',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await fetch(path, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'image/png' },
        body: Buffer.alloc(MAX_UPLOAD_BYTES + 1),
      })
    ).status,
    413,
  );
  assert.equal(
    (
      await fetch(path, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'image/png', Origin: 'https://example.com' },
        body: await fixture(),
      })
    ).status,
    403,
  );
  const upload = await fetch(path, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'image/png' },
    body: await fixture(),
  });
  assert.equal(upload.status, 200);
  assert.equal((await upload.json()).has_image, true);
  const download = await fetch(path, { headers });
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('content-type'), 'image/webp');
  assert.equal(download.headers.get('cache-control'), 'no-store');
  assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await sharp(Buffer.from(await download.arrayBuffer())).metadata()).format, 'webp');
  assert.equal((await fetch(path, { method: 'DELETE', headers })).status, 200);
  assert.equal((await fetch(path, { headers })).status, 404);
});
