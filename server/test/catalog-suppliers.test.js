import test from 'node:test';
import assert from 'node:assert/strict';
import { DemoRepository } from '../src/models/repository.js';
import { Operations } from '../src/services/operations.js';
import { Purchasing } from '../src/services/purchasing.js';
import { schemas } from '../src/models/schemas.js';
import { createApp } from '../src/app.js';
import { departments } from '../../shared/catalogs.js';

function setup() {
  const db = new DemoRepository(null),
    service = new Operations(db);
  const admin = db.state.profiles[0],
    purchasing = new Purchasing(db, service);
  const purchase = {
    branch_id: db.state.branches[0].id,
    supplier_id: db.state.suppliers[0].id,
    expected_date: '2028-01-01',
    lines: [{ product_id: db.state.products[0].id, quantity: 2, unit_cost: 5 }],
  };
  return { db, service, admin, purchasing, purchase };
}
const article = (group = 'Suministros') => ({
  name: 'Artículo de prueba',
  category: 'Prueba',
  article_group: group,
  price: 0,
  cost: 5,
  min_stock: 0,
  saleable: false,
  expiration_required: false,
});
const supplier = {
  account: 'prov-qa',
  name: 'Proveedor de prueba',
  supplier_type: 'Laboratorio',
  nit: '1234567-K',
};

