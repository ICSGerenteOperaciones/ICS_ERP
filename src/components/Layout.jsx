import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Moon, Sun, RotateCcw, ArrowLeft, Cloud, CloudUpload } from 'lucide-react';
import ModuleWheel from './ModuleWheel';
import EmpresaSwitcher from './EmpresaSwitcher';
import GlobalSearch from './GlobalSearch';
import NetworkBackground from './NetworkBackground';
import { useAuth } from '../auth/AuthContext';
import { MODULES } from '../config/modules';
import { BRAND } from '../config/brand';
import { db, useDb } from '../data/db';
import { useTheme } from '../hooks/useTheme';
import { IconButton, useUi } from './ui';

export default function Layout() {
  const { user, role, isAdmin, logout, empresa, remote } = useAuth();
  const { confirm, toast } = useUi();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const [theme, toggleTheme] = useTheme();
  const syncing = useDb((d) => d.isSyncing());

  // Si el servidor rechaza un cambio (permisos, datos inválidos, sin conexión) se avisa al usuario.
  useEffect(() => {
    db.setSyncHandler((mensaje) => toast(mensaje, 'critical'));
    return () => db.setSyncHandler(null);
  }, [toast]);
  const [searchOpen, setSearchOpen] = useState(false);

  // Atajos del buscador: Ctrl/Cmd + K, o "/" cuando no se está escribiendo en un campo.
  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      } else if (e.key === '/' && !typing) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const canGoBack = (window.history.state?.idx ?? 0) > 0;
  const inRecord = new URLSearchParams(search).has('id');
  const current = MODULES.find((m) => pathname.startsWith(m.path));
  const initials = user.nombre
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('');

  const resetDemo = async () => {
    if (await confirm('Se restaurarán todos los datos de demostración. ¿Continuar?', { title: 'Restaurar DEMO', danger: true })) {
      db.reset();
      db.logEvent('EDITAR', 'Restauró los datos de demostración', { modulo: 'sistema' });
      toast('Datos de demostración restaurados');
    }
  };

  return (
    <div className="app" style={{ '--empresa': empresa?.color || 'var(--brand-primary)' }}>
      <NetworkBackground variant="app" />
      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}
      <ModuleWheel onSearch={() => setSearchOpen(true)} searchOpen={searchOpen} />
      <div className="main">
        <header className="topbar">
          <div className="crumbs">
            <button className="back-btn" onClick={() => navigate(-1)} disabled={!canGoBack} aria-label="Ir atrás" title="Ir atrás">
              <ArrowLeft size={16} /> <span>Atrás</span>
            </button>
            <EmpresaSwitcher />
            <span className="brand-name">{BRAND.product}</span>
            <span className="sep">/</span>
            {inRecord && current ? (
              <>
                <button className="crumb-link" onClick={() => navigate(current.path)}>
                  {current.label}
                </button>
                <span className="sep">/</span>
                <span>Detalle</span>
              </>
            ) : (
              <span>{current?.label || 'Inicio'}</span>
            )}
          </div>
          <div className="topbar-right">
            {remote && (
              <span className={`sync-chip ${syncing ? 'busy' : ''}`} role="status" title={syncing ? 'Enviando cambios al servidor…' : 'Todos los cambios están guardados'}>
                {syncing ? <CloudUpload size={15} aria-hidden /> : <Cloud size={15} aria-hidden />}
                <span>{syncing ? 'Guardando…' : 'Guardado'}</span>
              </span>
            )}
            {isAdmin && !remote && <IconButton icon={RotateCcw} label="Restaurar datos DEMO" onClick={resetDemo} />}
            <IconButton icon={theme === 'dark' ? Sun : Moon} label={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'} onClick={toggleTheme} />
            <div className="user-chip">
              <span className="avatar">{initials}</span>
              <span className="user-meta">
                <strong>{user.nombre}</strong>
                <small>{role?.nombre}</small>
              </span>
            </div>
            <IconButton icon={LogOut} label="Cerrar sesión" onClick={logout} />
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
