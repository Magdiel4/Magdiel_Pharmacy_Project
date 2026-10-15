import { useEffect, useRef, useState } from 'react';
import { X, Search, ChevronLeft, ChevronRight, ArrowUpRight, PackageOpen } from 'lucide-react';
export function Badge({ children, tone }) {
  const inferred = [
    'Operativo',
    'Pagado',
    'Entregado',
    'Recibido',
    'Activo',
    'Ingreso',
    'Recibida',
  ].includes(children)
    ? 'green'
    : [
          'Pendiente',
          'En tránsito',
          'Preparando',
          'Mantenimiento',
          'Confirmada',
          'Recibida parcialmente',
          'Creado',
          'Pendiente de completar',
        ].includes(children)
      ? 'amber'
      : ['Egreso', 'Baja', 'Cancelado', 'Inactivo', 'Vencido', 'Cancelada'].includes(children)
        ? 'red'
        : 'blue';
  return (
    <span className={`badge ${tone || inferred}`}>
      <i />
      {children}
    </span>
  );
}
export function Stat({ label, value, detail, icon: Icon, tone = 'green' }) {
  return (
    <article className="stat">
      <div className="stat-top">
        <span>{label}</span>
        <span className={`icon-tile ${tone}`}>
          <Icon size={19} />
        </span>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
export function Empty({
  text = 'Todavía no hay registros',
  detail = 'Agrega el primer registro para comenzar.',
}) {
  return (
    <div className="empty">
      <PackageOpen size={32} />
      <strong>{text}</strong>
      <span>{detail}</span>
    </div>
  );
}
export function DataTable({ columns, rows, actions, search = true }) {
  const [term, setTerm] = useState(''),
    [page, setPage] = useState(0);
  const filtered = rows.filter((r) =>
    columns.some((c) =>
      String(c.value ? c.value(r) : (r[c.key] ?? ''))
        .toLowerCase()
        .includes(term.toLowerCase()),
    ),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 10)),
    current = Math.min(page, pages - 1);
  return (
    <>
      {search && (
        <div className="table-tools">
          <div className="search">
            <Search size={17} />
            <input
              aria-label="Buscar en la tabla"
              placeholder="Buscar en los registros…"
              value={term}
              onChange={(e) => {
                setTerm(e.target.value);
                setPage(0);
              }}
            />
          </div>
          <span>{filtered.length} registros</span>
        </div>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
              {actions && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(current * 10, current * 10 + 10).map((r) => (
              <tr key={r.id}>
                {columns.map((c) => (
                  <td key={c.key}>{c.render ? c.render(r) : c.value ? c.value(r) : r[c.key]}</td>
                ))}
                {actions && (
                  <td>
                    <div className="row-actions">{actions(r)}</div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filtered.length ? (
        <Empty />
      ) : (
        <div className="pagination">
          <span>
            Mostrando {current * 10 + 1}–{Math.min(current * 10 + 10, filtered.length)} de{' '}
            {filtered.length}
          </span>
          <div>
            <button
              aria-label="Página anterior"
              type="button"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              {current + 1} / {pages}
            </span>
            <button
              aria-label="Página siguiente"
              type="button"
              disabled={current === pages - 1}
              onClick={() => setPage(current + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
export function Modal({ title, subtitle, onClose, children, wide = false }) {
  const ref = useRef();
  useEffect(() => {
    const prior = document.activeElement;
    ref.current.showModal();
    return () => {
      prior?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal${wide ? ' modal-wide' : ''}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-header">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Cerrar">
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function RecordForm({
  fields,
  initial = {},
  onSubmit,
  onClose,
  submitLabel = 'Guardar registro',
  note,
  children,
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const form = new FormData(e.currentTarget);
    const values = {};
    for (const f of fields) {
      if (f.omit) continue;
      const v = form.get(f.name);
      values[f.name] =
        f.type === 'checkbox'
          ? v === 'on'
          : f.type === 'number'
            ? Number(v)
            : f.nullable && v === ''
              ? null
              : v;
    }
    try {
      await onSubmit(values);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        {fields.map((f) => (
          <label
            className={`${f.wide ? 'wide' : ''} ${f.type === 'checkbox' ? 'check-field' : ''}`}
            key={f.name}
          >
            {f.type === 'checkbox' ? (
              <>
                <input
                  name={f.name}
                  type="checkbox"
                  defaultChecked={initial[f.name] ?? f.defaultValue ?? false}
                />
                {f.label}
              </>
            ) : (
              <>
                <span>
                  {f.label}
                  {!f.optional && ' *'}
                </span>
                {f.options ? (
                  <select
                    name={f.name}
                    defaultValue={initial[f.name] ?? f.defaultValue ?? ''}
                    required={!f.optional}
                  >
                    <option value="">Seleccionar…</option>
                    {f.options.map((o) => (
                      <option key={o.value ?? o} value={o.value ?? o}>
                        {o.label ?? o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    name={f.name}
                    type={f.type || 'text'}
                    defaultValue={initial[f.name] ?? f.defaultValue ?? ''}
                    required={!f.optional}
                    step={f.step ?? (f.type === 'number' ? '0.01' : undefined)}
                    min={f.min}
                    max={f.max}
                    placeholder={f.placeholder}
                    minLength={f.minLength}
                    readOnly={f.readOnly}
                    autoComplete={f.autoComplete}
                    maxLength={200}
                  />
                )}{' '}
                {f.hint && <small>{f.hint}</small>}
              </>
            )}
          </label>
        ))}
        {children}
      </div>
      {note && <p className="form-note">{note}</p>}
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      <div className="form-footer">
        <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
          Cancelar
        </button>
        <button className="button primary" disabled={busy}>
          {busy ? 'Guardando…' : submitLabel}
          <ArrowUpRight size={16} />
        </button>
      </div>
    </form>
  );
}
