// Repositorio de datos.
// La interfaz usa una API CRUD síncrona sobre una copia en memoria. Hay dos modos:
//   · Conectado (por defecto): la copia se carga desde Supabase al iniciar sesión y cada cambio se
//     envía al servidor en orden (cola de escritura). La seguridad la imponen Supabase Auth y RLS.
//   · Demostración (VITE_BACKEND=local): los datos viven en el localStorage del navegador.
//
// AUDITORÍA: toda creación, edición y eliminación pasa por aquí y queda registrada
// automáticamente en `auditoria_logs` (evento) + `auditoria_logs_cambios` (campo a campo).
import { useEffect, useState, useCallback } from 'react';
import { SCHEMA, TABLES, SCOPED_TABLES, GLOBAL_TABLES } from './schema';
import { WORKFLOWS } from '../workflow/definitions';
import { buildSeed, EMPRESA_PRINCIPAL } from './seed';
import { REMOTE } from '../lib/supabase';
import { applyOp, fetchAll, fetchCambios, friendlyError } from './remote';

const STORAGE_KEY = 'ics-erp-db-v1';
const MAX_LOGS = 1500; // el DEMO conserva los eventos más recientes
const emptyState = () => Object.fromEntries(TABLES.map((t) => [t, []]));
const listeners = new Set();
// MULTIEMPRESA: empresa activa de la sesión. Los datos de negocio (SCOPED_TABLES) solo se
// leen/escriben dentro de ella; el repositorio aplica el filtro para que ninguna pantalla
// pueda mezclar datos de empresas distintas.
let activeEmpresa = null;
let state = load();

const visibleRow = (table, row) => {
  if (!SCOPED_TABLES.has(table)) return true;
  if (table === 'auditoria_logs' && !row.empresa_id) return true; // eventos globales (sesiones, usuarios…)
  return !!activeEmpresa && row.empresa_id === activeEmpresa;
};

function load() {
  if (REMOTE) return emptyState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migración: tablas y permisos de módulos agregados después de guardar los datos.
      const seed = buildSeed();
      const existed = new Set(Object.keys(parsed));
      Object.keys(parsed).forEach((k) => !TABLES.includes(k) && delete parsed[k]);
      TABLES.forEach((t) => (parsed[t] ??= seed[t] || []));
      if (!existed.has('empresas')) {
        // Los datos existentes pasan a la empresa principal y se agregan las demás empresas de la demo.
        [...SCOPED_TABLES, 'auditoria_logs_cambios'].forEach((t) => {
          if (!existed.has(t)) return; // ya viene completa desde la semilla
          const global = (r) => t === 'auditoria_logs' && (r.modulo === 'sesion' || ['roles', 'usuarios'].includes(r.tabla));
          parsed[t] = [
            ...parsed[t].map((r) => ({ ...r, empresa_id: r.empresa_id ?? (global(r) ? '' : EMPRESA_PRINCIPAL) })),
            ...seed[t].filter((r) => r.empresa_id && r.empresa_id !== EMPRESA_PRINCIPAL),
          ];
        });
        parsed.usuarios = parsed.usuarios.map((u) => {
          const s = seed.usuarios.find((x) => x.id === u.id);
          return { empresa_id: s?.empresa_id || EMPRESA_PRINCIPAL, empresas_ids: s?.empresas_ids || [EMPRESA_PRINCIPAL], ...u };
        });
      }
      parsed.roles = parsed.roles.map((r) => {
        const base = seed.roles.find((s) => s.id === r.id);
        return base ? { ...r, permisos: { ...base.permisos, ...r.permisos } } : r;
      });
      return parsed;
    }
  } catch {
    /* almacenamiento no disponible: se usa la semilla en memoria */
  }
  return buildSeed();
}

const notify = () => listeners.forEach((fn) => fn());

function persist() {
  if (!REMOTE) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* sin persistencia en este navegador */
    }
  }
  notify();
}

// ======================= SINCRONIZACIÓN CON EL SERVIDOR =======================
// Las operaciones se envían una a una y en orden (un maestro siempre antes que sus detalles).
// Si el servidor rechaza una, se descartan las pendientes, se avisa una sola vez y se recarga
// la copia local desde el servidor para que la pantalla refleje la realidad.
const queue = [];
let flushing = false;
let canSync = false; // solo con sesión iniciada y datos cargados
let syncHandler = null;
const loadedCambios = new Set(); // eventos de auditoría cuyo detalle ya está en memoria
let refreshing = false;

function enqueue(op) {
  if (!REMOTE || !canSync) return;
  queue.push(op);
  flush();
}

