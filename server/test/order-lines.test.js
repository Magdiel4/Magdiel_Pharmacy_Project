import test from 'node:test';
import assert from 'node:assert/strict';
import { DemoRepository } from '../src/models/repository.js';
import { Operations } from '../src/services/operations.js';
import { upgradeDemoData } from '../src/models/legacyDemo.js';

function setup() {
  const db = new DemoRepository(null);
  const service = new Operations(db);
  const admin = db.state.profiles[0];
  const input = {
    customer_id: db.state.customers[0].id,
    branch_id: db.state.branches[0].id,
    address: 'Dirección de prueba',
    latitude: 14.6,
    longitude: -90.51,
    payment_method: 'Efectivo',
    lines: [
      { product_id: db.state.products[0].id, quantity: 2 },
      { product_id: db.state.products[2].id, quantity: 3 },
    ],
  };
  return { db, service, admin, input };
}

test('pedido multilínea: una cabecera, precios históricos, reservas por línea y un solo cobro', async () => {
  const { db, service, admin, input } = setup();
  const before = structuredClone(db.state.inventory);
  const order = await service.order(admin, input);
  assert.equal(db.state.orders.length, 1);
  assert.equal(order.product_id, null);
  assert.equal(order.quantity, 5);
  assert.equal(order.total, 133);
  assert.equal(order.lines.length, 2);
  for (const line of order.lines) {
    const allocations = db.state.order_allocations.filter((a) => a.order_line_id === line.id);
    assert.equal(
      allocations.reduce((sum, a) => sum + a.quantity, 0),
      line.quantity,
    );
    assert.ok(
      allocations.every(
        (a) => db.state.inventory.find((b) => b.id === a.batch_id).product_id === line.product_id,
      ),
    );
  }
  const originalName = order.lines[0].name;
  await db.update('products', input.lines[0].product_id, { name: 'Nombre editado', price: 999 });
  assert.equal((await db.get('order_lines', order.lines[0].id)).name, originalName);
  const snapshot = await service.snapshot(admin);
  assert.equal(snapshot.data.order_lines.length, 2);
  assert.equal(snapshot.data.orders[0].customer_id, input.customer_id);
  await service.orderStatus(admin, order.id, { status: 'En ruta' });
  await service.orderStatus(admin, order.id, { status: 'Entregado' });
  const cash = db.state.cash_entries.filter((entry) => entry.source_id === order.id);
  assert.equal(cash.length, 1);
  assert.equal(cash[0].amount, 133);
  for (const line of input.lines) {
    const batch = db.state.inventory.find(
      (b) => b.branch_id === input.branch_id && b.product_id === line.product_id,
    );
    assert.equal(batch.reserved, 0);
    assert.equal(batch.quantity, before.find((b) => b.id === batch.id).quantity - line.quantity);
  }
  await assert.rejects(service.orderStatus(admin, order.id, { status: 'Entregado' }), /Transición/);
});

test('pedido multilínea: segunda línea insuficiente revierte cabecera, líneas, reservas y auditoría', async () => {
  const { db, service, admin, input } = setup();
  input.lines[1].quantity = 1000000;
  const before = structuredClone(db.state);
  await assert.rejects(service.order(admin, input), /stock disponible cambió/);
  assert.deepEqual(db.state, before);
});

test('pedido multilínea: cancelar libera todas las reservas sin cobrar ni consumir stock', async () => {
  const { db, service, admin, input } = setup();
  const before = structuredClone(db.state.inventory);
  const order = await service.order(admin, input);
  await service.orderStatus(admin, order.id, { status: 'Cancelado' });
  assert.deepEqual(db.state.inventory, before);
  assert.equal(db.state.cash_entries.filter((entry) => entry.source_id === order.id).length, 0);
});

