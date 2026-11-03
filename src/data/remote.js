// Sincronización con Supabase (PostgreSQL). La aplicación trabaja con una copia en memoria que se
// carga al iniciar sesión (hydrate) y cada cambio se envía al servidor en orden (cola de escritura).
// La seguridad no depende de este código: la base aplica RLS por empresa y por permiso de rol.
import { supabase } from '../lib/supabase';
import { TABLES } from './schema';

// Tipos de columna: s texto · n número · b booleano · d fecha · t fecha-hora · j json · f llave opcional (texto o NULL)
const def = (spec) => {
  const out = {};
  Object.entries(spec).forEach(([kind, names]) => names.split(' ').filter(Boolean).forEach((c) => (out[c] = kind)));
  return out;
};
const AUD = { t: 'creado actualizado' };

export const COLUMNS = {
  empresas: def({ s: 'id codigo nombre alias nit ciudad moneda color', b: 'activo', ...AUD }),
  roles: def({ s: 'id codigo nombre descripcion', j: 'permisos', b: 'sistema', ...AUD }),
  usuarios: def({ s: 'id codigo usuario nombre email cargo rol_id', f: 'empresa_id', b: 'activo', j: 'dashboards', ...AUD }),
  terceros: def({ s: 'id empresa_id codigo razon_social tipo tipo_documento documento ciudad email telefono estado', ...AUD }),
  terceros_contactos: def({ s: 'id empresa_id tercero_id nombre cargo email telefono', ...AUD }),
  terceros_direcciones: def({ s: 'id empresa_id tercero_id tipo direccion ciudad', ...AUD }),
  terceros_cuentas: def({ s: 'id empresa_id tercero_id banco tipo_cuenta numero', ...AUD }),
  articulos: def({ s: 'id empresa_id codigo nombre categoria unidad', n: 'stock_minimo ultimo_costo', b: 'activo', ...AUD }),
  compras: def({ s: 'id empresa_id codigo proveedor_id solicitante centro_costo forma_pago moneda observaciones estado', d: 'fecha', ...AUD }),
  compras_items: def({ s: 'id empresa_id compra_id descripcion unidad', f: 'articulo_id', n: 'cantidad precio_unitario iva', ...AUD }),
  compras_entregas: def({ s: 'id empresa_id compra_id remision recibido_por observacion', d: 'fecha', ...AUD }),
  inventario: def({ s: 'id empresa_id codigo tipo bodega referencia observaciones estado', d: 'fecha', f: 'compra_id', ...AUD }),
  inventario_lineas: def({ s: 'id empresa_id movimiento_id articulo_id', n: 'cantidad costo_unitario', ...AUD }),
  firmas: def({ s: 'id empresa_id codigo titulo tipo descripcion estado', f: 'tercero_id', d: 'fecha_limite', ...AUD }),
  firmas_firmantes: def({ s: 'id empresa_id documento_id nombre cargo email estado firma firmado_por', n: 'orden', t: 'fecha_firma creado actualizado' }),
  firmas_adjuntos: def({ s: 'id empresa_id documento_id nombre tipo', n: 'tamano_kb', ...AUD }),
  actividades: def({ s: 'id empresa_id codigo titulo area responsable prioridad descripcion estado', d: 'fecha_inicio fecha_fin', ...AUD }),
  actividades_tareas: def({ s: 'id empresa_id actividad_id titulo responsable', d: 'fecha', n: 'horas_estimadas', b: 'completada', ...AUD }),
  actividades_tiempos: def({ s: 'id empresa_id actividad_id usuario nota', d: 'fecha', n: 'horas', ...AUD }),
  ops_sistemas: def({ s: 'id empresa_id codigo nombre descripcion prioridad etapa estado observaciones', f: 'desarrollador_id coordinador_id qa_id', d: 'fecha_inicio fecha_entrega', ...AUD }),
  ops_horas: def({ s: 'id empresa_id sistema_id etapa usuario descripcion', f: 'usuario_id', d: 'fecha', n: 'horas', ...AUD }),
  ops_revisiones: def({ s: 'id empresa_id sistema_id tipo enviado_por_nombre comentario estado resuelto_por motivo', f: 'enviado_por destinatario_id', t: 'fecha_envio fecha_resolucion creado actualizado' }),
  auditoria_logs: def({ s: 'id codigo usuario_id usuario usuario_login rol accion modulo tabla registro_id registro_codigo descripcion nivel', f: 'empresa_id', t: 'fecha creado' }),
  auditoria_logs_cambios: def({ s: 'id log_id campo anterior nuevo' }),
  workflow_historial: def({ s: 'id empresa_id modulo registro_id registro_codigo desde hacia accion usuario_id usuario comentario', t: 'fecha' }),
};

export const LOGS_LIMIT = 1000; // eventos de auditoría que se cargan al iniciar (los más recientes)

// ---------- conversión aplicación → base de datos ----------
export function toRow(table, row) {
  const out = {};
  Object.entries(COLUMNS[table]).forEach(([col, kind]) => {
    const v = row[col];
    if (v === undefined) return;
    switch (kind) {
      case 'd':
        out[col] = v === '' || v == null ? null : String(v).slice(0, 10);
        break;
      case 't':
      case 'f':
        out[col] = v === '' ? null : v;
        break;
      case 'n':
        out[col] = v === '' || v == null ? null : Number(v);
        break;
      case 'b':
        out[col] = !!v;
        break;
      default:
        out[col] = v;
    }
  });
  return out;
}

