import {
  LayoutDashboard,
  ShoppingCart,
  PenTool,
  ListChecks,
  Users2,
  Warehouse,
  ScrollText,
  Building2,
  UserCog,
  ShieldCheck,
  Workflow,
} from 'lucide-react';

// Registro único de módulos: alimenta la rueda de navegación, las rutas
// y la matriz de permisos de roles.
export const MODULES = [
  { key: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, group: 'Inicio' },
  { key: 'compras', label: 'Compras', path: '/compras', icon: ShoppingCart, group: 'Gestión' },
  { key: 'inventario', label: 'Inventario', path: '/inventario', icon: Warehouse, group: 'Gestión' },
  { key: 'firmas', label: 'Firmas', path: '/firmas', icon: PenTool, group: 'Gestión' },
  { key: 'actividades', label: 'Actividades', path: '/actividades', icon: ListChecks, group: 'Gestión' },
  { key: 'operaciones', label: 'Operaciones', path: '/operaciones', icon: Workflow, group: 'Gestión' },
  { key: 'terceros', label: 'Terceros', path: '/terceros', icon: Users2, group: 'Gestión' },
  { key: 'auditorias', label: 'Auditoría', path: '/auditorias', icon: ScrollText, group: 'Seguridad' },
  { key: 'empresas', label: 'Empresas', path: '/empresas', icon: Building2, group: 'Seguridad' },
  { key: 'usuarios', label: 'Usuarios', path: '/usuarios', icon: UserCog, group: 'Seguridad' },
  { key: 'roles', label: 'Roles y permisos', short: 'Roles', path: '/roles', icon: ShieldCheck, group: 'Seguridad' },
];

// Acciones CRUD + acción de flujo de trabajo.
export const ACTIONS = [
  { key: 'ver', label: 'Ver (R)' },
  { key: 'crear', label: 'Crear (C)' },
  { key: 'editar', label: 'Editar (U)' },
  { key: 'eliminar', label: 'Eliminar (D)' },
  { key: 'aprobar', label: 'Aprobar / Firmar' },
];

// Dashboards parametrizables por usuario.
export const DASHBOARDS = [
  { key: 'resumen', label: 'Resumen ejecutivo', module: 'dashboard' },
  { key: 'compras', label: 'Compras', module: 'compras' },
  { key: 'firmas', label: 'Firmas', module: 'firmas' },
  { key: 'actividades', label: 'Actividades', module: 'actividades' },
  { key: 'terceros', label: 'Terceros', module: 'terceros' },
  { key: 'inventario', label: 'Inventario', module: 'inventario' },
  { key: 'auditorias', label: 'Auditoría', module: 'auditorias' },
];

export const fullPermissions = () =>
  Object.fromEntries(MODULES.map((m) => [m.key, Object.fromEntries(ACTIONS.map((a) => [a.key, true]))]));

export const emptyPermissions = () =>
  Object.fromEntries(MODULES.map((m) => [m.key, Object.fromEntries(ACTIONS.map((a) => [a.key, false]))]));
