import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { DataTable } from '../components/UI';
import { currency, localToday } from '../utils/format';
import { api } from '../services/api';

const emptyLine = () => ({ product_id: '', quantity: 1, unit_cost: 0 });
export default function PurchaseOrderForm({ data, onSaved, onClose, onBusyChange }) {
  const [lines, setLines] = useState([]);
  const [draft, setDraft] = useState(emptyLine);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  function addLine() {
    const quantity = Number(draft.quantity),
      cost = Number(draft.unit_cost);
    if (
      !draft.product_id ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 1000000 ||
      draft.unit_cost === '' ||
      !Number.isFinite(cost) ||
      cost < 0 ||
      cost > 100000000 ||
      Math.abs(cost * 100 - Math.round(cost * 100)) > 0.00001
    ) {
      setError(
        'Selecciona un artículo, una cantidad entera y un costo válido con hasta dos decimales.',
      );
      return;
    }
    if (lines.length >= 100 || lines.some((l) => l.product_id === draft.product_id)) {
      setError('No puedes repetir un artículo ni superar 100 líneas.');
      return;
    }
    setLines([
      ...lines,
      { id: crypto.randomUUID(), product_id: draft.product_id, quantity, unit_cost: cost },
    ]);
    setDraft(emptyLine());
    setError('');
  }
  async function submit(event) {
    event.preventDefault();
    if (draft.product_id) {
      setError('Agrega la línea pendiente antes de crear la orden.');
      return;
    }
    if (!lines.length) {
      setError('Agrega al menos una línea.');
      return;
    }
    setBusy(true);
    onBusyChange(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      await api('/purchases', {
        branch_id: form.get('branch_id'),
        supplier_id: form.get('supplier_id'),
        expected_date: form.get('expected_date'),
        note: form.get('note'),
        lines: lines.map(({ product_id, quantity, unit_cost }) => ({
          product_id,
          quantity,
          unit_cost,
        })),
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
        <label>
          <span>Proveedor *</span>
          <select name="supplier_id" required disabled={busy}>
            <option value="">Seleccionar proveedor…</option>
            {data.suppliers
              .filter((s) => s.active && !s.needs_review)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.account} · {s.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          <span>Sucursal receptora *</span>
          <select name="branch_id" required disabled={busy}>
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
          <span>Entrega prevista *</span>
          <input
            type="date"
            name="expected_date"
            required
            defaultValue={localToday()}
            disabled={busy}
          />
        </label>
        <label>
          <span>Observaciones</span>
          <input name="note" maxLength={200} disabled={busy} />
        </label>
      </div>
      {!data.suppliers.some((s) => s.active && !s.needs_review) && (
        <p className="form-note">
          Registra primero un proveedor activo con cuenta y NIT en Proveedores.
        </p>
      )}
      <fieldset className="purchase-line purchase-entry" disabled={busy}>
        <legend>Agregar línea</legend>
        <div className="form-grid">
          <label className="wide">
            <span>Artículo</span>
            <select
              value={draft.product_id}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  product_id: e.target.value,
                  unit_cost: Number(data.products.find((p) => p.id === e.target.value)?.cost || 0),
                })
              }
            >
              <option value="">Seleccionar artículo del catálogo…</option>
              {data.products
                .filter((p) => p.active)
                .map((p) => (
                  <option
                    key={p.id}
                    value={p.id}
                    disabled={lines.some((l) => l.product_id === p.id)}
                  >
                    {p.sku} · {p.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            <span>Cantidad</span>
            <input
              type="number"
              min="1"
              max="1000000"
              step="1"
              value={draft.quantity}
              onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
            />
          </label>
          <label>
            <span>Costo unitario (Q)</span>
            <input
              type="number"
              min="0"
              max="100000000"
              step="0.01"
              value={draft.unit_cost}
              onChange={(e) => setDraft({ ...draft, unit_cost: e.target.value })}
            />
          </label>
        </div>
        <div className="purchase-line-footer">
          <strong>{currency(Number(draft.quantity) * Number(draft.unit_cost))}</strong>
          <button
            type="button"
            className="button secondary"
            disabled={lines.length >= 100}
            onClick={addLine}
          >
            <Plus size={16} />
            Agregar línea
          </button>
        </div>
      </fieldset>
      <section aria-label="Líneas agregadas" className="purchase-added-lines">
        <h3>Líneas agregadas ({lines.length})</h3>
        <DataTable
          search={false}
          rows={lines}
          columns={[
            {
              key: 'product_id',
              label: 'Artículo',
              value: (r) => {
                const p = data.products.find((p) => p.id === r.product_id);
                return `${p?.sku} · ${p?.name}`;
              },
            },
            { key: 'quantity', label: 'Cantidad' },
            { key: 'unit_cost', label: 'Costo unitario', value: (r) => currency(r.unit_cost) },
            { key: 'total', label: 'Subtotal', value: (r) => currency(r.quantity * r.unit_cost) },
          ]}
          actions={(r) => (
            <button
              type="button"
              className="table-action danger"
              disabled={busy}
              onClick={() => setLines(lines.filter((l) => l.id !== r.id))}
            >
              <Trash2 size={14} />
              Quitar línea
            </button>
          )}
        />
      </section>
      <p className="form-note">
        La orden quedará en estado Creado. Confírmala antes de recibir mercancía. Subtotal sin
        impuestos:{' '}
        <strong>{currency(lines.reduce((sum, l) => sum + l.quantity * l.unit_cost, 0))}</strong>.
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
        <button className="button primary" disabled={busy || !lines.length}>
          {busy ? 'Guardando…' : 'Crear orden'}
        </button>
      </div>
    </form>
  );
}
