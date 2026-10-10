import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const git = args => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
const files = git(['ls-files', '--cached', '-z']).split('\0').filter(Boolean);
if (!files.length) throw new Error('Prepara los archivos con git add antes de revisar el commit.');
const checks = [
  ['clave privada', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['JWT', /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/],
  ['clave de proveedor', /(?:sb_secret_|sb_publishable_|gh[pousr]_|github_pat_|sk_live_|sk-proj-)[A-Za-z0-9_-]{16,}/],
  ['identificador AWS', /\bAKIA[A-Z0-9]{16}\b/],
  ['correo personal', /[A-Z0-9._%+-]+@(?:gmail|hotmail|outlook|yahoo|icloud)\.[A-Z]{2,}/i],
  ['ruta personal de Windows', /[A-Z]:[\\/]Users[\\/][^\s'"<>]+/i],
  ['proyecto Supabase concreto', /https:\/\/[a-z0-9]{20}\.supabase\.co|supabase\.com\/dashboard\/project\/[a-z0-9]{20}/],
  ['URI con credenciales', /postgres(?:ql)?:\/\/(?!USUARIO:CONTRASENA_CODIFICADA@)[^\s'"<>:]+:[^\s'"<>@]+@/i]
];
const issues = [];
for (const file of files) {
  const name = file.split('/').at(-1);
  const privatePath = /(^|\/)(node_modules|dist|\.npm-cache|\.playwright|coverage|backups|\.ssh|\.aws|\.codex|\.agents)(\/|$)|(^|\/)(server\/data|supabase\/local|docs\/local|docs\/screenshots)(\/|$)|\.(dump|backup|db|sqlite3?|key|pem|p12|pfx|log)$/i;
  if (privatePath.test(file) || (name.startsWith('.env') && name !== '.env.example') || ['.npmrc', '.netrc', '.git-credentials'].includes(name)) {
    issues.push(file + ': archivo privado o generado'); continue;
  }
  const content = git(['show', ':' + file]);
  for (const [label, pattern] of checks) if (pattern.test(content)) issues.push(file + ': posible ' + label);
}
if (issues.length) {
  console.error('Revisión fallida (no se muestran los valores detectados):\n' + issues.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Revisión aprobada: ' + files.length + ' archivos preparados, sin coincidencias sensibles detectadas.');
}
