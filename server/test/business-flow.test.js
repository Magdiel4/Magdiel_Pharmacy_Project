import test from 'node:test';
import assert from 'node:assert/strict';
import { DemoRepository } from '../src/models/repository.js';
import { Operations } from '../src/services/operations.js';
import { Purchasing } from '../src/services/purchasing.js';
import { inventoryByArticle } from '../../client/src/utils/inventory.js';
import { branchMapUrl } from '../../client/src/utils/maps.js';

function setup() {
  const db = new DemoRepository(null),
    service = new Operations(db);
  return {
    db,
    service,
    purchases: new Purchasing(db, service),
    admin: db.state.profiles[0],
    branch: db.state.branches[0],
    product: db.state.products[0],
  };
}
const purchaseInput = ({ branch, product, db }, extra = {}) => ({
  branch_id: branch.id,
  supplier_id: db.state.suppliers[0].id,
  expected_date: '2028-01-01',
  note: 'Prueba',
  lines: [{ product_id: product.id, quantity: 10, unit_cost: 2.35 }],
  ...extra,
});
const receiptInput = ({ branch, product }, line, extra = {}) => ({
  branch_id: branch.id,
  product_id: product.id,
  lot: 'COMPRA-001',
  expires_at: '2029-12-31',
  quantity: 4,
  note: 'REC-001',
  purchase_line_id: line.id,
  ...extra,
});
async function confirmed(context) {
  const order = await context.purchases.create(context.admin, purchaseInput(context));
  await context.purchases.status(context.admin, order.id, { status: 'Confirmada' });
  return {
    order,
    line: (await context.db.list('purchase_order_lines', { purchase_order_id: order.id }))[0],
  };
}

test('compra: confirmar no modifica inventario; recepciones parciales completan el saldo con trazabilidad', async () => {
  const ctx = setup(),
    before = structuredClone(ctx.db.state.inventory);
  const { order, line } = await confirmed(ctx);
  assert.equal(order.total, 23.5);
  assert.deepEqual(ctx.db.state.inventory, before);
  const batch = await ctx.service.receive(ctx.admin, receiptInput(ctx, line));
  assert.equal(batch.quantity, 4);
  assert.equal((await ctx.db.get('purchase_orders', order.id)).status, 'Recibida parcialmente');
  assert.equal((await ctx.db.get('purchase_order_lines', line.id)).received_quantity, 4);
  await ctx.service.receive(ctx.admin, receiptInput(ctx, line, { quantity: 6, note: 'REC-002' }));
  assert.equal((await ctx.db.get('inventory', batch.id)).quantity, 10);
  assert.equal((await ctx.db.get('purchase_orders', order.id)).status, 'Recibida');
  assert.equal(ctx.db.state.purchase_receipts.length, 2);
  assert.equal(ctx.db.state.stock_movements.length, 2);
  assert.equal(ctx.db.state.cash_entries.length, 8);
  await assert.rejects(
    ctx.service.receive(ctx.admin, receiptInput(ctx, line)),
    (e) => e.status === 409,
  );
});

test('compra: rechaza borradores, artículos y sucursales ajenos, duplicados y sobrerrecepción', async () => {
  const ctx = setup();
  const order = await ctx.purchases.create(ctx.admin, purchaseInput(ctx));
  const line = ctx.db.state.purchase_order_lines[0];
  await assert.rejects(
    ctx.service.receive(ctx.admin, receiptInput(ctx, line)),
    (e) => e.status === 409,
  );
  await ctx.purchases.status(ctx.admin, order.id, { status: 'Confirmada' });
  await assert.rejects(
    ctx.service.receive(
      ctx.admin,
      receiptInput(ctx, line, { product_id: ctx.db.state.products[1].id }),
    ),
    /coincidir/,
  );
  await assert.rejects(
    ctx.service.receive(
      ctx.admin,
      receiptInput(ctx, line, { branch_id: ctx.db.state.branches[1].id }),
    ),
    /coincidir/,
  );
  await assert.rejects(
    ctx.service.receive(ctx.admin, receiptInput(ctx, line, { quantity: 11 })),
    /pendiente/,
  );
  await ctx.service.receive(ctx.admin, receiptInput(ctx, line));
  await assert.rejects(ctx.service.receive(ctx.admin, receiptInput(ctx, line)), /referencia/);
  assert.equal(ctx.db.state.purchase_receipts.length, 1);
});

