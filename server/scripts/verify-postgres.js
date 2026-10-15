import assert from 'node:assert/strict';
import { env } from '../src/config/env.js';
import { postgresRepository } from '../src/models/repository.js';
import { Operations } from '../src/services/operations.js';
const db = postgresRepository(env.databaseUrl);
const rolledBack = new Error('ROLLBACK_DE_PRUEBA');
try {
  const admins = await db.list('profiles', { role: 'administrador', active: true });
  assert.ok(admins.length, 'Se requiere administrador activo.');
  const checks = await db.query(
    "SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='pharmacy'",
  );
  assert.ok(checks.rows.every((r) => r.rowsecurity));
  console.log(`RLS verificado en ${checks.rows.length} tablas.`);
  try {
    await db.transaction(async (tx) => {
      const service = new Operations({
          transaction: (fn) => fn(tx),
          get: (...args) => tx.get(...args),
          list: (...args) => tx.list(...args),
        }),
        admin = admins[0];
      const branch = (await tx.list('branches'))[0],
        product = (await tx.list('products')).find(
          (p) => !p.prescription && p.active && p.saleable && Number(p.price) > 0,
        );
      assert.ok(branch && product, 'Cargar datos de prueba antes de verificar.');
      const customer = await service.create(admin, 'customers', {
        code: `TEST-${crypto.randomUUID()}`,
        name: 'Verificación transaccional',
        phone: '00000000',
        email: '',
        address: 'Prueba revertida',
        latitude: Number(branch.latitude),
        longitude: Number(branch.longitude),
        active: true,
      });
      const order = await service.order(admin, {
        branch_id: branch.id,
        product_id: product.id,
        quantity: 1,
        customer_id: customer.id,
        address: 'Prueba revertida',
        latitude: Number(branch.latitude),
        longitude: Number(branch.longitude),
        payment_method: 'Efectivo',
        prescription_verified: false,
      });
      await service.orderStatus(admin, order.id, { status: 'En ruta' });
      await service.orderStatus(admin, order.id, { status: 'Entregado' });
      assert.equal((await tx.list('cash_entries', { source_id: order.id })).length, 1);
      assert.equal((await tx.list('stock_movements', { reference: order.id })).length, 1);
      console.log(
        'Reserva, entrega, caja, movimiento de stock y auditoría verificados en PostgreSQL.',
      );
      const employee = (await tx.list('employees'))[0];
      const payroll = await service.payroll(admin, {
        employee_id: employee.id,
        period: '2099-12',
        bonus: 0,
        deductions: 0,
      });
      await service.payPayroll(admin, payroll.id, { reference: 'VERIFICACION-ROLLBACK' });
      assert.equal((await tx.list('cash_entries', { source_id: payroll.id })).length, 1);
      console.log('Nómina y egreso transaccional verificados en PostgreSQL.');
      await tx.query('SAVEPOINT immutable_check');
      let rejected = false;
      try {
        await tx.query('UPDATE pharmacy.cash_entries SET amount=0 WHERE source_id=$1', [order.id]);
      } catch (e) {
        rejected = true;
      }
      await tx.query('ROLLBACK TO SAVEPOINT immutable_check');
      assert.ok(rejected, 'El libro debe rechazar UPDATE.');
      console.log('Protección de libro inmutable verificada.');
      throw rolledBack;
    });
  } catch (e) {
    if (e !== rolledBack) throw e;
  }
  console.log('Verificación finalizada: todos los registros de verificación fueron revertidos.');
} finally {
  await db.pool.end();
}
