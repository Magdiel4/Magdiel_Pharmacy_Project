import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
export const env = {
  mode: process.env.APP_MODE || 'demo', production: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 3001), origin: process.env.PUBLIC_ORIGIN || 'http://localhost:5173',
  demoPassword: process.env.DEMO_PASSWORD || 'FarmaDemo2026!',
  supabaseUrl: process.env.SUPABASE_URL, publicKey: process.env.SUPABASE_PUBLISHABLE_KEY,
  secretKey: process.env.SUPABASE_SECRET_KEY, databaseUrl: process.env.DATABASE_URL
};
export function validateEnv() {
  if (!['demo', 'supabase'].includes(env.mode)) throw new Error('APP_MODE debe ser demo o supabase.');
  if (env.production && env.mode === 'demo') throw new Error('No se permite publicar el modo demo en producción.');
  if (env.production && !env.origin.startsWith('https://')) throw new Error('PUBLIC_ORIGIN debe usar HTTPS en producción.');
  if (env.mode === 'supabase' && (!env.supabaseUrl || !env.publicKey || !env.databaseUrl)) throw new Error('Faltan SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY o DATABASE_URL.');
}
