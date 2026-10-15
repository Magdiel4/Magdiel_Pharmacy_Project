import { randomUUID } from 'node:crypto';
import { schemas } from '../models/schemas.js';
import { allow, scope } from './permissions.js';
import { activeArticle } from './catalog.js';
import { assert, cents, money } from '../utils/errors.js';

const record = (data) => ({ id: randomUUID(), ...data, created_at: new Date().toISOString() });
function canWrite(user) {
  allow(user, 'purchases', true);
  assert(
    ['administrador', 'gerente'].includes(user.role),
    'Solo administración o gerencia puede gestionar compras.',
    403,
  );
}

export class Purchasing {
  constructor(db, operations) {
    this.db = db;
    this.operations = operations;
  }
  async create(user, input) {
    canWrite(user);
    const data = schemas.purchase.parse(input);
    scope(user, data.branch_id);
    return this.db.transaction(async (tx) => {
      await this.operations.branch(tx, data.branch_id);
      const supplier = await tx.get('suppliers', data.supplier_id);
      assert(
        supplier?.active && !supplier.needs_review,
        'Selecciona un proveedor activo con sus datos completos.',
        409,
      );
      const lines = [];
      let totalCents = 0;
      for (const line of data.lines) {
        const article = await activeArticle(tx, line.product_id);
        totalCents += cents(line.unit_cost) * line.quantity;
        assert(
          Number.isSafeInteger(totalCents) && totalCents <= 1_000_000_000_000,
          'El importe de la compra supera el máximo permitido.',
        );
        lines.push({
          ...line,
          item_code: article.sku,
          item_name: article.name,
          received_quantity: 0,
        });
      }
      const order = await tx.insert(
        'purchase_orders',
        record({
          branch_id: data.branch_id,
          supplier_id: supplier.id,
          supplier: supplier.name,
          expected_date: data.expected_date,
          note: data.note,
          number: `OC-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`,
          status: 'Creado',
          total: money(totalCents),
        }),
      );
      for (const line of lines)
        await tx.insert(
          'purchase_order_lines',
          record({ ...line, purchase_order_id: order.id, branch_id: order.branch_id }),
        );
      await this.operations.audit(tx, user, 'Crear orden de compra', 'purchase_orders', order.id, {
        lines: lines.length,
        total: order.total,
      });
      return order;
    });
  }
  async remove(user, id) {
    canWrite(user);
    schemas.userId.parse(id);
    return this.db.transaction(async (tx) => {
      await tx.lock(`purchase:${id}`);
      const order = await tx.get('purchase_orders', id);
      assert(order && !order.deleted_at, 'Orden de compra no encontrada.', 404);
      scope(user, order.branch_id);
      assert(order.status === 'Creado', 'Solo se pueden eliminar órdenes en estado Creado.', 409);
      assert(
        !(await tx.list('purchase_receipts', { purchase_order_id: id })).length,
        'No se puede eliminar una compra con recepciones.',
        409,
      );
      await tx.update('purchase_orders', id, { deleted_at: new Date().toISOString() });
      await this.operations.audit(tx, user, 'Eliminar orden de compra', 'purchase_orders', id, {
        number: order.number,
      });
      return { ok: true };
    });
  }
  async status(user, id, input) {
    canWrite(user);
    schemas.userId.parse(id);
    const { status } = schemas.purchaseStatus.parse(input);
    return this.db.transaction(async (tx) => {
      await tx.lock(`purchase:${id}`);
      const order = await tx.get('purchase_orders', id);
      assert(order && !order.deleted_at, 'Orden de compra no encontrada.', 404);
      scope(user, order.branch_id);
      assert(
        status === 'Confirmada'
          ? order.status === 'Creado'
          : ['Creado', 'Confirmada', 'Recibida parcialmente'].includes(order.status),
        'La orden ya fue finalizada o su estado cambió.',
        409,
      );
      if (status === 'Confirmada') {
        const supplier = await tx.get('suppliers', order.supplier_id);
        assert(
          supplier?.active && !supplier.needs_review,
          'Completa y activa el proveedor antes de confirmar.',
          409,
        );
        await this.operations.branch(tx, order.branch_id);
        for (const line of await tx.list('purchase_order_lines', { purchase_order_id: id }))
          await activeArticle(tx, line.product_id);
      }
      const row = await tx.update('purchase_orders', id, { status });
      await this.operations.audit(tx, user, `Compra: ${status}`, 'purchase_orders', id, {
        previous_status: order.status,
      });
      return row;
    });
  }
}

// Orden y cantidades se bloquean antes que el stock para serializar recepciones y cancelaciones.
export async function preparePurchaseReceipt(tx, user, data) {
  if (!data.purchase_line_id) return null;
  allow(user, 'purchases', true);
  let line = await tx.get('purchase_order_lines', data.purchase_line_id);
  assert(line, 'Línea de compra no encontrada.', 404);
  scope(user, line.branch_id);
  await tx.lock(`purchase:${line.purchase_order_id}`);
  const order = await tx.get('purchase_orders', line.purchase_order_id);
  line = await tx.get('purchase_order_lines', line.id);
  assert(
    ['Confirmada', 'Recibida parcialmente'].includes(order.status),
    'Confirma la orden antes de recibir; no se permiten recepciones de órdenes cerradas.',
    409,
  );
  assert(
    order.branch_id === data.branch_id && line.product_id === data.product_id,
    'El artículo y la sucursal deben coincidir con la línea de compra.',
  );
  assert(
    data.quantity <= Number(line.quantity) - Number(line.received_quantity),
    'La cantidad supera el saldo pendiente de la compra.',
    409,
  );
  assert(
    !(await tx.list('purchase_receipts', { purchase_line_id: line.id, reference: data.note }))
      .length,
    'Esta referencia de recepción ya fue registrada para la línea.',
    409,
  );
  return { order, line };
}

export async function finishPurchaseReceipt(tx, user, data, batch, purchase, operations) {
  if (!purchase) return;
  const { order, line } = purchase;
  await tx.insert(
    'purchase_receipts',
    record({
      purchase_order_id: order.id,
      purchase_line_id: line.id,
      branch_id: order.branch_id,
      inventory_id: batch.id,
      quantity: data.quantity,
      reference: data.note,
      actor_id: user.id,
    }),
  );
  await tx.update('purchase_order_lines', line.id, {
    received_quantity: Number(line.received_quantity) + data.quantity,
  });
  const lines = await tx.list('purchase_order_lines', { purchase_order_id: order.id });
  const status = lines.every((l) => Number(l.received_quantity) === Number(l.quantity))
    ? 'Recibida'
    : 'Recibida parcialmente';
  await tx.update('purchase_orders', order.id, { status });
  await operations.audit(tx, user, 'Recibir orden de compra', 'purchase_orders', order.id, {
    purchase_line_id: line.id,
    inventory_id: batch.id,
    quantity: data.quantity,
    reference: data.note,
  });
}
