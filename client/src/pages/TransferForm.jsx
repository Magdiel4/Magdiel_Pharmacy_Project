import { useState } from 'react';
import { usableBatch } from '../utils/inventory';

export default function TransferForm({ data, initial = {}, onSubmit, onClose }) {
  const [source, setSource] = useState(initial.source_id || '');
  const [batchId, setBatchId] = useState(initial.batch_id || '');
  const [destination, setDestination] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const batches = data.inventory.filter(
    (b) => b.branch_id === source && usableBatch(b) && Number(b.quantity) > Number(b.reserved),
  );
  const batch = batches.find((b) => b.id === batchId);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      await onSubmit({
        source_id: source,
        destination_id: destination,
        batch_id: batchId,
        quantity: Number(form.get('quantity')),
        note: form.get('note'),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <label>
          <span>Sucursal de origen *</span>
          <select
            required
            value={source}
            disabled={busy}
            onChange={(e) => {
              setSource(e.target.value);
              setBatchId('');
              if (destination === e.target.value) setDestination('');
            }}
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
          <span>Sucursal de destino *</span>
          <select
            required
            value={destination}
            disabled={busy}
            onChange={(e) => setDestination(e.target.value)}
          >
            <option value="">Seleccionar…</option>
            {data.destinations
              .filter((b) => b.id !== source)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </select>
        </label>
        <label className="wide">
          <span>Lote de origen *</span>
          <select
            required
            value={batchId}
            disabled={busy || !source}
            onChange={(e) => setBatchId(e.target.value)}
          >
            <option value="">
              {source ? 'Seleccionar lote…' : 'Selecciona primero la sucursal de origen'}
            </option>
            {batches.map((b) => {
              const p = data.products.find((p) => p.id === b.product_id);
              return (
                <option key={b.id} value={b.id}>
                  {p?.sku} · {p?.name} · {b.lot} ({Number(b.quantity) - Number(b.reserved)}{' '}
                  disponibles)
                </option>
              );
            })}
          </select>
          {source && !batches.length && <small>No hay lotes disponibles en esta sucursal.</small>}
        </label>
        <label>
          <span>Cantidad *</span>
          <input
            key={batchId}
            type="number"
            name="quantity"
            min="1"
            max={batch ? Number(batch.quantity) - Number(batch.reserved) : 1}
            step="1"
            required
            disabled={busy || !batch}
          />
        </label>
        <label>
          <span>Referencia / responsable *</span>
          <input name="note" required maxLength={200} disabled={busy} />
        </label>
      </div>
      <p className="form-note">
        Solo se muestran lotes disponibles de la sucursal de origen. Al cambiarla se limpia el lote
        seleccionado.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="form-footer">
        <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
          Cancelar
        </button>
        <button className="button primary" disabled={busy || !batch || !destination}>
          {busy ? 'Guardando…' : 'Guardar traslado'}
        </button>
      </div>
    </form>
  );
}
