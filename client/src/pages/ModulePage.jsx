import { useState } from 'react';
import {
  Plus,
  Download,
  ArrowUpRight,
  Check,
  Truck,
  X,
  Pencil,
  Trash2,
  Camera,
  MapPin,
  ArrowLeftRight,
  Layers,
} from 'lucide-react';
import { Badge, DataTable, Modal, RecordForm } from '../components/UI';
import RecordImage, { ImageThumbnail } from '../components/RecordImage';
import { currency, date, number, bookValue, exportCsv, localToday } from '../utils/format';
import { api } from '../services/api';
import OrderForm from './OrderForm';
import OrderDetails from './OrderDetails';
import CreateUserForm from './CreateUserForm';
import ReceiveInventoryForm from './ReceiveInventoryForm';
import TransferForm from './TransferForm';
import { articleGroups, departments, supplierTypes } from '../../../shared/catalogs.js';
import { inventoryByArticle, usableBatch } from '../utils/inventory';
import { branchMapUrl } from '../utils/maps';
const f = (name, label, extra = {}) => ({ name, label, ...extra });
const amount = (name, label) => f(name, label, { type: 'number', min: 0 });
const labels = {
  suppliers: [
    'Proveedores',
    'Cuentas y datos de proveedores para órdenes de compra.',
    'Nuevo proveedor',
  ],
  articles: [
    'Artículos',
    'Catálogo único para compras, inventario, activos y ventas.',
    'Nuevo artículo',
  ],
  customers: ['Clientes', 'Directorio de clientes para pedidos y entregas.', 'Nuevo cliente'],
  branches: [
    'Sucursales',
    'Tu red, conectada. Administra cada punto de atención.',
    'Nueva sucursal',
  ],
  inventory: [
    'Inventario',
    'Disponibilidad por código de artículo y sucursal, con detalle por lote.',
    'Recibir inventario',
  ],
  transfers: [
    'Traslados',
    'Coordina el movimiento de artículos entre sucursales.',
    'Nuevo traslado',
  ],
  cash: [
    'Caja y movimientos',
    'Ingresos y egresos con referencia y trazabilidad.',
    'Registrar movimiento',
  ],
  employees: [
    'Empleados',
    'Administra al personal, sin necesidad de una cuenta de usuario.',
    'Nuevo empleado',
  ],
  payroll: [
    'Nómina',
    'Prepara la nómina y registra los pagos de cada empleado.',
    'Preparar nómina',
  ],
  assets: [
    'Activos fijos',
    'Ubicación, costo y valor contable estimado de tus activos.',
    'Nuevo activo',
  ],
  orders: [
    'Pedidos y entregas',
    'Consulta disponibilidad, reserva medicamentos y coordina entregas.',
    'Nuevo pedido',
  ],
  users: [
    'Usuarios y roles',
    'Controla quién puede acceder y operar en cada sucursal.',
    'Nuevo usuario',
  ],
  audit: ['Auditoría', 'Historial de operaciones registrado por el servidor.', ''],
};
export default function ModulePage({ page, data, allData, user, reload, notify }) {
  const [photo, setPhoto] = useState(null);
  const [inventoryMode, setInventoryMode] = useState('summary');
  const [stockFocus, setStockFocus] = useState(null);
  const [orderDetails, setOrderDetails] = useState(null);
  const supportsPhotos = page === 'assets' || (page === 'inventory' && inventoryMode === 'lots');
  const canEditPhotos = ['administrador', 'gerente'].includes(user.role);
  const [modal, setModal] = useState(null),
    [busy, setBusy] = useState(false);
  const writable = user.role !== 'auditor';
  const branchName = (id) =>
    allData.branches.find((b) => b.id === id)?.name ||
    allData.destinations.find((b) => b.id === id)?.name ||
    'Sucursal';
  const productName = (id) => {
    const p = allData.products.find((p) => p.id === id);
    return p ? `${p.sku} · ${p.name}` : 'Artículo';
  };
  const employeeName = (id) => allData.employees.find((p) => p.id === id)?.name || 'Empleado';
  const branchOptions = allData.branches
    .filter((b) => b.active)
    .map((b) => ({ value: b.id, label: b.name }));
  const productOptions = allData.products
    .filter((p) => p.active || p.id === modal?.initial?.product_id)
    .map((p) => ({
      value: p.id,
      label: `${p.name} · ${p.sku}`,
    }));
  const articleCategoryOptions = [
    ...new Set(allData.products.map((p) => p.category).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, 'es'));
  const branch = f('branch_id', 'Sucursal', { options: branchOptions });
  const product = f('product_id', 'Artículo', { options: productOptions });
  const status = { key: 'status', label: 'Estado', render: (r) => <Badge>{r.status}</Badge> };
  const bcol = { key: 'branch_id', label: 'Sucursal', value: (r) => branchName(r.branch_id) };
  const pcol = { key: 'product_id', label: 'Artículo', value: (r) => productName(r.product_id) };
  const moneyCol = (key, label) => ({ key, label, value: (r) => currency(r[key]) });
  const dateCol = (key, label) => ({ key, label, value: (r) => date(r[key]) });
  const configs = {
    suppliers: {
      rows: data.suppliers,
      columns: [
        { key: 'account', label: 'Cuenta de proveedor' },
        { key: 'name', label: 'Proveedor' },
        { key: 'supplier_type', label: 'Tipo de proveedor' },
        { key: 'nit', label: 'NIT' },
        { key: 'email', label: 'Correo' },
        { key: 'phone', label: 'Teléfono' },
        {
          key: 'active',
          label: 'Estado',
          render: (r) => (
            <Badge>
              {r.needs_review ? 'Pendiente de completar' : r.active ? 'Activo' : 'Inactivo'}
            </Badge>
          ),
        },
      ],
      fields: [
        f('account', 'Cuenta de proveedor'),
        f('name', 'Nombre de proveedor'),
        f('supplier_type', 'Tipo de proveedor', { options: supplierTypes }),
        f('nit', 'NIT'),
        f('description', 'Descripción', { optional: true, wide: true }),
        f('address', 'Dirección', { optional: true, wide: true }),
        f('email', 'Correo electrónico', { type: 'email', optional: true }),
        f('phone', 'Teléfono', { optional: true }),
        f('active', 'Proveedor activo', { type: 'checkbox', defaultValue: true }),
      ],
      path: '/records/suppliers',
      canCreate: ['administrador', 'gerente'].includes(user.role),
      note: 'La cuenta y el NIT deben ser únicos. Completa el NIT y activa los proveedores históricos antes de seleccionarlos en nuevas compras.',
    },
    articles: {
      rows: data.products,
      columns: [
        { key: 'sku', label: 'Código de artículo' },
        { key: 'name', label: 'Artículo' },
        { key: 'article_group', label: 'Grupo de artículos' },
        { key: 'category', label: 'Categoría' },
        moneyCol('price', 'Precio de venta'),
        moneyCol('cost', 'Costo de referencia'),
        {
          key: 'active',
          label: 'Estado',
          render: (r) => <Badge>{r.active ? 'Activo' : 'Inactivo'}</Badge>,
        },
      ],
      fields: [
        f('sku', 'Código de artículo', {
          readOnly: true,
          optional: true,
          omit: true,
          placeholder: 'Automático al guardar',
        }),
        f('name', 'Nombre / presentación'),
        f('article_group', 'Grupo de artículos', { options: Object.keys(articleGroups) }),
        f('category', 'Categoría', { options: articleCategoryOptions }),
        amount('price', 'Precio de venta (Q)'),
        amount('cost', 'Costo de referencia (Q)'),
        f('min_stock', 'Stock mínimo por sucursal', {
          type: 'number',
          min: 0,
          step: 1,
          defaultValue: 0,
        }),
        f('prescription', 'Requiere receta', { type: 'checkbox' }),
        f('expiration_required', 'Controla vencimiento', { type: 'checkbox', defaultValue: true }),
        f('saleable', 'Habilitado para venta', { type: 'checkbox', defaultValue: true }),
        f('active', 'Artículo activo', { type: 'checkbox', defaultValue: true }),
      ],
      path: '/records/products',
      canCreate: user.role === 'administrador',
      note: 'Código automático por grupo: Medicamentos MED, Suministros SUM y Activos ACT. Al cambiar de grupo se asigna un código nuevo y se conserva el historial. Para activos sin caducidad desmarca Controla vencimiento.',
    },
    customers: {
      rows: data.customers,
      columns: [
        { key: 'code', label: 'Código de cliente' },
        { key: 'name', label: 'Cliente' },
        { key: 'phone', label: 'Teléfono' },
        { key: 'email', label: 'Correo' },
        { key: 'address', label: 'Dirección' },
        {
          key: 'active',
          label: 'Estado',
          render: (r) => <Badge>{r.active ? 'Activo' : 'Inactivo'}</Badge>,
        },
      ],
      fields: [
        f('code', 'Código de cliente'),
        f('name', 'Nombre'),
        f('phone', 'Teléfono'),
        f('email', 'Correo', { type: 'email', optional: true }),
        f('address', 'Dirección de entrega', { wide: true }),
        f('latitude', 'Latitud', { type: 'number', min: -90, max: 90, step: 'any' }),
        f('longitude', 'Longitud', { type: 'number', min: -180, max: 180, step: 'any' }),
        f('active', 'Cliente activo', { type: 'checkbox', defaultValue: true }),
      ],
      path: '/records/customers',
      canCreate: ['administrador', 'gerente', 'cajero'].includes(user.role),
      note: 'Directorio compartido entre sucursales. Los pedidos conservan los datos de entrega utilizados al crearlos.',
    },
    branches: {
      rows: data.branches,
      columns: [
        {
          key: 'name',
          label: 'Sucursal',
          render: (r) => (
            <div className="primary-cell">
              <strong>{r.name}</strong>
              <small>{r.address}</small>
            </div>
          ),
        },
        { key: 'department', label: 'Departamento' },
        { key: 'type', label: 'Ubicación' },
        { key: 'phone', label: 'Teléfono' },
        {
          key: 'active',
          label: 'Estado',
          render: (r) => <Badge>{r.active ? 'Activo' : 'Inactivo'}</Badge>,
        },
      ],
      fields: [
        f('name', 'Nombre'),
        f('department', 'Departamento', { options: departments }),
        f('address', 'Dirección', { wide: true }),
        f('type', 'Tipo de ubicación', { options: ['Centro comercial', 'Gasolinera'] }),
        f('phone', 'Teléfono'),
        f('latitude', 'Latitud', {
          type: 'number',
          min: -90,
          max: 90,
          step: 'any',
          defaultValue: 14.6,
        }),
        f('longitude', 'Longitud', {
          type: 'number',
          min: -180,
          max: 180,
          step: 'any',
          defaultValue: -90.5,
        }),
        f('active', 'Sucursal activa', { type: 'checkbox', defaultValue: true }),
      ],
      path: '/records/branches',
      canCreate: user.role === 'administrador',
    },
    inventory: {
      rows: data.inventory,
      columns: [
        {
          key: 'product_id',
          label: 'Artículo / lote',
          value: (r) => `${productName(r.product_id)} · ${r.lot}`,
          render: (r) => (
            <div className="primary-cell record-identity">
              <strong>{productName(r.product_id)}</strong>
              <small>{r.lot}</small>
            </div>
          ),
        },
        bcol,
        { key: 'quantity', label: 'Existencia' },
        { key: 'reserved', label: 'Reservado' },
        {
          key: 'available',
          label: 'Disponible',
          value: (r) => (usableBatch(r) ? Number(r.quantity) - Number(r.reserved) : 0),
        },
        {
          key: 'expires_at',
          label: 'Vencimiento',
          render: (r) => (
            <div>
              {r.expires_at ? date(r.expires_at) : 'Sin vencimiento'}
              {!usableBatch(r) && <Badge>Vencido</Badge>}
            </div>
          ),
        },
      ],
      fields: [
        branch,
        product,
        f('lot', 'Número de lote'),
        f('expires_at', 'Vencimiento', { type: 'date' }),
        f('quantity', 'Cantidad', { type: 'number', step: 1, min: 1 }),
        f('note', 'Referencia / motivo', { placeholder: 'Factura o comprobante de recepción' }),
      ],
      path: '/inventory/receive',
      note: 'Después de registrar la recepción, puedes adjuntar una fotografía al lote desde el listado.',
      canCreate: ['administrador', 'gerente'].includes(user.role),
    },
    transfers: {
      rows: data.transfers,
      columns: [
        pcol,
        { key: 'source_id', label: 'Origen', value: (r) => branchName(r.source_id) },
        { key: 'destination_id', label: 'Destino', value: (r) => branchName(r.destination_id) },
        { key: 'quantity', label: 'Unidades' },
        status,
        dateCol('created_at', 'Enviado'),
      ],
      fields: [
        f('source_id', 'Sucursal de origen', { options: branchOptions }),
        f('destination_id', 'Sucursal de destino', {
          options: allData.destinations.map((b) => ({ value: b.id, label: b.name })),
        }),
        f('batch_id', 'Lote de origen', {
          wide: true,
          options: allData.inventory
            .filter((i) => usableBatch(i) && Number(i.quantity) > Number(i.reserved))
            .map((i) => ({
              value: i.id,
              label: `${branchName(i.branch_id)} · ${productName(i.product_id)} · ${i.lot} (${Number(i.quantity) - Number(i.reserved)})`,
            })),
        }),
        f('quantity', 'Cantidad', { type: 'number', min: 1, step: 1 }),
        f('note', 'Referencia / responsable'),
      ],
      path: '/transfers',
      actions: (r) =>
        r.status === 'En tránsito' &&
        writable &&
        (user.branch_ids === null ||
          (user.branch_ids || (user.branch_id ? [user.branch_id] : null))?.includes(
            r.destination_id,
          ) ||
          (user.branch_ids === undefined && !user.branch_id)) && (
          <button
            className="table-action"
            disabled={busy}
            onClick={() =>
              setModal({
                title: 'Confirmar recepción',
                fields: [],
                path: `/transfers/${r.id}/receive`,
                note: `Confirma la recepción física de ${r.quantity} unidades de ${productName(r.product_id)} en ${branchName(r.destination_id)}.`,
                submitLabel: 'Confirmar recepción',
              })
            }
          >
            <Check size={14} />
            Recibir
          </button>
        ),
    },
    cash: {
      rows: [...data.cash_entries].sort((a, b) => b.created_at.localeCompare(a.created_at)),
      columns: [
        dateCol('created_at', 'Fecha'),
        { key: 'concept', label: 'Concepto' },
        bcol,
        { key: 'type', label: 'Movimiento', render: (r) => <Badge>{r.type}</Badge> },
        moneyCol('amount', 'Monto'),
        { key: 'method', label: 'Medio de pago' },
        { key: 'reference', label: 'Referencia' },
      ],
      fields: [
        branch,
        f('type', 'Movimiento', { options: ['Ingreso', 'Egreso'] }),
        amount('amount', 'Monto (Q)'),
        f('method', 'Medio de pago', { options: ['Efectivo', 'Tarjeta', 'Transferencia'] }),
        f('concept', 'Concepto'),
        f('reference', 'Referencia única'),
      ],
      path: '/cash',
      note: 'Registra cobros y egresos reales. Los pedidos entregados y pagos de nómina generan sus movimientos automáticamente.',
    },
    employees: {
      rows: data.employees,
      columns: [
        { key: 'name', label: 'Empleado' },
        { key: 'position', label: 'Puesto' },
        bcol,
        moneyCol('salary', 'Salario base'),
        {
          key: 'active',
          label: 'Estado',
          render: (r) => <Badge>{r.active ? 'Activo' : 'Inactivo'}</Badge>,
        },
      ],
      fields: [
        f('name', 'Nombre completo'),
        f('position', 'Puesto'),
        branch,
        amount('salary', 'Salario base mensual (Q)'),
        f('active', 'Empleado activo', { type: 'checkbox', defaultValue: true }),
      ],
      path: '/records/employees',
    },
    payroll: {
      rows: data.payroll,
      columns: [
        { key: 'employee_id', label: 'Empleado', value: (r) => employeeName(r.employee_id) },
        { key: 'period', label: 'Período' },
        bcol,
        moneyCol('base_salary', 'Base'),
        moneyCol('bonus', 'Bonos'),
        moneyCol('deductions', 'Deducciones'),
        moneyCol('net', 'Neto'),
        status,
      ],
      fields: [
        f('employee_id', 'Empleado', {
          wide: true,
          options: allData.employees
            .filter((e) => e.active)
            .map((e) => ({ value: e.id, label: `${e.name} · ${currency(e.salary)}` })),
        }),
        f('period', 'Período', { type: 'month', defaultValue: localToday().slice(0, 7) }),
        { ...amount('bonus', 'Bonos (Q)'), defaultValue: 0 },
        { ...amount('deductions', 'Deducciones (Q)'), defaultValue: 0 },
      ],
      path: '/payroll',
      note: 'Las deducciones y bonificaciones se ingresan manualmente según la planilla aprobada. Registrar un pago no ejecuta una transferencia bancaria.',
      actions: (r) =>
        r.status === 'Pendiente' &&
        writable && (
          <button
            className="table-action"
            disabled={busy}
            onClick={() =>
              setModal({
                title: 'Registrar pago de nómina',
                fields: [f('reference', 'Referencia del comprobante bancario', { wide: true })],
                path: `/payroll/${r.id}/pay`,
                note: `Empleado: ${employeeName(r.employee_id)}. Neto: ${currency(r.net)}. Confirma únicamente cuando el pago haya sido realizado.`,
                submitLabel: 'Registrar pago',
              })
            }
          >
            Registrar pago
            <ArrowUpRight size={14} />
          </button>
        ),
    },
    assets: {
      rows: data.assets,
      columns: [
        {
          key: 'product_id',
          label: 'Código artículo',
          value: (r) => allData.products.find((p) => p.id === r.product_id)?.sku || '—',
        },
        {
          key: 'name',
          label: 'Activo / código',
          value: (r) => `${r.name} · ${r.code}`,
          render: (r) => (
            <div className="primary-cell record-identity">
              <strong>{r.name}</strong>
              <small>
                {r.code} · {r.category}
              </small>
            </div>
          ),
        },
        bcol,
        moneyCol('purchase_value', 'Adquisición'),
        {
          key: 'book_value',
          label: 'Valor estimado',
          value: (r) => currency(bookValue(r)),
        },
        status,
      ],
      fields: [
        product,
        f('code', 'Código de activo'),
        f('name', 'Nombre'),
        branch,
        f('category', 'Categoría'),
        f('purchase_date', 'Fecha de adquisición', { type: 'date' }),
        amount('purchase_value', 'Valor de compra (Q)'),
        amount('residual_value', 'Valor residual (Q)'),
        f('useful_life_months', 'Vida útil (meses)', { type: 'number', min: 1, step: 1 }),
        f('status', 'Estado', { options: ['Operativo', 'Mantenimiento', 'Baja'] }),
      ],
      path: '/records/assets',
      note: 'La depreciación mostrada es una estimación lineal por mes; requiere validación contable antes de usarla en estados financieros.',
    },
    orders: {
      rows: [...data.orders].sort((a, b) => b.created_at.localeCompare(a.created_at)),
      columns: [
        {
          key: 'customer',
          label: 'Cliente',
          render: (r) => (
            <div className="primary-cell">
              <strong>{r.customer}</strong>
              <small>{r.phone}</small>
            </div>
          ),
        },
        {
          key: 'articles',
          label: 'Artículos',
          value: (r) =>
            allData.order_lines
              .filter((line) => line.order_id === r.id)
              .map((line) => `${line.sku} · ${line.name} × ${line.quantity}`)
              .join('; '),
        },
        bcol,
        { key: 'quantity', label: 'Unidades' },
        moneyCol('total', 'Total'),
        {
          key: 'promised_at',
          label: 'Compromiso estimado',
          value: (r) =>
            new Date(r.promised_at).toLocaleString('es-GT', { timeZone: 'America/Guatemala' }),
          render: (r) => (
            <div
              className={
                !['Entregado', 'Cancelado'].includes(r.status) &&
                new Date(r.promised_at) < new Date()
                  ? 'overdue'
                  : ''
              }
            >
              {new Date(r.promised_at).toLocaleString('es-GT', { timeZone: 'America/Guatemala' })}
            </div>
          ),
        },
        status,
      ],
      actions: (r) => (
        <>
          <button className="table-action" onClick={() => setOrderDetails(r)}>
            <Layers size={14} />
            Ver líneas
          </button>
          {writable && (
            <>
              {r.status === 'Preparando' && (
                <button
                  className="table-action"
                  disabled={busy}
                  onClick={() => orderAction(r, 'En ruta')}
                >
                  <Truck size={14} />
                  Despachar
                </button>
              )}
              {r.status === 'En ruta' && (
                <button
                  className="table-action"
                  disabled={busy}
                  onClick={() => orderAction(r, 'Entregado')}
                >
                  <Check size={14} />
                  Entregar
                </button>
              )}
              {['Preparando', 'En ruta'].includes(r.status) && (
                <button
                  className="table-action danger"
                  disabled={busy}
                  onClick={() => orderAction(r, 'Cancelado')}
                  aria-label="Cancelar pedido"
                >
                  <X size={14} />
                </button>
              )}
            </>
          )}
        </>
      ),
    },
    users: {
      rows: data.profiles,
      columns: [
        { key: 'id', label: 'User UID' },
        { key: 'name', label: 'Nombre' },
        { key: 'email', label: 'Correo' },
        { key: 'role', label: 'Rol' },
        {
          key: 'branch_ids',
          label: 'Sucursales',
          value: (r) =>
            r.branch_ids === null || (r.branch_ids === undefined && !r.branch_id)
              ? 'Todas las sucursales'
              : (r.branch_ids || [r.branch_id]).map(branchName).join(', '),
        },
        {
          key: 'active',
          label: 'Estado',
          render: (r) => (
            <Badge>
              {r.deletion_pending ? 'Eliminación pendiente' : r.active ? 'Activo' : 'Inactivo'}
            </Badge>
          ),
        },
      ],
      path: '/users',
      method: 'PUT',
      actions: (r) =>
        user.role === 'administrador' && (
          <>
            {r.id !== user.id && (
              <button
                className="table-action"
                disabled={busy || r.deletion_pending}
                onClick={() =>
                  setModal({
                    ...configs.users,
                    userForm: 'edit',
                    title: 'Editar acceso',
                    initial: r,
                  })
                }
              >
                <Pencil size={14} />
                Editar
              </button>
            )}
            <button
              className="table-action danger"
              disabled={busy || r.id === user.id}
              title={r.id === user.id ? 'No puedes eliminar tu propia sesión' : 'Eliminar usuario'}
              onClick={() =>
                setModal({
                  title: 'Eliminar usuario',
                  fields: [],
                  path: `/users/${r.id}`,
                  method: 'DELETE',
                  submitLabel: 'Eliminar usuario',
                  note: `Se eliminará el acceso de ${r.name} (${r.email}). Esta acción no se puede deshacer. Se conservará el historial de sus operaciones.`,
                })
              }
            >
              <Trash2 size={14} />
              {r.deletion_pending ? 'Reintentar eliminación' : 'Eliminar'}
            </button>
          </>
        ),
    },
    audit: {
      rows: [...data.audit_log].sort((a, b) => b.created_at.localeCompare(a.created_at)),
      columns: [
        dateCol('created_at', 'Fecha'),
        { key: 'actor_name', label: 'Usuario' },
        { key: 'action', label: 'Acción' },
        { key: 'entity', label: 'Entidad' },
        { key: 'entity_id', label: 'Identificador' },
        { key: 'details', label: 'Detalle', value: (r) => JSON.stringify(r.details) },
      ],
      canCreate: false,
    },
  };
  const config = configs[page];
  const [title, description, button] = labels[page];
  if (
    ['branches', 'employees', 'assets', 'articles', 'customers', 'suppliers'].includes(page) &&
    writable &&
    config.canCreate !== false
  )
    config.actions = (r) => (
      <button
        className="table-action"
        onClick={() =>
          setModal({
            ...config,
            title: 'Editar registro',
            initial: r,
            path: `/records/${page === 'articles' ? 'products' : page}/${r.id}`,
            method: 'PUT',
          })
        }
      >
        <Pencil size={14} />
        Editar
      </button>
    );
  if (page === 'branches') {
    const edit = config.actions;
    config.actions = (row) => (
      <>
        {branchMapUrl(row) ? (
          <a
            className="table-action"
            href={branchMapUrl(row)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MapPin size={15} />
            Ver ubicación
          </a>
        ) : (
          <span>Sin coordenadas</span>
        )}
        {edit?.(row)}
      </>
    );
  }
  if (page === 'customers') {
    const edit = config.actions;
    config.actions = (row) => (
      <>
        {branchMapUrl(row) ? (
          <a
            className="table-action"
            href={branchMapUrl(row)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MapPin size={15} />
            Ver ubicación
          </a>
        ) : (
          <span>Sin coordenadas</span>
        )}
        {writable && row.active && (
          <button
            className="table-action"
            onClick={() => setModal({ order: true, customerId: row.id })}
          >
            <Plus size={15} />
            Crear pedido
          </button>
        )}
        {edit?.(row)}
      </>
    );
  }
  if (page === 'inventory' && inventoryMode === 'summary') {
    config.rows = inventoryByArticle(data.inventory);
    config.columns = [
      {
        key: 'product_id',
        label: 'Código de artículo',
        value: (r) => allData.products.find((p) => p.id === r.product_id)?.sku || '—',
      },
      {
        key: 'name',
        label: 'Artículo',
        value: (r) => allData.products.find((p) => p.id === r.product_id)?.name,
      },
      bcol,
      { key: 'quantity', label: 'Existencia física' },
      { key: 'reserved', label: 'Reservado' },
      { key: 'expired', label: 'Vencido' },
      { key: 'available', label: 'Disponible' },
      { key: 'lots', label: 'Lotes' },
    ];
    config.actions = (row) => (
      <button
        className="table-action"
        onClick={() => {
          setStockFocus(row);
          setInventoryMode('lots');
        }}
      >
        <Layers size={15} />
        Ver lotes / trasladar
      </button>
    );
  }
  if (page === 'inventory' && inventoryMode === 'lots' && stockFocus)
    config.rows = config.rows.filter(
      (r) => r.branch_id === stockFocus.branch_id && r.product_id === stockFocus.product_id,
    );
  const photoLabel = (row) =>
    page === 'inventory'
      ? `${productName(row.product_id)} · Lote ${row.lot} · ${branchName(row.branch_id)}`
      : `${row.code} · ${row.name} · ${branchName(row.branch_id)}`;
  if (supportsPhotos) {
    config.columns.unshift({
      key: 'has_image',
      label: 'Foto',
      value: (row) => (row.has_image ? 'Con fotografía' : 'Sin fotografía'),
      render: (row) => (
        <ImageThumbnail
          entity={page}
          row={row}
          label={photoLabel(row)}
          onClick={() => setPhoto(row)}
        />
      ),
    });
    const editAction = config.actions;
    config.actions = (row) => (
      <>
        <button className="table-action" onClick={() => setPhoto(row)}>
          <Camera size={15} />
          {row.has_image ? 'Ver foto' : canEditPhotos ? 'Adjuntar foto' : 'Sin foto'}
        </button>
        {editAction?.(row)}
        {page === 'inventory' &&
          ['administrador', 'gerente', 'logistica'].includes(user.role) &&
          usableBatch(row) &&
          Number(row.quantity) > Number(row.reserved) && (
            <button
              className="table-action"
              onClick={() =>
                setModal({
                  ...configs.transfers,
                  transfer: true,
                  title: `Trasladar ${productName(row.product_id)}`,
                  initial: { source_id: row.branch_id, batch_id: row.id },
                  fields: configs.transfers.fields.map((field) =>
                    field.name === 'source_id'
                      ? {
                          ...field,
                          options: branchOptions.filter((b) => b.value === row.branch_id),
                        }
                      : field.name === 'batch_id'
                        ? {
                            ...field,
                            options: field.options.filter((option) => option.value === row.id),
                          }
                        : field,
                  ),
                })
              }
            >
              <ArrowLeftRight size={15} />
              Trasladar
            </button>
          )}
      </>
    );
  }
  function orderAction(row, status) {
    setModal({
      title: `${status === 'Entregado' ? 'Confirmar entrega y cobro' : status === 'Cancelado' ? 'Cancelar pedido' : 'Despachar pedido'}`,
      fields: [],
      path: `/orders/${row.id}/status`,
      method: 'PATCH',
      extra: { status },
      note:
        status === 'Entregado'
          ? `Confirma que ${row.customer} recibió el medicamento y se cobró ${currency(row.total)} por ${row.payment_method}. Se registrará el ingreso y la salida de stock.`
          : status === 'Cancelado'
            ? 'Se liberará el inventario reservado.'
            : 'El pedido pasará a En ruta.',
      submitLabel: 'Confirmar',
    });
  }
  async function save(values) {
    setBusy(true);
    try {
      await api(modal.path, { ...values, ...modal.extra }, modal.method);
      setModal(null);
      notify('Operación registrada correctamente.');
      await reload();
    } catch (error) {
      if (modal.method === 'DELETE') await reload().catch(() => {});
      throw error;
    } finally {
      setBusy(false);
    }
  }
  const totalCash = data.cash_entries.reduce(
    (s, c) => s + (c.type === 'Ingreso' ? 1 : -1) * Number(c.amount),
    0,
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="heading-actions">
          <button
            className="button secondary"
            onClick={() => exportCsv(title, config.columns, config.rows)}
          >
            <Download size={16} />
            Exportar
          </button>
          {page === 'users' && user.role === 'administrador' && (
            <button
              className="button secondary"
              onClick={() =>
                setModal({
                  ...configs.users,
                  userForm: 'assign',
                  title: 'Asignar acceso existente',
                })
              }
            >
              Asignar acceso existente
            </button>
          )}
          {writable && config.canCreate !== false && (
            <button
              className="button primary"
              onClick={() =>
                setModal(
                  page === 'orders'
                    ? { order: true }
                    : page === 'inventory'
                      ? { receive: true, title: 'Recibir inventario' }
                      : page === 'users'
                        ? {
                            createUser: true,
                            title: 'Nuevo usuario',
                            path: '/users',
                            method: 'POST',
                          }
                        : { ...config, title: button, transfer: page === 'transfers' },
                )
              }
            >
              <Plus size={17} />
              {button}
            </button>
          )}
        </div>
      </div>
      {page === 'cash' && (
        <div className="summary-strip">
          <span>
            Saldo acumulado <strong>{currency(totalCash)}</strong>
          </span>
          {['Efectivo', 'Tarjeta', 'Transferencia'].map((m) => (
            <span key={m}>
              {m}
              <strong>
                {currency(
                  data.cash_entries
                    .filter((c) => c.method === m)
                    .reduce((s, c) => s + (c.type === 'Ingreso' ? 1 : -1) * Number(c.amount), 0),
                )}
              </strong>
            </span>
          ))}
        </div>
      )}
      {page === 'payroll' && (
        <div className="summary-strip">
          <span>
            Personal registrado<strong>{data.employees.length}</strong>
          </span>
          <span>
            Pendiente de pago
            <strong>
              {currency(
                data.payroll
                  .filter((p) => p.status === 'Pendiente')
                  .reduce((s, p) => s + Number(p.net), 0),
              )}
            </strong>
          </span>
          <span>
            Pagos registrados
            <strong>
              {currency(
                data.payroll
                  .filter((p) => p.status === 'Pagado')
                  .reduce((s, p) => s + Number(p.net), 0),
              )}
            </strong>
          </span>
        </div>
      )}
      {page === 'assets' && (
        <div className="summary-strip">
          <span>
            Activos registrados<strong>{data.assets.length}</strong>
          </span>
          <span>
            Valor de adquisición
            <strong>
              {currency(data.assets.reduce((s, a) => s + Number(a.purchase_value), 0))}
            </strong>
          </span>
          <span>
            Valor contable estimado
            <strong>
              {currency(
                data.assets
                  .filter((a) => a.status !== 'Baja')
                  .reduce((s, a) => s + bookValue(a), 0),
              )}
            </strong>
          </span>
        </div>
      )}
      {page === 'inventory' && (
        <div className="summary-strip">
          <span>
            Lotes registrados<strong>{number(data.inventory.length)}</strong>
          </span>
          <span>
            Unidades disponibles
            <strong>
              {number(
                data.inventory
                  .filter((r) => usableBatch(r))
                  .reduce((sum, r) => sum + Number(r.quantity) - Number(r.reserved), 0),
              )}
            </strong>
          </span>
          <span>
            Lotes vencidos
            <strong>{number(data.inventory.filter((r) => !usableBatch(r)).length)}</strong>
          </span>
          <span>
            Con fotografía
            <strong>{number(data.inventory.filter((r) => r.has_image).length)}</strong>
          </span>
        </div>
      )}
      {page === 'inventory' && (
        <div className="inventory-tabs" aria-label="Vista del inventario">
          <button
            className={`button ${inventoryMode === 'summary' ? 'primary' : 'secondary'}`}
            aria-pressed={inventoryMode === 'summary'}
            onClick={() => {
              setInventoryMode('summary');
              setStockFocus(null);
            }}
          >
            Por artículo y sucursal
          </button>
          <button
            className={`button ${inventoryMode === 'lots' ? 'primary' : 'secondary'}`}
            aria-pressed={inventoryMode === 'lots'}
            onClick={() => {
              setInventoryMode('lots');
              setStockFocus(null);
            }}
          >
            Detalle por lote y fotografías
          </button>
          {stockFocus && (
            <span>
              {productName(stockFocus.product_id)} · {branchName(stockFocus.branch_id)}
            </span>
          )}
        </div>
      )}
      <section className={`panel module-panel ${supportsPhotos ? 'with-photos' : ''}`}>
        <div className="panel-heading">
          <div>
            <h2>
              {page === 'inventory'
                ? inventoryMode === 'summary'
                  ? 'Disponible por artículo y sucursal'
                  : 'Existencias por lote'
                : title}
            </h2>
            <p>{config.rows.length} registros en la selección actual</p>
          </div>
        </div>
        <DataTable columns={config.columns} rows={config.rows} actions={config.actions} />
      </section>
      {supportsPhotos && (
        <p className="page-note">
          <Camera size={16} />
          Selecciona la miniatura para ver la fotografía
          {canEditPhotos ? ', adjuntarla o reemplazarla' : ''}.
        </p>
      )}
      {photo && (
        <RecordImage
          entity={page}
          row={photo}
          label={photoLabel(photo)}
          canEdit={canEditPhotos}
          onClose={() => setPhoto(null)}
          onSaved={async (result) => {
            setPhoto(null);
            notify(
              result.has_image ? 'Fotografía guardada correctamente.' : 'Fotografía eliminada.',
            );
            await reload();
          }}
        />
      )}
      {page === 'inventory' && (
        <p className="page-note">
          Las unidades reservadas se excluyen de la disponibilidad. Los lotes vencidos no pueden
          asignarse a pedidos ni enviarse en traslados.
        </p>
      )}
      {page === 'orders' && (
        <p className="page-note">
          ETA orientativa: distancia en línea recta, velocidad de referencia de 25 km/h y 15 minutos
          de preparación. Cobertura inicial: 30 km. No incluye tráfico ni validación de rutas.
        </p>
      )}
      {page === 'audit' && (
        <p className="page-note">
          Los registros de auditoría son de solo lectura. Usa la exportación CSV para revisar
          operaciones fuera del sistema.
        </p>
      )}
      {orderDetails && (
        <Modal
          wide
          title="Detalle del pedido"
          subtitle={`Pedido ${orderDetails.id}`}
          onClose={() => setOrderDetails(null)}
        >
          <OrderDetails
            order={orderDetails}
            lines={allData.order_lines.filter((line) => line.order_id === orderDetails.id)}
            branchName={branchName(orderDetails.branch_id)}
          />
        </Modal>
      )}
      {modal &&
        (modal.order ? (
          <Modal
            wide
            title="Nuevo pedido"
            subtitle="Disponibilidad en el momento de la atención"
            onClose={() => !busy && setModal(null)}
          >
            <OrderForm
              data={allData}
              initialCustomerId={modal.customerId}
              onBusyChange={setBusy}
              onClose={() => setModal(null)}
              onSaved={async () => {
                setModal(null);
                notify('Pedido creado. Inventario reservado.');
                await reload();
              }}
            />
          </Modal>
        ) : (
          <Modal title={modal.title} onClose={() => !busy && setModal(null)}>
            {modal.transfer ? (
              <TransferForm
                data={allData}
                initial={modal.initial}
                onSubmit={save}
                onClose={() => setModal(null)}
              />
            ) : modal.receive ? (
              <ReceiveInventoryForm
                data={allData}
                onBusyChange={setBusy}
                onClose={() => setModal(null)}
                onSaved={async () => {
                  setModal(null);
                  notify('Recepción registrada correctamente.');
                  await reload();
                }}
              />
            ) : modal.createUser || modal.userForm ? (
              <CreateUserForm
                mode={modal.userForm || 'create'}
                initial={modal.initial}
                branches={allData.branches}
                onSubmit={save}
                onClose={() => setModal(null)}
              />
            ) : (
              <RecordForm
                fields={modal.fields}
                initial={modal.initial}
                onSubmit={save}
                onClose={() => setModal(null)}
                note={modal.note}
                submitLabel={modal.submitLabel}
              />
            )}
          </Modal>
        ))}
    </>
  );
}