async function flush() {
  if (flushing) return;
  flushing = true;
  notify();
  let failed = null;
  let needsRefresh = false;
  while (queue.length) {
    const op = queue.shift();
    try {
      await applyOp(op);
      if (op.refresh) needsRefresh = true;
    } catch (e) {
      failed = e;
      queue.length = 0;
    }
  }
  flushing = false;
  if (failed) syncHandler?.(friendlyError(failed), failed);
  notify();
  if (failed || needsRefresh) await db.refresh({ force: true });
}

if (REMOTE && typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (flushing || queue.length) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

const now = () => new Date().toISOString();

function nextCode(table) {
  const prefix = SCHEMA[table]?.prefix;
  if (!prefix) return undefined;
  const max = state[table].filter((r) => visibleRow(table, r)).reduce((m, r) => {
    const n = parseInt(String(r.codigo || '').split('-').pop(), 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}

// ======================= AUDITORÍA (LOGS) =======================
const NO_LOG = new Set(['auditoria_logs', 'auditoria_logs_cambios', 'workflow_historial']);
const IGNORED_FIELDS = new Set(['id', 'creado', 'actualizado', 'empresa_id']);
const SECRET_FIELDS = new Set(['clave']);
const MODULE_ALIAS = { articulos: 'inventario' };
const LABELS = {
  compras: 'orden de compra', compras_items: 'ítem de compra', compras_entregas: 'entrega',
  firmas: 'documento', firmas_firmantes: 'firmante', firmas_adjuntos: 'adjunto',
  actividades: 'actividad', actividades_tareas: 'tarea', actividades_tiempos: 'registro de tiempo',
  terceros: 'tercero', terceros_contactos: 'contacto', terceros_direcciones: 'dirección', terceros_cuentas: 'cuenta bancaria',
  inventario: 'movimiento de inventario', inventario_lineas: 'línea de movimiento', articulos: 'artículo',
  usuarios: 'usuario', roles: 'rol',
};
const SYSTEM_ACTOR = { id: 'sistema', nombre: 'Sistema', usuario: 'sistema', rol: '—' };
let actor = SYSTEM_ACTOR;

export const moduleOf = (table) => MODULE_ALIAS[table] || table.split('_')[0];

function fmtValue(key, v) {
  if (SECRET_FIELDS.has(key)) return v ? '••••••' : '';
  if (v == null || v === '') return '';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') {
    const s = JSON.stringify(v);
    return s.length > 160 ? `${s.slice(0, 157)}…` : s;
  }
  const s = String(v);
  if (s.startsWith('data:')) return '[imagen]';
  return s.length > 160 ? `${s.slice(0, 157)}…` : s;
}

function parentOf(table, row) {
  for (const [master, def] of Object.entries(SCHEMA)) {
    const fk = def.details?.[table];
    if (fk) return state[master].find((r) => r.id === row[fk]);
  }
  return null;
}

function recordLabel(table, row) {
  if (row.codigo) return row.codigo;
  const own = row.nombre || row.titulo || row.razon_social || row.descripcion || row.requisito;
  const parent = parentOf(table, row);
  const short = own ? String(own).slice(0, 40) : '';
  return parent?.codigo ? `${parent.codigo} › ${short || 'detalle'}` : short || row.id;
}

const stateLabel = (table, estado) => WORKFLOWS[table]?.states[estado]?.label || estado;

function diff(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out = [];
  keys.forEach((key) => {
    if (IGNORED_FIELDS.has(key)) return;
    const a = fmtValue(key, before[key]);
    const b = fmtValue(key, after[key]);
    if (a !== b) out.push({ campo: key, anterior: a, nuevo: b });
  });
  return out;
}

/** Registra un evento y sus cambios; recorta los más antiguos si supera el máximo. */
function addLog(entry, cambios = []) {
  const who = entry.who || actor;
  const log = {
    id: uid(), empresa_id: entry.global || ['sesion', 'sistema'].includes(entry.modulo) || GLOBAL_TABLES.has(entry.tabla) ? '' : activeEmpresa || '',
    fecha: now(), usuario_id: who.id, usuario: who.nombre, usuario_login: who.usuario, rol: who.rol,
    accion: entry.accion, modulo: entry.modulo, tabla: entry.tabla || '', registro_id: entry.registro_id || '',
    registro_codigo: entry.registro_codigo || '', descripcion: entry.descripcion, nivel: entry.nivel || 'info',
  };
  log.codigo = nextCode('auditoria_logs');
  let logs = [...state.auditoria_logs, log];
  let rows = [...state.auditoria_logs_cambios, ...cambios.map((c) => ({ id: uid(), log_id: log.id, ...c }))];
  if (logs.length > MAX_LOGS) {
    const drop = new Set(logs.slice(0, logs.length - MAX_LOGS).map((l) => l.id));
    logs = logs.slice(-MAX_LOGS);
    rows = rows.filter((r) => !drop.has(r.log_id));
  }
  state = { ...state, auditoria_logs: logs, auditoria_logs_cambios: rows };
  loadedCambios.add(log.id);
  enqueue({ type: 'insert', table: 'auditoria_logs', row: log });
  if (cambios.length) enqueue({ type: 'insertMany', table: 'auditoria_logs_cambios', rows: rows.filter((r) => r.log_id === log.id) });
}

export const db = {
  list(table, filter) {
    const rows = (state[table] || []).filter((r) => visibleRow(table, r));
    return filter ? rows.filter(filter) : rows;
  },

  /** Lectura sin filtro de empresa (solo para vistas consolidadas del grupo). */
  listAll(table) {
    return state[table] || [];
  },

  get(table, id) {
    const row = (state[table] || []).find((r) => r.id === id);
    return row && visibleRow(table, row) ? row : null;
  },

  /** Cambia la empresa activa; notifica a las pantallas para que recarguen sus datos. */
  setEmpresa(id, { silent = false } = {}) {
    activeEmpresa = id || null;
    if (!silent) listeners.forEach((fn) => fn());
  },

  empresaActivaId() {
    return activeEmpresa;
  },

  insert(table, data) {
    const row = { id: uid(), creado: now(), actualizado: now(), ...data };
    if (SCOPED_TABLES.has(table) && row.empresa_id === undefined) row.empresa_id = activeEmpresa;
    if (!row.codigo && SCHEMA[table]?.prefix) row.codigo = nextCode(table);
    // En modo conectado la contraseña nunca queda en memoria: viaja una sola vez a la función segura.
    const password = REMOTE && table === 'usuarios' ? row.clave : undefined;
    if (REMOTE && table === 'usuarios') delete row.clave;
    state = { ...state, [table]: [...state[table], row] };
    if (REMOTE && table === 'usuarios') {
      enqueue({ type: 'fn', refresh: true, body: { action: 'create', password, user: { ...row, id: undefined } } });
    } else {
      enqueue({ type: 'insert', table, row });
    }
    if (!NO_LOG.has(table)) {
      const label = recordLabel(table, row);
      addLog(
        { accion: 'CREAR', modulo: moduleOf(table), tabla: table, registro_id: row.id, registro_codigo: label, descripcion: `Creó ${LABELS[table] || table} ${label}` },
        diff({}, row).filter((c) => c.nuevo !== ''),
      );
    }
    persist();
    return row;
  },

  update(table, id, patch) {
    const before = state[table].find((r) => r.id === id);
    let updated = null;
    const password = REMOTE && table === 'usuarios' ? patch.clave : undefined;
    const statePatch = REMOTE && table === 'usuarios' ? Object.fromEntries(Object.entries(patch).filter(([k]) => k !== 'clave')) : patch;
    state = {
      ...state,
      [table]: state[table].map((r) => (r.id === id ? (updated = { ...r, ...statePatch, actualizado: now() }) : r)),
    };
    if (updated) {
      enqueue({ type: 'update', table, id, patch: { ...statePatch, actualizado: updated.actualizado } });
      if (REMOTE && table === 'usuarios') {
        if ('empresas_ids' in statePatch) enqueue({ type: 'links', usuario_id: id, empresas_ids: statePatch.empresas_ids || [] });
        if (password) enqueue({ type: 'fn', body: { action: 'set_password', id, password } });
      }
    }
    if (before && updated && !NO_LOG.has(table)) {
      const cambios = diff(before, updated);
      if (cambios.length) {
        const label = recordLabel(table, updated);
        const soloEstado = cambios.length === 1 && cambios[0].campo === 'estado';
        addLog(
          {
            accion: soloEstado ? 'WORKFLOW' : 'EDITAR', modulo: moduleOf(table), tabla: table, registro_id: id, registro_codigo: label,
            descripcion: soloEstado
              ? `Cambió el estado de ${label}: ${stateLabel(table, cambios[0].anterior)} → ${stateLabel(table, cambios[0].nuevo)}`
              : `Editó ${LABELS[table] || table} ${label}`,
          },
          soloEstado ? [{ campo: 'estado', anterior: stateLabel(table, cambios[0].anterior), nuevo: stateLabel(table, cambios[0].nuevo) }] : cambios,
        );
      }
    }
    persist();
    return updated;
  },

  /** Elimina un registro y, si es maestro, todos sus detalles (cascada). */
  remove(table, id) {
    const row = state[table].find((r) => r.id === id);
    const label = row ? recordLabel(table, row) : id;
    const details = SCHEMA[table]?.details || {};
    const next = { ...state, [table]: state[table].filter((r) => r.id !== id) };
    let nDetalles = 0;
    Object.entries(details).forEach(([dt, fk]) => {
      const keep = next[dt].filter((r) => r[fk] !== id);
      nDetalles += next[dt].length - keep.length;
      next[dt] = keep;
    });
    next.workflow_historial = next.workflow_historial.filter((h) => h.registro_id !== id);
    state = next;
    // El servidor borra los detalles y el historial en cascada.
    if (REMOTE && table === 'usuarios') enqueue({ type: 'fn', refresh: true, body: { action: 'delete', id } });
    else enqueue({ type: 'delete', table, id });
    if (row && !NO_LOG.has(table)) {
      addLog(
        {
          accion: 'ELIMINAR', nivel: 'critical', modulo: moduleOf(table), tabla: table, registro_id: id, registro_codigo: label,
          descripcion: `Eliminó ${LABELS[table] || table} ${label}${nDetalles ? ` y ${nDetalles} registro(s) de detalle` : ''}`,
        },
        diff(row, {}).filter((c) => c.anterior !== ''),
      );
    }
    persist();
  },

  /** Detalles de un maestro para una tabla detalle concreta. */
  details(masterTable, masterId, detailTable) {
    const fk = SCHEMA[masterTable]?.details?.[detailTable];
    return fk ? state[detailTable].filter((r) => r[fk] === masterId) : [];
  },

  /** Define quién realiza las acciones (lo establece la sesión). */
  setActor(user) {
    actor = user || SYSTEM_ACTOR;
  },

  /** Registra un evento que no es un CRUD (inicio/cierre de sesión, restauración…). */
  logEvent(accion, descripcion, { modulo = 'sesion', who, nivel = 'info' } = {}) {
    addLog({ accion, modulo, descripcion, who, nivel });
    persist();
  },

  /** Restaura los datos de demostración (solo modo demostración). */
  reset() {
    if (REMOTE) return;
    state = buildSeed();
    persist();
  },

  /** ¿Se está trabajando contra el servidor? */
  isRemote: () => REMOTE,

  /** Carga desde el servidor todos los datos accesibles para el usuario con sesión iniciada. */
  async hydrate() {
    state = await fetchAll();
    loadedCambios.clear();
    canSync = true;
    notify();
  },

  /** Vuelve a leer el servidor (cambios de otros usuarios). Se omite si hay escrituras pendientes. */
  async refresh({ force = false } = {}) {
    if (!REMOTE || !canSync || refreshing || (!force && (flushing || queue.length))) return;
    refreshing = true;
    try {
      state = await fetchAll();
      loadedCambios.clear();
      notify();
    } catch (e) {
      syncHandler?.(friendlyError(e), e);
    } finally {
      refreshing = false;
    }
  },

  /** Al cerrar sesión: se vacía la copia local y se detiene la sincronización. */
  clear() {
    canSync = false;
    queue.length = 0;
    state = emptyState();
    loadedCambios.clear();
    notify();
  },

  /** Trae el detalle (campo a campo) de un evento de auditoría la primera vez que se abre. */
  async ensureCambios(logId) {
    if (!REMOTE || !canSync || loadedCambios.has(logId)) return;
    loadedCambios.add(logId);
    try {
      const rows = await fetchCambios(logId);
      state = { ...state, auditoria_logs_cambios: [...state.auditoria_logs_cambios.filter((c) => c.log_id !== logId), ...rows] };
      notify();
    } catch {
      loadedCambios.delete(logId);
    }
  },

  /** Espera a que se envíen todos los cambios pendientes al servidor. */
  whenIdle() {
    return new Promise((resolve) => {
      const check = () => (!flushing && !queue.length ? resolve() : setTimeout(check, 40));
      check();
    });
  },

  /** ¿Hay cambios pendientes de enviar al servidor? */
  isSyncing: () => flushing || queue.length > 0,

  /** Función que se invoca (una vez por fallo) con el mensaje de error de sincronización. */
  setSyncHandler(fn) {
    syncHandler = fn;
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

/** Hook reactivo: re-renderiza cuando cambia cualquier tabla. */
export function useDb(selector, deps = []) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const select = useCallback(selector, deps);
  const [value, setValue] = useState(() => select(db));
  useEffect(() => {
    setValue(select(db));
    return db.subscribe(() => setValue(select(db)));
  }, [select]);
  return value;
}