test('secuencias: códigos únicos concurrentes, por grupo y superiores a 999', async () => {
  const { db, service, admin } = setup();
  const rows = await Promise.all(
    Array.from({ length: 8 }, () => service.create(admin, 'products', article())),
  );
  assert.deepEqual(
    rows.map((r) => r.sku),
    ['SUM-001', 'SUM-002', 'SUM-003', 'SUM-004', 'SUM-005', 'SUM-006', 'SUM-007', 'SUM-008'],
  );
  assert.equal((await service.create(admin, 'products', article('Activos'))).sku, 'ACT-005');
  db.state.article_sequences.Suministros = 999;
  assert.equal((await service.create(admin, 'products', article())).sku, 'SUM-1000');
  await assert.rejects(
    service.create(admin, 'products', { ...article(), sku: 'SUM-999' }),
    (e) => e.name === 'ZodError',
  );
});
test('secuencias: edición conserva código; cambiar grupo conserva UUID y asigna otro código', async () => {
  const { db, service, admin } = setup();
  const row = await service.create(admin, 'products', article());
  const same = await service.update(admin, 'products', row.id, { ...article(), name: 'Editado' });
  assert.equal(same.sku, row.sku);
  const changed = await service.update(admin, 'products', row.id, article('Activos'));
  assert.equal(changed.id, row.id);
  assert.equal(changed.sku, 'ACT-005');
  const before = structuredClone(db.state);
  service.audit = async () => {
    throw new Error('Sin auditoría');
  };
  await assert.rejects(service.create(admin, 'products', article()), /Sin auditoría/);
  assert.deepEqual(db.state, before);
});
test('proveedores: cuenta y NIT obligatorios, normalizados y únicos; roles de escritura limitados', async () => {
  const { service, admin } = setup();
  const { nit, ...missing } = supplier;
  await assert.rejects(service.create(admin, 'suppliers', missing), (e) => e.name === 'ZodError');
  const row = await service.create(admin, 'suppliers', supplier);
  assert.equal(row.account, 'PROV-QA');
  assert.equal(row.nit, '1234567K');
  await assert.rejects(service.create(admin, 'suppliers', { ...supplier, account: 'otro' }), /NIT/);
  await assert.rejects(
    service.create(admin, 'suppliers', { ...supplier, nit: '99999999' }),
    /cuenta/,
  );
  for (const role of ['cajero', 'logistica', 'auditor', 'rrhh'])
    await assert.rejects(
      service.create({ ...admin, role }, 'suppliers', supplier),
      (e) => e.status === 403,
    );
});
test('compras: exige proveedor registrado activo y conserva su nombre histórico', async () => {
  const { db, admin, purchasing, purchase } = setup();
  await assert.rejects(
    purchasing.create(admin, { ...purchase, supplier_id: crypto.randomUUID() }),
    /proveedor activo/,
  );
  const row = await purchasing.create(admin, purchase);
  await db.update('suppliers', purchase.supplier_id, { name: 'Nombre actualizado', active: false });
  assert.equal((await db.get('purchase_orders', row.id)).supplier, 'Proveedor de demostración');
  await assert.rejects(
    purchasing.status(admin, row.id, { status: 'Confirmada' }),
    /activa el proveedor/,
  );
});
test('compras: elimina solo Creado, oculta líneas y conserva auditoría; bloquea confirmación posterior', async () => {
  const { db, service, admin, purchasing, purchase } = setup();
  const row = await purchasing.create(admin, purchase);
  await purchasing.remove(admin, row.id);
  assert.ok((await db.get('purchase_orders', row.id)).deleted_at);
  const snapshot = await service.snapshot(admin);
  assert.equal(snapshot.data.purchase_orders.length, 0);
  assert.equal(snapshot.data.purchase_order_lines.length, 0);
  assert.ok(db.state.audit_log.some((a) => a.action === 'Eliminar orden de compra'));
  await assert.rejects(
    purchasing.status(admin, row.id, { status: 'Confirmada' }),
    (e) => e.status === 404,
  );
  const confirmed = await purchasing.create(admin, purchase);
  await purchasing.status(admin, confirmed.id, { status: 'Confirmada' });
  await assert.rejects(purchasing.remove(admin, confirmed.id), (e) => e.status === 409);
  await assert.rejects(
    purchasing.remove({ ...admin, role: 'auditor' }, confirmed.id),
    (e) => e.status === 403,
  );
});
test('compras: eliminación compite con confirmación bajo el mismo bloqueo y respeta sucursal', async () => {
  const { db, admin, purchasing, purchase } = setup();
  const row = await purchasing.create(admin, purchase);
  await assert.rejects(
    purchasing.remove({ ...admin, role: 'gerente', branch_ids: [db.state.branches[1].id] }, row.id),
    (e) => e.status === 403,
  );
  const results = await Promise.allSettled([
    purchasing.status(admin, row.id, { status: 'Confirmada' }),
    purchasing.remove(admin, row.id),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
});
test('sucursales y traslados: 22 departamentos válidos y lote de otra sucursal rechazado sin modificar stock', async () => {
  const { db, service, admin } = setup();
  assert.equal(new Set(departments).size, 22);
  const { id, created_at, ...branch } = db.state.branches[0];
  for (const department of departments)
    assert.ok(schemas.branches.safeParse({ ...branch, department }).success);
  assert.equal(schemas.branches.safeParse({ ...branch, department: 'Inventado' }).success, false);
  const before = structuredClone(db.state);
  await assert.rejects(
    service.transfer(admin, {
      source_id: db.state.branches[1].id,
      destination_id: db.state.branches[2].id,
      batch_id: db.state.inventory[0].id,
      quantity: 1,
      note: 'Prueba',
    }),
    /Lote de origen inválido/,
  );
  assert.deepEqual(db.state, before);
});
test('API: borrar compra creada requiere sesión y ejecuta la baja con auditoría', async (t) => {
  const { db, admin, purchasing, purchase } = setup();
  const row = await purchasing.create(admin, purchase);
  const server = createApp(db).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  assert.equal((await fetch(`${base}/purchases/${row.id}`, { method: 'DELETE' })).status, 401);
  const login = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: admin.email, password: 'FarmaDemo2026!' }),
  });
  const result = await fetch(`${base}/purchases/${row.id}`, {
    method: 'DELETE',
    headers: { Cookie: login.headers.get('set-cookie').split(';')[0] },
  });
  assert.equal(result.status, 200);
  assert.ok((await db.get('purchase_orders', row.id)).deleted_at);
});
