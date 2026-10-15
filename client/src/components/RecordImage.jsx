import { useEffect, useState } from 'react';
import { Camera, ImageOff, Upload, Trash2 } from 'lucide-react';
import { Modal } from './UI';
import { imageUrl, updateImage } from '../services/images';

export function ImageThumbnail({ entity, row, label, onClick }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [row.image_updated_at]);
  return (
    <button
      type="button"
      className="image-thumbnail"
      onClick={onClick}
      aria-label={`${row.has_image ? 'Ver' : 'Fotografía de'} ${label}`}
    >
      {row.has_image && !failed ? (
        <img
          src={imageUrl(entity, row)}
          alt={label}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <Camera size={21} aria-hidden="true" />
      )}
    </button>
  );
}

export default function RecordImage({ entity, row, label, canEdit, onClose, onSaved }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function choose(event) {
    const selected = event.target.files?.[0];
    event.target.value = '';
    if (!selected) return;
    setError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type)) {
      setError('Selecciona un archivo JPG, PNG o WebP.');
      return;
    }
    if (selected.size > 5 * 1024 * 1024) {
      setError('La imagen no debe superar los 5 MB.');
      return;
    }
    setFile(selected);
    setFailed(false);
    setConfirmRemove(false);
  }

  async function save(remove = false) {
    setBusy(true);
    setError('');
    try {
      const result = await updateImage(entity, row.id, remove ? null : file);
      await onSaved(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const source = preview || (row.has_image ? imageUrl(entity, row) : '');
  return (
    <Modal title="Fotografía" subtitle={label} onClose={() => !busy && onClose()}>
      <div className="record-image">
        <div className="image-stage">
          {source && !failed ? (
            <img
              key={source}
              src={source}
              alt={`Fotografía de ${label}`}
              onError={() => setFailed(true)}
            />
          ) : (
            <div className="image-empty">
              <ImageOff size={40} />
              <strong>{failed ? 'No se pudo cargar la imagen' : 'Sin fotografía'}</strong>
              <p>
                {failed
                  ? 'Selecciona otra imagen o vuelve a abrir el visor.'
                  : 'Agrega una referencia visual para identificar este registro.'}
              </p>
            </div>
          )}
        </div>
        {canEdit && (
          <>
            <label className={`image-upload ${busy ? 'disabled' : ''}`}>
              <Upload size={20} />
              <span>
                <strong>
                  {file
                    ? file.name
                    : row.has_image
                      ? 'Seleccionar otra fotografía'
                      : 'Seleccionar fotografía'}
                </strong>
                <small>JPG, PNG o WebP · Hasta 5 MB y 25 megapíxeles</small>
              </span>
              <input
                aria-label="Seleccionar fotografía"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={choose}
              />
            </label>
            <p className="image-caption">
              {entity === 'inventory'
                ? 'La fotografía pertenece a este lote en esta sucursal.'
                : 'La fotografía pertenece a este activo fijo.'}
            </p>
          </>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {confirmRemove && (
          <div className="image-remove-confirm">
            <p>¿Eliminar la fotografía de este registro?</p>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setConfirmRemove(false)}
            >
              Conservar
            </button>
            <button className="button danger-button" disabled={busy} onClick={() => save(true)}>
              Sí, eliminar fotografía
            </button>
          </div>
        )}
        <div className="form-actions">
          {canEdit && row.has_image && !confirmRemove && (
            <button
              type="button"
              className="table-action danger"
              disabled={busy}
              onClick={() => setConfirmRemove(true)}
            >
              <Trash2 size={16} />
              Eliminar foto
            </button>
          )}
          <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
            Cerrar
          </button>
          {canEdit && (
            <button
              type="button"
              className="button primary"
              disabled={busy || !file || failed || confirmRemove}
              onClick={() => save()}
            >
              {busy ? 'Guardando…' : 'Guardar fotografía'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