// ---------- conversión base de datos → aplicación ----------
export function fromRow(table, row) {
  const out = {};
  Object.entries(COLUMNS[table]).forEach(([col, kind]) => {
    const v = row[col];
    switch (kind) {
      case 'b':
        out[col] = !!v;
        break;
      case 'n':
        out[col] = v == null ? '' : Number(v);
        break;
      case 'j':
        out[col] = v ?? (col === 'permisos' ? {} : []);
        break;
      default:
        out[col] = v == null ? '' : v;
    }
  });
  return out;
}

/** Mensaje comprensible para los errores más comunes de la base de datos. */
export function friendlyError(err) {
  const code = err?.code;
  const msg = err?.message || String(err);
  if (code === '42501' || /row-level security|permission denied/i.test(msg)) return 'No tiene permiso para realizar esta operación.';
  if (code === '23505') return 'Ya existe un registro con esos datos (valor duplicado).';
  if (code === '23503') return 'El registro está relacionado con otros datos; no se puede completar la operación.';
  if (code === '23514' || code === '23502') return `Dato inválido o faltante: ${err?.details || msg}`;
  if (code === 'PGRST301' || /JWT/i.test(msg)) return 'La sesión expiró. Vuelva a iniciar sesión.';
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Sin conexión con el servidor. Los cambios no se guardaron.';
  return msg;
}

// ---------- lectura ----------
async function fetchTable(name, { logs = false, order = 'id' } = {}) {
  if (logs) {
    const { data, error } = await supabase.from(name).select('*').order('fecha', { ascending: false }).limit(LOGS_LIMIT);
    if (error) throw error;
    return data.reverse();
  }
  const rows = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await supabase.from(name).select('*').order(order).range(from, from + size - 1);
    // Módulo Operaciones aún sin instalar en la base (falta la migración 004): no debe romper el resto del ERP.
    if (error && name.startsWith('ops_') && ['42P01', 'PGRST205'].includes(error.code)) return [];
    if (error) throw error;
    rows.push(...data);
    if (data.length < size) break;
  }
  return rows;
}

/** Carga todas las tablas a las que el usuario tiene acceso (la base filtra por empresa y permisos). */
export async function fetchAll() {
  const names = TABLES.filter((t) => t !== 'auditoria_logs_cambios');
  const results = await Promise.all([
    ...names.map((t) => fetchTable(t, { logs: t === 'auditoria_logs' })),
    fetchTable('usuarios_empresas', { order: 'usuario_id' }), // llave compuesta: no tiene columna id
  ]);
  const links = results.pop();
  const state = {};
  names.forEach((t, i) => (state[t] = results[i].map((r) => fromRow(t, r))));
  state.auditoria_logs_cambios = [];
  // El perfil expone las empresas con acceso como lista (empresas_ids)
  state.usuarios = state.usuarios.map((u) => ({ ...u, empresas_ids: links.filter((l) => l.usuario_id === u.id).map((l) => l.empresa_id) }));
  return state;
}

/** El detalle (cambios campo a campo) de un evento se pide al abrirlo. */
export async function fetchCambios(logId) {
  const { data, error } = await supabase.from('auditoria_logs_cambios').select('*').eq('log_id', logId).order('id');
  if (error) throw error;
  return data.map((r) => fromRow('auditoria_logs_cambios', r));
}

// ---------- escritura ----------
async function callFunction(body) {
  const { data, error } = await supabase.functions.invoke('admin-usuarios', { body });
  if (error) {
    let detail = error.message;
    try {
      const j = await error.context?.json?.();
      if (j?.error) detail = j.error;
    } catch {
      /* sin detalle */
    }
    throw new Error(detail);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

/** Ejecuta una operación de la cola de escritura. Lanza un error si el servidor la rechaza. */
export async function applyOp(op) {
  switch (op.type) {
    case 'insert': {
      const { error } = await supabase.from(op.table).insert(toRow(op.table, op.row));
      if (error) throw error;
      return;
    }
    case 'insertMany': {
      if (!op.rows.length) return;
      const { error } = await supabase.from(op.table).insert(op.rows.map((r) => toRow(op.table, r)));
      if (error) throw error;
      return;
    }
    case 'update': {
      const patch = toRow(op.table, op.patch);
      delete patch.id;
      // select(): una actualización bloqueada por RLS no da error, solo afecta 0 filas
      const { data, error } = await supabase.from(op.table).update(patch).eq('id', op.id).select('id');
      if (error) throw error;
      if (!data?.length) throw Object.assign(new Error('Sin permiso o el registro ya no existe'), { code: '42501' });
      return;
    }
    case 'delete': {
      const { data, error } = await supabase.from(op.table).delete().eq('id', op.id).select('id');
      if (error) throw error;
      if (!data?.length) throw Object.assign(new Error('Sin permiso o el registro ya no existe'), { code: '42501' });
      return;
    }
    case 'links': {
      const del = await supabase.from('usuarios_empresas').delete().eq('usuario_id', op.usuario_id);
      if (del.error) throw del.error;
      if (op.empresas_ids.length) {
        const ins = await supabase.from('usuarios_empresas').insert(op.empresas_ids.map((empresa_id) => ({ usuario_id: op.usuario_id, empresa_id })));
        if (ins.error) throw ins.error;
      }
      return;
    }
    case 'fn':
      await callFunction(op.body);
      return;
    default:
      throw new Error(`Operación desconocida: ${op.type}`);
  }
}
