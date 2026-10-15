import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DemoRepository } from '../src/models/repository.js';
import { Operations } from '../src/services/operations.js';
import { UsersService } from '../src/services/users.js';
import { ids } from '../src/models/seed.js';
import { authService } from '../src/services/auth.js';

const input = (extra = {}) => ({
  name: 'Usuario de prueba',
  email: 'nuevo@example.com',
  password: 'Solo-Prueba-2026!',
  role: 'cajero',
  branch_ids: [ids.branch1],
  active: true,
  ...extra,
});
function setup() {
  const db = new DemoRepository(null);
  const operations = new Operations(db);
  const uid = randomUUID(),
    created = [],
    deleted = [];
  const provider = {
    async createUser(data) {
      created.push(data);
      return { data: { user: { id: uid } }, error: null };
    },
    async deleteUser(id) {
      deleted.push(id);
      return { error: null };
    },
  };
  const config = { mode: 'supabase', secretKey: 'clave-simulada' };
  const service = new UsersService(db, operations, { config, authAdminFactory: () => provider });
  return {
    db,
    operations,
    uid,
    created,
    deleted,
    provider,
    config,
    service,
    actor: db.state.profiles[0],
  };
}

test('Crear usuario: usa UID de Supabase y guarda rol, sucursal y auditoría sin contraseña', async () => {
  const s = setup();
  const result = await s.service.create(s.actor, input({ email: ' NUEVO@EXAMPLE.COM ' }));
  assert.equal(result.id, s.uid);
  assert.equal(result.email, 'nuevo@example.com');
  assert.equal(result.role, 'cajero');
  assert.equal(result.branch_id, ids.branch1);
  assert.deepEqual(s.created, [
    { email: 'nuevo@example.com', password: input().password, email_confirm: true },
  ]);
  assert.equal((await s.db.get('profiles', s.uid)).id, s.uid);
  assert.equal(s.db.state.audit_log.at(-1).action, 'Crear usuario');
  assert.equal(JSON.stringify(s.db.state).includes(input().password), false);
  assert.equal(JSON.stringify(result).includes('password'), false);
  assert.deepEqual(s.deleted, []);
});

test('Crear usuario: permite administrador global e inactivo, preservando el administrador existente', async () => {
  const s = setup(),
    before = structuredClone(s.actor);
  const result = await s.service.create(
    s.actor,
    input({ role: 'administrador', branch_ids: null, active: false }),
  );
  assert.equal(result.role, 'administrador');
  assert.equal(result.active, false);
  assert.equal(result.branch_id, null);
  assert.deepEqual(await s.db.get('profiles', s.actor.id), before);
});

test('Crear usuario: rechaza otros roles, administrador inactivo e input inválido antes de contactar Auth', async () => {
  const s = setup();
  for (const actor of [...s.db.state.profiles.slice(1), { ...s.actor, active: false }]) {
    await assert.rejects(s.service.create(actor, input()), { status: 403 });
  }
  for (const changes of [
    { password: 'corta' },
    { email: 'invalido' },
    { role: 'superadmin' },
    { branch_ids: [] },
    { branch_ids: undefined },
    { branch_ids: [ids.branch1, ids.branch1] },
    { id: randomUUID() },
  ]) {
    await assert.rejects(s.service.create(s.actor, input(changes)), { name: 'ZodError' });
  }
  await assert.rejects(
    s.service.create(s.actor, input({ branch_ids: [ids.branch1, randomUUID()] })),
    { status: 404 },
  );
  assert.equal(s.created.length, 0);
});

test('Crear usuario: no usa cuentas demo ni ejecuta Auth si falta la clave privada', async () => {
  const s = setup();
  s.config.mode = 'demo';
  await assert.rejects(s.service.create(s.actor, input()), { status: 503 });
  s.config.mode = 'supabase';
  s.config.secretKey = '';
  await assert.rejects(s.service.create(s.actor, input()), /SUPABASE_SECRET_KEY/);
  assert.equal(s.created.length, 0);
});

test('Crear usuario: un correo existente no se sobrescribe ni se elimina', async () => {
  const s = setup();
  await assert.rejects(s.service.create(s.actor, input({ email: s.actor.email })), { status: 409 });
  assert.equal(s.created.length, 0);
  s.provider.createUser = async () => ({ error: { code: 'email_exists', status: 422 } });
  await assert.rejects(s.service.create(s.actor, input()), { status: 409 });
  assert.deepEqual(s.deleted, []);
  assert.equal(await s.db.get('profiles', s.uid), undefined);
});

test('Crear usuario: si falla auditoría, revierte perfil y retira solamente la nueva cuenta Auth', async () => {
  const s = setup(),
    before = structuredClone(s.db.state);
  s.operations.audit = async () => {
    throw new Error('Fallo simulado');
  };
  await assert.rejects(s.service.create(s.actor, input()), /cuenta recién creada fue retirada/);
  assert.deepEqual(s.db.state, before);
  assert.deepEqual(s.deleted, [s.uid]);
});

test('Crear usuario: si no puede revertir Auth, informa el UID para recuperar su acceso', async () => {
  const s = setup();
  s.operations.audit = async () => {
    throw new Error('Fallo simulado');
  };
  s.provider.deleteUser = async () => ({ error: { status: 503 } });
  await assert.rejects(
    s.service.create(s.actor, input()),
    (error) => error.status === 502 && error.message.includes(s.uid),
  );
  assert.equal(await s.db.get('profiles', s.uid), undefined);
});

