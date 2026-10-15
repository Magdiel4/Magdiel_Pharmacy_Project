import { createClient } from '@supabase/supabase-js';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { assert } from '../utils/errors.js';
import { schemas } from '../models/schemas.js';
export function authService(db) {
  const sessions = new Map();
  const makeClient = () =>
    createClient(env.supabaseUrl, env.publicKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  function equal(a, b) {
    const x = Buffer.from(a),
      y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
  }
  return {
    async login(input) {
      const { email, password } = schemas.login.parse(input);
      if (env.mode === 'demo') {
        const user = (await db.list('profiles', { email }))[0];
        assert(
          user?.active && equal(password, env.demoPassword),
          'Correo o contraseña incorrectos.',
          401,
        );
        const token = randomBytes(32).toString('hex');
        for (const [key, s] of sessions) if (s.expires < Date.now()) sessions.delete(key);
        sessions.set(token, { id: user.id, expires: Date.now() + 8 * 3600000 });
        return { token, user };
      }
      const { data, error } = await makeClient().auth.signInWithPassword({ email, password });
      assert(!error && data.session, 'Correo o contraseña incorrectos.', 401);
      const user = await db.get('profiles', data.user.id);
      assert(
        user?.active && !user.deleted_at && !user.deletion_pending,
        'Tu usuario aún no tiene acceso asignado.',
        403,
      );
      return { token: data.session.access_token, user };
    },
    async user(token) {
      assert(token, 'Inicia sesión para continuar.', 401);
      let id;
      if (env.mode === 'demo') {
        const session = sessions.get(token);
        assert(
          session && session.expires > Date.now(),
          'La sesión venció. Inicia sesión nuevamente.',
          401,
        );
        id = session.id;
      } else {
        const { data, error } = await makeClient().auth.getUser(token);
        assert(!error && data.user, 'Sesión inválida o vencida.', 401);
        id = data.user.id;
      }
      const user = await db.get('profiles', id);
      assert(
        user?.active && !user.deleted_at && !user.deletion_pending,
        'Tu acceso está desactivado.',
        403,
      );
      return user;
    },
    async logout(token) {
      if (env.mode === 'demo') sessions.delete(token);
    },
  };
}
