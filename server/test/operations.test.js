import test from 'node:test';
import assert from 'node:assert/strict';
import { DemoRepository } from '../src/models/repository.js';
import { Operations } from '../src/services/operations.js';
import { seedData, ids } from '../src/models/seed.js';
const setup = () => {
  const db = new DemoRepository(null, seedData());
  return {
    db,
    service: new Operations(db),
    admin: db.state.profiles[0],
    auditor: db.state.profiles[1],
    cashier: db.state.profiles[3],
  };
};
const orderInput = (db, extra = {}) => ({
  branch_id: ids.branch1,
  product_id: db.state.products[0].id,
  quantity: 2,
  customer_id: db.state.customers[0].id,
  address: 'Zona 10',
  latitude: 14.6,
  longitude: -90.51,
  payment_method: 'Efectivo',
  prescription_verified: false,
  ...extra,
});
test('inventario: dos pedidos concurrentes no pueden reservar las mismas últimas unidades', async () => {
  const { db, service, admin } = setup();
  db.state.inventory[0].quantity = 3;
  const input = orderInput(db);
  const results = await Promise.allSettled([
    service.order(admin, input),
    service.order(admin, input),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(db.state.inventory[0].reserved, 2);
  assert.equal(db.state.orders.length, 1);
});
test('entrega registra ingreso y salida una sola vez, libera reserva', async () => {
  const { db, service, admin } = setup();
  const initial = db.state.inventory[0].quantity;
  const order = await service.order(admin, orderInput(db));
  await service.orderStatus(admin, order.id, { status: 'En ruta' });
  await service.orderStatus(admin, order.id, { status: 'Entregado' });
  await assert.rejects(service.orderStatus(admin, order.id, { status: 'Entregado' }), /Transición/);
  assert.equal(db.state.inventory[0].quantity, initial - 2);
  assert.equal(db.state.inventory[0].reserved, 0);
  assert.equal(db.state.cash_entries.filter((c) => c.source_id === order.id).length, 1);
  assert.equal(db.state.stock_movements.filter((c) => c.reference === order.id).length, 1);
});
test('cancelación libera reserva sin cobrar ni reducir existencias', async () => {
  const { db, service, admin } = setup();
  const initial = db.state.inventory[0].quantity;
  const order = await service.order(admin, orderInput(db));
  await service.orderStatus(admin, order.id, { status: 'Cancelado' });
  assert.equal(db.state.inventory[0].quantity, initial);
  assert.equal(db.state.inventory[0].reserved, 0);
  assert.equal(db.state.cash_entries.filter((c) => c.source_id === order.id).length, 0);
});
test('receta, vencimiento y cobertura se validan en servidor', async () => {
  const { db, service, admin } = setup();
  await assert.rejects(
    service.order(admin, orderInput(db, { product_id: db.state.products[1].id })),
    /receta/,
  );
  await assert.rejects(service.order(admin, orderInput(db, { latitude: 16 })), /cobertura/);
  db.state.inventory[0].expires_at = '2020-01-01';
  await assert.rejects(service.order(admin, orderInput(db)), /stock/);
});
test('FEFO: reserva primero el lote con vencimiento más próximo', async () => {
  const { db, service, admin } = setup();
  const first = db.state.inventory[0];
  db.state.inventory.push({
    ...first,
    id: crypto.randomUUID(),
    lot: 'FEFO-001',
    expires_at: '2028-01-01',
    quantity: 1,
    reserved: 0,
  });
  const order = await service.order(admin, orderInput(db));
  const allocations = db.state.order_allocations.filter((a) => a.order_id === order.id);
  assert.equal(allocations[0].batch_id, db.state.inventory.at(-1).id);
  assert.equal(allocations[0].quantity, 1);
});
test('traslado descuenta al salir e ingresa una sola vez al recibir', async () => {
  const { db, service, admin } = setup();
  const batch = db.state.inventory[0],
    before = batch.quantity;
  const transfer = await service.transfer(admin, {
    source_id: ids.branch1,
    destination_id: ids.branch2,
    batch_id: batch.id,
    quantity: 10,
    note: 'Prueba',
  });
  assert.equal(db.state.inventory[0].quantity, before - 10);
  assert.equal(
    db.state.inventory.filter((b) => b.branch_id === ids.branch2 && b.lot === batch.lot).length,
    0,
  );
  await service.receiveTransfer(admin, transfer.id);
  await assert.rejects(service.receiveTransfer(admin, transfer.id), /ya fue recibido/);
  assert.equal(
    db.state.inventory.find((b) => b.branch_id === ids.branch2 && b.lot === batch.lot).quantity,
    10,
  );
});
test('traslado no puede consumir unidades reservadas', async () => {
  const { db, service, admin } = setup();
  const batch = db.state.inventory[0];
  batch.reserved = batch.quantity - 1;
  await assert.rejects(
    service.transfer(admin, {
      source_id: ids.branch1,
      destination_id: ids.branch2,
      batch_id: batch.id,
      quantity: 2,
      note: 'Prueba',
    }),
    /insuficiente/,
  );
  assert.equal(db.state.transfers.length, 0);
});
test('nómina sin usuario, período único y pago idempotente ante concurrencia', async () => {
  const { db, service, admin } = setup();
  const input = {
    employee_id: db.state.employees[0].id,
    period: '2026-10',
    bonus: 250,
    deductions: 100,
  };
  const payroll = await service.payroll(admin, input);
  assert.equal(payroll.net, 6950);
  await assert.rejects(service.payroll(admin, input), /ya existe/);
  const results = await Promise.allSettled([
    service.payPayroll(admin, payroll.id, { reference: 'BANCO-001' }),
    service.payPayroll(admin, payroll.id, { reference: 'BANCO-002' }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(db.state.cash_entries.filter((c) => c.source_id === payroll.id).length, 1);
});
test('auditor es solo lectura; cajero no ve nómina ni otras sucursales', async () => {
  const { db, service, admin, auditor, cashier } = setup();
  await assert.rejects(service.order(auditor, orderInput(db)), (e) => e.status === 403);
  await assert.rejects(
    service.order(cashier, orderInput(db, { branch_id: ids.branch2 })),
    (e) => e.status === 403,
  );
  const snapshot = await service.snapshot(cashier);
  assert.equal(snapshot.data.employees.length, 0);
  assert.equal(snapshot.data.payroll.length, 0);
  assert.equal(snapshot.data.profiles.length, 0);
  assert.ok(snapshot.data.inventory.every((i) => i.branch_id === ids.branch1));
  await assert.rejects(service.profile(cashier, { id: admin.id }), (e) => e.status === 403);
});
test('transacción revierte todos los cambios si falla auditoría', async () => {
  const { db, service, admin } = setup();
  service.audit = async () => {
    throw new Error('Fallo simulado');
  };
  await assert.rejects(service.order(admin, orderInput(db)), /simulado/);
  assert.equal(db.state.orders.length, 0);
  assert.equal(db.state.order_allocations.length, 0);
  assert.equal(db.state.inventory[0].reserved, 0);
});
test('referencia de caja evita duplicado y dinero mantiene centavos', async () => {
  const { db, service, admin } = setup();
  const input = {
    branch_id: ids.branch1,
    type: 'Ingreso',
    amount: 0.1,
    method: 'Efectivo',
    concept: 'Prueba',
    reference: 'REF-UNICA',
  };
  await service.cash(admin, input);
  await assert.rejects(service.cash(admin, input), /ya fue registrada/);
  const order = await service.order(admin, orderInput(db, { quantity: 3 }));
  assert.equal(order.total, 55.5);
});
test('edición conserva auditoría por sucursal incluso para un administrador global', async () => {
  const { db, service, admin, cashier } = setup();
  const employee = db.state.employees[0];
  const input = {
    name: employee.name,
    position: 'Supervisora',
    branch_id: employee.branch_id,
    salary: 7100,
    active: true,
  };
  await service.update(admin, 'employees', employee.id, input);
  const audit = db.state.audit_log.at(-1);
  assert.equal(audit.branch_id, employee.branch_id);
  assert.equal(audit.details.before.salary, 6800);
  assert.equal(audit.details.after.salary, 7100);
  await assert.rejects(
    service.update(cashier, 'employees', employee.id, input),
    (e) => e.status === 403,
  );
});
