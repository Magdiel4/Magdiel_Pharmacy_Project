import { useState } from 'react';
import { Plus, Eye, Check, X, PackageCheck, Trash2 } from 'lucide-react';
import { Badge, DataTable, Modal, RecordForm } from '../components/UI';
import { currency, date } from '../utils/format';
import { api } from '../services/api';
import PurchaseOrderForm from './PurchaseOrderForm';
import ReceiveInventoryForm from './ReceiveInventoryForm';

export default function PurchasesPage({ data, allData, user, reload, notify }) {
  const [modal, setModal] = useState(null),
    [busy, setBusy] = useState(false);
  const writable = ['administrador', 'gerente'].includes(user.role);
  const branchName = (id) => allData.branches.find((b) => b.id === id)?.name || 'Sucursal';
  const order = modal?.order;
  const lines = order
    ? allData.purchase_order_lines.filter((l) => l.purchase_order_id === order.id)
    : [];
  const receipts = order
    ? allData.purchase_receipts.filter((r) => r.purchase_order_id === order.id)
    : [];
  async function saved(message) {
    setModal(null);
    notify(message);
    await reload();
  }
  async function changeStatus() {
    setBusy(true);
    try {
      if (modal.type === 'delete') {
        await api(`/purchases/${order.id}`, {}, 'DELETE');
        await saved('Orden eliminada. Se conservó su registro de auditoría.');
      } else {
        await api(`/purchases/${order.id}/status`, { status: modal.status }, 'PATCH');
        await saved('Estado de compra actualizado.');
      }
    } finally {
      setBusy(false);
    }
  }
  const pending = data.purchase_orders.filter((o) =>
    ['Confirmada', 'Recibida parcialmente'].includes(o.status),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Órdenes de compra</h1>
          <p>Solicita artículos del catálogo y controla sus recepciones por sucursal.</p>
        </div>
        {writable && (
          <button className="button primary" onClick={() => setModal({ type: 'create' })}>
            <Plus size={17} />
            Nueva orden de compra
          </button>
        )}
      </div>
      <div className="summary-strip">
        <span>
          Creadas
          <strong>{data.purchase_orders.filter((o) => o.status === 'Creado').length}</strong>
        </span>
        <span>
          Pendientes de recibir<strong>{pending.length}</strong>
        </span>
        <span>
          Subtotal de órdenes abiertas
          <strong>{currency(pending.reduce((sum, o) => sum + Number(o.total), 0))}</strong>
        </span>
      </div>
      <section className="panel module-panel">
        <div className="panel-heading">
          <div>
            <h2>Control de compras</h2>
            <p>Creado → Confirmada → Recepción parcial o completa</p>
          </div>
        </div>
        <DataTable
          rows={[...data.purchase_orders].sort((a, b) => b.created_at.localeCompare(a.created_at))}
          columns={[
            { key: 'number', label: 'Orden' },
            { key: 'supplier', label: 'Proveedor' },
            { key: 'branch_id', label: 'Sucursal', value: (r) => branchName(r.branch_id) },
            {
              key: 'expected_date',
              label: 'Entrega prevista',
              value: (r) => date(r.expected_date),
            },
            { key: 'total', label: 'Subtotal (Q)', value: (r) => currency(r.total) },
            { key: 'status', label: 'Estado', render: (r) => <Badge>{r.status}</Badge> },
          ]}
          actions={(r) => (
            <>
              <button
                className="table-action"
                onClick={() => setModal({ type: 'detail', order: r })}
              >
                <Eye size={15} />
                Ver orden
              </button>
              {writable && r.status === 'Creado' && (
                <button
                  className="table-action danger"
                  onClick={() => setModal({ type: 'delete', order: r })}
                >
                  <Trash2 size={15} />
                  Eliminar
                </button>
              )}
            </>
          )}
        />
      </section>
      <p className="page-note">
        Las existencias aumentan al registrar la recepción. Esta orden no registra facturas del
        proveedor ni pagos de caja.
      </p>
      {modal && (
        <Modal
          wide={['create', 'detail'].includes(modal.type)}
          title={
            modal.type === 'create'
              ? 'Nueva orden de compra'
              : modal.type === 'receive'
                ? 'Recibir compra'
                : modal.type === 'delete'
                  ? 'Eliminar orden de compra'
                  : modal.type === 'status'
                    ? `${modal.status === 'Confirmada' ? 'Confirmar orden' : 'Cancelar saldo pendiente'}`
                    : order.number
          }
          onClose={() => !busy && setModal(null)}
        >
          {modal.type === 'create' ? (
            <PurchaseOrderForm
              data={allData}
              onBusyChange={setBusy}
              onClose={() => setModal(null)}
              onSaved={() => saved('Orden de compra creada.')}
            />
          ) : modal.type === 'receive' ? (
            <ReceiveInventoryForm
              data={allData}
              initialLineId={modal.lineId}
              onBusyChange={setBusy}
              onClose={() => setModal(null)}
              onSaved={() => saved('Recepción registrada. Inventario y compra actualizados.')}
            />
          ) : ['status', 'delete'].includes(modal.type) ? (
            <RecordForm
              fields={[]}
              onSubmit={changeStatus}
              onClose={() => setModal(null)}
              submitLabel={modal.type === 'delete' ? 'Eliminar orden' : 'Confirmar'}
              note={
                modal.type === 'delete'
                  ? `Se retirará la orden ${order.number} del listado. Se conservará su historial de auditoría. Solo se admite el estado Creado.`
                  : modal.status === 'Confirmada'
                    ? `Confirma la solicitud ${order.number} al proveedor ${order.supplier}.`
                    : 'Se cancelará únicamente lo pendiente. Las recepciones registradas y sus existencias se conservarán.'
              }
            />
          ) : (
            <div className="purchase-detail">
              <dl className="record-facts">
                <div>
                  <dt>Proveedor</dt>
                  <dd>{order.supplier}</dd>
                </div>
                <div>
                  <dt>Sucursal</dt>
                  <dd>{branchName(order.branch_id)}</dd>
                </div>
                <div>
                  <dt>Entrega prevista</dt>
                  <dd>{date(order.expected_date)}</dd>
                </div>
                <div>
                  <dt>Estado</dt>
                  <dd>
                    <Badge>{order.status}</Badge>
                  </dd>
                </div>
              </dl>
              {order.note && <p className="form-note">{order.note}</p>}
              <DataTable
                search={false}
                rows={lines}
                columns={[
                  { key: 'item_code', label: 'Código' },
                  { key: 'item_name', label: 'Artículo' },
                  { key: 'quantity', label: 'Solicitado' },
                  { key: 'received_quantity', label: 'Recibido' },
                  {
                    key: 'remaining',
                    label: 'Pendiente',
                    value: (r) => Number(r.quantity) - Number(r.received_quantity),
                  },
                  { key: 'unit_cost', label: 'Costo', value: (r) => currency(r.unit_cost) },
                ]}
                actions={
                  writable && ['Confirmada', 'Recibida parcialmente'].includes(order.status)
                    ? (r) =>
                        Number(r.received_quantity) < Number(r.quantity) && (
                          <button
                            className="table-action"
                            onClick={() => setModal({ type: 'receive', lineId: r.id })}
                          >
                            <PackageCheck size={15} />
                            Recibir
                          </button>
                        )
                    : undefined
                }
              />
              <p className="purchase-total">
                Subtotal: <strong>{currency(order.total)}</strong>
              </p>
              <h3>Recepciones registradas</h3>
              <DataTable
                search={false}
                rows={receipts}
                columns={[
                  { key: 'reference', label: 'Comprobante' },
                  {
                    key: 'purchase_line_id',
                    label: 'Artículo',
                    value: (r) => lines.find((l) => l.id === r.purchase_line_id)?.item_code,
                  },
                  { key: 'quantity', label: 'Cantidad' },
                  { key: 'created_at', label: 'Fecha', value: (r) => date(r.created_at) },
                ]}
              />
              <div className="form-footer">
                {writable && order.status === 'Creado' && (
                  <button
                    className="button primary"
                    onClick={() => setModal({ type: 'status', order, status: 'Confirmada' })}
                  >
                    <Check size={16} />
                    Confirmar orden
                  </button>
                )}
                {writable && !['Recibida', 'Cancelada'].includes(order.status) && (
                  <button
                    className="button secondary"
                    onClick={() => setModal({ type: 'status', order, status: 'Cancelada' })}
                  >
                    <X size={16} />
                    Cancelar pendiente
                  </button>
                )}
                <button className="button secondary" onClick={() => setModal(null)}>
                  Cerrar
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
