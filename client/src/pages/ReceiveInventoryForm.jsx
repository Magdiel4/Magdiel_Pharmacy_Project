import { useState } from 'react';
import { api } from '../services/api';

export default function ReceiveInventoryForm({
  data,
  initialLineId = '',
  onSaved,
  onClose,
  onBusyChange = () => {},
}) {
  const [lineId, setLineId] = useState(initialLineId);
  const [branchId, setBranchId] = useState('');
  const [productId, setProductId] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const line = data.purchase_order_lines.find((row) => row.id === lineId);
  const article = data.products.find((row) => row.id === (line?.product_id || productId));
  const orders = data.purchase_orders.filter((row) =>
    ['Confirmada', 'Recibida parcialmente'].includes(row.status),
  );
  const lines = data.purchase_order_lines.filter(
    (row) =>
      orders.some((order) => order.id === row.purchase_order_id) &&
      Number(row.received_quantity) < Number(row.quantity),
  );
  const selectedBranch = line?.branch_id || branchId;
  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    onBusyChange(true);
    const form = new FormData(event.currentTarget);
    try {
      await api('/inventory/receive', {
        branch_id: selectedBranch,
        product_id: article.id,
        purchase_line_id: lineId || null,
        lot: form.get('lot'),
        expires_at: form.get('expires_at') || null,
        quantity: Number(form.get('quantity')),
        note: form.get('note'),
      });
      await onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <label className="wide">
          <span>Origen de la recepción</span>
          <select
            value={lineId}
            disabled={busy || Boolean(initialLineId)}
            onChange={(e) => setLineId(e.target.value)}
          >
            <option value="">Recepción directa / saldo inicial</option>
            {lines.map((row) => (
              <option key={row.id} value={row.id}>
                {orders.find((order) => order.id === row.purchase_order_id)?.number} ·{' '}
                {row.item_code} · Pendiente: {Number(row.quantity) - Number(row.received_quantity)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Sucursal *</span>
          <select
            required
            value={selectedBranch}
            disabled={busy || Boolean(line)}
            onChange={(e) => setBranchId(e.target.value)}
          >
            <option value="">Seleccionar…</option>
            {data.branches
              .filter((b) => b.active)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          <span>Artículo *</span>
          <select
            required
            value={article?.id || ''}
            disabled={busy || Boolean(line)}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">Seleccionar…</option>
            {data.products
              .filter((p) => p.active)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} · {p.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          <span>Lote / referencia de grupo *</span>
          <input name="lot" required maxLength={200} disabled={busy} />
        </label>
        <label>
          <span>Vencimiento {article?.expiration_required ? '*' : '(opcional)'}</span>
          <input
            name="expires_at"
            type="date"
            required={Boolean(article?.expiration_required)}
            disabled={busy}
          />
        </label>
        <label>
          <span>Cantidad *</span>
          <input
            name="quantity"
            key={lineId}
            type="number"
            min="1"
            max={line ? Number(line.quantity) - Number(line.received_quantity) : 1000000}
            step="1"
            defaultValue="1"
            required
            disabled={busy}
          />
        </label>
        <label>
          <span>Comprobante / referencia *</span>
          <input name="note" required maxLength={200} disabled={busy} />
        </label>
      </div>
      <p className="form-note">
        {line
          ? 'La recepción actualiza las existencias y el saldo pendiente de esta línea. Usa una referencia distinta para cada entrega parcial.'
          : 'Registra una entrada directa de un artículo del catálogo. Para una compra, selecciona su línea confirmada.'}{' '}
        Después puedes adjuntar una foto al lote.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="form-footer">
        <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
          Cancelar
        </button>
        <button className="button primary" disabled={busy || !article || !selectedBranch}>
          {busy ? 'Registrando…' : 'Registrar recepción'}
        </button>
      </div>
    </form>
  );
}
