import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { DemoRepository } from '../src/models/repository.js';
test('API: acceso anónimo, sesión, cookies seguras, RBAC y validación de origen', async (t) => {
  const app = createApp(new DemoRepository(null));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let response = await fetch(`${base}/bootstrap`);
  assert.equal(response.status, 401);
  response = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3001' },
    body: JSON.stringify({ email: 'auditor@farmaalvar.demo', password: 'FarmaDemo2026!' }),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  const headers = { 'Content-Type': 'application/json', Cookie: cookie.split(';')[0] };
  response = await fetch(`${base}/bootstrap`, { headers });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.role, 'auditor');
  response = await fetch(`${base}/records/branches`, { method: 'POST', headers, body: '{}' });
  assert.equal(response.status, 403);
  response = await fetch(`${base}/users`, { method: 'POST', headers, body: '{}' });
  assert.equal(response.status, 403);
  response = await fetch(`${base}/cash`, {
    method: 'POST',
    headers: { ...headers, Origin: 'https://attacker.example' },
    body: '{}',
  });
  assert.equal(response.status, 403);
  response = await fetch(`${base}/auth/logout`, { method: 'POST', headers, body: '{}' });
  assert.equal(response.status, 200);
  response = await fetch(`${base}/bootstrap`, { headers });
  assert.equal(response.status, 401);
});

test('API: administrador crea usuario con UID automático sin cambiar su propia sesión', async (t) => {
  const db = new DemoRepository(null),
    id = crypto.randomUUID();
  const server = createApp(db, {
    config: { mode: 'supabase', secretKey: 'clave-de-prueba' },
    authAdminFactory: () => ({ createUser: async () => ({ data: { user: { id } }, error: null }) }),
  }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let response = await fetch(`${base}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(response.status, 401);
  response = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'administrador@farmaalvar.demo', password: 'FarmaDemo2026!' }),
  });
  assert.equal(response.status, 200);
  const headers = {
    'Content-Type': 'application/json',
    Cookie: response.headers.get('set-cookie').split(';')[0],
    Origin: 'http://localhost:5173',
  };
  response = await fetch(`${base}/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'Nueva cuenta',
      email: 'nueva@example.com',
      password: 'Prueba-Segura-2026',
      role: 'auditor',
      branch_ids: null,
      active: true,
    }),
  });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.id, id);
  assert.equal(body.role, 'auditor');
  assert.equal('password' in body, false);
  assert.equal(response.headers.get('set-cookie'), null);
  response = await fetch(`${base}/bootstrap`, { headers });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.id, db.state.profiles[0].id);
});
