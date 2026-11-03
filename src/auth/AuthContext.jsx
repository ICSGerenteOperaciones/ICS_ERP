import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { db, useDb } from '../data/db';
import { DASHBOARDS } from '../config/modules';
import { REMOTE, supabase } from '../lib/supabase';

const AuthContext = createContext(null);
const SESSION_KEY = 'ics-erp-session';
const EMPRESA_KEY = 'ics-erp-empresa';
const REFRESH_MS = 60_000; // en modo conectado se vuelve a leer el servidor cada minuto (cambios de otros usuarios)

function readStorage(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key, value) {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    /* sesión solo en memoria */
  }
}

/** Empresas a las que puede entrar un usuario: el administrador a todas las activas; el resto, las asignadas. */
function empresasPermitidas(user) {
  if (!user) return [];
  const activas = db.listAll('empresas').filter((e) => e.activo !== false);
  if (user.rol_id === 'rol-admin') return activas;
  return activas.filter((e) => (user.empresas_ids || []).includes(e.id));
}

export function AuthProvider({ children }) {
  // En modo demostración el usuario sale de la sesión del navegador; en modo conectado, de Supabase Auth.
  const [userId, setUserId] = useState(() => (REMOTE ? null : readStorage(SESSION_KEY)));
  const [booting, setBooting] = useState(REMOTE); // comprobando si ya hay una sesión de Supabase abierta
  // La empresa activa debe fijarse ANTES del primer render para no mostrar datos de otra empresa.
  const [empresaId, setEmpresaId] = useState(() => {
    const saved = REMOTE ? null : readStorage(EMPRESA_KEY);
    db.setEmpresa(saved, { silent: true });
    return saved;
  });

  // Usuario y rol se leen siempre del repositorio para reflejar cambios en caliente.
  const user = useDb((d) => (userId ? d.get('usuarios', userId) : null), [userId]);
  const role = useDb((d) => (user ? d.get('roles', user.rol_id) : null), [user?.rol_id]);
  const empresasAll = useDb((d) => d.listAll('empresas'));

  const empresas = useMemo(
    () => empresasPermitidas(user),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, empresasAll],
  );
  const empresa = empresas.find((e) => e.id === empresaId) || null;

  // El repositorio necesita saber quién actúa para registrar la auditoría.
  useEffect(() => {
    db.setActor(user ? { id: user.id, nombre: user.nombre, usuario: user.usuario, rol: role?.nombre || '—' } : null);
  }, [user, role]);

  // Si la empresa activa deja de estar permitida (p. ej. se le retiró el acceso), pasa a la primera disponible.
  useEffect(() => {
    if (!user) return;
    if (!empresa && empresas.length) {
      const fallback = empresas.find((e) => e.id === user.empresa_id) || empresas[0];
      db.setEmpresa(fallback.id);
      writeStorage(EMPRESA_KEY, fallback.id);
      setEmpresaId(fallback.id);
    }
  }, [user, empresa, empresas]);

  /** Modo conectado: carga los datos del servidor y deja lista la sesión. Devuelve un mensaje de error o null. */
  const openRemoteSession = useCallback(async (authUserId, { logLogin = false } = {}) => {
    await db.hydrate();
    const u = db.get('usuarios', authUserId);
    if (!u || !u.activo) {
      await supabase.auth.signOut();
      db.clear();
      return !u ? 'Su cuenta no tiene un perfil en el sistema. Contacte al administrador.' : 'El usuario está inactivo.';
    }
    const permitidas = empresasPermitidas(u);
    // Un administrador puede entrar sin empresas (instalación nueva): se le guía a crear la primera.
    if (!permitidas.length && u.rol_id !== 'rol-admin') {
      await supabase.auth.signOut();
      db.clear();
      return 'El usuario no tiene empresas asignadas. Contacte al administrador.';
    }
    const guardada = readStorage(EMPRESA_KEY);
    const inicial = permitidas.find((e) => e.id === guardada) || permitidas.find((e) => e.id === u.empresa_id) || permitidas[0];
    db.setEmpresa(inicial?.id || null, { silent: true });
    writeStorage(EMPRESA_KEY, inicial?.id || null);
    setEmpresaId(inicial?.id || null);
    setUserId(u.id);
    if (logLogin) {
      db.logEvent('LOGIN', inicial ? `Inició sesión en ${inicial.alias || inicial.nombre}` : 'Inició sesión (sin empresas creadas)', {
        who: { id: u.id, nombre: u.nombre, usuario: u.usuario, rol: db.get('roles', u.rol_id)?.nombre || '—' },
      });
    }
    return null;
  }, []);

  // Al abrir la aplicación: si Supabase ya tiene una sesión guardada, se retoma sin pedir la contraseña.
  useEffect(() => {
    if (!REMOTE) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session) await openRemoteSession(data.session.user.id);
      } catch {
        /* sin conexión: se mostrará la pantalla de ingreso */
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    // La sesión puede terminar por expiración o porque se cerró en otra pestaña.
    const { data: sub } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_OUT') {
        db.clear();
        writeStorage(EMPRESA_KEY, null);
        db.setEmpresa(null, { silent: true });
        setEmpresaId(null);
        setUserId(null);
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [openRemoteSession]);

  // Mantiene la copia local al día con los cambios de otros usuarios.
  useEffect(() => {
    if (!REMOTE || !userId) return undefined;
    const tick = () => !document.hidden && db.refresh();
    const timer = setInterval(tick, REFRESH_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [userId]);

  // NOTA (modo demostración): la clave se valida en el navegador. En modo conectado la valida Supabase Auth.
  const login = useCallback(
    async (usuario, clave) => {
      if (REMOTE) {
        const { data, error } = await supabase.auth.signInWithPassword({ email: usuario.trim(), password: clave });
        if (error) {
          return /invalid|credentials/i.test(error.message) ? 'Correo o contraseña incorrectos.' : error.message;
        }
        try {
          return await openRemoteSession(data.user.id, { logLogin: true });
        } catch (e) {
          await supabase.auth.signOut();
          db.clear();
          return `No se pudieron cargar los datos: ${e.message}`;
        }
      }

      const u = db.list('usuarios').find((x) => x.usuario.toLowerCase() === usuario.trim().toLowerCase());
      if (!u || u.clave !== clave) {
        const typed = usuario.trim();
        db.logEvent('LOGIN_FALLIDO', `Intento de ingreso fallido con el usuario "${typed || '(vacío)'}"`, {
          who: { id: u?.id || '', nombre: u?.nombre || typed || '(desconocido)', usuario: typed, rol: '—' },
          nivel: 'critical',
        });
        return 'Usuario o contraseña incorrectos.';
      }
      if (!u.activo) return 'El usuario está inactivo.';
      const permitidas = empresasPermitidas(u);
      if (!permitidas.length) return 'El usuario no tiene empresas asignadas. Contacte al administrador.';
      const inicial = permitidas.find((e) => e.id === u.empresa_id) || permitidas[0];
      db.setEmpresa(inicial.id, { silent: true });
      db.logEvent('LOGIN', `Inició sesión en ${inicial.alias || inicial.nombre}`, {
        who: { id: u.id, nombre: u.nombre, usuario: u.usuario, rol: db.get('roles', u.rol_id)?.nombre || '—' },
      });
      writeStorage(SESSION_KEY, u.id);
      writeStorage(EMPRESA_KEY, inicial.id);
      setEmpresaId(inicial.id);
      setUserId(u.id);
      return null;
    },
    [openRemoteSession],
  );

  const logout = useCallback(async () => {
    db.logEvent('LOGOUT', 'Cerró sesión');
    if (REMOTE) {
      await db.whenIdle(); // el evento de cierre debe llegar al servidor antes de perder la sesión
      await supabase.auth.signOut();
      db.clear();
    }
    writeStorage(SESSION_KEY, null);
    writeStorage(EMPRESA_KEY, null);
    db.setEmpresa(null, { silent: true });
    setEmpresaId(null);
    setUserId(null);
  }, []);

  /** Cambia la empresa con la que se trabaja; todas las pantallas se recargan con sus datos. */
  const cambiarEmpresa = useCallback(
    (id) => {
      const destino = empresas.find((e) => e.id === id);
      if (!destino || destino.id === empresaId) return false;
      db.setEmpresa(id);
      writeStorage(EMPRESA_KEY, id);
      setEmpresaId(id);
      db.logEvent('CAMBIO_EMPRESA', `Cambió a la empresa ${destino.nombre}`);
      return true;
    },
    [empresas, empresaId],
  );

  /** Cambia la contraseña de la cuenta actual (solo modo conectado). Devuelve un mensaje de error o null. */
  const cambiarContrasena = useCallback(async (nueva) => {
    if (!REMOTE) return 'Disponible solo con la base de datos conectada.';
    if (!nueva || nueva.length < 10) return 'La contraseña debe tener al menos 10 caracteres.';
    const { error } = await supabase.auth.updateUser({ password: nueva });
    if (error) return error.message;
    db.logEvent('EDITAR', 'Cambió su contraseña', { modulo: 'usuarios' });
    return null;
  }, []);

  const value = useMemo(() => {
    const isAdmin = role?.id === 'rol-admin';
    const can = (module, action = 'ver') => isAdmin || !!role?.permisos?.[module]?.[action];
    // El administrador ve todos los dashboards; el resto, los parametrizados y permitidos.
    const dashboards = isAdmin
      ? DASHBOARDS.map((d) => d.key)
      : (user?.dashboards || []).filter((k) => can(DASHBOARDS.find((d) => d.key === k)?.module || 'dashboard'));
    return { user, role, isAdmin, can, dashboards, login, logout, empresa, empresas, cambiarEmpresa, cambiarContrasena, booting, remote: REMOTE };
  }, [user, role, login, logout, empresa, empresas, cambiarEmpresa, cambiarContrasena, booting]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
