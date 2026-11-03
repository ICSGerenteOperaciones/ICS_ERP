import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { UiProvider, Empty } from './components/ui';
import Layout from './components/Layout';
import { LogoMark } from './components/Logo';
import Login from './pages/Login';
import Dashboard from './modules/dashboard/Dashboard';
import Compras from './modules/compras/Compras';
import Firmas from './modules/firmas/Firmas';
import Actividades from './modules/actividades/Actividades';
import Operaciones from './modules/operaciones/Operaciones';
import Terceros from './modules/terceros/Terceros';
import Inventario from './modules/inventario/Inventario';
import Auditorias from './modules/auditorias/Auditorias';
import Empresas from './modules/empresas/Empresas';
import Usuarios from './modules/seguridad/Usuarios';
import Roles from './modules/seguridad/Roles';

const PAGES = {
  dashboard: Dashboard,
  compras: Compras,
  firmas: Firmas,
  actividades: Actividades,
  operaciones: Operaciones,
  terceros: Terceros,
  inventario: Inventario,
  auditorias: Auditorias,
  empresas: Empresas,
  usuarios: Usuarios,
  roles: Roles,
};

/** Protege cada ruta con el permiso "ver" del módulo. */
function Guard({ module }) {
  const { can } = useAuth();
  const Page = PAGES[module];
  if (!can(module, 'ver')) {
    return (
      <div className="page">
        <Empty icon={ShieldAlert} title="Acceso restringido">
          Su rol no tiene permiso para ver este módulo.
        </Empty>
      </div>
    );
  }
  return <Page />;
}

function AppRoutes() {
  const { user, booting } = useAuth();
  if (booting) {
    return (
      <div className="boot" role="status" aria-live="polite">
        <LogoMark size={72} />
        <p>Cargando Insight Cloud Solution…</p>
      </div>
    );
  }
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route element={<Layout />}>
        {Object.keys(PAGES).map((m) => (
          <Route key={m} path={`/${m}`} element={<Guard module={m} />} />
        ))}
        {/* La primera vista tras el ingreso es el dashboard parametrizado del usuario */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <UiProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </UiProvider>
    </BrowserRouter>
  );
}
