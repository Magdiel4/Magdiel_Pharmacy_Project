import { useState } from 'react';
import { ArrowRight, Cross, ShieldCheck, Building2, Boxes } from 'lucide-react';
import { api } from '../services/api';
export default function Login({ onLogin, mode }) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api('/auth/login', data);
      await onLogin();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <section className="login-story">
        <div className="brand light">
          <span className="brand-mark">
            <Cross size={25} />
          </span>
          <div>
            Farmacias<span>ALVARADO</span>
          </div>
        </div>
        <div>
          <span className="eyebrow">CERCA DE CADA GUATEMALTECO</span>
          <h1>
            El cuidado se expande.
            <br />
            El control permanece.
          </h1>
          <p>
            Toda tu red de farmacias, conectada en un solo lugar. Una visión clara para tomar
            mejores decisiones.
          </p>
          <div className="login-features">
            <span>
              <Building2 size={19} />
              Operación multisucursal
            </span>
            <span>
              <Boxes size={19} />
              Inventario conectado
            </span>
            <span>
              <ShieldCheck size={19} />
              Trazabilidad de operaciones
            </span>
          </div>
        </div>
        <small>Farmacias Alvarado · Plataforma de administración</small>
      </section>
      <section className="login-form">
        <div>
          <span className="eyebrow">CENTRO DE OPERACIONES</span>
          <h2>Te damos la bienvenida</h2>
          <p>Ingresa con tu cuenta para continuar.</p>
          <form onSubmit={submit}>
            <label>
              Correo electrónico
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                defaultValue={mode === 'demo' ? 'administrador@farmaalvar.demo' : ''}
              />
            </label>
            <label>
              Contraseña
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                defaultValue={mode === 'demo' ? 'FarmaDemo2026!' : ''}
              />
            </label>
            {error && (
              <div role="alert" className="error">
                {error}
              </div>
            )}
            <button className="button primary" disabled={busy}>
              {busy ? 'Verificando acceso…' : 'Ingresar al sistema'}
              <ArrowRight size={18} />
            </button>
          </form>
          {mode === 'demo' && (
            <div className="demo-login">
              <strong>Entorno de demostración</strong>
              <p>
                Datos ficticios, guardados localmente. Puedes explorar otros roles usando auditor,
                gerente, cajero, logistica o rrhh seguido de @farmaalvar.demo y la misma contraseña.
              </p>
            </div>
          )}
          <small className="login-help">
            ¿Necesitas acceso? Contacta al administrador de tu organización.
          </small>
        </div>
      </section>
    </main>
  );
}
