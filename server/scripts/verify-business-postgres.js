import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { env } from '../src/config/env.js';
import { postgresRepository } from '../src/models/repository.js';
import { Operations } from '../src/services/operations.js';
import { Purchasing } from '../src/services/purchasing.js';

// Ejecuta el flujo real con claves foráneas y revierte TODOS los datos de prueba.
const db = postgresRepository(env.databaseUrl);
const rollback = new Error('Verificación terminada: revertir');
try {
  try {
    await db.transaction(async (tx) => {
      const admin = (await tx.list('profiles', { role: 'administrador', active: true })).find(
        (p) => !p.deleted_at && !p.deletion_pending && p.branch_ids === null,
      );
      assert.ok(admin, 'Se requiere un administrador activo de todas las sucursales.');
      const branches = await tx.list('branches', { active: true });
      assert.ok(branches.length >= 2, 'Se requieren dos sucursales activas.');
      const scopedDb = {
        transaction: (fn) => fn(tx),
        get: (...a) => tx.get(...a),
        list: (...a) => tx.list(...a),
      };
      const service = new Operations(scopedDb);
      const purchases = new Purchasing(scopedDb, service);
      const marker = randomUUID();
      const products = [];
      for (const article_group of ['Activos', 'Medicamentos']) {
        products.push(
          await service.create(admin, 'products', {
            name: `Verificación ${article_group}`,
            category: 'Prueba revertida',
            price: 10,
            cost: 5,
            min_stock: 0,
            prescription: false,
            article_group,
            active: true,
            saleable: true,
            expiration_required: article_group === 'Medicamentos',
          }),
        );
      }
      const supplier = await service.create(admin, 'suppliers', {
        account: `QA-${marker}`,
        name: 'Proveedor ficticio',
        supplier_type: 'Distribuidor',
        nit: `000${Date.now()}`,
        description: 'Prueba transaccional revertida',
      });
      const purchase = await purchases.create(admin, {
        branch_id: branches[0].id,
        supplier_id: supplier.id,
        expected_date: '2099-01-01',
        note: 'QA',
        lines: products.map((p) => ({ product_id: p.id, quantity: 3, unit_cost: 5 })),
      });
      assert.match(products[0].sku, /^ACT-\d{3,}$/);
      assert.match(products[1].sku, /^MED-\d{3,}$/);
      const disposable = await purchases.create(admin, {
        branch_id: branches[0].id,
        supplier_id: supplier.id,
        expected_date: '2099-01-01',
        lines: [{ product_id: products[0].id, quantity: 1, unit_cost: 5 }],
      });
      await purchases.remove(admin, disposable.id);
      assert.ok((await tx.get('purchase_orders', disposable.id)).deleted_at);
      await assert.rejects(
        purchases.status(admin, disposable.id, { status: 'Confirmada' }),
        (e) => e.status === 404,
      );
      await purchases.status(admin, purchase.id, { status: 'Confirmada' });
      const lines = await tx.list('purchase_order_lines', { purchase_order_id: purchase.id });
      const batches = [];
      for (const [index, product] of products.entries()) {
        const batch = await service.receive(admin, {
          branch_id: branches[0].id,
          product_id: product.id,
          lot: `QA-${marker}`,
          expires_at: product.expiration_required ? '2099-12-31' : null,
          quantity: 3,
          note: `REC-${marker}`,
          purchase_line_id: lines.find((l) => l.product_id === product.id).id,
        });
        batches.push(batch);
        assert.equal(
          (await tx.get('purchase_orders', purchase.id)).status,
          index === 0 ? 'Recibida parcialmente' : 'Recibida',
        );
      }
      const transfer = await service.transfer(admin, {
        source_id: branches[0].id,
        destination_id: branches[1].id,
        batch_id: batches[0].id,
        quantity: 1,
        note: 'QA',
      });
      await service.receiveTransfer(admin, transfer.id);
      assert.equal((await tx.get('inventory', batches[0].id)).quantity, 2);
      const asset = await service.create(admin, 'assets', {
        product_id: products[0].id,
        code: `QA-${marker}`,
        name: 'Activo de prueba',
        branch_id: branches[0].id,
        category: 'Equipo',
        purchase_date: '2026-10-13',
        purchase_value: 5,
        residual_value: 0,
        useful_life_months: 60,
        status: 'Operativo',
      });
      assert.equal(asset.product_id, products[0].id);
      const customer = await service.create(admin, 'customers', {
        code: `QA-${marker}`,
        name: 'Cliente de prueba',
        phone: '00000000',
        email: '',
        address: 'Prueba revertida',
        latitude: Number(branches[0].latitude),
        longitude: Number(branches[0].longitude),
        active: true,
      });
      const order = await service.order(admin, {
        customer_id: customer.id,
        branch_id: branches[0].id,
        lines: products.map((product) => ({ product_id: product.id, quantity: 1 })),
        address: customer.address,
        latitude: Number(customer.latitude),
        longitude: Number(customer.longitude),
        payment_method: 'Efectivo',
        prescription_verified: false,
      });
      assert.equal(order.lines.length, 2);
      assert.equal(order.product_id, null);
      assert.equal(order.quantity, 2);
      assert.equal(Number(order.total), 20);
      const allocations = await tx.list('order_allocations', { order_id: order.id });
      assert.equal(allocations.length, 2);
      assert.ok(allocations.every((a) => order.lines.some((line) => line.id === a.order_line_id)));
      await service.orderStatus(admin, order.id, { status: 'En ruta' });
      await service.orderStatus(admin, order.id, { status: 'Entregado' });
      assert.equal((await tx.list('cash_entries', { source_id: order.id })).length, 1);
      assert.equal(
        (await tx.list('purchase_receipts', { purchase_order_id: purchase.id })).length,
        2,
      );
      const orphan = await tx.query(`SELECT
        (SELECT count(*) FROM pharmacy.assets WHERE product_id IS NULL) AS assets,
        (SELECT count(*) FROM pharmacy.orders WHERE customer_id IS NULL) AS orders`);
      assert.equal(Number(orphan.rows[0].assets), 0);
      assert.equal(Number(orphan.rows[0].orders), 0);
      console.log(
        'PostgreSQL: secuencias, proveedor, compra, recepción, traslado, activo, cliente y pedido con dos líneas y un solo cobro verificados.',
      );
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  console.log('ROLLBACK confirmado: ningún registro de esta prueba quedó guardado.');
} finally {
  await db.pool.end();
}
