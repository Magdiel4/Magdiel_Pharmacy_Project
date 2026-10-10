import test from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../src/config/env.js';
import { sameOrigin } from '../src/middleware/security.js';

function check(origin, method = 'POST') {
  let result;
  sameOrigin({ method, headers: { origin } }, {}, error => { result = error; });
  return result;
}

test('Desarrollo: permite iniciar sesión desde Vite y desde Node con ambos nombres locales', () => {
  for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173', `http://localhost:${env.port}`, `http://127.0.0.1:${env.port}`]) {
    assert.equal(check(origin), undefined, origin);
  }
});

test('Rechaza otros sitios, puertos y orígenes opacos en operaciones de escritura', () => {
  for (const origin of ['https://attacker.example', 'http://localhost:30001', 'http://localhost:5174', 'http://localhost.evil.example:5173', 'null']) {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal(check(origin, method)?.status, 403, `${method} ${origin}`);
  }
});

test('Producción: acepta solamente PUBLIC_ORIGIN, sin excepciones para localhost', () => {
  const original = { production: env.production, origin: env.origin };
  try {
    env.production = true;
    env.origin = 'https://farmacia.example';
    assert.equal(check(env.origin), undefined);
    for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173', `http://localhost:${env.port}`, `http://127.0.0.1:${env.port}`, 'https://attacker.example']) {
      assert.equal(check(origin)?.status, 403, origin);
    }
  } finally { Object.assign(env, original); }
});
