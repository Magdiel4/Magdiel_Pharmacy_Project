import { useState } from 'react';
import { Search, Plus, Trash2, ArrowRight } from 'lucide-react';
import { DataTable } from '../components/UI';
import { api } from '../services/api';
import { currency } from '../utils/format';

const emptyLine = () => ({ product_id: '', quantity: 1 });
export default function OrderForm({
  data,
  initialCustomerId = '',
  onClose,
  onSaved,
  onBusyChange = () => {},
}) {
  const initialCustomer = data.customers.find((c) => c.id === initialCustomerId);
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [address, setAddress] = useState(initialCustomer?.address || '');
  const [location, setLocation] = useState({
    latitude: initialCustomer?.latitude ?? '',
    longitude: initialCustomer?.longitude ?? '',
  });
  const [lines, setLines] = useState([]);
  const [draft, setDraft] = useState(emptyLine);
  const [quote, setQuote] = useState(null);
  const [selected, setSelected] = useState('');
  const [prescriptionVerified, setPrescriptionVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const customer = data.customers.find((c) => c.id === customerId);
  const products = data.products.filter((p) => p.active && p.saleable && Number(p.price) > 0);
  function invalidate() {
    setQuote(null);
    setSelected('');
    setPrescriptionVerified(false);
    setError('');
  }
  function setWorking(value) {
    setBusy(value);
    onBusyChange(value);
  }
  function pendingLines() {
    if (!draft.product_id) {
      if (!lines.length) throw new Error('Selecciona un artículo y su cantidad.');
      return lines;
    }
    const quantity = Number(draft.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000000)
      throw new Error('Ingresa una cantidad entera entre 1 y 1,000,000.');
    if (lines.length >= 100 || lines.some((line) => line.product_id === draft.product_id))
      throw new Error('No puedes repetir artículos ni superar 100 líneas.');
    return [...lines, { product_id: draft.product_id, quantity }];
  }
  function deliveryLocation() {
    const latitude = Number(location.latitude),
      longitude = Number(location.longitude);
    if (
      location.latitude === '' ||
      location.longitude === '' ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    )
      throw new Error('Ingresa coordenadas válidas para la entrega.');
    return { latitude, longitude };
  }
  async function lookup() {
    setError('');
    try {
      const requested = pendingLines();
      const coordinates = deliveryLocation();
      if (!customerId) throw new Error('Selecciona un cliente.');
      setWorking(true);
      setQuote(null);
      setSelected('');
      setPrescriptionVerified(false);
      const result = await api('/orders/quote', {
        ...coordinates,
        lines: requested.map(({ product_id, quantity }) => ({ product_id, quantity })),
      });
      setQuote(result);
      setSelected(result.find((q) => q.can_deliver)?.branch_id || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  }
  function addLine() {
    try {
      if (!draft.product_id || !quote)
        throw new Error('Consulta disponibilidad antes de agregar la línea.');
      setLines(pendingLines());
      setDraft(emptyLine());
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }
  async function submit(event) {
    event.preventDefault();
    setError('');
    if (draft.product_id) {
      setError('Agrega la línea pendiente antes de crear el pedido.');
      return;
    }
    if (!lines.length || !selected || !quote) {
      setError('Agrega líneas y consulta disponibilidad.');
      return;
    }
    const form = new FormData(event.currentTarget);
    try {
      setWorking(true);
      await api('/orders', {
        customer_id: customerId,
        branch_id: selected,
        address,
        ...deliveryLocation(),
        lines: lines.map(({ product_id, quantity }) => ({ product_id, quantity })),
        payment_method: form.get('payment_method'),
        prescription_verified: prescriptionVerified,
      });
      await onSaved();
    } catch (err) {
      setError(err.message);
      invalidateQuoteAfterFailure();
    } finally {
      setWorking(false);
    }
  }
  function invalidateQuoteAfterFailure() {
    setQuote(null);
    setSelected('');
    setPrescriptionVerified(false);
  }
  const currentQuote = quote?.find((q) => q.branch_id === selected);
  return (
    <form onSubmit={submit}>
      <fieldset className="order-form-fields" disabled={busy}>
        <div className="form-grid">
          <label className="wide">
            <span>Cliente registrado *</span>
            <select
              required
              value={customerId}
              onChange={(e) => {
                const row = data.customers.find((c) => c.id === e.target.value);
                setCustomerId(e.target.value);
                setAddress(row?.address || '');
                setLocation({ latitude: row?.latitude ?? '', longitude: row?.longitude ?? '' });
                invalidate();
              }}
            >
              <option value="">Seleccionar cliente…</option>
              {data.customers
                .filter((c) => c.active)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.name}
                  </option>
                ))}
            </select>
          </label>
          {customer && (
            <p className="form-note wide">
              {customer.name} · {customer.phone}
            </p>
          )}
          <label className="wide">
            <span>Dirección exacta y referencias *</span>
            <input
              required
              maxLength={200}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>
          <label>
            <span>Latitud de entrega *</span>
            <input
              type="number"
              min="-90"
              max="90"
              step="any"
              required
              value={location.latitude}
              onChange={(e) => {
                setLocation({ ...location, latitude: e.target.value });
                invalidate();
              }}
            />
          </label>
          <label>
            <span>Longitud de entrega *</span>
            <input
              type="number"
              min="-180"
              max="180"
              step="any"
              required
              value={location.longitude}
              onChange={(e) => {
                setLocation({ ...location, longitude: e.target.value });
                invalidate();
              }}
            />
          </label>
          <label>
            <span>Forma de pago *</span>
            <select name="payment_method" required>
              <option>Efectivo</option>
              <option>Tarjeta</option>
              <option>Transferencia</option>
            </select>
          </label>
        </div>
        <fieldset className="purchase-line purchase-entry">
          <legend>Agregar línea</legend>
          <div className="form-grid">
            <label className="wide">
              <span>Artículo</span>
              <select
                value={draft.product_id}
                onChange={(e) => {
                  setDraft({ ...draft, product_id: e.target.value });
                  invalidate();
                }}
              >
                <option value="">Seleccionar artículo del catálogo…</option>
                {products.map((p) => (
                  <option
                    key={p.id}
                    value={p.id}
                    disabled={lines.some((line) => line.product_id === p.id)}
                  >
                    {p.sku} · {p.name} · {currency(p.price)}
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
                onChange={(e) => {
                  setDraft({ ...draft, quantity: e.target.value });
                  invalidate();
                }}
              />
            </label>
          </div>
          <div className="purchase-line-footer order-entry-actions">
            <button
              type="button"
              className="button secondary"
              disabled={!customerId || (!draft.product_id && !lines.length)}
              onClick={lookup}
            >
              <Search size={16} />
              Consultar disponibilidad
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={!draft.product_id || !quote || lines.length >= 100}
              onClick={addLine}
            >
              <Plus size={16} />
              Agregar línea
            </button>
          </div>
        </fieldset>
        <section aria-label="Líneas del pedido" className="purchase-added-lines">
          <h3>Líneas agregadas ({lines.length})</h3>
          <DataTable
            search={false}
            rows={lines.map((line) => ({ ...line, id: line.product_id }))}
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
              {
                key: 'price',
                label: 'Precio unitario',
                value: (r) =>
                  currency(
                    quote?.[0]?.lines.find((line) => line.product_id === r.product_id)
                      ?.unit_price ?? data.products.find((p) => p.id === r.product_id)?.price,
                  ),
              },
              {
                key: 'total',
                label: 'Subtotal',
                value: (r) =>
                  currency(
                    quote?.[0]?.lines.find((line) => line.product_id === r.product_id)?.total ??
                      r.quantity * Number(data.products.find((p) => p.id === r.product_id)?.price),
                  ),
              },
            ]}
            actions={(row) => (
              <button
                type="button"
                className="table-action danger"
                onClick={() => {
                  setLines(lines.filter((line) => line.product_id !== row.product_id));
                  invalidate();
                }}
              >
                <Trash2 size={14} />
                Quitar línea
              </button>
            )}
          />
        </section>
        {quote && (
          <section aria-label="Disponibilidad por sucursal" className="order-availability">
            <h3>
              Disponibilidad del pedido{draft.product_id ? ' (incluye la línea en captura)' : ''}
            </h3>
            <div className="quote-list">
              {quote.map((q) => (
                <label
                  key={q.branch_id}
                  className={`quote-option ${selected === q.branch_id ? 'selected' : ''} ${!q.can_deliver ? 'unavailable' : ''}`}
                >
                  <input
                    type="radio"
                    name="quote_branch"
                    value={q.branch_id}
                    checked={selected === q.branch_id}
                    disabled={!q.can_deliver}
                    onChange={() => setSelected(q.branch_id)}
                  />
                  <div>
                    <strong>{q.name}</strong>
                    <small>
                      {q.distance_km} km · {q.eta_minutes} min estimados
                    </small>
                    {q.lines.map((line) => (
                      <small key={line.product_id} className={!line.sufficient ? 'overdue' : ''}>
                        {line.sku} · {line.name}: {line.available} disponibles / {line.quantity}{' '}
                        solicitados
                      </small>
                    ))}
                  </div>
                  <span>
                    {q.can_deliver
                      ? currency(q.total)
                      : q.distance_km > 30
                        ? 'Fuera de cobertura'
                        : 'Stock insuficiente'}
                  </span>
                </label>
              ))}
            </div>
            {!quote.some((q) => q.can_deliver) && (
              <p className="form-note" role="status">
                Ninguna sucursal de tu acceso puede entregar el pedido completo con el stock y la
                ubicación indicados.
              </p>
            )}
          </section>
        )}
        {currentQuote?.prescription && (
          <label className="check-field order-prescription">
            <input
              type="checkbox"
              required
              checked={prescriptionVerified}
              onChange={(e) => setPrescriptionVerified(e.target.checked)}
            />
            Confirmo que el personal autorizado verificó las recetas requeridas.
          </label>
        )}
      </fieldset>
      <p className="form-note">
        La consulta no reserva inventario. Al crear el pedido se verifican nuevamente todas las
        líneas y se reservan juntas en la sucursal seleccionada. El tiempo de entrega es
        orientativo.
      </p>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      <div className="form-footer">
        <button type="button" className="button secondary" onClick={onClose} disabled={busy}>
          Cancelar
        </button>
        <button
          className="button primary"
          disabled={busy || !selected || !lines.length || !!draft.product_id}
        >
          {busy ? 'Procesando…' : 'Reservar y crear pedido'}
          <ArrowRight size={16} />
        </button>
      </div>
    </form>
  );
}
