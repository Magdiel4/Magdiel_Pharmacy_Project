import {
  Cross,
  LayoutDashboard,
  Building2,
  Package,
  ArrowLeftRight,
  Wallet,
  Users,
  Banknote,
  Monitor,
  Truck,
  ShieldCheck,
  ClipboardList,
  Tags,
  ShoppingCart,
  ContactRound,
  Factory,
  ChevronDown,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { useState } from 'react';
export const navigation = [
  ['dashboard', 'Vista general', LayoutDashboard],
  ['branches', 'Sucursales', Building2],
  ['articles', 'Artículos', Tags],
  ['suppliers', 'Proveedores', Factory],
  ['purchases', 'Órdenes de compra', ShoppingCart],
  ['inventory', 'Inventario', Package],
  ['transfers', 'Traslados', ArrowLeftRight],
  ['orders', 'Pedidos y entregas', Truck],
  ['customers', 'Clientes', ContactRound],
  ['cash', 'Caja y movimientos', Wallet],
  ['employees', 'Empleados', Users],
  ['payroll', 'Nómina', Banknote],
  ['assets', 'Activos fijos', Monitor],
  ['users', 'Usuarios y roles', ShieldCheck],
  ['audit', 'Auditoría', ClipboardList],
];
export default function Layout({
  snapshot,
  page,
  setPage,
  branch,
  setBranch,
  onLogout,
  mode,
  children,
}) {
  const [open, setOpen] = useState(false);
  const { user, modules, data } = snapshot;
  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <a className="brand" href="#dashboard" onClick={() => setPage('dashboard')}>
          <span className="brand-mark">
            <Cross size={25} />
          </span>
          <div>
            Farmacias<span>ALVARADO</span>
          </div>
        </a>
        <button
          className="mobile-close icon-button"
          onClick={() => setOpen(false)}
          aria-label="Cerrar menú"
        >
          <X />
        </button>
        <div className="workspace-label">
          <span className="workspace-avatar">FA</span>
          <div>
            Administración central<small>Red de farmacias · Guatemala</small>
          </div>
        </div>
        <span className="nav-label">ESPACIO DE TRABAJO</span>
        <nav>
          {navigation
            .filter(([key]) => modules.includes(key))
            .map(([key, label, Icon]) => (
              <a
                key={key}
                href={`#${key}`}
                className={key === page ? 'active' : ''}
                onClick={() => {
                  setPage(key);
                  setOpen(false);
                }}
              >
                <Icon size={19} />
                <span>{label}</span>
                {key === page && <i />}
              </a>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="user-profile">
            <span className="avatar">
              {user.name
                .split(' ')
                .slice(0, 2)
                .map((s) => s[0])
                .join('')}
            </span>
            <div>
              <strong>{user.name}</strong>
              <small>{user.role}</small>
            </div>
            <button
              onClick={onLogout}
              className="icon-button"
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      {open && (
        <button className="menu-backdrop" aria-label="Cerrar menú" onClick={() => setOpen(false)} />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="menu-button icon-button"
              aria-label="Abrir menú"
              onClick={() => setOpen(true)}
            >
              <Menu />
            </button>
            <span>Centro de operaciones</span>
            <span>/</span>
            <strong>{navigation.find((n) => n[0] === page)?.[1]}</strong>
          </div>
          <div className="topbar-right">
            <span className="connection">
              <i />
              {mode === 'demo' ? 'Entorno demo' : 'Conectado a Supabase'}
            </span>
            <div className="top-divider" />
            <span className="avatar small">{user.name[0]}</span>
          </div>
        </header>
        <main className="main-content">
          <div className="context-bar">
            <label className="branch-selector">
              <Building2 size={16} />
              <select
                aria-label="Filtrar sucursal"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
              >
                <option value="">Todas las sucursales</option>
                {data.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
          </div>
          {children}
          <footer className="footer">
            <span>© {new Date().getFullYear()} Farmacias Alvarado</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