test('compra de varias líneas: solo se completa cuando todos los artículos se reciben', async () => {
  const ctx = setup();
  const second = ctx.db.state.products[1];
  const order = await ctx.purchases.create(
    ctx.admin,
    purchaseInput(ctx, {
      lines: [
        { product_id: ctx.product.id, quantity: 2, unit_cost: 2.35 },
        { product_id: second.id, quantity: 3, unit_cost: 4.5 },
      ],
    }),
  );
  assert.equal(order.total, 18.2);
  await ctx.purchases.status(ctx.admin, order.id, { status: 'Confirmada' });
  const lines = await ctx.db.list('purchase_order_lines', { purchase_order_id: order.id });
  await ctx.service.receive(ctx.admin, receiptInput(ctx, lines[0], { quantity: 2 }));
  assert.equal((await ctx.db.get('purchase_orders', order.id)).status, 'Recibida parcialmente');
  await ctx.service.receive(
    ctx.admin,
    receiptInput({ ...ctx, product: second }, lines[1], { quantity: 3 }),
  );
  assert.equal((await ctx.db.get('purchase_orders', order.id)).status, 'Recibida');
  // Un comprobante puede contener varios artículos, pero no repetirse para la misma línea.
  assert.equal(ctx.db.state.purchase_receipts.length, 2);
});

