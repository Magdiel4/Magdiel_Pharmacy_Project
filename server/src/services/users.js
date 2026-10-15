import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';
import { schemas } from '../models/schemas.js';
import { allow, admin } from './permissions.js';
import { AppError, assert } from '../utils/errors.js';

export function createAuthAdmin() {
  return createClient(env.supabaseUrl, env.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }).auth.admin;
}

export class UsersService {
  constructor(db, operations, { config = env, authAdminFactory = createAuthAdmin } = {}) {
    this.db = db;
    this.operations = operations;
    this.config = config;
    this.authAdminFactory = authAdminFactory;
  }

  async remove(actor, userId) {
    allow(actor, 'users', true);
    admin(actor);
    const id = schemas.userId.parse(userId);
    assert(id !== actor.id, 'No puedes eliminar el usuario con el que has iniciado sesión.', 403);
    if (this.config.mode === 'supabase')
      assert(
        this.config.secretKey,
        'Configura SUPABASE_SECRET_KEY en el servidor para eliminar usuarios.',
        503,
      );
    // Bloqueo compartido con la edición: nunca se reactiva una eliminación pendiente.
    const target = await this.db.transaction(async (tx) => {
      await tx.lock('users:access');
      const currentActor = await tx.get('profiles', actor.id);
      allow(currentActor, 'users', true);
      admin(currentActor);
      const user = await tx.get('profiles', id);
      assert(user, 'Usuario no encontrado.', 404);
      if (user.deleted_at) return user;
      if (!user.deletion_pending) {
        await tx.update('profiles', id, { active: false, deletion_pending: true });
        await this.operations.audit(
          tx,
          currentActor,
          'Iniciar eliminación de usuario',
          'profiles',
          id,
        );
      }
      return user;
    });
    if (target.deleted_at) return { ok: true };
    if (this.config.mode === 'supabase') {
      try {
        // Baja irreversible de Auth; conserva las referencias del historial contable.
        const { error } = await this.authAdminFactory().deleteUser(id, true);
        if (error && error.code !== 'user_not_found') throw new Error('Auth no confirmó la baja');
      } catch {
        throw new AppError(
          'No se pudo confirmar la eliminación en Supabase. El acceso está bloqueado; vuelve a pulsar Eliminar para reintentar.',
          502,
        );
      }
    }
    try {
      await this.db.transaction(async (tx) => {
        await tx.lock('users:access');
        const current = await tx.get('profiles', id);
        if (current.deleted_at) return;
        await tx.update('profiles', id, {
          active: false,
          deletion_pending: false,
          deleted_at: new Date().toISOString(),
        });
        await this.operations.audit(tx, actor, 'Eliminar usuario', 'profiles', id);
      });
    } catch {
      throw new AppError(
        'La cuenta fue retirada de Supabase, pero falta finalizar su registro local. El acceso está bloqueado; reintenta Eliminar.',
        503,
      );
    }
    return { ok: true };
  }

  async create(actor, input) {
    allow(actor, 'users', true);
    admin(actor);
    const { password, ...profile } = schemas.newUser.parse(input);
    assert(
      this.config.mode === 'supabase',
      'La creación de cuentas requiere el modo Supabase.',
      503,
    );
    assert(
      this.config.secretKey,
      'La creación de usuarios aún no está habilitada. Configura SUPABASE_SECRET_KEY en el servidor y reinícialo.',
      503,
    );
    for (const id of profile.branch_ids || []) await this.operations.branch(this.db, id);
    assert(
      !(await this.db.list('profiles', { email: profile.email })).some((p) => !p.deleted_at),
      'Ya existe un usuario con ese correo.',
      409,
    );

    // Cliente separado del inicio de sesión: la clave privada nunca llega al navegador.
    const authAdmin = this.authAdminFactory();
    let result;
    try {
      result = await authAdmin.createUser({ email: profile.email, password, email_confirm: true });
    } catch {
      throw new AppError(
        'No se pudo confirmar la creación en Supabase. Revisa Authentication antes de reintentar.',
        502,
      );
    }
    if (result.error) {
      const { code, status } = result.error;
      if (['email_exists', 'user_already_exists'].includes(code))
        throw new AppError('Ese correo ya existe en Supabase. Usa Asignar acceso existente.', 409);
      if (code === 'weak_password')
        throw new AppError('La contraseña no cumple los requisitos configurados en Supabase.', 400);
      if (['email_address_invalid', 'validation_failed'].includes(code))
        throw new AppError('Revisa el correo y los datos de la nueva cuenta.', 400);
      if (status === 429)
        throw new AppError(
          'Supabase recibió demasiadas solicitudes. Espera antes de reintentar.',
          429,
        );
      if ([401, 403].includes(status))
        throw new AppError(
          'La clave privada del servidor no tiene acceso para crear usuarios en Supabase.',
          503,
        );
      throw new AppError(
        'Supabase no pudo crear la cuenta. Revisa su configuración e intenta nuevamente.',
        502,
      );
    }
    const id = result.data?.user?.id;
    assert(
      id,
      'Supabase no devolvió el identificador de la cuenta. Revisa Authentication antes de reintentar.',
      502,
    );
    try {
      return await this.db.transaction(async (tx) => {
        await tx.lock('users:access');
        const currentActor = await tx.get('profiles', actor.id);
        allow(currentActor, 'users', true);
        admin(currentActor);
        for (const id of profile.branch_ids || []) await this.operations.branch(tx, id);
        const row = await tx.insert('profiles', {
          id,
          ...profile,
          created_at: new Date().toISOString(),
        });
        await this.operations.audit(tx, actor, 'Crear usuario', 'profiles', id, {
          role: profile.role,
          active: profile.active,
          branch_ids: profile.branch_ids,
        });
        return row;
      });
    } catch {
      // Auth y PostgreSQL no comparten transacción. Solo se revierte la cuenta recién creada.
      let removed = false;
      try {
        removed = !(await authAdmin.deleteUser(id)).error;
      } catch {
        /* Se informa el UID para recuperación manual. */
      }
      if (!removed)
        throw new AppError(
          `La cuenta se creó, pero no se pudo guardar su acceso ni revertirla. Usa Asignar acceso existente con el UID ${id}.`,
          502,
        );
      throw new AppError(
        'No se pudo guardar el perfil. La cuenta recién creada fue retirada; puedes volver a intentarlo.',
        503,
      );
    }
  }
}
