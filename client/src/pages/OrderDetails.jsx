import { DataTable, Badge } from '../components/UI';
import { currency } from '../utils/format';

export default function OrderDetails({ order, lines, branchName }) {
  return (
    <>
      <div className="order-summary">
        <p>
          <strong>{order.customer}</strong> · {order.phone}
        </p>
        <p>{order.address}</p>
        <p>
          {branchName} · {order.payment_method} · <Badge>{order.status}</Badge>
        </p>
      </div>
      <DataTable
        search={false}
        rows={lines}
        columns={[
          { key: 'sku', label: 'Código' },
          { key: 'name', label: 'Artículo' },
          { key: 'quantity', label: 'Cantidad' },
          { key: 'unit_price', label: 'Precio unitario', value: (r) => currency(r.unit_price) },
          { key: 'total', label: 'Subtotal', value: (r) => currency(r.total) },
        ]}
      />
      <p className="order-detail-total">
        Total del pedido: <strong>{currency(order.total)}</strong>
      </p>
    </>
  );
}