test('compra: dos recepciones concurrentes no superan lo solicitado; cancelar conserva lo recibido', async () => {
  const ctx = setup(),
    { order, line } = await confirmed(ctx);
  const results = await Promise.allSettled([
    ctx.service.receive(ctx.admin, receiptInput(ctx, line, { quantity: 7, note: 'A' })),
    ctx.service.receive(ctx.admin, receiptInput(ctx, line, { quantity: 7, note: 'B' })),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  await ctx.purchases.status(ctx.admin, order.id, { status: 'Cancelada' });
  assert.equal((await ctx.db.get('purchase_order_lines', line.id)).received_quantity, 7);
  assert.equal(ctx.db.state.inventory.find((b) => b.lot === 'COMPRA-001').quantity, 7);
  await assert.rejects(
    ctx.service.receive(ctx.admin, receiptInput(ctx, line, { quantity: 1, note: 'C' })),
    (e) => e.status === 409,
  );
});

test('catálogo: referencias obligatorias y artículos inactivos se validan en servidor', async () => {
  const ctx = setup();
  await assert.rejects(
    ctx.purchases.create(
      ctx.admin,
      purchaseInput(ctx, {
        lines: [{ product_id: crypto.randomUUID(), quantity: 1, unit_cost: 1 }],
      }),
    ),
    (e) => e.status === 404,
  );
  await assert.rejects(
    ctx.purchases.create(
      ctx.admin,
      purchaseInput(ctx, { lines: [...purchaseInput(ctx).lines, ...purchaseInput(ctx).lines] }),
    ),
    (e) => e.name === 'ZodError',
  );
  const { id, created_at, product_id, ...asset } = ctx.db.state.assets[0];
  await assert.rejects(
    ctx.service.create(ctx.admin, 'assets', asset),
    (e) => e.name === 'ZodError',
  );
  await assert.rejects(
    ctx.service.create(ctx.admin, 'assets', {
      ...asset,
      code: 'OTHER',
      product_id: crypto.randomUUID(),
    }),
    (e) => e.status === 404,
  );
  ctx.db.state.products[0].active = false;
  await assert.rejects(ctx.purchases.create(ctx.admin, purchaseInput(ctx)), /inactivo/);
  await assert.rejects(
    ctx.service.receive(ctx.admin, { ...receiptInput(ctx, { id: null }), purchase_line_id: null }),
    /inactivo/,
  );
  await assert.rejects(
    ctx.service.quote(ctx.admin, {
      product_id: ctx.product.id,
      quantity: 1,
      latitude: 14.6,
      longitude: -90.51,
    }),
    /inactivo/,
  );
});

test('equipo: recepción y traslado sin vencimiento mantienen el artículo, sucursal y lote', async () => {
  const ctx = setup(),
    product = ctx.db.state.products.find((p) => p.article_group === 'Activos');
  const batch = await ctx.service.receive(ctx.admin, {
    branch_id: ctx.branch.id,
    product_id: product.id,
    lot: 'EQUIPO-A',
    expires_at: null,
    quantity: 2,
    note: 'INICIAL',
  });
  const transfer = await ctx.service.transfer(ctx.admin, {
    source_id: ctx.branch.id,
    destination_id: ctx.db.state.branches[1].id,
    batch_id: batch.id,
    quantity: 1,
    note: 'TRASLADO',
  });
  await ctx.service.receiveTransfer(ctx.admin, transfer.id);
  assert.equal((await ctx.db.get('inventory', batch.id)).quantity, 1);
  const destination = ctx.db.state.inventory.find(
    (b) => b.branch_id === transfer.destination_id && b.product_id === product.id,
  );
  assert.equal(destination.quantity, 1);
  assert.equal(destination.expires_at, null);
  await assert.rejects(
    ctx.service.receive(ctx.admin, {
      branch_id: ctx.branch.id,
      product_id: ctx.product.id,
      lot: 'MED-SIN-FECHA',
      quantity: 1,
      note: 'INICIAL',
    }),
    /requiere fecha/,
  );
});

test('compra: auditor y logística consultan; gerencia solo opera sus sucursales', async () => {
  const ctx = setup(),
    { order } = await confirmed(ctx);
  for (const role of ['auditor', 'logistica', 'cajero', 'rrhh'])
    await assert.rejects(
      ctx.purchases.create({ ...ctx.admin, role }, purchaseInput(ctx)),
      (e) => e.status === 403,
    );
  const other = { ...ctx.admin, role: 'gerente', branch_ids: [ctx.db.state.branches[1].id] };
  await assert.rejects(
    ctx.purchases.status(other, order.id, { status: 'Cancelada' }),
    (e) => e.status === 403,
  );
  const snapshot = await ctx.service.snapshot(other);
  for (const table of ['purchase_orders', 'purchase_order_lines', 'purchase_receipts'])
    assert.equal(snapshot.data[table].length, 0);
});

test('cliente: el pedido exige cliente activo y conserva su identidad tras editar el catálogo', async () => {
  const ctx = setup(),
    customer = ctx.db.state.customers[0];
  const input = {
    customer_id: customer.id,
    branch_id: ctx.branch.id,
    product_id: ctx.product.id,
    quantity: 1,
    address: 'Dirección acordada',
    latitude: 14.6,
    longitude: -90.51,
    payment_method: 'Efectivo',
  };
  const { customer_id, ...without } = input;
  await assert.rejects(ctx.service.order(ctx.admin, without), (e) => e.name === 'ZodError');
  await assert.rejects(
    ctx.service.order(ctx.admin, { ...input, customer_id: crypto.randomUUID() }),
    /cliente activo/,
  );
  const order = await ctx.service.order(ctx.admin, input);
  assert.equal(order.customer, customer.name);
  assert.equal(order.customer_id, customer.id);
  await ctx.db.update('customers', customer.id, { name: 'Nuevo nombre', active: false });
  assert.equal((await ctx.db.get('orders', order.id)).customer, 'Cliente de prueba');
  await assert.rejects(ctx.service.order(ctx.admin, input), /cliente activo/);
});

test('recepción: fallo de auditoría revierte compra, libro y existencias', async () => {
  const ctx = setup(),
    { order, line } = await confirmed(ctx);
  const before = structuredClone(ctx.db.state);
  ctx.service.audit = async () => {
    throw new Error('Auditoría no disponible');
  };
  await assert.rejects(ctx.service.receive(ctx.admin, receiptInput(ctx, line)), /Auditoría/);
  assert.deepEqual(ctx.db.state, before);
  assert.equal((await ctx.db.get('purchase_orders', order.id)).status, 'Confirmada');
});

test('disponible: agrega lotes por artículo y sucursal, excluye vencidos sin descontarlos dos veces', () => {
  const rows = inventoryByArticle([
    { product_id: 'A', branch_id: '1', quantity: 10, reserved: 2, expires_at: '2099-01-01' },
    { product_id: 'A', branch_id: '1', quantity: 5, reserved: 1, expires_at: '2000-01-01' },
    { product_id: 'A', branch_id: '2', quantity: 7, reserved: 0, expires_at: null },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].available, 8);
  assert.equal(rows[0].quantity, 15);
  assert.equal(rows[0].reserved, 3);
  assert.equal(rows[0].expired, 5);
  assert.equal(rows[1].available, 7);
});

test('Maps: genera URL con coordenadas válidas y rechaza valores ausentes o fuera de rango', () => {
  assert.equal(
    branchMapUrl({ latitude: 14.6, longitude: -90.51 }),
    'https://www.google.com/maps/search/?api=1&query=14.6%2C-90.51',
  );
  assert.ok(branchMapUrl({ latitude: 0, longitude: 0 }));
  for (const row of [
    { latitude: null, longitude: 0 },
    { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: 'abc' },
  ])
    assert.equal(branchMapUrl(row), null);
});
