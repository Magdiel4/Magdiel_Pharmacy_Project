import { randomUUID } from 'node:crypto';
import { schemas } from '../models/schemas.js';
import { allow, scope, canAccessBranch } from './permissions.js';
import { activeArticle, usableBatch } from './catalog.js';
import { assert, cents, money, today } from '../utils/errors.js';

const record = (data) => ({ id: randomUUID(), ...data, created_at: new Date().toISOString() });
const available = (batch) => Number(batch.quantity) - Number(batch.reserved);
const totalCents = (lines) => {
  const total = lines.reduce((sum, line) => sum + cents(line.unit_price) * line.quantity, 0);
  assert(
    Number.isSafeInteger(total) && total <= 99999999999999,
    'El total excede el máximo permitido.',
  );
  return total;
};

export function distanceKm(a, b, c, d) {
  const rad = (x) => (x * Math.PI) / 180;
  const h =
    Math.sin(rad(c - a) / 2) ** 2 +
    Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

async function pricedLines(db, lines) {
  const result = [];
  for (const line of lines) {
    const product = await activeArticle(db, line.product_id, true);
    result.push({
      ...line,
      sku: product.sku,
      name: product.name,
      unit_price: Number(product.price),
      prescription: product.prescription,
    });
  }
  return result;
}

export async function quoteOrder(db, user, input) {
  allow(user, 'orders');
  const data = schemas.quote.parse(input);
  const lines = await pricedLines(db, data.lines);
  const total = money(totalCents(lines));
  const branches = await db.list('branches', { active: true });
  const batches = await db.list('inventory');
  const currentDate = today();
  return branches
    .filter((b) => canAccessBranch(user, b.id))
    .map((branch) => {
      const stockLines = lines.map((line) => {
        const stock = batches
          .filter(
            (b) =>
              b.branch_id === branch.id &&
              b.product_id === line.product_id &&
              usableBatch(b, currentDate),
          )
          .reduce((sum, batch) => sum + available(batch), 0);
        return {
          ...line,
          available: stock,
          sufficient: stock >= line.quantity,
          total: money(cents(line.unit_price) * line.quantity),
        };
      });
      const distance = distanceKm(
        data.latitude,
        data.longitude,
        Number(branch.latitude),
        Number(branch.longitude),
      );
      return {
        branch_id: branch.id,
        name: branch.name,
        lines: stockLines,
        // Campo conservado para consumidores de la consulta de un solo artículo.
        available: lines.length === 1 ? stockLines[0].available : null,
        distance_km: Math.round(distance * 10) / 10,
        eta_minutes: Math.ceil(15 + (distance / 25) * 60),
        can_deliver: stockLines.every((line) => line.sufficient) && distance <= 30,
        total,
        prescription: lines.some((line) => line.prescription),
      };
    })
    .sort((a, b) => Number(b.can_deliver) - Number(a.can_deliver) || a.distance_km - b.distance_km);
}

export async function createOrder(operations, user, input) {
  allow(user, 'orders', true);
  const { lines: requested, ...header } = schemas.order.parse(input);
  scope(user, header.branch_id);
  return operations.db.transaction(async (tx) => {
    // Orden estable de bloqueos: pedidos con artículos en distinto orden no se interbloquean.
    for (const productId of requested.map((line) => line.product_id).sort())
      await tx.lock(`stock:${header.branch_id}:${productId}`);
    const branch = await operations.branch(tx, header.branch_id);
    const customer = await tx.get('customers', header.customer_id);
    assert(customer?.active, 'Selecciona un cliente activo del catálogo.');
    const lines = await pricedLines(tx, requested);
    assert(
      !lines.some((line) => line.prescription) || header.prescription_verified,
      'Se requiere verificar la receta antes de crear el pedido.',
    );
    const distance = distanceKm(
      header.latitude,
      header.longitude,
      Number(branch.latitude),
      Number(branch.longitude),
    );
    assert(distance <= 30, 'La dirección está fuera de la cobertura estimada de 30 km.');
    const total = money(totalCents(lines));
    const eta = Math.ceil(15 + (distance / 25) * 60);
    const row = await tx.insert(
      'orders',
      record({
        ...header,
        product_id: lines.length === 1 ? lines[0].product_id : null,
        quantity: lines.reduce((sum, line) => sum + line.quantity, 0),
        customer: customer.name,
        phone: customer.phone,
        total,
        status: 'Preparando',
        eta_minutes: eta,
        promised_at: new Date(Date.now() + eta * 60000).toISOString(),
        delivered_at: null,
      }),
    );
    const savedLines = [];
    const currentDate = today();
    for (const { prescription, ...line } of lines) {
      const batches = (
        await tx.list('inventory', { branch_id: header.branch_id, product_id: line.product_id })
      )
        .filter((b) => usableBatch(b, currentDate) && available(b) > 0)
        .sort(
          (a, b) =>
            (a.expires_at || '9999-12-31').localeCompare(b.expires_at || '9999-12-31') ||
            a.id.localeCompare(b.id),
        );
      assert(
        batches.reduce((sum, b) => sum + available(b), 0) >= line.quantity,
        `El stock disponible cambió para ${line.sku}. Consulta disponibilidad nuevamente.`,
        409,
      );
      const saved = await tx.insert(
        'order_lines',
        record({
          ...line,
          order_id: row.id,
          branch_id: row.branch_id,
          total: money(cents(line.unit_price) * line.quantity),
        }),
      );
      savedLines.push(saved);
      let remaining = line.quantity;
      for (const batch of batches) {
        const qty = Math.min(remaining, available(batch));
        if (!qty) break;
        await tx.update('inventory', batch.id, { reserved: Number(batch.reserved) + qty });
        await tx.insert(
          'order_allocations',
          record({ order_id: row.id, order_line_id: saved.id, batch_id: batch.id, quantity: qty }),
        );
        remaining -= qty;
      }
    }
    await operations.audit(tx, user, 'Reservar pedido', 'orders', row.id, {
      quantity: row.quantity,
      line_count: savedLines.length,
      total,
    });
    return { ...row, lines: savedLines };
  });
}
