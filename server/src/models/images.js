import { assert } from '../utils/errors.js';

export const imageTables = ['inventory', 'assets'];

export function assertImageTable(table) {
  assert(imageTables.includes(table), 'Este módulo no admite fotografías.', 404);
}

// No cargar los bytes al consultar listados ni incluirlos en respuestas o auditorías.
const columns = {
  inventory: 'id, branch_id, product_id, lot, expires_at, quantity, reserved, created_at',
  assets:
    'id, product_id, branch_id, code, name, category, purchase_date, purchase_value, residual_value, useful_life_months, status, created_at',
};

export function recordProjection(table) {
  return imageTables.includes(table)
    ? `${columns[table]}, image_updated_at, (image_data IS NOT NULL) AS has_image`
    : '*';
}

export function withoutImageData(table, row) {
  if (!row || !imageTables.includes(table)) return row;
  const { image_data, ...record } = row;
  return {
    ...record,
    has_image: Boolean(image_data),
    image_updated_at: row.image_updated_at || null,
  };
}
