import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DemoRepository } from '../src/models/repository.js';
import { Operations } from '../src/services/operations.js';
import { ids } from '../src/models/seed.js';
import { canAccessBranch } from '../src/services/permissions.js';

test('RRHH: consulta y paga nómina en varias sucursales, rechazando las no asignadas', async () => {
  const db = new DemoRepository(null),
    service = new Operations(db);
  const user = {
    ...db.state.profiles.find((p) => p.role === 'rrhh'),
    branch_ids: [ids.branch1, ids.branch2],
    branch_id: ids.branch1,
  };
  const branches = [ids.branch1, ids.branch2, randomUUID()];
  for (const [i, branch_id] of branches.entries()) {
    const employee = {
      id: randomUUID(),
      name: `Empleado ${i}`,
      branch_id,
      position: 'Prueba',
      salary: 4000,
      active: true,
    };
    await db.insert('employees', employee);
    if (i < 2) {
      const payroll = await service.payroll(user, {
        employee_id: employee.id,
        period: '2026-10',
        bonus: 0,
        deductions: 0,
      });
      await service.payPayroll(user, payroll.id, { reference: `MULTI-${i}` });
    } else {
      await assert.rejects(
        service.payroll(user, {
          employee_id: employee.id,
          period: '2026-10',
          bonus: 0,
          deductions: 0,
        }),
        { status: 403 },
      );
      await db.insert('payroll', {
        id: randomUUID(),
        branch_id,
        employee_id: employee.id,
        status: 'Pendiente',
        period: '2026-10',
        net: 4000,
      });
      await assert.rejects(
        service.payPayroll(user, db.state.payroll.at(-1).id, { reference: 'NO-PERMITIDO' }),
        { status: 403 },
      );
    }
  }
  const snapshot = await service.snapshot(user);
  assert.ok(snapshot.data.employees.every((e) => user.branch_ids.includes(e.branch_id)));
  assert.equal(snapshot.data.payroll.length, 2);
  assert.ok(snapshot.data.payroll.every((p) => p.status === 'Pagado'));
  assert.equal(db.state.cash_entries.filter((c) => c.source_type === 'payroll').length, 2);
});

test('Todas las sucursales incluye nuevas sucursales; mantiene el alcance de perfiles antiguos', () => {
  const future = randomUUID();
  assert.equal(canAccessBranch({ branch_ids: null, branch_id: null }, future), true);
  assert.equal(
    canAccessBranch(
      { branch_ids: [ids.branch1, ids.branch2], branch_id: ids.branch1 },
      ids.branch2,
    ),
    true,
  );
  assert.equal(canAccessBranch({ branch_ids: [ids.branch1, ids.branch2] }, future), false);
  assert.equal(canAccessBranch({ branch_id: ids.branch1 }, ids.branch2), false);
  assert.equal(canAccessBranch({ branch_id: null }, future), true);
});

test('RRHH con Todas las sucursales puede pagar nómina en cualquier sucursal', async () => {
  const db = new DemoRepository(null),
    service = new Operations(db);
  const user = { ...db.state.profiles.find((p) => p.role === 'rrhh'), branch_ids: null };
  for (const employee of db.state.employees) {
    const payroll = await service.payroll(user, {
      employee_id: employee.id,
      period: '2026-11',
      bonus: 0,
      deductions: 0,
    });
    await service.payPayroll(user, payroll.id, { reference: `GLOBAL-${employee.id}` });
  }
  assert.equal((await service.snapshot(user)).data.payroll.length, db.state.employees.length);
  assert.ok(db.state.payroll.every((p) => p.status === 'Pagado'));
});
