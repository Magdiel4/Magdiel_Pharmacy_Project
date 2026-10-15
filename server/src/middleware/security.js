import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
export function sameOrigin(req, res, next) {
  const allowedOrigins = new Set([env.origin]);
  // En desarrollo se puede abrir Vite o la versión compilada servida por Node.
  if (!env.production) {
    for (const host of ['localhost', '127.0.0.1']) {
      for (const port of [5173, env.port]) allowedOrigins.add(`http://${host}:${port}`);
    }
  }
  if (
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) &&
    req.headers.origin &&
    !allowedOrigins.has(req.headers.origin)
  )
    return next(new AppError('Origen no permitido.', 403));
  next();
}
export function token(req) {
  const value = req.headers.cookie
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith('fa_session='))
    ?.slice(11);
  return value || req.headers.authorization?.replace(/^Bearer /, '');
}
export function errors(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.name === 'ZodError')
    return res.status(400).json({
      error: 'Revisa los campos del formulario.',
      fields: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
  if (error.code === '23505')
    return res.status(409).json({ error: 'Ya existe un registro con esos datos.' });
  if (error.code === '23503')
    return res.status(400).json({
      error: 'La referencia no existe. Para usuarios, crea primero la cuenta en Supabase Auth.',
    });
  if (error.type === 'entity.parse.failed')
    return res.status(400).json({ error: 'JSON inválido.' });
  if (error.type === 'entity.too.large')
    return res.status(413).json({ error: 'El archivo o la solicitud supera el tamaño permitido.' });
  if (!error.status) console.error('Error interno:', error.message);
  res.status(error.status || 500).json({
    error: error.status
      ? error.message
      : 'No se pudo completar la operación. Revisa el registro del servidor.',
  });
}