test('Crear usuario: errores del proveedor no exponen su respuesta ni credenciales', async () => {
  const s = setup();
  for (const [code, status, expected] of [
    ['weak_password', 422, 400],
    ['unexpected_failure', 500, 502],
    ['bad_jwt', 401, 503],
    ['over_request_rate_limit', 429, 429],
  ]) {
    s.provider.createUser = async () => ({
      error: { code, status, message: 'Información privada simulada' },
    });
    await assert.rejects(
      s.service.create(s.actor, input()),
      (error) =>
        error.status === expected && !error.message.includes('Información privada simulada'),
    );
  }
  s.provider.createUser = async () => {
    throw new Error('Información privada simulada');
  };
  await assert.rejects(
    s.service.create(s.actor, input()),
    /Revisa Authentication antes de reintentar/,
  );
  assert.deepEqual(s.deleted, []);
});

test('Usuarios: permite varias sucursales y exige selección explícita también al editar', async () => {
  const s = setup();
  const created = await s.service.create(
    s.actor,
    input({ role: 'rrhh', branch_ids: [ids.branch1, ids.branch2] }),
  );
  assert.deepEqual(created.branch_ids, [ids.branch1, ids.branch2]);
  const profile = {
    id: created.id,
    name: created.name,
    email: created.email,
    role: 'rrhh',
    active: true,
  };
  await assert.rejects(s.operations.profile(s.actor, profile), { name: 'ZodError' });
  await assert.rejects(s.operations.profile(s.actor, { ...profile, branch_ids: [] }), {
    name: 'ZodError',
  });
  const updated = await s.operations.profile(s.actor, { ...profile, branch_ids: null });
  assert.equal(updated.branch_ids, null);
  assert.equal(updated.branch_id, null);
});

test('Eliminar: bloquea autoeliminación y roles sin permisos antes de llamar a Supabase', async () => {
  const s = setup();
  await assert.rejects(s.service.remove(s.actor, s.actor.id), { status: 403 });
  for (const actor of s.db.state.profiles.slice(1))
    await assert.rejects(s.service.remove(actor, s.actor.id), { status: 403 });
  await assert.rejects(s.service.remove(s.actor, randomUUID()), { status: 404 });
  assert.deepEqual(s.deleted, []);
});

test('Eliminar: retira acceso y sesión, oculta el perfil y conserva referencias históricas', async () => {
  const s = setup(),
    target = s.db.state.profiles[3];
  const auth = authService(s.db);
  const { token } = await auth.login({ email: target.email, password: 'FarmaDemo2026!' });
  await s.operations.cash(target, {
    branch_id: ids.branch1,
    type: 'Ingreso',
    amount: 10,
    method: 'Efectivo',
    concept: 'Prueba',
    reference: 'DELETE-HISTORY',
  });
  const before = structuredClone(s.db.state.audit_log);
  const calls = [];
  s.provider.deleteUser = async (...args) => {
    calls.push(args);
    return { error: null };
  };
  await s.service.remove(s.actor, target.id);
  assert.deepEqual(calls, [[target.id, true]]);
  const removed = await s.db.get('profiles', target.id);
  assert.equal(removed.active, false);
  assert.ok(removed.deleted_at);
  assert.equal(removed.deletion_pending, false);
  assert.deepEqual(s.db.state.audit_log.slice(0, before.length), before);
  assert.equal(
    (await s.operations.snapshot(s.actor)).data.profiles.some((p) => p.id === target.id),
    false,
  );
  await assert.rejects(auth.user(token), { status: 403 });
  await assert.rejects(
    s.operations.profile(s.actor, {
      id: target.id,
      name: target.name,
      email: target.email,
      role: target.role,
      branch_ids: [ids.branch1],
      active: true,
    }),
    { status: 409 },
  );
  await s.service.remove(s.actor, target.id);
  assert.equal(calls.length, 1);
});

test('Eliminar: fallo de Auth mantiene acceso bloqueado y permite reintentar sin reactivar', async () => {
  const s = setup(),
    target = s.db.state.profiles[1];
  s.provider.deleteUser = async () => ({ error: { status: 503 } });
  await assert.rejects(s.service.remove(s.actor, target.id), { status: 502 });
  let row = await s.db.get('profiles', target.id);
  assert.equal(row.active, false);
  assert.equal(row.deletion_pending, true);
  assert.equal(row.deleted_at, undefined);
  await assert.rejects(
    s.operations.profile(s.actor, {
      id: target.id,
      name: target.name,
      email: target.email,
      role: target.role,
      branch_ids: null,
      active: true,
    }),
    { status: 409 },
  );
  s.provider.deleteUser = async () => ({ error: { code: 'user_not_found', status: 404 } });
  await s.service.remove(s.actor, target.id);
  row = await s.db.get('profiles', target.id);
  assert.ok(row.deleted_at);
  assert.equal(row.deletion_pending, false);
});

test('Eliminar: dos administradores no pueden eliminarse simultáneamente y dejar cero administradores', async () => {
  const s = setup();
  const second = await s.service.create(
    s.actor,
    input({ role: 'administrador', branch_ids: null }),
  );
  const results = await Promise.allSettled([
    s.service.remove(s.actor, second.id),
    s.service.remove(second, s.actor.id),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    s.db.state.profiles.filter((p) => p.role === 'administrador' && p.active && !p.deleted_at)
      .length,
    1,
  );
});
