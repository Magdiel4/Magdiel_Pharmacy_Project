import { assert } from '../utils/errors.js';
export const permissions = {
  administrador: ['dashboard','branches','inventory','transfers','cash','employees','payroll','assets','orders','users','audit'],
  auditor: ['dashboard','branches','inventory','transfers','cash','employees','payroll','assets','orders','audit'],
  gerente: ['dashboard','branches','inventory','transfers','cash','assets','orders'],
  cajero: ['dashboard','inventory','cash','orders'],
  logistica: ['dashboard','branches','inventory','transfers','orders'],
  rrhh: ['dashboard','employees','payroll']
};
export function allow(user, module, write=false) { assert(user?.active && !user.deleted_at && !user.deletion_pending && permissions[user.role]?.includes(module) && (!write || user.role!=='auditor'), 'No tienes permiso para esta operación.',403); }
export function branchIds(user) { return user.branch_ids === undefined ? (user.branch_id ? [user.branch_id] : null) : user.branch_ids; }
export function canAccessBranch(user, branchId) { const ids=branchIds(user); return ids===null || ids.includes(branchId); }
export function scope(user, branchId) { assert(canAccessBranch(user,branchId), 'La sucursal está fuera de tu acceso.',403); }
export function admin(user) { assert(user.role==='administrador','Solo administración puede realizar esta operación.',403); }
