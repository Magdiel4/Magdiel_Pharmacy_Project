import { z } from 'zod';
import { articleGroups, departments, supplierTypes } from '../../../shared/catalogs.js';
const text = z.string().trim().min(1).max(200);
const id = z.uuid();
const amount = z.coerce.number().finite().min(0).max(100000000).multipleOf(0.01);
const date = z.iso.date();
const quantity = z.coerce.number().int().min(1).max(1000000);
const orderLines = z
  .array(z.object({ product_id: id, quantity }).strict())
  .min(1)
  .max(100)
  .refine(
    (lines) => new Set(lines.map((line) => line.product_id)).size === lines.length,
    'No repitas artículos en el pedido.',
  );
const deliveryLocation = {
  latitude: z.coerce.number().finite().min(-90).max(90),
  longitude: z.coerce.number().finite().min(-180).max(180),
};
// Compatibilidad con integraciones anteriores de una sola línea.
const withOrderLines = (fields) =>
  z.union([
    z.object({ ...fields, lines: orderLines }).strict(),
    z
      .object({ ...fields, product_id: id, quantity })
      .strict()
      .transform(({ product_id, quantity, ...header }) => ({
        ...header,
        lines: [{ product_id, quantity }],
      })),
  ]);
export const roles = ['administrador', 'auditor', 'gerente', 'cajero', 'logistica', 'rrhh'];
const userScope = {
  branch_ids: z
    .array(id)
    .min(1, 'Selecciona al menos una sucursal o Todas las sucursales.')
    .max(1000)
    .refine((ids) => new Set(ids).size === ids.length, 'No repitas sucursales.')
    .nullable(),
};
const withLegacyBranch = (value) => ({ ...value, branch_id: value.branch_ids?.[0] ?? null });
export const schemas = {
  newUser: z
    .object({
      name: text,
      email: z.string().trim().toLowerCase().pipe(z.email()),
      password: z.string().min(12, 'La contraseña debe tener al menos 12 caracteres.').max(200),
      role: z.enum(roles),
      ...userScope,
      active: z.boolean().default(true),
    })
    .strict()
    .transform(withLegacyBranch),
  branches: z
    .object({
      name: text,
      department: z.enum(departments),
      address: text,
      type: z.enum(['Centro comercial', 'Gasolinera']),
      latitude: z.coerce.number().min(-90).max(90),
      longitude: z.coerce.number().min(-180).max(180),
      phone: text,
      active: z.boolean().default(true),
    })
    .strict(),
  products: z
    .object({
      name: text,
      category: text,
      price: amount,
      cost: amount,
      min_stock: z.coerce.number().int().min(0),
      prescription: z.boolean().default(false),
      article_group: z.enum(Object.keys(articleGroups)),
      active: z.boolean().default(true),
      saleable: z.boolean().default(true),
      expiration_required: z.boolean().default(true),
    })
    .strict(),
  employees: z
    .object({
      name: text,
      position: text,
      branch_id: id,
      salary: amount,
      active: z.boolean().default(true),
    })
    .strict(),
  assets: z
    .object({
      product_id: id,
      code: text,
      name: text,
      branch_id: id,
      category: text,
      purchase_date: date,
      purchase_value: amount,
      residual_value: amount,
      useful_life_months: z.coerce.number().int().min(1).max(1200),
      status: z.enum(['Operativo', 'Mantenimiento', 'Baja']),
    })
    .strict()
    .refine(
      (v) => v.residual_value <= v.purchase_value,
      'El valor residual no puede superar el costo.',
    ),
  users: z
    .object({
      id,
      name: text,
      email: z.email(),
      role: z.enum(roles),
      ...userScope,
      active: z.boolean().default(true),
    })
    .strict()
    .transform(withLegacyBranch),
  userId: id,
  receive: z
    .object({
      branch_id: id,
      product_id: id,
      lot: text,
      expires_at: date.nullable().default(null),
      quantity,
      note: text,
      purchase_line_id: id.nullable().default(null),
    })
    .strict(),
  transfer: z
    .object({ source_id: id, destination_id: id, batch_id: id, quantity, note: text })
    .strict(),
  cash: z
    .object({
      branch_id: id,
      type: z.enum(['Ingreso', 'Egreso']),
      amount: amount.refine((v) => v > 0),
      method: z.enum(['Efectivo', 'Tarjeta', 'Transferencia']),
      concept: text,
      reference: text,
    })
    .strict(),
  payroll: z
    .object({
      employee_id: id,
      period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
      bonus: amount,
      deductions: amount,
    })
    .strict(),
  pay: z.object({ reference: text }).strict(),
  quote: withOrderLines(deliveryLocation),
  order: withOrderLines({
    customer_id: id,
    branch_id: id,
    address: text,
    ...deliveryLocation,
    payment_method: z.enum(['Efectivo', 'Tarjeta', 'Transferencia']),
    prescription_verified: z.boolean().default(false),
  }),
  customers: z
    .object({
      code: text,
      name: text,
      phone: text,
      email: z.union([z.email(), z.literal('')]).default(''),
      address: text,
      latitude: z.coerce.number().finite().min(-90).max(90),
      longitude: z.coerce.number().finite().min(-180).max(180),
      active: z.boolean().default(true),
    })
    .strict(),
  suppliers: z
    .object({
      account: text.transform((v) => v.toUpperCase()),
      name: text,
      supplier_type: z.enum(supplierTypes),
      description: z.string().trim().max(200).default(''),
      nit: z
        .string()
        .trim()
        .min(1)
        .max(30)
        .transform((v) => v.toUpperCase().replace(/[\s-]/g, ''))
        .pipe(
          z
            .string()
            .regex(
              /^[0-9]+[0-9K]$/,
              'Ingresa un NIT válido, con dígitos y verificador numérico o K.',
            ),
        ),
      address: z.string().trim().max(200).default(''),
      email: z.union([z.email(), z.literal('')]).default(''),
      phone: z.string().trim().max(200).default(''),
      active: z.boolean().default(true),
    })
    .strict(),
  purchase: z
    .object({
      branch_id: id,
      supplier_id: id,
      expected_date: date,
      note: z.string().trim().max(200).default(''),
      lines: z
        .array(z.object({ product_id: id, quantity, unit_cost: amount }).strict())
        .min(1)
        .max(100)
        .refine(
          (lines) => new Set(lines.map((line) => line.product_id)).size === lines.length,
          'No repitas artículos en la orden.',
        ),
    })
    .strict(),
  purchaseStatus: z.object({ status: z.enum(['Confirmada', 'Cancelada']) }).strict(),
  status: z.object({ status: z.enum(['En ruta', 'Entregado', 'Cancelado']) }).strict(),
  login: z.object({ email: z.email(), password: z.string().min(1).max(200) }).strict(),
};
export const tables = [
  'suppliers',
  'branches',
  'products',
  'inventory',
  'transfers',
  'stock_movements',
  'cash_entries',
  'employees',
  'payroll',
  'assets',
  'orders',
  'order_lines',
  'order_allocations',
  'profiles',
  'audit_log',
  'customers',
  'purchase_orders',
  'purchase_order_lines',
  'purchase_receipts',
];
