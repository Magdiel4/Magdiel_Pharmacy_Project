import { useState } from 'react';
import { RecordForm } from '../components/UI';

export default function CreateUserForm({
  branches,
  onSubmit,
  onClose,
  initial = {},
  mode = 'create',
}) {
  const existingIds =
    initial.branch_ids === undefined
      ? initial.branch_id
        ? [initial.branch_id]
        : null
      : initial.branch_ids;
  const [scope, setScope] = useState(initial.id ? (existingIds === null ? 'all' : 'selected') : '');
  const [selected, setSelected] = useState(existingIds || []);
  const creating = mode === 'create';
  const fields = [
    ...(!creating
      ? [{ name: 'id', label: 'UUID de Supabase Auth', wide: true, readOnly: mode === 'edit' }]
      : []),
    { name: 'name', label: 'Nombre completo', wide: true },
    { name: 'email', label: 'Correo electrónico', type: 'email', autoComplete: 'off', wide: true },
    ...(creating
      ? [
          {
            name: 'password',
            label: 'Contraseña',
            type: 'password',
            minLength: 12,
            autoComplete: 'new-password',
            hint: 'Al menos 12 caracteres.',
          },
          {
            name: 'confirmation',
            label: 'Confirmar contraseña',
            type: 'password',
            minLength: 12,
            autoComplete: 'new-password',
          },
        ]
      : []),
    {
      name: 'role',
      label: 'Rol',
      options: ['administrador', 'auditor', 'gerente', 'cajero', 'logistica', 'rrhh'],
    },
    { name: 'active', label: 'Acceso activo', type: 'checkbox', defaultValue: true },
  ];
  async function submit({ confirmation, ...values }) {
    if (creating && values.password !== confirmation)
      throw new Error('Las contraseñas no coinciden.');
    if (!scope || (scope === 'selected' && !selected.length))
      throw new Error('Selecciona al menos una sucursal o Todas las sucursales.');
    await onSubmit({ ...values, branch_ids: scope === 'all' ? null : selected });
  }
  function toggle(id) {
    setSelected((ids) => (ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]));
  }
  return (
    <RecordForm
      fields={fields}
      initial={initial}
      onSubmit={submit}
      onClose={onClose}
      submitLabel={creating ? 'Crear usuario' : 'Guardar acceso'}
      note={
        creating
          ? 'La cuenta quedará confirmada y podrá iniciar sesión con esta contraseña si su acceso está activo. No se envía correo de invitación.'
          : 'El alcance se aplica a las operaciones permitidas por el rol.'
      }
    >
      <label className="wide">
        <span>Sucursales *</span>
        <select required value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="">Seleccionar…</option>
          <option value="all">Todas las sucursales</option>
          <option value="selected">Una o varias sucursales</option>
        </select>
      </label>
      {scope === 'all' && (
        <p className="form-note wide">
          Incluye todas las sucursales actuales y las que se agreguen en el futuro.
        </p>
      )}
      {scope === 'selected' && (
        <fieldset className="branch-access wide">
          <legend>Selecciona al menos una sucursal</legend>
          {branches
            .filter((b) => b.active || selected.includes(b.id))
            .map((b) => (
              <label className="check-field" key={b.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(b.id)}
                  onChange={() => toggle(b.id)}
                />
                {b.name}
                {!b.active && ' (inactiva)'}
              </label>
            ))}
          {!branches.length && <p>No hay sucursales disponibles.</p>}
        </fieldset>
      )}
    </RecordForm>
  );
}
