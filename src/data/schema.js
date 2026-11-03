// Definición de tablas y relaciones Maestro → Detalle.
// Cada maestro declara sus tablas detalle y la llave foránea que las relaciona.
// El mismo modelo está expresado en SQL (PostgreSQL) en /db/schema.sql.

export const SCHEMA = {
  // ---- Multiempresa ----
  empresas: { prefix: 'EMP' },

  // ---- Seguridad ----
  roles: { prefix: 'ROL' },
  usuarios: { prefix: 'USR' },

  // ---- Terceros ----
  terceros: {
    prefix: 'TER',
    details: {
      terceros_contactos: 'tercero_id',
      terceros_direcciones: 'tercero_id',
      terceros_cuentas: 'tercero_id',
    },
  },
  terceros_contactos: {},
  terceros_direcciones: {},
  terceros_cuentas: {},

  // ---- Compras ----
  compras: {
    prefix: 'OC',
    details: {
      compras_items: 'compra_id',
      compras_entregas: 'compra_id',
    },
  },
  compras_items: {},
  compras_entregas: {},

  // ---- Firmas ----
  firmas: {
    prefix: 'DOC',
    details: {
      firmas_firmantes: 'documento_id',
      firmas_adjuntos: 'documento_id',
    },
  },
  firmas_firmantes: {},
  firmas_adjuntos: {},

  // ---- Actividades ----
  actividades: {
    prefix: 'ACT',
    details: {
      actividades_tareas: 'actividad_id',
      actividades_tiempos: 'actividad_id',
    },
  },
  actividades_tareas: {},
  actividades_tiempos: {},

  // ---- Operaciones: sistemas → horas y revisiones ----
  ops_sistemas: {
    prefix: 'SIS',
    details: { ops_horas: 'sistema_id', ops_revisiones: 'sistema_id' },
  },
  ops_horas: {},
  ops_revisiones: {},

  // ---- Inventario (relacionado con Compras) ----
  articulos: { prefix: 'ART' },
  inventario: {
    prefix: 'MOV',
    details: { inventario_lineas: 'movimiento_id' },
  },
  inventario_lineas: {},

  // ---- Auditoría: registro de actividad del sistema (solo lectura) ----
  auditoria_logs: {
    prefix: 'LOG',
    details: { auditoria_logs_cambios: 'log_id' },
  },
  auditoria_logs_cambios: {},

  // ---- Workflow (bitácora transversal) ----
  workflow_historial: {},
};

export const TABLES = Object.keys(SCHEMA);

/**
 * Tablas cuyos registros pertenecen a una empresa (columna empresa_id).
 * El repositorio las filtra automáticamente por la empresa activa de la sesión.
 * Usuarios, roles y empresas son globales.
 */
export const SCOPED_TABLES = new Set([
  'terceros', 'terceros_contactos', 'terceros_direcciones', 'terceros_cuentas',
  'compras', 'compras_items', 'compras_entregas',
  'firmas', 'firmas_firmantes', 'firmas_adjuntos',
  'actividades', 'actividades_tareas', 'actividades_tiempos',
  'ops_sistemas', 'ops_horas', 'ops_revisiones',
  'articulos', 'inventario', 'inventario_lineas',
  'auditoria_logs', 'workflow_historial',
]);

/** Tablas globales: sus cambios se registran en la auditoría como eventos de todo el grupo. */
export const GLOBAL_TABLES = new Set(['usuarios', 'roles', 'empresas']);
