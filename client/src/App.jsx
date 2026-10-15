import { useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import { api } from './services/api';
import Layout from './views/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ModulePage from './pages/ModulePage';
import PurchasesPage from './pages/PurchasesPage';
export default function App() {
  const [snapshot, setSnapshot] = useState(null),
    [loading, setLoading] = useState(true),
    [mode, setMode] = useState(''),
    [fatal, setFatal] = useState(''),
    [page, setPage] = useState(location.hash.slice(1) || 'dashboard'),
    [branch, setBranch] = useState(''),
    [toast, setToast] = useState('');
  async function reload() {
    const data = await api('/bootstrap');
    setSnapshot(data);
    setFatal('');
  }
  useEffect(() => {
    let live = true;
    async function init() {
      try {
        const health = await api('/health');
        if (live) setMode(health.mode);
        await reload();
      } catch (e) {
        if (e.status !== 401 && live) setFatal(e.message);
      } finally {
        if (live) setLoading(false);
      }
    }
    init();
    const onHash = () => setPage(location.hash.slice(1) || 'dashboard');
    const onError = (e) => {
      if (e.detail.status === 401) {
        setSnapshot(null);
        setBranch('');
      }
    };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('api-error', onError);
    return () => {
      live = false;
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('api-error', onError);
    };
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [page]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    if (!snapshot) return;
    const id = setInterval(() => reload().catch(() => {}), 60000);
    return () => clearInterval(id);
  }, [!!snapshot]);
  async function logout() {
    try {
      await api('/auth/logout', {});
      setSnapshot(null);
      setBranch('');
      setPage('dashboard');
      location.hash = 'dashboard';
    } catch (e) {
      setToast(e.message);
    }
  }
  if (loading)
    return (
      <div className="loading-screen">
        <RefreshCw className="spin" />
        <strong>Conectando tu red de farmacias…</strong>
      </div>
    );
  if (fatal)
    return (
      <div className="loading-screen">
        <h2>No pudimos conectar con el servidor</h2>
        <p>{fatal}</p>
        <button className="button primary" onClick={() => location.reload()}>
          Reintentar
        </button>
      </div>
    );
  if (!snapshot) return <Login mode={mode} onLogin={reload} />;
  const current = snapshot.modules.includes(page) ? page : 'dashboard';
  const data = Object.fromEntries(
    Object.entries(snapshot.data).map(([key, rows]) => [
      key,
      !branch || ['products', 'profiles', 'destinations', 'customers', 'suppliers'].includes(key)
        ? rows
        : rows.filter((r) =>
            key === 'branches'
              ? r.id === branch
              : key === 'transfers'
                ? r.source_id === branch || r.destination_id === branch
                : r.branch_id === branch,
          ),
    ]),
  );
  return (
    <Layout
      snapshot={snapshot}
      page={current}
      setPage={(p) => {
        setPage(p);
        location.hash = p;
      }}
      branch={branch}
      setBranch={setBranch}
      onLogout={logout}
      mode={mode}
    >
      {current === 'dashboard' ? (
        <Dashboard
          data={data}
          allData={snapshot.data}
          user={snapshot.user}
          modules={snapshot.modules}
          setPage={(p) => {
            setPage(p);
            location.hash = p;
          }}
        />
      ) : current === 'purchases' ? (
        <PurchasesPage
          data={data}
          allData={snapshot.data}
          user={snapshot.user}
          reload={reload}
          notify={setToast}
        />
      ) : (
        <ModulePage
          key={current}
          page={current}
          data={data}
          allData={snapshot.data}
          user={snapshot.user}
          reload={reload}
          notify={setToast}
        />
      )}
      <div className="toast-region" aria-live="polite">
        {toast && (
          <div className="toast">
            <CheckCircle2 size={19} />
            {toast}
          </div>
        )}
      </div>
    </Layout>
  );
}
