import { localToday } from './format.js';

export const usableBatch = (row, today = localToday()) => !row.expires_at || row.expires_at > today;

export function inventoryByArticle(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.product_id}:${row.branch_id}`;
    const group = groups.get(key) || {
      id: key,
      product_id: row.product_id,
      branch_id: row.branch_id,
      quantity: 0,
      reserved: 0,
      expired: 0,
      available: 0,
      lots: 0,
    };
    group.quantity += Number(row.quantity);
    group.reserved += Number(row.reserved);
    group.expired += usableBatch(row) ? 0 : Number(row.quantity);
    group.available += usableBatch(row) ? Number(row.quantity) - Number(row.reserved) : 0;
    group.lots++;
    groups.set(key, group);
  }
  return [...groups.values()];
}