test('pedido multilínea: concurrencia con orden inverso no sobrevende ningún artículo', async () => {
  const { db, service, admin, input } = setup();
  for (const line of input.lines)
    db.state.inventory.find(
      (b) => b.branch_id === input.branch_id && b.product_id === line.product_id,
    ).quantity = line.quantity;
  const results = await Promise.allSettled([
    service.order(admin, input),
    service.order(admin, { ...input, lines: [...input.lines].reverse() }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(db.state.orders.length, 1);
  assert.equal(db.state.order_lines.length, 2);
});

test('disponibilidad: requiere todos los artículos en una sucursal y respeta reservas, vencimiento y alcance', async () => {
  const { db, service, admin, input } = setup();
  const query = { lines: input.lines, latitude: input.latitude, longitude: input.longitude };
  let quotes = await service.quote(admin, query);
  assert.equal(quotes[0].can_deliver, true);
  assert.equal(quotes[0].total, 133);
  const batch = db.state.inventory.find(
    (b) => b.branch_id === input.branch_id && b.product_id === input.lines[1].product_id,
  );
  batch.reserved = batch.quantity - 2;
  quotes = await service.quote(admin, query);
  const near = quotes.find((q) => q.branch_id === input.branch_id);
  assert.equal(near.can_deliver, false);
  assert.equal(near.lines[1].available, 2);
  batch.expires_at = '2000-01-01';
  const scoped = { ...admin, role: 'cajero', branch_ids: [input.branch_id] };
  quotes = await service.quote(scoped, query);
  assert.equal(quotes.length, 1);
  assert.equal(quotes[0].lines[1].available, 0);
});

test('pedido multilínea: rechaza duplicados, vacío, cantidades inválidas, precio enviado y receta pendiente', async () => {
  const { db, service, admin, input } = setup();
  for (const lines of [
    [],
    [input.lines[0], input.lines[0]],
    [{ ...input.lines[0], quantity: 0 }],
    [{ ...input.lines[0], unit_price: 0 }],
    [{ ...input.lines[0], quantity: 1.5 }],
  ])
    await assert.rejects(service.order(admin, { ...input, lines }), (e) => e.name === 'ZodError');
  await assert.rejects(
    service.order(admin, {
      ...input,
      lines: [input.lines[0], { product_id: db.state.products[1].id, quantity: 1 }],
    }),
    /receta/,
  );
  assert.equal(db.state.orders.length, 0);
});

test('pedido multilínea: vencimiento durante reparto revierte toda la entrega y permite cancelar', async () => {
  const { db, service, admin, input } = setup();
  const order = await service.order(admin, input);
  await service.orderStatus(admin, order.id, { status: 'En ruta' });
  db.state.inventory.find(
    (b) => b.branch_id === input.branch_id && b.product_id === input.lines[1].product_id,
  ).expires_at = '2000-01-01';
  const before = structuredClone(db.state);
  await assert.rejects(service.orderStatus(admin, order.id, { status: 'Entregado' }), /venció/);
  assert.deepEqual(db.state, before);
  await service.orderStatus(admin, order.id, { status: 'Cancelado' });
  assert.ok(db.state.inventory.every((b) => b.reserved === 0));
});

test('pedido multilínea: las líneas no se exponen ni se despachan desde otra sucursal', async () => {
  const { db, service, admin, input } = setup();
  const order = await service.order(admin, input);
  const other = { ...admin, role: 'gerente', branch_ids: [db.state.branches[1].id] };
  const snapshot = await service.snapshot(other);
  assert.equal(snapshot.data.orders.length, 0);
  assert.equal(snapshot.data.order_lines.length, 0);
  await assert.rejects(
    service.orderStatus(other, order.id, { status: 'En ruta' }),
    (e) => e.status === 403,
  );
});

test('demo histórico: actualización idempotente conserva cantidades, importes y reservas de pedidos previos', async () => {
  const { db, service, admin, input } = setup();
  const order = await service.order(admin, { ...input, lines: [input.lines[0]] });
  const old = structuredClone(db.state);
  delete old.order_lines;
  for (const allocation of old.order_allocations) delete allocation.order_line_id;
  const upgraded = upgradeDemoData(old);
  assert.equal(upgraded.order_lines.length, 1);
  assert.equal(upgraded.order_lines[0].total, order.total);
  assert.equal(upgraded.order_allocations[0].order_line_id, order.id);
  assert.deepEqual(upgraded.inventory, db.state.inventory);
  const again = structuredClone(upgraded);
  assert.deepEqual(upgradeDemoData(upgraded), again);
  const migrated = new Operations(new DemoRepository(null, upgraded));
  await migrated.orderStatus(admin, order.id, { status: 'Cancelado' });
});
