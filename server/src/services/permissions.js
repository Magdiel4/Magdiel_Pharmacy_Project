import { assert } from '../utils/errors.js';
export const permissions = {
  administrador: [
    'dashboard',
    'branches',
    'inventory',
    'transfers',
    'cash',
    'employees',
    'payroll',
    'assets',
    'orders',
    'users',
    'audit',
    'articles',
    'purchases',
    'customers',
  ],
  auditor: [
    'dashboard',
    'branches',
    'inventory',
    'transfers',
    'cash',
    'employees',
    'payroll',
    'assets',
    'orders',
    'audit',
    'articles',
    'purchases',
    'customers',
  ],
  gerente: [
    'dashboard',
    'branches',
    'inventory',
    'transfers',
    'cash',
    'assets',
    'orders',
    'articles',
    'purchases',
    'customers',
  ],
  cajero: ['dashboard', 'inventory', 'cash', 'orders', 'articles', 'customers'],
  logistica: [
    'dashboard',
    'branches',
    'inventory',
    'transfers',
    'orders',
    'articles',
    'purchases',
    'customers',
  ],
  rrhh: ['dashboard', 'employees', 'payroll'],
};
for (const role of ['administrador', 'gerente', 'auditor', 'logistica'])
  permissions[role].push('suppliers');
export function allow(user, module, write = false) {
  assert(
    user?.active &&
      !user.deleted_at &&
      !user.deletion_pending &&
      permissions[user.role]?.includes(module) &&
      (!write || user.role !== 'auditor'),
    'No tienes permiso para esta operación.',
    403,
  );
}
export function branchIds(user) {
  return user.branch_ids === undefined
    ? user.branch_id
      ? [user.branch_id]
      : null
    : user.branch_ids;
}
export function canAccessBranch(user, branchId) {
  const ids = branchIds(user);
  return ids === null || ids.includes(branchId);
}
export function scope(user, branchId) {
  assert(canAccessBranch(user, branchId), 'La sucursal está fuera de tu acceso.', 403);
}
export function admin(user) {
  assert(user.role === 'administrador', 'Solo administración puede realizar esta operación.', 403);
}
